// Service Worker for Push Notifications
const CACHE_VERSION = 'v4';
const CACHE_NAME = `cardpon-cache-${CACHE_VERSION}`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  console.log('Service Worker installed');

  // Pre-cache the app shell so navigation can recover after the browser was killed
  // (common on mobile when reopening from app switcher)
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)).catch(() => undefined)
  );

  // Do NOT call skipWaiting() here - let it be controlled via message
  // This prevents the infinite reload loop
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  // Clean up old caches
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete all caches that don't match current version
            if (cacheName !== CACHE_NAME && cacheName.startsWith('cardpon-cache-')) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
            // Also delete workbox caches that might be stale
            if (cacheName.includes('workbox') || cacheName.includes('supabase')) {
              console.log('Cleaning cache:', cacheName);
              return caches.delete(cacheName);
            }
            return null;
          }),
        );
      })
      .then(() => {
        // Take control of all clients - but don't force reload from here
        return clients.claim();
      }),
  );
});

// Fetch event - network-first for navigation, but always fall back to cached app shell.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate';
  const isStaticAsset =
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html');

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', resClone)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          // Fallback to the cached app shell so SPA routes still render
          return (await caches.match('/')) || (await caches.match('/index.html'));
        }),
    );
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('Push notification received:', event);

  let data = {
    title: 'Cardpon',
    body: 'Você tem uma nova notificação',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'default',
    data: {},
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('Push payload:', payload);
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || data.tag,
        data: payload.data || {},
      };
    } catch (e) {
      console.error('Error parsing push data:', e);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Ver detalhes',
      },
      {
        action: 'close',
        title: 'Fechar',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Get the URL from notification data
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Listen for messages to force update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
