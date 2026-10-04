/* Cloudflare Pages Functions · /api/admin/webmentions（需登录）
 * GET → 引用列表
 */
import { handleWebmentionsAdmin } from '../../_lib/api-core.js';
export async function onRequestGet(context) { return handleWebmentionsAdmin(context.request, context.env, null); }
export async function onRequestOptions(context) { return handleWebmentionsAdmin(context.request, context.env, null); }
