/* Cloudflare Pages Functions · /api/comments/:id/like */
import { handleCommentLike } from '../../../_lib/api-core.js';
export async function onRequest(context) { return handleCommentLike(context.request, context.env, context.params.id); }