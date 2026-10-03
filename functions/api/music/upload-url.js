/* Cloudflare Pages Functions · /api/music/upload-url（R2 直传预签名） */
import { handleMusicUploadUrl } from '../../_lib/music.js';
export async function onRequest(context) { return handleMusicUploadUrl(context.request, context.env); }
