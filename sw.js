// sw.js
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      // iOS Safari は event.data.json() が不安定なことがあるので text() で受ける
      const txt = event.data ? await event.data.text() : "{}";
      data = txt ? JSON.parse(txt) : {};
    } catch (e) {
      data = {};
    }

    const title = data.title || "聖書通読";
    const body  = data.body  || "";

    // URLは必ず https 絶対URLへ正規化（iOS対策）
    const rawUrl = data.url || "/seishotsudoku/";
    const absUrl = new URL(rawUrl, self.location.origin).href;

    await self.registration.showNotification(title, {
      body,
      data: { url: absUrl },
      // icon: "/seishotsudoku/icon-192.png",   // あれば推奨
      // badge: "/seishotsudoku/badge.png",     // あれば推奨
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const url = event.notification?.data?.url
      ? new URL(event.notification.data.url, self.location.origin).href
      : new URL("/seishotsudoku/", self.location.origin).href;

    // 既に開いてるならそれをフォーカス（iOS/Androidで安定）
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url && client.url.startsWith(new URL("/seishotsudoku/", self.location.origin).href)) {
        await client.focus();
        // 同一スコープ内で遷移させたいなら（対応ブラウザのみ）
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }

    // なければ新規に開く
    await self.clients.openWindow(url);
  })());
});
