// WisePay Service Worker
// - 同一オリジンのGETは常に最新優先(network-first)、オフライン時のみキャッシュを使う
// - GAS(script.google.com)など外部への通信は触らない(保存しない)
const CACHE = 'wisepay-v1';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(function(res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function(c) { c.put(req, copy); });
      }
      return res;
    }).catch(function() {
      return caches.match(req);
    })
  );
});

self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || '給与Pro by Wisewires';
  const options = {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'favicon.ico',
    tag: data.tag || 'wisepay-notification',
    requireInteraction: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
