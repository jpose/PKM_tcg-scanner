self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Permet au navigateur de gérer les requêtes réseau normalement
  e.respondWith(fetch(e.request));
});