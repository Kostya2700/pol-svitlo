const CACHE_NAME = 'power-schedule-v3';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// Встановлення service worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching files:', urlsToCache);
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('[SW] Failed to cache files:', err);
      })
  );
  self.skipWaiting();
});

// Активація service worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
  console.log('[SW] Service worker activated and ready!');
});

// Обробка запитів
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Для API запитів завжди використовуємо мережу
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Для JavaScript файлів завжди використовуємо мережу (Network First)
  if (url.pathname.endsWith('.js') || url.pathname.includes('/_next/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // Для статичних ресурсів (картинки, іконки) використовуємо Cache First
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|gif|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((fetchResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
    return;
  }

  // Для всього іншого використовуємо Network First
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Обробка push повідомлень
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    console.error('[SW] Failed to parse push data:', err);
  }

  const title = data.title || 'Графік відключень змінився';
  const options = {
    body: data.body || 'Перевірте новий графік відключень електроенергії',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    requireInteraction: false,
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
    actions: [
      {
        action: 'open',
        title: 'Переглянути',
      },
      {
        action: 'close',
        title: 'Закрити',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('[SW] Notification shown successfully');
      })
      .catch((err) => {
        console.error('[SW] Failed to show notification:', err);
      })
  );
});

// Обробка кліку на повідомлення
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const action = event.action;
  const url = event.notification.data?.url || '/';

  if (action === 'close') {
    console.log('[SW] User closed notification');
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Шукаємо вже відкрите вікно
        for (let client of clientList) {
          if (client.url === new URL(url, self.location.origin).href && 'focus' in client) {
            console.log('[SW] Focusing existing window');
            return client.focus();
          }
        }
        // Якщо вікна немає, відкриваємо нове
        if (clients.openWindow) {
          console.log('[SW] Opening new window:', url);
          return clients.openWindow(url);
        }
      })
      .catch((err) => {
        console.error('[SW] Failed to handle notification click:', err);
      })
  );
});
