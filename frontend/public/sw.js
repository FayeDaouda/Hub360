// Service worker du HUB (02/11/2026) : notifications système (Web Push).
// Aucune mise en cache : il ne fait que recevoir et ouvrir les notifications.
// Le HUB déjà au premier plan montre son propre pop-up : rien ici dans ce cas.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = { titre: 'hub360°', corps: '', url: '/', tag: undefined };
  try {
    message = { ...message, ...event.data.json() };
  } catch {
    /* charge illisible : notification générique */
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      const devant = fenetres.some((f) => f.focused && f.visibilityState === 'visible');
      if (devant) return undefined;
      return self.registration.showNotification(message.titre, {
        body: message.corps,
        tag: message.tag,
        renotify: !!message.tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: message.url },
      });
    }),
  );
});

// Clic : la fenêtre du HUB déjà ouverte vient devant et va à la page ; sinon
// une nouvelle s'ouvre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      const hub = fenetres.find((f) => new URL(f.url).origin === self.location.origin);
      if (hub) return hub.focus().then((f) => (f && 'navigate' in f ? f.navigate(url) : undefined));
      return self.clients.openWindow(url);
    }),
  );
});
