// Service Worker for PWA Functionality
const CACHE_NAME = 'sriram-portfolio-v4';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/script.js',
  '/js/script2.js',
  '/data/projects.json',
  '/assets/images/profile/profile.png',
  '/assets/images/projects/project1.png',
  '/assets/images/projects/project2.png',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/particles.js/2.0.0/particles.min.js'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('[SW] Cache failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate Service Worker
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

// Fetch Strategy: Network First, falling back to Cache
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests (except CDN)
  if (!event.request.url.startsWith(self.location.origin) &&
    !event.request.url.includes('cdnjs.cloudflare.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        const responseToCache = response.clone();

        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });

        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }

            // Return a basic offline response for navigation requests
            if (event.request.mode === 'navigate') {
              return new Response(
                '<html><body><h1>Offline</h1><p>Please check your internet connection.</p></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
          });
      })
  );
});

// Background Sync (for offline form submissions)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  try {
    // Retrieve pending messages from IndexedDB (if any)
    const db = await openDB();
    const tx = db.transaction('pendingMessages', 'readonly');
    const store = tx.objectStore('pendingMessages');
    const messages = await getAllFromStore(store);

    if (messages.length === 0) return;

    // Attempt to send each pending message
    for (const msg of messages) {
      try {
        await fetch(msg.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(msg.data)
        });
        // Remove from pending after successful send
        const deleteTx = db.transaction('pendingMessages', 'readwrite');
        deleteTx.objectStore('pendingMessages').delete(msg.id);
      } catch (e) {
        // Will retry on next sync
      }
    }
  } catch (error) {
    // IndexedDB not available or no pending messages
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PortfolioDB', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('pendingMessages', { keyPath: 'id', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Push Notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/assets/images/icons/icon-192.png',
    badge: '/assets/images/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: 'portfolio-notification',
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Sriram Portfolio', options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});