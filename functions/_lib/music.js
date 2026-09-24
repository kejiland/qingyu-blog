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
 *   · R2_BUCKET / R2_PUBLIC_BASE
 *       音乐专用桶名 + 公开读取基址（如 https://music.example.com；末尾不带斜杠）
 *   · R2_MEDIA_BUCKET / R2_MEDIA_PUBLIC_BASE
 *       可选：媒体桶。若当前 R2 凭据只对媒体桶有写权限，音乐对象会优先写入媒体桶，
 *       公开地址使用媒体域名；未配置时回退 R2_BUCKET / R2_PUBLIC_BASE。
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
/** S3 canonical URI 编码：逐段编码路径，保留 `/` 分隔符。
 *  AWS SigV4 要求 canonical URI 按 RFC 3986 编码（`/` 除外），
 *  且最终请求 URL 与签名用的路径必须完全一致，否则 R2 返回 SignatureDoesNotMatch。 */
function s3Path(rawPath) {
  return String(rawPath).split('/').map(function (seg) {
    return encodeURIComponent(seg).replace(/[!'()*]/g, function (ch) {
      return '%' + ch.charCodeAt(0).toString(16).toUpperCase();
    });
  }).join('/');
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
 *  bucket 可选：缺省用 env.R2_BUCKET；媒体桶传入独立 bucket 名（如 qingyu-media）
 *  contentType 可选：把 Content-Type 纳入签名，防止上传后被改写为其他 MIME 类型。
 *  Content-Length 由浏览器自动生成，不能纳入签名；规范化差异会导致 R2 返回无 CORS 头的 403。 */
export async function presignPut(env, key, expiresSec, bucket, contentType) {
  expiresSec = expiresSec || 3600;
  const b = bucket || env.R2_BUCKET;
  const p = await r2SignParams(env);
  // 签名与最终 URL 必须共用同一条「已按 S3 规则编码」的路径：
  // R2 收到请求后会按 RFC 3986 重新编码比对 canonical URI，若这里写入原始 key
  // （含空格/中文/`+` 等），签名与 R2 的推算结果不一致 → 403 SignatureDoesNotMatch，
  // 且 403 响应不带 CORS 头，浏览器只能看到 xhr.onerror。
  const path = s3Path('/' + b + '/' + key);
  const type = String(contentType || '').trim();
  const qp = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': env.R2_ACCESS_KEY_ID + '/' + p.scope,
    'X-Amz-Date': p.amzDate,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': type ? 'content-type;host' : 'host'
  };
  const canonicalQuery = Object.keys(qp).sort()
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(qp[k]); })
    .join('&');
  const canonicalHeaders = type
    ? 'content-type:' + type + '\n' + 'host:' + p.host + '\n'
    : 'host:' + p.host + '\n';
  const s = await signS3(env, 'PUT', path, canonicalQuery, canonicalHeaders, qp['X-Amz-SignedHeaders']);
  return p.endpoint + path + '?' + canonicalQuery + '&X-Amz-Signature=' + s.signature;
}

/* ---------- 常量与工具 ---------- */
const AUDIO_EXTS = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac', opus: 'audio/ogg', flac: 'audio/flac' };
const MAX_SIZE = 30 * 1024 * 1024; // 单曲 ≤ 30MB

function trimBase(value) {
  return String(value || '').replace(/\/+$/, '');
}
function originOf(value) {
  try { return new URL(trimBase(value)).origin; } catch (e) { return ''; }
}
/** 音乐上传存储：媒体桶可用时优先使用，避免共享凭据缺少音乐桶写权限导致上传失败。 */
function musicStorage(env) {
  const mediaBucket = String((env && env.R2_MEDIA_BUCKET) || '').trim();
  const mediaBase = trimBase(env && env.R2_MEDIA_PUBLIC_BASE);
  if (mediaBucket && mediaBase) {
    return { bucket: mediaBucket, publicBase: mediaBase, origin: originOf(mediaBase) };
  }
  const bucket = String((env && env.R2_BUCKET) || '').trim();
  const publicBase = trimBase(env && env.R2_PUBLIC_BASE);
  return { bucket: bucket, publicBase: publicBase, origin: originOf(publicBase) };
}

function r2Configured(env) {
  // 同时要求 PUBLIC_BASE：否则签发得出上传 URL 却拼不出 publicUrl，
  // 上传完成后无法登记有效地址，只在桶里留下孤儿对象。
  const storage = musicStorage(env);
  return !!(env && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && storage.bucket && storage.publicBase);
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
  const path = s3Path('/' + b + '/' + key);
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
/** 解析本站音乐对象：返回对象 key 与所属桶，外链返回 null。
 *  同时识别媒体桶与音乐桶公开域名，兼容切换上传目标前后的历史记录。 */
export function resolveR2Object(publicUrl, env) {
  try {
    const u = new URL(String(publicUrl || ''));
    if (u.pathname.indexOf('/music/') !== 0) return null;
    const key = u.pathname.slice(1);
    const candidates = [];
    const mediaBucket = String((env && env.R2_MEDIA_BUCKET) || '').trim();
    const mediaOrigin = originOf(env && env.R2_MEDIA_PUBLIC_BASE);
    if (mediaBucket && mediaOrigin) candidates.push({ bucket: mediaBucket, origin: mediaOrigin });
    const musicBucket = String((env && env.R2_BUCKET) || '').trim();
    const musicOrigin = originOf(env && env.R2_PUBLIC_BASE);
    if (musicBucket && musicOrigin) candidates.push({ bucket: musicBucket, origin: musicOrigin });
    if (!candidates.length) return { key: key, bucket: '' };
    for (let i = 0; i < candidates.length; i++) {
      if (u.origin === candidates[i].origin) return { key: key, bucket: candidates[i].bucket };
    }
  } catch (e) { /* ignore */ }
  return null;
}
/** 从公开 URL 提取对象 key（兼容旧调用；仅本站 music/ 前缀，外链返回空串不删）。 */
export function extractR2Key(publicUrl, env) {
  const object = resolveR2Object(publicUrl, env);
  return object ? object.key : '';
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
  const storage = musicStorage(env);
  const uploadUrl = await presignPut(env, key, 3600, storage.bucket, contentType);
  const publicUrl = storage.publicBase ? storage.publicBase + '/' + key : '';

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
      const object = resolveR2Object(row.url, env);
      if (object && object.key && object.bucket && r2Configured(env)) {
        try {
          await r2DeleteObject(env, object.key, object.bucket);
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
