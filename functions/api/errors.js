/* Cloudflare Pages Functions · /api/errors
 * POST → 前端运行时异常上报（公开，限流 + 按 fingerprint 聚合）
 */
import { handleErrorReport } from '../_lib/api-core.js';
export async function onRequestPost(context) { return handleErrorReport(context.request, context.env); }
export async function onRequestOptions(context) { return handleErrorReport(context.request, context.env); }
