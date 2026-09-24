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

Qingyu'Blog（轻语博客）是一个**纯原生 JavaScript** 编写的个人博客系统，不依赖任何前端框架（React / Vue / Svelte）和构建工具（Webpack / Vite）。

它支持两种运行模式：

| 模式 | 说明 | 适用场景 |
| --- | --- | --- |
| **静态模式** | 双击 `public/index.html` 即可使用，数据存浏览器 localStorage | 本地写作、临时预览 |
| **云端模式** | 部署到 Cloudflare Workers + D1，数据存云端数据库 | 正式发布、多人访问 |

整个博客本体就在 `public/` 目录：前台 `index.html` + `style.css` + `app.js` + `posts.js` + `music-player.js`，后台 `admin.js` + `admin.css`，国际化 `i18n.js` + `locales/`。无需任何第三方运行时依赖。

> 💡 仓库根目录的 `index.html` 只是一个跳转页，会自动打开 `public/index.html`（Cloudflare Pages / Workers 的部署目录）。本地双击 `public/index.html` 同样可用。

---

## ✅ 优点

| 优点 | 说明 |
| --- | --- |
| **零门槛** | 不需要 Node.js、不需要 npm、不需要构建，双击即可运行 |
| **零成本** | Cloudflare Workers + D1 免费额度完全够个人博客使用 |
| **零依赖** | 不引入任何第三方库，代码量可控，加载极快 |
| **零锁定** | 文章是 Markdown 文件，随时可以迁移到任何平台 |
| **双通道** | 静态导出 + 云端 API，同一份代码两种部署方式 |
| **响应式** | 前台 + 后台均支持手机 / 平板 / 桌面全适配 |
| **多语言** | 内置中文 / English / 日本語 / 한국어 / हिन्दी 五语界面，自动识别浏览器语言 |
| **衬线美学** | 书卷风宋体排版（正文 / 标题 / 引用装饰统一走系统宋体与仿宋），零 webfont，阅读舒适且加载最快 |
| **安全** | 密码 PBKDF2-SHA256 加盐哈希（10 万次迭代），会话令牌鉴权，登录失败限流锁定，安全响应头（CSP / nosniff / frame 防护） |
| **AI 增强** | Workers AI 提供文章摘要 / 写作助手 / 评论汇总，未配置或关闭时自动降级、对博客零影响 |

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

#### 1. 准备工作

- 注册 [Cloudflare](https://dash.cloudflare.com/sign-up) 账号
- 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)：`npm install -g wrangler`

#### 2. 创建 Cloudflare 资源

```bash
# 登录 Cloudflare
npx wrangler login

# 创建 D1 数据库（主存储：文章 / 评论 / 统计 / 密码）
npx wrangler d1 create blog
# 记下输出的 database_id（是 UUID，不是数据库名，也不是 KV 的 id）

# 创建 KV 命名空间（备用绑定）
npx wrangler kv namespace create BLOG
# 记下输出的 id（32 位十六进制）
```

#### 3. 配置 GitHub Secrets

在仓库 Settings → Secrets and variables → Actions 中添加：

> 第一次部署时不确定每个 Secret 在哪里获取、两个 R2 桶应该共用还是拆分 Token，请先阅读 [GitHub Actions Secrets 与 R2 配置指南](DEPLOYMENT_SECRETS_GUIDE.md)。

**必填（部署必需）：**

| Secret | 说明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需要 Workers + D1 + KV 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID（在 Dashboard 右侧可见） |
| `BLOG_D1_ID` | D1 数据库 ID（上一步创建获得，UUID 格式） |
| `BLOG_KV_ID` | KV 命名空间 ID（上一步创建获得，32 位十六进制） |

**推荐 / 可选：**

| Secret | 必填 | 说明 |
| --- | --- | --- |
| `BLOG_ADMIN_SETUP_KEY` | 可选 | 安装密钥：配置后 `/api/admin/setup` 首次初始化与重置需 `X-Setup-Key`（防抢注，推荐）；未配置时回退旧行为——首次部署登录接口自动生成随机默认密码（存在先到先得竞态）。已初始化实例登录不受影响 |
| `SITE_URL` | 推荐 | 站点对外域名，如 `https://blog.example.com`（用于收紧 CORS / RSS / Sitemap） |
| `CF_ZONE_ID` | 可选 | 自定义域名的 Zone ID（配置后发布即清边缘缓存） |

**R2（音乐 + 媒体图片直传，配置后启用，未配置自动降级 503）：**

| Secret | 说明 |
| --- | --- |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` | R2 S3 兼容凭据（音乐与媒体**共用**） |
| `R2_BUCKET` / `R2_PUBLIC_BASE` | **音乐专用桶**：桶名 + R2 自定义域名（播放器拉流地址） |
| `R2_MEDIA_BUCKET` / `R2_MEDIA_PUBLIC_BASE` | **媒体专用桶**：桶名 + 自定义域名；音乐使用音乐桶，图片使用媒体桶。仅音乐桶未配置时，音乐上传才回退媒体桶 |

#### 4. 部署

推送到 `main` 分支，GitHub Actions 会自动：

1. ✅ 安装依赖与 Wrangler CLI
2. ✅ 运行测试（`smoke-test.js` / `gb-verify.js` / `search-verify.js`，失败即中止不部署）
3. ✅ 校验必要 Secrets
4. ✅ 执行 D1 迁移（`schema_migrations` 记账表 + 列预检三层幂等，老库 duplicate-column 自动兜底防重）
5. ✅ 部署 Worker 到 Cloudflare
6. ✅ 写入运行时 Secret（安装密钥 / R2 凭据 / 清缓存凭证，配置了才写）

部署完成后访问 `https://www.example.com/admin`：

- 首次部署（配置了 `BLOG_ADMIN_SETUP_KEY`）：点击「首次部署？使用安装密钥初始化」，输入新管理密码 + 安装密钥提交；
- 首次部署（未配置安装密钥）：直接用任意密码登录一次，后端会自动生成随机默认密码（`xxxx-xxxx`）并在页面上提示，用它登录后系统强制修改密码；
- 之后正常登录即可。

#### 5. 从 KV 迁移到 D1（旧数据）

若你此前使用 KV 单 key 存储，可手动运行迁移工作流把线上数据搬到 D1：

```bash
# 本地执行（需 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / BLOG_KV_ID / BLOG_D1_ID）
node scripts/migrate-kv-to-d1.mjs --dry-run   # 仅预览 SQL
node scripts/migrate-kv-to-d1.mjs             # 正式写入 D1
```

或在仓库 Actions 标签页手动触发 `Migrate KV to D1` 工作流（仓库 Secrets 自动注入，支持 `dry-run` / `migrate` 两种模式）。

---

## ✨ 特色功能

### 前台

| 功能 | 说明 |
| --- | --- |
| 真实路径路由 | 无 hash：`/`、`/archive`、`/about`、`/tags`、`/guestbook`、`/posts/<别名>/`、`/admin`、`/write`，刷新不 404 |
| Markdown 写作台 | 实时预览、工具栏一键插入、字数统计、草稿自动保存 |
| 文章加密 | 服务端预留 `enc` / `protected` 字段（兼容导入的加密文章），编辑器 UI 暂未开启该功能 |
| 评论系统 | 云端 D1 全局评论 + 审核模式；静态模式 localStorage；支持**嵌套回复**；**删除文章级联清理**评论 / 点赞 / 浏览量；**重复发送拦截**（同分区同昵称同内容返回 409） |
| 留言板 | 导航直达 `/guestbook`，「留言 / 优化方案」双分区，云端存储，复用评论安全管道（限流 / Origin 校验 / 控制字符清洗 / 重复拦截） |
| 站内搜索 | 实时匹配标题 / 标签 / 摘要；结果展示**关键字所在完整句子上下文**并**高亮关键字**，悬停无下划线 |
| 正文目录 TOC | 自动生成、锚点跳转；代码高亮 |
| 阅读统计 | 浏览数 / 点赞（云端全局 / 静态本机，点赞 IP 去重 + 频控） |
| 精选文章 | 评论区下方自动推荐（点赞×3 + 浏览 + 评论×5） |
| RSS / Sitemap | `/feed.xml`、`/sitemap.xml` 云端动态生成，随文章增删改查自动更新；加密文章自动排除 |
| 上一篇 / 下一篇 | 只有一条时自动隐藏空位 |
| 卡片式列表 | 封面缩略图、置顶徽章、标签贴底 |
| **深色 / 浅色主题** | 一键切换，多断点响应式适配 |
| **主题色切换** | 6 种强调色可选，桌面为图标按钮 + 弹层、手机端为原生下拉，深 / 浅色主题通用 |
| **多语言界面** | 中文 / English / 日本語 / 한국어 / हिन्दी，自动识别 + 手动切换（桌面 🌐 图标弹层、手机原生下拉） |
| **AI 文章摘要** | 文章页一键生成内容摘要，单篇 30 天缓存；AI 不可用时自动隐藏入口 |
| **全站音乐播放器** | 右下角悬浮音符按钮，平时**缩进窗口外露出一点圆弧**、悬停 / 点击即滑出；点击弹出面板：曲目信息 · 可拖动进度条 · 上一首 / 播放暂停 / 下一首 · 音量 · 播放列表（点击切换、当前高亮 + 均衡动画）。自动连播；**记忆上次曲目与进度**、音量持久化，刷新后恢复但不自动出声；无音乐时完全隐藏，后台路由自动收起 |
| 四级衬线字体 | 正文 / 标题系统宋体 · 引用装饰系统仿宋（零 webfont 下载，性能优先） |

### 管理后台

| 功能 | 说明 |
| --- | --- |
| 仪表盘 | 6 项统计卡片 + 30 天访问 / 评论趋势图 |
| 文章管理 | 搜索 / 状态筛选 / 分页 / 置顶切换；**删除无感刷新**（行级淡出移除 + **级联清理**评论/统计，列表与前台即时生效） |
| 编辑器 | Markdown 实时预览（输入框自动增高）、标签 / 封面 / 置顶 |
| **AI 写作助手** | 编辑器一键生成：标题建议 / 润色 / 翻译（目标语言可选），结果可应用 / 复制；AI 不可用自动隐藏 |
| 评论管理 | 全局评论列表，审核 / 删除，回复链追踪；**删除 / 审核无感刷新**（行级淡出 + 就地更新状态徽章，不整表重载） |
| **AI 评论汇总** | 评论页一键汇总近期评论要点（1 小时缓存）+ 单条评论垃圾检测 |
| 标签管理 | 标签重命名 / 删除（批量更新所有相关文章） |
| 媒体资源库 | 图片上传（浏览器**直传 R2** 预签名 URL + 进度，元数据存 D1）；删除与 R2 对象同步；历史 base64 记录已由迁移 0014 清除 |
| **音乐管理** | 音频上传（浏览器直传 R2 签名 URL，显示上传进度）；**文件名自动识别「歌曲名-歌手」** 预填；列表行内试听 / 删除（**删除与 R2 对象同步**）；曲目多时列表卡片内滚动、表头吸顶 |
| 博客设置 | 站点信息（含站点头像，同时也是左上角品牌 Logo 与 favicon）/ 个人资料（头像显示在左下角）/ 导航菜单 |
| 一键导出 | 同时导出 posts.js / feed.xml / sitemap.xml，覆盖即发布 |
| 顶栏 | 右上角 🌐 语言弹层（同前台风格，SVG 国旗）+ 账户菜单（个人资料 / 改密 / 退出） |
| 品牌区 | 左上角 Logo 渐变方块（流动动画）+ 站名；侧栏可折叠，折叠后页脚仅剩头像居中 |
| 响应式 | PC 固定侧栏 / 移动端抽屉导航 |

---

## 📁 目录结构

```
├── public/                          # 站点本体（静态资源，部署目录）
│   ├── index.html                   # 页面入口（双击 / 部署起点）
│   ├── config.js                    # 全站配置（页脚 / 广告 / 模式 / 语言）
│   ├── style.css                    # 前台样式（深色模式 + 响应式 + 四级衬线字体）
│   ├── app.js                       # 前台逻辑（路由 / 评论 / 留言板 / 加密 / 搜索 / 多语言 / 主题色 / AI 摘要）
│   ├── admin.js                     # 后台管理 SPA（仪表盘 / 文章 / 评论 / 标签 / 音乐 / 设置 / AI 写作助手 / 评论汇总）
│   ├── admin.css                    # 后台样式（玻璃拟态 v4，响应式）
│   ├── music-player.js              # 前台全站音乐播放器（右下角悬浮按钮 + 弹出面板 / 播放列表 / 进度记忆）
│   ├── i18n.js                      # 国际化模块（中/英/日/韩/印地，内置中文兜底）
│   ├── posts.js                     # 静态模式文章数据（由「导出 posts.js」生成）
│   ├── locales/                     # 语言包（zh-CN / en / ja / ko / hi）
│   ├── flags/                       # 语言切换用的 SVG 国旗图标
│   ├── fonts/                       # 衬线字体（local 分片 + CDN 分片）
│   # feed.xml / sitemap.xml 由云端动态生成（见 functions/）
│   ├── robots.txt                   # 爬虫规则（禁止抓取后台，声明 Sitemap）
│   ├── ads.txt                      # 广告声明（可选，配合 config.js ads）
│   └── _redirects                   # Cloudflare Pages 路由（SPA 回退 + /public 重定向）
├── functions/                       # Cloudflare API（Pages Functions / Workers 共用）
│   ├── api/
│   │   ├── posts.js                 # 文章列表 / 创建
│   │   ├── posts/[id].js            # 单篇文章（GET / PUT / DELETE，删除级联清理）
│   │   ├── posts/[id]/comments.js   # 文章评论（GET / POST，支持嵌套回复）
│   │   ├── posts/[id]/comments/[cid].js  # 单条评论删除（管理）
│   │   ├── posts/[id]/stats.js      # 阅读 / 点赞统计
│   │   ├── comments.js              # 全局评论列表（管理后台）
│   │   ├── comments/[id].js         # 评论审核 / 删除
│   │   ├── ai/
│   │   │   ├── ping.js              # AI 可用性探测（降级开关）
│   │   │   ├── summary.js           # 文章摘要（单篇缓存 30 天 + 限流）
│   │   │   ├── assist.js            # 写作助手（标题建议 / 润色 / 翻译）
│   │   │   └── comments.js          # 评论汇总 / 单条垃圾检测
│   │   ├── media.js                 # 媒体列表 / 登记元数据（仅 http/https）
│   │   ├── media/upload-url.js      # 签发 R2 预签名上传 URL（图片直传）
│   │   ├── media/[id].js            # 媒体删除（先删 R2 对象再删 D1 行）
│   │   ├── settings.js              # 站点设置
│   │   ├── stats/trend.js           # 30 天趋势数据
│   │   ├── site-files/              # 站点产物（feed.xml / sitemap.xml / posts.js）
│   │   │   ├── index.js             # 列出 / 保存产物
│   │   │   └── [name].js            # 下载产物内容
│   │   ├── admin/
│   │   │   ├── setup.js             # 首次设置密码
│   │   │   ├── login.js             # 密码登录
│   │   │   ├── logout.js            # 登出
│   │   │   └── password.js          # 修改密码
│   │   ├── feed.xml.js              # /api/feed.xml 动态 RSS（兼容旧入口）
│   │   └── sitemap.xml.js           # /api/sitemap.xml 动态 Sitemap（兼容旧入口）
│   ├── feed.xml.js                  # 根路径 /feed.xml 动态 RSS（云端最新文章）
│   ├── sitemap.xml.js               # 根路径 /sitemap.xml 动态 Sitemap（云端最新文章）
│   └── _lib/
│       ├── api-core.js              # API 核心逻辑（D1 + 鉴权 + 安全）
│       ├── ai.js                    # Workers AI 封装（模型 / 提示词 / 限流 / 降级）
│       ├── media.js                 # 媒体 R2 直传（签名 / 删除 / 元数据）
│       └── music.js                 # 音乐 API（R2 预签名直传 / 元数据 CRUD / R2 对象同步删除）
├── worker.js                        # Cloudflare Workers 入口（路由分发，含 /api/ai/* 接线）
├── migrations/                      # D1 数据库迁移（CI 自动执行，记账表幂等）
│   ├── 0001_init.sql                # 基础表结构
│   ├── 0002_site_files.sql          # 站点文件存储
│   ├── 0003_cover_column.sql        # 封面图字段（老库补列）
│   ├── 0004_post_meta.sql           # 分类 / 发布状态（老库补列）
│   ├── 0005_comment_status.sql      # 评论审核状态（老库补列）
│   ├── 0006_media.sql               # 媒体资源表
│   ├── 0007_settings.sql            # 站点设置表
│   ├── 0008_stats_daily.sql         # 每日统计表
│   ├── 0009_comment_status_index.sql # 评论状态索引
│   ├── 0010_admin_must_change.sql   # 强制改密标记（老库补列）
│   ├── 0011_comment_reply.sql       # 评论回复 parent_id 字段（老库补列）
│   ├── 0012_clear_orphaned_nav.sql  # 清理遗留 nav 配置（数据清理）
│   ├── 0013_music.sql               # 音乐播放列表表（元数据；音频本体存 R2）
│   └── 0014_purge_base64_media.sql  # 清理历史 base64 媒体记录（数据清理）
├── scripts/
│   └── migrate-kv-to-d1.mjs         # 一次性迁移：KV 数据 → D1
├── .github/workflows/
│   ├── deploy.yml                   # GitHub Actions 自动部署到 Workers
│   └── migrate-kv-to-d1.yml         # 手动触发 KV → D1 迁移
├── seed.js                          # 导入示例文章到云端 API
├── index.html                       # 根跳转页（自动跳 public/index.html）
├── wrangler.toml                    # Cloudflare Pages 配置
├── wrangler.workers.toml            # Cloudflare Workers 配置
├── smoke-test.js                    # 冒烟测试（API + 前端逻辑，76 例）
├── gb-verify.js                     # 留言板专项验证（18 例）
├── search-verify.js                 # 搜索专项验证（13 例）
├── README.md                        # 中文说明
└── README_EN.md                     # 英文说明
```

---

## ☁️ Cloudflare 服务说明

### Workers

Workers 是 Cloudflare 的边缘计算平台，本项目用它运行后端 API：

- **入口文件**：`worker.js`（路由分发）+ `functions/`（Pages Functions）
- **静态资源**：`public/` 目录通过 Workers 的 `[assets]` 绑定自动提供
- **兼容性日期**：`2025-02-01`

**wrangler.workers.toml 关键配置**：

```toml
name = "kejiland"
main = "worker.js"

[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"  # SPA 回退
html_handling = "auto-trailing-slash"

[[kv_namespaces]]
binding = "BLOG"
id = "{env.BLOG_KV_ID}"

[[d1_databases]]
binding = "DB"
database_name = "blog"
database_id = "{env.BLOG_D1_ID}"

[ai]                          # Workers AI（binding 名必须为 AI，用于写作助手 / 摘要 / 评论汇总）
binding = "AI"
```

### KV（Key-Value 存储）

KV 用于备用绑定（已基本被 D1 取代），当前用途：

| 用途 | 说明 |
| --- | --- |
| 点赞去重 | `liked:{ip}:{postId}` → 防刷赞 |
| 站点文件缓存 | feed.xml / sitemap.xml / posts.js 缓存 |
| 缓存清除标记 | `purge:{tag}` → 版本控制 |

> ⚠️ KV 是**最终一致性**（全球传播有延迟），不适合需要强一致性的场景。D1 是 SQLite，提供强一致性。

### D1（SQLite 数据库）

D1 是 Cloudflare 的边缘 SQLite 数据库，本项目的**主存储**：

| 表 | 说明 | 关键字段 |
| --- | --- | --- |
| `posts` | 文章 | id, title, content, cover, pinned, protected, enc, tags, category, status |
| `comments` | 评论 | id, post_id, author, content, date, status (approved/pending), **parent_id**（回复） |
| `stats` | 阅读/点赞 | post_id, views, likes |
| `admin_auth` | 管理员密码 | k, salt, hash, iter, must_change |
| `admin_sessions` | 登录会话 | token, exp |
| `admin_fails` | 登录限流 | ip, n, until |
| `media` | 媒体资源 | id, name, url, type, size（url 为 R2 公开地址或外链） |
| `site_settings` | 站点设置 | k, v（键值对） |
| `site_files` | 站点产物 | name, content, updated_at（feed/sitemap/posts.js） |
| `stats_daily` | 每日统计 | post_id, date, views, likes |
| `music` | 音乐播放列表 | id, title, artist, url（R2 公开地址）, cover, size, duration, sort |

### R2（对象存储：音乐 + 媒体图片）

R2 用于存放**音乐音频**与**媒体图片本体**（元数据在 D1，`url` 指向 R2 公开地址）。音乐优先写入音乐桶，图片写入媒体桶；仅当音乐桶配置不完整时，音乐才回退媒体桶。播放与同步删除会按公开域名自动选择对应桶：

| 能力 | 说明 |
| --- | --- |
| 浏览器直传 | 后端签发 SigV4 预签名 PUT URL（含 `UNSIGNED-PAYLOAD` / `x-amz-date`），文件**不经过 Worker** 直传 R2，上传进度前端可见 |
| 公开读取 | 绑定 R2 自定义域名（如 `music.2024921.xyz` / `media.2024921.xyz` → `public.r2.dev`），前台直接拉流 / 显示图片 |
| 同步删除 | 删除时 Worker 侧签名发起 R2 DELETE（`host;x-amz-content-sha256;x-amz-date` 签名头），再删 D1 行，两者一致 |
| 音乐白名单 | mp3 / m4a / ogg / wav / aac / opus / flac，单文件 ≤ 30MB |
| 图片白名单 | png / jpg / jpeg / webp / gif / svg / avif / bmp / ico，单文件 ≤ 10MB |
| 降级 | 未配置 R2 凭据时，上传接口自动返回 503，读取/其余功能不受影响 |

> **💡 缩略图/封面/音频首次加载偏慢？建议在 Cloudflare 控制台给媒体、音乐子域配缓存规则。**
> 浏览器直传的 R2 对象默认不带长缓存头，首次加载需回源；代码侧无法安全地给
> 已直传对象补写缓存头（CORS 只放行 `content-type`，且 CopyObject 改元数据会连带清掉
> Content-Type）。**零风险且对新旧对象都生效**的做法：
> 1. Cloudflare 控制台 → 你的域名 → **缓存 → Cache Rules** 新建规则；
> 2. Hostname 匹配 `media.你的域` 与 `music.你的域`（或 R2 自定义域名）；
> 3. 缓存级别 **Cache Everything** + Edge TTL 1 个月 + **Browser TTL 1 个月**；
> 4. 保存后首次访问仍回源一次，之后浏览器/边缘直接命中缓存，缩略图秒开。
> 前端侧已配合优化：首屏前 2 张缩略图 `fetchpriority="high"`、全部 `decoding="async"`、
> 加载完成淡入（`onload` → `.thumb-in`），见 `renderPostThumb`。

### Workers AI（推理）

使用 Cloudflare Workers AI（默认模型 `@cf/meta/llama-3.2-3b-instruct`）提供写作辅助，按 Neurons 计费，**每天 10,000 Neurons 免费额度**（约数千次摘要级调用，超出约 $0.011/千 Neurons）：

| 接口 | 用途 |
| --- | --- |
| `GET /api/ai/ping` | 可用性探测（前端据此显示 / 隐藏全部 AI 入口） |
| `POST /api/ai/summary` | 文章摘要（单篇缓存 30 天；IP 8 次/时、全站 300 次/天上限） |
| `POST /api/ai/assist` | 写作助手：标题建议 / 润色 / 翻译（需登录，IP 200 次/天） |
| `POST /api/ai/comments` | 评论汇总（缓存 1 小时）与单条垃圾检测（需登录） |

- 配置：`wrangler.workers.toml` 中的 `[ai] binding = "AI"`（部署时自动创建绑定）；环境变量 `BLOG_AI_ENABLED` 设为 `0` / `false` / `off` 可整体关闭
- **优雅降级**：未绑定 AI、未配置 D1 或开关关闭时，相关接口返回 404，前端（`aiProbe`）自动隐藏所有 AI 入口，博客其余功能完全不受影响
- 前端记忆策略：探测到「可用」缓存 10 分钟、「不可用」仅缓存 30 秒，AI 上线/修复后刷新页面即恢复
- **隐私提示**：AI 摘要 / 写作助手 / 评论汇总会把相应**明文内容**发送给 Cloudflare Workers AI（`@cf/meta/llama-3.2-3b-instruct`），供模型推理。涉及敏感内容时请勿开启相关入口（或设 `BLOG_AI_ENABLED=0` 整体关闭）

---

## ⚙️ 配置文件说明

### config.js

```javascript
window.BLOG_CONFIG = {
  // ====== 基础配置 ======
  mode: 'auto',           // 'auto' | 'static' | 'api'
  apiBase: '',            // API 基础地址，留空 = 同源
  siteUrl: 'https://www.example.com', // 站点对外地址（RSS/Sitemap 用）
  writeToken: '',         // 旧版静态令牌（建议用登录替代）
  pageSize: 5,            // 首页每页文章数（0 = 不分页）
  adminPwd: '',           // 静态模式本地密码（云端模式请留空）

  // 导航项统一在 public/app.js 的 NAV 数组中定义（单一数据源，无需在此配置）

  // ====== 页脚配置 ======
  footer: {
    text: '',
    icp: '',               // 备案号
    contact: [],           // 联系方式
    links: [],             // 友情链接
    decl: '',              // 站点声明
    email: '',             // 联系邮箱
    startYear: 2019,       // 版权起始年
    copyrightName: "Qingyu'Blog"
  },

  // ====== 广告位 ======
  ads: {
    enabled: false,          // 总开关（启用后需填真实广告代码）
    client: '',              // AdSense 发布商 ID（ca-pub-xxxx），启用时自动加载 adsbygoogle.js
    belowSearch: '',         // 首页列表上方
    between: '',             // 列表间隔插入
    betweenEvery: 3,         // 每 N 篇插入
    content: ''              // 文章详情底部
  }
};
```

### mode 说明

| 值 | 行为 |
| --- | --- |
| `'auto'` | **推荐**。自动检测：请求 `/api/posts` 成功 → 云端；失败 → 静态 |
| `'static'` | 强制静态模式，只用 posts.js |
| `'api'` | 强制云端模式，需要后端 API |

### 多语言（i18n）

`i18n.js` 内置 5 种语言（中文 / English / 日本語 / 한국어 / हिन्दी），默认按浏览器 `navigator.language` 自动识别，并提供手动切换。语言包放在 `public/locales/<lang>.json`（中文同时内嵌兜底，确保 `file://` 本地预览时核心文字始终可读）。

---

## 🛡️ 安全设计

| 层 | 机制 |
| --- | --- |
| 密码存储 | PBKDF2-SHA256 加盐哈希（100,000 次迭代），永不存明文 |
| 首次部署 | 配置了 `BLOG_ADMIN_SETUP_KEY`：须用它显式初始化（`/api/admin/setup` + X-Setup-Key），未初始化登录一律 403（防抢注）；未配置：登录接口自动生成随机默认密码（`xxxx-xxxx`，`mustChange=true`，登录后强制改密，存在先到先得竞态）。密码最少 8 位 |
| 静态模式 | 密码 SHA-256 哈希存储（兼容旧明文，登录后自动升级） |
| 会话管理 | 随机 Token（32 字节 hex），7 天有效，登出即销毁 |
| 限流 | 同一 IP 连续失败 5 次锁定 15 分钟 |
| 文章加密 | 接口预留 `enc` / `protected` 字段（可导入外部加密文章），编辑器暂未开启端到端加密 UI |
| 评论安全 | XSS 转义 + SQL 注入参数化 + 每 IP 频率限制 + Origin 校验 + **重复发送拦截**（同分区同昵称同内容 409） |
| 媒体 URL | 仅接受 `http(s)`（R2 公开地址或外链），拒绝 `javascript:` / `data:` 等，杜绝脚本类内容登记 |
| 接口边界 | 未知 /api/* 返回 JSON 404，绝不回退到 index.html |
| CORS | 配置 `SITE_URL` 后仅允许本站来源，未配置回退为回显来源 |

---

## 🧪 测试

```bash
node smoke-test.js      # 冒烟测试 76 例（Markdown / TOC / 高亮 / 导入导出 / 管理门禁 / 评论安全 / 统计 / 搜索 / RSS / Sitemap / 云端 API / 缓存）
node gb-verify.js       # 留言板专项验证 18 例
node search-verify.js   # 搜索专项验证 13 例
```

三套测试在每次 CI 部署前自动运行，失败即中止不部署。

导入示例文章到已部署的云端实例：

```bash
node seed.js https://www.example.com [--token <会话或写入令牌>]
```

---

## 🖼️ 项目截图

| 首页（浅色，右下角为播放器悬浮按钮） | 文章详情 | 写作台 |
| --- | --- | --- |
| ![首页](screenshots/home.png) | ![文章详情](screenshots/detail.png) | ![写作台](screenshots/write.png) |

| 管理后台 · 仪表盘 | 评论管理 | 移动端 |
| --- | --- | --- |
| ![后台仪表盘](screenshots/admin.png) | ![评论管理](screenshots/admin-list.png) | ![移动端](screenshots/mobile.png) |

| 全站音乐播放器（点击右下角按钮弹出的面板） | 后台 · 音乐管理（列表卡片内滚动） |
| --- | --- |
| ![音乐播放器](screenshots/music-player.png) | ![后台音乐管理](screenshots/music-admin.png) |

### 衬线字体预览

| 首页（浅色） | 文章（浅色） | 文章（深色） |
| --- | --- | --- |
| ![首页浅色](screenshots/font-preview/home-light.png) | ![文章浅色](screenshots/font-preview/article-light.png) | ![文章深色](screenshots/font-preview/article-dark.png) |

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

<!-- Topics: blog, personal-blog, vanilla-js, no-framework, no-dependency, static-site, cloudflare-workers, cloudflare-d1, markdown-blog, javascript, zero-build, lightweight, responsive-design, dark-theme, i18n, end-to-end-encryption, open-source, self-hosted, serif-font, cloudflare-pages -->
