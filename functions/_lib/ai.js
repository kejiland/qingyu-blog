/* ============================================================
 * 轻语博客 · AI 共享库（Cloudflare Workers AI 代理）
 * ------------------------------------------------------------
 * · 依赖 Pages 项目绑定 Workers AI（env.AI 存在）才可用；
 *   未绑定 / env.BLOG_AI_ENABLED='0' 时 aiEnabled() 返回 false，
 *   所有接口一律返回 404，前端自动隐藏 AI 元素——博客核心功能不受任何影响。
 * · 任何模型调用失败返回空串，调用方负责 502+友好文案。
 * · KV 未绑定时限流/缓存静默降级（不阻断功能）。
 * ============================================================ */
export const AI_MODEL = '@cf/meta/llama-3.2-3b-instruct';

const LANG_NAMES = {
  'zh-CN': '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  hi: 'हिन्दी'
};

export function langName(code) {
  return LANG_NAMES[code] || LANG_NAMES['zh-CN'];
}

/** AI 是否启用：无 env.AI binding 或站点开关被显式关闭 → false */
export function aiEnabled(env) {
  if (!env || !env.AI) return false;
  if (!env.DB) return false;            // 读不了文章/评论时 AI 无意义，直接关闭
  const flag = env.BLOG_AI_ENABLED;
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  return true;
}

/** 匿名访客是否可触发「生成」（消耗模型额度）。
 *  默认允许（保持原有公开摘要体验）；设置 BLOG_AI_PUBLIC=0/false/off 后，
 *  生成类接口要求作者会话，避免被任意站点脚本刷走 Workers AI 免费额度。
 *  只读接口（读取已缓存摘要 / ping）不受影响。 */
export function aiPublicGenerate(env) {
  const flag = env && env.BLOG_AI_PUBLIC;
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  return true;
}

/** 调用模型；失败返回 ''（调用方负责 502 提示） */
export async function aiChat(env, messages, opts) {
  if (!aiEnabled(env)) return '';
  try {
    const res = await env.AI.run(AI_MODEL, Object.assign({ messages }, opts || {}));
    const text = (res && res.response) || null;
    return (text || '').trim();
  } catch (e) {
    console.warn('[ai] model run failed:', e && e.message);
    return '';
  }
}

/** KV 计数限流（prefix:key → 窗口内计数）。
 *  opts.failClosed=true：KV 缺失或读取异常时 **拒绝**（用于全站每日额度这类
 *  一旦放行就会真金白银烧模型配额的计数）。默认 fail-open，用于每 IP 频控，
 *  避免 KV 抖动把正常用户挡在门外。
 *  注意：KV 最终一致，计数为「尽力而为」，可被并发绕过；真正的成本兜底是
 *  每日总额度 + 鉴权，不能只依赖本函数。 */
export async function aiRate(env, prefix, key, limit, windowSec, opts) {
  const failClosed = !!(opts && opts.failClosed);
  const deny = { ok: false, reason: 'blocked' };
  if (!env || !env.BLOG) {
    if (failClosed) {
      console.warn('[ai] env.BLOG(KV) 未绑定，全站 AI 额度计数不可用 → 按 fail-closed 拒绝');
      return deny;
    }
    return { ok: true };
  }
  const k = 'ai:' + prefix + ':' + key;
  try {
    const cnt = Number((await env.BLOG.get(k)) || 0);
    if (cnt >= limit) return deny;
    await env.BLOG.put(k, String(cnt + 1), { expirationTtl: windowSec });
    return { ok: true };
  } catch (e) {
    if (failClosed) {
      console.warn('[ai] 额度计数读写失败，按 fail-closed 拒绝:', e && e.message);
      return deny;
    }
    return { ok: true };
  }
}

export async function aiCacheGet(env, key) {
  if (!env || !env.BLOG) return null;
  try { return await env.BLOG.get('ai:' + key); } catch (e) { return null; }
}

export async function aiCachePut(env, key, val, ttl) {
  if (!env || !env.BLOG) return;
  try { await env.BLOG.put('ai:' + key, val, { expirationTtl: ttl }); } catch (e) { /* 忽略 */ }
}

const MAX_INPUT = 6000;

export function buildSummaryMessages(content, code) {
  return [
    { role: 'system', content: '你是博客站的 AI 摘要助手。只依据给出的文章内容忠实概括核心观点，禁止编造或引申原文没有的信息，不要出现评价性套话。' },
    { role: 'user', content: '请用' + langName(code) + '为下面这篇文章写一段 60–120 字的摘要，直接输出摘要正文，不要加标题或任何前后缀：\n\n' + String(content || '').slice(0, MAX_INPUT) }
  ];
}

export function buildAssistMessages(action, text, code) {
  const t = String(text || '').slice(0, MAX_INPUT);
  switch (action) {
    case 'title':
      return [
        { role: 'system', content: '你是博客标题顾问。根据文章内容给出 3 个候选标题，要求贴合内容、有吸引力。' },
        { role: 'user', content: '文章内容：\n' + t + '\n\n请用' + langName(code) + '给出 3 个标题，每行一个，直接输出。' }
      ];
    case 'tags':
      return [
        { role: 'system', content: '你是博客标签助手。根据文章内容推荐 3–5 个标签，直接用顿号分隔输出，不要编号。' },
        { role: 'user', content: '文章内容：\n' + t + '\n\n请给出 3–5 个' + langName(code) + '标签。' }
      ];
    case 'polish':
      return [
        { role: 'system', content: '你是中文写作润色助手。在不改变原意的前提下优化表达、修正语病，直接输出润色后的全文。' },
        { role: 'user', content: '请润色下面这段文字：\n' + t }
      ];
    case 'translate':
      return [
        { role: 'system', content: '你是忠实的中文译者。把下面的文字翻译为' + langName(code) + '，保留原有格式与语气，直接输出译文，不要加任何说明。' },
        { role: 'user', content: t }
      ];
    default:
      return null;
  }
}

export function buildCommentSummaryMessages(list) {
  const lines = (list || []).map(function (c) {
    return '· ' + (c.author || '匿名') + '：' + String(c.content || '').slice(0, 120);
  }).join('\n');
  return [
    { role: 'system', content: '你是博客评论助手。总结这些评论的普遍观点、关注焦点与分歧，用简体中文分点输出，不要编造没有提到的内容。' },
    { role: 'user', content: '以下为评论（每条一行）：\n' + lines.slice(0, MAX_INPUT) }
  ];
}

export function buildCommentScreenMessages(text) {
  return [
    { role: 'system', content: '你是评论垃圾检测器。判断一条中文评论是否属于垃圾（广告、辱骂、刷屏、无关链接推广）。只输出 JSON：{"spam":true或false,"reason":"一句话原因"}。' },
    { role: 'user', content: '评论内容：' + String(text || '').slice(0, 2000) }
  ];
}

/** 从模型输出提取 JSON（容忍 ```json 包裹与前后杂文本）；失败返回 null */
export function extractJson(text) {
  if (!text) return null;
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = m ? m[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch (e) { return null; }
}

/** 解析客户端传人的语言代码，非法值回退 zh-CN */
export function normalizeLang(v) {
  return /^(zh-CN|en|ja|ko|hi)$/.test(String(v || '')) ? v : 'zh-CN';
}

/** 取客户端 IP（可脱敏）；拿不到回退 'anon' */
export function clientIp(request) {
  return String((request && request.headers && request.headers.get('CF-Connecting-IP')) || 'anon')
    .replace(/[^A-Za-z0-9:._-]/g, '');
}