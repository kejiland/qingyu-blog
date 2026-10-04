/* Cloudflare Pages Functions · /api/webmention
 * POST → 接收外站引用通知；GET ?target=… → 读取某篇文章的引用列表
 */
import { handleWebmention, handleWebmentionList } from '../_lib/api-core.js';
export async function onRequestGet(context) { return handleWebmentionList(context.request, context.env); }
export async function onRequestPost(context) { return handleWebmention(context.request, context.env); }
export async function onRequestOptions(context) { return handleWebmention(context.request, context.env); }
