/* ============================================================
 * 自动备份与恢复（D1 → 私有 R2 对象）
 * ------------------------------------------------------------
 * 复用现有 R2 S3 兼容凭据，单独使用 R2_BACKUP_BUCKET，避免把
 * 备份写入公开的音乐/媒体桶。自动备份由 Worker Cron 每日触发。
 * ============================================================ */
import { json, corsPreflight, isWriteAuthed, unauthorized, dbAll, dbFirst, dbRun, dbBatch } from './api-core.js';
import { presignPut, presignGet, r2DeleteObject } from './music.js';

const BACKUP_FORMAT = 'qingyu-blog-backup';
const BACKUP_VERSION = 2;
const MAX_BACKUPS = 30;
const TABLES = {
  posts: ['id','title','date','excerpt','content','cover','og_image','pinned','protected','enc','tags','category','series','series_order','status','publish_at'],
  post_revisions: ['id','post_id','title','date','excerpt','content','cover','og_image','pinned','protected','enc','tags','category','series','series_order','status','publish_at','reason','created_at'],
  comments: ['id','post_id','author','content','date','status','parent_id','likes','featured','pinned'],
  media: ['id','name','url','thumb_url','type','size','created_at'],
  music: ['id','title','artist','url','cover','size','duration','sort','created_at'],
  subscribers: ['id','email','status','token','locale','created_at','confirmed_at','unsubscribed_at','last_notified_at'],
  site_settings: ['k','v'],
  site_files: ['name','content','updated_at'],
  stats: ['post_id','likes','views'],
  stats_daily: ['post_id','date','views','likes']
};
const DELETE_ORDER = ['post_revisions','comments','stats_daily','stats','media','music','subscribers','site_files','site_settings','posts'];
const INSERT_ORDER = ['posts','post_revisions','comments','stats','stats_daily','media','music','subscribers','site_settings','site_files'];

function backupId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function bytesOf(s) { return new TextEncoder().encode(String(s || '')).length; }
export function backupConfigured(env) {
  return !!(env && env.DB && env.R2_BACKUP_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT);
}
function normalizeBackupRow(row) {
  if (!row) return null;
  let counts = {};
  try { counts = row.counts ? JSON.parse(row.counts) : {}; } catch (e) { counts = {}; }
  return {
    id: String(row.id || ''), key: String(row.object_key || ''), size: Number(row.size) || 0,
    reason: String(row.reason || 'manual'), createdAt: Number(row.created_at) || 0, counts: counts
  };
}
async function readTable(env, table) {
  const cols = TABLES[table] || [];
  if (!cols.length) return [];
  return await dbAll(env.DB, 'SELECT ' + cols.join(',') + ' FROM ' + table).catch(() => []);
}
async function pruneBackups(env) {
  const rows = await dbAll(env.DB, 'SELECT id,object_key FROM backups ORDER BY created_at DESC, id DESC').catch(() => []);
  for (const row of rows.slice(MAX_BACKUPS)) {
    try { await r2DeleteObject(env, row.object_key, env.R2_BACKUP_BUCKET); } catch (e) {}
    await dbRun(env.DB, 'DELETE FROM backups WHERE id = ?', row.id).catch(() => {});
  }
}
export async function createBackup(env, reason) {
  if (!backupConfigured(env)) throw new Error('R2 备份桶未配置（缺少 R2_BACKUP_BUCKET 或 R2 凭据）');
  const tables = {};
  const counts = {};
  for (const table of INSERT_ORDER) {
    const rows = await readTable(env, table);
    tables[table] = rows;
    counts[table] = rows.length;
  }
  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    reason: reason || 'manual',
    counts: counts,
    tables: tables
  };
  const text = JSON.stringify(payload);
  const id = backupId();
  const key = 'backups/qingyu-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + id + '.json';
  const contentType = 'application/json; charset=utf-8';
  const url = await presignPut(env, key, 900, env.R2_BACKUP_BUCKET, contentType);
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body: text });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('R2 备份上传失败 HTTP ' + res.status + (detail ? '（' + detail.slice(0, 160) + '）' : ''));
  }
  const createdAt = Date.now();
  await dbRun(env.DB,
    'INSERT INTO backups (id,object_key,size,reason,created_at,counts) VALUES (?,?,?,?,?,?)',
    id, key, bytesOf(text), reason || 'manual', createdAt, JSON.stringify(counts));
  await pruneBackups(env);
  return { id: id, key: key, size: bytesOf(text), reason: reason || 'manual', createdAt: createdAt, counts: counts };
}
async function loadBackup(env, id) {
  const row = await dbFirst(env.DB, 'SELECT * FROM backups WHERE id = ?', id);
  if (!row) throw new Error('备份不存在');
  const url = await presignGet(env, row.object_key, 900, env.R2_BACKUP_BUCKET);
  const res = await fetch(url);
  if (!res.ok) throw new Error('读取备份失败 HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.format !== BACKUP_FORMAT || !data.tables) throw new Error('备份文件格式无效');
  return { row: row, data: data };
}
function insertStatements(table, rows) {
  const cols = TABLES[table] || [];
  if (!cols.length || !rows || !rows.length) return [];
  const sql = 'INSERT OR REPLACE INTO ' + table + ' (' + cols.join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')';
  return rows.map((row) => ({ sql: sql, params: cols.map((col) => row[col] === undefined ? null : row[col]) }));
}
async function replaceTable(env, table, rows) {
  await dbBatch(env.DB, [{ sql: 'DELETE FROM ' + table, params: [] }]);
  const stmts = insertStatements(table, rows || []);
  for (let i = 0; i < stmts.length; i += 50) {
    await dbBatch(env.DB, stmts.slice(i, i + 50));
  }
}
export async function restoreBackup(env, id) {
  if (!backupConfigured(env)) throw new Error('R2 备份桶未配置');
  const loaded = await loadBackup(env, id);
  const safety = await createBackup(env, 'pre-restore');
  for (const table of DELETE_ORDER) await dbBatch(env.DB, [{ sql: 'DELETE FROM ' + table, params: [] }]);
  for (const table of INSERT_ORDER) await replaceTable(env, table, loaded.data.tables[table] || []);
  // 恢复完成后重建全文索引，确保 posts_fts 与 posts 完全一致
  await dbRun(env.DB, "INSERT INTO posts_fts(posts_fts) VALUES ('rebuild')").catch(() => {});
  return { restored: true, safety: safety, counts: loaded.data.counts || {} };
}
export async function handleBackups(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (request.method === 'GET') {
    const rows = await dbAll(env.DB, 'SELECT * FROM backups ORDER BY created_at DESC, id DESC').catch(() => []);
    return json({ ok: true, configured: backupConfigured(env), backups: rows.map(normalizeBackupRow).filter(Boolean) }, 200, request, env, { 'Cache-Control': 'no-store' });
  }
  if (request.method === 'POST') {
    if (!backupConfigured(env)) return json({ error: 'R2 备份桶未配置（请设置 R2_BACKUP_BUCKET）' }, 503, request, env);
    try {
      const backup = await createBackup(env, 'manual');
      return json({ ok: true, backup: backup }, 201, request, env, { 'Cache-Control': 'no-store' });
    } catch (e) {
      return json({ error: e.message || '备份失败' }, 500, request, env);
    }
  }
  return json({ error: 'Method not allowed' }, 405, request, env);
}
export async function handleBackupId(request, env, id) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (!backupConfigured(env)) return json({ error: 'R2 备份桶未配置' }, 503, request, env);
  if (request.method === 'GET') {
    try {
      const loaded = await loadBackup(env, id);
      return json(loaded.data, 200, request, env, {
        'Cache-Control': 'no-store',
        'Content-Disposition': 'attachment; filename="qingyu-backup-' + id + '.json"'
      });
    } catch (e) { return json({ error: e.message || '读取备份失败' }, 404, request, env); }
  }
  if (request.method === 'DELETE') {
    const row = await dbFirst(env.DB, 'SELECT * FROM backups WHERE id = ?', id);
    if (!row) return json({ error: '备份不存在' }, 404, request, env);
    try { await r2DeleteObject(env, row.object_key, env.R2_BACKUP_BUCKET); } catch (e) {}
    await dbRun(env.DB, 'DELETE FROM backups WHERE id = ?', id);
    return json({ ok: true }, 200, request, env);
  }
  return json({ error: 'Method not allowed' }, 405, request, env);
}
export async function handleBackupRestore(request, env, id) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (!backupConfigured(env)) return json({ error: 'R2 备份桶未配置' }, 503, request, env);
  try {
    const result = await restoreBackup(env, id);
    return json({ ok: true, result: result }, 200, request, env, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return json({ error: e.message || '恢复失败' }, 500, request, env);
  }
}
