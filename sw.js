// Shur in g — keeps the app working without a connection once it has been opened.
// The page and its code are fetched fresh whenever there is a connection (cache as fallback);
// sounds, fonts and the 3D library are answered from the cache.
const V = "shur-in-g-v6";
const CORE = [
  "./", "index.html", "app.js", "player.js", "manifest.webmanifest",
  "pieces/mahur-chaharmezrab/scene.js", "pieces/mahur-chaharmezrab/notes.js",
  "pieces/chahargah-zang/scene.js", "pieces/chahargah-zang/notes.js",
  "pieces/mahur-kereshmeh/scene.js", "pieces/mahur-kereshmeh/notes.js",
  "snd/santur.m4a",
  "fonts/Cormorant.woff2", "fonts/Cormorant-Italic.woff2", "fonts/Vazirmatn.woff2",
  "icons/icon.svg", "icons/icon-192.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(V)
      .then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.origin === location.origin;
  if (!own && url.hostname !== "cdn.jsdelivr.net") return;
  const fresh = own && (req.mode === "navigate" || /\.(html|js|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/"));
  e.respondWith(
    caches.open(V).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: own });
      if (hit && !fresh) return hit;
      try {
        const r = await fetch(req);
        if (r.ok) c.put(req, r.clone());
        return r;
      } catch (err) {
        if (hit) return hit;
        throw err;
      }
    }),
  );
});
