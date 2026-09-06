const CACHE_NAME = 'botflow-cache-v3.7';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/favicon.ico'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch((err) => {
        console.warn('SW pre-cache non-fatal warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Do not intercept non-GET requests or API / SSE requests
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push event received in background.');
  let title = 'BotFlow Alert 🔔';
  let body = 'New Telegram update detected.';
  const baseUrl = self.location.origin;
  
  let options = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [200, 100, 200],
    tag: `botflow-${Date.now()}`,
    data: { url: baseUrl + '/' }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      console.log('[Service Worker] Push payload:', data);
      if (data.title) title = data.title;
      if (data.body) options.body = data.body;
      if (data.url) options.data = { url: data.url.startsWith('http') ? data.url : baseUrl + data.url };
      if (data.tag) options.tag = data.tag;
      if (data.data) options.data = { ...options.data, ...data.data };
    } catch (e) {
      console.warn('[Service Worker] Parsing push data as plain text');
      options.body = event.data.text() || options.body;
    }
  }

  // Multi-tier resilient notification display
  const displayNotification = async () => {
    try {
      // First attempt: complete rich notification
      await self.registration.showNotification(title, options);
      console.log('[Service Worker] Notification posted successfully:', title);
    } catch (primaryErr) {
      console.warn('[Service Worker] Primary showNotification failed, trying simplified options:', primaryErr);
      try {
        // Second attempt: stripped down options (works on all Android devices)
        await self.registration.showNotification(title, {
          body: options.body || 'New Telegram update',
          icon: '/pwa-192x192.png',
          data: options.data || { url: '/' }
        });
        console.log('[Service Worker] Fallback notification posted successfully:', title);
      } catch (fallbackErr) {
        console.error('[Service Worker] Fallback showNotification failed, attempting bare minimum:', fallbackErr);
        // Third attempt: pure bare-minimum notification to guarantee system display
        await self.registration.showNotification(title, {
          body: options.body || 'Alert'
        });
      }
    }
  };

  event.waitUntil(displayNotification());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if (client.url && 'focus' in client) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 24x7 Background Sync listener for resilient message and push checks
self.addEventListener('sync', (event) => {
  if (event.tag === 'botflow-sync' || event.tag === 'push-sync') {
    console.log('[Service Worker] Background sync triggered');
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'botflow-periodic-sync') {
    console.log('[Service Worker] Periodic background sync triggered');
  }
});

