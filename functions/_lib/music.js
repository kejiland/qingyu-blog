/* ============================================================
 * 音乐模块（Cloudflare R2 直传 + D1 播放列表元数据）
 * ------------------------------------------------------------
 * 上传方式：浏览器直传 R2（S3 兼容预签名 URL，SigV4），
 *   Worker 只负责签发临时 PUT URL，不中转文件内容：
 *   · R2 egress 免费 → 播放流量不占 Worker 带宽
 *   · Worker 请求体上限 100MB 的问题天然规避
 * 环境变量（wrangler secret / CI secret）：
 *   · R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT
 *       （Cloudflare 控制台 → R2 → 管理 API 令牌，S3 兼容凭据）
 *   · R2_BUCKET        存储桶名（如 qingyu-music）
 *   · R2_PUBLIC_BASE   公开读取基址（桶绑定的自定义域名，如
 *       https://music.example.com；末尾不带斜杠）
 * 降级：未配置 R2 凭据时，读取播放列表仍可用（D1），上传返回 503。
 * ============================================================ */
import { getCorsHeaders, json, corsPreflight, isWriteAuthed, unauthorized, dbAll, dbFirst, dbRun } from './api-core.js';

const enc = new TextEncoder();

/* ---------- SigV4（AWS Signature Version 4，HMAC-SHA256） ---------- */
function hexify(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}
async function hmac(keyBytes, dataStr) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(dataStr)));
}
async function signingKey(secret, dateStamp, region, service) {
  const dk = await hmac(enc.encode('AWS4' + secret), dateStamp);
  const rk = await hmac(dk, region);
  const sk = await hmac(rk, service);
  return hmac(sk, 'aws4_request');
}
/* 公共签名参数：endpoint 规范化 / host / amzDate / scope（presign 与 Authorization 头共用） */
async function r2SignParams(env) {
  const endpoint = String(env.R2_ENDPOINT || '').replace(/\/+$/, '');
  const host = new URL(endpoint).host;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const scope = dateStamp + '/auto/s3/aws4_request';
  return { endpoint, host, amzDate, dateStamp, scope };
}
/* 公共签名管线：canonicalRequest → digest → stringToSign → signingKey → hmac。
 * presignPut（预签名 URL）与 sigv4AuthHeader（Authorization 头）共用，避免两套签名逻辑漂移。 */
async function signS3(env, method, path, canonicalQuery, canonicalHeaders, signedHeaders) {
  const p = await r2SignParams(env);
  const canonicalRequest = [method.toUpperCase(), path, canonicalQuery || '', canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(canonicalRequest));
  const stringToSign = ['AWS4-HMAC-SHA256', p.amzDate, p.scope, hexify(digest)].join('\n');
  const keyBytes = await signingKey(env.R2_SECRET_ACCESS_KEY, p.dateStamp, 'auto', 's3');
  const signature = hexify(await hmac(keyBytes, stringToSign));
  return { params: p, signature };
}
/** 生成 R2 S3 兼容的预签名 PUT URL（有效期 1 小时，UNSIGNED-PAYLOAD）
 *  bucket 可选：缺省用 env.R2_BUCKET（音乐桶）；媒体桶传入独立 bucket 名（如 qingyu-media）
 *  contentLength 可选：把真实 Content-Length 纳入签名。R2 会要求请求头与该值完全一致，
 *  因此调用方必须先校验大小上限，再传入声明的文件大小；客户端谎报大小或超限都会被拒绝。 */
export async function presignPut(env, key, expiresSec, bucket, contentLength) {
  expiresSec = expiresSec || 3600;
  const b = bucket || env.R2_BUCKET;
  const p = await r2SignParams(env);
  const path = '/' + b + '/' + key;
  const hasLen = Number.isFinite(Number(contentLength)) && Number(contentLength) > 0;
  const qp = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': env.R2_ACCESS_KEY_ID + '/' + p.scope,
    'X-Amz-Date': p.amzDate,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': hasLen ? 'content-length;host' : 'host'
  };
  const canonicalQuery = Object.keys(qp).sort()
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(qp[k]); })
    .join('&');
  const canonicalHeaders = hasLen
    ? 'content-length:' + String(Number(contentLength)) + '\n' + 'host:' + p.host + '\n'
    : 'host:' + p.host + '\n';
  const s = await signS3(env, 'PUT', path, canonicalQuery, canonicalHeaders, qp['X-Amz-SignedHeaders']);
  return p.endpoint + path + '?' + canonicalQuery + '&X-Amz-Signature=' + s.signature;
}

/* ---------- 常量与工具 ---------- */
const AUDIO_EXTS = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac', opus: 'audio/ogg', flac: 'audio/flac' };
const MAX_SIZE = 30 * 1024 * 1024; // 单曲 ≤ 30MB

function r2Configured(env) {
  // 同时要求 PUBLIC_BASE：否则签发得出上传 URL 却拼不出 publicUrl，
  // 上传完成后无法登记有效地址，只在桶里留下孤儿对象。
  return !!(env && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && env.R2_BUCKET && env.R2_PUBLIC_BASE);
}
function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- 删除对象（与上传同一桶，Worker 代发 SigV4 签名 DELETE） ---------- */
/** 生成 SigV4 Authorization 头（供 r2DeleteObject 使用，导出便于交叉验证）
 *  服务端 Authorization 头签名必须显式携带并签名 x-amz-content-sha256 与 x-amz-date，
 *  否则 R2 按实际 body 哈希 / 缺日期校验 → 403/400（SignatureDoesNotMatch / No date provided）。 */
export async function sigv4AuthHeader(env, method, path) {
  const p = await r2SignParams(env);
  const canonicalHeaders = 'host:' + p.host + '\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:' + p.amzDate + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const s = await signS3(env, method, path, '', canonicalHeaders, signedHeaders);
  return {
    amzDate: p.amzDate,
    authorization: 'AWS4-HMAC-SHA256 Credential=' + env.R2_ACCESS_KEY_ID + '/' + p.scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + s.signature
  };
}
/** 删除 R2 对象；S3 DELETE 幂等，对象不存在（404/204）视为成功
 *  bucket 可选：缺省用 env.R2_BUCKET（音乐桶）；媒体桶传入独立 bucket 名 */
export async function r2DeleteObject(env, key, bucket) {
  const b = bucket || env.R2_BUCKET;
  const endpoint = String(env.R2_ENDPOINT || '').replace(/\/+$/, '');
  const path = '/' + b + '/' + key;
  const sig = await sigv4AuthHeader(env, 'DELETE', path);
  const res = await fetch(endpoint + path, {
    method: 'DELETE',
    headers: {
      'Authorization': sig.authorization,
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
      'X-Amz-Date': sig.amzDate
    }
  });
  if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
    const detail = await res.text().catch(function () { return ''; });
    throw new Error('R2 对象删除失败 HTTP ' + res.status + (detail ? '（' + detail.slice(0, 160) + '）' : ''));
  }
  return true;
}
/** 从公开 URL 提取对象 key（仅本站 music/ 前缀的上传对象；外链返回空串不删）。
 *  env 可选：传入后会校验 URL 的 origin 必须等于配置的 R2_PUBLIC_BASE，
 *  否则 `https://evil.example/music/xxx` 这类外链也会被当成桶内对象去签删除请求
 *  （删的是**我们自己的桶**里同名 key）。 */
export function extractR2Key(publicUrl, env) {
  try {
    const u = new URL(String(publicUrl || ''));
    const base = String((env && env.R2_PUBLIC_BASE) || '').replace(/\/+$/, '');
    if (base) {
      let baseOrigin = '';
      try { baseOrigin = new URL(base).origin; } catch (e) { baseOrigin = ''; }
      if (baseOrigin && u.origin !== baseOrigin) return '';
    }
    if (u.pathname.indexOf('/music/') === 0) return u.pathname.slice(1);
  } catch (e) { /* ignore */ }
  return '';
}
function normalizeTrack(row) {
  return {
    id: row.id, title: row.title, artist: row.artist || '', url: row.url,
    cover: row.cover || '', size: Number(row.size) || 0, duration: Number(row.duration) || 0,
    sort: Number(row.sort) || 0, date: row.created_at || ''
  };
}

/* ============================================================
 * GET /api/music（公开）→ 播放列表
 * POST /api/music（管理）→ 上传完成后注册元数据（url 为已传至 R2 的公开地址）
 * ============================================================ */
export async function handleMusic(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);

  if (request.method === 'GET') {
    const list = await dbAll(env.DB, 'SELECT * FROM music ORDER BY sort ASC, created_at ASC');
    return json({ ok: true, music: (list || []).map(normalizeTrack) }, 200, request, env, { 'Cache-Control': 's-maxage=60, max-age=30' });
  }

  if (request.method === 'POST') {
    if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
    const body = await request.json().catch(function () { return null; });
    const title = String((body && body.title) || '').trim().slice(0, 200);
    const url = String((body && body.url) || '').trim();
    if (!title || !url) return json({ error: '缺少 title / url' }, 400, request, env);
    const id = 'song-' + randomId();
    const artist = String((body && body.artist) || '').trim().slice(0, 200);
    const cover = String((body && body.cover) || '').trim().slice(0, 500);
    const size = Number((body && body.size) || 0) || 0;
    const duration = Number((body && body.duration) || 0) || 0;
    const sort = Number((body && body.sort) || 0) || 0;
    const created_at = new Date().toISOString().slice(0, 10);
    await dbRun(env.DB, 'INSERT INTO music (id,title,artist,url,cover,size,duration,sort,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, title, artist, url, cover, size, duration, sort, created_at);
    return json({ ok: true, track: normalizeTrack({ id, title, artist, url, cover, size, duration, sort, created_at }) }, 201, request, env, { 'Cache-Control': 'no-store' });
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}

/* ============================================================
 * POST /api/music/upload-url（管理）→ 返回 R2 预签名 PUT URL
 *   入参 { filename: "demo.mp3", size: 5242880 }
 *   返回 { uploadUrl, publicUrl, key, contentType, expiresIn }
 * ============================================================ */
export async function handleMusicUploadUrl(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (!r2Configured(env)) {
    return json({ error: 'R2 未配置（缺少 R2 凭据 / R2_BUCKET），无法上传' }, 503, request, env);
  }

  const body = await request.json().catch(function () { return null; });
  const filename = String((body && body.filename) || '').trim();
  const size = Number((body && body.size) || 0) || 0;
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const ext = m ? m[1].toLowerCase() : '';
  if (!AUDIO_EXTS[ext]) return json({ error: '不支持的音频格式（mp3 / m4a / ogg / wav / aac / opus / flac）' }, 400, request, env);
  if (size <= 0 || size > MAX_SIZE) return json({ error: '文件大小需在 1B ~ 30MB 之间' }, 400, request, env);

  const key = 'music/' + randomId() + '.' + ext;
  const contentType = AUDIO_EXTS[ext];
  // 签名必须使用真实文件大小；若固定签 MAX_SIZE，正常文件会因请求头不匹配而被 R2 拒绝。
  const uploadUrl = await presignPut(env, key, 3600, null, size);
  const publicBase = String(env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
  const publicUrl = publicBase ? publicBase + '/' + key : '';

  return json({ ok: true, uploadUrl, publicUrl, key, contentType, expiresIn: 3600 }, 200, request, env, { 'Cache-Control': 'no-store' });
}

/* ============================================================
 * PUT /api/music/:id（管理）→ 编辑元数据
 * DELETE /api/music/:id（管理）→ 移除曲目（R2 对象保留，由运维侧清理）
 * ============================================================ */
export async function handleMusicId(request, env, id) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);

  if (request.method === 'PUT') {
    const body = await request.json().catch(function () { return null; });
    const title = String((body && body.title) || '').trim().slice(0, 200);
    const artist = String((body && body.artist) || '').trim().slice(0, 200);
    const cover = String((body && body.cover) || '').trim().slice(0, 500);
    const sort = Number((body && body.sort) || 0) || 0;
    const duration = Number((body && body.duration) || 0) || 0;
    if (!title) return json({ error: '缺少 title' }, 400, request, env);
    // D1 写入失败必须报错（不吞），否则前端误以为修改成功
    try {
      await dbRun(env.DB, 'UPDATE music SET title=?, artist=?, cover=?, sort=?, duration=? WHERE id=?', title, artist, cover, sort, duration, id);
    } catch (e) {
      console.error('[music] DB update failed:', e && e.message);
      return json({ error: '数据库更新失败，请稍后重试' }, 500, request, env, { 'Cache-Control': 'no-store' });
    }
    return json({ ok: true }, 200, request, env, { 'Cache-Control': 'no-store' });
  }

  if (request.method === 'DELETE') {
    // 与 R2 同步删除：先删对象，成功后再删元数据（避免留下孤儿对象/幽灵曲目）
    const row = await dbFirst(env.DB, 'SELECT url FROM music WHERE id = ?', id);
    if (row && row.url) {
      const key = extractR2Key(row.url, env);
      if (key && r2Configured(env)) {
        try {
          await r2DeleteObject(env, key);
        } catch (e) {
          return json({ error: 'R2 对象删除失败，请稍后重试' }, 502, request, env, { 'Cache-Control': 'no-store' });
        }
      }
    }
    // D1 删除失败必须报错（不吞），否则前端误以为成功
    try {
      await dbRun(env.DB, 'DELETE FROM music WHERE id = ?', id);
    } catch (e) {
      console.error('[music] DB delete failed:', e && e.message);
      return json({ error: '数据库删除失败，请稍后重试' }, 500, request, env, { 'Cache-Control': 'no-store' });
    }
    return json({ ok: true }, 200, request, env, { 'Cache-Control': 'no-store' });
  }

  return json({ error: 'Method not allowed' }, 405, request, env);
}
