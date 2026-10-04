/* Cloudflare Pages Functions · /api/admin/webmentions/:id（需登录）
 * DELETE → 删除一条引用
 */
import { handleWebmentionsAdmin } from '../../../_lib/api-core.js';
export async function onRequestDelete(context) { return handleWebmentionsAdmin(context.request, context.env, context.params.id); }
export async function onRequestOptions(context) { return handleWebmentionsAdmin(context.request, context.env, context.params.id); }
