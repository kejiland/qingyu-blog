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
| 管理员初始化 | `BLOG_ADMIN_SETUP_KEY` 可选：配置后用 X-Setup-Key 显式初始化（防抢注），未初始化登录一律 403；未配置回退旧行为——首次登录自动生成随机默认密码（mustChange=true，存在先到先得竞态，全新部署建议配置密钥） |
| 安全响应头 | 所有 HTTP 响应统一携带 CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / COOP（Workers 部署全量生效；Pages 纯静态资源由托管方直接返回，API 响应始终生效） |
| 文章加密 | 接口预留 `enc` / `protected` 字段（可导入外部加密文章），编辑器暂未开启端到端加密 UI |
| 评论安全 | XSS 转义 + SQL 注入参数化 + 频率限制 + 重复发送拦截 |

---

> 英文版本见 [SECURITY_EN.md](SECURITY_EN.md)。
