const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// App shell files to pre-cache
const APP_SHELL = [
  '/',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// API routes to cache (network-first with fallback)
const CACHEABLE_API_PATTERNS = [
  /\/api\/products/,
  /\/api\/categories/,
];

// Install: pre-cache app shell
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) {
            return name !== STATIC_CACHE && name !== API_CACHE && name !== IMAGE_CACHE;
          })
          .map(function (name) {
            return caches.delete(name);
          })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch: apply caching strategies
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Skip non-GET requests (POST transactions go through normally)
  if (event.request.method !== 'GET') {
    return;
  }

  // API requests: network-first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    var isCacheable = CACHEABLE_API_PATTERNS.some(function (pattern) {
      return pattern.test(url.pathname);
    });

    if (isCacheable) {
      event.respondWith(networkFirstWithCache(event.request, API_CACHE));
    }
    return;
  }

  // Images: cache-first
  if (event.request.destination === 'image' || /\.(png|jpg|jpeg|svg|gif|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirstWithNetwork(event.request, IMAGE_CACHE));
    return;
  }

  // Navigation requests (HTML pages): network-first with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          // Cache successful navigation responses
          var responseClone = response.clone();
          caches.open(STATIC_CACHE).then(function (cache) {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(function () {
          return caches.match(event.request).then(function (cached) {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // Static assets (JS, CSS, fonts): stale-while-revalidate
  if (/\.(js|css|woff2?|ttf|eot)$/.test(url.pathname) || url.pathname.startsWith('/_next/')) {
    event.respondWith(staleWhileRevalidate(event.request, STATIC_CACHE));
    return;
  }
});

// Strategy: Network first, fall back to cache
function networkFirstWithCache(request, cacheName) {
  return fetch(request)
    .then(function (response) {
      if (response.ok) {
        var responseClone = response.clone();
        caches.open(cacheName).then(function (cache) {
          cache.put(request, responseClone);
        });
      }
      return response;
    })
    .catch(function () {
      return caches.match(request).then(function (cached) {
        if (cached) return cached;
        return new Response(JSON.stringify({ success: false, error: 'Offline', offline: true }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        });
      });
    });
}

// Strategy: Cache first, fall back to network
function cacheFirstWithNetwork(request, cacheName) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      if (response.ok) {
        var responseClone = response.clone();
        caches.open(cacheName).then(function (cache) {
          cache.put(request, responseClone);
        });
      }
      return response;
    }).catch(function () {
      // Return transparent 1x1 pixel for failed image requests
      return new Response('', { status: 404 });
    });
  });
}

// Strategy: Stale-while-revalidate
function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var fetchPromise = fetch(request).then(function (response) {
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || fetchPromise;
    });
  });
}

// Background sync: retry failed transaction syncs
self.addEventListener('sync', function (event) {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncPendingTransactions());
  }
});

async function syncPendingTransactions() {
  // Notify all clients to trigger sync
  var clientList = await self.clients.matchAll({ type: 'window' });
  for (var client of clientList) {
    client.postMessage({ type: 'SYNC_TRANSACTIONS' });
  }
}

// Push notifications
self.addEventListener('push', function (event) {
  if (event.data) {
    var data = event.data.json();
    var options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: '2',
        url: data.url || '/',
      },
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
