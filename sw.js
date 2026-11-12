
const VERSION = 'studhub-v30';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './css/theme.css',
  './css/style.css',
  './css/settings.css',
  './css/wallet.css',
  './css/auth.css',
  './css/project.css',
  './css/rules.css',
  './css/sidebar.css',
  './css/limits.css',
  './css/mobile.css',
  './css/polish.css',
  './css/edit-profile.css',
  './css/design.css',
  './css/redesign.css',
  './js/theme-init.js',
  './js/limits.js',
  './js/storage.js',
  './js/i18n.js',
  './js/core.js',
  './js/projects.js',
  './js/edu-data.js',
  './js/profile.js',
  './js/ratings-comments.js',
  './js/discussions.js',
  './js/profile-posts.js',
  './js/fundraising.js',
  './js/notifications.js',
  './js/wallet.js',
  './js/settings.js',
  './js/assets.js',
  './js/auth.js',
  './js/rules.js',
  './js/people.js',
  './js/search.js',
  './js/sidebar.js',
  './js/config.js',
  './js/backend.js',
  './js/mobile.js',
  './js/main.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('studhub-') && key !== VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  // Конфигурацию Supabase всегда берём из сети,
  // чтобы не использовать устаревшие ключи.
  if (url.pathname.endsWith('/js/config.js')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(async response => {
        if (response.ok) {
          const copy = response.clone();
          await caches.open(VERSION)
            .then(cache => cache.put('./index.html', copy));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Файлы сайта: сначала сеть (чтобы после обновления не было смеси старого JS с новым HTML),
  // при плохой связи через 4 секунды отдаём копию из кэша.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(async response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return response;
    });
    if (!cached) return net;
    return Promise.race([net, new Promise(resolve => setTimeout(() => resolve(cached), 4000))]).catch(() => cached);
  })());
});
