/* ============================================================
 * 邮件订阅与文章通知（Resend，可选配置）
 * ------------------------------------------------------------
 * 需要环境变量：
 *   RESEND_API_KEY、BLOG_MAIL_FROM、SITE_URL
 * 可选：BLOG_MAIL_REPLY_TO
 * 订阅采用双重确认；文章发布后写入 mail_outbox，由 Cron 异步发送。
 * ============================================================ */
import { json, corsPreflight, isWriteAuthed, unauthorized, dbAll, dbFirst, dbRun, dbBatch } from './api-core.js';

function randomToken() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}
function normalizeEmail(v) {
  const email = String(v || '').trim().toLowerCase();
  if (email.length < 5 || email.length > 254) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}
/* 订阅者分组：DB 里存 JSON 数组字符串；这里做读写归一化（去重 / 去空 / 限量） */
export function parseSubscriberGroups(v) {
  if (Array.isArray(v)) return v.map((x) => String(x == null ? '' : x).trim()).filter(Boolean);
  try {
    const arr = JSON.parse(String(v == null || v === '' ? '[]' : v));
    return Array.isArray(arr) ? arr.map((x) => String(x == null ? '' : x).trim()).filter(Boolean) : [];
  } catch (e) { return []; }
}
export function normalizeSubscriberGroups(v) {
  const raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,，]/);
  const seen = {};
  const out = [];
  for (const item of raw) {
    const g = String(item == null ? '' : item).trim().slice(0, 40);
    if (!g || seen[g]) continue;
    seen[g] = 1; out.push(g);
    if (out.length >= 20) break;
  }
  return out;
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function mailConfigured(env) {
  return !!(env && env.RESEND_API_KEY && env.BLOG_MAIL_FROM && env.SITE_URL);
}
function publicBase(env) {
  return String((env && env.SITE_URL) || '').replace(/\/+$/, '');
}
async function sendEmail(env, to, subject, html) {
  if (!mailConfigured(env)) throw new Error('邮件服务未配置（RESEND_API_KEY / BLOG_MAIL_FROM / SITE_URL）');
  const body = { from: env.BLOG_MAIL_FROM, to: [to], subject: subject, html: html };
  if (env.BLOG_MAIL_REPLY_TO) body.reply_to = env.BLOG_MAIL_REPLY_TO;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('邮件发送失败 HTTP ' + res.status + (detail ? '（' + detail.slice(0, 140) + '）' : ''));
  }
  return true;
}
function redirectPage(url) {
  return new Response('', { status: 302, headers: { 'Location': url, 'Cache-Control': 'no-store' } });
}
async function sendConfirmation(env, sub) {
  const base = publicBase(env);
  const url = base + '/api/subscribe/confirm?token=' + encodeURIComponent(sub.token);
  const html = '<div style="font-family:system-ui,sans-serif;max-width:620px;margin:auto;line-height:1.7">' +
    '<h2>确认订阅</h2><p>你好，点击下面的按钮确认订阅本博客的新文章通知：</p>' +
    '<p><a href="' + escHtml(url) + '" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#c25e3a;color:#fff;text-decoration:none">确认订阅</a></p>' +
    '<p style="color:#888;font-size:13px">如果不是你本人操作，可以忽略这封邮件。</p></div>';
  await sendEmail(env, sub.email, '确认订阅新文章通知', html);
}
export async function handleSubscribe(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method === 'GET') return json({ ok: true, enabled: mailConfigured(env) }, 200, request, env, { 'Cache-Control': 'no-store' });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!mailConfigured(env)) return json({ error: '邮件订阅尚未配置' }, 503, request, env);
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body && body.email);
  if (!email) return json({ error: '请输入有效邮箱' }, 400, request, env);
  const locale = String((body && body.locale) || 'zh-CN').slice(0, 16);
  const existing = await dbFirst(env.DB, 'SELECT * FROM subscribers WHERE email = ?', email);
  if (existing && existing.status === 'active') return json({ ok: true, already: true }, 200, request, env);
  const token = randomToken();
  const id = existing ? existing.id : ('sub-' + randomToken().slice(0, 16));
  const now = Date.now();
  await dbRun(env.DB,
    'INSERT INTO subscribers (id,email,status,token,locale,created_at,confirmed_at,unsubscribed_at,last_notified_at) VALUES (?,?,?,?,?,?,?,?,?) ' +
    'ON CONFLICT(email) DO UPDATE SET status = excluded.status, token = excluded.token, locale = excluded.locale, unsubscribed_at = excluded.unsubscribed_at',
    id, email, 'pending', token, locale, existing ? existing.created_at : now, existing ? existing.confirmed_at : null, null, existing ? existing.last_notified_at : null);
  await sendConfirmation(env, { email: email, token: token });
  return json({ ok: true, message: '确认邮件已发送' }, 200, request, env);
}
export async function handleSubscribeConfirm(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  const token = new URL(request.url).searchParams.get('token') || '';
  const sub = token ? await dbFirst(env.DB, 'SELECT * FROM subscribers WHERE token = ?', token) : null;
  const base = publicBase(env) || new URL(request.url).origin;
  if (!sub) return redirectPage(base + '/subscribe?confirmed=0');
  await dbRun(env.DB, "UPDATE subscribers SET status = 'active', confirmed_at = ?, unsubscribed_at = NULL WHERE id = ?", Date.now(), sub.id);
  return redirectPage(base + '/subscribe?confirmed=1');
}
export async function handleUnsubscribe(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  const token = new URL(request.url).searchParams.get('token') || '';
  const sub = token ? await dbFirst(env.DB, 'SELECT * FROM subscribers WHERE token = ?', token) : null;
  const base = publicBase(env) || new URL(request.url).origin;
  if (!sub) return redirectPage(base + '/subscribe?unsubscribed=0');
  await dbRun(env.DB, "UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ?", Date.now(), sub.id);
  return redirectPage(base + '/subscribe?unsubscribed=1');
}
async function sendPostNotification(env, outbox, post, sub) {
  const base = publicBase(env);
  const postUrl = base + '/posts/' + encodeURIComponent(post.id) + '/';
  const unsub = base + '/api/subscribe/unsubscribe?token=' + encodeURIComponent(sub.token);
  const excerpt = String(post.excerpt || '').slice(0, 220);
  const html = '<div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;line-height:1.75">' +
    '<h2 style="margin-bottom:8px">' + escHtml(post.title || '新文章') + '</h2>' +
    '<p style="color:#777">' + escHtml(post.date || '') + '</p>' +
    (excerpt ? '<p>' + escHtml(excerpt) + '</p>' : '') +
    '<p><a href="' + escHtml(postUrl) + '" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#c25e3a;color:#fff;text-decoration:none">阅读全文</a></p>' +
    '<p style="margin-top:32px;color:#999;font-size:12px">不想再收到邮件？<a href="' + escHtml(unsub) + '">取消订阅</a></p></div>';
  await sendEmail(env, sub.email, '新文章：' + (post.title || ''), html);
}
async function sendCommentNotification(env, row) {
  var payload = {};
  try { payload = row.payload ? JSON.parse(row.payload) : {}; } catch (e) { payload = {}; }
  var base = publicBase(env);
  var postTitle = payload.postTitle || '未命名文章';
  var postUrl = base + '/posts/' + encodeURIComponent(payload.postId || '') + '/';
  var adminUrl = base + '/admin/comments' + (payload.status === 'pending' ? '/pending' : '');
  var statusLabel = payload.status === 'pending' ? '待审核' : '已通过';
  var html = '<div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;line-height:1.7">' +
    '<h2>收到新评论</h2>' +
    '<p><b>' + escHtml(payload.author || '匿名') + '</b> 评论了《<a href="' + escHtml(postUrl) + '">' + escHtml(postTitle) + '</a>》</p>' +
    '<blockquote style="margin:14px 0;padding:12px 14px;border-left:3px solid #c25e3a;background:#faf7f2;white-space:pre-wrap">' + escHtml(payload.content || '') + '</blockquote>' +
    '<p>状态：' + escHtml(statusLabel) + '</p>' +
    '<p><a href="' + escHtml(adminUrl) + '" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#c25e3a;color:#fff;text-decoration:none">前往后台查看</a></p></div>';
  await sendEmail(env, row.to_email, '新评论：' + postTitle, html);
}
/* 站长群发：正文是纯文本，转义后换行转 <br>，底部保留退订入口 */
async function sendBroadcastEmail(env, row, sub) {
  var payload = {};
  try { payload = row.payload ? JSON.parse(row.payload) : {}; } catch (e) { payload = {}; }
  var base = publicBase(env);
  var unsub = base + '/api/subscribe/unsubscribe?token=' + encodeURIComponent(sub.token);
  var subject = String(payload.subject || '来自博客的邮件');
  var bodyHtml = escHtml(payload.body || '').replace(/\n/g, '<br>');
  var html = '<div style="font-family:system-ui,sans-serif;max-width:640px;margin:auto;line-height:1.75">' +
    '<h2 style="margin-bottom:12px">' + escHtml(subject) + '</h2>' +
    '<div>' + bodyHtml + '</div>' +
    '<p style="margin-top:32px;color:#999;font-size:12px">不想再收到邮件？<a href="' + escHtml(unsub) + '">取消订阅</a></p></div>';
  await sendEmail(env, sub.email, subject, html);
}
export async function processMailOutbox(env, limit) {
  if (!mailConfigured(env)) return { sent: 0, failed: 0 };
  const rows = await dbAll(env.DB, "SELECT * FROM mail_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT " + Math.max(1, Math.min(Number(limit) || 20, 50)));
  let sent = 0, failed = 0;
  for (const row of rows) {
    if (row.kind === 'comment') {
      try {
        await sendCommentNotification(env, row);
        await dbRun(env.DB, "UPDATE mail_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = '' WHERE id = ?", Date.now(), row.id);
        sent++;
      } catch (e) {
        failed++;
        await dbRun(env.DB, 'UPDATE mail_outbox SET attempts = attempts + 1, error = ? WHERE id = ?', String(e.message || e).slice(0, 300), row.id);
      }
      continue;
    }
    if (row.kind === 'broadcast') {
      const bsub = await dbFirst(env.DB, 'SELECT * FROM subscribers WHERE email = ?', row.to_email);
      if (!bsub || bsub.status !== 'active') {
        await dbRun(env.DB, "UPDATE mail_outbox SET status = 'skipped', error = 'subscriber unavailable', sent_at = ? WHERE id = ?", Date.now(), row.id);
        continue;
      }
      try {
        await sendBroadcastEmail(env, row, bsub);
        await dbRun(env.DB, "UPDATE mail_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = '' WHERE id = ?", Date.now(), row.id);
        sent++;
      } catch (e) {
        failed++;
        await dbRun(env.DB, 'UPDATE mail_outbox SET attempts = attempts + 1, error = ? WHERE id = ?', String(e.message || e).slice(0, 300), row.id);
      }
      continue;
    }
    const post = await dbFirst(env.DB, 'SELECT * FROM posts WHERE id = ?', row.post_id);
    const sub = await dbFirst(env.DB, 'SELECT * FROM subscribers WHERE email = ?', row.to_email);
    if (!post || !sub || sub.status !== 'active' || (post.status || 'published') !== 'published') {
      await dbRun(env.DB, "UPDATE mail_outbox SET status = 'skipped', error = 'article or subscriber unavailable', sent_at = ? WHERE id = ?", Date.now(), row.id);
      continue;
    }
    try {
      await sendPostNotification(env, row, post, sub);
      await dbRun(env.DB, "UPDATE mail_outbox SET status = 'sent', sent_at = ?, attempts = attempts + 1, error = '' WHERE id = ?", Date.now(), row.id);
      await dbRun(env.DB, 'UPDATE subscribers SET last_notified_at = ? WHERE email = ?', Date.now(), sub.email);
      sent++;
    } catch (e) {
      failed++;
      await dbRun(env.DB, "UPDATE mail_outbox SET attempts = attempts + 1, error = ? WHERE id = ?", String(e.message || e).slice(0, 300), row.id);
    }
  }
  return { sent: sent, failed: failed };
}
export async function handleSubscribersAdmin(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, request, env);
  const rows = await dbAll(env.DB, 'SELECT * FROM subscribers ORDER BY created_at DESC');
  const counts = { total: rows.length, active: 0, pending: 0, unsubscribed: 0 };
  const groupCount = {};
  const subscribers = rows.map((r) => {
    const groups = parseSubscriberGroups(r.groups);
    groups.forEach((g) => { groupCount[g] = (groupCount[g] || 0) + 1; });
    if (counts[r.status] !== undefined) counts[r.status]++;
    return Object.assign({}, r, { groups: groups });
  });
  const groups = Object.keys(groupCount).sort((a, b) => a.localeCompare(b)).map((name) => ({ name: name, count: groupCount[name] }));
  return json({ ok: true, enabled: mailConfigured(env), counts: counts, groups: groups, subscribers: subscribers }, 200, request, env, { 'Cache-Control': 'no-store' });
}
export async function handleSubscriberId(request, env, id) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    const groups = normalizeSubscriberGroups(body && body.groups);
    await dbRun(env.DB, 'UPDATE subscribers SET groups = ? WHERE id = ?', JSON.stringify(groups), id);
    return json({ ok: true, groups: groups }, 200, request, env);
  }
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405, request, env);
  await dbRun(env.DB, 'DELETE FROM subscribers WHERE id = ?', id).catch(() => {});
  return json({ ok: true }, 200, request, env);
}
/* 站长群发：按分组（留空=全部已确认订阅者）投递到发件箱，由 Cron 异步发送 */
export async function handleSubscriberBroadcast(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!mailConfigured(env)) return json({ error: '邮件服务未配置（RESEND_API_KEY / BLOG_MAIL_FROM / SITE_URL）' }, 503, request, env);
  const body = await request.json().catch(() => null);
  const subject = String((body && body.subject) || '').trim().slice(0, 160);
  const text = String((body && body.body) || '').trim().slice(0, 20000);
  const groups = normalizeSubscriberGroups(body && body.groups);
  if (!subject) return json({ error: '请填写邮件主题' }, 400, request, env);
  if (!text) return json({ error: '请填写邮件正文' }, 400, request, env);
  const rows = await dbAll(env.DB, "SELECT * FROM subscribers WHERE status = 'active'");
  const targets = groups.length
    ? rows.filter((r) => parseSubscriberGroups(r.groups).some((g) => groups.indexOf(g) >= 0))
    : rows;
  if (!targets.length) return json({ ok: true, queued: 0, groups: groups }, 200, request, env);
  const outboxId = 'broadcast-' + Date.now().toString(36) + '-' + randomToken().slice(0, 6);
  const payload = JSON.stringify({ subject: subject, body: text });
  const now = Date.now();
  const stmts = targets.map((r) => ({
    sql: 'INSERT OR IGNORE INTO mail_outbox (post_id,to_email,status,attempts,error,created_at,kind,payload) VALUES (?,?,?,?,?,?,?,?)',
    params: [outboxId, r.email, 'pending', 0, '', now, 'broadcast', payload]
  }));
  for (let i = 0; i < stmts.length; i += 100) await dbBatch(env.DB, stmts.slice(i, i + 100));
  return json({ ok: true, queued: targets.length, groups: groups }, 200, request, env);
}
