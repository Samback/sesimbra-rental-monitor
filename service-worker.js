const APP_SCOPE = self.registration.scope;
const APP_ICON = new URL("./icon.svg", APP_SCOPE).href;

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const target = safeHttpsUrl(payload.url);
  const title = String(payload.title || "Нове оголошення біля Sesimbra");
  const body = String(payload.body || "Знайдено нове перевірене житло.");
  const tag = String(payload.tag || payload.listingId || "sesimbra-rental");

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: APP_ICON,
    badge: APP_ICON,
    tag,
    renotify: false,
    data: { url: target }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = safeHttpsUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url === target && "focus" in client) return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});

function safeHttpsUrl(value) {
  try {
    const url = new URL(value || APP_SCOPE, APP_SCOPE);
    return url.protocol === "https:" ? url.href : APP_SCOPE;
  } catch {
    return APP_SCOPE;
  }
}
