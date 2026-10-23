// عامل الخدمة لمساحة العمل: يخزّن واجهة التطبيق فقط ليفتح بلا شبكة.
// لا يخزّن أي استجابة من /api — البيانات تُحفظ في IndexedDB بواسطة التطبيق نفسه.
const CACHE = 'wasit-shell-v1';
const SHELL = ['/admin/', '/admin/manifest.webmanifest', '/admin/icon-192.png', '/static/icon.svg', '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate' && url.pathname.startsWith('/admin')) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('/admin/', copy)); return r; }).catch(() => caches.match('/admin/')));
    return;
  }
  if (url.pathname.startsWith('/admin/assets/') || url.pathname.startsWith('/vendor/leaflet/') || url.pathname.startsWith('/static/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })));
  }
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('/admin/#/today'))));
});
