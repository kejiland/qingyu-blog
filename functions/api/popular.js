/* Cloudflare Pages Functions · /api/popular
 * GET → 文章综合热度排行（全部 / 7 天 / 30 天） */
import { handlePopular } from '../_lib/popular.js';

export async function onRequestGet(context) {
  return handlePopular(context.request, context.env);
}

export async function onRequestOptions(context) {
  return handlePopular(context.request, context.env);
}