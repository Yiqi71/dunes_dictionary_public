import { state } from "./state.js";
import { draw, updateWordNodeTransforms, getMobileFocusedNodeAnchor } from "./uni-canvas.js";
import { updateRelations } from "./relationManager.js";
import { updateScaleForNodes } from "./zoom.js";
import { moveIndicator } from "./menu.js";
import { updateWordFocus, restoreNodeToContainer } from "./wordFocus.js";

let isActive = false;
let restTimer = null;
let flyRaf = null;
let flyAnimToken = null;
let panelReadToken = null;
let panelReadChannel = null;
let panelReadId = 0;
let panelReadResolve = null;
let panelReadCompletedPanels = new Set();

const FLY_DURATION = 3800;
const INITIAL_DELAY = 1500;
const NEARBY_POOL = 8;
const PANEL_SCROLL_PX_PER_SECOND = 32;
const PANEL_READ_MIN_DURATION = 2500;
const PANEL_READ_START_DELAY = 350;
const PANEL_SYNC_CHANNEL = "dunes-focus";
const PANEL_READ_SYNC_KEY = "dd_panel_flythrough_read";
const PANEL_READ_TARGETS = ["entry", "echoes"];

function isMobileLayout() {
    return window.matchMedia("(max-width: 768px)").matches;
}

function computeTargetPan(node, scale) {
    const lx = parseFloat(node.dataset.x);
    const ly = parseFloat(node.dataset.y);
    if (Number.isNaN(lx) || Number.isNaN(ly)) return null;
    const wx = lx * state.baseWidth * 24;
    const wy = ly * state.baseHeight;
    if (isMobileLayout()) {
        const anchor = getMobileFocusedNodeAnchor();
        return { panX: anchor.x - wx * scale, panY: anchor.y - wy * scale };
    }
    return {
        panX: window.innerWidth / 2 - (wx * scale + 318 / 2),
        panY: window.innerHeight / 2 - (wy * scale + 210 / 2)
    };
}

function pickNearbyId(currentId) {
    const all = Array.from(document.querySelectorAll(".word-node"));
    const cur = document.getElementById(String(currentId));
    if (!cur || all.length < 2) return null;
    const cx = parseFloat(cur.dataset.x);
    const cy = parseFloat(cur.dataset.y);
    const pool = all
        .filter(n => n.id !== String(currentId))
        .map(n => {
            const dx = parseFloat(n.dataset.x) - cx;
            const dy = parseFloat(n.dataset.y) - cy;
            return { id: n.id, dist: Math.sqrt(dx * dx + dy * dy) };
        })
        .sort((a, b) => a.dist - b.dist)
        .slice(0, NEARBY_POOL);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
}

function fadeOutDetails() {
    const d = document.getElementById("word-details");
    if (!d || d.classList.contains("hidden")) return;
    d.classList.add("details-transition-out");
    setTimeout(() => d.classList.add("hidden"), 500);
}

function hideIndexFloatingPanel() {
    const panel = document.getElementById("floating-panel");
    if (panel) {
        panel.classList.add("hidden");
        panel.classList.remove("expanded");
    }
    document.getElementById("expand-btn")?.remove();
    document.getElementById("overlay")?.classList.add("hidden");

    const view = document.getElementById("universe-view");
    if (view) view.style.left = "0";

    const relationLines = document.getElementById("connection-lines");
    if (relationLines) relationLines.style.left = "0";

    updateRelations();
}

function restoreDetails() {
    const d = document.getElementById("word-details");
    if (!d) return;
    d.classList.remove("details-transition-out");
    d.classList.remove("hidden");
}

function cancelFly() {
    if (flyRaf !== null) { cancelAnimationFrame(flyRaf); flyRaf = null; }
    flyAnimToken = null;
}

function getPanelReadChannel() {
    if (!panelReadChannel) {
        try {
            panelReadChannel = new BroadcastChannel(PANEL_SYNC_CHANNEL);
            panelReadChannel.onmessage = handlePanelReadMessage;
        } catch (_) {
            panelReadChannel = null;
        }
    }
    return panelReadChannel;
}

function broadcastPanelReadMessage(payload) {
    try {
        localStorage.setItem(PANEL_READ_SYNC_KEY, JSON.stringify(payload));
    } catch (_) {}
    getPanelReadChannel()?.postMessage(payload);
}

function handlePanelReadMessage(event) {
    const data = event.data || {};
    if (data.type !== "flythrough-read-complete") return;
    if (!panelReadToken || data.readId !== panelReadToken.readId) return;
    if (!PANEL_READ_TARGETS.includes(data.panel)) return;

    panelReadCompletedPanels.add(data.panel);
    const complete = PANEL_READ_TARGETS.every(panel => panelReadCompletedPanels.has(panel));
    if (!complete) return;

    const resolve = panelReadResolve;
    panelReadToken = null;
    panelReadResolve = null;
    panelReadCompletedPanels = new Set();
    resolve?.();
}

function cancelPanelRead() {
    const readId = panelReadToken?.readId ?? panelReadId;
    panelReadToken = null;
    panelReadResolve = null;
    panelReadCompletedPanels = new Set();
    broadcastPanelReadMessage({
        type: "flythrough-read-stop",
        readId
    });
}

function startPanelRead() {
    cancelPanelRead();

    const readId = ++panelReadId;
    const token = { readId };
    panelReadToken = token;
    panelReadCompletedPanels = new Set();

    return new Promise(resolve => {
        panelReadResolve = resolve;
        window.setTimeout(() => {
            if (!isActive || panelReadToken !== token) return;
            broadcastPanelReadMessage({
                type: "flythrough-read-start",
                readId,
                wordId: String(state.focusedNodeId),
                speedPxPerSecond: PANEL_SCROLL_PX_PER_SECOND,
                minDuration: PANEL_READ_MIN_DURATION
            });
        }, PANEL_READ_START_DELAY);
    });
}

function slowPanTo(targetId, onDone) {
    const node = document.getElementById(String(targetId));
    if (!node) { onDone?.(); return; }
    const scale = state.scaleThreshold;
    const tgt = computeTargetPan(node, scale);
    if (!tgt) { onDone?.(); return; }

    cancelFly();

    // Release old focused node from pinned layer so it follows world coords.
    const oldFocused = state.focusedNodeId ? document.getElementById(String(state.focusedNodeId)) : null;
    if (oldFocused && isMobileLayout()) {
        restoreNodeToContainer(oldFocused);
    }
    const oldStartOpacity = oldFocused ? (Number(window.getComputedStyle(oldFocused).opacity) || 1) : 1;
    const newStartOpacity = Number(window.getComputedStyle(node).opacity) || 1;

    const s0 = state.currentScale;
    const px0 = state.panX;
    const py0 = state.panY;
    const ds = scale - s0;
    const dpx = tgt.panX - px0;
    const dpy = tgt.panY - py0;

    // ease-in-out quad
    const ease = t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

    const token = {};
    flyAnimToken = token;
    const t0 = performance.now();

    const step = now => {
        if (flyAnimToken !== token) return;
        const p = Math.min(1, (now - t0) / FLY_DURATION);
        const e = ease(p);
        state.currentScale = s0 + ds * e;
        state.panX = px0 + dpx * e;
        state.panY = py0 + dpy * e;
        draw();
        updateWordNodeTransforms();
        updateRelations();
        updateScaleForNodes(state.currentScale);
        moveIndicator(state.currentScale);

        // Opacity: linear (matching zoomToWord), position: eased.
        if (oldFocused) oldFocused.style.opacity = String(oldStartOpacity + (0.2 - oldStartOpacity) * p);
        node.style.opacity = String(newStartOpacity + (1 - newStartOpacity) * p);

        if (p < 1) {
            flyRaf = requestAnimationFrame(step);
        } else {
            if (oldFocused) oldFocused.style.opacity = "0.2";
            node.style.opacity = "1";
            flyRaf = null;
            flyAnimToken = null;
            onDone?.();
        }
    };
    flyRaf = requestAnimationFrame(step);
}

function tick() {
    if (!isActive) return;
    const nextId = pickNearbyId(state.focusedNodeId);
    if (!nextId) {
        restTimer = setTimeout(tick, PANEL_READ_MIN_DURATION);
        return;
    }
    cancelPanelRead();
    fadeOutDetails();
    slowPanTo(nextId, () => {
        if (!isActive) return;
        updateWordFocus(nextId);
        startPanelRead().then(() => {
            if (!isActive) return;
            tick();
        });
    });
}

function setButtonActive(active) {
    document.getElementById("flythrough-button")?.classList.toggle("active", active);
}

export function startFlythrough() {
    if (isActive) return;
    isActive = true;
    document.body.classList.add("flythrough-active");
    hideIndexFloatingPanel();
    setButtonActive(true);
    restTimer = setTimeout(tick, INITIAL_DELAY);
}

export function stopFlythrough() {
    if (!isActive) return;
    isActive = false;
    document.body.classList.remove("flythrough-active");
    setButtonActive(false);
    cancelFly();
    cancelPanelRead();
    if (restTimer) { clearTimeout(restTimer); restTimer = null; }
    restoreDetails();
}

export function toggleFlythrough() {
    isActive ? stopFlythrough() : startFlythrough();
}

document.getElementById("flythrough-button")?.addEventListener("click", toggleFlythrough);
