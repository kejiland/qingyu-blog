/* ============================================================
 * 热门文章与阅读数据排行
 * ------------------------------------------------------------
 * 综合得分：浏览 ×1 + 点赞 ×3 + 评论 ×5
 * range=all 使用累计 stats；range=7/30 使用 stats_daily 聚合。
 * 只统计已发布、未加密文章；结果带短缓存。
 * ============================================================ */
import { json, corsPreflight, dbAll } from './api-core.js';

const POPULAR_CACHE = 'public, s-maxage=60, stale-while-revalidate=180';
const DEFAULT_LIMIT = 20;

function rangeDays(range) {
  var r = String(range || 'all').toLowerCase();
  if (r === '7' || r === '7d') return 7;
  if (r === '30' || r === '30d') return 30;
  return 0;
}

function cutoffDate(days) {
  var d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function parseTags(value) {
  try {
    var tags = value ? JSON.parse(value) : [];
    return Array.isArray(tags) ? tags.map(function (tag) { return String(tag); }) : [];
  } catch (e) { return []; }
}

function publicPost(row) {
  return row && (row.status || 'published') === 'published' && !Number(row.protected || 0);
}

function meta(row, stats) {
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    date: String(row.date || ''),
    excerpt: String(row.excerpt || ''),
    cover: String(row.cover || ''),
    ogImage: String(row.og_image || ''),
    tags: parseTags(row.tags),
    series: String(row.series || ''),
    seriesOrder: Number(row.series_order) || 0,
    views: Number(stats.views) || 0,
    likes: Number(stats.likes) || 0,
    comments: Number(stats.comments) || 0,
    score: (Number(stats.views) || 0) + (Number(stats.likes) || 0) * 3 + (Number(stats.comments) || 0) * 5
  };
}

/** GET /api/popular?range=all|7|30 */
export async function handlePopular(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置：请创建并绑定名为 DB 的 D1 数据库' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);

  var url = new URL(request.url);
  var days = rangeDays(url.searchParams.get('range'));
  var limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || DEFAULT_LIMIT));
  var rows = [];
  var statsRows = [];
  var commentRows = [];
  var dailyRows = [];
  try { rows = await dbAll(env.DB, 'SELECT * FROM posts'); } catch (e) { rows = []; }
  try { statsRows = await dbAll(env.DB, 'SELECT * FROM stats'); } catch (e) { statsRows = []; }
  try { commentRows = await dbAll(env.DB, 'SELECT post_id,status,date FROM comments'); } catch (e) { commentRows = []; }
  try { dailyRows = days ? await dbAll(env.DB, 'SELECT * FROM stats_daily') : []; } catch (e) { dailyRows = []; }

  var stats = {};
  if (days) {
    var cutoff = cutoffDate(days);
    dailyRows.forEach(function (row) {
      if (!row || String(row.date || '') < cutoff) return;
      var key = String(row.post_id || '');
      if (!stats[key]) stats[key] = { views: 0, likes: 0, comments: 0 };
      stats[key].views += Number(row.views) || 0;
      stats[key].likes += Number(row.likes) || 0;
    });
  } else {
    statsRows.forEach(function (row) {
      var key = String(row.post_id || '');
      stats[key] = { views: Number(row.views) || 0, likes: Number(row.likes) || 0, comments: 0 };
    });
  }
  var commentCutoff = days ? cutoffDate(days) : '';
  commentRows.forEach(function (row) {
    var status = row.status || 'approved';
    if (status !== 'approved' && status !== null) return;
    if (commentCutoff && String(row.date || '') < commentCutoff) return;
    var key = String(row.post_id || '');
    if (!stats[key]) stats[key] = { views: 0, likes: 0, comments: 0 };
    stats[key].comments++;
  });

  var items = (rows || []).filter(publicPost).map(function (row) {
    return meta(row, stats[String(row.id)] || {});
  }).sort(function (a, b) {
    return b.score - a.score || b.views - a.views || String(b.date || '').localeCompare(String(a.date || ''));
  }).slice(0, limit);

  return json({
    ok: true,
    range: days ? String(days) : 'all',
    items: items
  }, 200, request, env, { 'Cache-Control': POPULAR_CACHE, 'Cache-Tag': 'posts,stats,popular' });
}