/* Cloudflare Pages Functions · /api/preview
 * GET ?token=… → 凭签名返回未发布文章（公开、禁止缓存）
 */
import { handlePreviewGet } from '../_lib/api-core.js';
export async function onRequestGet(context) { return handlePreviewGet(context.request, context.env); }
export async function onRequestOptions(context) { return handlePreviewGet(context.request, context.env); }
