// app.js (front-end)
// --------------------
const WORKER_ORIGIN = "https://seishotsudoku-push.teruntyo.workers.dev";

// ここはあなたの「VAPID 公開鍵」
const VAPID_PUBLIC_KEY = "BP51V69QOr3LWj2YhzcVO05ojPb9R_VRiMcNciBxPkOXbBtsYZMuJOxgrpVcr755ixYsWK5hVDJLXSgYpTWfM_I";

// 365日一覧
const LIST_DAYS = 365;

const el = (id) => document.getElementById(id);

const state = {
  beforeInstallPrompt: null,
  today: null,
  days: [],
  filter: "unread", // unread | all
};

const LS_READ = "seishotsudoku_read_dates";
const LS_LIKE = "seishotsudoku_like_dates";

function getSet(key) {
  try {
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isStandalone() {
  // iOS: navigator.standalone / Android&Desktop: display-mode
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}
function isPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window;
}

function appBaseUrl() {
  // https://yoshi392.github.io/seishotsudoku/ を維持
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  // index.html ならフォルダに揃える
  if (!u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/[^/]*$/, "/");
  }
  return u.href;
}
function ymdJst(d = new Date()) {
  // JSTでYYYY-MM-DD
  const t = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const da = String(t.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function displayDateJst(ymd) {
  // YYYY-MM-DD -> YYYY/MM/DD
  return ymd.replaceAll("-", "/");
}
function yesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymdJst(d);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// --------------------
// Install UI (Android prompt + iOS guide)
// --------------------
function setupInstallUI() {
  const btnInstall = el("btnInstall");
  const modal = el("a2hsModal");
  const modalClose = el("btnA2hsClose");

  // iOS: standalone じゃなければ「ホーム画面に追加」ボタンを表示（手順ガイド）
  if (isIos() && !isStandalone()) {
    btnInstall.hidden = false;
    btnInstall.textContent = "📲 ホーム画面に追加";
    btnInstall.onclick = () => {
      modal.hidden = false;
    };
    modalClose.onclick = () => (modal.hidden = true);
  }

  // Android/Chrome: beforeinstallprompt が来たら “インストール” ボタンを表示
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    state.beforeInstallPrompt = e;
    if (!isStandalone()) {
      btnInstall.hidden = false;
      btnInstall.textContent = "⬇️ アプリをインストール";
      btnInstall.onclick = async () => {
        try {
          state.beforeInstallPrompt.prompt();
          await state.beforeInstallPrompt.userChoice;
        } finally {
          state.beforeInstallPrompt = null;
          btnInstall.hidden = true;
        }
      };
    }
  });

  // すでにPWAなら隠す
  window.addEventListener("appinstalled", () => {
    btnInstall.hidden = true;
  });
}

// --------------------
// Push subscribe
// --------------------
async function registerSW() {
  // scopeはGitHub Pages配下なので ./ が安全
  return navigator.serviceWorker.register("./sw.js");
}

async function getRegistrationReady() {
  await registerSW();
  return await navigator.serviceWorker.ready;
}

async function refreshPushUI() {
  const status = el("pushStatus");
  const btn = el("btnPush");

  // Push非対応のときの文言は「ホーム画面に追加」を促すニュアンスに
  if (!isPushSupported()) {
    btn.disabled = true;
    btn.textContent = "🔔 通知を有効にする";
    if (isIos() && !isStandalone()) {
      status.textContent = "Push通知を有効にするには、ホーム画面に追加してください。";
    } else {
      status.textContent = "この端末/ブラウザではPush通知が利用できません。";
    }
    return;
  }

  const perm = Notification.permission;
  const reg = await getRegistrationReady();
  const sub = await reg.pushManager.getSubscription();

  if (perm === "granted" && sub) {
    status.textContent = "✅ 通知は有効です";
    btn.hidden = true; // 有効後はボタンを消す（要望）
  } else {
    status.textContent = "";
    btn.hidden = false;
    btn.disabled = false;
    btn.textContent = "🔔 通知を有効にする";
  }
}

async function enablePush() {
  const status = el("pushStatus");
  status.textContent = "準備中…";

  if (!isPushSupported()) {
    if (isIos() && !isStandalone()) {
      status.textContent = "Push通知を有効にするには、ホーム画面に追加してください。";
    } else {
      status.textContent = "この端末/ブラウザではPush通知が利用できません。";
    }
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    status.textContent = "通知が許可されませんでした。設定で通知をONにしてください。";
    return;
  }

  const reg = await getRegistrationReady();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const res = await fetch(`${WORKER_ORIGIN}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    status.textContent = `subscribe失敗: ${res.status} ${t}`;
    return;
  }

  status.textContent = "✅ 通知は有効です";
  el("btnPush").hidden = true;
}

// --------------------
// Data fetch / render
// --------------------
async function fetchToday(dateYmd) {
  const u = new URL(`${WORKER_ORIGIN}/today`);
  if (dateYmd) u.searchParams.set("date", dateYmd);
  const r = await fetch(u.href);
  return await r.json();
}

async function fetchDays(untilYmd, days) {
  // Workerに /days がある想定（あなたの実装で追加済みならこれでOK）
  // もし無い場合は、今の /today だけ表示になります。
  const u = new URL(`${WORKER_ORIGIN}/days`);
  u.searchParams.set("days", String(days));
  u.searchParams.set("until", untilYmd);
  const r = await fetch(u.href);
  if (!r.ok) return { ok: false, days: [] };
  return await r.json();
}

function renderToday(data, dateYmd) {
  const todayDate = el("todayDate");
  const todayVerse = el("todayVerse");
  const todayComment = el("todayComment");
  const btns = el("todayButtons");

  const ymd = dateYmd || ymdJst();
  const dateDisp = data?.date || displayDateJst(ymd);
  const youbi = data?.weekday ? `（${data.weekday}）` : "";

  todayDate.textContent = `${dateDisp} ${youbi}`.trim();
  todayVerse.textContent = data?.verse || "";
  todayComment.textContent = data?.comment || "";

  // ボタン（新改訳2017 / LB）
  btns.innerHTML = "";
  (data?.buttons || []).forEach((b) => {
    const wrap = document.createElement("div");
    wrap.className = "btnRow";

    const a1 = document.createElement("a");
    a1.className = "btn";
    a1.href = b.prsUrl;
    a1.target = "_blank";
    a1.rel = "noopener";
    a1.textContent = `${b.label}（新改訳2017）`;

    const a2 = document.createElement("a");
    a2.className = "btn btnLb";
    a2.href = b.lbUrl;
    a2.target = "_blank";
    a2.rel = "noopener";
    a2.textContent = `${b.label}（LB）`;

    wrap.appendChild(a1);
    wrap.appendChild(a2);
    btns.appendChild(wrap);
  });

  // 今日を“開いた”＝既読扱い
  const read = getSet(LS_READ);
  read.add(ymd);
  saveSet(LS_READ, read);

  // 今日のハート
  updateTodayLikeUI(ymd);
}

function updateTodayLikeUI(ymd) {
  const likeSet = getSet(LS_LIKE);
  const btn = el("btnLike");
  const on = likeSet.has(ymd);
  btn.textContent = on ? "❤️" : "♡";
  btn.setAttribute("aria-pressed", on ? "true" : "false");
}

function toggleLike(ymd) {
  const likeSet = getSet(LS_LIKE);
  if (likeSet.has(ymd)) likeSet.delete(ymd);
  else likeSet.add(ymd);
  saveSet(LS_LIKE, likeSet);
  updateTodayLikeUI(ymd);
  renderList(); // 一覧側の表示も更新
}

function setCounts(readCount, unreadCount) {
  el("countRead").textContent = String(readCount);
  el("countUnread").textContent = String(unreadCount);
}

function renderList() {
  const listEl = el("list");
  const readSet = getSet(LS_READ);
  const likeSet = getSet(LS_LIKE);

  const items = (state.days || []).filter((d) => {
    if (state.filter === "all") return true;
    // unread
    return !readSet.has(d.ymd);
  });

  // counts
  let read = 0, unread = 0;
  (state.days || []).forEach((d) => {
    if (readSet.has(d.ymd)) read++;
    else unread++;
  });
  setCounts(read, unread);

  listEl.innerHTML = "";

  items.forEach((d) => {
    const li = document.createElement("li");
    li.className = "row";

    const left = document.createElement("button");
    left.className = "rowMain";
    left.type = "button";
    left.innerHTML = `
      <div class="rowDate">${d.date}</div>
      <div class="rowVerse">${d.verse || ""}</div>
    `;
    left.onclick = () => {
      // 日付で表示
      const u = new URL(appBaseUrl());
      u.searchParams.set("date", d.ymd);
      location.href = u.href;
    };

    const heart = document.createElement("button");
    heart.className = "heart";
    heart.type = "button";
    heart.textContent = likeSet.has(d.ymd) ? "❤️" : "♡";
    heart.onclick = (e) => {
      e.stopPropagation();
      const set = getSet(LS_LIKE);
      if (set.has(d.ymd)) set.delete(d.ymd);
      else set.add(d.ymd);
      saveSet(LS_LIKE, set);
      heart.textContent = set.has(d.ymd) ? "❤️" : "♡";
    };

    li.appendChild(left);
    li.appendChild(heart);
    listEl.appendChild(li);
  });
}

// --------------------
// Boot
// --------------------
async function main() {
  setupInstallUI();

  el("btnPush").addEventListener("click", enablePush);
  el("btnLike").addEventListener("click", () => {
    const dateParam = new URL(location.href).searchParams.get("date");
    const ymd = dateParam || ymdJst();
    toggleLike(ymd);
  });

  el("btnFilterUnread").addEventListener("click", () => {
    state.filter = "unread";
    el("btnFilterUnread").classList.add("active");
    el("btnFilterAll").classList.remove("active");
    renderList();
  });
  el("btnFilterAll").addEventListener("click", () => {
    state.filter = "all";
    el("btnFilterAll").classList.add("active");
    el("btnFilterUnread").classList.remove("active");
    renderList();
  });

  // 今日 or ?date=
  const dateParam = new URL(location.href).searchParams.get("date");
  const ymd = dateParam || ymdJst();

  // Push UI
  await refreshPushUI();

  // Today
  const today = await fetchToday(ymd);
  state.today = today;
  renderToday(today, ymd);

  // Days list: “昨日まで” を365日
  const until = yesterdayYmd();
  const daysRes = await fetchDays(until, LIST_DAYS);
  if (daysRes?.ok && Array.isArray(daysRes.days)) {
    state.days = daysRes.days; // [{ymd,date,verse},...]
  } else {
    state.days = [];
  }

  renderList();
}

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    const st = el("pushStatus");
    if (st) st.textContent = "読み込みでエラーが出ました。";
  });
});
