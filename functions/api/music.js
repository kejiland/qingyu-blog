/* Cloudflare Pages Functions · /api/music（列表 / 登记） */
import { handleMusic } from '../_lib/music.js';
export async function onRequest(context) { return handleMusic(context.request, context.env); }
