> 🌐 **中文** · [English](ABOUT_EN.md)

# 轻语博客 · Qingyu'Blog

> **零框架 · 零构建 · 零依赖 —— 双击 index.html 就能用的个人博客**

---

## 它是什么

一个用**纯原生 JavaScript** 编写的轻量个人博客系统。没有 React、没有 Vue、没有 Webpack，打开 `public/index.html` 就能开始写文章。

支持两种运行模式：

- **静态模式** — 双击即用，数据存浏览器 localStorage，零配置
- **云端模式** — 部署到 Cloudflare Workers + D1，数据存云端数据库，支持多人访问

---

## 核心特性

| 特性 | 说明 |
|------|------|
| 🚀 **零门槛** | 不需要 Node.js，不需要 npm install，双击就能跑 |
| 💰 **零成本** | Cloudflare Workers + D1 免费额度足够个人博客使用 |
| 📦 **零依赖** | 不引入任何第三方库，代码量可控，加载极快 |
| 🔄 **零锁定** | 文章是 Markdown，随时可以迁移到任何平台 |
| 🌐 **多语言** | 内置中/英/日/韩/印地语，自动识别浏览器语言 |
| 🎨 **响应式** | 手机 / 平板 / 桌面全适配，前台 + 后台 |
| 🔒 **安全** | 密码 PBKDF2-SHA256 加盐哈希，会话令牌鉴权，登录限流锁定，安全响应头（CSP / nosniff / frame 防护） |
| ✍️ **Markdown 编辑器** | 实时预览、工具栏、字数统计、草稿自动保存 |
| 💬 **评论系统** | 支持嵌套回复、评论审核、频率限制 |
| 🌙 **深色模式** | 一键切换，四套衬线字体美学 |

---

## 技术栈

```
前端：原生 JavaScript（无框架）
后端：Cloudflare Pages Functions / Workers
数据库：Cloudflare D1（SQLite）
样式：纯 CSS（衬线字体 + 响应式）
部署：GitHub Actions → Cloudflare 自动部署
```

---

## 快速开始

**本地体验（30 秒）：**

```bash
git clone https://github.com/kejiland/blog.git
cd blog
# 双击 public/index.html 即可
# 或启动本地服务器
python -m http.server 8080 -d public
```

打开 `http://localhost:8080/admin`，设置密码后即可开始写作。

**云端部署（推荐）：**

1. 注册 [Cloudflare](https://dash.cloudflare.com/sign-up) 账号
2. 创建 D1 数据库和 KV 命名空间
3. 配置 GitHub Secrets
4. 推送到 `main` 分支，GitHub Actions 自动部署

详见 [README](README.md) 中的部署指南。

---

## 项目结构

```
public/           → 站点本体（前台 + 后台 + 样式 + 国际化）
functions/        → Cloudflare API（文章/评论/统计/设置）
migrations/       → D1 数据库迁移脚本
worker.js         → Workers 入口
.github/          → 自动部署工作流
```

---

## 许可证

[MIT License](LICENSE) — 自由使用、修改、分发。

---

*Built with vanilla JavaScript and ❤️*
