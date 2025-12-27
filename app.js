// sw.js
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      // iOS/一部Androidで event.data.json() が不安定なので text() → JSON.parse
      const txt = event.data ? await event.data.text() : "{}";
      data = txt ? JSON.parse(txt) : {};
    } catch (e) {
      data = {};
    }

    const title = data.title || "聖書通読";
    const body  = data.body  || "";

    // URLは必ず絶対URLへ（これがスマホで効く）
    const rawUrl = data.url || "/seishotsudoku/";
    const absUrl = new URL(rawUrl, self.location.origin).href;

    await self.registration.showNotification(title, {
      body,
      data: { url: absUrl },
      // icon: "/seishotsudoku/icon-192.png", // あれば推奨
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil((async () => {
    const raw = event.notification?.data?.url || "/seishotsudoku/";
    const url = new URL(raw, self.location.origin).href;

    // 既に開いてる画面があればフォーカスして遷移（スマホで安定）
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of allClients) {
      if (c.url && c.url.startsWith(new URL("/seishotsudoku/", self.location.origin).href)) {
        await c.focus();
        if ("navigate" in c) await c.navigate(url);
        return;
      }
    }

    await self.clients.openWindow(url);
  })());
});
