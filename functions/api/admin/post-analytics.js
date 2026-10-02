/* Cloudflare Pages Functions · /api/admin/post-analytics */
import { handlePostAnalytics } from '../../_lib/analytics.js';
export async function onRequest(context) { return handlePostAnalytics(context.request, context.env); }