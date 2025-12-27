// sw.js
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try {
      // JSONとして来る場合
      data = event.data ? event.data.json() : {};
    } catch {
      // 文字列JSONの場合
      try {
        const txt = event.data ? await event.data.text() : "";
        data = txt ? JSON.parse(txt) : {};
      } catch {
        data = {};
      }
    }

    const title = data.title || "聖書通読";
    const options = {
      body: data.body || "",
      data: { url: data.url || "/" },
    };

    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification && event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : "/";

  event.waitUntil((async () => {
    // 既に開いてるタブがあればそこへ
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of allClients) {
      if (c.url === url && "focus" in c) return c.focus();
    }
    return clients.openWindow(url);
  })());
});
