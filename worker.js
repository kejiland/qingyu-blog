/* ============================================================
 * 轻语博客 · Cloudflare Workers 入口
 * ------------------------------------------------------------
 * 职责：
 *   · /api/posts 与 /api/posts/:id → Cloudflare D1 存储 API
 *   · 其余请求 → 静态资源（由 wrangler.workers.toml [assets] 绑定提供）
 * 部署：npx wrangler deploy
 * ============================================================ */
import { handleSearch } from './functions/_lib/search.js';
import { handlePostRelations } from './functions/_lib/relations.js';
import { handlePopular } from './functions/_lib/popular.js';
import { handlePostAnalytics } from './functions/_lib/analytics.js';
import { handlePosts, handlePostId, handleFeed, handleComments, handleCommentId, handleSitemap, handleSiteFiles, handleStats, handleAdminSetup, handleAdminLogin, handleAdminLogout, getCorsHeaders, securityHeaders, handleCommentsList, handleCommentUpdate, handleCommentDeleteGlobal, handleCommentLike, handleMedia, handleMediaId, handleSettings, handleAuditLog, handleTags, handleStatsSources, handleHealth, handleCommentsBulk, handleAdminPassword, handleStatsTrend, handleErrorReport, handleErrorsAdmin, handlePreviewLink, handlePreviewGet, handleWebmention, handleWebmentionList, handleWebmentionsAdmin, publishScheduledPosts, handlePostRevisions, handlePostRevision, handlePostRevisionRestore, dbFirst } from './functions/_lib/api-core.js';
import { onRequest as aiPing } from './functions/api/ai/ping.js';
import { onRequest as aiSummary } from './functions/api/ai/summary.js';
import { onRequest as aiAssist } from './functions/api/ai/assist.js';
import { onRequest as aiComments } from './functions/api/ai/comments.js';
import { handleMusic, handleMusicId, handleMusicUploadUrl } from './functions/_lib/music.js';
import { handleBackups, handleBackupId, handleBackupRestore, createBackup } from './functions/_lib/backup.js';
import { handleSubscribe, handleSubscribeConfirm, handleUnsubscribe, handleSubscribersAdmin, handleSubscriberId, handleSubscriberBroadcast, processMailOutbox } from './functions/_lib/subscribe.js';
import { handleOgUploadUrl } from './functions/_lib/og.js';
import { handleMediaUploadUrl, deleteMediaObject } from './functions/_lib/media.js';

/** 已知的前端路由：只有这些路径才用 200 返回 SPA 外壳，其余无扩展名路径按 404 返回 */
function isKnownSpaRoute(pathname) {
  return pathname === '/' ||
    /^\/(archive|tags|categories|history|links|about|guestbook|popular|subscribe|series|write)\/?$/.test(pathname) ||
    /^\/posts\/[^/]+\/?$/.test(pathname) ||
    /^\/posts\/[^/]+\/edit\/?$/.test(pathname) ||
    /^\/series\/[^/]+\/?$/.test(pathname) ||
    /^\/preview\/[^/]+\/?$/.test(pathname) ||
    /^\/authors(\/[^/]+)?\/?$/.test(pathname) ||
    pathname.indexOf('/admin') === 0;
}

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

  async scheduled(event, env) {
    try {
      const now = event && event.scheduledTime ? event.scheduledTime : Date.now();
      const result = await publishScheduledPosts(env, now);
      if (result && result.published) {
        console.log('[cron] scheduled posts published:', result.published, result.ids.join(','));
      }
      const mail = await processMailOutbox(env, 20);
      if (mail && (mail.sent || mail.failed)) console.log('[cron] subscriber mail:', mail.sent, mail.failed);
      if (event && event.cron === '0 19 * * *') {
        const backup = await createBackup(env, 'auto');
        console.log('[cron] daily backup created:', backup.id, backup.size);
      }
    } catch (e) {
      console.error('[cron] scheduled publishing failed:', e && e.message, e && e.stack);
    }
  },

  async handle(request, env) {
    const url = new URL(request.url);

    // API 路由
    if (url.pathname === '/api/popular') {
      return handlePopular(request, env);
    }
    if (url.pathname === '/api/search') {
      return handleSearch(request, env);
    }
    if (url.pathname === '/api/posts') {
      return handlePosts(request, env);
    }
    if (url.pathname === '/api/subscribe') {
      return handleSubscribe(request, env);
    }
    if (url.pathname === '/api/subscribe/confirm') {
      return handleSubscribeConfirm(request, env);
    }
    if (url.pathname === '/api/subscribe/unsubscribe') {
      return handleUnsubscribe(request, env);
    }
    if (url.pathname === '/api/admin/og-upload-url') {
      return handleOgUploadUrl(request, env);
    }
    if (url.pathname === '/api/admin/subscribers') {
      return handleSubscribersAdmin(request, env);
    }
    if (url.pathname === '/api/admin/subscribers/broadcast') {
      return handleSubscriberBroadcast(request, env);
    }
    let subscriberMatch = url.pathname.match(/^\/api\/admin\/subscribers\/([^/]+)$/);
    if (subscriberMatch) {
      return handleSubscriberId(request, env, decodeURIComponent(subscriberMatch[1]));
    }
    if (url.pathname === '/api/admin/backups') {
      return handleBackups(request, env);
    }
    let backupMatch = url.pathname.match(/^\/api\/admin\/backups\/([^/]+)\/restore$/);
    if (backupMatch) {
      return handleBackupRestore(request, env, decodeURIComponent(backupMatch[1]));
    }
    backupMatch = url.pathname.match(/^\/api\/admin\/backups\/([^/]+)$/);
    if (backupMatch) {
      return handleBackupId(request, env, decodeURIComponent(backupMatch[1]));
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
    if (url.pathname === '/api/admin/post-analytics') {
      return handlePostAnalytics(request, env);
    }
    if (url.pathname === '/api/admin/password') {
      return handleAdminPassword(request, env);
    }
    if (url.pathname === '/api/comments') {
      return handleCommentsList(request, env);
    }
    if (url.pathname === '/api/errors') {
      return handleErrorReport(request, env);
    }
    if (url.pathname === '/api/preview') {
      return handlePreviewGet(request, env);
    }
    if (url.pathname === '/api/webmention') {
      return request.method === 'GET' ? handleWebmentionList(request, env) : handleWebmention(request, env);
    }
    if (url.pathname === '/api/admin/webmentions') {
      return handleWebmentionsAdmin(request, env, null);
    }
    let wmMatch = url.pathname.match(/^\/api\/admin\/webmentions\/([^/]+)$/);
    if (wmMatch) {
      return handleWebmentionsAdmin(request, env, decodeURIComponent(wmMatch[1]));
    }
    if (url.pathname === '/api/admin/preview-link') {
      return handlePreviewLink(request, env);
    }
    if (url.pathname === '/api/admin/errors') {
      return handleErrorsAdmin(request, env);
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
    let cb = url.pathname.match(/^\/api\/admin\/comments\/bulk$/);
    if (cb) {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      return handleCommentsBulk(request, env);
    }
    let hc = url.pathname.match(/^\/api\/admin\/health$/);
    if (hc) {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      return handleHealth(request, env);
    }
    let ss = url.pathname.match(/^\/api\/admin\/stats\/sources$/);
    if (ss) {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      return handleStatsSources(request, env);
    }
    let tg = url.pathname.match(/^\/api\/admin\/tags$/);
    if (tg) {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      return handleTags(request, env);
    }
    let au = url.pathname.match(/^\/api\/admin\/audit$/);
    if (au) {
      if (request.method === 'OPTIONS') return corsPreflight(request, env);
      return handleAuditLog(request, env);
    }
    let cl = url.pathname.match(/^\/api\/comments\/([^/]+)\/like$/);
    if (cl) {
      return handleCommentLike(request, env, decodeURIComponent(cl[1]));
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
        const row = env && env.DB ? await dbFirst(env.DB, 'SELECT url, thumb_url FROM media WHERE id = ?', mid).catch(() => null) : null;
        if (row && row.url) { try { await deleteMediaObject(env, row.url, row.thumb_url || ''); } catch (e) { /* R2 删除失败不阻塞 */ } }
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
    let match = url.pathname.match(/^\/api\/posts\/([^/]+)\/revisions\/([^/]+)\/restore$/);
    if (match) {
      return handlePostRevisionRestore(request, env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    }
    match = url.pathname.match(/^\/api\/posts\/([^/]+)\/revisions\/([^/]+)$/);
    if (match) {
      return handlePostRevision(request, env, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
    }
    match = url.pathname.match(/^\/api\/posts\/([^/]+)\/revisions$/);
    if (match) {
      return handlePostRevisions(request, env, decodeURIComponent(match[1]));
    }
    match = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments\/([^/]+)$/);
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
    match = url.pathname.match(/^\/api\/posts\/([^/]+)\/relations$/);
    if (match) {
      return handlePostRelations(request, env, decodeURIComponent(match[1]));
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
      // _redirects 会把未知路径也映射成 index.html(200)，因此这里按「HTML 外壳 + 无扩展名 + 非已知路由」判定为 404
      const reqHasExt = /\.[a-zA-Z0-9]+$/.test(url.pathname);
      const isHtmlShell = /text\/html/i.test(res.headers.get('content-type') || '');
      let spaNotFound = isHtmlShell && !reqHasExt && !isKnownSpaRoute(url.pathname);
      // SPA 回退：干净路径 / 首页 / 归档 / 关于 / 标签 / /posts/<别名>/ /admin / /write，
      // 以及 /api 以外的任何无扩展名路径，都返回 index.html（由前端 app.js 依据 pathname 渲染）。
      // 仅对 GET/HEAD 回退：POST 等非幂等方法拿到 HTML 会误导调用方。
      if (res.status === 404 && (request.method === 'GET' || request.method === 'HEAD') && !/\.[a-zA-Z0-9]+$/.test(url.pathname)) {
        res = await env.ASSETS.fetch(new Request(url.origin + '/', request));
        if (!isKnownSpaRoute(url.pathname)) spaNotFound = true;
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
        const immutablePath = /^\/fonts\/|^\/flags\/|^\/libs\/smoji\/|^\/icons\//.test(url.pathname);
        if (url.pathname === '/sw.js') {
          headers.set('Cache-Control', 'no-cache');
          headers.set('Service-Worker-Allowed', '/');
        } else if (url.pathname === '/manifest.webmanifest') {
          headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
          headers.set('Cache-Control', 'public, max-age=3600');
        } else if (hasExt && request.method === 'GET') {
          headers.set('Cache-Control', versioned || immutablePath
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600, stale-while-revalidate=86400');
        } else if (request.method === 'GET') {
          headers.set('Cache-Control', 'no-cache');
        }
        return new Response(res.body, { status: spaNotFound ? 404 : res.status, statusText: spaNotFound ? 'Not Found' : res.statusText, headers });
      } catch (e) {
        return res;
      }
    }
    return new Response('Not Found', { status: 404 });
  }
};
