/* Cloudflare Pages Functions · /api/admin/errors
 * GET → 错误列表；DELETE → 清空（需登录）
 */
import { handleErrorsAdmin } from '../../_lib/api-core.js';
export async function onRequestGet(context) { return handleErrorsAdmin(context.request, context.env); }
export async function onRequestDelete(context) { return handleErrorsAdmin(context.request, context.env); }
export async function onRequestOptions(context) { return handleErrorsAdmin(context.request, context.env); }
