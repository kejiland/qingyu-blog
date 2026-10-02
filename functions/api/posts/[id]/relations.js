/* Cloudflare Pages Functions · /api/posts/:id/relations
 * GET → 引用当前文章的文章 + 相关文章推荐 */
import { handlePostRelations } from '../../../_lib/relations.js';

export async function onRequestGet(context) {
  return handlePostRelations(context.request, context.env, context.params.id);
}

export async function onRequestOptions(context) {
  return handlePostRelations(context.request, context.env, context.params.id);
}