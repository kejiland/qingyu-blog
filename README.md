> 🌐 **中文** · [English](README_EN.md)

<p align="center">
  <img src="screenshots/home.png" alt="Qingyu'Blog" width="100%" />
</p>

<h1 align="center">Qingyu'Blog</h1>

<p align="center">
  <b>零框架 · 零构建 · 零依赖 —— 双击 index.html 就能用的个人博客</b>
</p>

<p align="center">
  <a href="https://www.2024921.xyz">
    <img src="https://img.shields.io/badge/在线预览-www.2024921.xyz-blue?style=flat-square" alt="Demo" />
  </a>
  <img src="https://img.shields.io/badge/许可证-MIT-green?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/技术栈-原生JS-orange?style=flat-square" alt="Vanilla JS" />
  <img src="https://img.shields.io/badge/部署-Cloudflare_Workers-purple?style=flat-square" alt="Cloudflare Workers" />
</p>

<p align="center">
  <a href="https://github.com/kejiland/qingyu-blog/stargazers">
    <img src="https://img.shields.io/github/stars/kejiland/qingyu-blog?style=social&logo=github" alt="GitHub Stars" />
  </a>
  <a href="https://github.com/kejiland/qingyu-blog/network/members">
    <img src="https://img.shields.io/github/forks/kejiland/qingyu-blog?style=social&logo=github" alt="GitHub Forks" />
  </a>
  <a href="https://github.com/kejiland/qingyu-blog/issues">
    <img src="https://img.shields.io/github/issues/kejiland/qingyu-blog?style=social&logo=github" alt="GitHub Issues" />
  </a>
  <a href="https://github.com/kejiland/qingyu-blog/pulls">
    <img src="https://img.shields.io/github/issues-pr/kejiland/qingyu-blog?style=social&logo=github" alt="GitHub Pull Requests" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/last-commit/kejiland/qingyu-blog?style=flat-square&logo=github" alt="Last Commit" />
  <img src="https://img.shields.io/github/commit-activity/w/kejiland/qingyu-blog?style=flat-square" alt="Commit Activity" />
  <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square&logo=git&logoColor=white" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/Issues-Welcome-brightgreen?style=flat-square&logo=github&logoColor=white" alt="Issues Welcome" />
  <a href="https://github.com/kejiland/qingyu-blog/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/kejiland/qingyu-blog?style=flat-square" alt="License" />
  </a>
</p>

---

## 📖 项目介绍

Qingyu'Blog（轻语博客）是一个**纯原生 JavaScript** 编写的个人博客系统，不依赖任何前端框架（React / Vue / Svelte）和构建工具（Webpack / Vite），也没有任何运行时第三方依赖。

它支持两种运行模式：

| 模式 | 说明 | 适用场景 |
| --- | --- | --- |
| **静态模式** | 双击 `public/index.html` 即可使用，数据存浏览器 localStorage | 本地写作、临时预览 |
| **云端模式** | 部署到 Cloudflare Workers + D1，数据存云端数据库 | 正式发布、多人访问 |

整个博客本体就在 `public/` 目录：前台 `index.html` + `style.css` + `app.js` + `posts.js` + `music-player.js` + `bg-anim.js`，后台 `admin.js` + `admin.css`，国际化 `i18n.js` + `locales/`。

> 💡 仓库根目录的 `index.html` 只是一个跳转页，会自动打开 `public/index.html`（Workers / Pages 的部署目录）。本地双击 `public/index.html` 同样可用。

> 🆕 **第一次部署 Cloudflare？** 请直接看 **[Cloudflare 配置完全指南（新手版）](CLOUDFLARE_SETUP_GUIDE.md)** —— 从注册账号、创建 D1/KV、申请 API Token，到 R2 桶与 CORS、绑定域名、首次初始化管理员，每一步都写了在控制台的哪个位置点什么。

---

## ✅ 优点

| 优点 | 说明 |
| --- | --- |
| **零门槛** | 不需要 Node.js、不需要 npm、不需要构建，双击即可运行 |
| **零成本** | Cloudflare Workers + D1 + KV + R2 的免费额度完全够个人博客使用 |
| **零依赖** | 不引入任何第三方运行时库，代码量可控，加载极快 |
| **零锁定** | 文章是 Markdown 文本，数据在标准 SQLite（D1），随时可以迁走 |
| **双通道** | 静态导出 + 云端 API，同一份代码两种部署方式 |
| **响应式** | 前台 + 后台均支持手机 / 平板 / 桌面全适配 |
| **多语言** | 内置中文 / English / 日本語 / 한국어 / हिन्दी 五语界面，自动识别浏览器语言 |
| **书卷美学** | 宋体正文 + 仿宋引用装饰，**零 webfont 下载**；四季背景动画（春樱 / 夏光 / 秋叶 / 冬雪） |
| **安全** | 密码 PBKDF2-SHA256 加盐哈希（10 万次迭代）、会话令牌鉴权、登录失败限流锁定、CSP 等安全响应头 |
| **AI 增强** | Workers AI 提供文章摘要 / 写作助手 / 评论汇总 / 垃圾检测；未配置或关闭时自动隐藏入口、对博客零影响 |

---

## 🚀 快速开始

### 方式一：本地静态（零安装）

```bash
git clone https://github.com/kejiland/qingyu-blog.git
cd qingyu-blog
```

双击 `public/index.html`，或启动本地服务器：

```bash
# Python
python -m http.server 8080 -d public

# Node.js
npx serve public
```

打开 `http://localhost:8080/admin`，设置密码即可开始写作。

### 方式二：Cloudflare Workers（推荐·正式发布）

只需要四件事：**创建 D1 数据库 → 创建 KV 命名空间 → 申请 API Token → 填进 GitHub Secrets**，剩下的交给 GitHub Actions。

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库（主存储：文章 / 评论 / 统计 / 密码 / 设置）
npx wrangler d1 create blog
# 记下输出的 database_id（是 UUID，不是数据库名，也不是 KV 的 id）

# 创建 KV 命名空间（限流 / 去重 / AI 缓存）
npx wrangler kv namespace create BLOG
# 记下输出的 id（32 位十六进制）
```

在仓库 **Settings → Secrets and variables → Actions → Secrets** 中添加：

**必填（缺一个部署就停）：**

| Secret | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Account API Token（需 Workers Scripts / D1 / KV 的 Edit 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID（控制台右侧可见，或看地址栏） |
| `BLOG_D1_ID` | D1 数据库 ID（上一步创建获得，**UUID 格式**） |
| `BLOG_KV_ID` | KV 命名空间 ID（上一步创建获得，**32 位十六进制**） |

**推荐：**

| Secret | 说明 |
| --- | --- |
| `BLOG_ADMIN_SETUP_KEY` | 安装密钥。配置后只有拿着这串密钥的人才能初始化管理员密码（**防抢注，强烈建议**）；未配置则退化为"首次登录自动生成随机默认密码"，存在先到先得竞态 |
| `SITE_URL` | 站点对外域名，如 `https://blog.example.com`（用于收紧 CORS / RSS / Sitemap，**末尾不要加 `/`**） |

**可选：**

| Secret | 说明 |
| --- | --- |
| `CF_ZONE_ID` | 自定义域名的 Zone ID；配合 Token 的 Cache Purge 权限 → 发布即清边缘缓存 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` | R2 S3 兼容凭据（音乐与媒体**共用**同一对） |
| `R2_BUCKET` / `R2_PUBLIC_BASE` | **音乐专用桶**：桶名 + 公开域名（**不能为空**，否则整组 R2 配置不写入） |
| `R2_MEDIA_BUCKET` / `R2_MEDIA_PUBLIC_BASE` | **媒体专用桶**：桶名 + 公开域名 |
| `PAGES_PROJECT_NAME` | 名字有误导性：实际作用是覆盖 **Worker 名称**。不填则用 `wrangler.workers.toml` 里的 `kejiland`。新手建议不填 |
| `BLOG_RATE_LIMIT_BINDING` | 启用 Worker 内的边缘登录限流（值为正整数命名空间，如 `1001`）；会让部署改用 wrangler 4.x。账户不支持时删掉即可 |
| `BLOG_WRITE_TOKEN` | 旧式写入令牌，新部署不需要 |

推送代码或手动运行 Actions，工作流会自动：

1. ✅ 安装 Wrangler CLI
2. ✅ 运行三套测试（`smoke-test.js` 78 例 / `gb-verify.js` 18 例 / `search-verify.js` 13 例，失败即中止不部署）
3. ✅ 校验必要 Secrets 与 ID 格式
4. ✅ 执行 D1 迁移（`schema_migrations` 记账表 + 列预检 + 报错兜底，三层幂等）
5. ✅ 部署 Worker 到 Cloudflare
6. ✅ 写入运行时 Secret（安装密钥 / R2 凭据 / 清缓存凭证，配置了才写）

部署完成后访问 `https://你的域名/admin`：配置了安装密钥就点「首次部署？使用安装密钥初始化」；没配置就用任意密码登录一次、拿页面上弹出的随机默认密码登录，然后立刻改密。

> 详细的每一步（含控制台截图级别的路径说明、权限勾选表、R2 CORS 配置、故障排查速查表）见 **[CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md)**。
> 只想搞清 Secrets 与 R2 令牌的区别，看 **[DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md)**。

#### 从 KV 迁移到 D1（旧数据）

若你此前使用 KV 单 key 存储，可把线上数据搬到 D1：

```bash
# 本地执行（需 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / BLOG_KV_ID / BLOG_D1_ID）
node scripts/migrate-kv-to-d1.mjs --dry-run   # 仅预览 SQL
node scripts/migrate-kv-to-d1.mjs             # 正式写入 D1
```

或在仓库 Actions 标签页手动触发 `Migrate KV to D1` 工作流（支持 `dry-run` / `migrate` 两种模式）。

---

## ✨ 特色功能

### 前台

| 功能 | 说明 |
| --- | --- |
| 真实路径路由 | 无 hash：`/`、`/archive`、`/tags`、`/about`、`/guestbook`、`/posts/<别名>/`、`/admin`、`/write`，刷新不 404 |
| Markdown 渲染 | 标题 / 表格 / 引用 / 列表 / 代码块（js、ts、python、bash、css 语法高亮）/ 行内代码 / 加粗斜体删除线 / 图片 / 链接；输入先转义，不执行原始 HTML |
| 正文目录 TOC | 自动编号（1 / 1.1 / 1.2 …）、标题锚点、可折叠，点击平滑滚动 |
| 阅读体验 | 阅读时长估算、浏览数、点赞（含本机去重）、置顶徽章、**复制链接**、返回顶部 |
| 评论系统 | 云端 D1 全局评论 + 审核模式；**最多 3 层嵌套回复**；孤儿回复自动提升；**删除文章级联清理**评论/点赞/浏览量；**重复发送拦截**（同分区同昵称同内容 409）与频率限制（每 IP 5 条/分钟） |
| 留言板 | 导航直达 `/guestbook`，「留言 / 优化方案」双分区，云端存储，复用评论安全管道；支持 `Ctrl/⌘ + Enter` 发送 |
| 站内搜索 | 实时匹配标题 / 标签 / 摘要 / 正文，结果展示**关键字所在完整句子上下文**并**高亮关键字**，无命中给空态提示 |
| 标签与归档 | 首页标签筛选（`?tag=`，支持回退清除）、标签云（含计数）、归档按「年 → 月」分组 |
| 精选文章 | 评论区下方自动推荐（**点赞×3 + 浏览×1 + 评论×5**，取前 2 篇，排除当前文章与草稿） |
| RSS / Sitemap | `/feed.xml`、`/sitemap.xml` 云端动态生成，随文章增删改查自动更新；草稿与加密文章自动排除 |
| 上一篇 / 下一篇 | 只有一条时自动隐藏空位 |
| 卡片式列表 | 封面缩略图（自动取 cover 或正文首图）、置顶徽章、标签贴底、加载骨架屏、分页（`?page=`） |
| **深色 / 浅色主题** | 一键切换，跟随系统偏好，无首屏闪白；顶栏会随滚动加深阴影 |
| **主题色切换** | **4 种强调色**：赭橙（terra）/ 黛蓝（indigo）/ 竹青（bamboo）/ 凝夜紫（dusk）。桌面为图标按钮 + 色板弹层，手机端为原生下拉；每种配色会连带调整背景与边框色 |
| **多语言界面** | 中文 / English / 日本語 / 한국어 / हिन्दी（各 494 个语言键），自动识别 + 手动切换，桌面为 🌐 弹层 + SVG 国旗，手机端为原生下拉 |
| **背景动画** | canvas 手绘四季粒子（春樱 / 夏光 / 秋叶 / 冬雪），仅首页运行、页面隐藏时暂停；桌面默认开、触屏默认关，顶栏可一键开关，尊重 `prefers-reduced-motion` |
| **Smoji 表情** | 评论、留言板、编辑器三处都内置表情选择器，按需懒加载，支持正文内联渲染 |
| **AI 文章摘要** | 文章页一键生成内容摘要（单篇缓存 30 天）；AI 不可用时入口自动隐藏 |
| **全站音乐播放器** | 右下角悬浮音符按钮，平时**缩进窗口外只露出一点圆弧**、悬停 / 点击滑出；面板含曲目信息 · 可拖动进度条 · 上一首 / 播放暂停 / 下一首 · 音量 · 播放列表（当前项高亮 + 均衡动画）。自动连播、**记忆上次曲目与进度**、音量持久化，刷新后恢复但**不自动出声**；无音乐时完全隐藏，后台路由自动收起；样式与脚本不在首屏关键路径上 |
| 书卷风衬线排版 | 正文 / 标题 / 大标题统一走系统宋体栈，引用装饰走系统仿宋；iOS 走原生宋体 / 仿宋；**不加载任何 webfont**，无首屏字体下载 |
| 无障碍与细节 | 弹层带 `role` / `aria-*`；图标按钮有 `title` / `aria-label`；图片 `loading="lazy"` + 加载淡入；CSP 等安全响应头 |

### 管理后台

后台是一个独立切片（`admin.js` + `admin.css`），只在进入后台路由时懒加载，前台首屏零成本。

| 功能 | 说明 |
| --- | --- |
| 路由 | `/admin`（仪表盘）、`/admin/posts`、`/admin/posts/new`、`/admin/posts/:id/edit`、`/admin/tags`、`/admin/comments`、`/admin/comments/pending`、`/admin/media`、`/admin/music`、`/admin/settings`；未知 `/admin/*` 回退到仪表盘 |
| 登录门禁 | 云端：密码登录，或「首次部署？使用安装密钥初始化」（安装密钥走 `X-Setup-Key`）；触发登录限流时页面会自动展开「被限流？用安装密钥登录」应急入口（只跳过限流，不跳过密码校验）。静态：本地门禁。任何接口返回 401 会提示「登录已过期」并自动跳回登录页 |
| 仪表盘 | **6 张统计卡**（文章总数 / 已发布 / 草稿 / 置顶 / 评论总数 / 待审核）+ **近 30 天访问与评论两张折线图**（内联 SVG，支持悬停预览与点击固定数值）+ 最新发布 / 最新评论（自动滚动、悬停暂停） |
| 文章管理 | 关键字搜索（标题 + 标签，250ms 防抖）、状态筛选（全部 / 已发布 / 草稿）、每页 10 篇分页、置顶切换（乐观更新）、**删除无感刷新**（行级淡出 + 服务端级联清理评论/统计） |
| 编辑器 | 标题 / 标签 / 封面（可从媒体库选）/ 置顶 / Markdown 正文；**右侧实时预览**、输入框自动增高、工具栏（加粗、斜体、标题、引用、代码、列表、链接、图片、表情）；存草稿或直接发布 |
| **AI 写作助手** | 编辑器内一键：标题建议 / 润色 / 翻译（5 种目标语言），结果可应用到标题、替换原文、插入正文末尾或复制；AI 不可用时整条栏位不渲染 |
| 评论管理 | 全局评论列表（评论人 / 内容 / 所属文章 / 时间 / 状态 / 操作）、关键字搜索、状态筛选、**通过审核**（就地更新徽章，不整表重载）、删除（行级淡出）；侧栏「待审核评论」带实时数量徽章 |
| **AI 评论工具** | 一键汇总近期评论要点（1 小时缓存）+ 单条评论垃圾检测（红 / 绿判定 + 原因） |
| 标签管理 | 标签列表由文章实时统计得出；支持重命名 / 删除（批量更新所有相关文章） |
| 媒体资源库 | 图片上传（浏览器**直传 R2** 预签名 URL，元数据存 D1）、网格预览、复制 URL、删除（先删 R2 对象再删 D1 行）；静态模式与非云环境给出提示 |
| **音乐管理** | 音频上传（直传 R2，带百分比进度条，支持拖拽）；**文件名自动识别「歌曲名-歌手」**预填；列表行内试听（播放 / 暂停 / 拖动进度 / 显示当前时间与总时长）、重命名、删除（与 R2 对象同步）；曲目多时列表卡片内滚动 + 表头吸顶 |
| 博客设置 | 5 个标签页：**站点基础信息**（站点名称 / 简介 / 头像 Logo / 关于页内容 / 页脚版权署名 / 页脚声明 / 新评论默认需审核）、**个人资料**（昵称 / 简介 / 头像 / 邮箱）、**导航菜单**（可视化增删 + 二级子项 + 一键重置）、**底部导航**、**友情链接** |
| 顶栏 | 侧栏折叠按钮、面包屑、预览站点、🌐 语言切换、账户菜单（个人资料 / 修改密码 / 退出登录） |
| 一键导出 | **静态模式特有**：编辑器里的「一键导出全部」同时导出 `posts.js` + `feed.xml` + `sitemap.xml`，覆盖 `public/` 即发布（云端模式由服务端动态生成 RSS/Sitemap，因此没有导出入口） |
| 响应式 | PC 固定侧栏（可折叠为 72px 图标栏）/ 移动端抽屉导航；断点 1100 / 991 / 640 / 420px |

---

## 🖼️ 项目截图

### 前台

| 首页（浅色 · 含标签筛选、置顶徽章、封面缩略图） | 文章详情（TOC、表格、代码块） | 站内搜索（关键字高亮 + 句子上下文） |
| --- | --- | --- |
| ![首页](screenshots/home.png) | ![文章详情](screenshots/detail.png) | ![搜索](screenshots/search.png) |

| 标签云 | 归档（按年月分组） | 留言板 |
| --- | --- | --- |
| ![标签](screenshots/tags.png) | ![归档](screenshots/archive.png) | ![留言板](screenshots/guestbook.png) |

| 首页（深色） | 文章（深色） | 移动端 |
| --- | --- | --- |
| ![首页深色](screenshots/home-dark.png) | ![文章深色](screenshots/detail-dark.png) | ![移动端](screenshots/mobile.png) |

| 全站音乐播放器（点击右下角按钮弹出的面板） |
| --- |
| ![音乐播放器](screenshots/music-player.png) |

### 管理后台

| 登录门禁（首次部署可用安装密钥初始化） | 仪表盘（6 张统计卡 + 30 天趋势图） | 深色模式 |
| --- | --- | --- |
| ![登录](screenshots/admin-gate.png) | ![仪表盘](screenshots/admin.png) | ![后台深色](screenshots/admin-dark.png) |

| 文章管理 | 编辑器（Markdown 实时预览 + AI 写作助手） | 评论管理 |
| --- | --- | --- |
| ![文章管理](screenshots/admin-posts.png) | ![编辑器](screenshots/write.png) | ![评论管理](screenshots/admin-list.png) |

| 媒体资源库 | 音乐管理（行内试听 + 表头吸顶） | 博客设置 | 标签管理 |
| --- | --- | --- | --- |
| ![媒体资源](screenshots/admin-media.png) | ![音乐管理](screenshots/music-admin.png) | ![博客设置](screenshots/admin-settings.png) | ![标签管理](screenshots/admin-tags.png) |

### 衬线排版预览

| 首页（浅色） | 文章（浅色） | 文章（深色） |
| --- | --- | --- |
| ![首页浅色](screenshots/font-preview/home-light.png) | ![文章浅色](screenshots/font-preview/article-light.png) | ![文章深色](screenshots/font-preview/article-dark.png) |

> 🔧 截图由 `scripts/screenshots/capture.mjs` 用无头 Chrome 打开本地演示服务器（内置示例文章 / 评论 / 音乐数据）自动生成，**界面是 `public/` 的真实代码**，数据为演示内容。
> 重新生成：`npm i -D puppeteer-core && node scripts/screenshots/capture.mjs`

---

## 📁 目录结构

```
├── public/                            # 站点本体（静态资源，部署目录）
│   ├── index.html                     # 页面入口（双击 / 部署起点）
│   ├── config.js / config.min.js      # 全站配置（模式 / 站点地址 / 页脚 / 广告）
│   ├── style.css / style.min.css      # 前台样式（明暗主题 + 4 种强调色 + 响应式 + 衬线字体栈）
│   ├── app.js / app.min.js            # 前台逻辑（路由 / Markdown / 搜索 / 评论 / 留言板 / 统计 / i18n / AI 摘要）
│   ├── admin.js / admin.min.js        # 后台管理 SPA（按需懒加载）
│   ├── admin.css / admin.min.css      # 后台样式（玻璃拟态，响应式）
│   ├── music-player.js / .min.js      # 全站音乐播放器（悬浮按钮 + 面板 + 播放列表 + 进度记忆）
│   ├── music-player.css / .min.css    # 播放器样式（不在首屏关键路径，空闲时加载）
│   ├── bg-anim.js / bg-anim.min.js    # 四季 canvas 背景动画
│   ├── i18n.js / i18n.min.js          # 国际化模块（中/英/日/韩/印地，内置中文兜底）
│   ├── posts.js / posts.min.js        # 静态模式文章数据（由「导出 posts.js」生成）
│   ├── locales/                       # 语言包（zh-CN / en / ja / ko / hi，各 494 键）
│   ├── flags/                         # 语言切换用的 SVG 国旗（cn / gb / jp / kr / in）
│   ├── libs/smoji/                    # Smoji 表情选择器（按需加载）
│   ├── fonts/dreamserif/              # ⚠️ 历史遗留的本地衬线字体分片（当前版本不再加载，见「已知限制」）
│   ├── robots.txt                     # 爬虫规则（禁止抓取后台，声明 Sitemap）
│   ├── llms.txt                       # 面向 LLM / 代理的站点说明
│   ├── ads.txt                        # 广告声明（可选，配合 config.js ads）
│   ├── _headers                       # Cloudflare 响应头（CSP / 安全头 / 各类资源缓存策略）
│   ├── _redirects                     # Cloudflare 路由（SPA 回退 + /public 前缀 301）
│   ├── .well-known/                   # ard.json（ARD v0.91）与 ai-catalog.json（兼容入口）
│   # feed.xml / sitemap.xml 由云端动态生成（见 functions/）
├── functions/                         # Cloudflare API（Pages Functions / Workers 共用）
│   ├── api/
│   │   ├── posts.js                   # 文章列表 / 创建
│   │   ├── posts/[id].js              # 单篇文章（GET / PUT / DELETE，删除级联清理）
│   │   ├── posts/[id]/comments.js     # 文章评论（GET / POST，3 层嵌套）
│   │   ├── posts/[id]/comments/[cid].js  # 单条评论删除
│   │   ├── posts/[id]/stats.js        # 阅读 / 点赞统计
│   │   ├── comments.js                # 全局评论列表（后台）
│   │   ├── comments/[id].js           # 评论审核 / 删除
│   │   ├── ai/{ping,summary,assist,comments}.js  # AI 探测 / 摘要 / 写作助手 / 评论工具
│   │   ├── media.js                   # 媒体列表 / 登记元数据（仅 http/https）
│   │   ├── media/upload-url.js        # 签发 R2 预签名上传 URL（图片直传）
│   │   ├── media/[id].js              # 媒体删除（先删 R2 对象再删 D1 行）
│   │   ├── settings.js                # 站点设置
│   │   ├── stats/trend.js             # 近 N 天（1~90，默认 30）趋势数据
│   │   ├── site-files/index.js        # 站点产物：列出 / 保存
│   │   ├── site-files/[name].js       # 站点产物：下载内容
│   │   ├── admin/{setup,login,logout,password}.js  # 初始化 / 登录 / 登出 / 改密
│   │   ├── feed.xml.js                # /api/feed.xml 动态 RSS（兼容旧入口）
│   │   ├── sitemap.xml.js             # /api/sitemap.xml 动态 Sitemap（兼容旧入口）
│   │   └── [[path]].js                # /api/* 兜底：未知接口一律返回 JSON 404（绝不回退 HTML）
│   ├── feed.xml.js                    # 根路径 /feed.xml 动态 RSS
│   ├── sitemap.xml.js                 # 根路径 /sitemap.xml 动态 Sitemap
│   └── _lib/
│       ├── api-core.js                # API 核心（D1 + 鉴权 + 安全 + 限流 + RSS/Sitemap）
│       ├── ai.js                      # Workers AI 封装（模型 / 提示词 / 限流 / 缓存 / 降级）
│       ├── media.js                   # 媒体 R2 直传（签名 / 删除 / 元数据）
│       └── music.js                   # 音乐 API（R2 预签名直传 / 元数据 CRUD / R2 对象同步删除）
├── worker.js                          # Cloudflare Workers 入口（路由分发 + 静态资源 + SPA 回退 + 缓存头）
├── migrations/                        # D1 迁移（CI 自动执行，记账表幂等）
│   ├── 0001_init.sql                  # 基础表（posts / comments / stats / admin_*）
│   ├── 0002_site_files.sql            # 站点产物存储
│   ├── 0003_cover_column.sql          # 封面图字段（老库补列）
│   ├── 0004_post_meta.sql             # 分类 / 发布状态（老库补列）
│   ├── 0005_comment_status.sql        # 评论审核状态（老库补列）
│   ├── 0006_media.sql                 # 媒体资源表
│   ├── 0007_settings.sql              # 站点设置表
│   ├── 0008_stats_daily.sql           # 每日统计表
│   ├── 0009_comment_status_index.sql  # 评论状态索引
│   ├── 0010_admin_must_change.sql     # 强制改密标记（老库补列）
│   ├── 0011_comment_reply.sql         # 评论 parent_id 字段（老库补列）
│   ├── 0012_clear_orphaned_nav.sql    # 清理遗留 nav 配置
│   ├── 0013_music.sql                 # 音乐播放列表元数据表
│   ├── 0014_purge_base64_media.sql    # 清理历史 base64 媒体记录
│   └── 0015_hot_path_indexes.sql      # 热点路径索引（评论 / 音乐 / 媒体 / 会话）
├── scripts/
│   ├── migrate-kv-to-d1.mjs           # 一次性迁移：KV 数据 → D1
│   ├── minify.mjs                     # 用 terser / clean-css 生成 public/ 下的 *.min.*
│   └── screenshots/                   # README 截图生成工具（可选，需 puppeteer-core）
│       ├── demo-content.mjs           # 截图用示例数据（文章 / 评论 / 音乐 / 媒体 / 设置）
│       ├── demo-server.mjs            # 本地演示服务器（静态资源 + mock /api）
│       └── capture.mjs                # 无头 Chrome 截图脚本
├── .github/workflows/
│   ├── deploy.yml                     # GitHub Actions 自动部署到 Workers
│   └── migrate-kv-to-d1.yml           # 手动触发 KV → D1 迁移
├── seed.js                            # 导入示例文章到云端 API
├── index.html                         # 根跳转页（自动跳 public/index.html）
├── wrangler.toml                      # Cloudflare Pages 配置
├── wrangler.workers.toml              # Cloudflare Workers 配置（部署使用）
├── smoke-test.js                      # 冒烟测试（78 例）
├── gb-verify.js                       # 留言板专项验证（18 例）
├── search-verify.js                   # 搜索专项验证（13 例）
├── README.md                          # 中文说明（本文件）
├── README_EN.md                       # 英文说明
├── CLOUDFLARE_SETUP_GUIDE.md          # Cloudflare 配置完全指南（新手版·中文）
├── CLOUDFLARE_SETUP_GUIDE_EN.md       # 同上 · 英文
├── DEPLOYMENT_SECRETS_GUIDE.md        # GitHub Secrets 与 R2 令牌详解·中文
├── DEPLOYMENT_SECRETS_GUIDE_EN.md     # 同上 · 英文
├── SECURITY.md / SECURITY_EN.md       # 安全策略（中 / 英）
├── CODE_OF_CONDUCT.md                 # 行为准则 · 中文
├── CODE_OF_CONDUCT_EN.md              # 行为准则 · 英文
├── ABOUT.md / ABOUT_EN.md             # 项目简介（中 / 英）
├── CONTRIBUTING.md                    # 贡献指南（单文件内中英对照）
└── LICENSE
```

---

## ☁️ Cloudflare 服务说明

> 完整的控制台操作步骤见 **[CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md)**，本节只讲"代码里怎么用"。

### Workers（计算 + 静态资源）

- **入口**：`worker.js`（路由分发）；`functions/` 下的文件同时可被 Pages Functions 复用
- **静态资源**：`public/` 通过 `[assets]` 绑定提供，SPA 回退 + 缓存头都在 Worker 里处理
- **兼容性日期**：`2025-02-01`

`wrangler.workers.toml` 关键配置：

```toml
name = "kejiland"
main = "worker.js"

[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"  # 无扩展名路径回退 index.html
html_handling = "auto-trailing-slash"

[[kv_namespaces]]
binding = "BLOG"
id = "{env.BLOG_KV_ID}"        # KV 的 id 不支持 {env.} 内插，CI 部署前用脚本替换

[[d1_databases]]
binding = "DB"
database_name = "blog"
database_id = "{env.BLOG_D1_ID}"

[ai]                            # Workers AI（绑定名必须是 AI）
binding = "AI"

[vars]
SITE_URL = "{env.SITE_URL}"
CF_ZONE_ID = "{env.CF_ZONE_ID}"
```

**静态资源的缓存策略**（Worker 里统一设置）：

| 资源 | Cache-Control |
| --- | --- |
| 带 `?v=` 版本号，或 `/fonts/`、`/flags/`、`/libs/smoji/` 下的文件 | `public, max-age=31536000, immutable` |
| 其他带扩展名的静态文件 | `public, max-age=3600, stale-while-revalidate=86400` |
| 无扩展名的 HTML 入口 | `no-cache`（靠 ETag 命中 304） |

**API 边界**：未知 `/api/*` 一律返回 JSON 404，绝不回退到 `index.html`；非 GET/HEAD 请求也不会被 SPA 回退。

### KV（限流 / 去重 / AI 缓存）

KV 不是文章存储，而是**限流与去重**设施：

| Key 模式 | 用途 | TTL |
| --- | --- | --- |
| `rate:cmt:<ip>:<分钟窗口>` | 评论频率限制（5 条/分钟） | 120s |
| `rate:like:<ip>:<分钟窗口>` | 点赞频率限制（10 次/分钟） | 120s |
| `rate:view:<ip>:<分钟窗口>` | 浏览频率限制（30 次/分钟） | 120s |
| `liked:<ip>:<postId>` | 同一 IP 对同一文章只计一次赞 | 30 天 |
| `viewed:<ip>:<postId>` | 同一 IP 对同一文章每小时只计一次浏览 | 1 小时 |
| `ai:sum:ip:<ip>` / `ai:sum:day:g` | AI 摘要用量（8 次/时·IP；300 次/天·全站） | 1 小时 / 1 天 |
| `ai:assist:day:<ip>` / `ai:cmt:day:<ip>` | AI 写作助手 / 评论工具每日用量 | 1 天 |
| `ai:sum:<slug>:<lang>` / `ai:cmt:sum` | AI 摘要（30 天）与评论汇总（1 小时）缓存 | 见左 |

> ⚠️ KV 是**最终一致性**存储（全球传播有延迟），只适合计数与缓存；需要强一致性的数据都在 D1。
> ⚠️ KV 未绑定时，上面的限流与去重会**静默失效**（日志里有一条 warning），所以建议配置。

### D1（SQLite 数据库·主存储）

| 表 | 说明 | 关键字段 |
| --- | --- | --- |
| `posts` | 文章 | id, title, date, excerpt, content, cover, pinned, protected, enc, tags(JSON), category, status |
| `comments` | 评论 | id, post_id, author, content, date, status(approved/pending), **parent_id** |
| `stats` | 阅读 / 点赞 | post_id, likes, views |
| `stats_daily` | 每日聚合（趋势图） | post_id, date, views, likes（PRIMARY KEY(post_id,date)） |
| `admin_auth` | 管理员密码 | k, salt, hash, iter, must_change |
| `admin_sessions` | 登录会话 | token, exp（7 天，绝对时间戳） |
| `admin_fails` | 登录失败限流 | ip, n, until |
| `media` | 媒体元数据 | id, name, url, type, size, created_at |
| `site_settings` | 站点设置 | k, v |
| `site_files` | 站点产物 | name, content, updated_at |
| `music` | 音乐元数据 | id, title, artist, url, cover, size, duration, sort, created_at |
| `schema_migrations` | CI 记账表 | name, applied_at |

`0015_hot_path_indexes.sql` 补充了 5 个热点索引：`idx_comments_post_id`、`idx_comments_status_date`、`idx_music_sort`、`idx_media_created_id`、`idx_admin_sessions_exp`。

### R2（对象存储：音乐 + 媒体图片）

文件本体存 R2，D1 只存元数据；**上传走浏览器直传**，文件不经过 Worker。

| 能力 | 说明 |
| --- | --- |
| 浏览器直传 | 后端签发 SigV4 预签名 `PUT` URL（**签名含 `content-type;host`**，使用 `UNSIGNED-PAYLOAD`，有效期 3600 秒），文件直传 R2，前端显示进度 |
| 公开读取 | 绑定 R2 自定义域名（如 `music.example.com` / `media.example.com`），前台直接拉流 / 显示图片 |
| 同步删除 | 删除时 Worker 侧用签名发起 R2 `DELETE`（签名头 `host;x-amz-content-sha256;x-amz-date`），成功后再删 D1 行 |
| 桶选择 | 图片固定写 `R2_MEDIA_BUCKET`；音乐**优先**写 `R2_BUCKET`，仅当 `R2_BUCKET` 或 `R2_PUBLIC_BASE` 为空时回退 `R2_MEDIA_BUCKET` |
| 音乐白名单 | mp3 / m4a / ogg / oga / wav / aac / opus / flac，单文件 ≤ 30MB |
| 图片白名单 | png / jpg / jpeg / webp / gif / svg / avif / bmp / ico，单文件 ≤ 10MB |
| 降级 | 未配置 R2 凭据时上传接口返回 503；读取与其余功能不受影响 |
| 凭据 | **只有一组**：音乐与图片共用 `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`（必须同时有权限访问两个桶） |

> **💡 缩略图 / 封面 / 音频首次加载偏慢？** 浏览器直传的 R2 对象默认不带长缓存头，首次加载需要回源。
> 建议在 Cloudflare 控制台 → 你的域名 → **缓存 → Cache Rules** 新建一条规则：
> Hostname 匹配 `media.你的域` 与 `music.你的域` → **Cache Everything / Eligible for cache** → Edge TTL 与 Browser TTL 都设 1 个月。
> 保存后第一次访问仍回源一次，之后浏览器与边缘都直接命中。
> 前端侧也已配合优化：首屏前 2 张缩略图 `fetchpriority="high"`、全部图片 `loading="lazy" decoding="async"` 并做加载淡入。

### Workers AI（推理）

默认模型 `@cf/meta/llama-3.2-3b-instruct`，按 Neurons 计费，免费额度约 **10,000 Neurons/天**：

| 接口 | 用途 | 限制 |
| --- | --- | --- |
| `GET /api/ai/ping` | 可用性探测（前端据此显示 / 隐藏全部 AI 入口） | — |
| `GET/POST /api/ai/summary` | 文章摘要（单篇缓存 30 天；`force` 重新生成需登录） | IP 8 次/时；全站 300 次/天 |
| `POST /api/ai/assist` | 写作助手：标题建议 / 润色 / 翻译（需登录） | 200 次/天 |
| `POST /api/ai/comments` | 评论汇总（缓存 1 小时）与单条垃圾检测（需登录） | 100 次/天 |

- **配置**：`wrangler.workers.toml` 里的 `[ai] binding = "AI"`（部署时自动创建绑定）；环境变量 `BLOG_AI_ENABLED` 设为 `0` / `false` / `off` 可整体关闭，`BLOG_AI_PUBLIC` 设为同样值可禁止匿名生成摘要
- **优雅降级**：未绑定 AI、未配置 D1 或开关关闭时，相关接口返回 404，前端（`aiProbe`）自动隐藏全部 AI 入口，博客其余功能完全不受影响
- **前端记忆策略**：探测到「可用」缓存 10 分钟、「不可用」只缓存 30 秒，AI 上线 / 修复后刷新页面即恢复
- **隐私提示**：AI 摘要 / 写作助手 / 评论汇总会把相应**明文内容**发送给 Cloudflare Workers AI 做推理；涉及敏感内容请关闭相关入口

> ⚠️ `[ai]` 是 **Workers 专属绑定**。`wrangler.toml`（Pages 配置）里没有这一项，所以在 Pages 部署下 AI 接口恒为 404。

---

## ⚙️ 配置文件说明

### config.js

```javascript
window.BLOG_CONFIG = {
  // ====== 基础配置 ======
  mode: 'auto',           // 'auto' | 'static' | 'api'
  apiBase: '',            // API 基础地址，留空 = 同源
  siteUrl: 'https://www.example.com', // 站点对外地址（RSS / Sitemap / canonical）
  writeToken: '',         // 旧版静态令牌（建议用登录替代）
  pageSize: 5,            // 首页每页文章数（0 = 不分页；非数字时回退 8）
  adminPwd: '',           // 静态模式本地密码（云端模式请留空）

  // ====== 页脚（云端模式下会被 D1 设置覆盖）======
  footer: {
    text: '',
    icp: '',               // 备案号
    contact: [],           // 底部导航（云端由「博客设置 → 底部导航」覆盖）
    links: [],             // 友情链接（云端由「博客设置 → 友情链接」覆盖）
    decl: '',              // 站点声明（云端由「页脚声明」覆盖）
    email: '',             // 联系邮箱（云端由「个人资料 → 邮箱」覆盖）
    startYear: 2019,       // 版权起始年
    copyrightName: "Qingyu'Blog"  // 版权署名（云端由「页脚版权署名」覆盖）
  },

  // ====== 广告位（默认关闭）======
  ads: {
    enabled: false,          // 总开关
    client: '',              // AdSense 发布商 ID（ca-pub-xxxx），启用时自动加载 adsbygoogle.js
    belowSearch: '',         // 首页列表上方
    between: '',             // 列表间隔插入
    betweenEvery: 3,         // 每 N 篇插入
    content: ''              // 文章详情底部
  }
};
```

**导航项的优先级**：云端「博客设置 → 导航菜单」（存 D1 `site_settings.nav_menu`）> `app.js` 里的 `NAV` 兜底数组。底部导航与友情链接同理（D1 优先，`config.js` 兜底）。

### mode 说明

| 值 | 行为 |
| --- | --- |
| `'auto'` | **推荐**。自动检测：请求 `/api/posts` 成功 → 云端；失败 → 静态 |
| `'static'` | 强制静态模式，只用 `posts.js` |
| `'api'` | 强制云端模式，需要后端 API |

### 多语言（i18n）

`i18n.js` 内置 5 种语言（中文 / English / 日本語 / 한국어 / हिन्दी），每种 **494 个语言键**。默认按 `localStorage('blog.locale')` → `navigator.language` 的顺序识别，并提供手动切换。语言包放在 `public/locales/<lang>.json`，中文同时内嵌兜底（确保 `file://` 本地预览时核心文字始终可读）。

---

## 🛡️ 安全设计

| 层 | 机制 |
| --- | --- |
| 密码存储 | PBKDF2-SHA256 加盐哈希（100,000 次迭代，16 字节随机盐），永不存明文 |
| 首次部署 | 配置了 `BLOG_ADMIN_SETUP_KEY`：必须用 `X-Setup-Key` 显式初始化，未初始化时登录一律 403（防抢注）；未配置：首次登录自动生成随机默认密码（`xxxx-xxxx`，标记 `must_change=1`），存在先到先得竞态。**云端密码最少 8 位** |
| 静态模式 | 密码以 `sha256:` 前缀哈希存储（兼容旧明文，登录后自动升级），最少 4 位（仅防君子） |
| 会话管理 | 32 字节随机 Token（64 位十六进制），7 天有效，存 D1 `admin_sessions`；登出即销毁；修改密码会清空所有会话 |
| 登录限流 | **三层维度，且不做全局长锁定**：单 IP 5 次失败 → 15 分钟；同一子网（IPv4 /24、IPv6 /64）15 次失败 → 60 秒冷却；全站 30 次失败 → **仅 10 秒冷却 + 告警日志**。计数 1 小时老化；锁定期/冷却期内请求直接早退，**不查库也不写库**（顺带挡住「用失败登录刷爆 D1 免费写额度」） |
| 应急通道 | 登录请求携带正确的 `X-Setup-Key`（`BLOG_ADMIN_SETUP_KEY`）可**跳过全部限流**（**不跳过密码校验**）；后台登录页触发限流时会自动展开该入口。保证「攻击者最多让你 10 秒登不进，但永远挡不死你」 |
| 边缘限流（可选） | 配 `BLOG_RATE_LIMIT_BINDING` 后启用 Workers Rate Limiting binding（`env.LOGIN_LIMITER`），在 Worker 入口按 IP 限流，被拦下的请求不查库不写库；也可用 Cloudflare Access 或 WAF 限流规则把 `/api/admin/login` 挡在边缘，见下方「加固后台登录入口」 |
| 接口鉴权 | 所有写操作校验 `Authorization: Bearer <token>`；常量时间比较（SHA-256 摘要后异或） |
| 评论安全 | 输入先做控制字符清洗与 HTML 转义、SQL 全参数化、每 IP 频率限制、Origin 校验、**重复内容拦截**（409）、单篇最多 300 条、最多 3 层嵌套 |
| 媒体 URL | 仅接受 `http(s)`（R2 公开地址或外链），拒绝 `javascript:` / `data:` 等，杜绝脚本类内容登记 |
| 接口边界 | 未知 `/api/*` 返回 JSON 404，绝不回退到 `index.html`；非 GET/HEAD 不做 SPA 回退 |
| 安全响应头 | Worker 侧对 API 与静态响应统一注入：`CSP`、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、`X-Frame-Options`、`Cross-Origin-Opener-Policy`；Pages 纯静态路径由 `public/_headers` 提供同一套 |
| CORS | 配置 `SITE_URL` 后**只允许本站来源** + 请求自身来源；**未配置时 fail-closed（不返回 ACAO）**，而不是回显任意来源 |
| 错误信息 | 未捕获异常统一返回「服务端内部错误」，内部细节只进服务端日志 |
| 客户端 IP | 只信任 `CF-Connecting-IP`，不使用可被伪造的 `X-Forwarded-For` |

### 加固后台登录入口（建议做）

内置限流默认就能挡住爆破，若想从**源头**再消掉风险，可以在 Cloudflare 边缘加一道门。三种方案任选，都对访客无感：

| 方案 | 怎么做 | 效果 |
| --- | --- | --- |
| **Cloudflare Access**（最推荐） | Zero Trust → Access → Applications → Add → Self-hosted；给你的域名建两条：Path 分别为 `admin` 与 `api/admin`；策略 = Allow → Emails → 你的邮箱；登录方式选 **One-time PIN** | 没通过身份验证的请求**根本到不了** Worker 的登录接口 |
| **WAF 限流规则** | 域名 → Security → Security rules → Rate limiting rules → Create rule；匹配 `URI Path equals /api/admin/login`，10 秒内超过 10 次 → Block 10 秒 | 拦在边缘，不消耗 Worker 请求额度，也不碰 D1/KV 配额 |
| **Workers 限流绑定** | 加 GitHub Secret `BLOG_RATE_LIMIT_BINDING`（正整数，如 `1001`）后重新部署 | Worker 入口按 IP 限流 10 次/分钟/位置，被拦下的请求不查库不写库 |

逐步操作（含控制台路径、注意事项与排查）见 **[Cloudflare 配置完全指南 · 第 9 节](CLOUDFLARE_SETUP_GUIDE.md)**。

---

## 🧪 测试

```bash
node smoke-test.js      # 冒烟测试 78 例（Markdown / TOC / 高亮 / 导入导出 / 门禁 / 评论安全 / 统计 / 搜索 / RSS / Sitemap / 云端 API / 缓存 …）
node gb-verify.js       # 留言板专项验证 18 例
node search-verify.js   # 搜索专项验证 13 例
```

三套测试都只用 Node 内置模块（无网络、无凭据依赖），在每次 CI 部署前自动运行，失败即中止不部署。

导入示例文章到已部署的云端实例：

```bash
node seed.js https://www.example.com [--token <会话或写入令牌>]
```

重新生成 `public/` 下的压缩资源：

```bash
node scripts/minify.mjs     # 需要 npx terser / clean-css-cli
```

---

## ⚠️ 已知限制

| 限制 | 说明 |
| --- | --- |
| 音乐接口只在 Workers 可用 | `/api/music*` 只在 `worker.js` 里实现，`functions/` 下没有对应函数文件。**Pages 部署下音乐功能不可用**（接口返回 JSON 404） |
| 编辑器不支持分类 / 加密 | D1 表与接口保留了 `category` / `protected` / `enc` 字段（可导入外部加密文章），但后台编辑器目前只提供标题 / 标签 / 封面 / 置顶 / 正文 |
| 编辑文章会刷新日期 | 保存时日期统一写成"今天"，因此编辑旧文会改变它在列表与 RSS 中的排序位置 |
| 标签改名是逐篇更新 | 重命名 / 删除标签会对每篇相关文章依次发起一次 PUT（N+1 次请求），文章很多时会稍慢 |
| 改密弹窗与后端校验不一致 | 前端提示「至少 6 位」，后端实际要求 **8 位**；请直接按 8 位以上填写 |
| 被限流时要等一小会儿 | 触发登录限流后，即使密码正确也要等 10 秒（全局冷却）/ 60 秒（同一子网）/ 15 分钟（你自己的 IP）才能登录，除非带上安装密钥走应急通道。这是有意取舍：锁定期间照常跑 PBKDF2 会把「登录 DoS」变成「CPU / 额度 DoS」 |
| `must_change` 未强制拦截 | 后端会返回该标记，但前端只做提示，不会强制跳转改密 |
| `public/fonts/dreamserif/` 是历史遗留 | 当前版本**不加载任何 webfont**，这个目录（约 10.3MB、265 个分片）已无引用，仅因 `.gitignore` 白名单保留在仓库中；删掉不影响任何功能 |
| 后台没有分页 / 搜索的模块 | 评论列表与媒体库一次性返回全部数据，评论多了会变慢 |
| 未知路径返回 200 | 前端的 404 页面 HTTP 状态码仍是 200（SPA 的常见取舍） |

---

## 📚 文档索引

所有文档均提供中英双语：长文档采用 `X.md` + `X_EN.md` 成对文件，短文档（贡献指南、Issue / PR 模板）在单个文件内中英对照（`LICENSE` 除外——MIT 许可证原文为英文，属法律文本，不做翻译）。

| 中文 | English | 内容 |
| --- | --- | --- |
| [README.md](README.md) | [README_EN.md](README_EN.md) | 项目总览：快速开始、功能、目录结构、Cloudflare 服务、配置、安全、测试 |
| [CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md) | [CLOUDFLARE_SETUP_GUIDE_EN.md](CLOUDFLARE_SETUP_GUIDE_EN.md) | **Cloudflare 配置完全指南（新手版）**：账号 / D1 / KV / API Token / R2 / Workers AI / 自定义域名 / Secrets / 部署 / 自检 / 排查 / 免费额度 |
| [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md) | [DEPLOYMENT_SECRETS_GUIDE_EN.md](DEPLOYMENT_SECRETS_GUIDE_EN.md) | 只聚焦 GitHub Secrets 与 R2 令牌：每个 Secret 从哪来、怎么填、两个桶用一个还是两个 Token |
| [SECURITY.md](SECURITY.md) | [SECURITY_EN.md](SECURITY_EN.md) | 安全问题反馈方式与内置安全措施 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 同一文件（文内中英对照） | 参与贡献的流程 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | [CODE_OF_CONDUCT_EN.md](CODE_OF_CONDUCT_EN.md) | 社区行为准则 |
| [ABOUT.md](ABOUT.md) | [ABOUT_EN.md](ABOUT_EN.md) | 关于项目与作者 |

---

## 📄 许可证

[MIT](LICENSE)

---

<p align="center">
  如果 Qingyu'Blog 对你有帮助，欢迎 ⭐ Star / Fork，或到 <a href="https://github.com/kejiland/qingyu-blog/issues">Issues</a> 提建议。
</p>

<p align="center">
  <b>如果你觉得不错，请给个 ⭐ Star 支持一下！这会帮助更多人发现这个项目。</b>
</p>

<!-- Topics: blog, personal-blog, vanilla-js, no-framework, no-dependency, static-site, cloudflare-workers, cloudflare-d1, cloudflare-r2, cloudflare-kv, markdown-blog, javascript, zero-build, lightweight, responsive-design, dark-theme, i18n, open-source, self-hosted, serif-font, workers-ai -->
