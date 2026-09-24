/* ============================================================
 * 轻语博客 · Cloudflare Workers 入口
 * ------------------------------------------------------------
 * 职责：
 *   · /api/posts 与 /api/posts/:id → Cloudflare D1 存储 API
 *   · 其余请求 → 静态资源（由 wrangler.workers.toml [assets] 绑定提供）
 * 部署：npx wrangler deploy
 * ============================================================ */
import { handlePosts, handlePostId, handleFeed, handleComments, handleCommentId, handleSitemap, handleSiteFiles, handleStats, handleAdminSetup, handleAdminLogin, handleAdminLogout, getCorsHeaders, securityHeaders, handleCommentsList, handleCommentUpdate, handleCommentDeleteGlobal, handleMedia, handleMediaId, handleSettings, handleAdminPassword, handleStatsTrend, dbFirst } from './functions/_lib/api-core.js';
import { onRequest as aiPing } from './functions/api/ai/ping.js';
import { onRequest as aiSummary } from './functions/api/ai/summary.js';
import { onRequest as aiAssist } from './functions/api/ai/assist.js';
import { onRequest as aiComments } from './functions/api/ai/comments.js';
import { handleMusic, handleMusicId, handleMusicUploadUrl } from './functions/_lib/music.js';
import { handleMediaUploadUrl, deleteMediaObject } from './functions/_lib/media.js';

export default {
  async fetch(request, env) {
    try {
      return await this.handle(request, env);
    } catch (e) {
      // 全局兜底：任何未捕获异常都返回 JSON 错误。
      // 生产环境不把内部错误信息（可能含 SQL/路径细节）回传给客户端，详情只打在服务端日志。
      // 带上 CORS 头，避免跨域调用方因缺 ACAO 而读不到错误体（仅用于错误提示，不泄露内部细节）。
      console.error('[worker] unhandled error:', e && e.message, e && e.stack);
      return new Response(JSON.stringify({
        ok: false,
        error: '服务端内部错误'
      }), {
        status: 500,
        headers: Object.assign(
          { 'Content-Type': 'application/json; charset=utf-8' },
          getCorsHeaders(request, env),
          securityHeaders()
        )
      });
    }
  },

  async handle(request, env) {
    const url = new URL(request.url);

    // API 路由
    if (url.pathname === '/api/posts') {
      return handlePosts(request, env);
    }
    if (url.pathname === '/api/admin/setup') {
      return handleAdminSetup(request, env);
    }
    if (url.pathname === '/api/admin/login') {
      return handleAdminLogin(request, env);
    }
    if (url.pathname === '/api/admin/logout') {
      return handleAdminLogout(request, env);
    }
    if (url.pathname === '/api/admin/password') {
      return handleAdminPassword(request, env);
    }
    if (url.pathname === '/api/comments') {
      return handleCommentsList(request, env);
    }
    if (url.pathname === '/api/media') {
      return handleMedia(request, env);
    }
    if (url.pathname === '/api/media/upload-url') {
      return handleMediaUploadUrl(request, env);
    }
    if (url.pathname === '/api/settings') {
      return handleSettings(request, env);
    }
    if (url.pathname === '/api/stats/trend') {
      return handleStatsTrend(request, env);
    }
    let cm = url.pathname.match(/^\/api\/comments\/([^/]+)$/);
    if (cm) {
      if (request.method === 'DELETE') return handleCommentDeleteGlobal(request, env, decodeURIComponent(cm[1]));
      return handleCommentUpdate(request, env, decodeURIComponent(cm[1]));
    }
    let mm = url.pathname.match(/^\/api\/media\/([^/]+)$/);
    if (mm) {
      const mid = decodeURIComponent(mm[1]);
      // 删除媒体：先删 R2 对象（若 url 是本站 media/ 前缀），再删 D1 元数据
      if (request.method === 'DELETE') {
        const row = env && env.DB ? await dbFirst(env.DB, 'SELECT url FROM media WHERE id = ?', mid).catch(() => null) : null;
        if (row && row.url) { try { await deleteMediaObject(env, row.url); } catch (e) { /* R2 删除失败不阻塞 */ } }
      }
      return handleMediaId(request, env, mid);
    }
    if (url.pathname === '/api/feed.xml') {
      return handleFeed(request, env);
    }
    if (url.pathname === '/api/sitemap.xml') {
      return handleSitemap(request, env);
    }
    if (url.pathname === '/sitemap.xml') {
      return handleSitemap(request, env);
    }
    if (url.pathname === '/feed.xml') {
      return handleFeed(request, env);
    }
    let match = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
    if (match) {
      return handleCommentId(request, env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    }
    match = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
    if (match) {
      return handleComments(request, env, decodeURIComponent(match[1]));
    }
    match = url.pathname.match(/^\/api\/posts\/([^/]+)\/stats$/);
    if (match) {
      return handleStats(request, env, decodeURIComponent(match[1]));
    }
    match = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (match) {
      return handlePostId(request, env, decodeURIComponent(match[1]));
    }
    match = url.pathname.match(/^\/api\/site-files\/([^/]+)$/);
    if (match) {
      return handleSiteFiles(request, env, decodeURIComponent(match[1]));
    }
    if (url.pathname === '/api/site-files') {
      return handleSiteFiles(request, env);
    }
    // AI（Workers AI；未绑定/关闭时由 ai lib 返回 404，前端自动隐藏）
    if (url.pathname === '/api/ai/ping') {
      return aiPing({ request, env });
    }
    if (url.pathname === '/api/ai/summary') {
      return aiSummary({ request, env });
    }
    if (url.pathname === '/api/ai/assist') {
      return aiAssist({ request, env });
    }
    if (url.pathname === '/api/ai/comments') {
      return aiComments({ request, env });
    }
    // 音乐（播放列表读取公开；上传需管理会话，R2 直传）
    if (url.pathname === '/api/music/upload-url') {
      return handleMusicUploadUrl(request, env);
    }
    // 一次性诊断：定位「浏览器直传 R2 预检失败」到底是哪一层。
    // 只回显非敏感配置 + 主动对 R2 S3 端点发一次 OPTIONS，绝不回传任何密钥。
    if (url.pathname === '/api/music/diag') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
      const rawEndpoint = String(env.R2_ENDPOINT || '');
      let endpointHost = '';
      try { endpointHost = new URL(rawEndpoint).host; } catch (e) { endpointHost = '(解析失败)'; }
      const musicBucket = String(env.R2_BUCKET || '');
      const probe = async (origin) => {
        const target = rawEndpoint.replace(/\/+$/, '') + '/' + musicBucket + '/diag-probe.txt';
        try {
          const r = await fetch(target, {
            method: 'OPTIONS',
            headers: {
              'Origin': origin,
              'Access-Control-Request-Method': 'PUT',
              'Access-Control-Request-Headers': 'content-type'
            }
          });
          return {
            status: r.status,
            acao: r.headers.get('Access-Control-Allow-Origin'),
            acam: r.headers.get('Access-Control-Allow-Methods'),
            acah: r.headers.get('Access-Control-Allow-Headers')
          };
        } catch (e) {
          return { error: String((e && e.message) || e) };
        }
      };
      const origin = 'https://www.2024921.xyz';
      // 附加：真实走一遍「签发 → PUT」，不依赖浏览器，用来判定签名本身是否被 R2 接受。
      // 只上传一个 20 字节探针对象到音乐桶，随后立即删除，不触碰任何用户数据。
      let signedRoundTrip = null;
      if (request.method === 'POST' && url.searchParams.get('probe') === '1') {
        try {
          const { presignPut, r2DeleteObject } = await import('./functions/_lib/music.js');
          const probeKey = 'music/_diag/probe-' + Date.now() + '.txt';
          const probeType = 'text/plain';
          const signedUrl = await presignPut(env, probeKey, 300, null, probeType);
          const putRes = await fetch(signedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': probeType },
            body: 'diag'
          });
          const putBody = await putRes.text().catch(() => '');
          let cleaned = false;
          try { await r2DeleteObject(env, probeKey, null); cleaned = true; } catch (e) { cleaned = false; }
          signedRoundTrip = {
            key: probeKey,
            putStatus: putRes.status,
            putBody: putBody.slice(0, 400),
            deleted: cleaned,
            signedHost: (() => { try { return new URL(signedUrl).host; } catch (e) { return ''; } })(),
            signedPath: (() => { try { return new URL(signedUrl).pathname; } catch (e) { return ''; } })(),
            signedHeaders: (() => { try { return new URL(signedUrl).searchParams.get('X-Amz-SignedHeaders'); } catch (e) { return ''; } })()
          };
        } catch (e) {
          signedRoundTrip = { error: String((e && e.message) || e) };
        }
      }
      return new Response(JSON.stringify({
        ok: true,
        endpointHost: endpointHost,
        endpointHasPath: (() => { try { return new URL(rawEndpoint).pathname; } catch (e) { return '(无效)'; } })(),
        musicBucket: musicBucket,
        musicPublicBase: String(env.R2_PUBLIC_BASE || ''),
        mediaBucket: String(env.R2_MEDIA_BUCKET || ''),
        mediaPublicBase: String(env.R2_MEDIA_PUBLIC_BASE || ''),
        hasCredentials: !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY),
        // 直接问 R2：对 S3 端点的 PUT 预检，它回不回 CORS 头
        preflightAgainstS3Endpoint: await probe(origin)
        , signedRoundTrip: signedRoundTrip
      }, null, 2), {
        status: 200,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, getCorsHeaders(request, env))
      });
    }
    if (url.pathname === '/api/music') {
      return handleMusic(request, env);
    }
    mm = url.pathname.match(/^\/api\/music\/([^/]+)$/);
    if (mm) {
      return handleMusicId(request, env, decodeURIComponent(mm[1]));
    }

    // 未知 /api/* 路径：返回 JSON 404，绝不回退到 index.html（避免 API 调用方收到 HTML）
    if (url.pathname === '/api' || url.pathname.indexOf('/api/') === 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Not Found' }), {
        status: 404,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, securityHeaders())
      });
    }

    // 静态资源（index.html / style.css / app.js / …）
    if (env.ASSETS) {
      let res = await env.ASSETS.fetch(request);
      // SPA 回退：干净路径 / 首页 / 归档 / 关于 / 标签 / /posts/<别名>/ /admin / /write，
      // 以及 /api 以外的任何无扩展名路径，都返回 index.html（由前端 app.js 依据 pathname 渲染）。
      // 仅对 GET/HEAD 回退：POST 等非幂等方法拿到 HTML 会误导调用方。
      if (res.status === 404 && (request.method === 'GET' || request.method === 'HEAD') && !/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
        res = await env.ASSETS.fetch(new Request(url.origin + '/', request));
      }
      // 性能：给静态资源加缓存头，避免每次刷新全量重下大文件（app.js 184KB / style.css 94KB）。
      //  · 带扩展名的静态文件：1 小时强缓存 + 1 天 SWR（部署后 CF_ZONE_ID purge 立即生效，无陈旧感）
      //  · 无扩展名（HTML SPA 入口）：no-cache（每次重新验证，ETag 命中即 304，体积极小）
      // 安全：所有静态响应统一附带安全响应头（nosniff / CSP / frame 防护等）。
      try {
        const headers = new Headers(res.headers);
        Object.keys(securityHeaders()).forEach(function (k) { headers.set(k, securityHeaders()[k]); });
        const hasExt = /\.[a-zA-Z0-9]+$/.test(url.pathname);
        // 版本化资源（style.css?v=…、app.js?v=…）与字体/图标等不可变资源，可放心一年强缓存；
        // 其余扩展名静态文件保持 1 小时 + SWR（部署后仍能快速生效）。
        const versioned = url.search && url.search.indexOf('v=') === 1;
        const immutablePath = /^\/fonts\/|^\/flags\/|^\/libs\/smoji\//.test(url.pathname);
        if (hasExt && request.method === 'GET') {
          headers.set('Cache-Control', versioned || immutablePath
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600, stale-while-revalidate=86400');
        } else if (request.method === 'GET') {
          headers.set('Cache-Control', 'no-cache');
        }
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      } catch (e) {
        return res;
      }
    }
    return new Response('Not Found', { status: 404 });
  }
};
