const SPREADSHEET_ID = '1Ue8iKwyo8EMvoI-eCXiWpQ7_nMyRtbNg80SvIv3Y5_Q';
const SHEET_NAME = '聖書箇所';
const TZ = 'Asia/Tokyo';

/**
 * VAPID 公開鍵（あなたの公開鍵）
 */
const VAPID_PUBLIC_KEY = 'BAF3kHoFddFVoAuR5N5g_OekgGMM3Wfws1zIMKxNmCUve1TRLqCtAnTQP5536Q07RpxddJPdRy__k6kxtKbtBE8';

// 曜日別あいさつ（全改行あり／日曜始まり）
const GREETING_BY_YOUBI = {
  '日': `おはようございます。
新しい一週間の始まりです。
主の御前に心を向け、聖日の一日を共に歩みましょう。`,

  '月': `おはようございます。
昨日の恵みを胸に、
今週の歩みを主と共に始めていきましょう。`,

  '火': `おはようございます。
今週の歩みの中日です。
今日も主の導きに信頼して進みましょう。`,

  '水': `おはようございます。
週の真ん中です。
主が今日も力を与えてくださいます。`,

  '木': `おはようございます。
ここまで守られてきました。
今日もみことばに立って歩みましょう。`,

  '金': `おはようございます。
一週間の終わりが近づいています。
感謝をもって今日を過ごしましょう。`,

  '土': `おはようございます。
心を静め、整えながら、
次の聖日に備える一日となりますように。`
};

function doGet(e) {
  const path = (e && e.parameter && e.parameter.p) ? e.parameter.p : '';
  if (path === 'manifest') return serveManifest_();
  if (path === 'sw') return serveServiceWorker_();

  return serveTodayHtml_();
}

/**
 * Push購読を受け取る（POST）
 */
function doPost(e) {
  const path = (e && e.parameter && e.parameter.p) ? e.parameter.p : '';
  if (path === 'subscribe') return handleSubscribe_(e);

  return ContentService
    .createTextOutput('Not Found')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Spreadsheet を openById で取得
 */
function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * 今日のHTMLを返す
 */
function serveTodayHtml_() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) {
    return HtmlService.createHtmlOutput(`シート「${SHEET_NAME}」が見つかりませんでした。`)
      .setTitle('聖書通読2026')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // ★日付型も扱えるように getValues() を使う
  const data = sh.getDataRange().getValues();
  const todayKey = normalizeDateKey_(new Date());

  // 今日の行を探す
  let text = '';
  for (let i = 1; i < data.length; i++) {
    const rowKey = normalizeDateKey_(data[i][0]); // A: 日付
    if (rowKey !== todayKey) continue;

    const rowDateStr = formatDateForDisplay_(data[i][0]); // 表示用 yyyy/MM/dd
    const youbi   = String(data[i][1] || '').trim(); // B: 曜日
    const passage = String(data[i][2] || '').trim(); // C: 聖書箇所
    const urlText = String(data[i][3] || '').trim(); // D: URL
    const comment = String(data[i][4] || '').trim(); // E: コメント

    const greeting = (GREETING_BY_YOUBI[youbi] || 'おはようございます！').trim();

    const urls = urlText
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => /^https?:\/\//i.test(s));

    text =
`${greeting}

[HG聖書通読]Ver.Push2
${rowDateStr}（${youbi}）

聖書箇所: ${passage}
${urls.length ? '\n' + urls.join('\n') : ''}`.trim();

    if (comment) {
      text += `\n\n今日のコメント:\n${comment}`;
    }
    break;
  }

  if (!text) text = '今日のデータが見つかりませんでした。';

  const baseUrl = ScriptApp.getService().getUrl();
  const manifestUrl = `${baseUrl}?p=manifest`;
  const swUrl = `${baseUrl}?p=sw`;

  // 表示HTML
  const bodyInner = renderHtml_(text);

  const html = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>聖書通読2026</title>
  <meta name="apple-mobile-web-app-title" content="聖書通読2026">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">

  <link rel="manifest" href="${manifestUrl}">
  <meta name="theme-color" content="#ffffff">

  <style>
    :root{
      --pad: 14px;
      --radius: 18px;
    }

    body{
      font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
      margin: 0;
      background: #f6f7f9;
      color: #111;
      -webkit-text-size-adjust: 100%;
    }

    .wrap{ padding: var(--pad); }

    .card{
      background: #fff;
      border-radius: var(--radius);
      box-shadow: 0 6px 20px rgba(0,0,0,.08);
      padding: 16px;
    }

    .greeting{
      font-size: clamp(1.35rem, 5.2vw, 1.7rem);
      line-height: 1.6;
      font-weight: 800;
      margin-bottom: 14px;
    }

    .meta{
      font-size: clamp(1.05rem, 4.2vw, 1.25rem);
      line-height: 1.7;
      color: #333;
      margin-bottom: 14px;
    }

    .label{
      font-size: 0.95rem;
      letter-spacing: .04em;
      color: #666;
      margin-top: 16px;
      margin-bottom: 6px;
      font-weight: 700;
    }

    .content{
      font-size: clamp(1.15rem, 4.6vw, 1.45rem);
      line-height: 1.85;
    }

    .divider{
      height: 1px;
      background: #eee;
      margin: 14px 0;
    }

    .btnRow{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      margin: 12px 0 6px;
    }

    .btn{
      display:inline-block;
      font-weight: 800;
      font-size: clamp(1.05rem, 4.2vw, 1.25rem);
      padding: 12px 14px;
      border-radius: 14px;
      background: #eef3ff;
      text-decoration: none;
      color:#1a73e8;
    }

    .btnPush{
      background:#e8fff1;
      color:#167a3a;
    }

    @media (min-width: 768px){
      :root{ --pad: 22px; --radius: 22px; }
      .card{ padding: 22px; }
    }
  </style>
</head>

<body>
  ${bodyInner}

  <script>
    const SW_URL = ${JSON.stringify(swUrl)};
    const VAPID_PUBLIC_KEY = ${JSON.stringify(VAPID_PUBLIC_KEY)};

    // SW登録
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(SW_URL);
    }

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
      return outputArray;
    }

    async function enablePush(){
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('この端末はPush通知に対応していません（iPhoneはホーム画面追加が必要です）');
        return;
      }
      if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes('【') || VAPID_PUBLIC_KEY.includes('REPLACE')) {
        alert('VAPID公開鍵が未設定です（GAS側の VAPID_PUBLIC_KEY を設定してください）');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('通知が許可されていません');
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      const res = await fetch('?p=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });

      const json = await res.json().catch(()=>({ok:false}));
      if (json && json.ok) {
        alert('通知を有効にしました');
      } else {
        alert('購読の保存に失敗しました');
      }
    }
    window.enablePush = enablePush;
  </script>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle('聖書通読2026')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTML生成（表示部分）
 */
function renderHtml_(text) {
  const lines = String(text).split(/\n+/).map(s => s.trim()).filter(Boolean);

  const greetingLines = [];
  const urlLines = [];
  const otherLines = [];
  const commentLines = [];

  let inComment = false;

  for (const line of lines) {
    if (line === '今日のコメント:' || line.startsWith('今日のコメント')) {
      inComment = true;
      continue;
    }
    if (/^https?:\/\//i.test(line)) {
      urlLines.push(line);
      continue;
    }
    if (inComment) {
      commentLines.push(line);
      continue;
    }

    if (greetingLines.length < 3 && !line.startsWith('[HG') && !/^\d{4}\//.test(line)) {
      greetingLines.push(line);
    } else {
      otherLines.push(line);
    }
  }

  const esc = escapeHtml_;

  // 「聖書箇所: XXX」を拾う（あれば）
  const passageLine = otherLines.find(l => l.startsWith('聖書箇所:'));
  const passages = passageLine
    ? passageLine.replace('聖書箇所:', '').trim().split(/[　\s]+/).filter(Boolean)
    : [];

  // bible.com(LB想定) → prs.app(新改訳2017) へ変換
  function bibleComToPrs(lbUrl) {
    const m = String(lbUrl).trim().match(/\/bible\/\d+\/([0-9A-Z]+)\.([0-9]+)(?:\.([0-9]+))?\.[A-Z]+/i);
    if (!m) return '';
    const book = m[1].toLowerCase();
    const chapter = m[2];
    const verse = m[3];
    return verse
      ? `https://prs.app/ja/bible/${book}.${chapter}.${verse}.jdb`
      : `https://prs.app/ja/bible/${book}.${chapter}.jdb`;
  }

  // 2ボタン（新改訳2017 / LB）
  const buttons = urlLines.map((u, idx) => {
    const passageLabel = passages[idx] ? `${passages[idx]}` : `聖書${urlLines.length > 1 ? `(${idx+1})` : ''}`;

    const lbUrl = String(u).trim();
    const prsUrl = bibleComToPrs(lbUrl);

    const lbHref  = esc(lbUrl);
    const prsHref = esc(prsUrl || lbUrl); // 変換失敗時はLBへフォールバック

    return `
      <div class="btnRow">
        <a class="btn" href="${prsHref}" target="_blank" rel="noopener">
          ${esc(passageLabel)}（新改訳2017）
        </a>
        <a class="btn" href="${lbHref}" target="_blank" rel="noopener">
          ${esc(passageLabel)}（LB）
        </a>
      </div>
    `;
  }).join('');

  const greetingHtml = greetingLines.length
    ? `<div class="greeting">${greetingLines.map(esc).join('<br>')}</div>`
    : '';

  const metaHtml = otherLines.length
    ? `<div class="meta">${otherLines.slice(0, 3).map(esc).join('<br>')}</div>`
    : '';

  const rest = otherLines.slice(3);
  const restHtml = rest.length
    ? `<div class="content">${rest.map(esc).join('<br>')}</div>`
    : '';

  const commentHtml = commentLines.length
    ? `<div class="divider"></div>
       <div class="label">今日のコメント</div>
       <div class="content">${commentLines.map(esc).join('<br>')}</div>`
    : '';

  // 🔔 Pushボタン
  const pushBtn = `
    <div class="btnRow">
      <a class="btn btnPush" href="javascript:void(0)" onclick="enablePush()">
        🔔 通知を有効にする
      </a>
    </div>
  `;

  const buttonsHtml = buttons ? buttons : '';

  return `
    <div class="wrap">
      <div class="card">
        ${greetingHtml}
        ${metaHtml}
        ${pushBtn}
        ${buttonsHtml}
        ${restHtml}
        ${commentHtml}
      </div>
    </div>
  `;
}

/**
 * 購読保存（subs シートへ）
 * endpoint が既存なら更新、無ければ追加
 */
function handleSubscribe_(e) {
  const ss = getSpreadsheet_();
  const sh = ensureSubsSheet_(ss);

  const obj = JSON.parse((e.postData && e.postData.contents) ? e.postData.contents : '{}');

  const endpoint = obj.endpoint || '';
  const p256dh = (obj.keys && obj.keys.p256dh) ? obj.keys.p256dh : '';
  const auth   = (obj.keys && obj.keys.auth)   ? obj.keys.auth   : '';

  if (!endpoint || !p256dh || !auth) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok:false, error:'invalid subscription' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const lastRow = sh.getLastRow();
  const endpoints = lastRow >= 2 ? sh.getRange(2, 2, lastRow - 1, 1).getValues().flat() : [];
  const idx = endpoints.indexOf(endpoint);

  const now = new Date();
  if (idx >= 0) {
    const row = idx + 2;
    sh.getRange(row, 1, 1, 4).setValues([[now, endpoint, p256dh, auth]]);
  } else {
    sh.appendRow([now, endpoint, p256dh, auth]);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok:true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensureSubsSheet_(ss) {
  let sh = ss.getSheetByName('subs');
  if (!sh) {
    sh = ss.insertSheet('subs');
    sh.getRange(1, 1, 1, 4).setValues([['createdAt','endpoint','p256dh','auth']]);
  }
  return sh;
}

/**
 * manifest
 */
function serveManifest_() {
  const baseUrl = ScriptApp.getService().getUrl();
  const manifest = {
    name: "聖書通読2026",
    short_name: "聖書通読2026",
    start_url: baseUrl,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff"
  };

  return ContentService
    .createTextOutput(JSON.stringify(manifest))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Service Worker（Push受信＋クリック）
 */
function serveServiceWorker_() {
  const sw = `
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ネット優先（毎日内容が変わる）
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

// 🔔 Push通知を受信
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '聖書通読2026';
  const options = {
    body: data.body || '',
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 👉 通知タップ
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  event.waitUntil(clients.openWindow(url));
});
`;
  return ContentService.createTextOutput(sw)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * 日付キーを正規化（A列が Date / 文字列どちらでもOK）
 * 許容: yyyy/M/d, yyyy/MM/dd, yyyy-MM-dd など
 */
function normalizeDateKey_(v) {
  let d = null;

  if (v instanceof Date) {
    d = v;
  } else {
    const s = String(v || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const da = Number(m[3]);
      if (y && mo && da) d = new Date(y, mo - 1, da);
    }
  }

  if (!d) return '';
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); // 比較用
}

function formatDateForDisplay_(v) {
  const key = normalizeDateKey_(v);
  if (!key) return '';
  const parts = key.split('-'); // yyyy-MM-dd
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

function escapeHtml_(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
