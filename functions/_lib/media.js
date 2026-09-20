/* ============================================================
 * 媒体模块（Cloudflare R2 直传 + D1 元数据）
 * ------------------------------------------------------------
 * 图片本体一律存 R2（与音乐模块同款 S3 预签名模式）：
 *   · 浏览器 XHR PUT 直传 R2（不占 Worker 带宽）
 *   · R2 egress 免费 → 图片读取流量不额外计费
 *   · D1 media 表只存元数据（url 为 R2 公开地址）
 * 不再支持 data:image base64 内嵌（历史遗留记录已由迁移 0014 清除）。
 * 依赖环境变量（R2 凭据与音乐共用；**媒体桶独立**，不与音乐同桶）：
 *   R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT   （通用凭据）
 *   R2_MEDIA_BUCKET        媒体专用桶名（如 qingyu-media）
 *   R2_MEDIA_PUBLIC_BASE   媒体桶绑定的自定义域名（如 https://media.2024921.xyz）
 * 降级：未配置 R2 媒体桶时，api/media/upload-url 返回 503；只读列表仍可用。
 * ============================================================ */
import { getCorsHeaders, json, corsPreflight, isWriteAuthed, unauthorized, dbAll, dbRun } from './api-core.js';
import { presignPut, r2DeleteObject } from './music.js';

const IMAGE_EXTS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon' };
const MAX_SIZE = 10 * 1024 * 1024; // 单图 ≤ 10MB

export function r2Configured(env) {
  // 必须同时配置公开访问地址：否则能签发上传 URL 却拿不到 publicUrl，
  // 客户端传完对象后无法登记有效 URL，最终在桶里留下无法回收的孤儿对象。
  return !!(env && env.R2_MEDIA_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && env.R2_MEDIA_PUBLIC_BASE);
}
function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
/** 从公开 URL 提取媒体对象 key（仅本站 media/ 前缀；非本站 URL 返回空串不删 R2）。
 *  除路径前缀外还校验 origin 必须等于 R2_MEDIA_PUBLIC_BASE，
 *  避免外链 `https://evil.example/media/x` 被当作桶内对象去签删除请求。 */
export function extractMediaR2Key(publicUrl, env) {
  try {
    const u = new URL(String(publicUrl || ''));
    const base = String((env && env.R2_MEDIA_PUBLIC_BASE) || '').replace(/\/+$/, '');
    if (base) {
      let baseOrigin = '';
      try { baseOrigin = new URL(base).origin; } catch (e) { baseOrigin = ''; }
      if (baseOrigin && u.origin !== baseOrigin) return '';
    }
    if (u.pathname.indexOf('/media/') === 0) return u.pathname.slice(1);
  } catch (e) { /* ignore */ }
  return '';
}

/* ============================================================
 * POST /api/media/upload-url（管理）→ 返回 R2 预签名 PUT URL
 *   入参 { filename: "photo.png", size: 5242880 }
 *   返回 { uploadUrl, publicUrl, key, contentType, expiresIn }
 * ============================================================ */
export async function handleMediaUploadUrl(request, env) {
  if (!env || !env.DB) return json({ error: '数据库未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (!r2Configured(env)) {
    return json({ error: 'R2 媒体桶未配置（缺少 R2_MEDIA_BUCKET / R2 凭据），无法上传' }, 503, request, env);
  }

  const body = await request.json().catch(function () { return null; });
  const filename = String((body && body.filename) || '').trim();
  const size = Number((body && body.size) || 0) || 0;
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  const ext = m ? m[1].toLowerCase() : '';
  if (!IMAGE_EXTS[ext]) return json({ error: '不支持的图片格式（png / jpg / jpeg / webp / gif / svg / avif / bmp / ico）' }, 400, request, env);
  if (size <= 0 || size > MAX_SIZE) return json({ error: '文件大小需在 1B ~ 10MB 之间' }, 400, request, env);

  const key = 'media/' + randomId() + '.' + ext;
  const contentType = IMAGE_EXTS[ext];
  // 把 Content-Length 纳入签名：R2 会在边缘拒绝超过该长度的 PUT，
  // 防止客户端谎报 size 后直传超大对象（此前 size 仅由客户端提供，形同虚设）。
  const uploadUrl = await presignPut(env, key, 3600, env.R2_MEDIA_BUCKET, MAX_SIZE);
  const publicBase = String(env.R2_MEDIA_PUBLIC_BASE || '').replace(/\/+$/, '');
  const publicUrl = publicBase ? publicBase + '/' + key : '';

  return json({ ok: true, uploadUrl, publicUrl, key, contentType, expiresIn: 3600 }, 200, request, env, { 'Cache-Control': 'no-store' });
}

/** 删除媒体：先删 R2 对象（若 url 是本站 media/ 前缀，媒体专用桶），再删 D1 元数据 */
export async function deleteMediaObject(env, url) {
  const key = extractMediaR2Key(url, env);
  if (key) {
    try { await r2DeleteObject(env, key, env.R2_MEDIA_BUCKET); } catch (e) { /* R2 删除失败不阻塞元数据删除（避免幽灵记录） */ }
  }
}