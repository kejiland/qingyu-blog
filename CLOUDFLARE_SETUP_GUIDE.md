> 🌐 **中文** · [English](CLOUDFLARE_SETUP_GUIDE_EN.md)

# Cloudflare 配置完全指南（新手版）

> 本文面向**第一次使用 Cloudflare** 的读者：假设你只会一点点命令行，没接触过 Workers、D1、KV、R2。
> 按本文从上到下做一遍，你会得到一个跑在 Cloudflare 边缘网络上的完整博客。
>
> 相关文档：
> - [README.md](README.md) —— 项目是什么、怎么用
> - [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md) —— 只讲 GitHub Secrets 与 R2 令牌（本文的超集里也包含这部分）
>
> 关于引用的提示信息：Worker 的运行时提示与 CI 校验信息都是硬编码中文，本文引用时保留原文；英文版会附上英文释义，便于对照你实际看到的内容。

---

## 0. 先看结论：一共要做几件事

| 步骤 | 做什么 | 必需吗 | 大概耗时 |
| --- | --- | --- | --- |
| 1 | 注册 Cloudflare 账号，找到 **Account ID** | ✅ 必需 | 5 分钟 |
| 2 | 创建 **D1 数据库**，记下 `database_id` | ✅ 必需 | 3 分钟 |
| 3 | 创建 **KV 命名空间**，记下 `id` | ✅ 必需 | 3 分钟 |
| 4 | 创建 **Cloudflare API Token**（部署用） | ✅ 必需 | 5 分钟 |
| 5 | 把 4 组值填进 **GitHub Secrets** | ✅ 必需 | 5 分钟 |
| 6 | 推送代码 / 手动运行 Actions，等部署完成 | ✅ 必需 | 3 分钟 |
| 7 | 打开 `/admin` 初始化管理员密码 | ✅ 必需 | 2 分钟 |
| 8 | 创建 **R2 桶** + 自定义域名 + CORS + R2 令牌 | ⭕ 可选（图片/音乐上传用） | 20 分钟 |
| 9 | 绑定**自定义域名**，配置 Zone ID（发布即清缓存） | ⭕ 可选 | 10 分钟 |
| 10 | 开启 **Workers AI**（文章摘要 / 写作助手 / 评论汇总） | ⭕ 可选 | 3 分钟 |
| ⭐ | **加固后台登录入口**（Cloudflare Access / 限流规则，见 [第 9 节](#9-加固后台登录入口可选强烈推荐)） | ⭕ 强烈推荐 | 10 分钟 |

**只要做完 1～7 步，博客就已经完全可用了。** 8、9、10 都是"锦上添花"，不做也不会报错，对应功能会自动降级（上传按钮返回 503、AI 入口自动隐藏）。
第 ⭐ 行不是功能性的，但能一次性消掉暴力破解和"后台被锁"两类风险，建议顺手做掉。

> 💡 全程**零费用**。个人博客的用量远低于 Cloudflare 免费额度，具体数字见 [第 16 节](#16-免费额度与成本)。

---

## 1. 这个项目用到了哪些 Cloudflare 服务

```
                  ┌─────────────────────────────────────────┐
   浏览器  ──────► │  Cloudflare Workers（计算 + 静态资源）    │
                  │  ├── /api/*  → 后端接口                  │
                  │  └── 其余    → public/ 静态页面           │
                  └───────┬───────────┬──────────┬──────────┘
                          │           │          │
                    ┌─────▼────┐ ┌────▼─────┐ ┌──▼─────────┐
                    │ D1       │ │ KV       │ │ R2         │
                    │ 主数据库  │ │ 限流/去重 │ │ 图片/音频   │
                    │ 文章评论  │ │ AI 缓存  │ │ 直传对象    │
                    └──────────┘ └──────────┘ └────────────┘
                          │
                    ┌─────▼──────────┐
                    │ Workers AI     │  摘要 / 润色 / 评论汇总
                    └────────────────┘
```

| 服务 | 在本项目里做什么 | 必需 | 代码里的绑定名 |
| --- | --- | --- | --- |
| **Workers** | 跑后端 API，同时托管 `public/` 静态资源 | ✅ | `ASSETS`（静态资源） |
| **D1** | 主数据库：文章、评论、统计、密码、设置、音乐元数据 | ✅ | `DB` |
| **KV** | 评论/点赞/浏览限流与去重、AI 用量计数与摘要缓存 | ✅（不配也能跑，但限流和去重会失效） | `BLOG` |
| **R2** | 存图片和音频的**文件本体**（直传，不过 Worker） | ⭕ | 通过环境变量访问 |
| **Workers AI** | 文章摘要、写作助手（标题/润色/翻译）、评论汇总与垃圾检测 | ⭕ | `AI` |
| **Cache Purge** | 发布文章后清掉边缘缓存，让新内容立刻生效 | ⭕ | 通过 API Token |

> ⚠️ 一个重要前提：本项目部署的是 **Workers**（配置文件 `wrangler.workers.toml`），不是 Cloudflare Pages。
> 两者长得很像，但音乐接口（`/api/music*`）只在 `worker.js` 里实现，**Pages 部署下音乐功能不可用**。新手请一律按本文走 Workers 路线。

---

## 2. 准备账号与域名

### 2.1 注册 Cloudflare

1. 打开 <https://dash.cloudflare.com/sign-up>；
2. 填邮箱 + 密码，去邮箱点验证链接；
3. 登录后你会看到 "Workers & Pages" 之类的入口，说明账号创建成功。

### 2.2 找到 Account ID（账户 ID）

`CLOUDFLARE_ACCOUNT_ID` 就是它，是 32 位十六进制字符串（例如 `a1b2c3d4e5f678901234567890abcdef`）。三种找法：

| 方法 | 操作 |
| --- | --- |
| **看地址栏**（最快） | 登录后地址形如 `dash.cloudflare.com/<这一串就是 Account ID>/...` |
| **看控制台** | 左侧点 **Workers & Pages** → 右侧（或 Overview 页）有一栏 **Account ID**，点复制 |
| **看域名页** | 进入任意域名 → Overview → 右下角 **API** 区域也有 Account ID |

> 🔎 认准关键词 **Account ID**。它和 **Zone ID**（域名 ID）不一样，别混。

### 2.3 要不要域名？（可以先不要）

- **没有域名也能跑**：Workers 默认给你一个 `https://<worker名>.<你的账户子域>.workers.dev` 地址，直接就能访问。
- **想要自己的域名**（推荐，也更像正式站点）：
  1. 准备一个域名（任意注册商都行）；
  2. Cloudflare 控制台 → **Add a site**（添加站点）→ 输入域名 → 选 **Free** 套餐；
  3. Cloudflare 会给你两个 **nameserver**（形如 `xxx.ns.cloudflare.com`）；
  4. 回域名注册商后台，把 DNS 服务器改成这两个，等待生效（几分钟到 24 小时）；
  5. 状态变成 **Active** 就成功了。

### 2.4 安装 Node.js 与 Wrangler（本地命令行用，可选）

如果你打算**全部在网页上点**，可以跳过这一节。但有些操作（创建 D1/KV、查日志）用命令行更省事：

```bash
# 1) 安装 Node.js 20 或更高版本（https://nodejs.org）
node -v      # 应输出 v20.x 以上

# 2) 登录 Cloudflare（会弹出浏览器让你点授权）
npx wrangler login

# 3) 验证登录状态
npx wrangler whoami
```

`wrangler whoami` 会打印你的账号邮箱和 Account ID —— 这就是第 2.2 节的 Account ID，可直接复制。

---

## 3. 创建 D1 数据库（必需）

D1 是这个博客的**主数据库**，文章、评论、统计、管理员密码全在这里。

### 方式 A：网页控制台（推荐新手）

1. 左侧菜单 → **Workers & Pages**；
2. 上方或左侧找到 **D1 SQL database**（中文界面：「D1 SQL 数据库」）；
3. 点 **Create database / 创建数据库**；
4. **Database name** 填 `blog`（必须叫 `blog`，因为 `wrangler.workers.toml` 里写死了 `database_name = "blog"`）；
5. **Location** 选一个离你读者近的区域（例如 `APAC` / 亚太），不确定就选默认；
6. 创建后进入数据库详情页，找到 **Database ID** —— 形如 `0fa366ac-f04a-4be2-8e11-5adc6ee6d686` 的 **UUID（带横线）**。

### 方式 B：命令行

```bash
npx wrangler d1 create blog
```

输出里会有：

```toml
[[d1_databases]]
binding = "DB"
database_name = "blog"
database_id = "0fa366ac-f04a-4be2-8e11-5adc6ee6d686"
```

把 `database_id` 抄下来即可（这一步**不需要**手动改仓库里的文件，CI 会自动替换）。

### 格式校验（很重要）

| 项目 | 正确格式 | 错误示范 |
| --- | --- | --- |
| D1 `database_id` | 36 位 UUID：`8-4-4-4-12` 十六进制，带横线 | ❌ 数据库名 `blog`<br>❌ KV 的 32 位 id |

部署工作流会校验：把横线去掉后必须是 32 位十六进制，否则直接报错
`BLOG_D1_ID 不是有效的 D1 database_id`。

### 建表怎么办？

**不用手动建表**。GitHub Actions 在部署前会自动按 `migrations/*.sql`（0001 ~ 0015）建表并加索引，并写入 `schema_migrations` 记账表保证重复执行安全。

想手动看一眼，可以在 D1 详情页 → **Console** 里执行：

```sql
SELECT name FROM sqlite_master WHERE type='table';
```

---

## 4. 创建 KV 命名空间（必需）

KV 用来做**限流、去重和 AI 缓存**（例如"同一 IP 每分钟最多 5 条评论""同一 IP 对同一篇文章只算一次浏览"）。

### 方式 A：网页控制台

1. **Workers & Pages**（或左侧 **Storage & Databases**）→ **KV**；
2. 点 **Create namespace / 创建命名空间**；
3. 名称填 `BLOG`（任意名字都行，但建议就叫 `BLOG`，和绑定名一致便于对照）；
4. 创建后列表里会显示 **ID** —— 32 位十六进制字符串，例如 `0123456789abcdef0123456789abcdef`。

### 方式 B：命令行

```bash
npx wrangler kv namespace create BLOG
```

输出中的 `id = "..."` 就是它。

> ⚠️ **最容易踩的坑**：KV 的 `id` 在 `wrangler.toml` 里**不支持 `{env.X}` 环境变量内插**（D1 支持，KV 不支持）。
> 所以本项目的部署工作流用了一段 Python 脚本，在部署前把 `wrangler.workers.toml` 里的
> `{env.BLOG_KV_ID}` 占位符**替换成真实值**，生成临时文件 `wrangler.workers.ci.toml` 再部署。
> 你不需要手动改文件，只要把 `BLOG_KV_ID` 填对就行。

### 不配 KV 会怎样？

博客能跑，但以下保护会**静默失效**（只在 Worker 日志里打一条 warning）：

- 评论频率限制（每分钟 5 条）
- 点赞/浏览频率限制与去重
- AI 用量计数与摘要缓存（用量上限会失效，小心额度）

所以**强烈建议配置**。

---

## 5. 创建 API Token（必需，最容易搞错的一步）

### 5.1 先分清三种"令牌"

新手 90% 的困惑来自这里：

| 名称 | 在哪里创建 | 用途 | 对应本项目 |
| --- | --- | --- | --- |
| **Account API Token** | 头像 → My Profile → **API Tokens** | 让 GitHub Actions 部署 Worker、执行 D1 迁移、清缓存 | `CLOUDFLARE_API_TOKEN`（GitHub Secret） |
| **R2 API Token**（S3 凭据） | **R2** → **API** → Manage API Tokens | 让 Worker 给浏览器签发 R2 直传地址 | `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY`（两个 GitHub Secret） |
| **Global API Key** | 头像 → My Profile → API Tokens 底部 | 万能钥匙，**不要用** | ❌ 本项目不使用 |

- Account API Token 是一串普通字符串。
- R2 API Token 会给你**一对**值：`Access Key ID` + `Secret Access Key`（Secret 只在创建时显示一次，务必立刻保存）。

### 5.2 创建 Account API Token 的步骤

1. 右上角**头像** → **My Profile / 我的个人资料**；
2. 左侧 **API Tokens / API 令牌** → **Create Token / 创建令牌**；
3. 拉到最下面选 **Create Custom Token / 创建自定义令牌**；
4. **Token name** 填个能认出来的名字，例如 `qingyu-blog-deploy`；
5. **Permissions / 权限** 按下面这张表逐条添加：

| 权限范围（Group） | 资源（Resource） | 级别（Level） | 为什么需要 | 必需 |
| --- | --- | --- | --- | --- |
| Account | Workers Scripts | **Edit** | 部署 / 更新 Worker | ✅ |
| Account | D1 | **Edit** | 部署前执行数据库迁移 | ✅ |
| Account | Workers KV Storage | **Edit** | 部署 KV 绑定 | ✅ |
| Zone | Cache Purge | **Purge** | 发布文章后清边缘缓存 | ⭕ 可选 |
| Account | Workers AI | **Edit** | 首次部署时创建 AI 绑定 | ⭕ 可选（开了 AI 才需要） |
| Account | Account Settings | **Read** | 某些 wrangler 命令需要读取账户信息 | ⭕ 建议加上 |

6. **Account Resources**：选 `Include` → 你的账号；
7. **Zone Resources**（如果你加了 Zone 权限）：选 `Include` → `Specific zone` → 你的域名（或 `All zones`）；
8. **Continue to summary → Create Token**；
9. **立刻复制这串 Token**（只显示一次），先粘到记事本里。

> 💡 懒得细挑权限？Cloudflare 也提供现成的 **"Edit Cloudflare Workers"** 模板，但**不含 D1 和 KV**，还要自己补。新手直接按上表手工勾最稳。
>
> 💡 也可以图省事用 **"Workers 管理员读和写"** 这类宽泛的 Account Token，能跑通；但生产环境建议最小权限。

### 5.3 验证 Token 是否可用

```bash
# PowerShell / macOS / Linux 都可以，先设置环境变量
export CLOUDFLARE_API_TOKEN="你刚复制的Token"
export CLOUDFLARE_ACCOUNT_ID="你的Account ID"

npx wrangler whoami
```

能打印出账号信息和权限列表就说明 Token 有效。

> Windows PowerShell 里用 `$env:CLOUDFLARE_API_TOKEN="..."` 而不是 `export`。

### 5.4 Token 相关常见报错

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `Authentication error [code: 10000]` | Token 拼错 / 已删除 / 前后有空格换行 | 重新复制，注意别把换行带进去 |
| `A request to the Cloudflare API failed` + `8000007` | Token 的 **Account Resources** 没包含你的账号 | 编辑 Token，把账号加进 Account Resources |
| `Unable to authenticate request` | 用了 Global API Key 而不是 Token | 按 5.2 重新创建 Token |
| 部署成功但 D1 迁移失败 | Token 缺 `D1: Edit` 权限 | 补权限后重新运行部署 |
| 发布后缓存没清 | Token 缺 `Zone: Cache Purge`，或没配 `CF_ZONE_ID` | 两者都要有 |

---

## 6. R2：图片与音乐上传（可选）

**不配也能用博客**，只是后台的"媒体资源 / 音乐管理"上传会返回 `503`（提示 R2 未配置）。

> 为什么用 R2：R2 **下行流量（egress）免费**。博客的图片和音乐会被反复读取，放在 R2 上几乎只付存储费，而存储的免费额度是每月 10 GB。

### 6.1 创建桶（Bucket）

建议两个桶，职责分开：

| 用途 | 建议桶名 | 公开读取域名示例 |
| --- | --- | --- |
| 音乐音频 | `qingyu-music` | `https://music.example.com` |
| 图片媒体 | `qingyu-media` | `https://media.example.com` |

1. 左侧 **R2 object storage / R2 对象存储** → **Create bucket / 创建存储桶**；
2. **Bucket name** 填 `qingyu-music`，**Location** 选 `Automatic`（或离你近的区域）；
3. 重复一次创建 `qingyu-media`。

> 只想用一个桶也可以：把两个用途指向同一个桶（见 [6.6](#66-两个桶还是一个桶)）。

### 6.2 让桶能被公开读取

R2 里的对象默认是**私有**的，浏览器 `<img>` / `<audio>` 直接访问会 403，必须开一个公开入口。有两种：

#### 方案一：绑定自定义域名（**推荐**）

1. 进入桶 → **Settings / 设置** → **Public access / 公开访问**；
2. 找到 **Custom Domains / 自定义域名** → **Connect Domain / 连接域名**；
3. 填一个**子域名**，例如 `music.example.com`（该域名必须已经在同一个 Cloudflare 账号里，即第 2.3 节接入了）；
4. Cloudflare 会自动加一条 DNS 记录，状态变成 **Active** 即可。

访问 `https://music.example.com/<对象key>` 就能读到文件。

#### 方案二：r2.dev 开发域名（**仅测试用**）

同一个页面里有 **R2.dev subdomain / R2.dev 子域名**，点 **Allow Access** 会给你一个 `https://pub-xxxx.r2.dev`。
它**有速率限制、不建议用于生产**，只适合先跑通流程。

> ⚠️ 把自定义域名或 r2.dev 域名填进 `R2_PUBLIC_BASE` / `R2_MEDIA_PUBLIC_BASE` 时：
> **必须以 `https://` 开头，末尾不要加 `/`。**
> 且**不要**填 R2 的 S3 Endpoint（`...r2.cloudflarestorage.com`）。

### 6.3 配置 CORS（**上传失败的头号原因**）

浏览器是**直传**到 R2 的（文件不经过 Worker），所以 R2 必须允许你的站点跨域 `PUT`，否则浏览器预检（preflight）就会被拦下，前端只会看到一句 `HTTP 0：预检被拦截 / CORS 或网络中断`。

1. 进入桶 → **Settings / 设置** → **CORS Policy** → **Add CORS policy**；
2. 直接粘贴下面这段（把 `www.example.com` 换成你自己的域名）：

```json
[
  {
    "AllowedOrigins": [
      "https://www.example.com",
      "https://example.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. 保存。两个桶都要配一遍。

要点：

| 配置项 | 为什么 | 常见错误 |
| --- | --- | --- |
| `AllowedOrigins` | 只允许你的站点上传，防止别人盗用 | 忘了加 `www` 或没加 `https://` |
| `AllowedMethods` 含 **PUT** | 上传用的是 `PUT` | 只写了 `GET` |
| `AllowedHeaders` 含 **`Content-Type`** | 预签名 URL **把 `content-type` 算进了签名**，浏览器必须原样发送这个头 | 写成了小写 `content-type` 或漏掉 |
| `ExposeHeaders: ETag` | 部分浏览器需要读取 ETag | 缺失通常不致命 |
| `MaxAgeSeconds` | 预检结果缓存时长 | — |

> 💡 同时用了 `example.com` 和 `www.example.com` 时，**两个都要写进 `AllowedOrigins`**。

### 6.4 创建 R2 API Token（S3 凭据）

1. 左侧 **R2** → **API** → **Manage API Tokens / 管理 API 令牌**；
2. **Create API token / 创建 API 令牌**；
3. **Permissions / 权限** 选 **Object Read & Write / 对象读和写**；
4. **Specify bucket(s) / 指定存储桶**：**同时勾选** `qingyu-music` 和 `qingyu-media`；
   - 如果界面只能单选，就选 **All buckets / 所有存储桶**；
5. 创建后立刻保存三样东西：

| 显示项 | 填到哪个 Secret |
| --- | --- |
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key（**只显示一次**） | `R2_SECRET_ACCESS_KEY` |
| Endpoint（形如 `https://<accountid>.r2.cloudflarestorage.com`） | `R2_ENDPOINT` |

> ❗ **本项目只需要一组 R2 凭据**：音乐和图片共用同一对 Access Key / Secret。
> 代码只读取 `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` 这两个变量，没有"音乐专用凭据"。
> 所以这对凭据**必须同时有权限访问两个桶**；只授权单个桶会导致另一边上传 403。

### 6.5 `R2_ENDPOINT` 的正确写法

```
✅ https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com
❌ https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com/qingyu-media   （不要带桶名）
❌ https://music.example.com                                                       （这是公开域名，不是 Endpoint）
❌ https://...r2.cloudflarestorage.com/                                             （末尾不要加 /）
```

### 6.6 两个桶还是一个桶？

| 方案 | 怎么填 | 适合谁 |
| --- | --- | --- |
| **两个桶**（推荐） | `R2_BUCKET=qingyu-music`、`R2_PUBLIC_BASE=https://music.example.com`、`R2_MEDIA_BUCKET=qingyu-media`、`R2_MEDIA_PUBLIC_BASE=https://media.example.com` | 想分开管理、分开加缓存规则 |
| **一个桶** | 四个变量都填同一个桶名和同一个域名 | 只想维护一个桶，最省事 |
| 只用图片 | `R2_BUCKET` / `R2_PUBLIC_BASE` 也填媒体桶（工作流要求它们非空才会写入 R2 配置） | 不打算放音乐 |
| 只用音乐 | `R2_MEDIA_BUCKET` / `R2_MEDIA_PUBLIC_BASE` 留空 | 不打算传图片 |

音乐桶的判定逻辑（代码层面）：

```
音乐上传目标 = （R2_BUCKET 和 R2_PUBLIC_BASE 都非空）? 音乐桶 : 媒体桶
```

也就是说：**只要音乐桶的两个变量都是空的，音乐就会自动落到媒体桶**。如果你发现音乐传到了媒体桶，先检查 `R2_BUCKET` / `R2_PUBLIC_BASE` 是不是漏填了。

> ⚠️ 注意工作流的一处细节：`R2_MEDIA_BUCKET` 只有在 `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_ENDPOINT`、`R2_MEDIA_BUCKET` 四项都非空时才会写入 Worker。
> 所以"只用图片"的方案里，**必须**同时把 `R2_BUCKET` / `R2_PUBLIC_BASE` 也填上，否则整组 R2 配置都不会生效。

### 6.7 给媒体域名加缓存（强烈建议）

浏览器直传的 R2 对象默认**不带长缓存头**，缩略图/封面首次加载需要回源。加一条缓存规则后，新旧对象都会走缓存：

1. 控制台 → 你的**域名** → **Caching / 缓存** → **Cache Rules / 缓存规则** → **Create rule**；
2. **When incoming requests match**：`Hostname` 等于 `media.example.com`（或 `Custom filter expression` 里用 `or` 同时匹配 `music.example.com`）；
3. **Then**：
   - **Cache eligibility** → `Eligible for cache`（旧界面叫 **Cache Everything**）
   - **Edge TTL** → `Ignore cache-control header and use this TTL` → **1 month**
   - **Browser TTL** → `Override origin` → **1 month**
4. 保存。首次访问仍会回源一次，之后浏览器与边缘都会直接命中。

### 6.8 R2 排查速查表

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 上传返回 **503** `R2 未配置` | 缺 `R2_BUCKET`，或整组 R2 Secret 没填全 | 检查 7 个 R2 变量是否齐全，改完**重新跑一次部署** |
| 浏览器上传 `HTTP 0` | R2 桶没配 CORS，或 `AllowedOrigins` 没包含当前域名 | 按 6.3 补 CORS |
| 上传 **403** | ① 令牌没有目标桶的写权限 ② `R2_ENDPOINT` 写错 ③ Access Key 与 Secret 不匹配 ④ CORS 不允许该来源 | 逐项核对 6.3 / 6.4 / 6.5 |
| 提示 `SignatureDoesNotMatch` | `R2_ENDPOINT` 带了桶名或末尾斜杠；或凭据里有空格换行 | 按 6.5 修正 |
| 上传成功，但访问 **404** | 公开域名没绑到对应桶，或 `R2_PUBLIC_BASE` / `R2_MEDIA_PUBLIC_BASE` 填错 | 用浏览器直接打开 `公开域名/<对象的 key>` 验证 |
| 音乐还是进了媒体桶 | `R2_BUCKET` 或 `R2_PUBLIC_BASE` 有空值 | 两个都填上并重新部署 |
| 改完 Secret 线上没变化 | **GitHub Secret 的修改不会自动生效** | 必须重新运行一次部署工作流 |

---

## 7. Workers AI（可选）

开启后博客会多出这些能力（全部可自动降级）：

| 位置 | 功能 |
| --- | --- |
| 文章页 | 「AI 摘要」按钮（单篇缓存 30 天） |
| 后台编辑器 | 「AI 写作助手」：标题建议 / 润色 / 翻译（5 种目标语言） |
| 后台评论页 | 「汇总」近期评论要点 + 单条评论垃圾检测 |
| 前台首页 | 卡片摘要的 AI 生成版本 |

**绑定是怎么来的？** `wrangler.workers.toml` 里已经有：

```toml
[ai]
binding = "AI"
```

`wrangler deploy` 时会自动创建这个绑定，**不需要手动操作**（前提：Token 有 `Workers AI: Edit` 权限，账户已开通 Workers AI）。

**怎么确认它生效了？** 部署后访问：

```
https://你的域名/api/ai/ping
```

- 返回 `{"ok":true}` → AI 可用，前端会显示所有 AI 入口；
- 返回 `404 {"ok":false,"error":"AI 未启用"}` → AI 不可用，前端**自动隐藏**全部 AI 入口（页面上不会有任何"坏按钮"）。

**怎么整体关掉？** 在 Worker 上设置环境变量（**不是** GitHub Secret，工作流不写这两个变量）：

```bash
# 关闭全部 AI 功能
npx wrangler secret put BLOG_AI_ENABLED     # 输入 0 / false / off 之一
```

- `BLOG_AI_ENABLED = 0`：所有 `/api/ai/*` 返回 404；
- `BLOG_AI_PUBLIC = 0`：只关掉"匿名访客也能生成摘要"，登录后仍可用（摘要缓存读取不受影响）。

> 🔐 **隐私提醒**：开启 AI 后，文章正文 / 评论内容会以**明文**发送给 Cloudflare Workers AI 模型（默认 `@cf/meta/llama-3.2-3b-instruct`）做推理。内容敏感就别开，或用 `BLOG_AI_ENABLED=0` 全关。

---

## 8. 自定义域名与 Zone ID（可选）

### 8.1 把域名绑到 Worker

1. 控制台 → **Workers & Pages** → 点进你的 Worker（默认名 `kejiland`）；
2. **Settings / 设置** → **Domains & Routes / 域和路由** → **Add / 添加** → **Custom Domain / 自定义域**；
3. 填 `www.example.com`（域名必须已接入同一账号）；
4. 等状态变成 **Active**，就可以用 `https://www.example.com` 访问博客了。

> 也可以再加一条 `example.com`，或者在 Cloudflare 的 **Rules → Redirect Rules** 里做 `example.com → www.example.com` 的 301 跳转。

### 8.2 找到 Zone ID

部署后要"发布即清缓存"，需要 **Zone ID**：

1. 控制台左侧选中**你的域名**；
2. **Overview / 概览** 页面；
3. 右侧栏（或页面底部）**API** 区域 → **Zone ID**，点复制。

形如 `0123456789abcdef0123456789abcdef`（32 位十六进制）。填进 GitHub Secret `CF_ZONE_ID`。

### 8.3 缓存清除是怎么工作的

- 代码在文章新增/修改/删除、点赞时会调用 Cloudflare 的 Cache Purge API，用 `Cache-Tag`（`posts` / `feed` / `sitemap` / `post:<id>` / `stats:<id>`）**精确清掉相关缓存**；
- 前提：`CF_ZONE_ID` + 一个有 **Zone / Cache Purge** 权限的 Token。工作流会把你填的 `CLOUDFLARE_API_TOKEN` 同时写进 Worker 的 `CF_API_TOKEN`；
- 两个前提缺一个，清缓存就**静默跳过**（不影响功能，只是新内容可能要等 `s-maxage` 过期，通常 1～5 分钟）。

**"按标签清除"在各套餐都可用**（Free / Pro / Business / Enterprise 均支持），限额为每分钟 5 次清除请求、单次最多 100 个操作 —— 个人博客远远够用。

> 没有自定义域名（只用 `*.workers.dev`）时**没有 Zone**，也就没有 Zone ID，清缓存功能不可用。此时静态资源本身带了 `?v=` 版本号长缓存，HTML 入口是 `no-cache`，一般也不会陈旧。

---

## 9. 加固后台登录入口（可选，强烈推荐）

`/api/admin/login` 是全站唯一「凭密码进门」的入口，也是最值得花 10 分钟加固的地方。

项目内部已经做了三层限流（单 IP / 子网 / 全局冷却），并且**保证站长永远进得去**（见 [9.5](#95-项目内置的三层限流已默认生效)）；但如果能在**边缘**就把爆破流量挡掉，连 CPU 和数据库额度都省了。

### 9.1 方案 A：把 `/admin` 放到 Cloudflare Access 后面（最推荐）

效果：**没有通过 Cloudflare 身份验证的请求，根本到不了 Worker 的登录接口**。暴力破解、误锁、CPU 与 D1 额度消耗一次性全部消失。

1. 控制台左侧找到 **Zero Trust**（首次进入会让你起一个团队名，例如 `your-name`，免费版即可）；
2. **Access → Applications → Add an application → Self-hosted**；
3. **Application name** 填 `Qingyu Blog Admin`；
4. **Public hostname**：选你的域名，**Path** 填 `admin`（只保护 `/admin*`）；再点 **Add public hostname** 加第二条：同域名、Path 填 `api/admin`（保护登录与初始化接口，这条很关键）；
5. **Access policies** 新建一条：Action = `Allow`，Include = `Emails` = 你的邮箱；
6. **Authentication** 选 **One-time PIN**（免费，验证码发邮箱，不需要配置任何外部身份提供商）；
7. 保存。之后打开 `/admin` 会先看到 Cloudflare 的邮箱验证页，通过后才是博客自己的登录页。

注意事项：

- **只保护 `/admin*` 与 `/api/admin/*`**，不要保护整个域名，否则访客也进不来了；
- `/api/posts`、`/api/comments`、`/api/music` 等公开接口**不要**加进去；
- 前台「编辑文章」入口是 `/posts/<别名>/edit`，它也会加载后台；在意的话把它一起加进 Path 列表（不加也不算漏洞——那个页面没有会话 token 就保存不了）；
- 免费版 Zero Trust 支持最多 50 名用户，个人博客绰绰有余；
- 配好 Access 后，博客自身的密码登录依然有效，是两层独立的门。

### 9.2 方案 B：给登录接口配一条限流规则

不想让后台多一次登录步骤，就用 WAF 的限流规则在边缘兜底：

1. 控制台 → 你的**域名** → **Security / 安全性** → **Security rules / 安全规则** → **Rate limiting rules / 限流规则** → **Create rule**；
2. **When incoming requests match**：`URI Path` **equals** `/api/admin/login`（免费版可用字段只有 Path，正好够用）；
3. **Rate**：`10` requests per `10 seconds`（免费版的计数窗口与缓解时长都固定为 10 秒）；
4. **Then**：**Block**，Duration `10 seconds`；
5. 保存。

被拦下的请求**不会进入 Worker**，因此既不消耗 Worker 请求额度，也不消耗 D1/KV 配额。免费版含 **1 条**限流规则，用在登录接口上最划算。

### 9.3 方案 C：在 Worker 里启用边缘限流绑定（可选）

项目还接入了 Workers Rate Limiting API：配置 `BLOG_RATE_LIMIT_BINDING` 后，Worker 会在入口按 IP 限流（默认 10 次/分钟/位置），被拦的请求**不查库也不写库**。

| 项目 | 说明 |
| --- | --- |
| 怎么开 | 在 GitHub Secrets 里加 `BLOG_RATE_LIMIT_BINDING`，值是一个**正整数命名空间**（例如 `1001`），然后重新部署 |
| 会自动发生什么 | 工作流改用 wrangler 4.x（该绑定要求 ≥ 4.36），并把 `[[ratelimits]]` 注入部署配置，绑定名固定为 `LOGIN_LIMITER` |
| 不配会怎样 | 完全不受影响：代码检测不到绑定就回退到 D1 计数（默认行为） |
| 部署报错怎么办 | 说明你的账户/套餐暂不支持该绑定：删掉这个 Secret 重新部署即恢复 |
| 特性 | 计数器按 Cloudflare 数据中心本地缓存、最终一致，定位是「防滥用」而非精确计费 |

### 9.4 三种方案怎么选

| 你的情况 | 建议 |
| --- | --- |
| 想省事又要最安全 | **方案 A**（Access），一次配置长期有效 |
| 不想让后台多一次登录 | **方案 B**（限流规则）；有条件就 A + B 一起上 |
| 账户支持、又懒得点控制台 | **方案 C**，只加一个 Secret |
| 什么都不想配 | 也可以：项目内置的三层限流仍在生效（见下一节） |

### 9.5 项目内置的三层限流（已默认生效）

即使一个方案都不配，登录接口本身也有防护，而且**不会把站长锁在门外**：

| 维度 | 阈值 | 冷却 | 说明 |
| --- | --- | --- | --- |
| 单 IP | 5 次失败 | 15 分钟 | 只影响攻击者自己的出口 IP |
| 子网（IPv4 /24、IPv6 /64） | 15 次失败 | 60 秒 | 提高「轮换 IP」的成本；冷却很短，避免同网段他人被误伤 |
| 全局 | 30 次失败 | **10 秒** + 告警日志 | 只做短冷却，**绝不做长时间锁定**（否则攻击者可以把唯一的管理员锁在门外）；冷却期间请求直接早退，不写数据库，等于给分布式爆破加了一道写放大闸门 |

三层计数都会在「最后一次失败」之后 1 小时自动老化清零；冷却刚结束的一段时间内计数会保留，避免攻击者靠「等冷却归零再重试」来无限刷。

**应急通道**：登录请求带上正确的 `X-Setup-Key`（即 `BLOG_ADMIN_SETUP_KEY`）会**跳过以上全部限流**——但**不跳过密码校验**。后台登录页在触发限流时会自动展开「用安装密钥登录」入口。也就是说：
> 攻击者能造成的最大伤害，是让别人 10 秒内登录不了；**你自己永远有一条进得去的路**。

> ⚠️ 这也是「全局锁定」这个常见做法被本项目**刻意放弃**的原因：对单管理员系统来说，全局长锁定防不住攻击者（他换个 IP 继续），却能被攻击者用来做可用性 DoS。相关取舍写在 `functions/_lib/api-core.js` 的「登录限流的分层计数」注释里。

---

## 10. GitHub Secrets 完整清单

仓库 → **Settings** → **Secrets and variables** → **Actions** → **Secrets** 标签 → **New repository secret**。

> ⚠️ 一定要加在 **Secrets** 里，**不要**加到 **Variables** —— 工作流只读 Secrets。
> ⚠️ 名称**区分大小写**，值里**不要**写 `NAME=`，一般**不要**加引号。

### 10.1 必填（缺一个部署就停）

| Secret | 填什么 | 格式 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | 第 5 节创建的 Account API Token | 普通字符串 |
| `CLOUDFLARE_ACCOUNT_ID` | 第 2.2 节的 Account ID | 32 位十六进制 |
| `BLOG_D1_ID` | 第 3 节的 D1 **Database ID** | UUID（带横线） |
| `BLOG_KV_ID` | 第 4 节的 KV **Namespace ID** | 32 位十六进制 |

### 10.2 推荐

| Secret | 填什么 | 说明 |
| --- | --- | --- |
| `BLOG_ADMIN_SETUP_KEY` | 你自己生成的一串长随机值 | **强烈建议填**。配置后只有拿着这串密钥的人才能初始化管理员密码；不填则退化为"第一次登录自动生成随机默认密码"（存在被别人抢先初始化的竞态） |
| `SITE_URL` | `https://www.example.com` | 站点正式地址，**末尾不要加 `/`**。用于收紧 CORS（不配则跨域请求一律拒绝）、RSS/Sitemap 链接、评论来源校验 |

### 10.3 可选

| Secret | 填什么 | 说明 |
| --- | --- | --- |
| `CF_ZONE_ID` | 第 8.2 节的 Zone ID | 配合 Cache Purge 权限 → 发布即清缓存 |
| `PAGES_PROJECT_NAME` | Worker 名称 | **名字有误导性**：它的实际作用是覆盖 Worker 名（`--name`）。不填则用 `wrangler.workers.toml` 里的 `kejiland`。**新手建议不填**，随便改名会部署出一个新 Worker |
| `BLOG_WRITE_TOKEN` | 旧式写入令牌 | 新部署不需要 |
| `BLOG_RATE_LIMIT_BINDING` | 一个正整数，如 `1001` | 启用 Worker 内的边缘登录限流（见 [9.3](#93-方案-c在-worker-里启用边缘限流绑定可选)）；会让工作流改用 wrangler 4.x。账户不支持就删掉它 |
| `R2_ACCESS_KEY_ID` | 第 6.4 节 | R2 上传 |
| `R2_SECRET_ACCESS_KEY` | 第 6.4 节 | R2 上传 |
| `R2_ENDPOINT` | 第 6.5 节 | R2 上传 |
| `R2_BUCKET` | 音乐桶名，如 `qingyu-music` | R2 上传（**不能为空**，否则整组 R2 配置不写入） |
| `R2_PUBLIC_BASE` | 音乐桶公开域名 | R2 播放地址 |
| `R2_MEDIA_BUCKET` | 媒体桶名，如 `qingyu-media` | 图片上传 |
| `R2_MEDIA_PUBLIC_BASE` | 媒体桶公开域名 | 图片访问地址 |

### 10.4 一次性全部填好的示例

```text
CLOUDFLARE_API_TOKEN=你的部署Token
CLOUDFLARE_ACCOUNT_ID=a1b2c3d4e5f678901234567890abcdef
BLOG_D1_ID=0fa366ac-f04a-4be2-8e11-5adc6ee6d686
BLOG_KV_ID=0123456789abcdef0123456789abcdef
BLOG_ADMIN_SETUP_KEY=请生成一串足够长的随机值
SITE_URL=https://www.example.com
CF_ZONE_ID=0123456789abcdef0123456789abcdef
BLOG_RATE_LIMIT_BINDING=1001   # 可选：启用边缘登录限流（账户不支持就删掉这一行）

R2_ACCESS_KEY_ID=共用R2Token的AccessKeyID
R2_SECRET_ACCESS_KEY=共用R2Token的SecretAccessKey
R2_ENDPOINT=https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com
R2_BUCKET=qingyu-music
R2_PUBLIC_BASE=https://music.example.com
R2_MEDIA_BUCKET=qingyu-media
R2_MEDIA_PUBLIC_BASE=https://media.example.com
```

> 生成随机密钥的小技巧：
> - PowerShell：`-join ((48..57) + (97..122) | Get-Random -Count 40 | % {[char]$_})`
> - macOS / Linux：`openssl rand -hex 24`

---

## 11. 触发部署

### 11.1 自动触发

```bash
git add .
git commit -m "chore: configure deployment"
git push origin main
```

推送到 `main` 就会触发 **Deploy to Cloudflare Workers**。

### 11.2 手动触发

仓库 **Actions** → 左侧 **Deploy to Cloudflare Workers** → **Run workflow** → 选 `main` → **Run workflow**。

手动触发会额外跑一步 `wrangler whoami`，方便排查凭证问题。

### 11.3 工作流到底做了哪些事

| 顺序 | 步骤 | 失败的典型原因 |
| --- | --- | --- |
| 1 | Checkout + Setup Node 24 + 安装 wrangler（默认 `3.90.0`；配了 `BLOG_RATE_LIMIT_BINDING` 时改用 `4.x`） | — |
| 2 | 跑三套测试：`smoke-test.js`(78) / `gb-verify.js`(18) / `search-verify.js`(13) | 代码改坏了；测试失败**不会**继续部署 |
| 3 | 校验必要的 Secrets 是否齐全 | 填到了 Variables、名称拼错、值前后有空格 |
| 4 | 校验 `BLOG_KV_ID`（32 位十六进制）与 `BLOG_D1_ID`（UUID），并把 `{env.*}` 占位符替换成真实值，生成 `wrangler.workers.ci.toml` | 填成了数据库名 / 混用了两种 ID |
| 5 | 按 `migrations/*.sql` 顺序执行 D1 迁移（三层幂等保护） | Token 缺 D1 权限、D1 ID 填错 |
| 6 | `wrangler deploy` 部署 Worker | Token 缺 Workers Scripts 权限 |
| 7 | 写入运行时 Secret（安装密钥、R2 凭据、`CF_API_TOKEN` 等） | 非致命，缺变量时跳过 |

部署成功后，Actions 日志最后会打印 Worker 的访问地址。

### 11.4 改完 Secret 一定要重新部署

GitHub Secret 的修改**不会**自动同步到已经部署的 Worker。任何 Secret 变更后，都要再跑一次部署工作流。

---

## 12. 首次初始化管理员

打开 `https://你的域名/admin`。

### 情况 A：配置了 `BLOG_ADMIN_SETUP_KEY`（推荐）

1. 页面显示「管理员登录」；
2. 点「首次部署？使用安装密钥初始化」；
3. 填 **新管理密码**（**至少 8 位**）+ **安装密钥**，提交；
4. 系统自动登录，开始写作。

> 在初始化之前，登录接口一律返回 403，别人就算知道网址也**抢不走**你的管理员账号。

### 情况 B：没配置 `BLOG_ADMIN_SETUP_KEY`

1. 用**任意密码**登录一次；
2. 后端自动生成一个随机默认密码（形如 `abcd-efgh`）并在页面上弹出提示；
3. 用它登录后，请你**立刻修改密码**（右上角账户菜单 → 修改密码）。

> ⚠️ 这条路径存在"先到先得"的竞态：谁先访问谁就拿到默认密码。**全新部署请务必配置 `BLOG_ADMIN_SETUP_KEY`。**

### 忘记密码怎么办？

当前接口为了防抢注，**不提供在线重置**。手动重置：

1. 控制台 → **D1** → 你的 `blog` 数据库 → **Console**；
2. 执行：

```sql
DELETE FROM admin_auth WHERE k = 'auth';
DELETE FROM admin_sessions;
```

3. 回到 `/admin`，按第 12 节的流程重新初始化即可。

---

## 13. 部署后自检清单

按顺序点一遍，全绿就说明配置正确：

| # | 检查项 | 期望结果 |
| --- | --- | --- |
| 1 | 打开首页 | 正常渲染；若云端探测成功，说明 `/api/posts` 通 |
| 2 | 打开 `/admin` | 能登录进入仪表盘 |
| 3 | 后台 → 全部文章 → 写新文章 → 发布 | 列表出现新文章，前台首页能看到 |
| 4 | 打开 `/feed.xml` 与 `/sitemap.xml` | 返回 XML，且**包含刚发布的文章**（说明 D1 写入成功） |
| 5 | 打开 `/api/ai/ping` | `{"ok":true}`（开了 AI）或 404（没开，正常） |
| 6 | 后台 → 媒体资源 → 上传一张图片 | 进度条走完，卡片出现缩略图；点「复制」拿到的地址在浏览器能打开 |
| 7 | 后台 → 音乐管理 → 上传一个 mp3 | 表格出现曲目，行内试听能播放并显示时长 |
| 8 | 前台右下角音乐按钮 | 悬停滑出，点开能看到播放列表 |
| 9 | 前台文章页发一条评论 | 提示成功；后台评论页能看到（若开了审核，状态是「待审核」） |
| 10 | 连发同一条评论 | 返回 409「请勿重复发送相同内容」（说明 D1 + KV 都在工作） |
| 11 | 控制台 → D1 → Console 执行 `SELECT COUNT(*) FROM posts;` | 数字与文章数一致 |
| 12 | 控制台 → Workers & Pages → 你的 Worker → Logs | 有实时请求日志，没有红色报错 |

---

## 14. 故障排查速查表

| 现象 | 最可能的原因 | 处理 |
| --- | --- | --- |
| Actions 提示「缺少必要的 GitHub Secrets」 | 填到了 Variables，或名称拼写/大小写不对 | 移到 Secrets，逐字核对 |
| Actions 提示 `BLOG_KV_ID 不是有效的 32 位十六进制` | 把 KV 的 id 和 D1 的 UUID 搞混了 | KV = 32 位无横线；D1 = 带横线的 UUID |
| 部署报 `Authentication error [code: 10000]` | Token 错误或已被删除 | 重新创建 Token 并更新 Secret |
| 部署报 `8000007` | Token 的 Account Resources 没选账号 | 编辑 Token 加上账号 |
| 页面能开，但文章列表空 | D1 未绑定 / 迁移没跑 / 是全新的空库 | 看 Actions 第 6 步日志；控制台查 `SELECT COUNT(*) FROM posts` |
| 接口返回 `数据库未配置：请创建并绑定名为 DB 的 D1 数据库` | `BLOG_D1_ID` 填错，或 KV/D1 绑定没生效 | 核对 ID 后重新部署 |
| 上传图片/音乐返回 **503** | R2 配置不全（尤其 `R2_BUCKET` 为空） | 补齐 R2 变量并重新部署 |
| 浏览器上传 `HTTP 0` | R2 桶 CORS 未配 / 来源不在白名单 | 按 6.3 配置 |
| 上传 **403** | 令牌无桶写权限 / Endpoint 错 / Access Key 与 Secret 不匹配 | 按 6.4、6.5 核对 |
| 上传成功但打开地址 **404** | 公开域名没绑桶，或 `*_PUBLIC_BASE` 填错 | 直接访问 `公开域名/<key>` 验证 |
| 改了 Secret 后线上没变化 | 没有重新运行部署 | 再跑一次工作流 |
| 发布文章后前台还是旧内容 | 缺 `CF_ZONE_ID` 或 Token 缺 Cache Purge 权限 | 补上；或等 1～5 分钟缓存过期 |
| 跨域调用 API 被浏览器拦 | `SITE_URL` 没配 / 配错（未配置时是"一律拒绝"而非"回显来源"） | 填对 `SITE_URL`（含 `https://`，末尾无 `/`） |
| AI 入口不出现 | AI 未绑定、`BLOG_AI_ENABLED` 被关、或 `/api/ai/ping` 返回 404 | 访问 `/api/ai/ping` 确认；修复后刷新页面（不可用状态只缓存 30 秒） |
| 后台一直提示「登录已过期」 | 会话 7 天到期，或改了密码（会清空所有会话） | 重新登录 |
| 后台登录被锁 | ① 同一 IP 连续失败 5 次 → 锁 15 分钟 ② 同一网段失败 15 次 → 冷却 60 秒 ③ 全站失败 30 次 → 冷却 10 秒 | 首选：登录页点「被限流？用安装密钥登录」，填 `BLOG_ADMIN_SETUP_KEY` 立即进入；其次等 10~60 秒重试；最后可去 D1 执行 `DELETE FROM admin_fails;` |
| 登录页一直提示「尝试次数过多」 | 有人正在爆破你的登录接口 | 到 Worker 日志里搜「全局失败冷却已触发」看来源 IP；建议按 [第 9 节](#9-加固后台登录入口可选强烈推荐) 配 Access 或限流规则从源头拦掉 |
| 音乐管理里的播放器时长显示 0:00 | 音频还没加载完元数据 / 生产环境没配公开域名 | 正常现象，点击播放后会更新 |

---

## 15. 环境变量总表

这张表是**代码实际读取**的全部变量，按"缺省行为"排列，便于排查"我少配了什么"。

| 名称 | 类型 | 必需 | 未配置时 |
| --- | --- | --- | --- |
| `DB` | D1 绑定 | ✅ | 所有接口返回「数据库未配置」 |
| `ASSETS` | 静态资源绑定 | ✅（Workers 自动有） | 静态页面 404 |
| `BLOG` | KV 绑定 | 建议 | 评论/点赞/浏览限流与去重失效；AI 用量计数失效 |
| `SITE_URL` | 变量（`[vars]`） | 建议 | **跨域请求一律被拒**；RSS/Sitemap 用请求来源 |
| `CF_ZONE_ID` | 变量（`[vars]`） | ⭕ | 不做边缘缓存清除 |
| `CF_API_TOKEN` | Secret | ⭕ | 不做边缘缓存清除（由工作流自动写入） |
| `BLOG_ADMIN_SETUP_KEY` | Secret | 建议 | 首次登录自动生成随机默认密码（有竞态）；**同时是登录限流的应急通道** |
| `BLOG_WRITE_TOKEN` | Secret | ⭕ | 只能走会话登录 |
| `BLOG_RATE_LIMIT_BINDING` | Secret（部署时读取） | ⭕ | 不注入边缘限流绑定；登录限流回退到 D1 计数 |
| `LOGIN_LIMITER` | Workers Rate Limiting 绑定 | ⭕ | 登录限流只在 D1 层生效（由 `BLOG_RATE_LIMIT_BINDING` 注入） |
| `AI` | Workers AI 绑定 | ⭕ | 所有 `/api/ai/*` 返回 404，前端隐藏入口 |
| `BLOG_AI_ENABLED` | 变量 | ⭕ | 有 `AI` + `DB` 时即视为开启 |
| `BLOG_AI_PUBLIC` | 变量 | ⭕ | 允许匿名生成摘要 |
| `R2_ACCESS_KEY_ID` | Secret | ⭕ | 上传接口 503 |
| `R2_SECRET_ACCESS_KEY` | Secret | ⭕ | 上传接口 503 |
| `R2_ENDPOINT` | Secret | ⭕ | 上传接口 503 |
| `R2_BUCKET` | Secret | ⭕ | 音乐回退到媒体桶 |
| `R2_PUBLIC_BASE` | Secret | ⭕ | 同上 |
| `R2_MEDIA_BUCKET` | Secret | ⭕ | 图片上传 503 |
| `R2_MEDIA_PUBLIC_BASE` | Secret | ⭕ | 同上 |

`BLOG_AI_ENABLED` / `BLOG_AI_PUBLIC` **不由工作流写入**，需要你自己在 Worker 上设置：

```bash
npx wrangler secret put BLOG_AI_ENABLED --name kejiland
```

---

## 16. 免费额度与成本

以下是 Cloudflare 官方定价页的免费额度（Free 计划），个人博客基本用不完：

| 服务 | 免费额度 | 对本项目意味着 |
| --- | --- | --- |
| **Workers 请求** | 100,000 次/天 | 约 300 万次/月。**静态资源请求免费且不限量**，只有真正进 Worker 的 `/api/*` 计数 |
| **Workers CPU** | 每次调用 10 毫秒 | 本项目的接口都是简单的 D1 查询/写入，远低于此 |
| **KV 读取** | 100,000 次/天 | 限流与去重都在这里 |
| **KV 写入** | 1,000 次/天 | 每次评论/点赞/浏览各占 1～2 次写入 —— **这是最容易先撞到的额度** |
| **KV 存储** | 1 GB | 只存计数和小缓存，占用极小 |
| **D1 读取行数** | 5,000,000 行/天 | 文章列表、评论列表等查询 |
| **D1 写入行数** | 100,000 行/天 | 发文章、发评论、点赞 |
| **D1 存储** | 5 GB（账号总量） | 纯文本文章，够写几万篇 |
| **R2 存储** | 10 GB-月 | 约 3,000 张 3 MB 图片，或 300 首 30 MB 音频 |
| **R2 A 类操作** | 1,000,000 次/月 | 上传/列举对象 |
| **R2 B 类操作** | 10,000,000 次/月 | 读取对象 |
| **R2 下行流量** | **免费** | 播放音乐、显示图片都不花钱（这是选 R2 的核心理由） |
| **Workers AI** | 约 10,000 Neurons/天 | 足够数千次摘要级调用，超出约 $0.011/千 Neurons |

**额度用完了会怎样？** 不是扣钱，而是**该类型操作直接失败**（例如 KV 写入超额后限流计数不再生效）。如果你担心，可以升级到 Workers Paid（$5/月起），额度会大幅提高。

参考：
- [Workers 定价与额度](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)
- [KV 定价](https://developers.cloudflare.com/kv/platform/pricing/)
- [R2 定价](https://developers.cloudflare.com/r2/pricing/)
- [缓存清除的可用性与限额](https://developers.cloudflare.com/cache/how-to/purge-cache/)

---

## 17. 安全建议

| 建议 | 做法 |
| --- | --- |
| Token 最小权限 | 安装密钥、R2 凭据、部署 Token 各自独立，别用一把万能钥匙 |
| 配置安装密钥 | `BLOG_ADMIN_SETUP_KEY` 一定要填，避免被人抢先初始化；它同时是登录限流的**应急通道**，忘了填就等于少了一条保命入口 |
| 加固登录入口 | 按 [第 9 节](#9-加固后台登录入口可选强烈推荐) 用 Cloudflare Access 或限流规则把 `/api/admin/login` 挡在边缘 |
| 别用全局长锁定 | 对「只有一个管理员」的系统，全局长锁定防不住攻击者（他换 IP 继续），却能被他用来把你锁在门外；本项目用「三层短冷却 + 应急通道」替代 |
| 定期轮换 | 怀疑泄露就重新创建 Token / R2 凭据，更新 Secret 后**重新部署** |
| 不要把密钥写进仓库 | 本项目所有敏感值都走 GitHub Secrets / Worker Secret；`wrangler.toml` 里只有 `{env.X}` 占位符 |
| 密码要够长 | 云端模式要求 **至少 8 位**；尽量用密码管理器生成 |
| 保护 R2 桶 | CORS 只放行你自己的域名；不要图省事写 `"AllowedOrigins": ["*"]` |
| 留意 AI 隐私 | 开启 AI 会把文章/评论明文发给模型，敏感内容请关闭 |
| 备份数据 | 定期在 D1 Console 里导出，或把文章导出为 `posts.js` / Markdown 存本地 |

---

## 18. 附：常用命令速查

```bash
# 登录 / 查看账号
npx wrangler login
npx wrangler whoami

# D1
npx wrangler d1 create blog                                   # 创建数据库
npx wrangler d1 list                                          # 列出数据库
npx wrangler d1 execute blog --remote --command "SELECT COUNT(*) FROM posts"
npx wrangler d1 execute blog --remote --file=./migrations/0015_hot_path_indexes.sql

# KV
npx wrangler kv namespace create BLOG
npx wrangler kv namespace list

# 本地开发（用本地模拟的 D1/KV，不碰线上数据）
npx wrangler dev -c wrangler.workers.toml

# 部署
npx wrangler deploy -c wrangler.workers.toml

# 查看线上日志
npx wrangler tail --name kejiland

# 运行时 Secret（改完不用重新部署）
npx wrangler secret put BLOG_AI_ENABLED --name kejiland
npx wrangler secret list --name kejiland
```

> 本地 `wrangler dev` 用 `wrangler.workers.toml` 时会遇到 `{env.BLOG_KV_ID}` 占位符问题：
> 临时把它替换成真实 id，或改用 `wrangler dev --local` 并接受绑定报错（本地调试静态页面完全够用）。

---

<p align="center">
  配置过程中卡住了？欢迎到 <a href="https://github.com/kejiland/qingyu-blog/issues">Issues</a> 提问，附上 Actions 日志或接口返回，会更快定位。
</p>
