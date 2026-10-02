/* ============================================================
 * 自动分享图（OG Image）上传签名
 * 复用媒体桶；未配置媒体桶时回退音乐桶。图片由浏览器 Canvas 生成。
 * ============================================================ */
import { json, corsPreflight, isWriteAuthed, unauthorized } from './api-core.js';
import { presignPut } from './music.js';

function storage(env) {
  const mediaBucket = String((env && env.R2_MEDIA_BUCKET) || '').trim();
  const mediaBase = String((env && env.R2_MEDIA_PUBLIC_BASE) || '').replace(/\/+$/, '');
  if (mediaBucket && mediaBase) return { bucket: mediaBucket, publicBase: mediaBase };
  const musicBucket = String((env && env.R2_BUCKET) || '').trim();
  const musicBase = String((env && env.R2_PUBLIC_BASE) || '').replace(/\/+$/, '');
  return { bucket: musicBucket, publicBase: musicBase };
}
export function ogConfigured(env) {
  const s = storage(env);
  return !!(env && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && s.bucket && s.publicBase);
}
export async function handleOgUploadUrl(request, env) {
  if (!env) return json({ error: '环境未配置' }, 500, request, env);
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);
  if (!ogConfigured(env)) return json({ error: 'R2 媒体桶未配置，无法上传分享图' }, 503, request, env);
  const body = await request.json().catch(() => null);
  const postId = String((body && body.postId) || '').trim().slice(0, 160);
  if (!postId) return json({ error: '缺少 postId' }, 400, request, env);
  const safe = postId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'post';
  const key = 'og/' + safe + '-' + Date.now().toString(36) + '.png';
  const s = storage(env);
  const uploadUrl = await presignPut(env, key, 900, s.bucket, 'image/png');
  return json({ ok: true, uploadUrl, publicUrl: s.publicBase + '/' + key, key, expiresIn: 900 }, 200, request, env, { 'Cache-Control': 'no-store' });
}
