> 🌐 **中文** · [English](DEPLOYMENT_SECRETS_GUIDE_EN.md)

# GitHub Actions Secrets 与 R2 配置指南

本文面向第一次部署本项目的用户，说明 GitHub Actions 中每个 Secret 在哪里获取、应该如何填写，以及 `qingyu-music`、`qingyu-media` 两个 R2 桶使用共用 Token 或单独 Token 时的区别。

> 📘 **更完整的新手教程**：账号注册、D1 / KV 创建、API Token 权限勾选、R2 CORS 与自定义域名、Workers AI、绑定域名、部署后自检、故障排查速查表、免费额度，都在
> **[CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md)**。本文可视为其中「Secrets 与 R2 令牌」这一部分的详解。

> 结论先说：当前版本只需要一组 R2 S3 凭据。新手最稳妥的做法是创建一个同时拥有两个桶“对象读和写”权限的共用 Token。当前工作流和签名代码尚未读取两套独立的 R2 凭据。

对本次音乐上传修复而言，GitHub Secret 名称没有变化，Cloudflare 桶名、公开域名和现有 Token 权限也无需因为代码修复而改变。需要确认的是：当前 `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 所对应的 Token，必须能写入音乐上传实际使用的目标桶。

## 1. 先分清四类配置

| 配置 | 放在哪里 | 用途 |
| --- | --- | --- |
| GitHub Actions Secrets | GitHub 仓库的 `Settings -> Secrets and variables -> Actions -> Secrets` | 当前工作流只读取这里，名称必须完全一致 |
| GitHub Actions Variables | 同一个页面的 `Variables` 标签 | 当前工作流不读取，填在这里不会生效 |
| Cloudflare Account API Token | 作为 `CLOUDFLARE_API_TOKEN` 填入 GitHub Secrets | 供 Wrangler 部署 Worker、执行 D1 迁移等 |
| R2 S3 凭据 | Access Key ID 和 Secret Access Key 分别填入 `R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` | 供 Worker 给浏览器签发 R2 直传地址 |

最容易混淆的是 Cloudflare API Token 和 R2 S3 凭据：

- Cloudflare API Token 是 `CLOUDFLARE_API_TOKEN`，通常以普通令牌字符串形式显示。
- R2 S3 凭据由 R2 API 令牌生成，包含一对 `Access Key ID` 和 `Secret Access Key`，分别对应两个不同的 GitHub Secret。

## 2. 当前版本必须知道的五个规则

1. 所有配置都要添加到 GitHub `Secrets`，不要添加到 `Variables`。
2. 当前只有一组 R2 凭据：`R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY`。
3. `R2_BUCKET` 不能为空。工作流只有在 R2 凭据、Endpoint、`R2_BUCKET` 都存在时，才会把 R2 配置写入 Worker。
4. 当前音乐上传优先使用 `R2_BUCKET`。只有音乐桶名或音乐公开域名未配置时，才会回退到 `R2_MEDIA_BUCKET`。
5. 修改 GitHub Secret 后必须重新运行部署工作流，Worker 运行时 Secret 才会更新。

这些行为来自：

- [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
- [functions/_lib/music.js](functions/_lib/music.js)
- [functions/_lib/media.js](functions/_lib/media.js)

## 3. 在 GitHub 中添加入口

1. 打开仓库首页。
2. 进入 `Settings`。
3. 左侧选择 `Secrets and variables -> Actions`。
4. 选择 `Secrets` 标签，点击 `New repository secret`。
5. 填写名称和值，点击 `Add secret`。
6. 重复添加本文列出的所有 Secret。

填写时注意：

- 名称必须区分大小写，例如必须是 `R2_MEDIA_BUCKET`。
- 值只填内容，不要写 `R2_MEDIA_BUCKET=...`。
- 通常不要给值加引号。
- 保存后无法再次查看原值，只能重新设置。
- 当前工作流没有指定 GitHub Environment，因此优先使用仓库级 Repository secrets。

## 4. 必填 Secrets

这四个缺失时，部署会直接停止。

| Secret | 应填写的内容 | 示例格式 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Account API Token | 在 Cloudflare 创建后复制完整 Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID | `a1b2c3d4e5f678901234567890abcdef` |
| `BLOG_D1_ID` | D1 数据库 ID，不是数据库名 | `0fa366ac-f04a-4be2-8e11-5adc6ee6d686` |
| `BLOG_KV_ID` | KV Namespace ID | 32 位十六进制字符串 |

`CLOUDFLARE_API_TOKEN` 至少需要以下权限：

| 权限范围 | 权限 | 原因 |
| --- | --- | --- |
| Account / Workers Scripts | Edit | 部署 Worker |
| Account / D1 | Edit | 部署前执行 D1 迁移 |
| Account / Workers KV Storage | Edit | 部署 KV 绑定 |
| Zone / Cache Purge | Purge | 可选；配置 `CF_ZONE_ID` 后用于发布即清缓存 |

如果使用 Cloudflare 提供的较宽泛“管理员读和写”Account API Token，也可以完成当前部署，但生产环境更建议按最小权限创建。

## 5. 推荐和可选 Secrets

| Secret | 是否必填 | 填写建议 |
| --- | --- | --- |
| `BLOG_ADMIN_SETUP_KEY` | 推荐 | 一串足够长的随机值。配置后首次初始化必须提供安装密钥，避免别人抢先初始化管理员 |
| `SITE_URL` | 推荐 | 站点正式地址，如 `https://www.example.com`。末尾不要加 `/` |
| `CF_ZONE_ID` | 可选 | 站点域名所在 Cloudflare Zone 的 ID；要和 `CLOUDFLARE_API_TOKEN` 的 Cache Purge 权限一起使用 |
| `PAGES_PROJECT_NAME` | 可选 | 实际含义是 Worker 名称。不填时使用仓库默认名称 `kejiland`。随意改名可能部署成另一个 Worker，新手建议不填 |
| `BLOG_WRITE_TOKEN` | 可选 | 旧式写入令牌。新部署通常不需要填写 |
| `BLOG_RATE_LIMIT_BINDING` | 可选 | 一个正整数（如 `1001`）。填了会启用 Worker 内的边缘登录限流，并让部署改用 wrangler 4.x（该绑定要求 ≥ 4.36）。账户不支持该绑定时删除此 Secret 重新部署即可恢复 |

### 5.1 部署后需要关心的三个运行时变量

这三个**不是 GitHub Secret**，但和上面那张表很容易混：

| 变量 | 谁写入 | 作用 | 不设置时 |
| --- | --- | --- | --- |
| `CF_API_TOKEN` | **工作流自动写入**（值取 `CLOUDFLARE_API_TOKEN`） | 发布文章后调 Cloudflare Cache Purge 接口清边缘缓存 | 不做缓存清除（功能不受影响，只是新内容可能延迟 1~5 分钟生效） |
| `BLOG_AI_ENABLED` | **需要你手动设置**（控制台 → Worker → Settings → Variables and Secrets，或 `npx wrangler secret put BLOG_AI_ENABLED --name kejiland`） | 设为 `0` / `false` / `off` 可整体关闭 AI | 绑定了 Workers AI 且 D1 存在时视为开启 |
| `BLOG_AI_PUBLIC` | 同上，手动设置 | 设为 `0` / `false` / `off` 可禁止匿名访客生成 AI 摘要（登录后仍可用） | 允许匿名生成 |

> 只有 `CF_API_TOKEN` 是工作流自动写的。另外两个不写也没问题：只要部署成功、`/api/ai/ping` 返回 `{"ok":true}`，就说明 AI 已可用。

## 6. R2 桶准备

建议准备两个桶：

| 用途 | 示例桶名 | 公开读取域名示例 |
| --- | --- | --- |
| 音乐 | `qingyu-music` | `https://music.example.com` |
| 图片媒体 | `qingyu-media` | `https://media.example.com` |

每个桶都要完成：

1. 在 Cloudflare R2 中创建桶。
2. 在桶的 `Settings -> Public access -> Custom Domains` 中绑定自己的域名。
3. 确认公开域名能直接读取桶内对象。
4. 在桶的 CORS 设置中允许站点来源执行上传。

浏览器直传时的 CORS 建议至少包含：

| 配置项 | 建议值 |
| --- | --- |
| Allowed Origins | `https://www.example.com`，替换成你的 `SITE_URL` |
| Allowed Methods | `PUT`、`GET`、`HEAD` |
| Allowed Headers | `Content-Type` |
| Expose Headers | `ETag` |
| Max Age | `3600` |

如果站点同时使用 `example.com` 和 `www.example.com`，两个来源都要加入 Allowed Origins。

## 7. R2 Secrets 总表

| Secret | 应填写的内容 |
| --- | --- |
| `R2_ACCESS_KEY_ID` | R2 API Token 生成结果中的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API Token 生成结果中的 Secret Access Key，只在创建时显示一次 |
| `R2_ENDPOINT` | `https://<CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | 音乐桶名，如 `qingyu-music` |
| `R2_PUBLIC_BASE` | 音乐桶公开读取地址，如 `https://music.example.com` |
| `R2_MEDIA_BUCKET` | 媒体桶名，如 `qingyu-media` |
| `R2_MEDIA_PUBLIC_BASE` | 媒体桶公开读取地址，如 `https://media.example.com` |

`R2_ENDPOINT` 的注意事项：

- 不包含桶名。
- 不以 `/` 结尾。
- 不是 R2 自定义公开域名。
- 正确示例：`https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com`

公开域名基址的注意事项：

- 必须以 `https://` 开头。
- 末尾不要加 `/`。
- 应填写绑定到对应桶的自定义域名，不要填 R2 S3 Endpoint。

## 8. 推荐方案：两个桶共用一个 Token

这是当前版本最适合新手的配置。

### 8.1 在 Cloudflare 创建共用 R2 Token

1. 进入 Cloudflare `R2 -> API -> Manage API Tokens`。
2. 创建新的 API Token。
3. 权限选择 `Object Read & Write`，中文界面通常是“对象读和写”。
4. 应用范围同时选择 `qingyu-music` 和 `qingyu-media`。
5. 如果界面只能选择单桶，则选择所有桶，或重新确认当前 Cloudflare 页面是否支持多选。不要继续使用只授权单个桶的旧 Token。
6. 创建后立即保存 Access Key ID、Secret Access Key 和 Endpoint。

不要修改或替换正在用于部署的 Cloudflare Account API Token。共用 R2 Token 是另一套 S3 凭据。

### 8.2 GitHub 中应填写的内容

| Secret | 示例 |
| --- | --- |
| `R2_ACCESS_KEY_ID` | 共用 R2 Token 的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | 共用 R2 Token 的 Secret Access Key |
| `R2_ENDPOINT` | `https://你的账户ID.r2.cloudflarestorage.com` |
| `R2_BUCKET` | `qingyu-music` |
| `R2_PUBLIC_BASE` | `https://music.example.com` |
| `R2_MEDIA_BUCKET` | `qingyu-media` |
| `R2_MEDIA_PUBLIC_BASE` | `https://media.example.com` |

### 8.3 当前代码的实际写入位置

共用 Token 能同时访问两个桶，当前版本会按用途写入各自的桶：

| 上传类型 | 当前实际目标桶 |
| --- | --- |
| 图片媒体 | `R2_MEDIA_BUCKET` |
| 音乐 | 优先写 `R2_BUCKET`；音乐桶配置不完整时回退 `R2_MEDIA_BUCKET` |

因此，共用 Token 必须同时拥有两个桶的对象读写权限。按本文配置后，音乐进入 `qingyu-music`，图片进入 `qingyu-media`。

## 9. 只使用一个桶

### 9.1 只启用图片媒体，不使用音乐上传

即使不启用音乐功能，也要填写 `R2_BUCKET` 和 `R2_PUBLIC_BASE`，否则工作流不会写入这组 R2 凭据。

| Secret | 填写值 |
| --- | --- |
| `R2_ACCESS_KEY_ID` | 有媒体桶对象读写权限的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | 对应 Secret Access Key |
| `R2_ENDPOINT` | R2 Endpoint |
| `R2_BUCKET` | `qingyu-media` |
| `R2_PUBLIC_BASE` | `https://media.example.com` |
| `R2_MEDIA_BUCKET` | `qingyu-media` |
| `R2_MEDIA_PUBLIC_BASE` | `https://media.example.com` |

### 9.2 只启用音乐，不使用图片媒体

| Secret | 填写值 |
| --- | --- |
| `R2_ACCESS_KEY_ID` | 有音乐桶对象读写权限的 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | 对应 Secret Access Key |
| `R2_ENDPOINT` | R2 Endpoint |
| `R2_BUCKET` | `qingyu-music` |
| `R2_PUBLIC_BASE` | `https://music.example.com` |
| `R2_MEDIA_BUCKET` | 不填写 |
| `R2_MEDIA_PUBLIC_BASE` | 不填写 |

此时音乐上传可用，图片媒体上传接口会返回 503。

### 9.3 两个功能共用一个桶

让音乐和图片都使用同一个桶：

| Secret | 填写值 |
| --- | --- |
| `R2_BUCKET` | `qingyu-media` |
| `R2_PUBLIC_BASE` | `https://media.example.com` |
| `R2_MEDIA_BUCKET` | `qingyu-media` |
| `R2_MEDIA_PUBLIC_BASE` | `https://media.example.com` |

Token 只需要拥有这个桶的对象读写权限。

## 10. 两个桶分别使用单独 Token

当前版本不支持直接在 GitHub 中配置两套 R2 凭据。

原因是：

- 工作流只读取 `R2_ACCESS_KEY_ID` 和 `R2_SECRET_ACCESS_KEY`。
- 所有上传和删除签名都使用这同一组凭据。
- `qingyu-music` Token 即使已经创建，也没有对应的 GitHub Secret 可以填写。

不要把两个 Token 拼成一个 JSON、文本或其他格式塞进现有 Secret。当前代码会把它当成普通 Access Key ID 或 Secret Access Key，签名仍会失败。

如果后续必须使用独立 Token，需要同时完成代码改造：

| 计划新增的 Secret | 用途 |
| --- | --- |
| `R2_MUSIC_ACCESS_KEY_ID` | 音乐桶 Access Key ID |
| `R2_MUSIC_SECRET_ACCESS_KEY` | 音乐桶 Secret Access Key |
| `R2_MEDIA_ACCESS_KEY_ID` | 媒体桶 Access Key ID |
| `R2_MEDIA_SECRET_ACCESS_KEY` | 媒体桶 Secret Access Key |

还需修改：

1. 部署工作流，让四组新值写入 Worker。
2. `presignPut`，根据目标桶选择对应 Access Key ID 和 Secret。
3. `sigv4AuthHeader`、`r2DeleteObject` 等删除签名逻辑。
4. 相关测试，覆盖两个桶分别上传和删除。

在这些改造完成前，推荐继续使用共用 Token。

## 11. 完整填写示例

以下只是格式示例，所有值都要替换成自己的真实值。

```text
CLOUDFLARE_API_TOKEN=你的Cloudflare部署Token
CLOUDFLARE_ACCOUNT_ID=a1b2c3d4e5f678901234567890abcdef
BLOG_D1_ID=0fa366ac-f04a-4be2-8e11-5adc6ee6d686
BLOG_KV_ID=0123456789abcdef0123456789abcdef
BLOG_ADMIN_SETUP_KEY=请生成一串足够长的随机值
SITE_URL=https://www.example.com
CF_ZONE_ID=0123456789abcdef0123456789abcdef

R2_ACCESS_KEY_ID=共用R2Token的AccessKeyID
R2_SECRET_ACCESS_KEY=共用R2Token的SecretAccessKey
R2_ENDPOINT=https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com
R2_BUCKET=qingyu-music
R2_PUBLIC_BASE=https://music.example.com
R2_MEDIA_BUCKET=qingyu-media
R2_MEDIA_PUBLIC_BASE=https://media.example.com
```

## 12. 部署后验证

1. 进入 GitHub 仓库的 `Actions`。
2. 选择 `Deploy to Cloudflare Workers`。
3. 点击 `Run workflow`，选择 `main` 后运行。
4. 等待部署成功。
5. 打开后台，分别上传一张图片和一个音频文件。
6. 点击公开地址确认文件能播放或显示。

常见问题：

| 现象 | 常见原因 |
| --- | --- |
| Actions 提示缺少必要 Secrets | 填到了 Variables，或名称拼写错误 |
| 图片或音乐上传返回 503 | R2 变量不完整；尤其检查 `R2_BUCKET` 是否为空 |
| 浏览器上传返回 403 | R2 Token 没有目标桶写权限、Endpoint 错误、Access Key 与 Secret 不匹配，或桶 CORS 不允许站点来源 |
| 上传成功但播放 404 | 公开域名未绑定到对应桶，或 `R2_PUBLIC_BASE` / `R2_MEDIA_PUBLIC_BASE` 填错 |
| 修改 Secret 后线上没变化 | 没有重新运行部署工作流 |
| 音乐仍写入媒体桶 | 检查 `R2_BUCKET`、`R2_PUBLIC_BASE` 是否都填写；音乐桶配置不完整时会回退媒体桶 |

## 13. 常见困惑：我该用哪一组 R2 令牌？

很多人在 Cloudflare 里会创建出多个 R2 令牌，然后不确定该把哪一个填进 GitHub。判断方法很简单：

| 情况 | 该填哪一个 |
| --- | --- |
| 你只创建了一个 R2 令牌，权限是「对象读和写」且同时覆盖两个桶 | ✅ 就填它，这是最推荐的方案 |
| 你创建了两个令牌，各自只授权一个桶 | ⚠️ 当前版本**只支持一组凭据**，无法分别填写。请改为创建一个同时授权两个桶的令牌（见第 8 节） |
| 你有一个只授权 `qingyu-media` 的旧令牌 | ⚠️ 它会让音乐上传 403。要么把它的权限改成同时覆盖两个桶，要么新建一个共用令牌 |
| 你有一个只授权 `qingyu-music` 的令牌 | ❌ 与本项目的共用凭据方案不匹配，不要填 |

填写与更新规则：

- 音乐会上传到 `R2_BUCKET`（须同时配置 `R2_PUBLIC_BASE`），图片会上传到 `R2_MEDIA_BUCKET`；
- 任何一项 Access Key ID / Secret Access Key 发生变化，都要**同步更新** GitHub 的 `R2_ACCESS_KEY_ID` 与 `R2_SECRET_ACCESS_KEY`，并**重新运行一次部署工作流**；
- 如果确实想让两个桶各自使用独立令牌，必须先完成第 10 节所述的代码与工作流改造，目前尚未支持。

## 14. 新手推荐配置清单

1. 创建 `qingyu-music` 和 `qingyu-media` 两个桶。
2. 给两个桶分别绑定公开自定义域名。
3. 创建一组同时拥有两个桶对象读写权限的共用 R2 Token。
4. 在 GitHub `Secrets` 中填写本文列出的全部名称。
5. 配置 `BLOG_ADMIN_SETUP_KEY` 和 `SITE_URL`。
6. 不填写 `PAGES_PROJECT_NAME`，沿用默认 Worker 名称。
7. 推送代码或在 Actions 中手动运行部署。
8. 部署完成后分别测试图片和音乐上传。
