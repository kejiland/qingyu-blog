/* ============================================================
 * 后台文章数据分析
 * ------------------------------------------------------------
 * GET /api/admin/post-analytics?range=all|7|30
 * · 需要管理员会话
 * · 返回每篇文章的浏览、点赞、评论、综合得分
 * · range=7/30 使用 stats_daily 聚合；all 使用累计 stats
 * ============================================================ */
import { json, corsPreflight, isWriteAuthed, unauthorized, dbAll } from './api-core.js';

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
function metricsFor(row, stats) {
  var views = Number(stats && stats.views) || 0;
  var likes = Number(stats && stats.likes) || 0;
  var comments = Number(stats && stats.comments) || 0;
  return {
    id: String(row.id || ''),
    title: String(row.title || ''),
    date: String(row.date || ''),
    excerpt: String(row.excerpt || ''),
    status: row.status || 'published',
    tags: parseTags(row.tags),
    series: String(row.series || ''),
    seriesOrder: Number(row.series_order) || 0,
    views: views,
    likes: likes,
    comments: comments,
    score: views + likes * 3 + comments * 5
  };
}
export async function handlePostAnalytics(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);

  var url = new URL(request.url);
  var days = rangeDays(url.searchParams.get('range'));
  var rows = [];
  var statsRows = [];
  var commentRows = [];
  var dailyRows = [];
  try { rows = await dbAll(env.DB, 'SELECT * FROM posts'); } catch (e) { rows = []; }
  try { statsRows = await dbAll(env.DB, 'SELECT * FROM stats'); } catch (e) { statsRows = []; }
  try { commentRows = await dbAll(env.DB, 'SELECT post_id,status,date FROM comments'); } catch (e) { commentRows = []; }
  try { dailyRows = await dbAll(env.DB, 'SELECT * FROM stats_daily'); } catch (e) { dailyRows = []; }

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

  var trendDays = days || 30;
  var trendStart = cutoffDate(trendDays - 1);
  var trendDates = [];
  for (var di = trendDays - 1; di >= 0; di--) trendDates.push(cutoffDate(di));
  var trendMap = {};
  trendDates.forEach(function (date) { trendMap[date] = { views: 0, likes: 0, comments: 0 }; });
  dailyRows.forEach(function (row) {
    if (!row || String(row.date || '') < trendStart || !trendMap[row.date]) return;
    trendMap[row.date].views += Number(row.views) || 0;
    trendMap[row.date].likes += Number(row.likes) || 0;
  });
  commentRows.forEach(function (row) {
    var status = row.status || 'approved';
    if (status !== 'approved' && status !== null) return;
    if (!row || !row.date || String(row.date) < trendStart || !trendMap[row.date]) return;
    trendMap[row.date].comments += 1;
  });

  var items = (rows || []).map(function (row) {
    var item = metricsFor(row, stats[String(row.id)] || {});
    item.trend = trendDates.map(function (date) { return { date: date, views: trendMap[date].views, likes: trendMap[date].likes, comments: trendMap[date].comments }; });
    return item;
  });
  items.sort(function (a, b) { return b.score - a.score || b.views - a.views || String(b.date || '').localeCompare(String(a.date || '')); });
  var summary = items.reduce(function (acc, item) {
    acc.views += item.views;
    acc.likes += item.likes;
    acc.comments += item.comments;
    return acc;
  }, { views: 0, likes: 0, comments: 0, posts: items.length });
  return json({ ok: true, range: days ? String(days) : 'all', trendDays: trendDays, summary: summary, items: items }, 200, request, env, { 'Cache-Control': 'no-store' });
}