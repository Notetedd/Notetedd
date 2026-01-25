#!/usr/bin/env node

/**
 * Post-build script for PWA configuration
 * Runs after `expo export -p web` to restore PWA-specific files
 * This ensures manifest.json and service-worker.js aren't overwritten by the build
 */
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

console.log('🔧 Running PWA post-build configuration...\n');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  console.error('❌ Error: dist directory not found. Run `expo export -p web` first.');
  process.exit(1);
}

// 1. Copy manifest.json with proper PWA configuration
const manifestContent = {
  "short_name": "Notetedd",
  "name": "Notetedd - Smart Learning Tool",
  "description": "Your smart learning tool for better note-taking and study",
  "icons": [
    {
      "src": "/icon-192.png",
      "type": "image/png",
      "sizes": "192x192",
      "purpose": "any"
    },
    {
      "src": "/icon-192.png",
      "type": "image/png",
      "sizes": "192x192",
      "purpose": "maskable"
    },
    {
      "src": "/icon-512.png",
      "type": "image/png",
      "sizes": "512x512",
      "purpose": "any"
    },
    {
      "src": "/icon-512.png",
      "type": "image/png",
      "sizes": "512x512",
      "purpose": "maskable"
    },
    {
      "src": "/adaptive-icon.jpg",
      "type": "image/png",
      "sizes": "144x144",
      "purpose": "any"
    }
  ],
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#000000",
  "background_color": "#ffffff",
  "categories": ["education", "productivity"],
  "lang": "en",
  "dir": "ltr",
  "screenshots": [
    {
      "src": "/icon-192.png",
      "type": "image/png",
      "sizes": "192x192",
      "form_factor": "narrow",
      "label": "Notetedd app home screen"
    },
    {
      "src": "/adaptive-icon.jpg",
      "type": "image/png",
      "sizes": "144x144",
      "form_factor": "wide",
      "label": "Notetedd app wide view"
    }
  ]
};

try {
  const manifestPath = path.join(distDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifestContent, null, 2));
  console.log('✅ Created/Updated dist/manifest.json with PWA configuration');
} catch (error) {
  console.error('❌ Error writing manifest.json:', error.message);
  process.exit(1);
}

// 2. Create enhanced service worker with offline support
const swContent = `// Notetedd PWA Service Worker
const CACHE_NAME = 'notetedd-app-v1';
const DYNAMIC_CACHE = 'notetedd-dynamic-v1';

const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon.png',
  '/adaptive-icon.jpg',
  '/splash-bg.jpg',
  '/favicon.ico'
];

// Install event - cache core resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core files');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[SW] Cache addAll error:', err);
        throw err;
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions and non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // API calls - Network First strategy
  if (url.pathname.includes('/api') || url.hostname.includes('api')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cached => {
            return cached || new Response(
              JSON.stringify({ error: 'Offline - API not available' }),
              {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        })
    );
    return;
  }

  // Static assets - Cache First strategy
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Don't cache opaque responses (cross-origin with no CORS)
          if (response.type === 'opaque') {
            return response;
          }

          const responseToCache = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, responseToCache);
          });

          return response;
        });
      })
      .catch(() => {
        // Offline fallback
        if (request.destination === 'image') {
          return caches.match('/icon-192.png');
        }
        
        if (request.destination === 'document') {
          return caches.match('/index.html');
        }

        return new Response('Offline - Resource not available', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      })
  );
});

// Handle background sync (if supported)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-notes') {
    event.waitUntil(syncNotes());
  }
});

// Handle push notifications (if enabled)
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  const options = {
    body: event.data ? event.data.text() : 'New update available',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification('Notetedd', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

// Helper function for background sync
async function syncNotes() {
  // Implement your note syncing logic here
  console.log('[SW] Syncing notes in background...');
}
`;

try {
  const swPath = path.join(distDir, 'service-worker.js');
  fs.writeFileSync(swPath, swContent);
  console.log('✅ Created/Updated dist/service-worker.js with enhanced caching');
} catch (error) {
  console.error('❌ Error writing service-worker.js:', error.message);
  process.exit(1);
}

// 3. Update dist/index.html with complete PWA configuration
try {
  const indexHtmlPath = path.join(distDir, 'index.html');
  
  if (!fs.existsSync(indexHtmlPath)) {
    console.error('❌ Error: index.html not found in dist directory');
    process.exit(1);
  }

  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

  // Remove existing PWA tags to avoid duplicates
  indexHtml = indexHtml.replace(/<link rel="manifest"[^>]*>/g, '');
  indexHtml = indexHtml.replace(/<meta name="theme-color"[^>]*>/g, '');
  indexHtml = indexHtml.replace(/<meta name="apple-mobile-web-app-capable"[^>]*>/g, '');
  indexHtml = indexHtml.replace(/<meta name="apple-mobile-web-app-status-bar-style"[^>]*>/g, '');
  indexHtml = indexHtml.replace(/<link rel="apple-touch-icon"[^>]*>/g, '');
  
  // Remove existing service worker registration script
  indexHtml = indexHtml.replace(/<script>[^<]*serviceWorker[^<]*<\/script>/g, '');

  // PWA meta tags and manifest
  const pwaHead = `
  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json" />
  
  <!-- Theme Colors -->
  <meta name="theme-color" content="#000000" />
  <meta name="msapplication-TileColor" content="#000000" />
  
  <!-- SEO and Description -->
  <meta name="description" content="Your smart learning tool for better note-taking and study" />
  <meta name="keywords" content="notes, learning, study, education, productivity" />
  
  <!-- Apple iOS PWA Support -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Notetedd" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <link rel="apple-touch-icon" sizes="152x152" href="/icon-192.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icon-192.png" />
  
  <!-- Android PWA Support -->
  <meta name="mobile-web-app-capable" content="yes" />
  
  <!-- Microsoft Windows -->
  <meta name="msapplication-TileImage" content="/icon-192.png" />
  <meta name="msapplication-config" content="/browserconfig.xml" />
</head>`;

  indexHtml = indexHtml.replace('</head>', pwaHead);

  // Service Worker registration script (before closing body tag)
  const swScript = `
  <!-- Service Worker Registration -->
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then(registration => {
            console.log('✅ Service Worker registered:', registration.scope);
            
            // Check for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('🔄 New version available! Reload to update.');
                  // Optionally show update notification to user
                }
              });
            });
          })
          .catch(err => {
            console.error('❌ Service Worker registration failed:', err);
          });
      });
      
      // Handle service worker updates
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    } else {
      console.warn('⚠️ Service Workers not supported in this browser');
    }
  </script>
</body>`;

  indexHtml = indexHtml.replace('</body>', swScript);

  fs.writeFileSync(indexHtmlPath, indexHtml);
  console.log('✅ Updated dist/index.html with complete PWA configuration');
} catch (error) {
  console.error('❌ Error updating index.html:', error.message);
  process.exit(1);
}

// 4. Create browserconfig.xml for Windows tiles
const browserConfigContent = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/icon-192.png"/>
      <TileColor>#000000</TileColor>
    </tile>
  </msapplication>
</browserconfig>`;

try {
  const browserConfigPath = path.join(distDir, 'browserconfig.xml');
  fs.writeFileSync(browserConfigPath, browserConfigContent);
  console.log('✅ Created dist/browserconfig.xml for Windows support');
} catch (error) {
  console.warn('⚠️  Warning: Could not create browserconfig.xml:', error.message);
}

// 5. Create offline fallback page (optional but recommended)
const offlineHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - Notetedd</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f5f5f5;
      text-align: center;
      padding: 20px;
    }
    .offline-container {
      max-width: 400px;
    }
    h1 { color: #333; }
    p { color: #666; line-height: 1.6; }
    .icon { font-size: 64px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="offline-container">
    <div class="icon">📱</div>
    <h1>You're Offline</h1>
    <p>Notetedd is currently offline. Please check your internet connection and try again.</p>
    <button onclick="window.location.reload()" style="
      padding: 12px 24px;
      font-size: 16px;
      background: #000;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 20px;
    ">Retry</button>
  </div>
</body>
</html>`;

try {
  const offlinePath = path.join(distDir, 'offline.html');
  fs.writeFileSync(offlinePath, offlineHtml);
  console.log('✅ Created dist/offline.html fallback page');
} catch (error) {
  console.warn('⚠️  Warning: Could not create offline.html:', error.message);
}

// 6. Verify critical assets exist
const criticalAssets = [
  'icon-192.png',
  'icon-512.png',
  'favicon.ico'
];

console.log('\n📋 Verifying critical assets...');
criticalAssets.forEach(asset => {
  const assetPath = path.join(distDir, asset);
  if (fs.existsSync(assetPath)) {
    console.log(`  ✓ ${asset} exists`);
  } else {
    console.warn(`  ⚠️  ${asset} not found - PWA may not work properly`);
  }
});

// 7. Display summary and next steps
console.log('\n' + '='.repeat(60));
console.log('🎉 PWA post-build configuration complete!');
console.log('='.repeat(60));
console.log('\n📦 Generated files:');
console.log('  • manifest.json - PWA manifest');
console.log('  • service-worker.js - Service worker with caching');
console.log('  • browserconfig.xml - Windows tile configuration');
console.log('  • offline.html - Offline fallback page');
console.log('  • Updated index.html with PWA meta tags');

console.log('\n🚀 Next steps:');
console.log('  1. Test locally: npx serve dist -p 3000');
console.log('  2. Deploy to HTTPS server (required for PWA)');
console.log('  3. Test PWA installation on mobile/desktop');
console.log('  4. Use Lighthouse to audit PWA compliance');

console.log('\n💡 Tips:');
console.log('  • PWAs require HTTPS in production');
console.log('  • Test on actual devices for best results');
console.log('  • Update CACHE_NAME in service-worker.js for updates');
console.log('  • Check browser console for SW registration status');
console.log('\n');