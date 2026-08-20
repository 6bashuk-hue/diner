importScripts("/site.config.js"); // exposes self.SITE_CONFIG — see site.config.js

const CACHE_NAME = "site-cache-v1"; // bump this string on every deploy that changes cached assets
const ASSETS = [
  "/",
  "/index.html",
  "/site.config.js",
  "/manifest.json",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;700;900&display=swap"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Web Push (added for marketing notifications) ──
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data; try { data = event.data.json(); } catch { data = { title: SITE_CONFIG.business.name, body: event.data.text() }; }
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: "/icon-192.png",
    dir: "rtl", lang: "he",
    vibrate: [200, 100, 200],
    tag: data.tag || "default",
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    data: { url: data.url || "/", ...(data.data || {}) }
  };
  event.waitUntil(self.registration.showNotification(data.title || SITE_CONFIG.business.name, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) { c.navigate(url); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("fetch", (e) => {
  // Don't cache Firebase, Telegram, Netlify functions, or Google Fonts API calls
  const url = e.request.url;
  if (
    url.includes("firebasedatabase.app") ||
    url.includes("api.telegram.org") ||
    url.includes("fonts.googleapis.com/css") ||
    url.includes("/.netlify/functions/")
  ) {
    return;
  }

  // Network-first for HTML documents AND app code (scripts/styles) so deploys take
  // effect immediately and a stale cached JS file never sticks; cache-first for the
  // rest (images, fonts). Falls back to cache offline.
  const dest = e.request.destination;
  if (dest === "document" || dest === "script" || dest === "style") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((c) => c || (dest === "document" ? caches.match("/index.html") : undefined)))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (!res || res.status !== 200 || res.type === "opaque") return res;
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => {
          if (e.request.destination === "document") {
            return caches.match("/index.html");
          }
        });
    })
  );
});
