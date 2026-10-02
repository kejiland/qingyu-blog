/* ============================================================
 * 轻语博客 · 全文搜索（D1 FTS5 + LIKE 兼容回退）
 * ------------------------------------------------------------
 * · 3 个及以上字符：走 posts_fts（trigram，支持中英文子串）
 * · 1~2 个字符：FTS5 trigram 无法命中，自动回退 SQL LIKE
 * · 未执行 0023 迁移或 FTS 查询异常：同样回退 LIKE，接口不中断
 * · 只返回已发布、未加密文章，结果不包含正文，只带搜索片段
 * ============================================================ */
import { json, corsPreflight, dbAll } from './api-core.js';

const SEARCH_CACHE = 'public, s-maxage=30, stale-while-revalidate=120';
const MAX_QUERY = 80;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 20;

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSearchQuery(input) {
  return String(input || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY);
}

function termLength(term) {
  return Array.from(String(term || '')).length;
}

/** 将用户输入转换为 FTS5 安全短语查询（每个词用双引号包裹，避免语法注入） */
export function toFtsQuery(query) {
  return String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => '"' + term.replace(/"/g, '""') + '"')
    .join(' AND ');
}

function canUseFts(query) {
  const terms = String(query || '').trim().split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((term) => termLength(term) >= 3);
}

function escapeLike(query) {
  return String(query || '').replace(/[\\%_]/g, '\\$&');
}

function searchResultFromRow(row) {
  let tags = [];
  try { tags = row && row.tags ? JSON.parse(row.tags) : []; } catch (e) { tags = []; }
  if (!Array.isArray(tags)) tags = [];
  return {
    id: String((row && row.id) || ''),
    title: String((row && row.title) || ''),
    date: String((row && row.date) || ''),
    excerpt: String((row && row.excerpt) || ''),
    cover: String((row && row.cover) || ''),
    ogImage: String((row && row.og_image) || ''),
    pinned: !!(row && row.pinned),
    protected: false,
    category: String((row && row.category) || ''),
    series: String((row && row.series) || ''),
    seriesOrder: Number(row && row.series_order) || 0,
    status: 'published',
    publishAt: null,
    tags: tags.map((item) => String(item)),
    snippet: String((row && row.snippet) || '')
  };
}

const SEARCH_COLUMNS = [
  'p.id', 'p.title', 'p.date', 'p.excerpt', 'p.cover', 'p.og_image',
  'p.pinned', 'p.tags', 'p.category', 'p.series', 'p.series_order',
  'p.status', 'p.publish_at'
].join(',');

const PUBLIC_FILTER = "COALESCE(p.status, 'published') = 'published' AND COALESCE(p.protected, 0) = 0";

async function searchWithFts(db, query, page, pageSize) {
  const match = toFtsQuery(query);
  const totalRows = await dbAll(
    db,
    'SELECT COUNT(*) AS total FROM posts_fts JOIN posts p ON p.rowid = posts_fts.rowid ' +
    'WHERE posts_fts MATCH ? AND ' + PUBLIC_FILTER,
    match
  );
  const total = Number(totalRows[0] && totalRows[0].total) || 0;
  if (!total) return { total: 0, rows: [] };
  const rows = await dbAll(
    db,
    'SELECT ' + SEARCH_COLUMNS + ', ' +
    'bm25(posts_fts, 0.0, 8.0, 2.0, 1.0, 5.0) AS rank, ' +
    "snippet(posts_fts, 3, '', '', '…', 24) AS snippet " +
    'FROM posts_fts JOIN posts p ON p.rowid = posts_fts.rowid ' +
    'WHERE posts_fts MATCH ? AND ' + PUBLIC_FILTER + ' ' +
    'ORDER BY rank ASC, p.date DESC LIMIT ? OFFSET ?',
    match, pageSize, (page - 1) * pageSize
  );
  return { total, rows };
}

async function searchWithLike(db, query, page, pageSize) {
  const rawLike = '%' + escapeLike(query) + '%';
  const where =
    PUBLIC_FILTER + ' AND (' +
    "p.title LIKE ? ESCAPE '\\' OR p.excerpt LIKE ? ESCAPE '\\' OR " +
    "p.tags LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')";
  const totalRows = await dbAll(
    db,
    'SELECT COUNT(*) AS total FROM posts p WHERE ' + where,
    rawLike, rawLike, rawLike, rawLike
  );
  const total = Number(totalRows[0] && totalRows[0].total) || 0;
  if (!total) return { total: 0, rows: [] };
  const snippetSql =
    'CASE ' +
    "WHEN instr(lower(COALESCE(p.content, '')), lower(?)) > 0 " +
    "THEN substr(COALESCE(p.content, ''), MAX(1, instr(lower(COALESCE(p.content, '')), lower(?)) - 70), 220) " +
    "WHEN instr(lower(COALESCE(p.excerpt, '')), lower(?)) > 0 THEN p.excerpt " +
    "WHEN instr(lower(COALESCE(p.tags, '')), lower(?)) > 0 THEN p.tags " +
    'ELSE p.excerpt END AS snippet';
  const rows = await dbAll(
    db,
    'SELECT ' + SEARCH_COLUMNS + ', ' + snippetSql + ' FROM posts p WHERE ' + where + ' ' +
    'ORDER BY p.pinned DESC, p.date DESC LIMIT ? OFFSET ?',
    query, query, query, query,
    rawLike, rawLike, rawLike, rawLike,
    pageSize, (page - 1) * pageSize
  );
  return { total, rows };
}

/**
 * GET /api/search?q=关键词&page=1&pageSize=10
 * 公开接口：只搜索已发布、未加密文章；返回分页结果与搜索片段。
 */
export async function handleSearch(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置：请创建并绑定名为 DB 的 D1 数据库' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);

  const url = new URL(request.url);
  const query = normalizeSearchQuery(url.searchParams.get('q'));
  if (!query) return json({ error: '缺少搜索关键词' }, 400, request, env, { 'Cache-Control': 'no-store' });
  const page = clampInt(url.searchParams.get('page'), 1, 100000, 1);
  const pageSize = clampInt(url.searchParams.get('pageSize'), 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);

  let engine = 'like';
  let result = null;
  if (canUseFts(query)) {
    try {
      result = await searchWithFts(env.DB, query, page, pageSize);
      engine = 'fts5';
    } catch (e) {
      // 0023 尚未执行、FTS5 不可用或查询异常时，回退到兼容搜索，保证搜索始终可用。
      result = null;
    }
  }
  if (!result) result = await searchWithLike(env.DB, query, page, pageSize);

  const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
  const results = result.rows.map(searchResultFromRow);
  return json({
    ok: true,
    query: query,
    engine: engine,
    page: page,
    pageSize: pageSize,
    total: result.total,
    totalPages: totalPages,
    hasMore: page < totalPages,
    results: results
  }, 200, request, env, { 'Cache-Control': SEARCH_CACHE, 'Cache-Tag': 'posts,search' });
}