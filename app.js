// app.js (front-end) — 完成版（A2HSポップアップ完全削除）

const CONFIG = window.__CONFIG__ || {};
const WORKER_ORIGIN = (CONFIG.WORKER_ORIGIN || "").replace(/\/$/, "");
const VAPID_PUBLIC_KEY = (CONFIG.VAPID_PUBLIC_KEY || "").trim();
const APP_URL = (CONFIG.APP_URL || (location.origin + location.pathname.replace(/\/[^/]*$/, "/")));

// ---- DOM
const elPushState = document.getElementById("pushState");
const btnEnablePush = document.getElementById("btnEnablePush");
const btnInstall = document.getElementById("btnInstall");

const elTodayDate = document.getElementById("todayDate");
const elTodayVerse = document.getElementById("todayVerse");
const elTodayButtons = document.getElementById("todayButtons");
const elTodayComment = document.getElementById("todayComment");
const btnLikeToday = document.getElementById("btnLikeToday");

const btnFilterUnread = document.getElementById("btnFilterUnread");
const btnFilterAll = document.getElementById("btnFilterAll");
const elCounts = document.getElementById("counts");
const elDaysList = document.getElementById("daysList");

// ---- helpers
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function nowJst() { return new Date(Date.now() + JST_OFFSET_MS); }
function todayYmd() {
  const d = nowJst();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function ymdToSlash(ymd) {
  if (!ymd) return "";
  const [y,m,d] = ymd.split("-");
  return `${y}/${m}/${d}`;
}
function ymdCompare(a, b) { return String(a).localeCompare(String(b)); }

function getQueryDate() {
  const u = new URL(location.href);
  const q = u.searchParams.get("date");
  return normalizeDateAny(q);
}
function normalizeDateAny(s) {
  if (!s) return "";
  const x = String(s).trim().replace(/\./g,"/").replace(/-/g,"/");
  const parts = x.split("/").map(v=>v.trim()).filter(Boolean);
  if (parts.length === 3) {
    const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
    if (!y || !m || !d) return "";
    return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  return "";
}

function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function setStatus(text) {
  elPushState.textContent = text || "";
}

// localStorage keys
function kRead(ymd) { return `read:${ymd}`; }
function kLike(ymd) { return `like:${ymd}`; }
function isRead(ymd) { return localStorage.getItem(kRead(ymd)) === "1"; }
function toggleRead(ymd) {
  const v = isRead(ymd) ? "0" : "1";
  localStorage.setItem(kRead(ymd), v);
  return v === "1";
}
function isLiked(ymd) { return localStorage.getItem(kLike(ymd)) === "1"; }
function toggleLike(ymd) {
  const v = isLiked(ymd) ? "0" : "1";
  localStorage.setItem(kLike(ymd), v);
  return v === "1";
}

function safeJsonParse(s) { try { return JSON.parse(s); } catch { return null; } }

// bible.com → prs.app (新改訳2017)
function bibleComToPrs(lbUrl) {
  const m = String(lbUrl || "").trim()
    .match(/\/bible\/\d+\/([0-9A-Z]+)\.([0-9]+)(?:\.([0-9]+))?\.[A-Z]+/i);
  if (!m) return "";
  const book = m[1].toLowerCase();
  const chapter = m[2];
  const verse = m[3];
  return verse
    ? `https://prs.app/ja/bible/${book}.${chapter}.${verse}.jdb`
    : `https://prs.app/ja/bible/${book}.${chapter}.jdb`;
}

function normalizeToAbsoluteUrl(maybeUrl) {
  const base = APP_URL || location.origin + "/";
  if (!maybeUrl) return base;
  try { return new URL(String(maybeUrl).trim(), base).href; } catch { return base; }
}

// ---- SW / Push
async function ensureSW() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    await navigator.serviceWorker.register("./sw.js");
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function refreshPushUI() {
  // iOS: Safariでは「ホーム画面に追加」したPWAでないとPushできない
  if (isIOS() && !isStandalone()) {
    btnEnablePush.style.display = "none";
    setStatus("Push通知を有効にするには、ホーム画面に追加してください。");
    return;
  }

  // Push非対応
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    btnEnablePush.style.display = "none";
    setStatus("この端末ではPush通知に対応していません。");
    return;
  }

  // 権限状態
  const perm = Notification.permission;
  const reg = await ensureSW();

  if (!reg) {
    // SW登録失敗
    btnEnablePush.style.display = "none";
    setStatus("通知機能の初期化に失敗しました（Service Worker）。");
    return;
  }

  // 既に購読済みか
  let sub = null;
  try { sub = await reg.pushManager.getSubscription(); } catch { sub = null; }

  if (perm === "granted" && sub) {
    btnEnablePush.style.display = "none";
    setStatus("✅ 通知は有効です");
  } else {
    btnEnablePush.style.display = "inline-block";
    setStatus("");
  }
}

async function enablePush() {
  // iOSでPWAでない場合は「案内」だけ（ポップアップは出さない）
  if (isIOS() && !isStandalone()) {
    setStatus("Push通知を有効にするには、ホーム画面に追加してください。");
    return;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setStatus("この端末ではPush通知に対応していません。");
    return;
  }
  if (!VAPID_PUBLIC_KEY) {
    setStatus("VAPID公開鍵が未設定です（index.html の __CONFIG__ を確認してください）。");
    return;
  }
  if (!WORKER_ORIGIN) {
    setStatus("WORKER_ORIGIN が未設定です（index.html の __CONFIG__ を確認してください）。");
    return;
  }

  setStatus("準備中…");

  const reg = await ensureSW();
  if (!reg) {
    setStatus("通知機能の初期化に失敗しました（Service Worker）。");
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    setStatus("通知が許可されませんでした。設定で通知を許可してください。");
    return;
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const res = await fetch(WORKER_ORIGIN + "/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });

  const t = await res.text().catch(() => "");
  if (!res.ok) {
    setStatus(`subscribe失敗: ${res.status} ${t}`);
    return;
  }

  await refreshPushUI();
}

// ---- Install prompt (Android Chrome)
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnInstall) btnInstall.style.display = "inline-block";
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  if (btnInstall) btnInstall.style.display = "none";
});

async function handleInstallClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  try { await deferredPrompt.userChoice; } catch {}
  deferredPrompt = null;
  if (btnInstall) btnInstall.style.display = "none";
}

// ---- Worker API
async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  const t = await r.text();
  const j = safeJsonParse(t);
  return { ok: r.ok, status: r.status, json: j, text: t };
}

async function loadToday() {
  const { ok, status, json, text } = await fetchJson(WORKER_ORIGIN + "/today");
  if (!ok || !json?.ok) {
    return { ok:false, error: json?.error || `today fetch failed: ${status} ${text}` };
  }
  // pageUrl から ymd 抜き出し（無ければJST今日）
  const ymd = normalizeDateAny(new URL(json.pageUrl || (APP_URL + "?date=" + todayYmd()), APP_URL).searchParams.get("date")) || todayYmd();
  return {
    ok:true,
    ymd,
    date: json.date || ymdToSlash(ymd),
    weekday: json.weekday || "",
    verse: json.verse || "",
    comment: json.comment || "",
    buttons: Array.isArray(json.buttons) ? json.buttons : [],
    pageUrl: normalizeToAbsoluteUrl(json.pageUrl || (`?date=${encodeURIComponent(ymd)}`)),
  };
}

// days: 365日分（未来は表示しない）
async function loadDaysList(limit = 365) {
  const today = todayYmd();
  // 「昨日まで」
  const d = nowJst();
  d.setUTCDate(d.getUTCDate() - 1);
  const until = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;

  // できるだけ互換：/days?limit=365&until=YYYY-MM-DD
  const u = new URL(WORKER_ORIGIN + "/days");
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("until", until);

  const { ok, status, json, text } = await fetchJson(u.toString());
  if (!ok || !json?.ok) {
    return { ok:false, error: json?.error || `days fetch failed: ${status} ${text}`, days: [] };
  }

  const days = Array.isArray(json.days) ? json.days : [];
  // 未来を除外（念のため）
  const filtered = days
    .map(d => {
      const ymd = d.ymd || normalizeDateAny(d.pageUrl ? new URL(d.pageUrl, APP_URL).searchParams.get("date") : "");
      return { ...d, ymd };
    })
    .filter(d => d.ymd && ymdCompare(d.ymd, today) <= 0) // 今日含む可能性があってもOK
    .filter(d => ymdCompare(d.ymd, until) <= 0); // 昨日まで

  // 新しい日付が上に来る想定。並びが逆でも保険でソート。
  filtered.sort((a,b)=> ymdCompare(b.ymd, a.ymd));
  return { ok:true, until, days: filtered };
}

// ---- Render
function renderToday(data) {
  const ymd = data.ymd;
  elTodayDate.textContent = `${data.date}${data.weekday ? `（${data.weekday}）` : ""}`;
  elTodayVerse.textContent = data.verse || "";
  elTodayComment.textContent = data.comment || "";

  // buttons
  elTodayButtons.innerHTML = "";
  for (const b of (data.buttons || [])) {
    const prs = b.prsUrl || bibleComToPrs(b.lbUrl);
    const lb = b.lbUrl || "";
    const label = b.label || data.verse || "聖書";

    if (prs) {
      const a = document.createElement("a");
      a.className = "pill prs";
      a.textContent = `${label}（新改訳2017）`;
      a.href = prs;
      a.target = "_blank";
      a.rel = "noopener";
      elTodayButtons.appendChild(a);
    }
    if (lb) {
      const a = document.createElement("a");
      a.className = "pill lb";
      a.textContent = `${label}（LB）`;
      a.href = lb;
      a.target = "_blank";
      a.rel = "noopener";
      elTodayButtons.appendChild(a);
    }
  }

  // like
  const liked = isLiked(ymd);
  btnLikeToday.classList.toggle("on", liked);
  btnLikeToday.textContent = liked ? "♥" : "♡";
  btnLikeToday.onclick = () => {
    const on = toggleLike(ymd);
    btnLikeToday.classList.toggle("on", on);
    btnLikeToday.textContent = on ? "♥" : "♡";
    // 一覧も更新
    renderDaysList(currentDays, currentFilterUnreadOnly);
  };
}

function renderCounts(days) {
  let read = 0, unread = 0;
  for (const d of days) {
    if (!d.ymd) continue;
    if (isRead(d.ymd)) read++; else unread++;
  }
  elCounts.textContent = `既読 ${read} / 未読 ${unread}`;
}

function makeItem(day) {
  const ymd = day.ymd;
  const item = document.createElement("div");
  item.className = "item";

  const mark = document.createElement("button");
  mark.className = "mark" + (isRead(ymd) ? " on" : "");
  mark.title = "既読/未読";
  mark.onclick = () => {
    const on = toggleRead(ymd);
    mark.classList.toggle("on", on);
    renderCounts(currentDays);
    if (currentFilterUnreadOnly) {
      renderDaysList(currentDays, true);
    }
  };

  const link = document.createElement("a");
  link.className = "link";
  link.href = `${APP_URL}?date=${encodeURIComponent(ymd)}`;
  link.textContent = `${day.date || ymdToSlash(ymd)} ${day.weekday ? `(${day.weekday})` : ""} ${day.verse || ""}`;
  const sub = document.createElement("span");
  sub.className = "sub";
  sub.textContent = "タップして表示";
  link.appendChild(sub);

  const like = document.createElement("button");
  const liked = isLiked(ymd);
  like.className = "likeMini" + (liked ? " on" : "");
  like.textContent = liked ? "♥" : "♡";
  like.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = toggleLike(ymd);
    like.classList.toggle("on", on);
    like.textContent = on ? "♥" : "♡";
  };

  item.appendChild(mark);
  item.appendChild(link);
  item.appendChild(like);
  return item;
}

function renderDaysList(days, unreadOnly) {
  elDaysList.innerHTML = "";
  const selected = days.filter(d => d.ymd);

  const show = unreadOnly ? selected.filter(d => !isRead(d.ymd)) : selected;
  for (const d of show) elDaysList.appendChild(makeItem(d));

  renderCounts(selected);
}

// ---- main
let currentDays = [];
let currentFilterUnreadOnly = true;

async function main() {
  // Push UI
  btnEnablePush?.addEventListener("click", enablePush);
  await refreshPushUI();

  // Install UI
  btnInstall?.addEventListener("click", handleInstallClick);

  // Load data
  if (!WORKER_ORIGIN) {
    elTodayVerse.textContent = "WORKER_ORIGIN が未設定です";
    elTodayComment.textContent = "index.html の window.__CONFIG__ を確認してください。";
    return;
  }

  const t = await loadToday();
  if (!t.ok) {
    elTodayVerse.textContent = "読み込みに失敗しました";
    elTodayComment.textContent = t.error || "";
    return;
  }

  // 表示したい日（クエリがあればその日、なければ今日）
  const q = getQueryDate();
  const selectedYmd = q || t.ymd;

  // まず今日を表示（後で過去日に切り替え）
  renderToday(t);

  // days list
  const daysRes = await loadDaysList(365);
  if (daysRes.ok) {
    currentDays = daysRes.days || [];
    currentFilterUnreadOnly = true;
    renderDaysList(currentDays, true);
  }

  // クエリ日が今日以外なら、一覧から探して差し替える（未来は表示しない仕様）
  if (selectedYmd && selectedYmd !== t.ymd && currentDays.length) {
    const hit = currentDays.find(d => d.ymd === selectedYmd);
    if (hit) {
      // hit には buttons が無い可能性があるため、最低限で表示
      renderToday({
        ymd: hit.ymd,
        date: hit.date || ymdToSlash(hit.ymd),
        weekday: hit.weekday || "",
        verse: hit.verse || "",
        comment: hit.comment || "",
        buttons: hit.buttons || [],
        pageUrl: hit.pageUrl || `${APP_URL}?date=${encodeURIComponent(hit.ymd)}`
      });
    }
  }

  // Filters
  btnFilterUnread?.addEventListener("click", () => {
    currentFilterUnreadOnly = true;
    btnFilterUnread.classList.add("on");
    btnFilterAll.classList.remove("on");
    renderDaysList(currentDays, true);
  });
  btnFilterAll?.addEventListener("click", () => {
    currentFilterUnreadOnly = false;
    btnFilterAll.classList.add("on");
    btnFilterUnread.classList.remove("on");
    renderDaysList(currentDays, false);
  });
}

main().catch((e) => {
  elTodayVerse.textContent = "エラーが発生しました";
  elTodayComment.textContent = String(e?.stack || e);
});
