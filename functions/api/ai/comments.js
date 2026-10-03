/* Cloudflare Pages Functions · POST /api/ai/comments
 * 后台评论 AI 工具（仅作者）：
 *   { action:'summarize' } 汇总最近评论要点（结果 KV 缓存 1h）
 *   { action:'screen', text } 单条评论垃圾判定 → { ok, spam, reason } */
import { json, corsPreflight, isWriteAuthed, unauthorized } from '../../_lib/api-core.js';
import {
  aiEnabled, aiChat, aiRate, aiCacheGet, aiCachePut,
  buildCommentSummaryMessages, buildCommentScreenMessages, extractJson, clientIp
} from '../../_lib/ai.js';

const SUM_CACHE_TTL = 3600;
const DAY_LIMIT = 100, DAY_WINDOW = 86400;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!aiEnabled(env)) return json({ ok: false, error: 'AI 未启用' }, 404, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);

  const body = await request.json().catch(() => null);
  if (!body || !body.action) return json({ error: '缺少 action' }, 400, request, env);

  const ip = clientIp(request);
  const r = await aiRate(env, 'cmt:day', ip, DAY_LIMIT, DAY_WINDOW);
  if (!r.ok) return json({ error: 'AI 评论助手今日用量已达上限' }, 429, request, env);

  if (body.action === 'summarize') {
    const cached = await aiCacheGet(env, 'cmt:sum');
    if (cached) return json({ ok: true, summary: cached, cached: true }, 200, request, env);
    const rows = await env.DB.prepare(
      "SELECT author, content, date FROM comments WHERE status = 'approved' OR status IS NULL ORDER BY rowid DESC LIMIT 40"
    ).all().catch(() => ({ results: [] }));
    const list = ((rows && rows.results) || []).reverse();
    if (!list.length) return json({ ok: true, summary: '', empty: true }, 200, request, env);
    const text = await aiChat(env, buildCommentSummaryMessages(list), { max_tokens: 800 });
    if (!text) return json({ error: 'AI 服务暂不可用，请稍后再试' }, 502, request, env);
    await aiCachePut(env, 'cmt:sum', text, SUM_CACHE_TTL);
    return json({ ok: true, summary: text, cached: false }, 200, request, env);
  }

  if (body.action === 'screen') {
    if (typeof body.text !== 'string' || !body.text.trim()) return json({ error: '缺少 text' }, 400, request, env);
    const out = await aiChat(env, buildCommentScreenMessages(body.text), { max_tokens: 120 });
    const parsed = extractJson(out);
    return json({
      ok: true,
      spam: !!(parsed && parsed.spam),
      reason: (parsed && parsed.reason) || ''
    }, 200, request, env);
  }

  return json({ error: '未知操作' }, 400, request, env);
}
