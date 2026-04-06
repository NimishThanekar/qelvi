/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Precache all static assets injected by vite-plugin-pwa at build time
// eslint-disable-next-line @typescript-eslint/no-explicit-any
precacheAndRoute((self as any).__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

// ── Push notification received from server ────────────────────────────────
self.addEventListener('push', (event) => {
  const data = (event.data?.json() ?? {}) as { title?: string; body?: string; url?: string };
  const title = data.title ?? 'Qelvi';
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: '/icons/icon-192.png',   // full-colour app icon in the notification body
    badge: '/icons/badge-96.png',  // white-on-transparent for the Android status bar
    data: { url: data.url ?? '/dashboard' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification tapped → open or focus the app ───────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string | undefined) ?? '/dashboard';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            (client as WindowClient).focus();
            return;
          }
        }
        return clients.openWindow(url);
      }),
  );
});
