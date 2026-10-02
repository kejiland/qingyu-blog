/* ============================================================
 * 文章双向链接与相关文章推荐
 * ------------------------------------------------------------
 * · 解析 [[文章标题]]、[[文章标题|显示文字]] 以及 /posts/<id>/ 链接
 * · 返回引用当前文章的文章（backlinks）
 * · 按共同标签、同系列和发布时间推荐相关文章
 * · 只读取已发布、未加密文章；接口结果可边缘缓存
 * ============================================================ */
import { json, corsPreflight, dbAll } from './api-core.js';

const RELATIONS_CACHE = 'public, s-maxage=300, stale-while-revalidate=600';
const MAX_BACKLINKS = 8;
const MAX_RELATED = 4;

function normalizeText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

function parseTags(value) {
  let tags = [];
  try { tags = value ? JSON.parse(value) : []; } catch (e) { tags = []; }
  if (!Array.isArray(tags)) tags = [];
  return tags.map((item) => String(item).trim()).filter(Boolean);
}

function publicPostRows(rows, currentId) {
  return (rows || []).filter((row) => {
    if (!row || String(row.id) === String(currentId)) return false;
    if ((row.status || 'published') !== 'published') return false;
    return !Number(row.protected || 0);
  });
}

function buildLookup(rows) {
  const byId = {};
  const byTitle = {};
  const bySlug = {};
  (rows || []).forEach((row) => {
    const id = String((row && row.id) || '');
    const title = String((row && row.title) || '');
    if (!id) return;
    byId[id] = id;
    const titleKey = normalizeText(title);
    if (titleKey && !byTitle[titleKey]) byTitle[titleKey] = id;
    const slugKey = slug(title);
    if (slugKey && !bySlug[slugKey]) bySlug[slugKey] = id;
  });
  return { byId, byTitle, bySlug };
}

function resolveRef(ref, lookup) {
  let key = String(ref || '').trim();
  if (!key) return '';
  try { key = decodeURIComponent(key); } catch (e) { /* keep original */ }
  if (lookup.byId[key]) return lookup.byId[key];
  const titleKey = normalizeText(key);
  if (lookup.byTitle[titleKey]) return lookup.byTitle[titleKey];
  const slugKey = slug(key);
  return lookup.bySlug[slugKey] || '';
}

function postIdFromUrl(url) {
  let value = String(url || '').trim().replace(/^<|>$/g, '');
  if (!value) return '';
  if (value.indexOf('#/') === 0) value = value.slice(1);
  try {
    const parsed = /^https?:\/\//i.test(value) ? new URL(value) : null;
    const pathname = parsed ? parsed.pathname : value.split(/[?#]/)[0];
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'posts' && parts[1]) {
      try { return decodeURIComponent(parts[1]); } catch (e) { return parts[1]; }
    }
  } catch (e) { /* ignore malformed links */ }
  return '';
}

/** 提取正文中的站内文章引用（Wiki 链接 + Markdown 站内链接） */
export function parsePostLinkRefs(content) {
  const refs = [];
  const src = String(content || '');
  const wikiRe = /\[\[([^\[\]\n]{1,160})\]\]/g;
  let m;
  while ((m = wikiRe.exec(src)) !== null) refs.push(String(m[1]).split('|')[0].trim());

  const mdRe = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  while ((m = mdRe.exec(src)) !== null) {
    const id = postIdFromUrl(m[1]);
    if (id) refs.push(id);
  }
  return refs.filter(Boolean);
}

function uniqueTargets(refs, lookup) {
  const out = [];
  const seen = {};
  (refs || []).forEach((ref) => {
    const id = resolveRef(ref, lookup);
    if (id && !seen[id]) { seen[id] = true; out.push(id); }
  });
  return out;
}

function relationMeta(row) {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    date: String(row.date || ''),
    excerpt: String(row.excerpt || ''),
    cover: String(row.cover || ''),
    ogImage: String(row.og_image || ''),
    pinned: !!Number(row.pinned || 0),
    tags: parseTags(row.tags),
    series: String(row.series || ''),
    seriesOrder: Number(row.series_order) || 0
  };
}

function relationScore(current, other) {
  const currentTags = parseTags(current.tags);
  const otherTags = parseTags(other.tags);
  const otherSet = {};
  otherTags.forEach((tag) => { otherSet[normalizeText(tag)] = true; });
  const shared = currentTags.filter((tag) => otherSet[normalizeText(tag)]).length;
  const sameSeries = current.series && other.series && String(current.series) === String(other.series) ? 1 : 0;
  return shared * 5 + sameSeries * 8;
}

function sortRecent(a, b) {
  return String(b.date || '').localeCompare(String(a.date || '')) || String(a.id).localeCompare(String(b.id));
}

/** GET /api/posts/:id/relations */
export async function handlePostRelations(request, env, id) {
  if (!env || !env.DB) return json({ error: '数据库未配置：请创建并绑定名为 DB 的 D1 数据库' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);

  let rows = [];
  try { rows = await dbAll(env.DB, 'SELECT * FROM posts'); } catch (e) { rows = []; }
  const current = (rows || []).find((row) => row && String(row.id) === String(id));
  if (!current || (current.status || 'published') !== 'published' || Number(current.protected || 0)) {
    return json({ error: '未找到该内容' }, 404, request, env, { 'Cache-Control': 'no-store' });
  }

  const others = publicPostRows(rows, id);
  const lookup = buildLookup([current].concat(others));
  const backlinks = [];
  const backlinkIds = {};
  const scores = {};

  others.forEach((row) => {
    const refs = parsePostLinkRefs(row.content || '');
    const targets = uniqueTargets(refs, lookup);
    if (targets.indexOf(String(id)) >= 0) {
      backlinks.push(relationMeta(row));
      backlinkIds[String(row.id)] = true;
    }
    const score = relationScore(current, row);
    if (score > 0) scores[String(row.id)] = score;
  });

  backlinks.sort(sortRecent);
  const related = others
    .filter((row) => !backlinkIds[String(row.id)])
    .slice()
    .sort((a, b) => (scores[String(b.id)] || 0) - (scores[String(a.id)] || 0) || sortRecent(a, b))
    .filter((row) => scores[String(row.id)] > 0)
    .slice(0, MAX_RELATED)
    .map(relationMeta);

  if (related.length < MAX_RELATED) {
    const used = {};
    related.forEach((item) => { used[item.id] = true; });
    backlinks.forEach((item) => { used[item.id] = true; });
    others.slice().sort(sortRecent).forEach((row) => {
      if (related.length >= MAX_RELATED) return;
      if (used[String(row.id)]) return;
      used[String(row.id)] = true;
      related.push(relationMeta(row));
    });
  }

  return json({
    ok: true,
    postId: String(id),
    related: related,
    backlinks: backlinks.slice(0, MAX_BACKLINKS)
  }, 200, request, env, { 'Cache-Control': RELATIONS_CACHE, 'Cache-Tag': 'posts,relations,post:' + id });
}