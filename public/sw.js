/* ============================================================
 * Qingyu'Blog · Service Worker
 * ----------------------------
 * · 离线应用外壳：首页、核心样式/脚本、后台编辑器脚本
 * · 公开文章 API 网络优先，断网回退最近一次缓存
 * · 静态资源 stale-while-revalidate，版本号变化时自动清旧缓存
 * · 不缓存任何带 Authorization 的请求，也不缓存写操作
 * ============================================================ */
'use strict';

var CACHE_VERSION = '2.10.96';
var SHELL_CACHE = 'qingyu-shell-' + CACHE_VERSION;
var RUNTIME_CACHE = 'qingyu-runtime-' + CACHE_VERSION;
// 只预缓存「首屏必需」资源：后台编辑器 / 音乐播放器 / 背景动画体积大且用不到，
// 预缓存它们会和首屏抢带宽（弱网下反而更慢），改为首次访问时按需进运行时缓存。
var SHELL = [
  './',
  './index.html',
  './style.min.css',
  './config.min.js',
  './posts.min.js',
  './i18n.min.js',
  './app.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isReadableApi(url) {
  var p = url.pathname;
  if (p === '/api/posts') return !url.searchParams.has('all') && !url.searchParams.has('full');
  return p === '/api/settings' || /^\/api\/posts\/[^/]+\/?$/.test(p);
}

function isStaticAsset(url) {
  return /\.(?:css|js|mjs|json|webmanifest|png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(url.pathname);
}

async function trimCache(cacheName, maxEntries) {
  var cache = await caches.open(cacheName);
  var keys = await cache.keys();
  while (keys.length > maxEntries) {
    await cache.delete(keys.shift());
  }
}

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(function (url) {
      return cache.add(url).catch(function () { /* 单个资源失败不阻塞安装 */ });
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (key) {
      return key !== SHELL_CACHE && key !== RUNTIME_CACHE;
    }).map(function (key) { return caches.delete(key); }));
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(request) {
  try {
    var response = await fetch(request);
    if (response && response.ok) return response;
    throw new Error('navigation response not ok');
  } catch (e) {
    var shell = await caches.open(SHELL_CACHE);
    return (await shell.match('./index.html', { ignoreSearch: true })) || Response.error();
  }
}

async function networkFirstApi(request) {
  var url = new URL(request.url);
  var cache = await caches.open(RUNTIME_CACHE);
  var publicKey = new Request(url.origin + url.pathname);
  try {
    var response = await fetch(request);
    if (response && response.ok && response.status === 200 && !request.headers.has('Authorization')) {
      await cache.put(publicKey, response.clone());
      await trimCache(RUNTIME_CACHE, 60);
    }
    return response;
  } catch (e) {
    var cached = await cache.match(publicKey) || await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  var cached = await caches.match(request, { ignoreSearch: true });
  var network = fetch(request).then(async function (response) {
    if (response && response.ok) {
      var cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  }).catch(function () { return cached; });
  return cached || network;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (!isSameOrigin(url) || url.pathname === '/sw.js' || request.headers.has('Range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
  } else if (isReadableApi(url)) {
    event.respondWith(networkFirstApi(request));
  } else if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
