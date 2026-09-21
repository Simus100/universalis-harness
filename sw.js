/**
 * Service worker di Universalis Harness.
 * - rende l'app installabile (PWA)
 * - cache solo delle icone/manifest; API ed eventi SSE mai in cache
 * - gestisce il click sulla notifica "risposta pronta"
 */
const CACHE = "universalis-shell-v3";
// il manifest NON va in cache: il nome/icone dell'app devono poter cambiare
const SHELL = ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // mai in cache: API, stream SSE, manifest (nome/icone sempre aggiornati) e le pagine di
  // accesso (devono sempre arrivare dal server: una copia in cache mostrerebbe un form
  // inutile, o il form al posto della dashboard appena autenticata)
  if (url.pathname.startsWith("/api/") || url.pathname === "/events") return;
  if (url.pathname === "/manifest.webmanifest") return;
  if (url.pathname === "/login" || url.pathname === "/logout") return;

  const isStatic = /^\/(icon-|apple-touch-icon|manifest\.webmanifest|favicon\.ico)/.test(url.pathname);
  if (isStatic) {
    // cache-first per gli asset immutabili
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return resp;
          }),
      ),
    );
    return;
  }

  // documento/app: network-first, la cache è solo un paracadute offline
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (url.pathname === "/" && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow("/");
    })(),
  );
});
