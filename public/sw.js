const DEFAULT_URL = "/purchase/pr";
const STATIC_CACHE = "krc-erp-static-v2";
const PRECACHE_URLS = [
  "/offline.html",
  "/pwa/icon-192.png",
  "/pwa/icon-192-maskable.png",
  "/pwa/icon-512.png",
  "/pwa/icon-512-maskable.png",
  "/pwa/apple-touch-icon.png",
  "/pwa/badge-96.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("krc-erp-static-") && key !== STATIC_CACHE).map((key) => caches.delete(key)))),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
    return;
  }
  const isStaticAsset = event.request.method === "GET"
    && url.origin === self.location.origin
    && (url.pathname.startsWith("/pwa/") || url.pathname.startsWith("/fonts/"));
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;

      const response = await fetch(event.request);
      if (!response.ok) return response;

      // Clone immediately. Once the original response is returned to the page,
      // its body may be consumed before an asynchronous cache callback runs.
      const responseForCache = response.clone();
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(event.request, responseForCache);
      return response;
    }),
  );
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
    Promise.all([
      self.registration.showNotification(title, {
        body: payload.body || "มีรายการใหม่ที่ต้องตรวจสอบ",
        icon: "/pwa/icon-192.png",
        badge: "/pwa/badge-96.png",
        tag: payload.tag || "krc-erp",
        renotify: true,
        data: { actionUrl },
      }),
      self.clients
        .matchAll({ type: "window", includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: "KRC_NOTIFICATION_RECEIVED" });
          }
        }),
    ]),
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
          return existingClient
            .focus()
            .then((client) => {
              const target = client || existingClient;
              if ("navigate" in target) {
                return target.navigate(targetUrl);
              }
              return undefined;
            })
            .catch(() => self.clients.openWindow(targetUrl));
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});
