/* Cloudflare Pages Functions · /api/admin/preview-link
 * POST → 为文章生成带签名的预览分享链接（需登录）
 */
import { handlePreviewLink } from '../../_lib/api-core.js';
export async function onRequestPost(context) { return handlePreviewLink(context.request, context.env); }
export async function onRequestOptions(context) { return handlePreviewLink(context.request, context.env); }
