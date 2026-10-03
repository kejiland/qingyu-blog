/* Cloudflare Pages Functions · /api/music/:id（重命名 / 删除） */
import { handleMusicId } from '../../_lib/music.js';
export async function onRequest(context) { return handleMusicId(context.request, context.env, context.params.id); }
