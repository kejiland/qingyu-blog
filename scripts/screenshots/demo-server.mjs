/* ============================================================
 * 截图用本地演示服务器（仅开发工具，不参与站点运行）
 * ------------------------------------------------------------
 * 用途：让 capture.mjs 在**不接触线上环境、不需要管理员密码**的前提下，
 *       用真实的 public/ 代码渲染出带示例内容的页面，用于生成 README 截图。
 *
 *   · 静态资源：直接读仓库里的 public/
 *   · /api/*  ：由本文件返回内置示例数据（demo-content.mjs），只读 + 假登录
 *   · /demo/* ：内联 SVG 配图与运行时合成的 WAV 音频
 *
 * 用法：node scripts/screenshots/demo-server.mjs [--port 8788]
 * ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POSTS, COMMENTS, MEDIA, MUSIC, SETTINGS, STATS, AI, IMAGES, buildTrend, buildWav
} from './demo-content.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wav': 'audio/wav'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN'
};

function json(res, body, status = 200, extra) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': data.length
  }, SECURITY_HEADERS, extra || {}));
  res.end(data);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return null; }
}

/** 音频：按 URL 里的序号给一个固定时长，实时合成 WAV（不落盘） */
function demoAudio(name) {
  const idx = Math.max(1, Math.min(9, parseInt(name, 10) || 1));
  const track = MUSIC.find((m) => m.url.endsWith('/' + idx + '.wav'));
  const seconds = (track && track.duration) || 120 + idx * 12;
  return buildWav(seconds);
}

/** mock API 路由表：返回 true 表示已处理 */
async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method.toUpperCase();
  const q = url.searchParams;

  /* ---------- 管理员 ---------- */
  if (p === '/api/admin/login' && method === 'POST') {
    return json(res, { ok: true, token: 'demo-session-token', expiresIn: 604800, mustChange: false }), true;
  }
  if (p === '/api/admin/logout') return json(res, { ok: true }), true;
  if (p === '/api/admin/setup' && method === 'POST') return json(res, { ok: true, message: '管理员密码已设置' }, 201), true;
  if (p === '/api/admin/password' && method === 'POST') return json(res, { ok: true, message: '密码已更新，请重新登录' }), true;

  /* ---------- 文章 ---------- */
  if (p === '/api/posts') {
    if (method === 'GET') {
      const list = POSTS
        .slice()
        .sort((a, b) => (!!b.pinned - !!a.pinned) || (a.date < b.date ? 1 : -1))
        .map((x) => {
          const o = Object.assign({}, x);
          o.search = String(o.content || '').slice(0, 800);
          delete o.content;
          return o;
        });
      return json(res, { ok: true, posts: list }), true;
    }
    if (method === 'POST') {
      const body = await readBody(req);
      return json(res, { ok: true, post: body }, 201), true;
    }
  }
  let m = p.match(/^\/api\/posts\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const post = POSTS.find((x) => x.id === id);
    if (!post) return json(res, { error: '未找到该内容' }, 404), true;
    if (method === 'GET') return json(res, { ok: true, post }), true;
    if (method === 'PUT') { const body = await readBody(req); return json(res, { ok: true, post: body || post }), true; }
    if (method === 'DELETE') return json(res, { ok: true }), true;
  }
  m = p.match(/^\/api\/posts\/([^/]+)\/stats$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const s = STATS[id] || { views: 0, likes: 0 };
    if (method === 'POST') {
      const body = await readBody(req);
      if (body && body.action === 'like') s.likes += 1;
      if (body && body.action === 'views') s.views += 1;
    }
    return json(res, { ok: true, postId: id, stats: { likes: s.likes, views: s.views } }), true;
  }
  m = p.match(/^\/api\/posts\/([^/]+)\/comments$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (method === 'GET') {
      const list = COMMENTS.filter((c) => c.post_id === id && c.status === 'approved');
      return json(res, { ok: true, postId: id, comments: list }), true;
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const c = {
        id: 'c-' + Date.now(), post_id: id, author: (body && body.author) || '访客',
        content: (body && body.content) || '', date: new Date().toISOString().slice(0, 16).replace('T', ' '),
        status: SETTINGS.moderate_comments === '1' ? 'pending' : 'approved', parent_id: (body && body.parent_id) || null
      };
      COMMENTS.push(c);
      return json(res, { ok: true, comment: c }, 201), true;
    }
  }
  m = p.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
  if (m && method === 'DELETE') return json(res, { ok: true }), true;

  /* ---------- 评论（后台） ---------- */
  if (p === '/api/comments' && method === 'GET') {
    const status = q.get('status') || 'all';
    const list = COMMENTS.filter((c) => status === 'all' || c.status === status);
    return json(res, { ok: true, comments: list }), true;
  }
  m = p.match(/^\/api\/comments\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const c = COMMENTS.find((x) => x.id === id);
    if (!c) return json(res, { error: '评论不存在' }, 404), true;
    if (method === 'DELETE') return json(res, { ok: true }), true;
    const body = await readBody(req);
    if (body && body.status) c.status = body.status;
    return json(res, { ok: true }), true;
  }

  /* ---------- 媒体 ---------- */
  if (p === '/api/media') {
    if (method === 'GET') return json(res, { ok: true, media: MEDIA }), true;
    if (method === 'POST') return json(res, { ok: true, media: MEDIA[0] }, 201), true;
  }
  if (p === '/api/media/upload-url' && method === 'POST') {
    return json(res, { ok: true, uploadUrl: '/demo/upload-noop', publicUrl: '/demo/cover-1.svg', key: 'media/demo.svg', contentType: 'image/svg+xml', expiresIn: 3600 }), true;
  }
  m = p.match(/^\/api\/media\/([^/]+)$/);
  if (m && method === 'DELETE') return json(res, { ok: true }), true;

  /* ---------- 音乐 ---------- */
  if (p === '/api/music') {
    if (method === 'GET') return json(res, { ok: true, music: MUSIC }), true;
    if (method === 'POST') return json(res, { ok: true, track: MUSIC[0] }, 201), true;
  }
  if (p === '/api/music/upload-url' && method === 'POST') {
    return json(res, { ok: true, uploadUrl: '/demo/upload-noop', publicUrl: '/demo/audio/1.wav', key: 'music/demo.wav', contentType: 'audio/wav', expiresIn: 3600 }), true;
  }
  m = p.match(/^\/api\/music\/([^/]+)$/);
  if (m) {
    if (method === 'DELETE') return json(res, { ok: true }), true;
    return json(res, { ok: true }), true;
  }

  /* ---------- 站点设置 ---------- */
  if (p === '/api/settings') {
    if (method === 'GET') return json(res, { ok: true, settings: SETTINGS }), true;
    const body = await readBody(req);
    if (body && typeof body === 'object') Object.assign(SETTINGS, body);
    return json(res, { ok: true, saved: body ? Object.keys(body).length : 0 }), true;
  }

  /* ---------- 统计趋势 ---------- */
  if (p === '/api/stats/trend' && method === 'GET') {
    const days = Math.min(Math.max(parseInt(q.get('days') || '30', 10) || 30, 1), 90);
    return json(res, { ok: true, trend: buildTrend(days) }), true;
  }

  /* ---------- AI（演示环境假装可用，便于截图展示入口） ---------- */
  if (p === '/api/ai/ping' && method === 'GET') return json(res, { ok: true }), true;
  if (p === '/api/ai/summary') {
    if (method === 'GET') return json(res, { ok: true, summary: '', cached: false }), true;
    return json(res, { ok: true, summary: AI.summary, cached: false }), true;
  }
  if (p === '/api/ai/assist' && method === 'POST') {
    const body = await readBody(req);
    const key = body && body.action === 'title' ? 'title' : (body && body.action === 'translate' ? 'translate' : 'polish');
    return json(res, { ok: true, result: AI.assist[key] }), true;
  }
  if (p === '/api/ai/comments' && method === 'POST') {
    const body = await readBody(req);
    if (body && body.action === 'screen') {
      return json(res, { ok: true, spam: true, reason: '内容包含站外联系方式与代刷推广话术，与文章主题无关' }), true;
    }
    return json(res, { ok: true, summary: AI.comments, cached: false }), true;
  }

  /* ---------- 产物 ---------- */
  if (p === '/api/feed.xml' || p === '/feed.xml') {
    const items = POSTS.filter((x) => x.status !== 'draft').map((x) =>
      `<item><title>${x.title}</title><link>/posts/${x.id}/</link><guid isPermaLink="false">${x.id}</guid><pubDate>${x.date}</pubDate></item>`
    ).join('');
    return send(res, Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Qingyu'Blog</title>${items}</channel></rss>`), 'application/rss+xml; charset=utf-8'), true;
  }
  if (p === '/api/sitemap.xml' || p === '/sitemap.xml') {
    const urls = ['/', '/about', '/archive', '/tags', '/guestbook'].concat(POSTS.map((x) => '/posts/' + x.id + '/'))
      .map((u) => `<url><loc>${u}</loc></url>`).join('');
    return send(res, Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><urlset>${urls}</urlset>`), 'application/xml; charset=utf-8'), true;
  }
  if (p === '/api/site-files') return json(res, { ok: true, files: [] }), true;

  return false;
}

function send(res, buf, type, status = 200, extra) {
  res.writeHead(status, Object.assign({
    'Content-Type': type,
    'Content-Length': buf.length
  }, SECURITY_HEADERS, extra || {}));
  res.end(buf);
  return true;
}

function serveStatic(req, res, url) {
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  let file = path.join(PUBLIC_DIR, rel || 'index.html');
  // 防目录穿越
  if (!file.startsWith(PUBLIC_DIR)) return send(res, Buffer.from('Forbidden'), 'text/plain; charset=utf-8', 403);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // SPA 回退：无扩展名的干净路径交给 index.html
    if (/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
      return send(res, Buffer.from('Not Found'), 'text/plain; charset=utf-8', 404);
    }
    file = path.join(PUBLIC_DIR, 'index.html');
  }
  const buf = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  return send(res, buf, MIME[ext] || 'application/octet-stream');
}

export function createDemoServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const p = url.pathname;

      // 演示配图 / 音频
      if (p.startsWith('/demo/')) {
        if (IMAGES[p]) return send(res, Buffer.from(IMAGES[p]), 'image/svg+xml', 200, { 'Cache-Control': 'public, max-age=3600' });
        if (/^\/demo\/audio\/\d+\.wav$/.test(p)) {
          return send(res, demoAudio(p.replace(/\D/g, '')), 'audio/wav', 200, { 'Cache-Control': 'public, max-age=3600' });
        }
        if (p === '/demo/upload-noop') return send(res, Buffer.from(''), 'text/plain; charset=utf-8', 200);
        return send(res, Buffer.from('Not Found'), 'text/plain; charset=utf-8', 404);
      }

      // 接口
      if (p === '/api' || p.startsWith('/api/')) {
        const handled = await handleApi(req, res, url);
        if (handled === true) return;
        return json(res, { ok: false, error: 'Not Found' }, 404);
      }

      // 静态资源
      return serveStatic(req, res, url);
    } catch (e) {
      if (!res.headersSent) json(res, { error: 'demo server error: ' + (e && e.message) }, 500);
      else try { res.end(); } catch (e2) {}
    }
  });
}

/** 直接运行本文件时启动服务器并打印地址 */
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 8788;
  const server = createDemoServer();
  server.listen(port, '127.0.0.1', () => {
    console.log('demo server → http://127.0.0.1:' + port + '/');
  });
}
