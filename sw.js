// sw.js

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 🔔 Push受信
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "聖書通読";
  const url = data.url || "/";

  event.waitUntil((async () => {
    // 同じ tag で上書き（Androidで通知が溜まって数字が増えるのを抑制）
    const tag = "seishotsudoku-daily";
    const existing = await self.registration.getNotifications({ tag });
    for (const n of existing) n.close();

    await self.registration.showNotification(title, {
      body: data.body || "",
      data: { url },
      tag,
      renotify: false,
    });
  })());
});

// 👉 通知タップ
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";

  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of allClients) {
      if (c.url === url && "focus" in c) return c.focus();
    }
    return clients.openWindow(url);
  })());
});
