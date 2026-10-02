/* Cloudflare Pages Functions · /api/search
 * GET → D1 FTS5 全文搜索（短关键词自动回退 LIKE） */
import { handleSearch } from '../_lib/search.js';

export async function onRequestGet(context) {
  return handleSearch(context.request, context.env);
}

export async function onRequestOptions(context) {
  return handleSearch(context.request, context.env);
}