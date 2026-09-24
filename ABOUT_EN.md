> 🌐 **English** · [中文](ABOUT.md)

# Qingyu'Blog

> **Zero framework · Zero build · Zero dependency — a personal blog you can use by double-clicking index.html**

---

## What It Is

A lightweight personal blog system written in **pure vanilla JavaScript**. No React, no Vue, no Webpack — open `public/index.html` and start writing.

It runs in two modes:

- **Static mode** — double-click and go, data lives in browser localStorage, zero configuration
- **Cloud mode** — deploy to Cloudflare Workers + D1, data lives in a cloud database, ready for multiple visitors

---

## Core Features

| Feature | Description |
|------|------|
| 🚀 **Zero barrier** | No Node.js, no `npm install` — double-click and it runs |
| 💰 **Zero cost** | The free tiers of Cloudflare Workers + D1 are more than enough for a personal blog |
| 📦 **Zero dependency** | Not a single third-party library; a controlled codebase that loads extremely fast |
| 🔄 **Zero lock-in** | Posts are Markdown, so you can migrate to any platform at any time |
| 🌐 **Multilingual** | Chinese / English / 日本語 / 한국어 / हिन्दी built in, with automatic browser-language detection |
| 🎨 **Responsive** | Fully adapted to phone / tablet / desktop, on both the public site and the admin panel |
| 🔒 **Secure** | PBKDF2-SHA256 salted password hashing, session-token authentication, login throttling, security response headers (CSP / nosniff / frame protection) |
| ✍️ **Markdown editor** | Live preview, toolbar, word count, automatic draft saving |
| 💬 **Comment system** | Nested replies, comment moderation, rate limiting |
| 🌙 **Dark mode** | One-click toggle, serif-typography aesthetics with four accents |

---

## Tech Stack

```
Frontend: vanilla JavaScript (no framework)
Backend: Cloudflare Pages Functions / Workers
Database: Cloudflare D1 (SQLite)
Styling: pure CSS (serif stack + responsive)
Deploy: GitHub Actions → Cloudflare automatic deployment
```

---

## Quick Start

**Try it locally (30 seconds):**

```bash
git clone https://github.com/kejiland/blog.git
cd blog
# Just double-click public/index.html
# Or start a local server
python -m http.server 8080 -d public
```

Open `http://localhost:8080/admin`, set a password and start writing.

**Cloud deployment (recommended):**

1. Sign up for a [Cloudflare](https://dash.cloudflare.com/sign-up) account
2. Create a D1 database and a KV namespace
3. Configure GitHub Secrets
4. Push to the `main` branch and GitHub Actions deploys automatically

See the deployment guide in the [README](README.md) for details.

---

## Project Structure

```
public/           → the site itself (public site + admin + styles + i18n)
functions/        → Cloudflare API (posts / comments / stats / settings)
migrations/       → D1 database migration scripts
worker.js         → Workers entry point
.github/          → automatic deployment workflows
```

---

## License

[MIT License](LICENSE) — free to use, modify and distribute.

---

*Built with vanilla JavaScript and ❤️*
