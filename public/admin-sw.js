// Auro Ardon Admin PWA Service Worker (scoped to /admin/)
self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let payload = {
    title: "Auro Ardon Admin",
    body: "You have a new store update.",
    url: "/admin/orders",
    tag: "auro-ardon-admin",
    icon: "/icon-192"
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed
      };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icon-192",
      badge: "/icon",
      tag: payload.tag || "auro-ardon-admin",
      vibrate: [120, 60, 120],
      data: {
        url: payload.url || "/admin/orders"
      }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/admin/orders";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes("/admin") && "focus" in client) {
            if ("navigate" in client && typeof client.navigate === "function") {
              client.navigate(targetUrl).catch(() => {});
            }
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
        return undefined;
      })
  );
});

