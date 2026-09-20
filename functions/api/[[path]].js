/* ============================================================
 * Cloudflare Pages Functions · /api/* 兜底（JSON 404）
 * ------------------------------------------------------------
 * 背景：public/_redirects 末尾有 SPA 回退规则 `/* /index.html 200`。
 * Pages 的匹配顺序是「Functions 先于 _redirects」，但**只有存在对应函数文件的
 * 路径**才会命中；没有函数文件的 /api/* 路径会被 _redirects 兜成 HTML 200：
 *   · /api/music/upload-url  → 无 functions/api/music/ 目录（音乐上传走 worker.js）
 *   · /api/whatever          → 任何拼写错误/未来新增但未落地的接口
 * 调用方（前端 fetch）拿到 HTML 再去 .json() 会抛出难懂的解析错误，
 * 而不是清楚的 404。worker.js:149 已明确避免这一行为，此处补齐 Pages 侧。
 *
 * 实现：catch-all 动态路由 [[path]]，但**只对未命中具体路由的请求生效**。
 * Pages 对「具体路径 vs 动态 catch-all」的优先级，官方文档表述为更具体的
 * 路由优先；为不依赖该假设，本函数对已知的具体路由做了显式放行（见下方
 * KNOWN_ROUTES），确保即使 catch-all 被优先匹配，也不会把真实接口吞掉。
 *
 * 部署验证建议：`curl -i .../api/posts`（应 200 JSON）与
 * `curl -i .../api/nope`（应 404 JSON）。若前者变成 404，说明 catch-all
 * 抢占生效，此时回退方案是改用 _redirects 的 404 规则而非本文件。
 * ============================================================ */
import { json, corsPreflight, securityHeaders } from '../_lib/api-core.js';

/* 已由具体函数文件实现的 /api 路径模式（与 functions/api/** 目录一一对应）。
 * 命中则视为「已注册路由」，交回 Pages 正常分发，catch-all 不介入。
 * 这样即使动态路由优先级高于具体文件，也不会阻断真实接口。 */
const KNOWN_ROUTES = [
  /^\/api$/,
  /^\/api\/posts$/,
  /^\/api\/posts\/[^/]+$/,
  /^\/api\/posts\/[^/]+\/comments$/,
  /^\/api\/posts\/[^/]+\/comments\/[^/]+$/,
  /^\/api\/posts\/[^/]+\/stats$/,
  /^\/api\/comments$/,
  /^\/api\/comments\/[^/]+$/,
  /^\/api\/media$/,
  /^\/api\/media\/upload-url$/,
  /^\/api\/media\/[^/]+$/,
  /^\/api\/settings$/,
  /^\/api\/site-files$/,
  /^\/api\/site-files\/[^/]+$/,
  /^\/api\/stats\/trend$/,
  /^\/api\/feed\.xml$/,
  /^\/api\/sitemap\.xml$/,
  /^\/api\/admin\/(setup|login|logout|password)$/,
  /^\/api\/ai\/(ping|summary|assist|comments)$/
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 预检请求：直接回 CORS 头，避免浏览器把「无 ACAO 的 404」报成 CORS 错误
  if (request.method === 'OPTIONS') return corsPreflight(request, env);

  // 仅接管 /api 及其子路径；其余路径回退到静态资源（保持 SPA 回退语义）
  if (url.pathname !== '/api' && url.pathname.indexOf('/api/') !== 0) {
    if (env && env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not Found', { status: 404, headers: securityHeaders() });
  }

  // 已注册的具体路由：放行（正常应由更具体的函数文件处理，此处仅作兜底保险）
  for (const re of KNOWN_ROUTES) {
    if (re.test(url.pathname)) {
      if (env && env.ASSETS) return env.ASSETS.fetch(request);
      break;
    }
  }

  // 未知 API：返回 JSON 404，绝不回退 HTML（否则调用方拿到 HTML 再去 JSON.parse 会报错）
  return json({
    ok: false,
    error: 'Not Found',
    hint: '该 API 路径不存在。请检查路径拼写，或确认对应后端模块（如音乐上传 /api/music/upload-url）是否已部署。'
  }, 404, request, env);
}
