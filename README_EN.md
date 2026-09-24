> 🌐 [中文](README.md) · **English**

<p align="center">
  <img src="screenshots/home.png" alt="Qingyu'Blog" width="100%" />
</p>

<h1 align="center">Qingyu'Blog</h1>

<p align="center">
  <b>Zero framework · Zero build · Zero dependency — a personal blog you can open by double-clicking</b>
</p>

<p align="center">
  <a href="https://www.2024921.xyz">
    <img src="https://img.shields.io/badge/Live%20Demo-www.2024921.xyz-blue?style=flat-square" alt="Demo" />
  </a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/Stack-Vanilla%20JS-orange?style=flat-square" alt="Vanilla JS" />
  <img src="https://img.shields.io/badge/Deploy-Cloudflare%20Workers-purple?style=flat-square" alt="Cloudflare Workers" />
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

## 📑 Table of Contents

- [📖 About](#-about)
- [✅ Why Choose This](#-why-choose-this)
- [🚀 Quick Start](#-quick-start)
- [✨ Features](#-features)
- [🖼️ Screenshots](#️-screenshots)
- [📁 Directory Structure](#-directory-structure)
- [☁️ Cloudflare Services](#️-cloudflare-services)
- [⚙️ Configuration](#️-configuration)
- [🛡️ Security](#️-security)
- [🧪 Tests](#-tests)
- [⚠️ Known Limitations](#️-known-limitations)
- [📚 Documentation Index](#-documentation-index)
- [📄 License](#-license)

## 📖 About

Qingyu'Blog is a personal blog system written in **pure vanilla JavaScript** — no frameworks (React / Vue / Svelte), no build tools (Webpack / Vite), and no third-party runtime dependencies.

It runs in two modes:

| Mode | Description | Use Case |
| --- | --- | --- |
| **Static** | Open `public/index.html` directly, data in browser localStorage | Local writing, quick preview |
| **Cloud** | Deploy to Cloudflare Workers + D1, data in a cloud database | Production, public access |

The entire site lives in `public/`: frontend `index.html` + `style.css` + `app.js` + `posts.js` + `music-player.js` + `bg-anim.js`, admin `admin.js` + `admin.css`, i18n `i18n.js` + `locales/`.

> 💡 The root `index.html` is just a redirect that opens `public/index.html` (the Workers / Pages deploy directory). Opening `public/index.html` locally works the same.

> 🆕 **Deploying to Cloudflare for the first time?** See the **[Cloudflare Setup Guide (Beginner)](CLOUDFLARE_SETUP_GUIDE_EN.md)** — a full walkthrough from sign-up, creating D1/KV, creating API tokens, R2 buckets and CORS, to binding a custom domain and initializing the admin account.

---

## ✅ Why Choose This

| Advantage | Description |
| --- | --- |
| **Zero barrier** | No Node.js, no npm, no build step — just open the file |
| **Zero cost** | The free tiers of Workers, D1, KV and R2 are more than enough for a personal blog |
| **Zero dependency** | No third-party runtime library at all; small, auditable, extremely fast |
| **Zero lock-in** | Posts are Markdown, data lives in standard SQLite (D1) — trivially portable |
| **Dual mode** | Static export + cloud API from the same codebase |
| **Responsive** | Both the public site and the admin panel adapt to phone / tablet / desktop |
| **Multilingual** | Chinese / English / 日本語 / 한국어 / हिन्दी, auto-detected browser language |
| **Serif aesthetics** | System serif body (Songti) + Fangsong quote ornaments, **zero webfont downloads**; four-season canvas background animation |
| **Secure** | PBKDF2-SHA256 salted password hashing (100k iterations), session tokens, login-failure lockout, CSP and other security headers |
| **AI enhanced** | Workers AI powers post summaries, a writing assistant, comment digests and spam screening; everything hides itself gracefully when unavailable |

---

## 🚀 Quick Start

### Option 1: Local Static (no install)

```bash
git clone https://github.com/kejiland/qingyu-blog.git
cd qingyu-blog
```

Open `public/index.html`, or start a local server:

```bash
# Python
python -m http.server 8080 -d public

# Node.js
npx serve public
```

Go to `http://localhost:8080/admin`, set a password and start writing.

### Option 2: Cloudflare Workers (recommended for production)

You only need to do four things — **create a D1 database → create a KV namespace → create an API token → put them in GitHub Secrets** — and let GitHub Actions handle the rest.

```bash
# Log in to Cloudflare
npx wrangler login

# Create the D1 database (posts / comments / stats / passwords / settings)
npx wrangler d1 create blog
# Note the database_id (a UUID — not the database name, not a KV id)

# Create the KV namespace (rate limiting / dedup / AI cache)
npx wrangler kv namespace create BLOG
# Note the id (32 hex characters)
```

Add these under **Settings → Secrets and variables → Actions → Secrets** in your repository:

**Required (the deploy stops if any is missing):**

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare account API token (needs *Edit* on Workers Scripts / D1 / KV) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID (visible in the dashboard sidebar or in the URL) |
| `BLOG_D1_ID` | D1 database ID (**UUID format**) |
| `BLOG_KV_ID` | KV namespace ID (**32 hex characters**) |

**Recommended:**

| Secret | Description |
| --- | --- |
| `BLOG_ADMIN_SETUP_KEY` | Setup key. When set, only someone holding this key can initialize the admin password (**prevents someone else claiming your instance**). When unset, the first login auto-generates a random default password (first-come-first-served race). |
| `SITE_URL` | Public site URL, e.g. `https://blog.example.com` (tightens CORS / RSS / Sitemap; **no trailing slash**) |

**Optional:**

| Secret | Description |
| --- | --- |
| `CF_ZONE_ID` | Zone ID of your custom domain; combined with the *Cache Purge* permission it purges the edge cache on publish |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` | R2 S3-compatible credentials (audio and images **share** one pair) |
| `R2_BUCKET` / `R2_PUBLIC_BASE` | **Music bucket**: bucket name + public domain (**must not be empty**, otherwise no R2 config is written at all) |
| `R2_MEDIA_BUCKET` / `R2_MEDIA_PUBLIC_BASE` | **Media bucket**: bucket name + public domain |
| `PAGES_PROJECT_NAME` | Misleading name: it actually overrides the **Worker name** (`--name`). Leave empty to keep `kejiland` from `wrangler.workers.toml`. Beginners should not set it. |
| `BLOG_RATE_LIMIT_BINDING` | Enables in-Worker edge rate limiting for login (a positive integer namespace, e.g. `1001`); switches deploys to wrangler 4.x. Remove it if your account does not support the binding |
| `BLOG_WRITE_TOKEN` | Legacy write token, not needed for new deployments |

Push to `main` (or run the workflow manually) and GitHub Actions will:

1. ✅ Install the Wrangler CLI
2. ✅ Run three test suites (`smoke-test.js` 77 cases / `gb-verify.js` 18 / `search-verify.js` 13 — a failure aborts the deploy)
3. ✅ Validate the required secrets and ID formats
4. ✅ Apply D1 migrations (three-layer idempotency: `schema_migrations` ledger + column pre-check + tolerant error matching)
5. ✅ Deploy the Worker
6. ✅ Write runtime secrets (setup key / R2 credentials / cache-purge token — only when configured)

After deployment, open `https://your-domain/admin`: with a setup key configured, click "First deploy? Initialize with setup key"; without one, log in once with any password, use the random default password shown on screen, then change it immediately.

**Complete step-by-step Cloudflare walkthrough** (dashboard paths, permission tables, R2 CORS JSON, troubleshooting table, free-tier limits) → **[CLOUDFLARE_SETUP_GUIDE_EN.md](CLOUDFLARE_SETUP_GUIDE_EN.md)**.
For the GitHub Secrets / R2 token distinction only → **[DEPLOYMENT_SECRETS_GUIDE_EN.md](DEPLOYMENT_SECRETS_GUIDE_EN.md)**.

#### Migrate from KV to D1 (legacy data)

If you previously used KV single-key storage, move the data into D1:

```bash
# Local (requires CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / BLOG_KV_ID / BLOG_D1_ID)
node scripts/migrate-kv-to-d1.mjs --dry-run   # preview SQL only
node scripts/migrate-kv-to-d1.mjs             # write to D1
```

Or trigger the `Migrate KV to D1` workflow manually from the Actions tab (`dry-run` / `migrate`).

---

## ✨ Features

### Frontend

| Feature | Description |
| --- | --- |
| Real-path routing | No hashes: `/`, `/archive`, `/tags`, `/about`, `/guestbook`, `/posts/<id>/`, `/admin`, `/write` — no 404 on refresh |
| Markdown renderer | Headings / tables / blockquotes / lists / fenced code (syntax highlighting for js, ts, python, bash, css) / inline code / bold, italic, strikethrough / images / links. Input is escaped first; raw HTML never executes |
| Table of contents | Auto-numbered (1 / 1.1 / 1.2 …), anchor links, collapsible, smooth scrolling |
| Reading experience | Reading-time estimate, view count, likes (per-browser dedup), pin badge, **copy link**, back-to-top |
| Comments | Cloud D1 global comments + moderation mode; **up to 3 levels of nested replies**; orphaned replies are promoted; deleting a post cascades to its comments / likes / views; **duplicate blocking** (same section + author + content → 409) and rate limiting (5 per minute per IP) |
| Guestbook | Reachable at `/guestbook` with two sections (messages / feature ideas), cloud-stored, reusing the comment security pipeline; supports `Ctrl/⌘ + Enter` |
| Site search | Live matching over title / tags / excerpt / body; results show the **full sentence around the keyword** with **highlighting**, plus an empty state |
| Tags & archive | Home tag filter (`?tag=`, clearable), tag cloud with counts, archive grouped by year → month |
| Featured posts | Auto-recommended below the comments (**likes×3 + views×1 + comments×5**, top 2, excluding the current post and drafts) |
| RSS / Sitemap | `/feed.xml` and `/sitemap.xml` generated dynamically from D1; drafts and encrypted posts excluded |
| Prev / Next | Hides the empty slot when only one direction exists |
| Card list | Cover thumbnails (from `cover` or the first image in the body), pin badge, tags pinned to the bottom, loading skeleton, pagination (`?page=`) |
| **Dark / light theme** | One-click toggle, follows the system preference, no flash of unstyled content; the top bar deepens its shadow as you scroll |
| **Accent colours** | **4 accents**: Terra (赭橙) / Indigo (黛蓝) / Bamboo (竹青) / Dusk (凝夜紫). Icon button with a swatch popover on desktop, native select on mobile; each accent also retints backgrounds and borders |
| **Multilingual UI** | Chinese / English / 日本語 / 한국어 / हिन्दी (494 keys each), auto-detect + manual switch (🌐 popover with SVG flags on desktop, native select on mobile) |
| **Background animation** | Hand-drawn canvas particles for the four seasons (spring petals / summer motes / autumn leaves / snow); home page only, pauses when the tab is hidden; on by default on desktop, off on touch devices, toggleable from the top bar, respects `prefers-reduced-motion` |
| **Smoji picker** | Emoji picker in the comment box, guestbook and editor, lazily loaded, with inline rendering in content |
| **AI post summary** | One-click summary on any post page (30-day per-post cache); the entry hides itself when AI is unavailable |
| **Music player** | Floating note button at the bottom right that stays **tucked outside the window with just an arc showing**, sliding out on hover or click. The panel has track info, a draggable seek bar, prev / play-pause / next, volume and a playlist (active item highlighted with an equaliser animation). Auto-advance, **remembers the last track and position**, volume persisted, restores after refresh but **never plays automatically**; hides entirely when there are no tracks and collapses on admin routes; its CSS and JS stay off the critical path |
| Serif typography | Body / headings / display all use the system Songti stack, quote ornaments use Fangsong; iOS uses native Songti / Fangsong; **no webfont is ever downloaded** |
| A11y details | Popovers carry `role` / `aria-*`; icon buttons have `title` / `aria-label`; images use `loading="lazy"` with a fade-in; CSP and other security headers |

### Admin Panel

The admin panel is a separate bundle (`admin.js` + `admin.css`) lazy-loaded only on admin routes, so it costs the public site nothing.

| Feature | Description |
| --- | --- |
| Routes | `/admin` (dashboard), `/admin/posts`, `/admin/posts/new`, `/admin/posts/:id/edit`, `/admin/tags`, `/admin/comments`, `/admin/comments/pending`, `/admin/media`, `/admin/music`, `/admin/settings`; unknown `/admin/*` falls back to the dashboard |
| Login gate | Cloud: password login or "First deploy? Initialize with setup key" (via the `X-Setup-Key` header). When login throttling kicks in, the page automatically reveals a **"Rate limited? Sign in with the setup key"** break-glass entry (it skips only the throttle, never the password check). Static: local gate. Any 401 shows "session expired" and returns to the login page |
| Dashboard | **6 stat cards** (total posts / published / drafts / pinned / total comments / pending) + **two 30-day line charts** (inline SVG, hover preview and click-to-pin values) + latest posts / latest comments (auto-scrolling, pauses on hover) |
| Post management | Keyword search (title + tags, 250 ms debounce), status filter (all / published / draft), 10 per page, optimistic pin toggle, **seamless delete** (row fades out; comments and stats are cascaded server-side) |
| Editor | Title / tags / cover (pick from the media library) / pinned / Markdown body; **live preview**, auto-growing input, toolbar (bold, italic, heading, quote, code, list, link, image, emoji); save as draft or publish |
| **AI writing assistant** | One click for title suggestions / polish / translation (5 target languages); apply the result to the title, replace the body, append it, or copy it. The whole bar is not rendered when AI is unavailable |
| Comment management | Global list (author / content / post / time / status / actions), keyword search, status filter, **approve** (badge updates in place, no table reload), delete (row fades out); the sidebar shows a live pending-count badge |
| **AI comment tools** | Summarize recent comment threads (1-hour cache) and screen a single comment for spam (red / green verdict with a reason) |
| Tag management | Tag list derived from the posts in real time; rename / delete with bulk updates |
| Media library | Image upload (browser **direct to R2** via a presigned URL, metadata in D1), grid preview, copy URL, delete (removes the R2 object first, then the D1 row); static / non-cloud environments show an explanatory card |
| **Music management** | Audio upload (direct to R2 with a percentage progress bar, drag-and-drop supported); **filename parsing fills in "song - artist"**; inline per-row preview (play / pause / seek / elapsed and total time), rename, delete (synced with the R2 object); inner-scrolling list card with a sticky table header |
| Blog settings | 5 tabs: **Site basics** (name / description / avatar logo / about-page content / footer copyright / footer notice / moderate new comments), **Profile** (name / bio / avatar / email), **Navigation menu** (visual editor with add / remove / sub-items / reset), **Footer navigation**, **Friend links** |
| Top bar | Sidebar collapse, breadcrumb, preview site, 🌐 language switch, account menu (profile / change password / logout) |
| One-click export | **Static mode only**: the editor's "export all" writes `posts.js` + `feed.xml` + `sitemap.xml` for you to overwrite `public/` with. Cloud mode generates RSS/Sitemap server-side, so there is no export entry there |
| Responsive | Fixed sidebar on desktop (collapsible to a 72 px icon rail) / drawer navigation on mobile; breakpoints at 1100 / 991 / 640 / 420 px |

---

## 🖼️ Screenshots

### Public site

| Home (light · tag filter, pin badge, cover thumbnails) | Post detail (TOC, tables, code blocks) | Search (keyword highlighting + sentence context) |
| --- | --- | --- |
| ![Home](screenshots/home.png) | ![Post detail](screenshots/detail.png) | ![Search](screenshots/search.png) |

| Tag cloud | Archive (grouped by year and month) | Guestbook |
| --- | --- | --- |
| ![Tags](screenshots/tags.png) | ![Archive](screenshots/archive.png) | ![Guestbook](screenshots/guestbook.png) |

| Home (dark) | Post (dark) | Mobile |
| --- | --- | --- |
| ![Home dark](screenshots/home-dark.png) | ![Post dark](screenshots/detail-dark.png) | ![Mobile](screenshots/mobile.png) |

| Music player (panel opened from the bottom-right button) |
| --- |
| ![Music player](screenshots/music-player.png) |

### Admin panel

| Login gate (setup key supported) | Dashboard (6 stat cards + 30-day trends) | Dark mode |
| --- | --- | --- |
| ![Login](screenshots/admin-gate.png) | ![Dashboard](screenshots/admin.png) | ![Admin dark](screenshots/admin-dark.png) |

| Post management | Editor (live Markdown preview + AI assistant) | Comment management |
| --- | --- | --- |
| ![Posts](screenshots/admin-posts.png) | ![Editor](screenshots/write.png) | ![Comments](screenshots/admin-list.png) |

| Media library | Music management (inline preview, sticky header) | Blog settings | Tag management |
| --- | --- | --- | --- |
| ![Media](screenshots/admin-media.png) | ![Music](screenshots/music-admin.png) | ![Settings](screenshots/admin-settings.png) | ![Tags](screenshots/admin-tags.png) |

### Serif typography preview

| Home (light) | Post (light) | Post (dark) |
| --- | --- | --- |
| ![Home light](screenshots/font-preview/home-light.png) | ![Post light](screenshots/font-preview/article-light.png) | ![Post dark](screenshots/font-preview/article-dark.png) |

> 🔧 Screenshots are generated by `scripts/screenshots/capture.mjs`, which drives headless Chrome against a local demo server serving **the real `public/` code** with sample posts, comments, media and music. Regenerate with:
> `npm i -D puppeteer-core && node scripts/screenshots/capture.mjs`

---

## 📁 Directory Structure

```
├── public/                            # Site assets (static, the deploy directory)
│   ├── index.html                     # Entry point (open locally / deploy root)
│   ├── config.js / config.min.js      # Site config (mode / site URL / footer / ads)
│   ├── style.css / style.min.css      # Site styles (light+dark, 4 accents, responsive, serif stack)
│   ├── app.js / app.min.js            # Frontend logic (routing / Markdown / search / comments / guestbook / stats / i18n / AI summary)
│   ├── admin.js / admin.min.js        # Admin SPA (lazy-loaded)
│   ├── admin.css / admin.min.css      # Admin styles (responsive)
│   ├── music-player.js / .min.js      # Global music player (FAB + panel + playlist + progress memory)
│   ├── music-player.css / .min.css    # Player styles (off the critical path)
│   ├── bg-anim.js / bg-anim.min.js    # Four-season canvas background animation
│   ├── i18n.js / i18n.min.js          # i18n module (zh/en/ja/ko/hi, built-in Chinese fallback)
│   ├── posts.js / posts.min.js        # Static-mode post data (generated by "Export posts.js")
│   ├── locales/                       # Language packs (zh-CN / en / ja / ko / hi, 494 keys each)
│   ├── flags/                         # SVG flags for the language switcher (cn / gb / jp / kr / in)
│   ├── libs/smoji/                    # Smoji emoji picker (lazy-loaded)
│   ├── fonts/dreamserif/              # ⚠️ Legacy local serif shards (no longer loaded; see Known Limitations)
│   ├── robots.txt                     # Crawler rules (blocks admin, declares the sitemap)
│   ├── llms.txt                       # Site description for LLMs / agents
│   ├── ads.txt                        # Ads declaration (optional, pairs with config.js ads)
│   ├── _headers                       # Cloudflare response headers (CSP / security / per-path caching)
│   ├── _redirects                     # Cloudflare routes (SPA fallback + /public prefix 301)
│   ├── .well-known/                   # ard.json (ARD v0.91) and ai-catalog.json
│   # feed.xml / sitemap.xml are generated dynamically in cloud (see functions/)
├── functions/                         # Cloudflare API (shared by Pages Functions / Workers)
│   ├── api/
│   │   ├── posts.js                   # List / create posts
│   │   ├── posts/[id].js              # Single post (GET / PUT / DELETE, cascading cleanup)
│   │   ├── posts/[id]/comments.js     # Post comments (GET / POST, 3-level nesting)
│   │   ├── posts/[id]/comments/[cid].js  # Delete a single comment
│   │   ├── posts/[id]/stats.js        # Views / likes
│   │   ├── comments.js                # Global comment list (admin)
│   │   ├── comments/[id].js           # Approve / delete a comment
│   │   ├── ai/{ping,summary,assist,comments}.js  # AI probe / summary / assistant / comment tools
│   │   ├── media.js                   # Media list / register metadata (http(s) only)
│   │   ├── media/upload-url.js        # Sign an R2 presigned upload URL (direct image upload)
│   │   ├── media/[id].js              # Delete media (R2 object first, then the D1 row)
│   │   ├── settings.js                # Site settings
│   │   ├── stats/trend.js             # Trend data for the last N days (1–90, default 30)
│   │   ├── site-files/index.js        # List / save site artifacts
│   │   ├── site-files/[name].js       # Download a site artifact
│   │   ├── admin/{setup,login,logout,password}.js  # Init / login / logout / change password
│   │   ├── feed.xml.js                # /api/feed.xml dynamic RSS (legacy entry)
│   │   ├── sitemap.xml.js             # /api/sitemap.xml dynamic Sitemap (legacy entry)
│   │   └── [[path]].js                # /api/* catch-all: unknown routes return JSON 404, never HTML
│   ├── feed.xml.js                    # root /feed.xml dynamic RSS
│   ├── sitemap.xml.js                 # root /sitemap.xml dynamic Sitemap
│   └── _lib/
│       ├── api-core.js                # API core (D1 + auth + security + rate limits + RSS/Sitemap)
│       ├── ai.js                      # Workers AI wrapper (model / prompts / limits / cache / fallback)
│       ├── media.js                   # Media R2 direct upload (signing / delete / metadata)
│       └── music.js                   # Music API (presigned upload / metadata CRUD / R2 delete)
├── worker.js                          # Cloudflare Workers entry (routing + static assets + SPA fallback + cache headers)
├── migrations/                        # D1 migrations (auto-applied by CI, ledger-idempotent)
│   ├── 0001_init.sql                  # Base tables
│   ├── 0002_site_files.sql            # Site artifact storage
│   ├── 0003_cover_column.sql          # Cover column (legacy DBs)
│   ├── 0004_post_meta.sql             # Category / status (legacy DBs)
│   ├── 0005_comment_status.sql        # Comment moderation status (legacy DBs)
│   ├── 0006_media.sql                 # Media table
│   ├── 0007_settings.sql              # Site settings table
│   ├── 0008_stats_daily.sql           # Daily stats table
│   ├── 0009_comment_status_index.sql  # Comment status index
│   ├── 0010_admin_must_change.sql     # Forced password change flag (legacy DBs)
│   ├── 0011_comment_reply.sql         # Comment parent_id (legacy DBs)
│   ├── 0012_clear_orphaned_nav.sql    # Clean up legacy nav config
│   ├── 0013_music.sql                 # Music playlist metadata table
│   ├── 0014_purge_base64_media.sql    # Purge legacy base64 media rows
│   └── 0015_hot_path_indexes.sql      # Hot-path indexes (comments / music / media / sessions)
├── scripts/
│   ├── migrate-kv-to-d1.mjs           # One-off migration: KV data → D1
│   ├── minify.mjs                     # Generate public/*.min.* with terser / clean-css
│   └── screenshots/                   # README screenshot tooling (optional, needs puppeteer-core)
│       ├── demo-content.mjs           # Sample posts / comments / music / media / settings
│       ├── demo-server.mjs            # Local demo server (static assets + mock /api)
│       └── capture.mjs                # Headless Chrome capture script
├── .github/workflows/
│   ├── deploy.yml                     # GitHub Actions auto-deploy to Workers
│   └── migrate-kv-to-d1.yml           # Manual KV → D1 migration
├── seed.js                            # Import sample posts into the deployed cloud API
├── index.html                         # Root redirect (opens public/index.html)
├── wrangler.toml                      # Cloudflare Pages config
├── wrangler.workers.toml              # Cloudflare Workers config (used for deploys)
├── smoke-test.js                      # Smoke tests (77 cases)
├── gb-verify.js                       # Guestbook verification (18 cases)
├── search-verify.js                   # Search verification (13 cases)
├── README.md                          # 中文说明
├── README_EN.md                       # English docs (this file)
├── CLOUDFLARE_SETUP_GUIDE.md          # Cloudflare setup guide for beginners (中文)
├── CLOUDFLARE_SETUP_GUIDE_EN.md       # Cloudflare setup guide for beginners (English)
├── DEPLOYMENT_SECRETS_GUIDE.md        # GitHub Secrets and R2 tokens (中文)
├── DEPLOYMENT_SECRETS_GUIDE_EN.md     # GitHub Secrets and R2 tokens (English)
├── SECURITY.md / SECURITY_EN.md       # Security policy (中文 / English)
├── CODE_OF_CONDUCT.md                 # Code of conduct (中文)
├── CODE_OF_CONDUCT_EN.md              # Code of conduct (English)
├── ABOUT.md / ABOUT_EN.md             # About the project (中文 / English)
├── CONTRIBUTING.md                    # Contributing guide (bilingual inline)
└── LICENSE
```

---

## ☁️ Cloudflare Services

> Full dashboard walkthrough in **[CLOUDFLARE_SETUP_GUIDE_EN.md](CLOUDFLARE_SETUP_GUIDE_EN.md)**; this section covers how the code uses each service.

### Workers (compute + static assets)

- **Entry**: `worker.js` (route dispatch); files under `functions/` can also be reused as Pages Functions
- **Assets**: `public/` served through the `[assets]` binding, with SPA fallback and cache headers handled in the Worker
- **Compatibility date**: `2025-02-01`

Key `wrangler.workers.toml` config:

```toml
name = "kejiland"
main = "worker.js"

[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"  # extension-less paths fall back to index.html
html_handling = "auto-trailing-slash"

[[kv_namespaces]]
binding = "BLOG"
id = "{env.BLOG_KV_ID}"        # KV ids do not support {env.} interpolation; CI substitutes them

[[d1_databases]]
binding = "DB"
database_name = "blog"
database_id = "{env.BLOG_D1_ID}"

[ai]                            # Workers AI (binding must be named AI)
binding = "AI"

[vars]
SITE_URL = "{env.SITE_URL}"
CF_ZONE_ID = "{env.CF_ZONE_ID}"
```

**Static asset caching** (set uniformly in the Worker):

| Asset | Cache-Control |
| --- | --- |
| Versioned (`?v=`) or under `/fonts/`, `/flags/`, `/libs/smoji/` | `public, max-age=31536000, immutable` |
| Other files with an extension | `public, max-age=3600, stale-while-revalidate=86400` |
| Extension-less HTML entry | `no-cache` (ETag handles 304s) |

**API boundary**: unknown `/api/*` always returns a JSON 404 and never falls back to `index.html`; non-GET/HEAD requests are never SPA-fallback'd.

### KV (rate limiting / dedup / AI cache)

KV is not post storage — it holds counters and caches:

| Key pattern | Purpose | TTL |
| --- | --- | --- |
| `rate:cmt:<ip>:<minute window>` | Comment rate limit (5/min) | 120 s |
| `rate:like:<ip>:<minute window>` | Like rate limit (10/min) | 120 s |
| `rate:view:<ip>:<minute window>` | View rate limit (30/min) | 120 s |
| `liked:<ip>:<postId>` | One like per IP per post | 30 days |
| `viewed:<ip>:<postId>` | One view per IP per post per hour | 1 hour |
| `ai:sum:ip:<ip>` / `ai:sum:day:g` | AI summary quota (8/hour per IP; 300/day globally) | 1 hour / 1 day |
| `ai:assist:day:<ip>` / `ai:cmt:day:<ip>` | AI assistant / comment tool daily quota | 1 day |
| `ai:sum:<slug>:<lang>` / `ai:cmt:sum` | AI summary (30 days) and comment digest (1 hour) cache | see left |

> ⚠️ KV is **eventually consistent** (global propagation has delay) — good for counters and caches only. Anything needing strong consistency lives in D1.
> ⚠️ If KV is unbound, all of the limits and dedup above **silently stop working** (a single warning is logged), so binding KV is strongly recommended.

### D1 (SQLite database — primary storage)

| Table | Description | Key columns |
| --- | --- | --- |
| `posts` | Posts | id, title, date, excerpt, content, cover, pinned, protected, enc, tags(JSON), category, status |
| `comments` | Comments | id, post_id, author, content, date, status(approved/pending), **parent_id** |
| `stats` | Views / likes | post_id, likes, views |
| `stats_daily` | Daily aggregates (trend charts) | post_id, date, views, likes (PRIMARY KEY(post_id,date)) |
| `admin_auth` | Admin password | k, salt, hash, iter, must_change |
| `admin_sessions` | Sessions | token, exp (7 days, absolute timestamp) |
| `admin_fails` | Login-failure limiting | ip, n, until |
| `media` | Media metadata | id, name, url, type, size, created_at |
| `site_settings` | Site settings | k, v |
| `site_files` | Site artifacts | name, content, updated_at |
| `music` | Music metadata | id, title, artist, url, cover, size, duration, sort, created_at |
| `schema_migrations` | CI ledger | name, applied_at |

`0015_hot_path_indexes.sql` adds 5 hot-path indexes: `idx_comments_post_id`, `idx_comments_status_date`, `idx_music_sort`, `idx_media_created_id`, `idx_admin_sessions_exp`.

### R2 (object storage: audio + images)

File bodies live in R2, D1 only stores metadata, and **uploads go straight from the browser** without passing through the Worker.

| Capability | Description |
| --- | --- |
| Direct upload | The backend signs a SigV4 presigned `PUT` URL (signed headers **`content-type;host`**, `UNSIGNED-PAYLOAD`, valid for 3600 s); the browser uploads directly with a progress indicator |
| Public reads | Bind an R2 custom domain (e.g. `music.example.com` / `media.example.com`); the frontend streams audio and shows images directly |
| Synced delete | On delete the Worker signs an R2 `DELETE` (signed headers `host;x-amz-content-sha256;x-amz-date`) and only then removes the D1 row |
| Bucket selection | Images always go to `R2_MEDIA_BUCKET`; audio prefers `R2_BUCKET` and falls back to `R2_MEDIA_BUCKET` only when `R2_BUCKET` or `R2_PUBLIC_BASE` is empty |
| Audio allow-list | mp3 / m4a / ogg / oga / wav / aac / opus / flac, ≤ 30 MB each |
| Image allow-list | png / jpg / jpeg / webp / gif / svg / avif / bmp / ico, ≤ 10 MB each |
| Degradation | Uploads return 503 when R2 credentials are missing; reads and everything else keep working |
| Credentials | **One pair only**: audio and images share `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (they must be allowed to write both buckets) |

> **💡 Thumbnails, covers or audio slow on first load?** Objects uploaded directly to R2 carry no long-lived cache headers, so the first request hits the origin.
> Add a rule in the Cloudflare dashboard: your domain → **Caching → Cache Rules** → match `media.your-domain` and `music.your-domain` → **Cache Everything / Eligible for cache** with Edge TTL and Browser TTL both set to 1 month.
> The first request still goes to the origin; afterwards both the browser and the edge serve from cache.
> The frontend already helps: the first two thumbnails use `fetchpriority="high"`, all images use `loading="lazy" decoding="async"`, and they fade in when loaded.

### Workers AI (inference)

Default model `@cf/meta/llama-3.2-3b-instruct`, billed in Neurons with roughly **10,000 free Neurons per day**:

| Endpoint | Purpose | Limits |
| --- | --- | --- |
| `GET /api/ai/ping` | Availability probe (the frontend shows/hides every AI entry from this) | — |
| `GET/POST /api/ai/summary` | Post summary (30-day per-post cache; `force` regeneration requires auth) | 8/hour per IP; 300/day globally |
| `POST /api/ai/assist` | Writing assistant: title suggestions / polish / translate (auth required) | 200/day |
| `POST /api/ai/comments` | Comment digest (1-hour cache) and single-comment spam screening (auth required) | 100/day |

- **Config**: `[ai] binding = "AI"` in `wrangler.workers.toml` (created automatically on deploy); set `BLOG_AI_ENABLED` to `0` / `false` / `off` to disable entirely, and `BLOG_AI_PUBLIC` to the same values to forbid anonymous summary generation
- **Graceful degradation**: with no AI binding, no D1, or the switch off, the endpoints return 404 and the frontend (`aiProbe`) hides every AI entry — nothing else is affected
- **Frontend memory**: "available" is cached for 10 minutes, "unavailable" for only 30 seconds, so the UI recovers right after AI comes online
- **Privacy note**: summaries, the writing assistant and comment tools send the relevant **plaintext content** to Cloudflare Workers AI for inference. Disable them for sensitive content

> ⚠️ `[ai]` is a **Workers-only binding**. `wrangler.toml` (the Pages config) has no such block, so AI endpoints are permanently 404 under a Pages deployment.

---

## ⚙️ Configuration

### config.js

```javascript
window.BLOG_CONFIG = {
  // ====== Basic ======
  mode: 'auto',           // 'auto' | 'static' | 'api'
  apiBase: '',            // API base URL, empty = same origin
  siteUrl: 'https://www.example.com', // Public site URL (RSS / Sitemap / canonical)
  writeToken: '',         // Legacy static token (use login instead)
  pageSize: 5,            // Posts per page on the home page (0 = no pagination; non-numeric falls back to 8)
  adminPwd: '',           // Static-mode local password (leave empty in cloud mode)

  // ====== Footer (overridden by D1 settings in cloud mode) ======
  footer: {
    text: '',
    icp: '',               // ICP filing number
    contact: [],           // Footer nav (cloud overrides with "Blog settings → Footer navigation")
    links: [],             // Friend links (cloud overrides with "Blog settings → Friend links")
    decl: '',              // Site notice (cloud overrides with "Footer notice")
    email: '',             // Contact email (cloud overrides with "Profile → Email")
    startYear: 2019,       // Copyright start year
    copyrightName: "Qingyu'Blog"  // Copyright signature (cloud overrides with "Footer copyright")
  },

  // ====== Ads (off by default) ======
  ads: {
    enabled: false,          // Master switch
    client: '',              // AdSense publisher ID (ca-pub-xxxx); loads adsbygoogle.js when enabled
    belowSearch: '',         // Above the home list
    between: '',             // Inserted between cards
    betweenEvery: 3,         // Every N cards
    content: ''              // Bottom of a post
  }
};
```

**Navigation precedence**: cloud "Blog settings → Navigation menu" (stored in D1 `site_settings.nav_menu`) > the `NAV` fallback array in `app.js`. The footer nav and friend links work the same way (D1 first, `config.js` as fallback).

### mode Options

| Value | Behavior |
| --- | --- |
| `'auto'` | **Recommended**. Auto-detect: `/api/posts` succeeds → cloud; fails → static |
| `'static'` | Force static mode, `posts.js` only |
| `'api'` | Force cloud mode, requires the backend API |

### Multilingual (i18n)

`i18n.js` ships 5 languages (Chinese / English / 日本語 / 한국어 / हिन्दी) with **494 keys each**. Detection order: `localStorage('blog.locale')` → `navigator.language`, plus a manual switcher. Packs live in `public/locales/<lang>.json`; Chinese is also embedded as a fallback so core text stays readable when previewing via `file://`.

---

## 🛡️ Security

| Layer | Mechanism |
| --- | --- |
| Password storage | PBKDF2-SHA256 salted hash (100,000 iterations, 16-byte random salt), never plaintext |
| First deploy | With `BLOG_ADMIN_SETUP_KEY` set, initialization requires the `X-Setup-Key` header and login before init returns 403 (anti-squatting). Unset: the first login auto-generates a random default password (`xxxx-xxxx`, `must_change=1`) with a first-come race. **Cloud passwords are at least 8 characters** |
| Static mode | Passwords stored with a `sha256:` prefix (legacy plaintext auto-upgrades), minimum 4 characters (deterrent only) |
| Sessions | 32-byte random token (64 hex characters), valid 7 days, stored in D1 `admin_sessions`; destroyed on logout, and all sessions are cleared when the password changes |
| Login throttling | **Three tiers, and deliberately no long global lock**: 5 failures per IP → 15 minutes; 15 failures per subnet (IPv4 /24, IPv6 /64) → 60-second cooldown; 30 failures site-wide → **only a 10-second cooldown plus an alert log**. Counters age out after 1 hour, and requests during a lock/cooldown return early **without reading or writing the database** (which also blocks "brute-force yourself out of the free D1 write quota") |
| Break-glass path | A login request carrying the correct `X-Setup-Key` (`BLOG_ADMIN_SETUP_KEY`) **skips every throttle** (but never the password check); the login page reveals that field automatically when throttled. An attacker can delay you by 10 seconds, never lock you out |
| Edge rate limiting (optional) | Setting `BLOG_RATE_LIMIT_BINDING` enables the Workers Rate Limiting binding (`env.LOGIN_LIMITER`) to throttle logins by IP at the Worker entry with no database traffic. You can also put `/api/admin/login` behind Cloudflare Access or a WAF rate limiting rule — see *Hardening the admin login* below |
| API auth | Every write checks `Authorization: Bearer <token>`; comparison is constant-time (SHA-256 digest + XOR) |
| Comment security | Control-character sanitising and HTML escaping, fully parameterised SQL, per-IP rate limiting, Origin validation, **duplicate blocking** (409), 300 comments per post, max 3 levels of nesting |
| Media URLs | Only `http(s)` accepted (R2 public URLs or external links); `javascript:` / `data:` and friends are rejected |
| API boundary | Unknown `/api/*` returns a JSON 404 and never falls back to `index.html`; non-GET/HEAD is never SPA-fallback'd |
| Security headers | The Worker injects `CSP`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options` and `Cross-Origin-Opener-Policy` on API and static responses alike; pure-static Pages paths get the same set from `public/_headers` |
| CORS | With `SITE_URL` set only the site origin plus the request's own origin are allowed. **Without `SITE_URL` it fails closed (no ACAO returned)** rather than echoing any origin |
| Error messages | Uncaught exceptions return a generic "internal server error"; details stay in server logs |
| Client IP | Only `CF-Connecting-IP` is trusted; the spoofable `X-Forwarded-For` is ignored |

### Hardening the admin login (recommended)

The built-in throttling already blocks brute force, but you can remove the risk at its source by putting a gate in front of `/api/admin/login` at Cloudflare's edge. Pick any of the three — all are free and invisible to visitors:

| Option | How | Effect |
| --- | --- | --- |
| **Cloudflare Access** (most recommended) | Zero Trust → Access → Applications → Add an application → **Self-hosted**. Add two public hostnames on your domain with paths `admin` and `api/admin`. Policy: Allow → Emails → your address. Authentication method: **One-time PIN** | Unauthenticated requests **never reach** the Worker's login endpoint, so brute force and lockout DoS disappear entirely |
| **WAF rate limiting rule** | Your domain → **Security → Security rules → Rate limiting rules** → Create rule. Match `URI Path equals /api/admin/login`; when the rate exceeds 10 requests per 10 seconds, Block for 10 seconds | Blocked at the edge: no Worker requests, no D1/KV quota consumed |
| **Workers rate limiting binding** | Add the GitHub secret `BLOG_RATE_LIMIT_BINDING` (a positive integer such as `1001`) and redeploy | Throttles logins by IP at the Worker entry (10/min/location); blocked requests never touch the database |

Notes for Access: protect only `/admin*` and `/api/admin/*` — never the whole domain, or visitors will be locked out of the public site (`/api/posts`, `/api/comments`, `/api/music` must stay open). Zero Trust Free covers up to 50 users, which is plenty here.

The step-by-step dashboard walkthrough is in section 9 of the **[Cloudflare setup guide](CLOUDFLARE_SETUP_GUIDE_EN.md)**.

---

## 🧪 Tests

```bash
node smoke-test.js      # Smoke tests: 77 cases (Markdown / TOC / highlighting / import-export / admin gate / comment security / stats / search / RSS / Sitemap / cloud API / caching …)
node gb-verify.js       # Guestbook verification: 18 cases
node search-verify.js   # Search verification: 13 cases
```

All three suites use Node built-ins only (no network, no credentials) and run automatically before every CI deploy — a failure aborts the deploy.

Import sample posts into a deployed cloud instance:

```bash
node seed.js https://www.example.com [--token <session or write token>]
```

Regenerate the minified assets under `public/`:

```bash
node scripts/minify.mjs     # requires npx terser / clean-css-cli
```

---

## ⚠️ Known Limitations

| Limitation | Details |
| --- | --- |
| Music API is Workers-only | `/api/music*` is implemented in `worker.js` only; there is no function file for it. **Music is unavailable under a Pages deployment** (the endpoint returns a JSON 404) |
| No category / encryption UI | The D1 schema and API keep `category` / `protected` / `enc` (so externally encrypted posts can be imported), but the editor exposes only title / tags / cover / pinned / body |
| Editing a post rewrites its date | Saving always writes today's date, so editing an old post changes its position in lists and RSS |
| Tag rename is O(n) | Renaming or deleting a tag issues one PUT per affected post, sequentially |
| Password modal vs backend | The change-password modal hints at 6 characters while the backend requires **8** — just use 8+ |
| A throttled login means a short wait | Once throttled, even the correct password has to wait 10 seconds (global cooldown) / 60 seconds (same subnet) / 15 minutes (your own IP) — unless you use the setup-key break-glass path. This is deliberate: still running PBKDF2 while locked would turn a login DoS into a CPU/quota DoS |
| `must_change` is not enforced | The backend returns the flag, but the UI only shows a tip and never blocks |
| `public/fonts/dreamserif/` is dead weight | The current version loads **no webfonts**; this directory (~10.3 MB, 265 shards) is unreferenced and kept only because of a `.gitignore` whitelist. Deleting it changes nothing functionally |
| No pagination in some admin views | The comment list and media library fetch everything at once, which gets slow with a lot of data |
| Unknown paths return HTTP 200 | The frontend 404 page still answers with status 200 (a common SPA trade-off) |

---

## 📚 Documentation Index

Every document ships in both Chinese and English: long documents come as a pair (`X.md` + `X_EN.md`), while the short ones (the contributing guide and the issue/PR templates) are bilingual inside a single file. (`LICENSE` is the exception: the MIT text is canonical in English and is deliberately left untranslated.)

| English | 中文 | Contents |
| --- | --- | --- |
| [README_EN.md](README_EN.md) | [README.md](README.md) | Project overview: quick start, features, directory structure, Cloudflare services, configuration, security, tests |
| [CLOUDFLARE_SETUP_GUIDE_EN.md](CLOUDFLARE_SETUP_GUIDE_EN.md) | [CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md) | **Cloudflare setup guide for beginners**: account, D1, KV, API tokens, R2, Workers AI, custom domains, secrets, deploy, self-check, troubleshooting, free-tier limits |
| [DEPLOYMENT_SECRETS_GUIDE_EN.md](DEPLOYMENT_SECRETS_GUIDE_EN.md) | [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md) | Focused on GitHub Secrets and R2 tokens: where each secret comes from, what to put in it, one bucket or two tokens |
| [SECURITY_EN.md](SECURITY_EN.md) | [SECURITY.md](SECURITY.md) | How to report a vulnerability, plus the built-in security measures |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Same file (bilingual inline) | Contribution workflow |
| [CODE_OF_CONDUCT_EN.md](CODE_OF_CONDUCT_EN.md) | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community code of conduct |
| [ABOUT_EN.md](ABOUT_EN.md) | [ABOUT.md](ABOUT.md) | About the project and the author |

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  If Qingyu'Blog helps you, feel free to ⭐ Star / Fork, or open an <a href="https://github.com/kejiland/qingyu-blog/issues">Issue</a>.
</p>

<p align="center">
  <b>If you find this project useful, please give it a ⭐ Star — it helps others discover it!</b>
</p>
