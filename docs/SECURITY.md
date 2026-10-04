> 🌐 **中文** · [English](SECURITY_EN.md)

# 安全策略 Security Policy

## 报告漏洞

如果你发现了安全漏洞，请**不要**通过公开的 GitHub Issue 报告。

请通过以下方式私信联系维护者，我们会尽快处理：

- GitHub: [@kejiland](https://github.com/kejiland)

## 安全措施

本项目内置多层安全防护：

| 层 | 机制 |
|---|---|
| 密码存储 | PBKDF2-SHA256 加盐哈希（100,000 次迭代），密码最少 8 位 |
| 会话管理 | 随机 Token，7 天有效期；登录时顺带清理过期会话 |
| 限流 | 同一 IP 连续失败 5 次锁定 15 分钟（仅信任 CF-Connecting-IP，不读可伪造的 X-Forwarded-For） |
| 管理员初始化 | `BLOG_ADMIN_SETUP_KEY` 可选：配置后用 X-Setup-Key 显式初始化（防抢注），未初始化登录一律 403；未配置回退旧行为——首次登录自动生成随机默认密码（mustChange=true，存在先到先得竞态，全新部署建议配置密钥）。改密前后台 API 一律返回 403 `PASSWORD_CHANGE_REQUIRED`，仅放行改密与登出 |
| 安全响应头 | 所有 HTTP 响应统一携带 CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / COOP（Workers 部署全量生效；Pages 纯静态资源由托管方直接返回，API 响应始终生效） |
| 文章加密 | 编辑器可开启正文加密：**AES-GCM-256 + PBKDF2-SHA256（10 万次迭代）纯前端加密**，明文不上传、服务器只存密文 `enc`；读者需输入密码在前端解密，密码不落库。后台编辑器可将密码记在本机浏览器（localStorage 明文）便于日后查看，公共电脑请勿使用 |
| 预览分享链接 | HMAC-SHA256 签名（密钥取 `BLOG_PREVIEW_SECRET`，未配置则由管理员密码哈希派生）+ 过期时间；**改密码即让所有已发出的链接失效**；预览页 `noindex`、不统计、不加载评论、响应 `no-store` |
| 评论反机器人 | 隐藏蜜罐字段（被填写即**静默丢弃**）+ 表单时间戳（提交不足 2 秒判为机器人）；HTTP 层仍有每 IP 频率限制与重复内容拦截 |
| 前端错误上报 | 公开接口 `/api/errors` 每 IP 每分钟最多 20 次；字段全部截断；按错误指纹聚合去重，最多保留 300 条，避免被刷爆 |
| Webmention | 必须**抓取来源页并校验其确实链接到本站文章**才收录（8 秒超时、200KB 上限、只收 HTML）；`target` 必须解析到本站已有文章 |
| 访问统计隐私 | 只记录由 Cloudflare 边缘按 IP 解析出的**两位国家码**与 UA 推断的设备信息，**不落原始 IP**；点赞/浏览去重用哈希 key |
| 第三方依赖本地化 | KaTeX / Mermaid / Smoji 全部自托管在 `public/libs/`，CSP 的 `script-src` 仍限 `'self'`，不引入任何第三方脚本 |
| 评论安全 | XSS 转义 + SQL 注入参数化 + 频率限制 + 重复发送拦截 |

---

> 英文版本见 [SECURITY_EN.md](SECURITY_EN.md)。
