> 🌐 **中文** · [English](DEVELOPMENT_EN.md)

# 开发文档 Development Guide

> 面向二次开发、维护与部署排查。当前版本：**v2.10.83**（2026-10-07）。
>
> 本文档位于 `docs/`；除特别说明外，所有命令都以**仓库根目录**为当前目录执行。

---

## 1. 设计原则

| 原则 | 具体含义 |
| --- | --- |
| 静态优先 | `public/index.html` 可直接 `file://` 打开；没有后端时仍能写作、导出和预览 |
| 零框架 | 核心前台与后台使用原生 HTML / CSS / JavaScript，不引入 React / Vue / 构建器 |
| 零构建可运行 | 源码即运行时；只有发版前才按需运行 `scripts/minify.mjs` 生成 `.min.*` |
| 云端可选 | Cloudflare D1 / KV / R2 / Workers AI / Resend 都是按需启用，缺少绑定时功能降级而不是整站崩溃 |
| 延迟加载 | 后台、音乐播放器、四季动画、Mermaid、KaTeX 等只在对应路由或真正用到时加载 |
| 安全默认 | 输入转义、参数化 SQL、CORS fail-closed、后台写操作统一 Token 鉴权、响应携带安全头 |

---

## 2. 运行时架构

```
浏览器
├── public/app.js             前台 SPA、路由、写作编辑器、本地优先功能
├── public/admin.js           后台独立切片，进入 /admin 后懒加载
├── public/music-player.js    全站音乐播放器
├── public/bg-anim.js         四季 Canvas 动画
├── public/i18n.js            5 语言运行时与兜底
└── public/sw.js              PWA 缓存与离线壳
        │
        ▼
Cloudflare Worker（worker.js）
├── /api/*                    分发到 functions/_lib 与 functions/api
├── /feed.xml /sitemap.xml    动态分发
├── 静态资源                  由 [assets] 绑定读取 public/
└── Cron                     每 5 分钟定时发布 + 每 5 分钟发件箱 + 每天自动备份
        │
        ├── D1（DB）           文章 / 评论 / 设置 / 统计 / 订阅 / 审计 / 错误日志等主存储
        ├── KV（BLOG）         限流 / 去重 / AI 缓存
        ├── R2                  音乐、媒体图片、私有备份
        ├── Workers AI（AI）    摘要 / 写作助手 / 评论工具，Workers 专属
        └── Resend              邮件订阅与通知，可选
```

### 两套部署形态

| 形态 | 入口 | 特点 |
| --- | --- | --- |
| Workers | `worker.js` + `wrangler.workers.toml` | 推荐；完整 API、Cron、AI、动态 RSS / Sitemap |
| Pages Functions | `functions/` + `wrangler.toml` | API 复用同一套 `_lib` 处理器；AI 绑定不在此配置中，因此 AI 恒为 404 |

---

## 3. 目录职责

| 路径 | 职责 |
| --- | --- |
| [../public/](../public/) | 站点本体：前台、后台、样式、国际化、PWA、本地优先能力 |
| [../functions/api/](../functions/api/) | Pages Functions 路由包装；Workers 也会复用其中的处理器 |
| [../functions/_lib/](../functions/_lib/) | 核心业务：API、搜索、统计、备份、邮件、媒体、音乐、AI、Webmention |
| [../worker.js](../worker.js) | Workers 入口、API 分发、SPA / 404 / 静态资源与安全头 |
| [../migrations/](../migrations/) | D1 迁移，CI 按文件名升序幂等执行 |
| [../scripts/](../scripts/) | 压缩、KV → D1 迁移、截图工具 |
| [../.github/workflows/](../.github/workflows/) | 自动部署与一次性迁移工作流 |
| [../smoke-test.js](../smoke-test.js) | 主冒烟测试：API、UI 运行时、功能回归 |
| [../gb-verify.js](../gb-verify.js) | 留言板专项验证 |
| [../search-verify.js](../search-verify.js) | 全文搜索专项验证 |

---

## 4. 本地开发

### 4.1 纯静态模式（最快）

```bash
# 直接双击 public/index.html 也可以
python -m http.server 8080 -d public
# 打开 http://localhost:8080/
```

静态模式使用 `posts.js` 与浏览器 `localStorage`。适合改前台、写作页、导入导出和本地优先功能；不会包含云端 API 行为。

### 4.2 云端模式

1. 创建 D1 / KV，并把真实 ID 准备到临时配置中。
2. 不要提交真实 ID；`wrangler.workers.toml` 保留 `{env.*}` 占位符。
3. 本地调试时临时替换占位符，然后运行：

```bash
npx wrangler dev -c wrangler.workers.toml
```

需要验证 Pages Functions 时使用 `wrangler.toml`。需要验证 Cron、AI 或完整 Workers 行为时以 `wrangler.workers.toml` 为准。

### 4.3 必跑测试

```bash
node smoke-test.js      # 158 例
node gb-verify.js       # 18 例
node search-verify.js   # 25 例
```

三套测试只依赖 Node 内置模块。CI 在部署前全部运行，失败即中止。

### 4.4 修改前端后的压缩

```bash
node scripts/minify.mjs
```

脚本按需通过 `npx` 调用 terser / clean-css-cli；生成 `public/*.min.js` 与 `public/*.min.css`。发版时还要同步更新：

- `public/app.js` 的 `BLOG_VERSION`
- `public/index.html` 的所有 `?v=`
- `public/sw.js` 的 `CACHE_VERSION`

---

## 5. 请求生命周期

1. 浏览器读取 `public/config.js` 的 `mode`。
2. `auto` 会探测 `/api/posts`：成功走云端，失败走静态。
3. Workers 收到请求后先匹配 `/api/*`，再处理 RSS / Sitemap，最后读取 `ASSETS`。
4. 已知 SPA 路由返回 200 页面壳；未知无扩展名路径返回真实 404；未知 `/api/*` 始终返回 JSON 404。
5. 后台写操作统一使用 `Authorization: Bearer <session>`；写操作前后经过 CORS、安全头、限流和审计。

---

## 6. API 地图

> 以下为分组索引，不是完整请求契约；新增或调整接口时以 [../worker.js](../worker.js) 的分发逻辑为准。

| 分组 | 代表接口 | 鉴权 / 说明 |
| --- | --- | --- |
| 文章 | `GET /api/posts`、`GET/POST /api/posts/:id`、`PUT/DELETE /api/posts/:id` | 读公开；写操作需管理员会话 |
| 搜索 / 排行 | `GET /api/search`、`GET /api/popular` | 公开；搜索使用 FTS5 trigram，短词回退 LIKE |
| 评论与留言 | `GET/POST /api/posts/:id/comments`、`DELETE /api/posts/:id/comments/:cid`、`POST /api/comments/:id/like` | 读公开；删除 / 审核 / 批量操作需管理员 |
| 统计 | `GET /api/posts/:id/stats`、`GET /api/stats/trend`、`GET /api/admin/stats/sources` | 前台公开；来源聚合需管理员 |
| 关系与修订 | `GET /api/posts/:id/relations`、`GET /api/posts/:id/revisions`、`POST .../:revision/restore` | 读公开；恢复版本需管理员 |
| RSS / Sitemap | `GET /api/feed.xml`、`GET /api/sitemap.xml`、`GET /feed.xml`、`GET /sitemap.xml` | 公开；草稿与加密文章排除 |
| 订阅与邮件 | `POST /api/subscribe`、`GET/POST /api/subscribe/confirm`、`/api/subscribe/unsubscribe`、`/api/admin/subscribers/*` | 前台公开；后台列表 / 群发需管理员 |
| 媒体 / 音乐 | `/api/media`、`/api/media/upload-url`、`/api/music`、`/api/music/upload-url` | 读取公开；上传 / 修改 / 删除需管理员，文件直传 R2 |
| 预览链接 | `POST /api/admin/preview-link`、`GET /api/preview?token=...` | 生成需管理员；凭 HMAC Token 供未登录试读 |
| Webmention | `POST /api/webmention`、`GET /api/webmention`、`/api/admin/webmentions/*` | 接收端公开；后台管理需管理员 |
| 错误日志 | `POST /api/errors`、`GET/DELETE /api/admin/errors` | 上报公开且限流；查看 / 清空需管理员 |
| AI | `/api/ai/ping`、`summary`、`assist`、`comments` | 依赖 Workers AI 绑定；可被 `BLOG_AI_ENABLED` / `BLOG_AI_PUBLIC` 关闭 |
| 后台运维 | `/api/admin/health`、`/api/admin/audit`、`/api/admin/backups/*`、`/api/admin/tags` | 统一管理员会话；写操作进入审计日志 |
| 登录门禁 | `POST /api/admin/setup`、`login`、`logout`、`password` | `setup` 可能要求 `X-Setup-Key`；其余使用会话 Token |

---

## 7. D1 数据模型

| 分组 | 表 |
| --- | --- |
| 内容 | `posts`、`post_revisions`、`comments`、`posts_fts` |
| 统计 | `stats`、`stats_daily`、`stats_sources`、`error_logs` |
| 账号与审计 | `admin_auth`、`admin_sessions`、`admin_fails`、`audit_log` |
| 站点配置 | `site_settings`、`site_files` |
| 媒体与音乐 | `media`、`music` |
| 订阅与邮件 | `subscribers`、`mail_outbox` |
| 备份与引用 | `backups`、`webmentions` |
| 迁移记账 | `schema_migrations` |

迁移从 `0001_init.sql` 到 `0032_post_author.sql`。新增迁移时：

1. 使用连续编号，例如 `0033_xxx.sql`。
2. 优先写成可重复执行的 SQL：`IF NOT EXISTS`、补列前预检。
3. 本地至少跑一次全部测试；具体表结构看 [../migrations/](../migrations/)。
4. 部署工作流会先应用迁移，再部署 Worker。

---

## 8. 配置与开关

| 位置 | 用途 |
| --- | --- |
| `public/config.js` | 静态默认值：`mode`、`siteUrl`、`pageSize`、页脚、广告位 |
| D1 `site_settings.features` | 后台「功能开关」覆盖：分页、广告、错误上报、评论反机器人、Mermaid / KaTeX |
| D1 `site_settings.nav_menu` | 后台导航菜单，优先于代码内兜底 |
| `wrangler.workers.toml` | Workers 绑定、Cron、非敏感运行时变量 |
| GitHub Secrets | D1 / KV / R2 / Resend / AI / 清缓存 / 安装密钥等部署配置 |

完整环境变量总表与每个 Secret 的含义见 [README 的运行时环境变量总表](README.md#运行时环境变量总表) 与 [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md)。

---

## 9. 最近两天的主要增量

| 日期 | 模块 | 变化 |
| --- | --- | --- |
| 2026-10-03 | 数据与后台 | 趋势图与统计导出、评论邮件通知、评论点赞 / 精选 / 置顶、公告栏、评论分页排序 |
| 2026-10-03 | 编辑与阅读 | 编辑器表格 / 任务列表 / 代码块、字数统计、阅读位置记忆、正文划线高亮、正文字号与移动目录 |
| 2026-10-03 | 内容体系 | 分类页与首页筛选、阅读历史 / 稍后读、友链页、标签批量接口、服务端文章搜索分页 |
| 2026-10-03 | 安全与部署 | 强制改密、8 位密码口径、真实 404、Pages / Workers 音乐接口补齐 |
| 2026-10-04 | 内容与分发 | 文章级 SEO、Mermaid / KaTeX、草稿预览链接、静态站导出、打印 / PDF、Webmention、多作者 |
| 2026-10-04 | 后台与观测 | 功能开关、媒体 / 音乐 / 订阅 / 备份分页增强、站点健康检查、错误日志、来源 / 国家 / 设备识别、仪表盘冒烟 |
| 2026-10-04 | 稳定性 | i18n 兜底与自愈、后台全部评论 / 文章分页回归修复、来源统计修复、UI 运行时冒烟 |
| 2026-10-04 | 文档 | 文档统一迁入 `docs/`；README、部署指南、安全说明、llms.txt 与开发文档同步到 v2.10.63 |
| 2026-10-04 | 导航 | 旧后台 `nav_menu` 首次升级自动补齐新增默认项；保存后版本号同步，用户主动删除的项不会反复加回 |
| 2026-10-04 | 导航开关 | 后台「功能开关」新增「显示新增导航项」，关闭后隐藏分类 / 历史 / 系列 / 热门，保留基础导航和自定义链接 |
| 2026-10-05 | 后台显示 | 移除功能开关提示里的原始 Mermaid / 数学语法；AI 结果改为普通文本排版，不再按代码块展示 |
| 2026-10-06 | 首屏稳定性 | 语言包与接口加载加超时兜底（挂起不再冻结整页）、「发现」下拉内联样式兜底、Service Worker 预缓存精简 |
| 2026-10-07 | v2.10.66 | 统一下拉箭头风格
| 2026-10-07 | v2.10.67 | 顶栏「发现」选中样式对齐优化：箭头改为绝对定位收进右侧内边距，按钮不再比同级菜单宽出一截，选中下划线只覆盖文字宽度，不再显得偏右 |
| 2026-10-07 | v2.10.68 | 修正「发现」下拉菜单项的选中样式：下拉项不再继承顶栏下划线，改为左对齐列表，选中项使用左侧强调条 + 浅色高亮 |
| 2026-10-07 | v2.10.69 | 后台导航编辑器支持自定义二级下拉：任意一级项都能挂子菜单，子菜单可用层级按钮标记为「发现」二级；导航支持拖拽自由排序 |
| 2026-10-07 | v2.10.70 | 下拉风格全局统一：内置「发现」与后台自定义的一级下拉共用同一套箭头定位、大小、颜色与展开态规则，以后在后台新增任何带二级的导航都会自动与「发现」保持一致 |
| 2026-10-07 | v2.10.71 | 展开态配色统一：自定义下拉展开时主链接文字与箭头一起变为强调色（此前只有箭头变色），桌面顶栏与手机侧栏同步生效 |
| 2026-10-07 | v2.10.72 | 紧急修复：修正 index.html 中 app.min.js 脚本地址多出的反斜杠，导致线上主脚本 404、页面永久停在「加载中」；同时首屏渲染抛错时不再卡死加载动画（改为显示错误与返回首页），「发现」下拉无内容时不再渲染空菜单 |
| 2026-10-07 | v2.10.73 | 修正「发现」字号偏小：下拉触发按钮上的 font 简写会把字号重置为 16px（其他导航 18.5px），改为只继承字体族；侧栏导航同步继承字体族 |
| 2026-10-07 | v2.10.74 | 后台导航支持取消「发现」二级：内置标签 / 分类 / 历史 / 系列 / 热门可一键移出一级导航，支持放入 / 移出 / 默认三态切换 |
| 2026-10-07 | v2.10.75 | 后台导航新增「取消发现二级」：内置的标签 / 分类 / 历史 / 系列 / 热门也能一键移出「发现」下拉、回到一级导航，再点一次可放回；支持放入 / 移出 / 默认三态 |
| 2026-10-07 | v2.10.76 | 后台导航编辑器输入框宽度统一：一级行与二级子行改用固定列网格对齐，徽标不再挤占输入框宽度，子级不再左缩进 |
| 2026-10-07 | v2.10.77 | 自定义分类：分类导航下可自由添加二级分类（软件 / 系统 / 服务器…），文章可从下拉选择分类，点击分类按 ?category= 过滤出与首页一致的文章列表；「发现」下拉内支持嵌套展开子分类 |
| 2026-10-07 | v2.10.78 | 后台导航编辑器强化层级感：父级与二级子级成组显示，加竖向连接线 / 折角 / 节点点与父级色条，从属关系一目了然，且不影响一级二级输入框宽度一致性 |
| 2026-10-07 | v2.10.79 | 后台导航父子成组支持整体拖拽：拖动一级导航时父级与全部二级子级一起移动、一起高亮，落点插入线覆盖整组；并修正父级被拖到自己子级下会误变成子级的问题 |
| 2026-10-07 | v2.10.80 | 统一二级菜单交互与风格：分类等带下拉的导航点击标题即可展开（与「发现」一致，不再必须点小箭头），下拉顶部新增「全部」入口返回父页面；电脑端与手机端行为完全一致 |
| 2026-10-07 | v2.10.81 | 移除下拉里的「全部」入口：父级导航只作为二级菜单的标题提示，点击仅展开下拉、不再跳转父页面，光标统一为手型 |
| 2026-10-07 | v2.10.82 | 修复二级菜单无法收起：再次点击同一导航即可关闭（桌面 / 手机 / 嵌套子级统一）；手机端二级箭头横向位置、点击区域与旋转方向与「发现」完全对齐 |
| 2026-10-07 | v2.10.83 | 分类 / 标签二级菜单下的空列表不再显示「去写一篇」按钮，避免向访客暴露后台写作入口；仅站点确实一篇文未发时才显示，筛选后为空改为中性文案 |

---

## 10. 测试与 CI

```text
push / workflow_dispatch
  → checkout
  → Node 24
  → 安装 wrangler（普通 3.90，启用边缘限流时 4.36+）
  → smoke-test / gb-verify / search-verify
  → 检查必要 Secrets
  → 应用 D1 迁移
  → 部署 Worker
  → 写入运行时 Secret（只写非空值）
```

CI 失败不会部署。排查线上问题时优先看：

1. Actions 的测试输出。
2. Cloudflare Worker 日志。
3. 后台「健康检查」「操作审计」「前端错误日志」。
4. `/api/posts` 是否返回 200，以区分 Worker / D1 / 前端问题。

---

## 11. 发版检查清单

- [ ] 功能代码与压缩资源同步（`node scripts/minify.mjs`）
- [ ] `BLOG_VERSION` / `index.html ?v=` / `CACHE_VERSION` 三处版本一致
- [ ] 三套测试全部通过
- [ ] 新增数据库字段已写迁移并确认幂等
- [ ] 新增 Secret / 变量已写入文档与 GitHub Actions
- [ ] 文档索引、README、本开发文档同步更新
- [ ] 推送 `main`，等待 Actions 成功后验证线上 API 与首页

---

## 12. 常见扩展点

| 要做什么 | 推荐改动位置 |
| --- | --- |
| 加前台路由 | `public/app.js` 路由；必要时同步 `worker.js` 的 `isKnownSpaRoute` |
| 加 API | `functions/_lib/` 写处理器；`worker.js` 分发；`functions/api/` 加 Pages 包装 |
| 加后台页面 | `public/admin.js` / `admin.css`；加入后台路由与懒加载资源列表 |
| 加数据库字段 | `migrations/NNNN_*.sql` + 备份 / 恢复 / 导入导出同步 |
| 加多语言文案 | 5 个 `public/locales/*.json` + `public/i18n.js` 兜底；补 i18n 完整性测试 |
| 加安全敏感功能 | 同步 `SECURITY.md`、审计日志、限流与测试 |

---

## 13. 兼容性与限制

| 场景 | 行为 |
| --- | --- |
| `file://` | 使用静态模式；云端 API、R2、AI、邮件不可用 |
| Pages Functions | API 可用；Workers AI 绑定不可用 |
| 未配置 D1 | 云端接口不可用；静态体验不受影响 |
| 未配置 KV | 限流 / 去重 / AI 缓存降级，核心功能仍可用 |
| 未配置 R2 | 图片 / 音乐上传与备份停用，其余功能不受影响 |
| 未配置 Resend | 订阅与通知停用 |
| 浏览器禁用 JavaScript | 本项目的 SPA 渲染不可用，这是设计取舍 |

---

## 14. 文档地图

| 文档 | 用途 |
| --- | --- |
| [README.md](README.md) | 项目总览、功能、变量、快速开始与限制 |
| [CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md) | Cloudflare 从零部署 |
| [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md) | GitHub Secrets 与 R2 令牌 |
| [SECURITY.md](SECURITY.md) | 安全策略与报告方式 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献流程与提交规范 |
| [ABOUT.md](ABOUT.md) | 项目简介 |
