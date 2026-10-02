/* ============================================================
 * 邮件订阅与文章通知（Resend，可选配置）
 * ------------------------------------------------------------
 * 需要环境变量：
 *   RESEND_API_KEY、BLOG_MAIL_FROM、SITE_URL
 * 可选：BLOG_MAIL_REPLY_TO
 * 订阅采用双重确认；文章发布后写入 mail_outbox，由 Cron 异步发送。
 * ============================================================ */
import { json, corsPreflight, isWriteAuthed, unauthorized, dbAll, dbFirst, dbRun } from './api-core.js';

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
export async function processMailOutbox(env, limit) {
  if (!mailConfigured(env)) return { sent: 0, failed: 0 };
  const rows = await dbAll(env.DB, "SELECT * FROM mail_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT " + Math.max(1, Math.min(Number(limit) || 20, 50)));
  let sent = 0, failed = 0;
  for (const row of rows) {
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
  rows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
  return json({ ok: true, enabled: mailConfigured(env), counts: counts, subscribers: rows }, 200, request, env, { 'Cache-Control': 'no-store' });
}
export async function handleSubscriberId(request, env, id) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405, request, env);
  await dbRun(env.DB, 'DELETE FROM subscribers WHERE id = ?', id).catch(() => {});
  return json({ ok: true }, 200, request, env);
}
