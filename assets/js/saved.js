const SAVED_WORD_IDS_STORAGE_KEY = "dd_saved_word_ids_v1";

export function readSavedWordIdSet() {
    try {
        const raw = localStorage.getItem(SAVED_WORD_IDS_STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return new Set(parsed.map((id) => String(id)));
        }
        if (parsed && typeof parsed === "object") {
            const ids = Object.keys(parsed).filter((id) => Boolean(parsed[id]));
            return new Set(ids.map((id) => String(id)));
        }
    } catch (_) {
        // ignore malformed localStorage payload
    }
    return new Set();
}

export function writeSavedWordIdSet(savedWordIds) {
    try {
        localStorage.setItem(SAVED_WORD_IDS_STORAGE_KEY, JSON.stringify(Array.from(savedWordIds)));
    } catch (_) {
        // ignore storage failures
    }
}

export function applySavedStateToNode(node, savedWordIds) {
    if (!node) return;
    const wordId = String(node.id || "");
    node.classList.toggle("is-saved", savedWordIds.has(wordId));
}

export function refreshSavedWordIcons() {
    const savedWordIds = readSavedWordIdSet();
    document.querySelectorAll(".word-node").forEach((node) => {
        applySavedStateToNode(node, savedWordIds);
    });
}

function isScaleFiveActive() {
    return String(document.body?.dataset?.scale || "") === "5";
}

function toggleSavedStateForNode(node) {
    if (!node || !node.id) return false;
    const wordId = String(node.id);
    const savedWordIds = readSavedWordIdSet();
    if (savedWordIds.has(wordId)) {
        savedWordIds.delete(wordId);
    } else {
        savedWordIds.add(wordId);
    }
    writeSavedWordIdSet(savedWordIds);
    applySavedStateToNode(node, savedWordIds);
    return savedWordIds.has(wordId);
}

export function bindSaveIndicatorInteraction(node) {
    const indicator = node?.querySelector(".save-indicator");
    if (!indicator) return;

    indicator.addEventListener("mousedown", (e) => {
        e.stopPropagation();
    });

    indicator.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isScaleFiveActive()) return;
        toggleSavedStateForNode(node);
    });
}

export function initSavedWordStorageSync() {
    window.addEventListener("storage", (e) => {
        if (e.key === SAVED_WORD_IDS_STORAGE_KEY) {
            refreshSavedWordIcons();
        }
    });
    window.refreshSavedWordIcons = refreshSavedWordIcons;
}
