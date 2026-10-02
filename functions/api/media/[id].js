/* Cloudflare Pages Functions · /api/media/:id
 * DELETE → 删除媒体：先删 R2 对象（若 url 为本站 /media/ 前缀），再删 D1 元数据
 * 与 worker.js 的 /api/media/:id 路由行为一致。 */
import { handleMediaId, dbFirst } from '../../_lib/api-core.js';
import { deleteMediaObject } from '../../_lib/media.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const id = params.id;
  // 删除媒体：先删 R2 对象（若 url 是本站 media/ 前缀），再删 D1 元数据
  if (request.method === 'DELETE') {
    const row = env && env.DB ? await dbFirst(env.DB, 'SELECT url, thumb_url FROM media WHERE id = ?', id).catch(() => null) : null;
    if (row && row.url) {
      try { await deleteMediaObject(env, row.url, row.thumb_url || ''); } catch (e) { /* R2 删除失败不阻塞 */ }
    }
  }
  return handleMediaId(request, env, id);
}