// Service worker do Minhas Passagens: recebe push, abre o app ao tocar e, sem
// internet, mostra a página /offline (os próximos voos guardados no aparelho).
// Não guarda páginas com dados no cache: só a página offline e os ícones.
const CACHE = "mp-offline-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Navegação: sempre a rede primeiro; se falhar (sem internet), a página offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(OFFLINE_URL).then((r) => r || new Response("Sem conexão.", { status: 503 })),
    ),
  );
});
self.addEventListener("push", (event) => {
  let data = { title: "Minhas Passagens", body: "", url: "/app" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  // Aviso de preço: botão "Ver onde comprar" (aparece no Android; no iPhone, o
  // toque abre o monitor, que tem o mesmo botão).
  const buyUrl =
    typeof data.buyUrl === "string" && /^https:\/\//.test(data.buyUrl) ? data.buyUrl : null;
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url, buyUrl },
      ...(buyUrl
        ? { actions: [{ action: "buy", title: data.buyLabel || "Ver onde comprar" }] }
        : {}),
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const buyUrl = event.notification.data?.buyUrl;
  if (event.action === "buy" && buyUrl) {
    event.waitUntil(self.clients.openWindow(buyUrl));
    return;
  }
  const url = new URL(event.notification.data?.url ?? "/app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
