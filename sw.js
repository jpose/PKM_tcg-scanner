self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // NE PAS intercepter les appels API, les laisser passer en réseau direct
  if (e.request.url.includes('/api/')) {
    return;
  }
  
  e.respondWith(fetch(e.request));
});