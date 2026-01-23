const STORAGE_KEY = "dd_events";
const MAX_EVENTS = 500;
let currentWordView = null;

function getDocLang() {
  try {
    const lang = (document?.documentElement?.lang || "").toLowerCase();
    if (lang.startsWith("en")) return "en";
    if (lang.startsWith("zh") || lang.includes("cn")) return "zh";
  } catch (_) {
    // ignore
  }
  return "zh";
}

function getSessionId() {
  const key = "dd_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export function logEvent(name, data = {}) {
  try {
    const events = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const payload = { ...(data || {}) };
    if (!payload.lang) payload.lang = getDocLang();

    const event = {
      id: `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      ts: Date.now(),
      sessionId: getSessionId(),
      data: payload
    };

    // 1) 浠嶇劧鍐欐湰鍦帮紙闃叉柇缃戜涪锛?
    events.push(event);
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));

    // 2) 鍚屾椂涓婃姤鍒板悗绔?
    // - keepalive: 椤甸潰鍏抽棴/璺宠浆鏃朵篃灏介噺鍙戝嚭鍘?
    // - 涓嶉樆濉?UI锛氫笉 await
    fetch("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true
    }).catch(() => {
      // 杩欓噷鍏堥潤榛橈紝閬垮厤鎺у埗鍙板埛灞忥紱闇€瑕佽皟璇曞啀 console.log
    });

  } catch (err) {
    console.error("logEvent failed", err);
  }
}

export function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (err) {
    console.error("readEvents failed", err);
    return [];
  }
}

export function startWordView(wordId) {
  const lang = getDocLang();
  currentWordView = { wordId, startTs: Date.now(), lang };
  logEvent("word_view_start", { wordId, lang });
}

export function endWordView(reason = "unknown") {
  if (!currentWordView) return;
  const durationMs = Date.now() - currentWordView.startTs;
  logEvent("word_view_end", {
    wordId: currentWordView.wordId,
    durationMs,
    reason,
    lang: currentWordView.lang || getDocLang()
  });
  currentWordView = null;
}
