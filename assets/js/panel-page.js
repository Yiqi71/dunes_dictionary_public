// panel-page.js
// Self-contained rendering + sync for entry-panel.html and echoes-panel.html.
// No canvas dependencies. Syncs with main site via BroadcastChannel + localStorage.

import { getDisplayOriText } from "./oriDisplay.js";
import { getOrCreateDeviceId } from "./device-id.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANNEL_NAME = "dunes-focus";
const SYNC_KEY = "dd_panel_sync";
const FLYTHROUGH_READ_SYNC_KEY = "dd_panel_flythrough_read";
const DEFAULT_FLYTHROUGH_SCROLL_PX_PER_SECOND = 32;
const DEFAULT_FLYTHROUGH_MIN_DURATION = 2500;

const API_BASE = (() => {
    const injected = (typeof window !== "undefined" && window.DD_API_BASE)
        ? String(window.DD_API_BASE).trim() : "";
    if (injected) return injected.replace(/\/+$/, "");
    const host = typeof location !== "undefined" ? location.hostname : "";
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3000";
    return "https://api.dunes-dictionary.com";
})();

function buildApiUrl(path) { return `${API_BASE}${path}`; }

const ENTRY_VOTE_COUNTS_KEY        = "dd_entry_understanding_vote_counts_v1";
const ENTRY_USER_VOTES_KEY         = "dd_entry_understanding_user_votes_v1";
const ENTRY_VOTE_SYNC_QUEUE_KEY    = "dd_entry_understanding_vote_sync_queue_v1";
const ENTRY_VOTE_SYNC_INTERVAL_MS  = 15000;
const ENTRY_VOTE_STATS_CACHE_TTL_MS = 30000;
const COMMENT_LIKE_SYNC_QUEUE_KEY  = "dd_comment_like_sync_queue_v1";
const COMMENT_LIKE_SNAPSHOT_SESSION_KEY = "dd_comment_like_snapshot_sent_v1";
const COMMENT_LIKES_KEY            = "dd_comment_likes_v1";
const COMMENT_LIKE_EVENT_NAME      = "comment_like_toggle";
const COMMENT_LIKE_COUNTS_CACHE_TTL_MS = 30000;

// ---------------------------------------------------------------------------
// Panel-local state
// ---------------------------------------------------------------------------

const panelState = {
    focusedNodeId: null,
    currentLang: "zh",
    allWords: []
};

// ---------------------------------------------------------------------------
// Utility helpers (mirror of detail.js counterparts)
// ---------------------------------------------------------------------------

function normalizeLang(code) {
    const v = (code || "").toLowerCase();
    return v.startsWith("en") ? "en" : "zh";
}

function syncDocumentLang() {
    document.documentElement.lang = normalizeLang(panelState.currentLang);
}

function applyHashItalics(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(/#([^#]+)#/g, "<i>$1</i>");
}

function ensureTerminalPunctuation(text, lang) {
    if (text === null || text === undefined) return "";
    const raw = String(text);
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const lastChar = trimmed[trimmed.length - 1];
    const needs = lang === "zh"
        ? !/[。！？；…]/.test(lastChar)
        : !/[.!?;:]/.test(lastChar);
    if (!needs) return raw;
    return raw + (lang === "zh" ? "。" : ".");
}

function resolveImagePath(src) {
    if (!src) return "";
    if (src.startsWith("http") || src.startsWith("data:") || src.startsWith("/")) return src;
    if (src.startsWith("images/")) return `/content/${src}`;
    return src;
}

function hasTextContent(value) {
    return String(value || "").trim().length > 0;
}

function normalizePlaceholderText(value) {
    return String(value || "").trim().toLowerCase()
        .replace(/[。.!?]/g, "").replace(/\s+/g, "");
}

function isCommentPlaceholder(value) {
    const n = normalizePlaceholderText(value);
    if (!n) return true;
    return [
        "暂无导读", "暂无作者", "暂无作者信息", "暂无回声",
        "noguideyet", "nocommentaryyet", "noauthoryet",
        "noauthorinformationyet", "noechoesyet"
    ].includes(n);
}

function getCaptionText(caption, lang) {
    if (caption === null || caption === undefined) return "";
    if (typeof caption === "string") return caption;
    if (typeof caption === "object") return caption?.[lang] || caption?.zh || caption?.en || "";
    return "";
}

function setupLazyImages(root) {
    if (!root) return;
    root.querySelectorAll("img").forEach((img) => {
        img.loading = "lazy";
        img.decoding = "async";
        img.classList.add("lazy-img");
        img.style.visibility = "hidden";
        if (img.complete && img.naturalWidth > 0) {
            img.classList.remove("lazy-img");
            img.style.visibility = "visible";
            return;
        }
        img.addEventListener("load", () => {
            img.classList.remove("lazy-img");
            img.style.visibility = "visible";
        }, { once: true });
        img.addEventListener("error", () => {
            img.classList.add("lazy-img-error");
            img.style.visibility = "hidden";
        }, { once: true });
    });
}

function buildDiagramCarousel(items, lang, options = {}) {
    if (!Array.isArray(items) || items.length === 0) return null;
    let currentIndex = 0;
    const arrowLeftSrc  = options.arrowLeftSrc  || "assets/images/left_arrow.svg";
    const arrowRightSrc = options.arrowRightSrc || "assets/images/right_arrow.svg";

    const carousel = document.createElement("div");
    carousel.className = "diagram-carousel";

    const stage = document.createElement("div");
    stage.className = "diagram-stage";

    const leftBtn = document.createElement("button");
    leftBtn.className = "diagram-arrow diagram-arrow-left";
    leftBtn.type = "button";
    leftBtn.setAttribute("aria-label", "Previous image");
    leftBtn.innerHTML = `<img src="${arrowLeftSrc}" alt="">`;

    const rightBtn = document.createElement("button");
    rightBtn.className = "diagram-arrow diagram-arrow-right";
    rightBtn.type = "button";
    rightBtn.setAttribute("aria-label", "Next image");
    rightBtn.innerHTML = `<img src="${arrowRightSrc}" alt="">`;

    const img = document.createElement("img");
    img.className = "diagram-image";
    img.alt = "diagram image";
    img.loading = "lazy";
    img.decoding = "async";

    const caption = document.createElement("p");
    caption.className = "diagram-caption";

    const source = document.createElement("p");
    source.className = "diagram-source";

    function renderAt(index) {
        const safeIndex = Math.max(0, Math.min(index, items.length - 1));
        currentIndex = safeIndex;
        const item = items[safeIndex] || {};
        img.src = resolveImagePath(item.src);
        caption.innerHTML = applyHashItalics(getCaptionText(item.caption, lang));
        if (options.includeSource) {
            source.innerHTML = applyHashItalics(getCaptionText(item.source, lang));
        } else {
            source.innerHTML = "";
        }
        leftBtn.classList.toggle("is-hidden", safeIndex === 0);
        rightBtn.classList.toggle("is-hidden", safeIndex === items.length - 1);
    }

    leftBtn.addEventListener("click",  (e) => { e.stopPropagation(); if (currentIndex > 0) renderAt(currentIndex - 1); });
    rightBtn.addEventListener("click", (e) => { e.stopPropagation(); if (currentIndex < items.length - 1) renderAt(currentIndex + 1); });

    stage.appendChild(leftBtn);
    stage.appendChild(img);
    stage.appendChild(rightBtn);
    carousel.appendChild(stage);
    carousel.appendChild(caption);
    if (options.includeSource) carousel.appendChild(source);

    renderAt(0);
    return carousel;
}

const sectionTitles = {
    brief:        { zh: "简要释义", en: "Definition" },
    example:      { zh: "例句",    en: "e.g." },
    proposers:    { zh: "提出者",  en: "Proponent" },
    source:       { zh: "出处",    en: "Source" },
    relatedWorks: { zh: "相关著作", en: "Related Works" },
    contributors: { zh: "贡献者",  en: "Contributors" },
    editors:      { zh: "编辑",    en: "Edit" }
};

// ---------------------------------------------------------------------------
// LocalStorage helpers
// ---------------------------------------------------------------------------

function safeParseStorage(key, fallback = {}) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
}

function safeWriteStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Comment like functions
// ---------------------------------------------------------------------------

const commentLikeCountsCache = new Map();
const commentLikeSessionRefreshedWordIds = new Set();
let commentLikeSyncInFlight = false;
let commentLikeSnapshotQueued = false;

function getCommentLikeStorage() {
    const p = safeParseStorage(COMMENT_LIKES_KEY, {});
    return p && typeof p === "object" ? p : {};
}
function setCommentLikeStorage(value) {
    safeWriteStorage(COMMENT_LIKES_KEY, value && typeof value === "object" ? value : {});
}
function getCommentLikeKey(wordId, commentIndex) {
    return `${String(wordId)}:${Number(commentIndex)}`;
}
function isCommentLiked(wordId, commentIndex) {
    return Boolean(getCommentLikeStorage()[getCommentLikeKey(wordId, commentIndex)]);
}
function toggleCommentLiked(wordId, commentIndex) {
    const likes = getCommentLikeStorage();
    const key = getCommentLikeKey(wordId, commentIndex);
    const next = !Boolean(likes[key]);
    if (next) { likes[key] = true; } else { delete likes[key]; }
    setCommentLikeStorage(likes);
    return next;
}

function getPendingCommentLikeState(wordId, commentIndex) {
    const targetWordId = String(wordId);
    const targetIdx = Number(commentIndex);
    if (!Number.isFinite(targetIdx)) return null;
    const queue = getCommentLikeSyncQueue();
    for (let i = queue.length - 1; i >= 0; i--) {
        const ev = queue[i];
        if (!ev || ev.name !== COMMENT_LIKE_EVENT_NAME) continue;
        const d = ev.data || {};
        if (String(d.wordId) !== targetWordId) continue;
        if (Number(d.commentIndex) !== targetIdx) continue;
        return Boolean(d.liked);
    }
    return null;
}

async function fetchCommentLikeCounts(wordId, { force = false } = {}) {
    const cacheKey = String(wordId);
    const now = Date.now();
    const cached = commentLikeCountsCache.get(cacheKey);
    if (!force && cached && now - cached.ts < COMMENT_LIKE_COUNTS_CACHE_TTL_MS) {
        return cached.counts;
    }
    const response = await fetch(
        buildApiUrl(`/api/votes/comment-likes?wordId=${encodeURIComponent(cacheKey)}`),
        { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`fetch_comment_likes_${response.status}`);
    const payload = await response.json();
    const rawCounts = payload?.countsByCommentIndex;
    const counts = rawCounts && typeof rawCounts === "object" ? rawCounts : {};
    commentLikeCountsCache.set(cacheKey, { ts: now, counts });
    return counts;
}

function setCommentLikeBadge(buttonEl, count, shouldShow) {
    const countEl = buttonEl?.querySelector(".note-like-count");
    if (!countEl) return;
    if (!shouldShow) { countEl.textContent = ""; countEl.style.display = "none"; return; }
    countEl.textContent = String(Math.max(0, Number(count) || 0));
    countEl.style.display = "block";
}

async function refreshCommentLikeBadges(contentScroll, wordId, { force = false } = {}) {
    if (!contentScroll) return;
    const buttons = Array.from(contentScroll.querySelectorAll(".note-like-toggle"));
    if (!buttons.length) return;
    const anyLiked = buttons.some((btn) => btn.classList.contains("is-liked"));
    if (!anyLiked) { buttons.forEach((btn) => setCommentLikeBadge(btn, 0, false)); return; }
    const wordKey = String(wordId);
    const shouldForceSession = !commentLikeSessionRefreshedWordIds.has(wordKey);
    try {
        const counts = await fetchCommentLikeCounts(wordId, { force: force || shouldForceSession });
        commentLikeSessionRefreshedWordIds.add(wordKey);
        buttons.forEach((btn) => {
            const idx = String(Number(btn.dataset.commentIndex));
            const commentIndex = Number(btn.dataset.commentIndex);
            const liked = btn.classList.contains("is-liked");
            const rawCount = Math.max(0, Number(counts[idx]) || 0);
            const pendingState = getPendingCommentLikeState(wordId, commentIndex);
            let displayCount = rawCount;
            if (pendingState === true)  displayCount = rawCount + 1;
            if (pendingState === false) displayCount = Math.max(0, rawCount - 1);
            setCommentLikeBadge(btn, displayCount, liked);
        });
    } catch (_) {
        buttons.forEach((btn) => setCommentLikeBadge(btn, 0, false));
    }
}

// ---------------------------------------------------------------------------
// Vote sync helpers
// ---------------------------------------------------------------------------

let voteSyncState = navigator.onLine ? "checking" : "disconnected";
let voteSyncInFlight = false;
let voteSyncInitialized = false;
const entryVoteStatsCache = new Map();
const voteStatsSessionRefreshedWordIds = new Set();

function getVoteSessionId() {
    const key = "dd_session_id";
    let id = sessionStorage.getItem(key);
    if (!id) {
        id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem(key, id);
    }
    return id;
}
function getVoteDeviceId() { return getOrCreateDeviceId(); }
function isVoteSyncConnected() { return voteSyncState === "connected"; }

function refreshVisibleVoteNote() {
    const noteEl = document.querySelector(".panel-entry #section-understanding-vote .entry-vote-note");
    if (!noteEl) return;
    noteEl.style.display = isVoteSyncConnected() ? "none" : "block";
}

function setVoteSyncState(next) {
    if (voteSyncState === next) return;
    const prev = voteSyncState;
    voteSyncState = next;
    refreshVisibleVoteNote();
    if (next === "connected" && prev !== "connected") {
        queueCommentLikeSnapshotFromLocal({ force: true });
        syncCommentLikeQueue();
    }
    const commentPanel = document.querySelector(".panel-comment");
    const contentScroll = commentPanel?.querySelector(".panel-bottom");
    if (contentScroll && panelState.focusedNodeId !== null) {
        refreshCommentLikeBadges(contentScroll, panelState.focusedNodeId, { force: next === "connected" });
    }
}

function getVoteSyncQueue() {
    const p = safeParseStorage(ENTRY_VOTE_SYNC_QUEUE_KEY, []);
    return Array.isArray(p) ? p : [];
}
function setVoteSyncQueue(queue) {
    safeWriteStorage(ENTRY_VOTE_SYNC_QUEUE_KEY, Array.isArray(queue) ? queue : []);
}
function getCommentLikeSyncQueue() {
    const p = safeParseStorage(COMMENT_LIKE_SYNC_QUEUE_KEY, []);
    return Array.isArray(p) ? p : [];
}
function setCommentLikeSyncQueue(queue) {
    safeWriteStorage(COMMENT_LIKE_SYNC_QUEUE_KEY, Array.isArray(queue) ? queue : []);
}

function normalizeVoteChoice(choice) {
    const v = String(choice || "").toLowerCase();
    return v === "clear" || v === "unclear" ? v : null;
}
function toVoteStats(clear, unclear) {
    const safeClear   = Math.max(0, Number(clear) || 0);
    const safeUnclear = Math.max(0, Number(unclear) || 0);
    const total = safeClear + safeUnclear;
    const clearPct   = total > 0 ? Math.round((safeClear / total) * 100) : 0;
    const unclearPct = total > 0 ? 100 - clearPct : 0;
    return { clear: safeClear, unclear: safeUnclear, total, clearPct, unclearPct };
}
function normalizeVoteStats(stats) {
    if (!stats || typeof stats !== "object") return toVoteStats(0, 0);
    return toVoteStats(stats.clear, stats.unclear);
}
function applyVoteChoiceToStats(stats, choice) {
    const next = normalizeVoteStats(stats);
    const c = normalizeVoteChoice(choice);
    if (!c) return next;
    return toVoteStats(next.clear + (c === "clear" ? 1 : 0), next.unclear + (c === "unclear" ? 1 : 0));
}
function getPendingVoteChoice(wordId) {
    const targetWordId = String(wordId);
    const queue = getVoteSyncQueue();
    for (let i = queue.length - 1; i >= 0; i--) {
        const ev = queue[i];
        if (!ev || ev.name !== "entry_understanding_vote") continue;
        const d = ev.data || {};
        if (String(d.wordId) !== targetWordId) continue;
        const choice = normalizeVoteChoice(d.choice);
        if (choice) return choice;
    }
    return null;
}
function getWordVoteStats(wordId) {
    const counts = safeParseStorage(ENTRY_VOTE_COUNTS_KEY, {});
    const id = String(wordId);
    const current = counts[id] || { clear: 0, unclear: 0 };
    return toVoteStats(current.clear, current.unclear);
}
function getUserVote(wordId) {
    const votes = safeParseStorage(ENTRY_USER_VOTES_KEY, {});
    const choice = votes[String(wordId)];
    return choice === "clear" || choice === "unclear" ? choice : null;
}
function submitWordVote(wordId, choice) {
    if (choice !== "clear" && choice !== "unclear") return null;
    const id = String(wordId);
    const counts = safeParseStorage(ENTRY_VOTE_COUNTS_KEY, {});
    const current = counts[id] || { clear: 0, unclear: 0 };
    current.clear   = Math.max(0, Number(current.clear)   || 0);
    current.unclear = Math.max(0, Number(current.unclear) || 0);
    current[choice] += 1;
    counts[id] = current;
    safeWriteStorage(ENTRY_VOTE_COUNTS_KEY, counts);
    const userVotes = safeParseStorage(ENTRY_USER_VOTES_KEY, {});
    userVotes[id] = choice;
    safeWriteStorage(ENTRY_USER_VOTES_KEY, userVotes);
    return getWordVoteStats(id);
}

function buildVoteSyncEvent(wordId, choice) {
    return {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: "entry_understanding_vote",
        ts: Date.now(),
        sessionId: getVoteSessionId(),
        data: { wordId, choice, deviceId: getVoteDeviceId(), lang: normalizeLang(panelState.currentLang) }
    };
}
function buildCommentLikeSyncEvent(wordId, commentIndex, liked, langOverride) {
    return {
        id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: COMMENT_LIKE_EVENT_NAME,
        ts: Date.now(),
        sessionId: getVoteSessionId(),
        data: {
            wordId, commentIndex, liked: Boolean(liked),
            deviceId: getVoteDeviceId(),
            lang: normalizeLang(langOverride || panelState.currentLang)
        }
    };
}
function enqueueVoteSync(wordId, choice) {
    const queue = getVoteSyncQueue();
    queue.push(buildVoteSyncEvent(wordId, choice));
    setVoteSyncQueue(queue);
}
function enqueueCommentLikeSync(wordId, commentIndex, liked, langOverride) {
    const queue = getCommentLikeSyncQueue();
    queue.push(buildCommentLikeSyncEvent(wordId, commentIndex, liked, langOverride));
    setCommentLikeSyncQueue(queue);
}

function queueCommentLikeSnapshotFromLocal({ force = false } = {}) {
    if (!force && commentLikeSnapshotQueued) return;
    if (!force && sessionStorage.getItem(COMMENT_LIKE_SNAPSHOT_SESSION_KEY) === "1") return;
    commentLikeSnapshotQueued = true;
    const likes = getCommentLikeStorage();
    const entries = Object.entries(likes);
    if (!entries.length) { sessionStorage.setItem(COMMENT_LIKE_SNAPSHOT_SESSION_KEY, "1"); return; }
    entries.forEach(([key, liked]) => {
        if (!liked) return;
        const parts = String(key).split(":");
        if (parts.length !== 2) return;
        const wordId = parts[0];
        const commentIndex = Number(parts[1]);
        if (!wordId || !Number.isFinite(commentIndex)) return;
        enqueueCommentLikeSync(wordId, commentIndex, true, panelState.currentLang);
    });
    if (!force) sessionStorage.setItem(COMMENT_LIKE_SNAPSHOT_SESSION_KEY, "1");
}

async function probeVoteSyncConnection() {
    if (!navigator.onLine) { setVoteSyncState("disconnected"); return false; }
    try {
        const response = await fetch(buildApiUrl("/events"), { method: "HEAD", cache: "no-store" });
        if (response.ok) { setVoteSyncState("connected"); return true; }
        setVoteSyncState("disconnected");
        return false;
    } catch (_) { setVoteSyncState("disconnected"); return false; }
}

async function syncVoteQueue() {
    if (voteSyncInFlight) return;
    if (!navigator.onLine) { setVoteSyncState("disconnected"); return; }
    let queue = getVoteSyncQueue();
    if (queue.length === 0) { await probeVoteSyncConnection(); await syncCommentLikeQueue(); return; }
    voteSyncInFlight = true;
    try {
        while (queue.length > 0) {
            const ev = queue[0];
            try {
                const response = await fetch(buildApiUrl("/events"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(ev),
                    keepalive: true
                });
                if (response.ok) { setVoteSyncState("connected"); queue.shift(); setVoteSyncQueue(queue); continue; }
                setVoteSyncState("disconnected");
                break;
            } catch (_) { setVoteSyncState("disconnected"); break; }
        }
    } finally { voteSyncInFlight = false; }
    await syncCommentLikeQueue();
}

async function syncCommentLikeQueue() {
    if (commentLikeSyncInFlight) return;
    if (!navigator.onLine) return;
    let queue = getCommentLikeSyncQueue();
    if (queue.length === 0) return;
    commentLikeSyncInFlight = true;
    try {
        while (queue.length > 0) {
            const ev = queue[0];
            try {
                const response = await fetch(buildApiUrl("/events"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(ev),
                    keepalive: true
                });
                if (!response.ok) break;
                queue.shift();
                setCommentLikeSyncQueue(queue);
            } catch (_) { break; }
        }
    } finally { commentLikeSyncInFlight = false; }
}

async function fetchServerWordVoteStats(wordId, { force = false } = {}) {
    const cacheKey = String(wordId);
    const now = Date.now();
    const cached = entryVoteStatsCache.get(cacheKey);
    if (!force && cached && now - cached.ts < ENTRY_VOTE_STATS_CACHE_TTL_MS) return cached.stats;
    const response = await fetch(
        buildApiUrl(`/api/votes/understanding?wordId=${encodeURIComponent(cacheKey)}`),
        { cache: "no-store" }
    );
    if (!response.ok) throw new Error(`fetch_vote_stats_${response.status}`);
    const payload = await response.json();
    const stats = normalizeVoteStats(payload?.stats);
    entryVoteStatsCache.set(cacheKey, { ts: now, stats });
    return stats;
}

function initVoteSync() {
    if (voteSyncInitialized) return;
    voteSyncInitialized = true;
    queueCommentLikeSnapshotFromLocal();
    window.addEventListener("online",  () => { setVoteSyncState("checking"); syncVoteQueue(); });
    window.addEventListener("offline", () => { setVoteSyncState("disconnected"); });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") syncVoteQueue();
    });
    setTimeout(() => syncVoteQueue(), 800);
    setInterval(syncVoteQueue, ENTRY_VOTE_SYNC_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Vote section renderer
// ---------------------------------------------------------------------------

function renderUnderstandingVoteSection(sectionEl, currentWord, lang) {
    if (!sectionEl || !currentWord) return;
    const term = currentWord.term?.[lang] || currentWord.term?.zh || currentWord.term?.en || "";
    const labels = lang === "en"
        ? { question: `Do you think "${term}" is easy to understand?`, clear: "Understood", unclear: "Not clear", submit: "Vote", syncNote: "Note: server connection is unavailable. Your vote will sync after recovery." }
        : { question: `你觉得"${term}"这个词条好理解吗？`, clear: "看明白了", unclear: "没看明白", submit: "投票", syncNote: "注：当前与服务器连接异常，投票会暂存并在恢复后同步。" };

    sectionEl.innerHTML = `
        <div class="entry-vote-wrap">
            <p class="entry-vote-question">${labels.question}</p>
            <div class="entry-vote-options">
                <button type="button" class="entry-vote-option" data-vote="clear"><span class="entry-vote-text">${labels.clear}</span></button>
                <button type="button" class="entry-vote-option" data-vote="unclear"><span class="entry-vote-text">${labels.unclear}</span></button>
            </div>
            <button type="button" class="entry-vote-submit">${labels.submit}</button>
            <p class="entry-vote-note">${labels.syncNote}</p>
        </div>`;

    const clearBtn   = sectionEl.querySelector('[data-vote="clear"]');
    const unclearBtn = sectionEl.querySelector('[data-vote="unclear"]');
    const clearText   = clearBtn?.querySelector(".entry-vote-text");
    const unclearText = unclearBtn?.querySelector(".entry-vote-text");
    const submitBtn = sectionEl.querySelector(".entry-vote-submit");
    const noteEl    = sectionEl.querySelector(".entry-vote-note");
    if (!clearBtn || !unclearBtn || !clearText || !unclearText || !submitBtn || !noteEl) return;

    const setVoteButtonBaseStyle = (btn) => {
        btn.style.position = "relative";
        btn.style.overflow = "hidden";
    };
    const ensureVoteBar = (btn) => {
        let bar = btn.querySelector(".entry-vote-bar");
        if (!bar) {
            bar = document.createElement("span");
            bar.className = "entry-vote-bar";
            bar.setAttribute("aria-hidden", "true");
            btn.insertBefore(bar, btn.firstChild);
        }
        bar.style.cssText = "position:absolute;left:0;top:0;height:100%;width:0%;background:rgba(249,214,122,0.30);pointer-events:none;display:none;z-index:0;";
        return bar;
    };

    setVoteButtonBaseStyle(clearBtn);
    setVoteButtonBaseStyle(unclearBtn);
    const clearBar   = ensureVoteBar(clearBtn);
    const unclearBar = ensureVoteBar(unclearBtn);
    clearText.style.cssText   = "position:relative;z-index:1;";
    unclearText.style.cssText = "position:relative;z-index:1;";
    noteEl.style.display = isVoteSyncConnected() ? "none" : "block";

    const existingVote = getUserVote(currentWord.id);
    let selectedChoice = existingVote || null;
    let hasVoted = Boolean(existingVote);
    let displayedStats = hasVoted ? getWordVoteStats(currentWord.id) : toVoteStats(0, 0);

    const renderChosenIcon = () => {
        clearBtn.querySelectorAll(".entry-vote-chosen-icon").forEach((el) => el.remove());
        unclearBtn.querySelectorAll(".entry-vote-chosen-icon").forEach((el) => el.remove());
        if (!hasVoted || (selectedChoice !== "clear" && selectedChoice !== "unclear")) return;
        const targetBtn = selectedChoice === "clear" ? clearBtn : unclearBtn;
        const icon = document.createElement("img");
        icon.className = "entry-vote-chosen-icon";
        icon.src = "assets/images/chosen.svg";
        icon.alt = "";
        icon.setAttribute("aria-hidden", "true");
        icon.style.cssText = "position:absolute;left:10px;top:50%;transform:translateY(-2px);width:7px;height:6px;pointer-events:none;display:block;z-index:2;";
        targetBtn.appendChild(icon);
    };

    const setSelected = () => {
        clearBtn.classList.toggle("is-selected",   selectedChoice === "clear");
        unclearBtn.classList.toggle("is-selected", selectedChoice === "unclear");
        clearBtn.style.borderColor   = selectedChoice === "clear"   ? "#F9D67A" : "";
        unclearBtn.style.borderColor = selectedChoice === "unclear" ? "#F9D67A" : "";
        renderChosenIcon();
    };

    const renderVoteState = (stats, voted) => {
        const ns = normalizeVoteStats(stats);
        displayedStats = ns;
        clearText.textContent   = voted ? `${labels.clear} ${ns.clearPct}%`   : labels.clear;
        unclearText.textContent = voted ? `${labels.unclear} ${ns.unclearPct}%` : labels.unclear;
        clearBar.style.display   = voted ? "block" : "none";
        unclearBar.style.display = voted ? "block" : "none";
        clearBar.style.width     = voted ? `${ns.clearPct}%`   : "0%";
        unclearBar.style.width   = voted ? `${ns.unclearPct}%` : "0%";
        clearBtn.classList.toggle("is-voted",   voted);
        unclearBtn.classList.toggle("is-voted", voted);
        setSelected();
        submitBtn.style.display = voted ? "none" : "";
    };

    renderVoteState(displayedStats, hasVoted);

    (async () => {
        try {
            const wordKey = String(currentWord.id);
            const shouldForce = !voteStatsSessionRefreshedWordIds.has(wordKey);
            let serverStats = await fetchServerWordVoteStats(currentWord.id, { force: shouldForce });
            voteStatsSessionRefreshedWordIds.add(wordKey);
            const pendingChoice = getPendingVoteChoice(currentWord.id);
            if (pendingChoice) serverStats = applyVoteChoiceToStats(serverStats, pendingChoice);
            renderVoteState(serverStats, hasVoted);
        } catch (_) {
            renderVoteState(hasVoted ? getWordVoteStats(currentWord.id) : displayedStats, hasVoted);
        }
    })();

    if (hasVoted) return;

    clearBtn.addEventListener("click",  (e) => { e.stopPropagation(); selectedChoice = "clear";   setSelected(); });
    unclearBtn.addEventListener("click",(e) => { e.stopPropagation(); selectedChoice = "unclear"; setSelected(); });

    submitBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!selectedChoice) return;
        const stats = submitWordVote(currentWord.id, selectedChoice);
        if (!stats) return;
        hasVoted = true;
        renderVoteState(applyVoteChoiceToStats(displayedStats, selectedChoice), true);
        enqueueVoteSync(currentWord.id, selectedChoice);
        syncVoteQueue();
    });
}

// ---------------------------------------------------------------------------
// Render: entry panel
// ---------------------------------------------------------------------------

function renderEntryPanel() {
    const word = panelState.allWords.find(w => w.id == panelState.focusedNodeId);
    if (!word) return;
    const lang = normalizeLang(panelState.currentLang);

    const entryPanel = document.querySelector(".panel-entry");
    if (!entryPanel) return;

    // Scroll to top
    const entryMain = entryPanel.querySelector(".panel-main");
    if (entryMain) entryMain.scrollTo({ top: 0, behavior: "auto" });

    // panel-top
    const title = entryPanel.querySelector(".panel-top");
    const displayTermOri = getDisplayOriText(word.termOri, lang, word.term?.zh || "");
    title.innerHTML = `
        <p>${String(word.id).padStart(4, "0")}</p>
        <img src="${resolveImagePath(word.concept_image)}" alt="concept image" loading="lazy" decoding="async">
        <div>
            <div class="term-main">${word.term?.[lang] || "未知单词"}</div>
            ${displayTermOri ? `<div class="term-ori">${displayTermOri}</div>` : ""}
        </div>`;

    // panel-bottom
    const bottomDiv = entryPanel.querySelector(".panel-bottom");
    bottomDiv.innerHTML = `
        <section id="section-brief"></section>
        <section id="section-extended"></section>
        <section id="section-example"></section>
        <section id="section-proposers"></section>
        <section id="section-source"></section>
        <section id="section-related-works"></section>
        <section id="section-understanding-vote"></section>
        <section id="section-contributors"></section>
        <section id="section-contact"></section>
        <section id="section-editors"></section>`;

    const briefSec        = bottomDiv.querySelector("#section-brief");
    const extendedSec     = bottomDiv.querySelector("#section-extended");
    const exampleSec      = bottomDiv.querySelector("#section-example");
    const proposerSec     = bottomDiv.querySelector("#section-proposers");
    const sourceSec       = bottomDiv.querySelector("#section-source");
    const relatedSec      = bottomDiv.querySelector("#section-related-works");
    const voteSec         = bottomDiv.querySelector("#section-understanding-vote");
    const contributorsSec = bottomDiv.querySelector("#section-contributors");
    const contactSec      = bottomDiv.querySelector("#section-contact");
    const editorsSec      = bottomDiv.querySelector("#section-editors");

    // Brief
    const briefRaw  = word.brief_definition?.[lang] || "暂无简要释义";
    const briefText = applyHashItalics(ensureTerminalPunctuation(briefRaw, lang));
    briefSec.innerHTML = `<p class="left-title">${sectionTitles.brief[lang]}</p><div><h3>${briefText}</h3></div>`;

    // Extended
    const extendedTitle = lang === "zh" ? "详细释义" : "Description";
    const extendedValue = word.extended_definition?.[lang];
    const extendedParts = Array.isArray(extendedValue)
        ? extendedValue
        : (extendedValue ? [extendedValue] : ["暂无详细释义"]);
    extendedSec.innerHTML = `<p class="left-title">${extendedTitle}</p><div>
        ${extendedParts.map(p => `<p>${applyHashItalics(p)}</p>`).join("")}</div>`;

    // Example
    const exampleValue = word.example_sentence?.[lang];
    const exampleHtml  = Array.isArray(exampleValue)
        ? exampleValue.map(p => `<p>${applyHashItalics(p)}</p>`).join("")
        : `<p>${applyHashItalics(exampleValue || "暂无例句")}</p>`;
    exampleSec.innerHTML = `<p class="left-title">${sectionTitles.example[lang]}</p>
        <div class="example-text">${exampleHtml}<div class="diagram-container"></div></div>`;

    const diagramContainer = exampleSec.querySelector(".diagram-container");
    if (word.diagrams && word.diagrams.length > 0) {
        const diagramItems = word.diagrams.map(d => ({ src: d?.src, caption: d?.caption, source: d?.source }));
        const carousel = buildDiagramCarousel(diagramItems, lang, { includeSource: false });
        if (carousel) diagramContainer.appendChild(carousel);
    }

    // Proposers (read-only — no word navigation on panel pages)
    proposerSec.innerHTML = `<p class="left-title">${sectionTitles.proposers[lang]}</p><div id="proposers-container"></div>`;
    const proposersContainer = proposerSec.querySelector("#proposers-container");
    (word.proposers || []).forEach((proposer) => {
        const block = document.createElement("div");
        block.className = "proposer-block";
        block.innerHTML = `
            <img alt="proposer's img" src="${resolveImagePath(proposer.image)}" loading="lazy" decoding="async">
            <div>
                <p class="proposer-name">${proposer.name?.[lang] || ""}</p>
                <p class="proposer-year">${proposer.year?.[lang] || proposer.year?.zh || proposer.year?.en || proposer.year || ""}</p>
                <p class="proposer-year">${proposer.role?.[lang] || ""}</p>
            </div>`;
        proposersContainer.appendChild(block);
    });

    // Source
    sourceSec.innerHTML = `<p class="left-title">${sectionTitles.source[lang]}</p>
        <div><p>${applyHashItalics(word.source?.[lang] || "暂无出处")}</p></div>`;

    // Related works
    const relatedWorks = Array.isArray(word.related_works) ? word.related_works : [];
    const relatedHtml  = relatedWorks.length
        ? relatedWorks.map(w => `<p>${applyHashItalics(w?.[lang] || "")}</p>`).join("")
        : `<p>${lang === "en" ? "No related works yet." : "暂无相关著作"}</p>`;
    relatedSec.innerHTML = `<p class="left-title">${sectionTitles.relatedWorks[lang]}</p>
        <div id="related-works-container">${relatedHtml}</div>`;

    // Vote
    renderUnderstandingVoteSection(voteSec, word, lang);

    // Contributors
    const contributors     = Array.isArray(word.contributors) ? word.contributors : [];
    const contributorNames = contributors.map(c => {
        const name = c?.name?.[lang] || "";
        const role = c?.role?.[lang] || "";
        return name ? `${name}${role ? ` (${role})` : ""}` : "";
    }).filter(Boolean);
    const contributorText  = contributorNames.length
        ? (lang === "en"
            ? `The contributor for this entry is ${contributorNames.join(", ")}.`
            : `本期词条的贡献者是${contributorNames.join(", ")}。`)
        : (lang === "en" ? "No contributor information yet." : "暂无贡献者信息");
    contributorsSec.innerHTML = `<p>${contributorText}</p>`;

    // Contact
    const contactPrimary = lang === "en"
        ? "Please feel free to email us at the address below to report any errors or inaccuracies in our content; you are also welcome to submit entries for terms you are interested in. "
        : "欢迎邮件以下邮箱，告知我们内容上的讹误或不准确的地方，您也可以邮件投稿您感兴趣的词条。";
    contactSec.innerHTML = `<div><p>${contactPrimary}</p><p>hello@dunesworkshop.org</p></div>`;

    // Editors
    editorsSec.innerHTML = `<p class="left-title">${sectionTitles.editors[lang]}</p>
        <div id="editors-container">${(word.editors || []).map(e => `<p>${applyHashItalics(e?.[lang] || "")}</p>`).join("")}</div>`;

    setupLazyImages(entryPanel);
    updateScrollHandlers();
}

// ---------------------------------------------------------------------------
// Render: echoes panel
// ---------------------------------------------------------------------------

function renderEchoesPanel() {
    const word = panelState.allWords.find(w => w.id == panelState.focusedNodeId);
    if (!word) return;
    const lang = normalizeLang(panelState.currentLang);

    const commentPanel = document.querySelector(".panel-comment");
    if (!commentPanel) return;

    const panelMain = commentPanel.querySelector(".panel-main");

    // Scroll to top
    if (panelMain) panelMain.scrollTo({ top: 0, behavior: "auto" });

    // panel-top
    const title      = commentPanel.querySelector(".panel-top");
    const echoHeading = lang === "en" ? "Echoes" : "回声";
    const echoIntro   = lang === "en"
        ? "From personal narratives, field notes, to multidisciplinary dialogues, these echoes translate abstract entries into concrete lived experiences."
        : "基于词条撰写的个人视角、田野观察与对话，将抽象概念引入具体的生命经验";
    title.innerHTML = `
        <div class="comment-top-id">${String(word.id).padStart(4, "0")}</div>
        <div class="comment-top-center">
            <div class="term-main">${word.term?.[lang] || (lang === "en" ? "Unknown term" : "未知词条")}</div>
            <div class="comment-top-echoes">${echoHeading}</div>
            <p class="comment-top-intro">${echoIntro}</p>
        </div>`;

    // panel-bottom
    const contentScroll = commentPanel.querySelector(".panel-bottom");
    const comments       = Array.isArray(word.comments) ? word.comments : [];
    const emptyLabel     = lang === "en" ? "No comments" : "暂无评论";
    const likedAria      = lang === "en" ? "Unlike this comment"  : "取消喜欢这条评论";
    const unlikedAria    = lang === "en" ? "Like this comment"    : "喜欢这条评论";

    contentScroll.innerHTML = `
        ${comments.length
            ? comments.map((c, idx) => {
                const roleLabel   = c?.role?.[lang]   || "";
                const nameLabel   = c?.author?.[lang] || "";
                const fallback    = lang === "en" ? `Note ${idx + 1}` : `注${idx + 1}`;
                const titleLabel  = (roleLabel || nameLabel)
                    ? `${roleLabel}${roleLabel && nameLabel ? "<br>" : ""}${nameLabel}`
                    : fallback;
                const rawContent  = c?.content?.[lang];
                const contentParts = Array.isArray(rawContent)
                    ? rawContent
                    : (typeof rawContent === "string" ? rawContent.split(/\r?\n|\u2028/) : []);
                const content = contentParts.length
                    ? contentParts.map(p => `<p>${applyHashItalics(p)}</p>`).join("") : "";
                const images   = Array.isArray(c?.images) ? c.images : [];
                const imagesHtml = images.length
                    ? (idx === 0
                        ? `<div class="note-images note-images-carousel"></div>`
                        : `<div class="note-images">${images.map(img => {
                            const cap = applyHashItalics(getCaptionText(img?.caption, lang));
                            return `<img src="${resolveImagePath(img?.src)}" alt="note image" loading="lazy" decoding="async">
                                    ${cap ? `<p class="diagram-caption">${cap}</p>` : ""}`;
                          }).join("")}</div>`)
                    : "";
                const liked = isCommentLiked(word.id, idx);
                return `<section>
                    <button type="button"
                        class="note-like-toggle${liked ? " is-liked" : ""}"
                        data-comment-index="${idx}"
                        aria-pressed="${liked ? "true" : "false"}"
                        aria-label="${liked ? likedAria : unlikedAria}"
                    ><span class="note-like-count" aria-hidden="true"></span></button>
                    <p class="left-title">${titleLabel}</p>
                    <div class="note-body"><br><br><br><br>${content}${imagesHtml}</div>
                </section>`;
              }).join("")
            : emptyLabel}
        <section id="section-contributors"></section>
        <section id="section-contact"></section>
        <section id="section-editors"></section>`;

    // Fill footer sections
    const contributorsSec = contentScroll.querySelector("#section-contributors");
    const contactSec      = contentScroll.querySelector("#section-contact");
    const editorsSec      = contentScroll.querySelector("#section-editors");

    const contribs = Array.isArray(word.contributors) ? word.contributors : [];
    const contribNames = contribs.map(c => {
        const name = c?.name?.[lang] || "";
        const role = c?.role?.[lang] || "";
        return name ? `${name}${role ? ` (${role})` : ""}` : "";
    }).filter(Boolean);
    const contribText = contribNames.length
        ? (lang === "en"
            ? `The contributor for this entry is ${contribNames.join(", ")}.`
            : `本期词条的贡献者是${contribNames.join(", ")}。`)
        : (lang === "en" ? "No contributor information yet." : "暂无贡献者信息");
    contributorsSec.innerHTML = `<p>${contribText}</p>`;

    const contactPrimary = lang === "en"
        ? "If you have any historical anecdotes or extended reflections regarding this entry, or if you have experienced a direct connection between this theoretical concept and daily life, we welcome you to submit your echoes to the following email address: "
        : "如果您知道关于这个词条的历史趣闻，延展思考或者能感受到过这个理论概念与生活的直接联系，欢迎将你的回声投稿至以下邮箱。";
    contactSec.innerHTML = `<div><p>${contactPrimary}</p><p>hello@dunesworkshop.org</p></div>`;

    editorsSec.innerHTML = `<p class="left-title">${sectionTitles.editors[lang]}</p>
        <div id="editors-container">${(word.editors || []).map(e => `<p>${applyHashItalics(e?.[lang] || "")}</p>`).join("")}</div>`;

    // First comment image carousel
    const firstImages = Array.isArray(comments[0]?.images) ? comments[0].images : [];
    if (firstImages.length > 0) {
        const target = contentScroll.querySelector(".note-images-carousel");
        if (target) {
            const items   = firstImages.map(img => ({ src: img?.src, caption: img?.caption, source: img?.source }));
            const carousel = buildDiagramCarousel(items, lang, {
                includeSource: true,
                arrowLeftSrc:  "assets/images/left_arrow_dark.svg",
                arrowRightSrc: "assets/images/right_arrow_dark.svg"
            });
            if (carousel) target.appendChild(carousel);
        }
    }

    // Like buttons
    const likeButtons = contentScroll.querySelectorAll(".note-like-toggle");
    likeButtons.forEach((btn) => {
        btn.addEventListener("mousedown", (e) => e.stopPropagation());
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const commentIndex = Number(btn.dataset.commentIndex);
            if (!Number.isFinite(commentIndex)) return;
            const liked = toggleCommentLiked(word.id, commentIndex);
            btn.classList.toggle("is-liked", liked);
            btn.setAttribute("aria-pressed", liked ? "true" : "false");
            btn.setAttribute("aria-label",   liked ? likedAria : unlikedAria);
            enqueueCommentLikeSync(word.id, commentIndex, liked, lang);
            syncVoteQueue();
            refreshCommentLikeBadges(contentScroll, word.id, { force: true });
        });
    });
    refreshCommentLikeBadges(contentScroll, word.id);

    // Echoes panel pages keep all notes in normal document flow.
    const noteSections = Array.from(
        contentScroll.querySelectorAll("section:not(#section-contributors):not(#section-contact):not(#section-editors)")
    );
    contentScroll.classList.remove("notes-mode");
    if (panelMain) panelMain.classList.remove("notes-fixed");
    noteSections.forEach(section => {
        section.classList.remove("note-expanded", "note-above", "note-below", "note-below-first");
    });

    setupLazyImages(commentPanel);
    updateScrollHandlers();
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

let currentTab = document.body.dataset.panel === "echoes" ? "comment" : "entry";

function switchTab(tabName) {
    const entryPanel   = document.querySelector(".panel-entry");
    const commentPanel = document.querySelector(".panel-comment");

    document.querySelectorAll(".panel-tabs button").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.tab === tabName);
    });

    if (tabName === "entry") {
        if (entryPanel)   entryPanel.classList.add("active");
        if (commentPanel) commentPanel.classList.remove("active");
    } else if (tabName === "comment") {
        if (commentPanel) commentPanel.classList.add("active");
        if (entryPanel)   entryPanel.classList.remove("active");
    }

    currentTab = tabName;
    updateScrollHandlers();
}

function initTabs() {
    document.querySelectorAll(".panel-tabs button").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            switchTab(btn.dataset.tab);
        });
    });
}

// ---------------------------------------------------------------------------
// Scroll thumb
// ---------------------------------------------------------------------------

const SCROLL_CONFIG = { thumbMargin: 0 };
let isDragging = false;
let dragStartY = 0;
let dragStartTop = 0;
let currentScrollThumb = null;
let currentPanelMain   = null;
let syncChannel = null;
let flythroughReadRaf = null;
let flythroughReadToken = null;

function getActivePanelMain() {
    const active = document.querySelector(".panel-entry.active, .panel-comment.active");
    return active ? active.querySelector(".panel-main") : null;
}

function handleScroll() {
    const active = document.querySelector(".panel-entry.active, .panel-comment.active");
    if (!active) return;
    const panelMain   = active.querySelector(".panel-main");
    const scrollThumb = active.querySelector(".scroll-thumb");
    if (!panelMain || !scrollThumb) return;

    const scrollTop      = panelMain.scrollTop;
    const contentHeight  = panelMain.scrollHeight;
    const visibleHeight  = panelMain.clientHeight;
    const trackHeight    = panelMain.clientHeight;
    const thumbHeight    = scrollThumb.offsetHeight;
    const thumbActiveRange = trackHeight - (SCROLL_CONFIG.thumbMargin * 2) - thumbHeight;

    if (contentHeight <= visibleHeight) { scrollThumb.style.display = "none"; return; }
    const scrollRatio = scrollTop / (contentHeight - visibleHeight);
    const thumbTop    = SCROLL_CONFIG.thumbMargin + scrollRatio * thumbActiveRange;
    scrollThumb.style.display = "block";
    scrollThumb.style.top     = `${thumbTop}px`;
}

function getPanelKind() {
    return document.body.dataset.panel === "echoes" ? "echoes" : "entry";
}

function getSyncChannel() {
    if (!syncChannel) {
        try {
            syncChannel = new BroadcastChannel(CHANNEL_NAME);
        } catch (_) {
            syncChannel = null;
        }
    }
    return syncChannel;
}

function postSyncMessage(payload) {
    getSyncChannel()?.postMessage(payload);
}

function cancelFlythroughRead({ resetScroll = false } = {}) {
    if (flythroughReadRaf !== null) {
        cancelAnimationFrame(flythroughReadRaf);
        flythroughReadRaf = null;
    }
    flythroughReadToken = null;
    if (resetScroll) {
        const panelMain = getActivePanelMain();
        if (panelMain) panelMain.scrollTo({ top: 0, behavior: "auto" });
        handleScroll();
    }
}

function startFlythroughRead(command = {}) {
    const readId = command.readId;
    if (!readId) return;
    if (flythroughReadToken?.readId === readId) return;

    cancelFlythroughRead({ resetScroll: true });

    if (command.wordId && String(panelState.focusedNodeId) !== String(command.wordId)) {
        panelState.focusedNodeId = String(command.wordId);
        render();
    }

    const panelMain = getActivePanelMain();
    const speed = Number(command.speedPxPerSecond) || DEFAULT_FLYTHROUGH_SCROLL_PX_PER_SECOND;
    const minDuration = Number(command.minDuration) || DEFAULT_FLYTHROUGH_MIN_DURATION;
    const token = {
        readId,
        reachedEnd: false,
        completionSent: false
    };
    flythroughReadToken = token;

    if (!panelMain) {
        postSyncMessage({ type: "flythrough-read-complete", readId, panel: getPanelKind() });
        return;
    }

    panelMain.scrollTo({ top: 0, behavior: "auto" });
    handleScroll();

    let lastTime = performance.now();
    const startTime = lastTime;

    const step = now => {
        if (flythroughReadToken !== token) return;

        const dt = Math.max(0, (now - lastTime) / 1000);
        lastTime = now;

        const maxScroll = Math.max(0, panelMain.scrollHeight - panelMain.clientHeight);
        if (maxScroll <= 1) {
            token.reachedEnd = true;
            panelMain.scrollTop = 0;
        } else {
            const nextTop = panelMain.scrollTop + speed * dt;
            if (nextTop >= maxScroll - 0.5) {
                token.reachedEnd = true;
                panelMain.scrollTop = 0;
            } else {
                panelMain.scrollTop = nextTop;
            }
        }

        handleScroll();

        if (!token.completionSent && token.reachedEnd && now - startTime >= minDuration) {
            token.completionSent = true;
            postSyncMessage({ type: "flythrough-read-complete", readId, panel: getPanelKind() });
        }

        flythroughReadRaf = requestAnimationFrame(step);
    };

    flythroughReadRaf = requestAnimationFrame(step);
}

function handleSyncMessage(data = {}) {
    const { type, focusedNodeId, lang } = data;
    if (type === "focus-change") {
        cancelFlythroughRead({ resetScroll: true });
        panelState.focusedNodeId = focusedNodeId;
        panelState.currentLang   = normalizeLang(lang);
        syncDocumentLang();
        render();
        return;
    }
    if (type === "flythrough-read-start") {
        startFlythroughRead(data);
        return;
    }
    if (type === "flythrough-read-stop") {
        cancelFlythroughRead({ resetScroll: true });
    }
}

function setupScrollDrag(scrollThumb, panelMain) {
    if (currentScrollThumb) currentScrollThumb.removeEventListener("mousedown", handleThumbMouseDown);
    currentScrollThumb = scrollThumb;
    currentPanelMain   = panelMain;
    scrollThumb.addEventListener("mousedown", handleThumbMouseDown);
}

function handleThumbMouseDown(e) {
    if (!currentScrollThumb || !currentPanelMain) return;
    isDragging   = true;
    dragStartY   = e.clientY;
    dragStartTop = parseFloat(currentScrollThumb.style.top) || SCROLL_CONFIG.thumbMargin;
    document.body.style.userSelect = "none";
}

document.addEventListener("mousemove", (e) => {
    if (!isDragging || !currentPanelMain || !currentScrollThumb) return;
    const deltaY         = e.clientY - dragStartY;
    const trackHeight    = currentPanelMain.clientHeight;
    const thumbActiveRange = trackHeight - (SCROLL_CONFIG.thumbMargin * 2);
    const newTop = Math.min(
        Math.max(dragStartTop + deltaY, SCROLL_CONFIG.thumbMargin),
        SCROLL_CONFIG.thumbMargin + thumbActiveRange
    );
    currentScrollThumb.style.top = `${newTop}px`;
    const thumbRatio = (newTop - SCROLL_CONFIG.thumbMargin) / thumbActiveRange;
    currentPanelMain.scrollTop = thumbRatio * (currentPanelMain.scrollHeight - currentPanelMain.clientHeight);
});

document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = "";
});

function updateScrollHandlers() {
    const active = document.querySelector(".panel-entry.active, .panel-comment.active");
    if (!active) return;
    const panelMain   = active.querySelector(".panel-main");
    const scrollThumb = active.querySelector(".scroll-thumb");
    if (!panelMain || !scrollThumb) return;
    panelMain.removeEventListener("scroll", handleScroll);
    panelMain.addEventListener("scroll",    handleScroll);
    handleScroll();
    setupScrollDrag(scrollThumb, panelMain);
}

// ---------------------------------------------------------------------------
// BroadcastChannel + localStorage sync
// ---------------------------------------------------------------------------

function setupSync() {
    try {
        const channel = getSyncChannel();
        if (!channel) return;
        channel.onmessage = (event) => {
            handleSyncMessage(event.data || {});
        };
    } catch (_) {}

    window.addEventListener("storage", (event) => {
        if (event.key !== FLYTHROUGH_READ_SYNC_KEY || !event.newValue) return;
        try {
            handleSyncMessage(JSON.parse(event.newValue));
        } catch (_) {}
    });
}

// ---------------------------------------------------------------------------
// Render (both panels every time so tab switching shows current content)
// ---------------------------------------------------------------------------

function render() {
    renderEntryPanel();
    renderEchoesPanel();
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
    // Read initial word from localStorage (written by main site on focus change)
    try {
        const stored = JSON.parse(localStorage.getItem(SYNC_KEY) || "null");
        if (stored?.focusedNodeId) {
            panelState.focusedNodeId = stored.focusedNodeId;
            panelState.currentLang   = normalizeLang(stored.lang || "zh");
        }
    } catch (_) {}

    // URL query-param fallback: ?id=5&lang=cn
    const params = new URLSearchParams(window.location.search);
    if (params.get("id"))   panelState.focusedNodeId = params.get("id");
    if (params.get("lang")) panelState.currentLang   = normalizeLang(params.get("lang") === "cn" ? "zh" : params.get("lang"));
    syncDocumentLang();

    // Load data
    let data;
    try {
        const resp = await fetch("/content/data.json");
        data = await resp.json();
    } catch (err) {
        console.error("panel-page: failed to load data.json", err);
        return;
    }
    panelState.allWords = data.words || [];

    // Default to home node if nothing set
    if (!panelState.focusedNodeId) {
        const homeId = data.home_node_id ?? panelState.allWords[0]?.id;
        if (homeId != null) panelState.focusedNodeId = String(homeId);
    }

    // Initial active panel based on page type
    const pagePanel = document.body.dataset.panel;
    if (pagePanel === "echoes") {
        switchTab("comment");
    } else {
        switchTab("entry");
    }

    initTabs();
    render();
    setupSync();
    initVoteSync();
}

init();
