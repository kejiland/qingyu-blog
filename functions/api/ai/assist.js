/* Cloudflare Pages Functions · POST /api/ai/assist
 * 后台写作助手（仅作者）：title 标题建议 / tags 标签 / polish 润色 / translate 翻译
 *  body: { action, text, lang? } */
import { json, corsPreflight, isWriteAuthed, unauthorized } from '../../_lib/api-core.js';
import {
  aiEnabled, aiChat, aiRate, buildAssistMessages, normalizeLang, clientIp
} from '../../_lib/ai.js';

const DAY_LIMIT = 200, DAY_WINDOW = 86400;

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return corsPreflight(request, env);
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, request, env);
  if (!aiEnabled(env)) return json({ ok: false, error: 'AI 未启用' }, 404, request, env);
  if (!(await isWriteAuthed(request, env))) return unauthorized(request, env);

  const body = await request.json().catch(() => null);
  const action = body && body.action;
  const text = body && body.text;
  if (!action || typeof text !== 'string' || !text.trim()) return json({ error: '缺少 action 或 text' }, 400, request, env);

  const msgs = buildAssistMessages(action, text, normalizeLang(body.lang));
  if (!msgs) return json({ error: '未知操作' }, 400, request, env);

  const ip = clientIp(request);
  const r = await aiRate(env, 'assist:day', ip, DAY_LIMIT, DAY_WINDOW);
  if (!r.ok) return json({ error: 'AI 助手今日用量已达上限' }, 429, request, env);

  const result = await aiChat(env, msgs, { max_tokens: 1600 });
  if (!result) return json({ error: 'AI 服务暂不可用，请稍后再试' }, 502, request, env);
  return json({ ok: true, result }, 200, request, env);
}
