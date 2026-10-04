/* ============================================================
 * 轻语博客 · 云端 API 核心（Cloudflare D1 存储）
 * ------------------------------------------------------------
 * 被两处复用：
 *   · Cloudflare Pages Functions（functions/api/posts*.js）
 *   · Cloudflare Workers（worker.js）
 * 数据持久化到 D1（SQLite）：每篇文章一行；评论 / 统计 / 管理员认证各为其表。
 * 所有接口的请求/响应结构与 KV 版本保持一致，前端与 seed.js 无需改动。
 * ============================================================ */

const DB_ERR = '数据库未配置：请创建并绑定名为 DB 的 D1 数据库';

/* ---------- 缓存策略（边缘缓存，降低 D1 压力与首字节延迟） ----------
 * 只读接口内容更新极少，可放心缓存；写接口一律 no-store，避免缓存到突变响应。 */
const READ_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';
const FEED_CACHE = 'public, s-maxage=300, stale-while-revalidate=600';
const NO_CACHE = 'no-store';

/* 点赞频控：每 IP 每分钟上限（防接口被刷量） */
const LIKE_CAP = 10;
/* 点赞去重标记的 TTL（秒）：标记只需覆盖「防重复点赞」的合理窗口，
 * 带 TTL 可避免 KV 按 (IP, 文章) 组合无限增长。 */
const LIKE_DEDUP_TTL = 60 * 60 * 24 * 30;
/* 浏览计数频控：每 IP 每分钟上限。views 此前完全无限流，
 * 单机脚本即可把阅读量刷到上限；这里与点赞同口径做限流。 */
const VIEW_CAP = 30;
/* 浏览去重窗口（秒）：同一 IP 对同一篇文章在该窗口内只计一次，
 * 避免刷新页面重复累加（前端 sessionStorage 去重可被直接调 API 绕过）。 */
const VIEW_DEDUP_TTL = 3600;
/* Cloudflare 边缘缓存标签（写操作后主动清缓存，保证发布即生效）
 * 仅当配置了 CF_API_TOKEN + CF_ZONE_ID 才真正清缓存，否则依赖 s-maxage 自然过期。 */
const TAG_POSTS = 'posts';
const TAG_FEED = 'feed';
const TAG_SITEMAP = 'sitemap';
async function purgeTags(env, tags) {
  const token = env && env.CF_API_TOKEN;
  const zone = env && env.CF_ZONE_ID;
  if (!token || !zone || !tags || !tags.length) return;
  try {
    await fetch('https://api.cloudflare.com/client/v4/zones/' + zone + '/cache/purge', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: tags })
    });
  } catch (e) { console.warn('[cache] purge failed:', e && e.message); }
}

/* ---------- 通用 DB 辅助 ---------- */
export async function dbAll(db, sql, ...params) {
  const r = await db.prepare(sql).bind(...params).all();
  return (r && r.results) || [];
}
export async function dbFirst(db, sql, ...params) {
  return await db.prepare(sql).bind(...params).first();
}
export async function dbRun(db, sql, ...params) {
  await db.prepare(sql).bind(...params).run();
}
/** 原子批量执行：全部成功或全部回滚（D1 batch）。stmts: [{sql, params}] */
export async function dbBatch(db, stmts) {
  if (!Array.isArray(stmts) || !stmts.length) return;
  await db.batch(stmts.map((s) => db.prepare(s.sql).bind(...(s.params || []))));
}

/* ---------- CORS：仅放行本站来源，未配置时 fail-closed ----------
 * 同源请求（无 Origin 头）不加 ACAO；跨站请求：
 *   · 白名单 = SITE_URL（配置时）+ 当前请求自身 origin；
 *   · 只有白名单命中的来源才回写 ACAO，否则不返回 ACAO——**未配置 SITE_URL 时同样
 *     fail-closed**，绝不回显任意来源（旧行为等价于 *，会把 /api/comments 等
 *     公开数据暴露给任意站点脚本；同源页面不受影响，同源请求浏览器不做 CORS 校验）。
 * 配合 Bearer Token（非凭据请求），即便跨站也无法携带会话。 */
export function getCorsHeaders(request, env) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Setup-Key',
    'Vary': 'Origin'   // 跨域缓存按 Origin 区分副本，避免命中错误/缺失的 ACAO 响应
  };
  const origin = request && request.headers && request.headers.get ? request.headers.get('Origin') : null;
  if (!origin) return h; // 同源，无需 CORS 头
  const allowed = [];
  if (env && env.SITE_URL) allowed.push(String(env.SITE_URL).replace(/\/+$/, ''));
  try { const self = new URL(request.url).origin; if (allowed.indexOf(self) < 0) allowed.push(self); } catch (e) {}
  // 仅白名单（SITE_URL + 当前请求自身 origin）才回写 ACAO。
  // 未配置 SITE_URL 时 **fail-closed**：不回 ACE，跨站读取被浏览器拦截。
  // （旧行为是回显任意 Origin，等价于 `*`，会把 /api/comments 等公开数据
  //   暴露给任意站点脚本；同源页面不受影响——同源请求浏览器不做 CORS 校验。）
  if (allowed.indexOf(origin) >= 0) {
    h['Access-Control-Allow-Origin'] = origin;
  }
  return h;
}

/* ---------- 安全响应头 ----------
 * 同源承载管理后台，任何一处 XSS 都会放大影响；统一加最小安全头。
 * CSP 说明：站点为「零构建 + 大量内联脚本/样式 + 广告动态注入」，无法做强 script-src，
 * 故聚焦可落地且不破坏功能的防护：禁 object/plugin、禁点击劫持(frame-ancestors)、
 * 禁 base 标签注入、限制 form 提交目标。HTML 侧如要更强可后续引入 nonce 体系。
 * 注意：仅 Workers 部署（worker.js 走本函数）与 API 响应生效；
 * Pages 模式的纯静态资源由 Pages 托管直接返回，不经过本函数。 */
export function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data: https://cdn.jsdelivr.net",
      "connect-src 'self' https:",
      "frame-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ].join('; ')
  };
}

export function json(data, status = 200, request, env, extra) {
  const headers = Object.assign(
    { 'Content-Type': 'application/json; charset=utf-8' },
    getCorsHeaders(request, env),
    { 'Cache-Control': NO_CACHE },
    securityHeaders(),
    extra || {}
  );
  return new Response(JSON.stringify(data), { status, headers });
}

export function corsPreflight(request, env) {
  return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
}

/** 统一鉴权失败响应。
 *  有效会话仍处于 must_change 状态时返回 403 + 明确错误码，前端据此强制进入改密页，
 *  而不会误判为 token 过期并把唯一可用于改密的会话清掉。 */
export async function unauthorized(request, env) {
  const state = await adminAuthState(request, env).catch(() => null);
  if (state && state.authed && state.mustChange) {
    return json({
      error: '必须先修改初始密码，才能继续使用后台',
      code: 'PASSWORD_CHANGE_REQUIRED',
      mustChange: true
    }, 403, request, env);
  }
  return json({ error: '未授权：请先登录获取会话 token，并在请求头携带 Authorization: Bearer <token>' }, 401, request, env);
}

function normalizePostStatus(v) {
  return v === 'draft' || v === 'scheduled' ? v : 'published';
}
function normalizePublishAt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
export function normalizePost(p) {
  const out = p || {};
  const protectedPost = !!out.protected && out.enc && typeof out.enc === 'object';
  const status = normalizePostStatus(out.status);
  const publishAt = status === 'scheduled' ? normalizePublishAt(out.publishAt !== undefined ? out.publishAt : out.publish_at) : null;
  return {
    id: String(out.id || ''),
    title: String(out.title || '').trim(),
    date: String(out.date || ''),
    excerpt: String(out.excerpt || '').trim(),
    cover: String(out.cover || '').trim(),
    ogImage: String(out.ogImage || out.og_image || '').trim().slice(0, 1000),
    // 加密文章：正文存于 enc（AES-GCM 密文），content 恒为空，避免明文外泄
    content: protectedPost ? '' : String(out.content || ''),
    pinned: !!out.pinned,
    protected: !!out.protected,
    enc: protectedPost ? out.enc : null,
    category: String(out.category || '').trim(),
    series: String(out.series || '').trim().slice(0, 80),
    seriesOrder: Math.max(0, Math.floor(Number(out.seriesOrder || out.series_order) || 0)),
    status: status,
    publishAt: publishAt,
    tags: Array.isArray(out.tags)
      ? out.tags.map((t) => String(t).trim()).filter(Boolean)
      : String(out.tags || '').split(/[,，]/).map((t) => t.trim()).filter(Boolean)
  };
}

/** D1 行 → 文章对象（与 normalizePost 输出结构一致，便于上层共用） */
function postFromRow(r) {
  if (!r) return null;
  let tags = [];
  try { tags = r.tags ? JSON.parse(r.tags) : []; } catch (e) { tags = []; }
  let enc = null;
  if (r.enc) { try { enc = JSON.parse(r.enc); } catch (e) { enc = null; } }
  // 与 normalizePost 保持同一不变式：受保护文章的明文 content 永不出库。
  // 写入路径已保证 content 为空，但历史数据/手工 SQL 可能留下明文，
  // 在读边界再兜一层，避免 GET /api/posts/:id 泄漏受保护正文。
  const isProtected = !!(r.protected);
  return {
    id: String(r.id || ''),
    title: String(r.title || ''),
    date: String(r.date || ''),
    excerpt: String(r.excerpt || ''),
    cover: String(r.cover || ''),
    ogImage: String(r.og_image || ''),
    content: isProtected ? '' : String(r.content || ''),
    pinned: !!r.pinned,
    protected: isProtected,
    enc: enc,
    category: String(r.category || ''),
    series: String(r.series || ''),
    seriesOrder: Number(r.series_order) || 0,
    status: normalizePostStatus(r.status),
    publishAt: normalizePublishAt(r.publish_at),
    tags: tags
  };
}

/** 文章对象 → D1 插入参数（顺序与 posts 表列一致） */
function postToParams(p) {
  return [
    p.id, p.title, p.date, p.excerpt, p.content,
    p.cover || '',
    p.ogImage || '',
    p.pinned ? 1 : 0, p.protected ? 1 : 0,
    p.enc ? JSON.stringify(p.enc) : null,
    JSON.stringify(p.tags || []),
    p.category || '',
    p.series || '',
    p.seriesOrder || 0,
    normalizePostStatus(p.status),
    p.status === 'scheduled' ? normalizePublishAt(p.publishAt) : null
  ];
}

function isPublicPost(p) {
  return (p && (p.status || 'published')) === 'published';
}

function sortByDateDesc(posts) {
  return posts.slice().sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;   // 置顶靠前
    return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);   // 再按日期倒序
  });
}

/* ---------- RSS（feed.xml） ---------- */

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
/** RFC 822 日期（兼容 "YYYY-MM-DD" 与 "YYYY-MM-DD HH:mm"）
 *  纯日期按 UTC 解析，避免 +8 时区把 pubDate 显示成前一天 */
function rfc822(dateStr) {
  try {
    const s = String(dateStr || '').trim();
    let d;
    if (s.length <= 10) {
      d = new Date(s.slice(0, 10) + 'T00:00:00Z');
    } else {
      d = new Date(s.slice(0, 10) + 'T' + (s.slice(11, 16) || '00:00') + ':00');
    }
    return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
  } catch (e) { return new Date().toUTCString(); }
}

/** 由文章数组生成 RSS 2.0 XML（加密文章不进订阅源，避免密文/链接外泄） */
export function buildFeedXml(posts, siteUrl, opts) {
  const o = opts || {};
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const title = o.title || '轻语博客';
  const desc = o.description || '一个零依赖的轻量博客';
  const list = sortByDateDesc(posts).filter((p) => !p.protected && isPublicPost(p)).slice(0, o.maxItems || 20);
  const items = list.map((p) => {
    const link = base + '/posts/' + encodeURIComponent(p.id) + '/';
    const content = p.content || '';
    return [
      '<item>',
      `<title>${xmlEscape(p.title)}</title>`,
      `<link>${xmlEscape(link)}</link>`,
      `<guid isPermaLink="false">${xmlEscape(p.id)}</guid>`,
      `<pubDate>${rfc822(p.date)}</pubDate>`,
      `<description><![CDATA[${content.replace(/\]\]>/g, ']]&gt;')}]]></description>`,
      '</item>'
    ].join('');
  }).join('\n    ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(title)}</title>
    <link>${xmlEscape(base || 'https://blog.example')}</link>
    <description>${xmlEscape(desc)}</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>
`;
}

/** GET /api/feed.xml（RSS） */
export async function handleFeed(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  const siteUrl = env.SITE_URL || new URL(request.url).origin;
  const xml = buildFeedXml(await readPosts(env), siteUrl);
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': FEED_CACHE, 'Cache-Tag': TAG_FEED, ...getCorsHeaders(request, env), ...securityHeaders() }
  });
}

/* ---------- 文章读写 ---------- */

async function readPosts(env) {
  let rows = [];
  try { rows = await dbAll(env.DB, 'SELECT * FROM posts'); } catch (e) { rows = []; }
  if (rows.length) return rows.map(postFromRow);
  // D1 空表时回退到静态 public/posts.js 的默认文章，保证 RSS / Sitemap 不至于空白。
  // 但仅限「尚未接管」的新部署：一旦配置过管理员（写过 admin_auth），即视为作者已接管，
  // 返回空而非示例文章——否则作者删光全部文章后示例内容会「复活」进 RSS/Sitemap/首页。
  let hasAdmin = false;
  try {
    const a = await dbFirst(env.DB, 'SELECT 1 FROM admin_auth WHERE k = ?', ADMIN_AUTH_KEY);
    hasAdmin = !!a;
  } catch (e) { /* 读失败按未接管处理 */ }
  if (hasAdmin) return [];
  const staticPosts = await readStaticPosts(env);
  if (staticPosts.length) return staticPosts;
  return [];
}

/** 从静态资源目录读取 posts.js 并解析出文章数组（D1 空表时的兜底数据源） */
async function readStaticPosts(env) {
  if (!env || !env.ASSETS) return [];
  try {
    // ASSETS.fetch 按 pathname 取静态文件，host 无关（Pages/Workers 均注入 env.ASSETS）
    const res = await env.ASSETS.fetch(new Request('https://assets.local/posts.js'));
    if (!res.ok) return [];
    const src = await res.text();
    // posts.js 由 JSON.stringify 生成，是标准 JSON 数组：window.BLOG_POSTS = [ ... ];
    // 贪婪匹配到最后（避免嵌套数组 ["a","b"] 的首个 ] 提前截断）
    const m = /window\.BLOG_POSTS\s*=\s*(\[[\s\S]*\])\s*;?/.exec(src);
    if (!m) return [];
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr.map(normalizePost) : [];
  } catch (e) { return []; }
}

/** GET /api/posts（列表） · POST /api/posts（新建） */
export async function handlePosts(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const full = url.searchParams.get('full') === '1';
    const includeDrafts = full || url.searchParams.get('all') === '1';

    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const stFilter = String(url.searchParams.get('status') || '');
    const pageNum = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 0));
    const perNum = Math.min(100, Math.floor(Number(url.searchParams.get('per')) || 0));
    const paged = pageNum > 0 && perNum > 0;
    // all=1 / full=1 是后台接口：必须登录，可返回草稿（full=1 还返回正文）。
    // 公开的 GET /api/posts 仍只返回已发布摘要，且响应不区分管理员身份。
    if (includeDrafts && !(await isWriteAuthed(request, env))) return unauthorized(request, env);

    let all = sortByDateDesc(await readPosts(env));
    if (!includeDrafts) all = all.filter(isPublicPost);

    // 完整备份：正文/密文原样返回，禁止写进共享缓存。
    if (full) return json({ ok: true, posts: all }, 200, request, env, { 'Cache-Control': NO_CACHE });
    // 后台列表：服务端过滤 + 分页（不下发全量文章）
    if (paged) {
      if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
      let list = all;
      if (stFilter && stFilter !== 'all') list = list.filter((p) => (p.status || 'published') === stFilter);
      if (q) list = list.filter((p) => ((p.title || '') + ' ' + (Array.isArray(p.tags) ? p.tags.join(' ') : String(p.tags || ''))).toLowerCase().indexOf(q) >= 0);
      const total = list.length;
      const pages = Math.max(1, Math.ceil(total / perNum));
      const start = (pageNum - 1) * perNum;
      const rows = list.slice(start, start + perNum).map((p) => { const c = Object.assign({}, p); if (!c.protected && c.content) c.search = String(c.content).slice(0, 800); delete c.content; delete c.enc; return c; });
      return json({ ok: true, posts: rows, total: total, page: pageNum, per: perNum, pages: pages }, 200, request, env, { 'Cache-Control': NO_CACHE });
    }

    const summary = all.map((p) => {
      if (!p.protected) {
        const content = String(p.content || '');
        if (content) p.search = content.slice(0, 800);
      }
      delete p.content;
      delete p.enc;
      return p;
    });
    return json({ ok: true, posts: summary }, 200, request, env,
      includeDrafts ? { 'Cache-Control': NO_CACHE } : { 'Cache-Control': READ_CACHE, 'Cache-Tag': TAG_POSTS });
  }

  if (request.method === 'POST') {
    if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
    const body = await request.json().catch(() => null);
    const p = normalizePost(body);
    if (!p.id || !p.title) return json({ error: '缺少 id 或 title' }, 400, request, env);
    if (p.status === 'scheduled' && !p.publishAt) return json({ error: '定时发布缺少发布时间' }, 400, request, env);
    const exist = await dbFirst(env.DB, 'SELECT 1 FROM posts WHERE id = ?', p.id);
    if (exist) return json({ error: '已存在相同 id（' + p.id + '），请用 PUT 更新' }, 409, request, env);
    await dbRun(env.DB,
      'INSERT INTO posts (id,title,date,excerpt,content,cover,og_image,pinned,protected,enc,tags,category,series,series_order,status,publish_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ...postToParams(p));
    await recordPostRevision(env, p, 'create').catch(() => {});
    if ((p.status || 'published') === 'published') await queuePostNotifications(env, p).catch(() => {});
    await purgeTags(env, [TAG_POSTS, TAG_FEED, TAG_SITEMAP, 'post:' + p.id]);
    return json({ ok: true, post: p }, 201, request, env);
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}

/** GET/PUT/DELETE /api/posts/:id */
export async function handlePostId(request, env, id) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if ((request.method === 'PUT' || request.method === 'DELETE') && !(await isWriteAuthed(request, env))) return unauthorized(request, env);

  const exist = await dbFirst(env.DB, 'SELECT * FROM posts WHERE id = ?', id);

  if (request.method === 'GET') {
    const p = exist ? postFromRow(exist) : null;
    if (!p) return json({ error: '未找到该内容' }, 404, request, env);
    // 草稿只对作者可见：未登录（无写权限）时对外不可读，避免草稿全文泄漏
    if ((p.status === 'draft' || p.status === 'scheduled') && !(await isWriteAuthed(request, env))) {
      return json({ error: '未找到该内容' }, 404, request, env);
    }
    // 单篇详情可稍长缓存（含正文/密文），写操作会使缓存自然过期
    return json({ ok: true, post: p }, 200, request, env, { 'Cache-Control': READ_CACHE, 'Cache-Tag': TAG_POSTS + ',post:' + id });
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const p = normalizePost(body);
    p.id = id;
    // 编辑旧文时若未显式带日期，沿用数据库中的原日期，避免被“今天”覆盖导致排序跳到最新
    if (!p.date && exist && exist.date) p.date = String(exist.date);
    if (!p.title) return json({ error: '缺少 title' }, 400, request, env);
    if (p.status === 'scheduled' && !p.publishAt) return json({ error: '定时发布缺少发布时间' }, 400, request, env);
    await dbRun(env.DB,
      'INSERT INTO posts (id,title,date,excerpt,content,cover,og_image,pinned,protected,enc,tags,category,series,series_order,status,publish_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ' +
      'ON CONFLICT(id) DO UPDATE SET title=excluded.title,date=excluded.date,excerpt=excluded.excerpt,content=excluded.content,cover=excluded.cover,og_image=excluded.og_image,pinned=excluded.pinned,protected=excluded.protected,enc=excluded.enc,tags=excluded.tags,category=excluded.category,series=excluded.series,series_order=excluded.series_order,status=excluded.status,publish_at=excluded.publish_at',
      ...postToParams(p));
    await recordPostRevision(env, p, 'update').catch(() => {});
    const oldStatus = exist ? normalizePostStatus(exist.status) : '';
    if (oldStatus !== 'published' && (p.status || 'published') === 'published') await queuePostNotifications(env, p).catch(() => {});
    await purgeTags(env, [TAG_POSTS, TAG_FEED, TAG_SITEMAP, 'post:' + id]);
    return json({ ok: true, post: p }, 200, request, env);
  }

  if (request.method === 'DELETE') {
    if (!exist) return json({ error: '未找到该内容' }, 404, request, env);
    // 级联清理：评论 / 当前计数（点赞+浏览量）/ 文章本体 原子批次删除；
    // 每日聚合统计（stats_daily）单独尽力清理——它是历史趋势数据且表可能缺失，
    // 清理失败不阻断文章删除（避免把删除文章这一动作与统计历史绑定死）。
    const stmts = [
      { sql: 'DELETE FROM comments WHERE post_id = ?', params: [id] },
      { sql: 'DELETE FROM stats WHERE post_id = ?', params: [id] },
      { sql: 'DELETE FROM posts WHERE id = ?', params: [id] }
    ];
    await dbBatch(env.DB, stmts);
    await dbRun(env.DB, 'DELETE FROM stats_daily WHERE post_id = ?', id).catch(() => {});
    await purgeTags(env, [TAG_POSTS, TAG_FEED, TAG_SITEMAP, 'post:' + id]);
    await recordAudit(env, request, 'post.delete', id);
    return json({ ok: true }, 200, request, env);
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}

/* ============================================================
 * 评论（D1 表 comments；GET 列表 / POST 发表 / DELETE 单条）
 * ============================================================ */

/** 评论敏感词：词库存 site_settings.comment_blocklist（JSON 数组或换行/逗号分隔） */
export function commentBlocklistHit(text, list) {
  const hay = String(text || '').toLowerCase();
  for (const w of (list || [])) { const k = String(w || '').trim().toLowerCase(); if (k && hay.indexOf(k) >= 0) return k; }
  return '';
}
async function commentBlocklist(env) {
  try {
    if (env && env.COMMENT_BLOCKLIST) {
      return String(env.COMMENT_BLOCKLIST).split(/[\n,，]/).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
    }
    const row = await dbFirst(env.DB, "SELECT v FROM site_settings WHERE k = 'comment_blocklist'");
    if (!row || !row.v) return [];
    const raw = String(row.v);
    let list = [];
    try { const j = JSON.parse(raw); if (Array.isArray(j)) list = j; } catch (e) { list = raw.split(/[\n,，]/); }
    return list.map(function (x) { return String(x || '').trim(); }).filter(Boolean);
  } catch (e) { return []; }
}

const COMMENT_CAPS = { author: 30, content: 1000, perPost: 300, perMin: 5, likePerMin: 30 };

/** 清除字符串中的 ASCII 控制字符（保留 \n \t）：防注入 / 干扰渲染的隐形字符 */
function sanitizeText(s) {
  return String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** 计算评论的嵌套深度（从父级链向上追溯） */
async function getCommentDepth(db, postId, parentId, maxDepth = 3) {
  let depth = 1;
  let currentId = parentId;
  while (depth < maxDepth && currentId) {
    const parent = await dbFirst(db, 'SELECT parent_id FROM comments WHERE post_id = ? AND id = ?', postId, currentId);
    if (!parent || !parent.parent_id) break;
    currentId = parent.parent_id;
    depth++;
  }
  return depth;
}

/** GET /api/posts/:id/comments · POST /api/posts/:id/comments（公开发表） */
export async function handleComments(request, env, postId) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    const url = new URL(request.url);
    const sortNew = url.searchParams.get('sort') === 'new';
    const pageNum = Math.max(1, Math.floor(Number(url.searchParams.get('page')) || 0));
    const perNum = Math.min(100, Math.floor(Number(url.searchParams.get('per')) || 0));
    const paged = pageNum > 0 && perNum > 0;
    const orderBy = sortNew
      ? 'COALESCE(pinned,0) DESC, rowid DESC'
      : 'COALESCE(pinned,0) DESC, COALESCE(featured,0) DESC, COALESCE(likes,0) DESC, rowid ASC';
    const list = await dbAll(env.DB, "SELECT *, rowid AS rid FROM comments WHERE post_id = ? AND (status = 'approved' OR status IS NULL) ORDER BY " + orderBy, postId);
    if (!paged) return json({ ok: true, postId, comments: list }, 200, request, env, { 'Cache-Control': NO_CACHE });
    const byId = {}; const children = {};
    list.forEach(function (c) { byId[c.id] = c; children[c.id] = []; });
    const roots = [];
    list.forEach(function (c) { if (c.parent_id && byId[c.parent_id]) children[c.parent_id].push(c); else roots.push(c); });
    const rootTotal = roots.length;
    const pages = Math.max(1, Math.ceil(rootTotal / perNum));
    const start = (pageNum - 1) * perNum;
    const out = [];
    function walk(c) { out.push(c); (children[c.id] || []).forEach(walk); }
    roots.slice(start, start + perNum).forEach(walk);
    return json({ ok: true, postId, comments: out, total: list.length, rootTotal: rootTotal, page: pageNum, per: perNum, pages: pages, sort: sortNew ? 'new' : 'hot' }, 200, request, env, { 'Cache-Control': NO_CACHE });
  }

  if (method === 'POST') {
    // 来源校验：浏览器跨站脚本/垃圾站外提交会带异源 Origin → 拒绝
    const origin = request.headers.get('Origin');
    if (origin) {
      let self = '', site = '';
      try { self = new URL(request.url).origin; } catch (e) {}
      if (env.SITE_URL) site = String(env.SITE_URL).replace(/\/+$/, '');
      if (origin !== self && origin !== site) return json({ error: '来源校验失败' }, 403, request, env);
    }
    // 频率限制：同一 IP 每分钟最多 perMin 条（KV 计数，60s 窗口）。
    // 注意：若 KV（env.BLOG）未绑定，频控会静默失效 —— 显式告警，避免无声降级。
    const ip = clientIp(request);
    const win = Math.floor(Date.now() / 60000);
    const rk = 'rate:cmt:' + ip + ':' + win;
    let cnt = 0;
    if (env.BLOG) {
      try { cnt = Number((await env.BLOG.get(rk)) || 0); } catch (e) {}
      if (cnt >= COMMENT_CAPS.perMin) return json({ error: '评论太频繁，请稍后再试' }, 429, request, env);
    } else {
      console.warn('[comments] env.BLOG(KV) 未绑定，评论频率限制已禁用');
    }
    const body = await request.json().catch(() => null);
    const author = sanitizeText(String((body && body.author) || '').trim()).slice(0, COMMENT_CAPS.author);
    const content = sanitizeText(String((body && body.content) || '').trim()).slice(0, COMMENT_CAPS.content);
    if (!author) return json({ error: '请填写昵称' }, 400, request, env);
    if (!content) return json({ error: '评论内容不能为空' }, 400, request, env);
    // 敏感词：命中即拒绝，避免灌水进入数据库
    const hitWord = commentBlocklistHit(author + '\n' + content, await commentBlocklist(env));
    if (hitWord) return json({ error: '内容包含敏感词：' + hitWord }, 400, request, env);
    // 回复：验证 parent_id（可选）
    let parentId = null;
    if (body && body.parent_id) {
      parentId = sanitizeText(String(body.parent_id).trim()) || null;
      if (parentId) {
        // 确保 parent_id 存在且属于同一篇文章
        const parentComment = await dbFirst(env.DB, 'SELECT id FROM comments WHERE post_id = ? AND id = ?', postId, parentId);
        if (!parentComment) {
          return json({ error: '回复的评论不存在' }, 400, request, env);
        }
        // 检查嵌套深度（最大 3 层）
        const depth = await getCommentDepth(env.DB, postId, parentId);
        if (depth >= 3) {
          return json({ error: '最多支持 3 层嵌套回复' }, 400, request, env);
        }
      }
    }
    const count = await dbFirst(env.DB, 'SELECT COUNT(*) AS c FROM comments WHERE post_id = ?', postId);
    if ((count && count.c || 0) >= COMMENT_CAPS.perPost) return json({ error: '评论数已达上限' }, 400, request, env);
    // 重复发送拦截：同一分区（文章/留言板）下，相同昵称 + 相同内容只允许出现一次。
    // 防误触双击、脚本刷同文；不同分区互不影响。命中返回 409，前端透传该提示。
    const dup = await dbFirst(env.DB,
      'SELECT id FROM comments WHERE post_id = ? AND author = ? AND content = ? LIMIT 1',
      postId, author, content);
    if (dup) return json({ error: '请勿重复发送相同内容' }, 409, request, env);
    // 评论审核：若开启「新评论默认需审核」，则进入待审核；否则直接通过。
    // 默认关闭（moderate_comments 非 '1'），保持旧版「发表即公开」行为不变。
    let moderate = false;
    try {
      const s = await dbFirst(env.DB, "SELECT v FROM site_settings WHERE k = 'moderate_comments'");
      moderate = !!(s && s.v === '1');
    } catch (e) {}
    const comment = {
      // 用 crypto.randomUUID 生成主键：此前 'c-'+Date.now()+Math.random() 在同一毫秒内
      // 有一定碰撞概率（实测 30 万次抽样约 70 次碰撞），碰撞即主键冲突 → 未捕获 500。
      id: 'c-' + randomToken(16),
      author,
      content,
      date: new Date().toISOString().slice(0, 10),
      status: moderate ? 'pending' : 'approved',
      parent_id: parentId
    };
    await dbRun(env.DB,
      'INSERT INTO comments (id,post_id,author,content,date,status,parent_id) VALUES (?,?,?,?,?,?,?)',
      comment.id, postId, comment.author, comment.content, comment.date, comment.status, parentId);
    await queueCommentNotification(env, postId, comment).catch(() => {});
    // 入库成功才计数（防刷屏）
    if (env.BLOG) {
      try { await env.BLOG.put(rk, String(cnt + 1), { expirationTtl: 120 }); } catch (e) {}
    }
    // 注：评论列表 GET 为 no-store（永不缓存），无需调用边缘 purge；直接返回
    return json({ ok: true, comment }, 201, request, env);
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}

/** POST /api/comments/:id/like（公开点赞，按 IP 频控） */
export async function handleCommentLike(request, env, cid) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  const exist = await dbFirst(env.DB, 'SELECT likes FROM comments WHERE id = ?', cid).catch(() => null);
  if (!exist) return json({ error: '评论不存在' }, 404, request, env);
  const ip = clientIp(request);
  const win = Math.floor(Date.now() / 60000);
  const key = 'rate:cmtlike:' + ip + ':' + win;
  if (env.BLOG) {
    let n = 0;
    try { n = Number((await env.BLOG.get(key)) || 0); } catch (e) {}
    if (n >= COMMENT_CAPS.likePerMin) return json({ error: '点赞太频繁，请稍后再试' }, 429, request, env);
    try { await env.BLOG.put(key, String(n + 1), { expirationTtl: 120 }); } catch (e) {}
  }
  await dbRun(env.DB, 'UPDATE comments SET likes = MIN(COALESCE(likes,0) + 1, 999999) WHERE id = ?', cid);
  const row = await dbFirst(env.DB, 'SELECT likes FROM comments WHERE id = ?', cid);
  return json({ ok: true, likes: Number(row && row.likes) || 0 }, 200, request, env, { 'Cache-Control': NO_CACHE });
}
/** DELETE /api/posts/:id/comments/:cid（需写入令牌，用于管理/删除不当评论） */
export async function handleCommentId(request, env, postId, cid) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);

  const exist = await dbFirst(env.DB, 'SELECT 1 FROM comments WHERE post_id = ? AND id = ?', postId, cid);
  if (!exist) return json({ error: '评论不存在' }, 404, request, env);
  await dbRun(env.DB, 'DELETE FROM comments WHERE post_id = ? AND id = ?', postId, cid);
  return json({ ok: true }, 200, request, env);
}

/** 将新评论加入站长通知发件箱；未配置收件邮箱或邮件服务时静默跳过。 */
async function queueCommentNotification(env, postId, comment) {
  if (!env || !env.DB || !env.RESEND_API_KEY || !env.BLOG_MAIL_FROM || !env.SITE_URL) return false;
  let to = String(env.BLOG_ADMIN_EMAIL || env.BLOG_MAIL_REPLY_TO || '').trim();
  if (!to) {
    try {
      const row = await dbFirst(env.DB, "SELECT v FROM site_settings WHERE k = 'profile'");
      const profile = row && row.v ? JSON.parse(row.v) : {};
      to = String(profile.email || '').trim();
    } catch (e) {}
  }
  if (!to) to = String(env.BLOG_MAIL_FROM || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return false;
  const post = await dbFirst(env.DB, 'SELECT title FROM posts WHERE id = ?', postId).catch(() => null);
  const payload = JSON.stringify({ postId: postId, postTitle: post ? post.title : '', author: comment.author, content: comment.content, status: comment.status, commentId: comment.id });
  await dbRun(env.DB, 'INSERT INTO mail_outbox (post_id,to_email,status,attempts,error,created_at,kind,payload) VALUES (?,?,?,?,?,?,?,?)', postId, to, 'pending', 0, '', Date.now(), 'comment', payload);
  return true;
}
/** 将已发布文章加入订阅通知发件箱；发送由 Cron 异步完成。 */
export async function queuePostNotifications(env, post) {
  if (!env || !env.DB || !post || !post.id || (post.status || 'published') !== 'published') return { queued: 0 };
  const subscribers = await dbAll(env.DB, "SELECT email FROM subscribers WHERE status = 'active'").catch(() => []);
  if (!subscribers.length) return { queued: 0 };
  const now = Date.now();
  const stmts = subscribers.map((row) => ({
    sql: 'INSERT OR IGNORE INTO mail_outbox (post_id,to_email,status,attempts,error,created_at) VALUES (?,?,?,?,?,?)',
    params: [post.id, row.email, 'pending', 0, '', now]
  }));
  for (let i = 0; i < stmts.length; i += 100) await dbBatch(env.DB, stmts.slice(i, i + 100));
  return { queued: subscribers.length };
}

/* ============================================================
 * 文章版本历史
 * ============================================================ */
function revisionFromRow(r) {
  if (!r) return null;
  let tags = [];
  try { tags = r.tags ? JSON.parse(r.tags) : []; } catch (e) { tags = []; }
  let enc = null;
  if (r.enc) { try { enc = JSON.parse(r.enc); } catch (e) { enc = null; } }
  return {
    id: Number(r.id) || 0,
    postId: String(r.post_id || ''),
    title: String(r.title || ''),
    date: String(r.date || ''),
    excerpt: String(r.excerpt || ''),
    content: String(r.content || ''),
    cover: String(r.cover || ''),
    ogImage: String(r.og_image || ''),
    pinned: !!r.pinned,
    protected: !!r.protected,
    enc: enc,
    tags: tags,
    category: String(r.category || ''),
    series: String(r.series || ''),
    seriesOrder: Number(r.series_order) || 0,
    status: normalizePostStatus(r.status),
    publishAt: normalizePublishAt(r.publish_at),
    reason: String(r.reason || 'save'),
    createdAt: Number(r.created_at) || 0
  };
}
function revisionMetaFromRow(r) {
  const rev = revisionFromRow(r);
  if (!rev) return null;
  delete rev.content;
  delete rev.enc;
  return rev;
}
function revisionFingerprint(post) {
  return JSON.stringify([
    post.title || '', post.date || '', post.excerpt || '', post.content || '', post.cover || '', post.ogImage || '',
    post.pinned ? 1 : 0, post.protected ? 1 : 0, post.enc || null,
    post.tags || [], post.category || '', post.series || '', Number(post.seriesOrder) || 0,
    normalizePostStatus(post.status), post.publishAt || null
  ]);
}
async function recordPostRevision(env, post, reason) {
  if (!env || !env.DB || !post || !post.id) return;
  const last = await dbFirst(env.DB,
    'SELECT * FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    post.id);
  if (last && revisionFingerprint(revisionFromRow(last)) === revisionFingerprint(post)) return;
  const createdAt = Date.now();
  await dbRun(env.DB,
    'INSERT INTO post_revisions (post_id,title,date,excerpt,content,cover,og_image,pinned,protected,enc,tags,category,series,series_order,status,publish_at,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    post.id, post.title || '', post.date || '', post.excerpt || '', post.content || '', post.cover || '', post.ogImage || '',
    post.pinned ? 1 : 0, post.protected ? 1 : 0, post.enc ? JSON.stringify(post.enc) : null,
    JSON.stringify(post.tags || []), post.category || '', post.series || '', Number(post.seriesOrder) || 0,
    normalizePostStatus(post.status), post.status === 'scheduled' ? normalizePublishAt(post.publishAt) : null,
    reason || 'save', createdAt);
  // Each post keeps at most 50 revisions, newest first.
  const rows = await dbAll(env.DB, 'SELECT id FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC', post.id).catch(() => []);
  for (const row of rows.slice(50)) {
    await dbRun(env.DB, 'DELETE FROM post_revisions WHERE id = ?', row.id).catch(() => {});
  }
}

export async function handlePostRevisions(request, env, postId) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);
  const rows = await dbAll(env.DB,
    'SELECT id,post_id,title,date,excerpt,cover,og_image,pinned,protected,tags,category,series,series_order,status,publish_at,reason,created_at FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC, id DESC',
    postId).catch(() => []);
  return json({ ok: true, revisions: rows.map(revisionMetaFromRow).filter(Boolean) }, 200, request, env, { 'Cache-Control': NO_CACHE });
}

export async function handlePostRevision(request, env, postId, revisionId) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);
  const row = await dbFirst(env.DB,
    'SELECT * FROM post_revisions WHERE post_id = ? AND id = ?', postId, Number(revisionId));
  const revision = revisionFromRow(row);
  if (!revision) return json({ error: '版本不存在' }, 404, request, env);
  return json({ ok: true, revision: revision }, 200, request, env, { 'Cache-Control': NO_CACHE });
}

export async function handlePostRevisionRestore(request, env, postId, revisionId) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  const row = await dbFirst(env.DB,
    'SELECT * FROM post_revisions WHERE post_id = ? AND id = ?', postId, Number(revisionId));
  const revision = revisionFromRow(row);
  if (!revision) return json({ error: '版本不存在' }, 404, request, env);
  const currentRow = await dbFirst(env.DB, 'SELECT * FROM posts WHERE id = ?', postId);
  const current = postFromRow(currentRow);
  if (current) await recordPostRevision(env, current, 'update');
  const post = {
    id: postId, title: revision.title, date: revision.date, excerpt: revision.excerpt,
    content: revision.content, cover: revision.cover, ogImage: revision.ogImage,
    pinned: revision.pinned, protected: revision.protected, enc: revision.enc, tags: revision.tags,
    category: revision.category, series: revision.series, seriesOrder: revision.seriesOrder,
    status: revision.status, publishAt: revision.publishAt
  };
  await dbRun(env.DB,
    'INSERT INTO posts (id,title,date,excerpt,content,cover,og_image,pinned,protected,enc,tags,category,series,series_order,status,publish_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ' +
    'ON CONFLICT(id) DO UPDATE SET title=excluded.title,date=excluded.date,excerpt=excluded.excerpt,content=excluded.content,cover=excluded.cover,og_image=excluded.og_image,pinned=excluded.pinned,protected=excluded.protected,enc=excluded.enc,tags=excluded.tags,category=excluded.category,series=excluded.series,series_order=excluded.series_order,status=excluded.status,publish_at=excluded.publish_at',
    ...postToParams(post));
  await recordPostRevision(env, post, 'restore');
  await purgeTags(env, [TAG_POSTS, TAG_FEED, TAG_SITEMAP, 'post:' + postId]);
  return json({ ok: true, post: post }, 200, request, env);
}

/* ============================================================
 * 定时发布（由 Worker Cron Trigger 周期调用）
 * ============================================================ */
export async function publishScheduledPosts(env, nowMs) {
  if (!env || !env.DB) return { published: 0, ids: [] };
  const now = Number(nowMs) || Date.now();
  const due = await dbAll(env.DB,
    "SELECT * FROM posts WHERE status = 'scheduled' AND publish_at IS NOT NULL AND publish_at <= ?",
    now).catch(() => []);
  if (!due.length) return { published: 0, ids: [] };
  await dbBatch(env.DB, due.map((row) => ({
    sql: "UPDATE posts SET status = 'published', publish_at = NULL WHERE id = ? AND status = 'scheduled'",
    params: [row.id]
  })));
  await purgeTags(env, [TAG_POSTS, TAG_FEED, TAG_SITEMAP].concat(due.map((row) => 'post:' + row.id)));
  for (const row of due) {
    const post = postFromRow(row);
    if (post) { post.status = 'published'; post.publishAt = null; await queuePostNotifications(env, post).catch(() => {}); }
  }
  return { published: due.length, ids: due.map((row) => String(row.id)) };
}

/* ============================================================
 * Sitemap（/api/sitemap.xml）
 * ============================================================ */

/** 由文章数组生成 Sitemap XML（首页 / 关于 / 归档 / 全部文章） */
export function buildSitemapXml(posts, siteUrl) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const row = (loc, lastmod) =>
    '  <url>' +
      `<loc>${xmlEscape(loc)}</loc>` +
      (lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : '') +
    '</url>';
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    row(base + '/'),
    row(base + '/about'),
    row(base + '/archive'),
    row(base + '/guestbook')
  ];
  sortByDateDesc(posts).filter(isPublicPost).forEach((p) => {
    lines.push(row(base + '/posts/' + encodeURIComponent(p.id) + '/', p.date || ''));
  });
  lines.push('</urlset>');
  lines.push('');
  return lines.join('\n');
}

/** GET /api/sitemap.xml */
export async function handleSitemap(request, env) {
  const siteUrl = (env && env.SITE_URL) || (request ? new URL(request.url).origin : '');
  const posts = env && env.DB ? await readPosts(env) : [];
  const xml = buildSitemapXml(posts, siteUrl);
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': FEED_CACHE, 'Cache-Tag': TAG_SITEMAP, ...getCorsHeaders(request, env), ...securityHeaders() }
  });
}

/* ---------- 站点生成产物（RSS / Sitemap 云端副本） ---------- */

/** POST /api/site-files — 保存站点产物（feed.xml / sitemap.xml 等），需写鉴权
 *  GET  /api/site-files       — 列出全部产物名
 *  GET  /api/site-files/:name — 下载指定产物内容 */
export async function handleSiteFiles(request, env, name) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);

  if (request.method === 'GET') {
    if (name) {
      const row = await dbFirst(env.DB, 'SELECT content FROM site_files WHERE name = ?', name).catch(() => null);
      if (!row) return json({ error: '未找到该产物' }, 404, request, env);
      const isXml = /\.xml$/i.test(name);
      return new Response(row.content, {
        status: 200,
        headers: { 'Content-Type': (isXml ? 'application/xml' : 'text/plain') + '; charset=utf-8', 'Cache-Control': READ_CACHE, ...getCorsHeaders(request, env), ...securityHeaders() }
      });
    }
    const rows = await dbAll(env.DB, 'SELECT name, updated_at FROM site_files').catch(() => []);
    return json({ ok: true, files: rows }, 200, request, env, { 'Cache-Control': READ_CACHE });
  }

  if (request.method === 'POST') {
    if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
    const body = await request.json().catch(() => null);
    const files = Array.isArray(body) ? body : (body && body.files ? body.files : null);
    if (!Array.isArray(files) || !files.length) return json({ error: '缺少 files 数组' }, 400, request, env);
    const now = new Date().toISOString();
    const stmts = [];
    for (const f of files) {
      if (!f || typeof f.name !== 'string' || typeof f.content !== 'string') continue;
      if (!/^[a-z0-9._-]+$/i.test(f.name)) continue;
      stmts.push({
        sql: 'INSERT INTO site_files (name, content, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at',
        params: [f.name, f.content, now]
      });
    }
    if (!stmts.length) return json({ error: 'files 中没有合法的文件名（仅允许字母/数字/._-）' }, 400, request, env);
    // 批量原子写入：此前逐条 .catch(()=>{}) 会静默吞掉全部写失败，却仍返回 ok:true，
    // 前端据此认为「已同步」，实际数据未落库。
    try {
      await dbBatch(env.DB, stmts);
    } catch (e) {
      console.error('[site-files] batch write failed:', e && e.message, e);
      return json({ error: '文件写入失败，请稍后重试' }, 500, request, env);
    }
    return json({ ok: true, written: stmts.length }, 200, request, env);
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}

/* ============================================================
 * 阅读数 / 点赞（D1 表 stats）
 * ============================================================ */

/** GET /api/posts/:id/stats · POST /api/posts/:id/stats { action: views|like } */
export async function handleStats(request, env, postId) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    const s = await dbFirst(env.DB, 'SELECT * FROM stats WHERE post_id = ?', postId);
    return json({ ok: true, postId, stats: { likes: Number(s && s.likes) || 0, views: Number(s && s.views) || 0 } }, 200, request, env, { 'Cache-Control': READ_CACHE, 'Cache-Tag': 'stats:' + postId });
  }

  if (method === 'POST') {
    const body = await request.json().catch(() => null);
    const action = body && body.action;
    if (action !== 'views' && action !== 'like') {
      return json({ error: 'action 只能是 views 或 like' }, 400, request, env);
    }

    if (action === 'like') {
      // 点赞去重（每 IP 每文章仅计一次）：与前端 per-browser 去重呼应，
      // 服务端再兜底一层，防止绕过前端直接调 API 把同一篇赞数刷高。
      const ip = clientIp(request);
      const dk = 'liked:' + ip + ':' + postId;
      if (env.BLOG) {
        try {
          if (await env.BLOG.get(dk)) {
            // 已赞过：返回当前计数，不重复 +1（保持幂等）
            const cur = await dbFirst(env.DB, 'SELECT * FROM stats WHERE post_id = ?', postId) || {};
            const s = { likes: Number(cur.likes) || 0, views: Number(cur.views) || 0 };
            return json({ ok: true, postId, stats: s, duplicated: true }, 200, request, env);
          }
        } catch (e) {}
      }
      // 全局频控（防整体刷量：短时间内对大量不同文章连赞）
      const win = Math.floor(Date.now() / 60000);
      const rk = 'rate:like:' + ip + ':' + win;
      let cnt = 0;
      if (env.BLOG) {
        try { cnt = Number(await env.BLOG.get(rk)) || 0; } catch (e) {}
        if (cnt >= LIKE_CAP) return json({ error: '操作太频繁，请稍后再试' }, 429, request, env);
      } else {
        console.warn('[stats] env.BLOG(KV) 未绑定，点赞频率限制已禁用');
      }
      // 原子自增：并发点赞不会互相覆盖计数（此前“读-改-写”在并发下会丢数）
      await dbRun(env.DB,
        'INSERT INTO stats (post_id,likes,views) VALUES (?,1,0) '
        + 'ON CONFLICT(post_id) DO UPDATE SET likes = MIN(likes + 1, 9999999)',
        postId);
      // 写入每日聚合（用于后台「近 N 天点赞趋势」）
      const todayLike = new Date().toISOString().slice(0, 10);
      await dbRun(env.DB,
        'INSERT INTO stats_daily (post_id,date,views,likes) VALUES (?,?,0,1) ON CONFLICT(post_id,date) DO UPDATE SET likes = likes + 1',
        postId, todayLike).catch(() => {});
      if (env.BLOG) {
        try {
          await env.BLOG.put(rk, String(cnt + 1), { expirationTtl: 120 });
          // 去重标记：与 rate key 一样带 TTL。此前为永久 key（无 expirationTtl），
          // KV 会按 (IP, 文章) 组合无限增长；点赞去重的有效窗口无需超过 TTL。
          await env.BLOG.put(dk, '1', { expirationTtl: LIKE_DEDUP_TTL });
        } catch (e) {}
      }
    // 写后回读最终计数（含并发期间其他请求的增量），响应数字总是真实值
      const afterLike = await dbFirst(env.DB, 'SELECT * FROM stats WHERE post_id = ?', postId) || {};
      const s = { likes: Number(afterLike.likes) || 0, views: Number(afterLike.views) || 0 };
      await purgeTags(env, ['stats:' + postId]);   // 清 stats 缓存，保证点赞数立即生效
      return json({ ok: true, postId, stats: s }, 200, request, env);
    }

    // views：计数（同会话去重此前仅靠前端 sessionStorage，可被直接调 API 绕过）。
    // 这里补两层服务端防护：同一 IP 对同一篇文章在 VIEW_DEDUP_TTL 内只计一次；
    // 并做每分钟总量频控，防止脚本刷阅读量。
    const vip = clientIp(request);
    const vdk = 'viewed:' + vip + ':' + postId;
    if (env.BLOG) {
      try {
        if (await env.BLOG.get(vdk)) {
          // 已计过：返回当前计数，不重复 +1（幂等，与点赞一致）
          const cur = await dbFirst(env.DB, 'SELECT * FROM stats WHERE post_id = ?', postId) || {};
          const s = { likes: Number(cur.likes) || 0, views: Number(cur.views) || 0 };
          return json({ ok: true, postId, stats: s, duplicated: true }, 200, request, env);
        }
      } catch (e) {}
      const vwin = Math.floor(Date.now() / 60000);
      const vrk = 'rate:view:' + vip + ':' + vwin;
      let vcnt = 0;
      try { vcnt = Number(await env.BLOG.get(vrk)) || 0; } catch (e) {}
      if (vcnt >= VIEW_CAP) return json({ error: '操作太频繁，请稍后再试' }, 429, request, env);
      try {
        await env.BLOG.put(vrk, String(vcnt + 1), { expirationTtl: 120 });
        await env.BLOG.put(vdk, '1', { expirationTtl: VIEW_DEDUP_TTL });
      } catch (e) {}
    }
    // 原子自增：并发访问不会互相覆盖（此前“读-改-写”在并发下会丢数）。
    await dbRun(env.DB,
      'INSERT INTO stats (post_id,likes,views) VALUES (?,0,1) '
      + 'ON CONFLICT(post_id) DO UPDATE SET views = MIN(views + 1, 9999999)',
      postId);
    // 写入每日聚合（用于后台「近 N 天访问趋势」）
    const todayView = new Date().toISOString().slice(0, 10);
    await dbRun(env.DB,
      'INSERT INTO stats_daily (post_id,date,views,likes) VALUES (?,?,1,0) ON CONFLICT(post_id,date) DO UPDATE SET views = views + 1',
      postId, todayView).catch(() => {});
    // 访问来源 / 设备（按天聚合，表可能尚未迁移 → 失败静默）：只在计入浏览时记录
    try {
      const ua = String(request.headers.get('User-Agent') || '');
      const dev = /(bot|crawler|spider)/i.test(ua) ? 'bot'
        : (/iPad|Tablet|Pad/i.test(ua) ? 'tablet'
        : (/Mobile|Android|iPhone|iPod/i.test(ua) ? 'mobile' : 'desktop'));
      let ref = 'direct';
      // 前端会带 document.referrer（fetch 的 Referer 头恒为本站页面，无法反映来路）；
      // 带 ref 字段（含空串）时以它为准：空串=直接访问，避免把直达流量误判成站内；
      // 未带 ref 字段的旧客户端回退到 Referer 头。
      const hasClientRef = !!(body && Object.prototype.hasOwnProperty.call(body, 'ref'));
      const rawRef = hasClientRef ? String(body.ref || '').slice(0, 500) : String(request.headers.get('Referer') || '');
      if (rawRef) {
        try {
          const h = new URL(rawRef).hostname.replace(/^www\./, '');
          let self = '';
          try { self = new URL(request.url).hostname.replace(/^www\./, ''); } catch (e) {}
          ref = (h && h !== self) ? h : 'internal';
        } catch (e) { ref = 'direct'; }
      }
      await dbBatch(env.DB, [
        { sql: 'INSERT INTO stats_sources (post_id,date,kind,name,views) VALUES (?,?,?,?,1) ON CONFLICT(post_id,date,kind,name) DO UPDATE SET views = views + 1', params: [postId, todayView, 'device', dev] },
        { sql: 'INSERT INTO stats_sources (post_id,date,kind,name,views) VALUES (?,?,?,?,1) ON CONFLICT(post_id,date,kind,name) DO UPDATE SET views = views + 1', params: [postId, todayView, 'ref', ref] }
      ]);
    } catch (e) {}
    // 写后回读最终计数（含并发期间其他请求的增量），响应数字总是真实值
    const afterView = await dbFirst(env.DB, 'SELECT * FROM stats WHERE post_id = ?', postId) || {};
    const s = { likes: Number(afterView.likes) || 0, views: Number(afterView.views) || 0 };
    // 注：浏览计数 POST 不再触发边缘 purge——stats GET 仅缓存 60s 且浏览是高频请求，
    // 每次阅读都外发 purge API 调用既浪费配额又有被限流风险；依赖 s-maxage 自然过期即可
    return json({ ok: true, postId, stats: s }, 200, request, env);
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}

/* ============================================================
 * 管理员认证（安全版：密码只存 D1，前端不持有明文）
 * ------------------------------------------------------------
 * 密码：PBKDF2-SHA256 加盐哈希后存 admin_auth，绝不明文。
 * 登录：POST /api/admin/login { password } → 校验哈希 →
 *       签发随机会话 token（admin_sessions，7 天）。
 * 鉴权：写操作请求头 Authorization: Bearer <session-token>，
 *       isWriteAuthed() 校验会话；旧的 BLOG_WRITE_TOKEN 仍兼容。
 * 限流：三层维度，见下方「登录限流的分层计数」注释。
 * 防抢注：首次设置密码需 X-Setup-Key 匹配环境变量 BLOG_ADMIN_SETUP_KEY。
 * ============================================================ */

const ADMIN_AUTH_KEY = 'auth';
const ADMIN_SESSION_TTL = 7 * 24 * 3600;          // 会话 7 天
const ADMIN_FAIL_DECAY_MS = 60 * 60 * 1000;       // 失败计数老化：窗口过后 1 小时无新失败才清零
const ADMIN_MAX_FAILS = 5;                        // 单 IP 连续失败上限
const ADMIN_LOCK_MS = 15 * 60 * 1000;             // 单 IP 锁定 15 分钟（只影响攻击者自己的 IP）
const ADMIN_SUBNET_MAX_FAILS = 15;                // 同一子网（IPv4 /24、IPv6 前 4 段）失败上限
const ADMIN_SUBNET_LOCK_MS = 60 * 1000;           // 子网冷却 60 秒（短，避免同网段他人误伤）
const ADMIN_GLOBAL_MAX_FAILS = 30;                // 全局失败阈值
const ADMIN_GLOBAL_LOCK_MS = 10 * 1000;           // 全局冷却 10 秒（对齐 CF 免费版限流最小窗口）
const GLOBAL_FAIL_KEY = '__global__';             // admin_fails 中的全局计数行
const SUBNET_FAIL_PREFIX = 'subnet:';             // admin_fails 中的子网计数行前缀
const PBKDF2_ITER = 100000;                       // PBKDF2 迭代次数（CF WebCrypto 硬上限 100000）

/* ---------- 加密工具（WebCrypto，Worker/Node 均可用） ---------- */

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}
/** PBKDF2-SHA256 派生密钥（返回 hex）；salt 为 hex 字符串 */
async function deriveKey(password, saltHex, iter) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(String(password || '')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: iter },
    keyMaterial, 256
  );
  return bytesToHex(new Uint8Array(bits));
}
/** 恒定时间字符串比较（防时序侧信道）
 * 实现：先对两个输入做同长 SHA-256 摘要再异或比较——长度信息不泄露，
 * 且无论输入长短、是否相等，耗时恒定（仅依赖摘要计算与 32 字节异或）。
 * 旧实现长度不等时走不同代码路径，仍有长度泄露。 */
async function safeEqual(a, b) {
  const enc = new TextEncoder();
  const da = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(a || ''))));
  const db = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(b || ''))));
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}
function clientIp(request) {
  // 仅信任 CDN 注入的 CF-Connecting-IP：不可伪造。
  // 不读 X-Forwarded-For——该头是客户端可控的，直接构造可绕过
  // 点赞去重 / 评论频控 / 登录失败锁定等所有按 IP 的限流。
  return String(request.headers.get('CF-Connecting-IP') || '').replace(/[^A-Za-z0-9:._-]/g, '') || 'unknown';
}
function nowMs() { return Date.now(); }

/* ============================================================
 * 登录限流的分层计数（既要防爆破，又不能把站长锁在门外）
 * ------------------------------------------------------------
 * 背景：把「失败次数」直接做成全局锁定，等于把可用性交给攻击者——
 *   任何人从任意 IP 刷够失败次数，唯一的管理员就进不去了（DoS）。
 *   因此这里采用三层维度 + 短冷却 + 应急通道：
 *
 *   ① 单 IP：5 次失败 → 15 分钟。只影响攻击者自己的出口 IP。
 *   ② 子网：IPv4 /24、IPv6 前 4 段，15 次失败 → 60 秒冷却。
 *      让「轮换 IP」的成本从「换一个 IP」升到「换一个网段」，
 *      冷却刻意很短，避免同网段的其他正常用户被误伤。
 *   ③ 全局：30 次失败 → 仅 10 秒冷却，并打印告警日志。
 *      10 秒对齐 Cloudflare 免费版限流规则的最小窗口；它同时是一道
 *      「写放大闸门」——冷却期间直接 429，不查库也不写库，
 *      于是分布式爆破最多也只能每 10 秒消耗一次 D1 写入。
 *
 *   应急通道：带正确 X-Setup-Key 的请求跳过以上全部限流
 *   （但**不跳过密码校验**）。站长因此永远有一条进得去的路。
 *
 *   计数行复用 admin_fails(ip,n,until)：until 既表示锁定截止时间，
 *   也表示「未达阈值时的计数窗口过期时间」。读路径刻意只读不写，
 *   否则攻击者每次请求都能触发一次 D1 写入，把免费额度刷爆。
 * ============================================================ */

/** 子网键：IPv4 取 /24，IPv6 取前 4 段（≈/64）；无法识别时退化为单 IP。 */
function subnetKey(ip) {
  const s = String(ip || '');
  if (s.indexOf(':') >= 0) {
    return SUBNET_FAIL_PREFIX + s.split(':').slice(0, 4).join(':') + ':/64';
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(s);
  if (m) return SUBNET_FAIL_PREFIX + m[1] + '.' + m[2] + '.' + m[3] + '.0/24';
  return SUBNET_FAIL_PREFIX + s;
}

/** 读取一行失败计数：返回 { n, until, locked } 或 null（无记录 / 已老化）。 */
async function readFailRow(env, key, maxFails) {
  let row = null;
  try { row = await dbFirst(env.DB, 'SELECT * FROM admin_fails WHERE ip = ?', key); } catch (e) { return null; }
  if (!row) return null;
  const n = Number(row.n) || 0;
  const until = Number(row.until) || 0;
  const now = nowMs();
  if (until > now) return { n, until, locked: n >= maxFails };
  // 窗口已过：已达阈值（刚冷却完）时保留计数一小段时间，
  // 避免攻击者「等冷却结束 → 计数归零 → 无限重试」。
  if (n >= maxFails && now <= until + ADMIN_FAIL_DECAY_MS) return { n, until, locked: false };
  return null;
}

/** 记录一次失败：累加计数并顺延窗口；返回 { n, locked, until }。 */
async function bumpFailRow(env, key, cur, maxFails, lockMs) {
  const n = (cur && cur.n ? cur.n : 0) + 1;
  const locked = n >= maxFails;
  const until = nowMs() + (locked ? lockMs : ADMIN_FAIL_DECAY_MS);
  try {
    await dbRun(env.DB, 'INSERT INTO admin_fails (ip,n,until) VALUES (?,?,?) '
      + 'ON CONFLICT(ip) DO UPDATE SET n=excluded.n, until=excluded.until', key, n, until);
  } catch (e) { /* 计数写失败不应阻塞登录判定 */ }
  return { n, locked, until };
}

/** 限流提示文案：不足 1 分钟用「秒」，否则用「分钟」。 */
function lockHint(until) {
  const ms = Math.max(0, (Number(until) || 0) - nowMs());
  if (ms <= 60000) return '尝试次数过多，请 ' + Math.max(1, Math.ceil(ms / 1000)) + ' 秒后再试';
  return '尝试次数过多，请 ' + Math.ceil(ms / 60000) + ' 分钟后再试';
}

/** 边缘限流（可选 Workers Rate Limiting binding env.LOGIN_LIMITER）。
 *  绑定缺失或异常时一律放行（返回 true），由 D1 计数兜底；
 *  未在 wrangler 配置该绑定时行为与旧版完全一致。 */
async function edgeRateOk(env, key) {
  const rl = env && env.LOGIN_LIMITER;
  if (!rl || typeof rl.limit !== 'function') return true;
  try {
    const r = await rl.limit({ key: String(key) });
    return !r || r.success !== false;
  } catch (e) {
    console.warn('[admin:login] 边缘限流器异常，已放行并由 D1 计数兜底:', e && e.message);
    return true;
  }
}

/* ---------- 认证状态（D1） ---------- */

async function getAdminAuth(env) {
  const r = await dbFirst(env.DB, "SELECT * FROM admin_auth WHERE k = ?", ADMIN_AUTH_KEY);
  return r ? { salt: r.salt, hash: r.hash, iter: r.iter || PBKDF2_ITER, mustChange: !!(r.must_change) } : null;
}
async function setAdminAuth(env, auth) {
  const mc = auth.mustChange != null ? (auth.mustChange ? 1 : 0) : undefined;
  if (mc != null) {
    await dbRun(env.DB,
      'INSERT INTO admin_auth (k,salt,hash,iter,must_change) VALUES (?,?,?,?,?) '
      + 'ON CONFLICT(k) DO UPDATE SET salt=excluded.salt, hash=excluded.hash, iter=excluded.iter, must_change=excluded.must_change',
      ADMIN_AUTH_KEY, auth.salt, auth.hash, auth.iter, mc);
  } else {
    await dbRun(env.DB,
      'INSERT INTO admin_auth (k,salt,hash,iter) VALUES (?,?,?,?) '
      + 'ON CONFLICT(k) DO UPDATE SET salt=excluded.salt, hash=excluded.hash, iter=excluded.iter',
      ADMIN_AUTH_KEY, auth.salt, auth.hash, auth.iter);
  }
}
async function clearMustChange(env) {
  await dbRun(env.DB, 'UPDATE admin_auth SET must_change = 0 WHERE k = ?', ADMIN_AUTH_KEY).catch(() => {});
}
/** 校验会话 token 是否有效（存在且未过期） */
async function validSession(env, token) {
  if (!token) return false;
  const s = await dbFirst(env.DB, 'SELECT * FROM admin_sessions WHERE token = ?', token);
  // 顺手清理过期会话，避免 admin_sessions 无限增长
  if (s && s.exp && s.exp <= nowMs()) {
    try { await dbRun(env.DB, 'DELETE FROM admin_sessions WHERE token = ?', token); } catch (e) {}
    return false;
  }
  return !!(s && s.exp && s.exp > nowMs());
}

function bearerToken(request) {
  const auth = String(request.headers.get('Authorization') || '').trim();
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : '';
}

/** 返回当前请求的鉴权状态；mustChange 表示会话有效但仍需修改初始密码。 */
async function adminAuthState(request, env) {
  if (!env || !env.DB) return { authed: false, mustChange: false, legacy: false, token: '' };
  const header = String(request.headers.get('Authorization') || '').trim();
  const token = bearerToken(request);
  if (token && await validSession(env, token)) {
    const auth = await getAdminAuth(env);
    return { authed: true, mustChange: !!(auth && auth.mustChange), legacy: false, token };
  }
  const legacy = env.BLOG_WRITE_TOKEN;
  if (legacy && await safeEqual(header, 'Bearer ' + legacy)) {
    return { authed: true, mustChange: false, legacy: true, token: '' };
  }
  return { authed: false, mustChange: false, legacy: false, token: '' };
}

/* ---------- 鉴权入口（写操作复用） ---------- */

/**
 * 写鉴权：优先会话 token（Authorization: Bearer <token>），
 * 兼容旧的 BLOG_WRITE_TOKEN 环境变量（静态长令牌）。
 * 未配置任何认证（无 auth、无 token）→ 拒绝（安全默认）。
 */
export async function isWriteAuthed(request, env) {
  const state = await adminAuthState(request, env);
  return state.authed && !state.mustChange;
}

/** 改密接口专用：允许 must_change 会话调用，否则用户无法完成强制改密。 */
async function isPasswordChangeAuthed(request, env) {
  const state = await adminAuthState(request, env);
  return state.authed;
}

/* ---------- 接口实现 ---------- */

/** 生成可读的随机默认密码（格式：xxxx-xxxx，8 位字母数字，去掉易混淆字符） */
function generateDefaultPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // 去掉容易混淆的 i/l/o/0/1
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  const p1 = Array.from(buf.slice(0, 4), b => chars[b % chars.length]).join('');
  const p2 = Array.from(buf.slice(4, 8), b => chars[b % chars.length]).join('');
  return p1 + '-' + p2;
}

/** POST /api/admin/setup — 设置管理员密码
 * BLOG_ADMIN_SETUP_KEY 为可选项，两种模式：
 *   · 已配置（推荐/生产）：首次初始化与重置均需请求头 X-Setup-Key 匹配环境变量，
 *     杜绝「第一个请求到的人即拿管理员」的抢注竞态；
 *   · 未配置（兼容旧行为）：首次初始化免密钥直接设置密码（存在先到先得竞态，
 *     全新部署建议配置安装密钥）；已有密码时仍拒绝重置（防未授权覆盖）。 */
export async function handleAdminSetup(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);

  const setupKey = env.BLOG_ADMIN_SETUP_KEY;

  // 已有密码：重置一律需要安装密钥（配置了 key → 校验匹配；未配置 → 拒绝，防未授权覆盖）
  const existingAuth = await getAdminAuth(env);
  if (existingAuth && existingAuth.hash) {
    if (setupKey) {
      const given = String(request.headers.get('X-Setup-Key') || '').trim();
      if (!await safeEqual(given, setupKey)) return json({ error: '设置密钥无效' }, 403, request, env);
    }
    return json({ error: '管理员密码已设置；如需重置，请先删除 D1 表 admin_auth 的 auth 行' }, 409, request, env);
  }

  // 首次初始化：配置了安装密钥 → fail-closed 必须携带匹配的 X-Setup-Key；未配置 → 兼容旧行为免密钥
  if (setupKey) {
    const given = String(request.headers.get('X-Setup-Key') || '').trim();
    if (!await safeEqual(given, setupKey)) return json({ error: '设置密钥无效' }, 403, request, env);
  }

  let body = null;
  try { body = await request.json(); } catch (e) {
    return json({ error: '请求体不是有效 JSON（检查是否含 BOM/引号被转义）' }, 400, request, env);
  }
  const password = String((body && body.password) || '');
  if (password.length < 8) return json({ error: '密码至少 8 位' }, 400, request, env);

  const salt = randomToken(16);
  const iter = PBKDF2_ITER;
  let hash;
  try { hash = await deriveKey(password, salt, iter); }
  catch (e) {
    console.error('[admin:setup] deriveKey failed:', e && e.message, e);
    return json({ error: '密码哈希计算失败，请稍后重试' }, 500, request, env);
  }
  try { await setAdminAuth(env, { salt, hash, iter, mustChange: false }); }
  catch (e) {
    console.error('[admin:setup] D1 write failed:', e && e.message, e);
    return json({ error: '数据库写入失败，请稍后重试' }, 500, request, env);
  }
  return json({ ok: true, message: '管理员密码已设置' }, 201, request, env);
}

/** POST /api/admin/login — 密码登录，成功返回会话 token */
export async function handleAdminLogin(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);

  const ip = clientIp(request);
  const subKey = subnetKey(ip);

  // 应急通道：带正确安装密钥 → 跳过全部限流（仍必须密码正确）。
  // 保证「攻击者无法用失败登录把唯一的管理员挡在门外」。
  const configuredKey = env.BLOG_ADMIN_SETUP_KEY;
  const givenKey = String(request.headers.get('X-Setup-Key') || '').trim();
  const breakGlass = !!(configuredKey && givenKey && await safeEqual(givenKey, configuredKey));

  let ipRow = null, subRow = null, gRow = null;
  if (!breakGlass) {
    // ① 边缘限流（可选绑定）：超限直接 429，不查 D1、不跑 PBKDF2、不产生 D1 写入
    if (!await edgeRateOk(env, 'login:' + ip)) {
      return json({ error: '尝试次数过多，请稍后再试' }, 429, request, env);
    }
    // ② D1 计数兜底（纯读）：单 IP → 子网 → 全局冷却
    ipRow = await readFailRow(env, ip, ADMIN_MAX_FAILS);
    subRow = await readFailRow(env, subKey, ADMIN_SUBNET_MAX_FAILS);
    gRow = await readFailRow(env, GLOBAL_FAIL_KEY, ADMIN_GLOBAL_MAX_FAILS);
    if (ipRow && ipRow.locked) {
      return json({ error: lockHint(ipRow.until) }, 429, request, env);
    }
    if (subRow && subRow.locked) {
      return json({ error: lockHint(subRow.until) }, 429, request, env);
    }
    if (gRow && gRow.locked) {
      // 全局只有 10 秒冷却 + 告警：既给爆破一点阻力，又不会把站长长期挡在门外。
      // 这里也是最该接告警的地方（Workers Logs / 通知）。
      console.warn('[admin:login] 全局失败冷却中：',
        JSON.stringify({ ip, subnet: subKey, n: gRow.n, resetInMs: gRow.until - nowMs() }));
      return json({ error: lockHint(gRow.until) }, 429, request, env);
    }
  }

  const body = await request.json().catch(() => null);
  const password = String((body && body.password) || '');
  const auth = await getAdminAuth(env);

  // —— 未初始化 ——
  // 配置了 BLOG_ADMIN_SETUP_KEY → fail-closed：拒绝登录，必须走 /api/admin/setup + X-Setup-Key
  //（杜绝抢注：任何先到的人都能拿到管理员）。未配置 → 兼容旧行为：首次部署自动生成
  // 随机默认密码并返回（前端 showFirstLoginPwd 显示，登录后强制修改密码）。
  if (!auth || !auth.hash || !auth.salt) {
    if (env.BLOG_ADMIN_SETUP_KEY) {
      return json({ error: '管理员尚未初始化：请先调用 POST /api/admin/setup 并使用安装密钥（环境变量 BLOG_ADMIN_SETUP_KEY）设置密码' }, 403, request, env);
    }
    const defaultPwd = generateDefaultPassword();
    const salt = randomToken(16);
    const iter = PBKDF2_ITER;
    let hash;
    try { hash = await deriveKey(defaultPwd, salt, iter); }
    catch (e) { return json({ error: '服务端初始化失败' }, 500, request, env); }
    try { await setAdminAuth(env, { salt, hash, iter, mustChange: true }); }
    catch (e) { return json({ error: '数据库写入失败' }, 500, request, env); }
    const token = randomToken(32);
    await dbRun(env.DB, 'INSERT INTO admin_sessions (token,exp) VALUES (?,?)', token, nowMs() + ADMIN_SESSION_TTL * 1000);
    return json({ ok: true, token, expiresIn: ADMIN_SESSION_TTL, mustChange: true, defaultPassword: defaultPwd }, 200, request, env);
  }

  // —— 正常登录 ——
  const hash = await deriveKey(password, auth.salt, auth.iter || PBKDF2_ITER);
  if (!await safeEqual(hash, auth.hash)) {
    // 失败计数：单 IP（15 分钟）→ 子网（60 秒）→ 全局（10 秒冷却 + 告警）。
    // 应急通道下的失败不计数，避免站长自己把正常路径刷爆。
    if (!breakGlass) {
      await bumpFailRow(env, ip, ipRow, ADMIN_MAX_FAILS, ADMIN_LOCK_MS);
      await bumpFailRow(env, subKey, subRow, ADMIN_SUBNET_MAX_FAILS, ADMIN_SUBNET_LOCK_MS);
      const g = await bumpFailRow(env, GLOBAL_FAIL_KEY, gRow, ADMIN_GLOBAL_MAX_FAILS, ADMIN_GLOBAL_LOCK_MS);
      if (g.locked) {
        console.warn('[admin:login] 全局失败冷却已触发（疑似爆破）：',
          JSON.stringify({ ip, subnet: subKey, n: g.n, cooldownMs: ADMIN_GLOBAL_LOCK_MS }));
      }
    }
    return json({ error: '密码错误' }, 401, request, env);
  }

  // 成功：清除本机 / 本子网 / 全局三层计数（全局一并清除，避免站长刚登录完还被冷却挡着），
  // 顺带清理已老化的计数行与过期会话——只在成功路径清理，避免被失败请求刷写。
  try { await dbRun(env.DB, 'DELETE FROM admin_fails WHERE ip = ?', ip); } catch (e) { /* ignore */ }
  try { await dbRun(env.DB, 'DELETE FROM admin_fails WHERE ip = ?', subKey); } catch (e) { /* ignore */ }
  try { await dbRun(env.DB, 'DELETE FROM admin_fails WHERE ip = ?', GLOBAL_FAIL_KEY); } catch (e) { /* ignore */ }
  try { await dbRun(env.DB, 'DELETE FROM admin_fails WHERE until <= ?', nowMs() - ADMIN_FAIL_DECAY_MS); } catch (e) { /* ignore */ }
  try { await dbRun(env.DB, 'DELETE FROM admin_sessions WHERE exp <= ?', nowMs()); } catch (e) { /* ignore */ }
  const token = randomToken(32);
  await dbRun(env.DB, 'INSERT INTO admin_sessions (token,exp) VALUES (?,?)', token, nowMs() + ADMIN_SESSION_TTL * 1000);
  return json({ ok: true, token, expiresIn: ADMIN_SESSION_TTL, mustChange: !!auth.mustChange }, 200, request, env);
}

/** POST /api/admin/logout — 撤销当前会话 token */
export async function handleAdminLogout(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  const auth = String(request.headers.get('Authorization') || '').trim();
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (m) { try { await dbRun(env.DB, 'DELETE FROM admin_sessions WHERE token = ?', m[1].trim()); } catch (e) { /* ignore */ } }
  return json({ ok: true }, 200, request, env);
}

/* ============================================================
 * 评论管理（后台全局接口）
 *   GET  /api/comments            → 全部评论（可按 ?status=pending|approved 过滤），含所属文章标题
 *   PUT  /api/comments/:id        → 修改审核状态（approved / pending）
 *   DELETE /api/comments/:id      → 删除指定评论（按 id 跨文章定位）
 * 均为写操作，需会话 token 鉴权。
 * ============================================================ */

/** GET /api/comments（后台全局评论列表） */
export async function handleCommentsList(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  let status = 'all';
  try { const p = new URL(request.url).searchParams.get('status'); if (p) status = p; } catch (e) {}
  let sql = 'SELECT c.*, p.title AS post_title FROM comments c LEFT JOIN posts p ON c.post_id = p.id';
  const params = [];
  if (status === 'pending' || status === 'approved') { sql += ' WHERE c.status = ?'; params.push(status); }
  sql += ' ORDER BY c.rowid DESC';
  const list = await dbAll(env.DB, sql, ...params);
  return json({ ok: true, comments: list }, 200, request, env, { 'Cache-Control': NO_CACHE });
}

/** PUT /api/comments/:id（审核：通过 / 待审） */
export async function handleCommentUpdate(request, env, cid) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'PUT' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  const body = (await request.json().catch(() => null)) || {};
  const fields = [];
  const params = [];
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (body.status !== 'approved' && body.status !== 'pending') return json({ error: 'status 只能是 approved 或 pending' }, 400, request, env);
    fields.push('status = ?'); params.push(body.status);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'featured')) {
    fields.push('featured = ?'); params.push(body.featured ? 1 : 0);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'pinned')) {
    fields.push('pinned = ?'); params.push(body.pinned ? 1 : 0);
  }
  if (!fields.length) return json({ error: '缺少要更新的字段' }, 400, request, env);
  const exist = await dbFirst(env.DB, 'SELECT post_id FROM comments WHERE id = ?', cid);
  if (!exist) return json({ error: '评论不存在' }, 404, request, env);
  params.push(cid);
  await dbRun(env.DB, 'UPDATE comments SET ' + fields.join(', ') + ' WHERE id = ?', ...params);
  return json({ ok: true }, 200, request, env);
}

/** DELETE /api/comments/:id（按 id 全局删除） */
export async function handleCommentDeleteGlobal(request, env, cid) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  const exist = await dbFirst(env.DB, 'SELECT post_id FROM comments WHERE id = ?', cid);
  if (!exist) return json({ error: '评论不存在' }, 404, request, env);
  await dbRun(env.DB, 'DELETE FROM comments WHERE id = ?', cid);
  return json({ ok: true }, 200, request, env);
}

/* ============================================================
 * 媒体资源库（后台）
 *   GET    /api/media    → 列表
 *   POST   /api/media    → 登记元数据（url 为 R2 公开地址或 http(s) 外链）
 *   DELETE /api/media/:id→ 删除（先删 R2 对象，见 worker.js / media.js）
 * 图片本体一律存 R2（预签名直传），D1 只存元数据；
 * 不再接受 data:image base64 内嵌（历史遗留记录已由迁移 0014 清除）。
 * 均为写操作，需会话 token 鉴权。
 * ============================================================ */

export async function handleMedia(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method === 'GET') {
    const list = await dbAll(env.DB, 'SELECT * FROM media ORDER BY created_at DESC, id DESC');
    return json({ ok: true, media: list }, 200, request, env, { 'Cache-Control': NO_CACHE });
  }
  if (request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const url = String((body && body.url) || '').trim();
    if (!url) return json({ error: '缺少 url' }, 400, request, env);
    // 协议白名单：仅允许 http(s)——R2 公开地址或外部图床链接。
    // 拒绝 javascript: / vbscript: / data: 等，杜绝把脚本类内容登记为媒体。
    // 图片本体一律走 R2 预签名直传，不再接受 data:image base64 内嵌。
    if (!/^https?:\/\//i.test(url)) {
      return json({ error: '仅支持 http/https 链接（图片请走 R2 直传上传）' }, 400, request, env);
    }
    const id = 'm-' + randomToken(12);
    const name = String((body && body.name) || id).slice(0, 200);
    const type = String((body && body.type) || '').slice(0, 64);
    const size = Number((body && body.size) || 0) || 0;
    const thumbUrl = String((body && body.thumbUrl) || '').trim();
    const created_at = new Date().toISOString().slice(0, 10);
    await dbRun(env.DB, 'INSERT INTO media (id,name,url,thumb_url,type,size,created_at) VALUES (?,?,?,?,?,?,?)', id, name, url, thumbUrl, type, size, created_at);
    return json({ ok: true, media: { id, name, url, thumbUrl, type, size, created_at } }, 201, request, env, { 'Cache-Control': NO_CACHE });
  }
  return json({ error: 'Method not allowed' }, 405, request, env);
}

export async function handleMediaId(request, env, id) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  // 先确认存在：此前对不存在的 id 也返回 ok:true，前端无法区分「删掉了」与「本来就没有」。
  const exist = await dbFirst(env.DB, 'SELECT id FROM media WHERE id = ?', id).catch(() => null);
  if (!exist) return json({ error: '未找到该媒体' }, 404, request, env);
  try {
    await dbRun(env.DB, 'DELETE FROM media WHERE id = ?', id);
  } catch (e) {
    console.error('[media] delete failed:', e && e.message, e);
    return json({ error: '删除失败，请稍后重试' }, 500, request, env);
  }
  await recordAudit(env, request, 'media.delete', id);
  return json({ ok: true }, 200, request, env);
}

/* ============================================================
 * 站点设置（键值对，后台「博客设置」持久化）
 *   GET /api/settings → 返回全部设置（公开读取，均为站点配置，无敏感信息）
 *   PUT /api/settings → 合并写入（需会话 token 鉴权）
 * ============================================================ */

export async function handleSettings(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method === 'GET') {
    const rows = await dbAll(env.DB, 'SELECT k, v FROM site_settings').catch(() => []);
    const settings = {};
    (rows || []).forEach(function (r) { settings[r.k] = r.v; });
    return json({ ok: true, settings: settings }, 200, request, env, { 'Cache-Control': READ_CACHE });
  }
  if (request.method === 'PUT' || request.method === 'POST') {
    if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ error: '缺少配置对象' }, 400, request, env);
    // 批量原子写入：此前逐条 .catch(()=>{}) 会静默吞掉写失败并仍返回 ok:true，
    // 且逐条写入在中途失败时会把设置写一半（部分生效）。
    const stmts = Object.keys(body).map((k) => {
      let v = body[k];
      if (typeof v !== 'string') v = JSON.stringify(v);
      return {
        sql: 'INSERT INTO site_settings (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v',
        params: [k, v]
      };
    });
    if (stmts.length) {
      try {
        await dbBatch(env.DB, stmts);
      } catch (e) {
        console.error('[settings] batch write failed:', e && e.message, e);
        return json({ error: '设置保存失败，请稍后重试' }, 500, request, env);
      }
    }
    await recordAudit(env, request, 'settings.update', Object.keys(body).join(','));
    return json({ ok: true, saved: stmts.length }, 200, request, env, { 'Cache-Control': NO_CACHE });
  }
  return json({ error: 'Method not allowed' }, 405, request, env);
}

/* ============================================================
 * 管理员修改密码（需会话 token 鉴权 + 校验当前密码）
 *   POST /api/admin/password { current, password }
 * 成功后撤销所有会话，强制重新登录。
 * ============================================================ */

export async function handleAdminPassword(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isPasswordChangeAuthed(request, env))) return unauthorized(request, env);
  const body = await request.json().catch(() => null);
  const cur = String((body && body.current) || '');
  const pwd = String((body && body.password) || '');
  if (pwd.length < 8) return json({ error: '新密码至少 8 位' }, 400, request, env);
  const auth = await getAdminAuth(env);
  if (!auth || !auth.hash || !auth.salt) return json({ error: '尚未设置管理员密码' }, 400, request, env);
  const curHash = await deriveKey(cur, auth.salt, auth.iter || PBKDF2_ITER);
  if (!await safeEqual(curHash, auth.hash)) return json({ error: '当前密码不正确' }, 401, request, env);
  const salt = randomToken(16);
  const iter = PBKDF2_ITER;
  const hash = await deriveKey(pwd, salt, iter);
  await setAdminAuth(env, { salt, hash, iter, mustChange: false });
  try { await dbRun(env.DB, 'DELETE FROM admin_sessions'); } catch (e) {}
  return json({ ok: true, message: '密码已更新，请重新登录' }, 200, request, env);
}

/* ============================================================
 * 后台仪表盘：近 N 天访问 / 点赞趋势
 *   GET /api/stats/trend?days=30（需会话 token 鉴权）
 * ============================================================ */

function daysAgoStr(n) {
  return new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
}

export async function handleStatsTrend(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  let days = 30;
  try {
    const p = new URL(request.url).searchParams.get('days');
    if (p) days = Math.min(Math.max(parseInt(p, 10) || 30, 1), 90);
  } catch (e) {}
  const rows = await dbAll(env.DB, 'SELECT date, SUM(views) AS views, SUM(likes) AS likes FROM stats_daily WHERE date >= ? GROUP BY date', daysAgoStr(days)).catch(() => []);
  const map = {};
  (rows || []).forEach(function (r) { map[r.date] = { views: Number(r.views) || 0, likes: Number(r.likes) || 0 }; });
  const trend = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const e = map[d] || { views: 0, likes: 0 };
    trend.push({ date: d, views: e.views, likes: e.likes });
  }
  return json({ ok: true, trend: trend }, 200, request, env, { 'Cache-Control': NO_CACHE });
}

/* ============================================================
 * 后台操作审计日志（audit_log 表）
 *   GET    /api/admin/audit   最近操作（默认 200 条，可按 action 过滤）
 *   DELETE /api/admin/audit   清空日志
 * 记录失败一律静默，绝不影响主业务流程。
 * ============================================================ */

/** 写入一条审计日志（永不抛出） */
export async function recordAudit(env, request, action, target, detail) {
  try {
    if (!env || !env.DB || !action) return;
    const ip = request ? clientIp(request) : '';
    await dbRun(env.DB,
      'INSERT INTO audit_log (id,action,target,detail,ip,created_at) VALUES (?,?,?,?,?,?)',
      'a-' + randomToken(12), String(action), String(target || '').slice(0, 200),
      String(detail || '').slice(0, 300), String(ip || ''), Date.now());
  } catch (e) { /* 审计失败不影响业务 */ }
}

/** GET /api/admin/audit · DELETE /api/admin/audit */
export async function handleAuditLog(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);

  if (request.method === 'GET') {
    let limit = 200, action = '';
    try {
      const sp = new URL(request.url).searchParams;
      const l = Number(sp.get('limit'));
      if (l > 0 && l <= 500) limit = Math.floor(l);
      action = String(sp.get('action') || '');
    } catch (e) {}
    let sql = 'SELECT * FROM audit_log';
    const params = [];
    if (action) { sql += ' WHERE action = ?'; params.push(action); }
    sql += ' ORDER BY created_at DESC, id DESC LIMIT ' + limit;
    const rows = await dbAll(env.DB, sql, ...params).catch(() => []);
    const counts = {};
    (rows || []).forEach(function (r) { counts[r.action] = (counts[r.action] || 0) + 1; });
    return json({ ok: true, logs: rows || [], counts: counts }, 200, request, env, { 'Cache-Control': NO_CACHE });
  }

  if (request.method === 'DELETE') {
    await dbRun(env.DB, 'DELETE FROM audit_log');
    await recordAudit(env, request, 'audit.clear', '');
    return json({ ok: true }, 200, request, env);
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}

/** POST /api/admin/tags（批量重命名 / 删除标签，一次请求完成） */
export async function handleTags(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  const body = (await request.json().catch(() => null)) || {};
  const op = String(body.op || '');
  const from = String(body.from || '').trim();
  const to = String(body.to || '').trim();
  if (!from || (op !== 'rename' && op !== 'delete')) return json({ error: '参数不完整' }, 400, request, env);
  const rows = await dbAll(env.DB, 'SELECT id,tags FROM posts').catch(() => []);
  const stmts = [];
  (rows || []).forEach(function (r) {
    let tags = [];
    try { tags = Array.isArray(r.tags) ? r.tags : JSON.parse(r.tags || '[]'); } catch (e) { tags = []; }
    if (!Array.isArray(tags) || tags.indexOf(from) < 0) return;
    const next = [];
    tags.forEach(function (x) {
      if (x !== from) { if (next.indexOf(x) < 0) next.push(x); return; }
      if (op === 'rename' && to && next.indexOf(to) < 0) next.push(to);
    });
    stmts.push({ sql: 'UPDATE posts SET tags = ? WHERE id = ?', params: [JSON.stringify(next), r.id] });
  });
  if (stmts.length) await dbBatch(env.DB, stmts);
  await recordAudit(env, request, op === 'rename' ? 'tag.rename' : 'tag.delete', from, to);
  return json({ ok: true, updated: stmts.length }, 200, request, env, { 'Cache-Control': NO_CACHE });
}

/** GET /api/admin/stats/sources?days=30（需登录）：来源 Top + 设备占比 */
const ERROR_LOG_KEEP = 300;
const ERROR_CAPS = { message: 500, source: 300, stack: 4000, url: 500, ua: 300 };
/** 稳定指纹：同一错误（kind+message+source）聚合计数，避免刷爆表 */
function errorFingerprint(kind, message, source) {
  const str = String(kind || '') + '|' + String(message || '') + '|' + String(source || '');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16) + '-' + str.length;
}
export async function handleErrorReport(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  const ip = clientIp(request);
  if (env.BLOG) {
    const win = Math.floor(Date.now() / 60000);
    const rk = 'rate:err:' + ip + ':' + win;
    let cnt = 0;
    try { cnt = Number(await env.BLOG.get(rk)) || 0; } catch (e) {}
    if (cnt >= 20) return json({ ok: false }, 429, request, env);
    try { await env.BLOG.put(rk, String(cnt + 1), { expirationTtl: 120 }); } catch (e) {}
  }
  const body = await request.json().catch(() => null);
  const message = sanitizeText(String((body && body.message) || '').trim()).slice(0, ERROR_CAPS.message);
  if (!message) return json({ error: '缺少 message' }, 400, request, env);
  const kind = String((body && body.kind) || 'error').slice(0, 20);
  const source = String((body && body.source) || '').slice(0, ERROR_CAPS.source);
  const stack = String((body && body.stack) || '').slice(0, ERROR_CAPS.stack);
  const url = String((body && body.url) || '').slice(0, ERROR_CAPS.url);
  const ua = String(request.headers.get('User-Agent') || '').slice(0, ERROR_CAPS.ua);
  const fp = errorFingerprint(kind, message, source);
  const now = Date.now();
  await dbRun(env.DB,
    'INSERT INTO error_logs (fingerprint,kind,message,source,stack,url,ua,hits,created_at,last_at) VALUES (?,?,?,?,?,?,?,1,?,?) ' +
    'ON CONFLICT(fingerprint) DO UPDATE SET hits = hits + 1, last_at = excluded.last_at, url = excluded.url, ua = excluded.ua, stack = excluded.stack',
    fp, kind, message, source, stack, url, ua, now, now);
  await dbRun(env.DB, 'DELETE FROM error_logs WHERE id NOT IN (SELECT id FROM error_logs ORDER BY last_at DESC LIMIT ' + ERROR_LOG_KEEP + ')').catch(() => {});
  return json({ ok: true }, 200, request, env, { 'Cache-Control': NO_CACHE });
}
/** GET /api/admin/errors（需登录）：错误聚合列表；DELETE：清空 */
export async function handleErrorsAdmin(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method === 'DELETE') {
    await dbRun(env.DB, 'DELETE FROM error_logs').catch(() => {});
    return json({ ok: true }, 200, request, env, { 'Cache-Control': NO_CACHE });
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);
  const rows = await dbAll(env.DB, 'SELECT * FROM error_logs ORDER BY last_at DESC LIMIT 200').catch(() => []);
  let total = 0, sumHits = 0;
  try {
    const r = await dbFirst(env.DB, 'SELECT COUNT(*) AS n, COALESCE(SUM(hits),0) AS h FROM error_logs');
    total = Number(r && r.n) || 0; sumHits = Number(r && r.h) || 0;
  } catch (e) {}
  return json({ ok: true, total: total, sumHits: sumHits, errors: rows }, 200, request, env, { 'Cache-Control': NO_CACHE });
}
/** GET /api/admin/stats/sources?days=30（需登录）：来源 Top + 设备占比 */
export async function handleStatsSources(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  let days = 30;
  try { const d = Number(new URL(request.url).searchParams.get('days')); if (d > 0 && d <= 365) days = Math.floor(d); } catch (e) {}
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await dbAll(env.DB, 'SELECT kind,name,SUM(views) AS views FROM stats_sources WHERE date >= ? GROUP BY kind,name ORDER BY views DESC', since).catch(() => []);
  const refs = [], devices = [];
  let refTotal = 0, devTotal = 0;
  (rows || []).forEach(function (r) {
    const n = Number(r.views) || 0;
    if (r.kind === 'ref') { refs.push({ name: r.name, views: n }); refTotal += n; }
    else if (r.kind === 'device') { devices.push({ name: r.name, views: n }); devTotal += n; }
  });
  return json({ ok: true, days: days, since: since, referrers: refs.slice(0, 10), devices: devices, refTotal: refTotal, devTotal: devTotal }, 200, request, env, { 'Cache-Control': NO_CACHE });
}

/** GET /api/admin/health（需登录）：站点绑定与数据健康检查 */
export async function handleHealth(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  const items = [];
  let dbOk = false;
  const counts = {};
  try {
    await dbFirst(env.DB, 'SELECT 1 AS ok');
    dbOk = true;
    const tables = ['posts','comments','media','music','subscribers','backups','audit_log'];
    for (const t of tables) {
      const r = await dbFirst(env.DB, 'SELECT COUNT(*) AS c FROM ' + t).catch(() => null);
      counts[t] = r ? Number(r.c) : null;
    }
  } catch (e) {}
  items.push({ key: 'db', ok: dbOk, counts: counts });
  let kvOk = false;
  if (env.BLOG) {
    try {
      const probe = 'health:' + Date.now();
      await env.BLOG.put(probe, '1', { expirationTtl: 60 });
      kvOk = (await env.BLOG.get(probe)) !== null;
    } catch (e) {}
  }
  items.push({ key: 'kv', ok: kvOk, bound: !!env.BLOG });
  const r2Creds = !!(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT);
  items.push({ key: 'r2media', ok: r2Creds && !!env.R2_MEDIA_BUCKET, bound: !!env.R2_MEDIA_BUCKET });
  items.push({ key: 'r2backup', ok: r2Creds && !!env.R2_BACKUP_BUCKET, bound: !!env.R2_BACKUP_BUCKET });
  items.push({ key: 'ai', ok: !!env.AI, bound: !!env.AI });
  items.push({ key: 'mail', ok: !!(env.RESEND_API_KEY && env.BLOG_MAIL_FROM && env.SITE_URL), bound: !!env.RESEND_API_KEY });
  return json({ ok: true, items: items, checkedAt: Date.now() }, 200, request, env, { 'Cache-Control': NO_CACHE });
}

/** POST /api/admin/comments/bulk（需登录）：批量通过 / 待审 / 删除 */
export async function handleCommentsBulk(request, env) {
  if (!env || !env.DB) return json({ error: DB_ERR }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  const body = (await request.json().catch(() => null)) || {};
  const op = String(body.op || '');
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 200) : [];
  if (!ids.length || ['approve', 'pending', 'delete'].indexOf(op) < 0) {
    return json({ error: '参数不完整' }, 400, request, env);
  }
  const stmts = ids.map(function (id) {
    if (op === 'delete') return { sql: 'DELETE FROM comments WHERE id = ?', params: [id] };
    return { sql: 'UPDATE comments SET status = ? WHERE id = ?', params: [op === 'approve' ? 'approved' : 'pending', id] };
  });
  await dbBatch(env.DB, stmts);
  await recordAudit(env, request, 'comment.bulk', op + ' x' + ids.length);
  return json({ ok: true, updated: ids.length, op: op }, 200, request, env, { 'Cache-Control': NO_CACHE });
}
