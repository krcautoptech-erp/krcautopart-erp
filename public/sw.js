const DEFAULT_URL = "/purchase/pr";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {
      body: event.data?.text() ?? "มีรายการใหม่ในระบบ KRC ERP",
    };
  }

  const title = payload.title || "KRC ERP";
  const actionUrl =
    typeof payload.actionUrl === "string" && payload.actionUrl.startsWith("/")
      ? payload.actionUrl
      : DEFAULT_URL;

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "มีรายการใหม่ที่ต้องตรวจสอบ",
      icon: "/pwa/icon-192.png",
      badge: "/pwa/badge-96.png",
      tag: payload.tag || "krc-erp",
      renotify: true,
      data: { actionUrl },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const actionUrl = event.notification.data?.actionUrl || DEFAULT_URL;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const targetUrl = new URL(actionUrl, self.location.origin).href;
        const existingClient = clients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );

        if (existingClient) {
          return existingClient.focus().then(() => {
            if ("navigate" in existingClient) {
              return existingClient.navigate(targetUrl);
            }
            return undefined;
          });
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
