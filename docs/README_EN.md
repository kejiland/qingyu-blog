> 🌐 [中文](README.md) · **English**

<p align="center">
  <img src="../screenshots/home.png" alt="Qingyu'Blog" width="100%" />
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

> 🆕 **Current version `v2.10.71`.** Beyond writing / comments / stats, it also ships: **post encryption** (AES-GCM, client-side), **per-post SEO** (title / description / canonical / noindex), **draft preview links** (HMAC-signed), **one-click static site export**, **print / PDF**, **Webmention**, **multi-author + author pages**, **Mermaid diagrams + KaTeX math** (vendored, on-demand), **subscriber groups & broadcast**, **front-end error log**, **comment anti-bot**, **country / device detection**, and an admin "**Feature switches**" page.

> 💡 The root `index.html` is just a redirect that opens `public/index.html` (the Workers / Pages deploy directory). Opening `public/index.html` locally works the same.

> 🆕 **Deploying to Cloudflare for the first time?** See the **[Cloudflare Setup Guide (Beginner)](CLOUDFLARE_SETUP_GUIDE_EN.md)** — a full walkthrough from sign-up, creating D1/KV, creating API tokens, R2 buckets and CORS, to binding a custom domain and initializing the admin account.

---

## ✅ Why Choose This

| Advantage | Description |
| --- | --- |
| **Zero barrier** | No Node.js, no npm, no build step — just open the file |
| **Zero cost** | The free tiers of Workers, D1, KV and R2 are more than enough for a personal blog |
| **Zero dependency** | The core (site, admin, i18n) pulls in no third-party runtime library; heavier extras (emoji / diagrams / math) are **lazy-loaded** and vendored under `public/libs/`, so pages that don't use them download nothing |
| **Zero lock-in** | Posts are Markdown, data lives in standard SQLite (D1) — trivially portable |
| **Dual mode** | Static export + cloud API from the same codebase |
| **Responsive** | Both the public site and the admin panel adapt to phone / tablet / desktop |
| **Multilingual** | Chinese / English / 日本語 / 한국어 / हिन्दी, auto-detected browser language |
| **Serif aesthetics** | System serif body (Songti) + Fangsong quote ornaments, **zero webfont downloads**; four-season canvas background animation |
| **Secure** | PBKDF2-SHA256 salted password hashing (100k iterations), session tokens, login-failure lockout, CSP and other security headers |
| **AI enhanced** | Workers AI powers post summaries, a writing assistant, comment digests and spam screening; everything hides itself gracefully when unavailable |
| **Content toolchain** | Encryption, SEO overrides, draft autosave & crash recovery, preview links, static export, print / PDF, Webmention and author pages — a full writing-to-distribution loop |
| **Observable** | Dashboard (trends / referrers / countries / devices / brands), site health check, audit log and a **front-end error log** that captures and groups visitor-side exceptions |

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

**Optional (grouped by feature):**

*📧 Email subscription & notifications (Resend — all three required to enable)*

| Secret | Description |
| --- | --- |
| `RESEND_API_KEY` | Resend API key |
| `BLOG_MAIL_FROM` | Sender address (domain must be verified in Resend), e.g. `blog@yourdomain.com` |
| `BLOG_MAIL_REPLY_TO` | Optional reply-to address |
| `BLOG_ADMIN_EMAIL` | Optional: recipient of new-comment notifications; falls back to Profile → email |

*🔐 Post encryption & preview links*

| Secret | Description |
| --- | --- |
| `BLOG_PREVIEW_SECRET` | **HMAC signing key** for draft preview links. Unset = derived from the admin password hash, so **changing the password invalidates every issued link** |

*💬 Comments*

| Secret | Description |
| --- | --- |
| `COMMENT_BLOCKLIST` | Comment blocklist words (newlines / commas); **takes precedence over the admin list** |
| `BLOG_RATE_LIMIT_BINDING` | Enables in-Worker edge rate limiting for login (a positive integer namespace, e.g. `1001`); switches deploys to wrangler 4.x. Remove it if your account does not support the binding |

*🤖 AI (Workers AI)*

| Secret | Description |
| --- | --- |
| `BLOG_AI_ENABLED` | Set to `0` / `false` / `off` to **switch AI off entirely**; unset = on whenever the binding exists |
| `BLOG_AI_PUBLIC` | Set to `0` / `false` / `off` to **forbid anonymous summary generation** (still works after logging in; cached reads and ping are unaffected) |

*🗂️ R2 object storage (music / media / backups)*

| Secret | Description |
| --- | --- |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` | R2 S3-compatible credentials (music, media and backups **share one pair**) |
| `R2_BUCKET` / `R2_PUBLIC_BASE` | **Music bucket**: name + public domain (**must not be empty**, otherwise no R2 config is written) |
| `R2_MEDIA_BUCKET` / `R2_MEDIA_PUBLIC_BASE` | **Media bucket**: name + public domain |
| `R2_BACKUP_BUCKET` | **Private backup bucket** for automatic/manual JSON backups — **do not attach a public domain**. Backup & restore are disabled when unset |

*⚙️ Other*

| Secret | Description |
| --- | --- |
| `CF_ZONE_ID` | Zone ID of your custom domain; with the *Cache Purge* permission it purges the edge cache on publish (the runtime `CF_API_TOKEN` is written by the workflow) |
| `PAGES_PROJECT_NAME` | Misleading name: it actually overrides the **Worker name**. Leave empty to keep `kejiland`. Beginners should not set it |
| `BLOG_WRITE_TOKEN` | Legacy write token, not needed for new deployments |

### Full table of runtime environment variables

Everything the code reads; entries marked *auto* are written to the Worker from the GitHub Secrets above.

| Variable | Type | Behaviour when unset |
| --- | --- | --- |
| `DB` | D1 binding | Every endpoint returns "database not configured" |
| `ASSETS` | Static asset binding | Static pages 404 (Workers injects this automatically) |
| `BLOG` | KV binding | Comment / like / view rate limiting and dedup stop working (features still function) |
| `SITE_URL` | Variable | **Cross-origin requests are always rejected**; RSS / Sitemap fall back to the request origin |
| `CF_ZONE_ID` + `CF_API_TOKEN` | Variable + Secret (*auto*) | No edge cache purging (new content takes 1-5 minutes to appear) |
| `BLOG_ADMIN_SETUP_KEY` | Secret | First login auto-generates a random default password (first-come-first-served race); still the break-glass path for login throttling |
| `BLOG_WRITE_TOKEN` | Secret | Session login only |
| `BLOG_RATE_LIMIT_BINDING` → `LOGIN_LIMITER` | Secret → binding | No edge limiter; login throttling falls back to D1 counters |
| `AI` | Workers AI binding | Every `/api/ai/*` returns 404 and the front end hides all AI entries |
| `BLOG_AI_ENABLED` | Secret / variable | Treated as enabled whenever `AI` + `DB` exist |
| `BLOG_AI_PUBLIC` | Secret / variable | Anonymous summary generation is allowed |
| `RESEND_API_KEY` / `BLOG_MAIL_FROM` / `SITE_URL` | Secret (*auto*) | Email subscription, post notices, comment notices and broadcasts are all disabled |
| `BLOG_MAIL_REPLY_TO` | Secret (*auto*) | Sending still works, just without reply-to |
| `BLOG_ADMIN_EMAIL` | Secret (*auto*) | Comment notices fall back to Profile → email |
| `COMMENT_BLOCKLIST` | Secret (*auto*) | Only the admin-maintained list is used |
| `BLOG_PREVIEW_SECRET` | Secret (*auto*) | Preview links are signed with a key derived from the admin password hash (invalidated by a password change) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` | Secret (*auto*) | Image / music upload and backup endpoints return 503 |
| `R2_BUCKET` / `R2_PUBLIC_BASE` | Secret (*auto*) | Music upload unavailable (images unaffected) |
| `R2_MEDIA_BUCKET` / `R2_MEDIA_PUBLIC_BASE` | Secret (*auto*) | Image upload unavailable (music unaffected) |
| `R2_BACKUP_BUCKET` | Secret (*auto*) | Backup & restore disabled (the admin page shows "not configured") |

> ⚠️ After adding or changing a Secret you **must re-run the deploy** (Deploy workflow) so the new value reaches the Worker. Optional Secrets **can be left blank** — the workflow only writes the non-empty ones.

Push to `main` (or run the workflow manually) and GitHub Actions will:

1. ✅ Install the Wrangler CLI
2. ✅ Run three test suites (`smoke-test.js` 158 cases / `gb-verify.js` 18 / `search-verify.js` 25 — a failure aborts the deploy)
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
| Reading experience | Reading-time estimate, view count, likes (per-browser dedup), pin badge, **one-tap share** (copy link / native share / Weibo / X / Facebook / Telegram / email), **reading-position memory (reopens where you left off)**, **text highlighting (select to highlight, optional note, saved locally; summary panel with jump-to, JSON export / import and one-click clear)**, back-to-top |
| **Reading size & floating TOC** | Article pages offer one-tap body font sizing (A− / A / A+, remembered locally); on mobile a floating button opens the full table of contents as a bottom sheet |
| **Immersive reading** | Article images open in a full-screen lightbox with keyboard navigation; a top reading-progress bar tracks position and the table of contents highlights the current section |
| **Announcement bar** | Enabled from Settings → Site info; shows a notice with an optional link under the top bar. Visitors can dismiss it and the choice is remembered |
| **Popular posts** | `/popular` ranks articles by views×1 + likes×3 + comments×5, with all-time, 7-day and 30-day ranges in cloud mode |
| Comments | Cloud D1 global comments + moderation mode; **server-side pagination (8 top-level comments per page, each with its replies)** and Top / Newest sorting; **up to 3 levels of nested replies**; orphaned replies are promoted; deleting a post cascades to its comments / likes / views; **duplicate blocking** (same section + author + content → 409) and rate limiting (5 per minute per IP) |
| **Comment interactions** | Comments support likes, featuring and pinning; readers can switch between Top / Newest with top-level pagination (8 per page, load more), and admins can toggle feature / pin in one click |
| Guestbook | Reachable at `/guestbook` with two sections (messages / feature ideas), cloud-stored, reusing the comment security pipeline; supports `Ctrl/⌘ + Enter` |
| **Full-text search** | Cloud search uses a D1 FTS5 (trigram) index over titles, tags, excerpts and bodies, with substring matching, relevance ranking, highlighting and load-more pagination. Short terms fall back to LIKE; static mode keeps local search |
| **Friend links page** | A standalone `/links` page renders the friend links configured in the admin (cards, external links open in a new tab); the footer gains a default "Links" entry |
| **Reading history / Read later** | Local reading history (up to 100 posts) plus a read-later bookmark on articles; the history page lists both |
| **Categories** | Category index page with per-category counts; the home list supports category filtering with a clearable chip; the editor accepts a free-text category with existing values suggested |
| Tags & archive | Home tag filter (`?tag=`, clearable), tag cloud with counts, archive grouped by year → month |
| Featured posts | Auto-recommended below the comments (**likes×3 + views×1 + comments×5**, top 2, excluding the current post and drafts) |
| **Bidirectional links & related posts** | Use `[[Post title]]` in Markdown to create links between posts. Article pages show “Linked from” backlinks plus related posts ranked by shared tags, series and recency |
| RSS / Sitemap | `/feed.xml` and `/sitemap.xml` generated dynamically from D1; drafts and encrypted posts excluded |
| Prev / Next | Hides the empty slot when only one direction exists |
| Card list | Cover thumbnails (from `cover` or the first image in the body), pin badge, tags pinned to the bottom, loading skeleton, pagination (`?page=`) |
| **Dark / light theme** | One-click toggle, follows the system preference, no flash of unstyled content; the top bar deepens its shadow as you scroll |
| **Accent colours** | **4 accents**: Terra (赭橙) / Indigo (黛蓝) / Bamboo (竹青) / Dusk (凝夜紫). Icon button with a swatch popover on desktop, native select on mobile; each accent also retints backgrounds and borders |
| **Multilingual UI** | Chinese / English / 日本語 / 한국어 / हिन्दी (993 keys each), auto-detect + manual switch (🌐 popover with SVG flags on desktop, native select on mobile) |
| **PWA offline reading & writing** | Installable on desktop or mobile; the shell, core assets and previously visited articles work offline. Cloud editor changes are queued locally and synced automatically when the connection returns |
| **Background animation** | Hand-drawn canvas particles for the four seasons (spring petals / summer green leaves / autumn leaves / six-armed branched snowflakes); home page only, pauses when the tab is hidden; on by default on desktop, off on touch devices, toggleable from the top bar, respects `prefers-reduced-motion`. Preview: `/?season=spring`, `/?season=summer`, `/?season=autumn` or `/?season=winter` (add `&bg=1` to force it on) |
| **Diagrams / math** | Bodies support **Mermaid diagrams** (```mermaid fenced blocks) and **KaTeX math** (`$…$` / `$$…$$`). Both libraries are **vendored** under `public/libs/` (offline-friendly, no CDN in the CSP) and load **only when a page actually uses them** — normal pages make zero extra requests. Can be disabled globally under Feature switches. |
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
| Dashboard | **7 stat cards** (total posts / published / scheduled / drafts / pinned / total comments / pending) + **two 30-day line charts** (inline SVG, hover preview and click-to-pin values) + latest posts / latest comments (auto-scrolling, pauses on hover)  + **storage & subscription overview** (media count and size / music / subscribers and active count / backups and latest time) |
| **Post analytics** | A dedicated analytics page shows views, likes, comments and a combined score for every post, with all-time / 7-day / 30-day ranges, per-post trend charts, CSV export and draft visibility |
| Post management | Keyword search (title + tags, 250 ms debounce), status filter (all / published / scheduled / draft), 10 per page, optimistic pin toggle, **multi-select bulk pin / unpin / delete with confirmation**, **seamless delete** (row fades out; comments and stats are cascaded server-side) |
| Scheduled publishing | In cloud mode, choose a future publish time; a Worker Cron checks every 5 minutes and publishes automatically. Scheduled posts are hidden from the public site, RSS and Sitemap |
| **Version history** | Every save keeps up to 50 snapshots; browse versions, inspect body diffs and restore any version with one click |
| **Backup & restore** | Manual backups plus a daily 03:00 Asia/Shanghai Worker Cron backup of posts, revisions, comments, media metadata, music, settings and stats to private R2. Keeps 30 backups and **paginated (10 per page) with a content summary per backup (posts / comments / media / music / subscribers)**, and supports download, delete and one-click restore with an automatic pre-restore snapshot |
| **Series** | Assign posts to a named series and order. `/series` lists all series; series pages order posts by number and provide previous/next navigation. Admin supports renaming and removing series |
| **Email subscription** | Public `/subscribe` form with double opt-in; new posts are queued and delivered asynchronously by Cron. Admin supports **email search + status filter + pagination (20 per page)**, CSV export of the current filter, and deletion |
| **Subscriber groups & broadcast** | Subscribers can be tagged with multiple groups; the admin can filter by group and **broadcast a custom subject/message to selected groups (or every confirmed subscriber)**. Mail is queued and delivered asynchronously by Cron, with an unsubscribe link appended |
| **Automatic share image** | The editor generates a 1200×630 PNG from title, date, series and tags and uploads it to R2. The public site emits `og:image` and `twitter:image`, falling back to the cover image |
| **Image compression & paste upload** | Media uploads are compressed to WebP with generated thumbnails. The editor accepts pasted screenshots, uploads them and inserts Markdown automatically |
| Editor | Title / publish date (minute precision, preserved while editing) / tags / cover (pick from the media library) / pinned / Markdown body; **local draft autosave (1.5s after typing stops and every 10s; one-click restore after a crash or accidental tab close; encrypted posts never store plaintext locally)**; **live preview**, **live word count + estimated reading time**, shortcuts (Ctrl/⌘ + B / I / K / S), auto-growing input, toolbar (bold, italic, heading, quote, code, list, link, image, emoji, **table, task list, divider, fenced code block with language picker**); save as draft or publish |
| **Multi-author / author pages** | Each post can name an **author** (the editor has an author field with existing-author suggestions); the article page shows the byline; `/authors` lists every author with post counts and `/authors/<name>` shows that author’s posts. The field travels with backups and exports (restoring an old revision keeps it) |
| **Webmention** | W3C Webmention support: the page advertises the endpoint via `<link rel="webmention">`; when another site mentions one of your posts it can notify the endpoint, which **fetches the source page and verifies it really links to that post** before storing it, then shows the source title / excerpt / author under the article. Deleting the link upstream does not remove the entry automatically — remove it in Admin → Webmentions |
| **Print / export PDF** | One-click "Print / PDF" on any post: a dedicated print stylesheet hides navigation, comments, ads, the player and TOC overlays so only the title and body remain. Code blocks, tables, images, math and diagrams avoid page breaks, external links get their full URL appended, and a footer prints the site name plus the original link — just use the browser's "Save as PDF" |
| **Draft preview links** | One click in the editor generates an **HMAC-signed preview link** for an unpublished post (7 days by default, copyable/openable). Anyone with the link can read it without logging in; the page is `noindex`, untracked and comment-free. Changing the site password invalidates every link already issued |
| **Per-post SEO** | Override **SEO title / description / canonical / noindex** per post (leave blank for auto); applies to `<title>`, meta description, Open Graph, Twitter Card and JSON-LD. Restoring a revision keeps the SEO settings |
| **Post encryption** | One toggle in the editor encrypts the body: **AES-GCM-256 + PBKDF2-SHA256 (100k iterations), fully client-side**. Plaintext never leaves the browser — the server stores only the ciphertext (`enc`). Readers must enter the password on the article page; the server cannot decrypt it. The editor remembers the password in **this browser** so you can reveal it later with "Show" (this device only) |
| **AI writing assistant** | One click for title suggestions / polish / translation (5 target languages); apply the result to the title, replace the body, append it, or copy it. The whole bar is not rendered when AI is unavailable |
| **Comment blocklist** | Maintain a blocklist (one word per line) in settings; comments whose nickname or body matches are **rejected** and never stored |
| **Comment anti-bot** | Hidden honeypot field + form timestamp: a filled honeypot is treated as a bot and **silently dropped** (success response, nothing stored), and submitting under 2s after the form loads is rejected. Invisible to real visitors; can be disabled under Feature switches |
| **Bulk comment actions** | Select multiple comments (or the whole page) to **approve / mark pending / delete** in one server request, with an audit-log entry |
| Comment management | Global list (author / content / post / time / status / actions), keyword search, status filter, **approve** (badge updates in place, no table reload), delete (row fades out); the sidebar shows a live pending-count badge |
| **AI comment tools** | Summarize recent comment threads (1-hour cache) and screen a single comment for spam (red / green verdict with a reason) |
| **Comment email notifications** | New comments and replies are queued and delivered asynchronously by Cron. The recipient uses `BLOG_ADMIN_EMAIL` first, then the profile email |
| Tag management | Tag list derived from the posts in real time; rename / delete with bulk updates |
| Media library | Image upload (browser **direct-to-R2** presigned URLs, metadata in D1), grid preview, **click a thumbnail for a full preview (arrow keys / Esc to close)**, **file-name search + pagination (24 per page)**, **multi-select bulk delete**, copy URL or **copy Markdown image syntax**, delete (R2 object first, then the D1 row); static / non-cloud mode shows a hint |
| **Music management** | Audio upload (direct to R2 with a percentage progress bar, drag-and-drop supported); **filename parsing fills in "song - artist"**; **title / artist search + pagination (15 per page)**; inline per-row preview (play / pause / seek / elapsed and total time), rename, delete (synced with the R2 object); inner-scrolling list card with a sticky table header |
| **Feature switches** | Admin → Settings → Feature switches moves code-only toggles into the UI: **posts per page** (0 = no paging), a **new-navigation-items switch**, and the **ads master switch** + AdSense client ID + three ad slots (above list / between list items + interval / below post). Saved settings take effect immediately — no code change or redeploy |
| Blog settings | 6 tabs: **Site basics** (name / description / avatar logo / about-page content / footer copyright / footer notice / moderate new comments), **Feature switches** (home paging / new navigation items / ads / front-end error reporting / comment anti-bot / diagrams & math), **Profile** (name / bio / avatar / email), **Navigation menu** (visual editor with add / remove / sub-items / reset), **Footer navigation**, **Friend links** |
| **Front-end error log** | Captures unhandled exceptions and promise rejections in visitors' browsers and reports them anonymously to `/admin/errors`; identical errors are grouped with a hit count (plus source, page and UA), searchable and clearable. On by default, can be disabled under Feature switches |
| **Site health check** | `/admin/health` verifies D1 table readability (with row counts), KV read/write, R2 media & backup buckets, and AI / mail (Resend) bindings |
| **Traffic sources / devices** | Records the referrer host, **country/region** (Cloudflare edge IP geolocation — only the 2-letter code is stored, never the raw IP), **device type** (desktop / mobile / tablet / bot), **OS** (iOS / Android / HarmonyOS / Windows / macOS / Linux) and **device brand** (Apple / Samsung / Xiaomi / Huawei / OPPO / vivo …) for every view, aggregated per day; the dashboard shows a 30-day card with top referrers and device share |
| **Audit log** | Records key admin operations (backup create / restore / delete, post delete, media delete, settings update) with time and source IP; supports **type filter + date range + pagination (20 per page) + CSV export + clear** |
| Top bar | Sidebar collapse, breadcrumb, preview site, 🌐 language switch, account menu (profile / change password / logout) |
| Import / export | Import a single file, multiple files, or a folder; export one Markdown file, selected posts as a ZIP, all posts, or a full JSON backup. Works in both static and cloud modes |
| **Static site export** | The Import / Export page bundles the whole site into a **pure-static ZIP**: pre-rendered home, every post, archive, tags, about and 404 pages, with **its own index.html per route (no SPA rewrite rules needed on any host)**, plus every static asset, published-posts-only data, RSS/sitemap and a deployment README. Drafts and scheduled posts are never exported |
| One-click export | **Static mode only**: the editor's "export all" writes `posts.js` + `feed.xml` + `sitemap.xml` for you to overwrite `public/` with. Cloud mode generates RSS/Sitemap server-side, so there is no export entry there |
| Responsive | Fixed sidebar on desktop (collapsible to a 72 px icon rail) / drawer navigation on mobile; breakpoints at 1100 / 991 / 640 / 420 px |

---

## 🖼️ Screenshots

### Public site

| Home (light · tag filter, pin badge, cover thumbnails) | Post detail (TOC, tables, code blocks) | Search (keyword highlighting + sentence context) |
| --- | --- | --- |
| ![Home](../screenshots/home.png) | ![Post detail](../screenshots/detail.png) | ![Search](../screenshots/search.png) |

| Tag cloud | Archive (grouped by year and month) | Guestbook |
| --- | --- | --- |
| ![Tags](../screenshots/tags.png) | ![Archive](../screenshots/archive.png) | ![Guestbook](../screenshots/guestbook.png) |

| Home (dark) | Post (dark) | Mobile |
| --- | --- | --- |
| ![Home dark](../screenshots/home-dark.png) | ![Post dark](../screenshots/detail-dark.png) | ![Mobile](../screenshots/mobile.png) |

| Music player (panel opened from the bottom-right button) |
| --- |
| ![Music player](../screenshots/music-player.png) |

### Admin panel

| Login gate (setup key supported) | Dashboard (7 stat cards + 30-day trends) | Dark mode |
| --- | --- | --- |
| ![Login](../screenshots/admin-gate.png) | ![Dashboard](../screenshots/admin.png) | ![Admin dark](../screenshots/admin-dark.png) |

| Post management | Editor (live Markdown preview + AI assistant) | Comment management |
| --- | --- | --- |
| ![Posts](../screenshots/admin-posts.png) | ![Editor](../screenshots/write.png) | ![Comments](../screenshots/admin-list.png) |

| Media library | Music management (inline preview, sticky header) | Blog settings | Tag management |
| --- | --- | --- | --- |
| ![Media](../screenshots/admin-media.png) | ![Music](../screenshots/music-admin.png) | ![Settings](../screenshots/admin-settings.png) | ![Tags](../screenshots/admin-tags.png) |

### Serif typography preview

| Home (light) | Post (light) | Post (dark) |
| --- | --- | --- |
| ![Home light](../screenshots/font-preview/home-light.png) | ![Post light](../screenshots/font-preview/article-light.png) | ![Post dark](../screenshots/font-preview/article-dark.png) |

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
│   ├── manifest.webmanifest           # PWA manifest
│   ├── sw.js                          # Offline-cache service worker
│   ├── icons/                         # PWA desktop / mobile icons
│   ├── admin.js / admin.min.js        # Admin SPA (lazy-loaded)
│   ├── admin.css / admin.min.css      # Admin styles (responsive)
│   ├── music-player.js / .min.js      # Global music player (FAB + panel + playlist + progress memory)
│   ├── music-player.css / .min.css    # Player styles (off the critical path)
│   ├── bg-anim.js / bg-anim.min.js    # Four-season canvas background animation
│   ├── i18n.js / i18n.min.js          # i18n module (zh/en/ja/ko/hi, built-in Chinese fallback)
│   ├── posts.js / posts.min.js        # Static-mode post data (generated by "Export posts.js")
│   ├── static-export.json             # File manifest used by the "export static site" feature
│   ├── locales/                       # Language packs (zh-CN / en / ja / ko / hi, 993 keys each)
│   ├── flags/                         # SVG flags for the language switcher (cn / gb / jp / kr / in)
│   ├── libs/smoji/                    # Smoji emoji picker (lazy-loaded)
│   ├── libs/katex/                    # KaTeX math (vendored, lazy-loaded)
│   ├── libs/mermaid/                  # Mermaid diagrams (vendored, lazy-loaded)
│   ├── robots.txt                     # Crawler rules (blocks admin, declares the sitemap)
│   ├── llms.txt                       # Site description for LLMs / agents
│   ├── ads.txt                        # Ads declaration (optional, pairs with config.js ads)
│   ├── _headers                       # Cloudflare response headers (CSP / security / per-path caching)
│   ├── _redirects                     # Cloudflare routes (SPA fallback + /public prefix 301)
│   ├── .well-known/                   # ard.json (ARD v0.91) and ai-catalog.json
│   # feed.xml / sitemap.xml are generated dynamically in cloud (see functions/)
├── functions/                         # Cloudflare API (shared by Pages Functions and Workers)
│   ├── api/
│   │   ├── posts.js                   # List / create posts (?all=1 drafts, ?full=1 bodies, ?page server-side paging)
│   │   ├── posts/[id].js              # Single post GET / PUT / DELETE (cascades comments & stats)
│   │   ├── posts/[id]/comments.js     # Post comments GET / POST (3-level nesting + server-side paging)
│   │   ├── posts/[id]/comments/[cid].js        # Delete a single comment
│   │   ├── posts/[id]/stats.js        # Views / likes (also records referrer, country, device, OS, brand)
│   │   ├── posts/[id]/relations.js    # Backlinks + related posts
│   │   ├── posts/[id]/revisions*.js   # Revision history: list / single / restore
│   │   ├── comments.js · comments/[id].js · comments/[id]/like.js   # Global list / moderate & delete / like
│   │   ├── ai/{ping,summary,assist,comments}.js  # AI probe / summary / writing assistant / comment digest & spam check
│   │   ├── media.js · media/upload-url.js · media/[id].js   # Media: list / R2 presigned upload / delete
│   │   ├── music.js · music/upload-url.js · music/[id].js   # Music: list / presigned upload / rename / delete
│   │   ├── subscribe.js · subscribe/{confirm,unsubscribe}.js  # Subscribe / double opt-in / unsubscribe
│   │   ├── settings.js                # Site settings GET / PUT (includes the "Feature switches" object)
│   │   ├── search.js · popular.js     # Full-text search (FTS5 trigram) / popular ranking
│   │   ├── stats/trend.js             # N-day view / like / comment trend
│   │   ├── errors.js                  # Front-end error reporting (public, rate-limited, grouped)
│   │   ├── webmention.js              # Webmention: receive notifications / list mentions for a post
│   │   ├── preview.js                 # Draft preview via HMAC-signed token
│   │   ├── site-files/index.js · site-files/[name].js  # Site artifacts (feed / sitemap): list / download
│   │   ├── admin/{setup,login,logout,password}.js      # Init / login / logout / change password
│   │   ├── admin/{health,audit-log,tags,comments/bulk,post-analytics,og-upload-url}.js  # Health / audit / tag & comment bulk / post analytics / share image
│   │   ├── admin/{stats/sources,errors,preview-link,webmentions}.js                     # Traffic sources / error log / preview links / webmentions
│   │   ├── admin/{subscribers,subscribers/[id],subscribers/broadcast}.js                # Subscribers / groups / broadcast
│   │   ├── admin/{backups,backups/[id],backups/[id]/restore}.js                         # Backups: list / download & delete / restore
│   │   ├── feed.xml.js · sitemap.xml.js                     # /api/feed.xml · /api/sitemap.xml
│   │   └── [[path]].js                # /api/* catch-all: unknown endpoints return JSON 404 (never HTML)
│   ├── feed.xml.js · sitemap.xml.js   # Root /feed.xml · /sitemap.xml
│   └── _lib/
│       ├── api-core.js                # Core: posts / comments / stats / settings / auth / security headers / rate limiting / RSS / Sitemap
│       ├── search.js · popular.js · relations.js · analytics.js   # Search / popular / relations / post analytics
│       ├── subscribe.js               # Email subscription, subscriber groups, broadcast delivery
│       ├── backup.js                  # R2 backup & restore (with pre-restore snapshot)
│       ├── media.js · music.js · og.js                          # R2 direct upload / music metadata / share image
│       └── ai.js                      # Workers AI wrapper (models / prompts / rate limit / cache / degradation)
├── worker.js                          # Cloudflare Workers entry (routing + static assets + SPA fallback + cache headers)
├── migrations/                        # D1 migrations (auto-applied by CI, ledger-idempotent)
│   ├── 0001_init.sql                  # Base tables (posts / comments / stats / admin_auth / admin_sessions / admin_fails)
│   ├── 0002_site_files.sql            # Site artifacts (feed.xml / sitemap.xml)
│   ├── 0003_cover_column.sql          # Cover column (legacy DBs)
│   ├── 0004_post_meta.sql             # Category / status (legacy DBs)
│   ├── 0005_comment_status.sql        # Comment moderation status (legacy DBs)
│   ├── 0006_media.sql                 # Media library table
│   ├── 0007_settings.sql              # Site settings (key/value)
│   ├── 0008_stats_daily.sql           # Daily view/like aggregates (trend charts)
│   ├── 0009_comment_status_index.sql  # Comment status index
│   ├── 0010_admin_must_change.sql     # Forced password change flag (legacy DBs)
│   ├── 0011_comment_reply.sql         # Comment parent_id (legacy DBs)
│   ├── 0012_clear_orphaned_nav.sql    # Clean up legacy nav config
│   ├── 0013_music.sql                 # Music playlist metadata
│   ├── 0014_purge_base64_media.sql    # Purge legacy base64 media rows
│   ├── 0015_hot_path_indexes.sql      # Hot-path indexes (comments / music / media / sessions)
│   ├── 0016_scheduled_publishing.sql  # Scheduled publishing (publish_at)
│   ├── 0017_post_revisions.sql        # Post revision history
│   ├── 0018_backups.sql               # R2 backup metadata
│   ├── 0019_post_series.sql           # Post series / column + series_order
│   ├── 0020_subscribers.sql           # Email subscribers + mail outbox
│   ├── 0021_post_og_image.sql         # Auto-generated OG share image
│   ├── 0022_media_thumb.sql           # Media thumbnails (WebP)
│   ├── 0023_post_fts.sql              # posts_fts full-text index (trigram)
│   ├── 0024_comment_notifications.sql # Mail outbox kind (post notification vs comment notice)
│   ├── 0025_comment_interactions.sql  # Comment likes / featured / pinned
│   ├── 0026_audit_log.sql             # Admin audit log
│   ├── 0027_stats_sources.sql         # Traffic sources (referrer / device, per-day)
│   ├── 0028_subscriber_groups.sql     # Subscriber groups (JSON array) for segmented broadcast
│   ├── 0029_error_logs.sql            # Front-end error log (grouped by fingerprint)
│   ├── 0030_post_seo.sql              # Per-post SEO overrides (JSON)
│   ├── 0031_webmentions.sql           # Webmentions
│   └── 0032_post_author.sql           # Post author
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
├── smoke-test.js                      # Smoke tests (158 cases)
├── gb-verify.js                       # Guestbook verification (18 cases)
├── search-verify.js                   # Search verification (25 cases)
├── docs/                              # Project documentation (bilingual)
│   ├── README.md                      # 中文说明
│   ├── README_EN.md                   # English docs (this file)
│   ├── DEVELOPMENT.md                 # 开发与架构指南（中文）
│   ├── DEVELOPMENT_EN.md              # 开发与架构指南（英文）
│   ├── CLOUDFLARE_SETUP_GUIDE.md      # Cloudflare setup guide for beginners (中文)
│   ├── CLOUDFLARE_SETUP_GUIDE_EN.md   # Cloudflare setup guide for beginners (English)
│   ├── DEPLOYMENT_SECRETS_GUIDE.md    # GitHub Secrets and R2 tokens (中文)
│   ├── DEPLOYMENT_SECRETS_GUIDE_EN.md # GitHub Secrets and R2 tokens (English)
│   ├── SECURITY.md / SECURITY_EN.md   # Security policy (中文 / English)
│   ├── CODE_OF_CONDUCT.md             # Code of conduct (中文)
│   ├── CODE_OF_CONDUCT_EN.md          # Code of conduct (English)
│   ├── ABOUT.md / ABOUT_EN.md         # About the project (中文 / English)
│   └── CONTRIBUTING.md                # Contributing guide (bilingual inline)
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
| Versioned (`?v=`) or under `/fonts/`, `/flags/`, `/libs/` | `public, max-age=31536000, immutable` |
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
| `posts` | Posts | id, title, date, excerpt, content, cover, og_image, pinned, protected, enc, tags(JSON), category, series, series_order, **author**, status, publish_at, **seo(JSON)** |
| `comments` | Comments | id, post_id, author, content, date, status(approved/pending), **parent_id**, likes, featured, pinned |
| `stats` | Views / likes | post_id, likes, views |
| `stats_daily` | Daily aggregates (trend charts) | post_id, date, views, likes (PRIMARY KEY(post_id,date)) |
| `admin_auth` | Admin password | k, salt, hash, iter, must_change |
| `admin_sessions` | Sessions | token, exp (7 days, absolute timestamp) |
| `admin_fails` | Login-failure limiting | ip, n, until |
| `media` | Media metadata | id, name, url, type, size, created_at |
| `site_settings` | Site settings | k, v |
| `site_files` | Site artifacts | name, content, updated_at |
| `music` | Music metadata | id, title, artist, url, cover, size, duration, sort, created_at |
| `post_revisions` | Post revision history (up to 50 snapshots each) | id, post_id, title, content, tags, status, reason, created_at |
| `subscribers` | Email subscribers | id, email, status(pending/active/unsubscribed), token, locale, **groups(JSON)**, confirmed_at |
| `mail_outbox` | Mail outbox (post notices / comment notices / broadcasts, sent by Cron) | post_id, to_email, status, kind, payload, sent_at |
| `backups` | R2 backup metadata | id, object_key, size, reason, created_at, counts |
| `audit_log` | Admin audit log | id, action, target, detail, ip, created_at |
| `stats_sources` | Traffic sources, per day | post_id, date, kind(ref/device/country/platform/vendor), name, views |
| `error_logs` | Front-end error log (grouped by fingerprint) | fingerprint, kind, message, source, stack, url, ua, hits, last_at |
| `webmentions` | Webmentions from other sites | id, source, target, post_id, author_name, title, excerpt, status, created_at |
| `posts_fts` | D1 FTS5 full-text index (external-content, synced with posts) | id, title, excerpt, content, tags |
| `schema_migrations` | CI ledger | name, applied_at |

Migrations are applied in filename order by CI and are idempotent (`schema_migrations` ledger plus a pre-check for column-adding scripts). `0015_hot_path_indexes.sql` adds 5 hot-path indexes: `idx_comments_post_id`, `idx_comments_status_date`, `idx_music_sort`, `idx_media_created_id`, `idx_admin_sessions_exp`; `0023_post_fts.sql` builds the `posts_fts` index; `0027`-`0032` add traffic sources, subscriber groups, the error log, per-post SEO, Webmentions and the post author field.

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

> **Tip:** "Posts per page" (`pageSize`) and the whole `ads` block can now be edited in the admin under **Settings → Feature switches** (stored in D1 `site_settings.features`, overriding the defaults here — **no code change or redeploy needed**). The same page can also hide newly added navigation items and toggle front-end error reporting, comment anti-bot and diagram/math rendering.

**Navigation precedence**: cloud "Blog settings → Navigation menu" (stored in D1 `site_settings.nav_menu`) > the `NAV` fallback array in `app.js`. The footer nav and friend links work the same way (D1 first, `config.js` as fallback).

### mode Options

| Value | Behavior |
| --- | --- |
| `'auto'` | **Recommended**. Auto-detect: `/api/posts` succeeds → cloud; fails → static |
| `'static'` | Force static mode, `posts.js` only |
| `'api'` | Force cloud mode, requires the backend API |

### Multilingual (i18n)

`i18n.js` ships 5 languages (Chinese / English / 日本語 / 한국어 / हिन्दी) with **993 keys each**. Detection order: `localStorage('blog.locale')` → `navigator.language`, plus a manual switcher. Packs live in `public/locales/<lang>.json`; Chinese is also embedded as a fallback so core text stays readable when previewing via `file://`.

---

## 🛡️ Security

| Layer | Mechanism |
| --- | --- |
| Password storage | PBKDF2-SHA256 salted hash (100,000 iterations, 16-byte random salt), never plaintext |
| First deploy | With `BLOG_ADMIN_SETUP_KEY` set, initialization requires the `X-Setup-Key` header and login before init returns 403 (anti-squatting). Unset: the first login auto-generates a random default password (`xxxx-xxxx`, `must_change=1`) with a first-come race. **Cloud passwords are at least 8 characters**; until it is changed, every admin API except password change/logout returns 403 `PASSWORD_CHANGE_REQUIRED` |
| Static mode | Passwords stored with a `sha256:` prefix (legacy plaintext auto-upgrades), minimum 4 characters (deterrent only) |
| Sessions | 32-byte random token (64 hex characters), valid 7 days, stored in D1 `admin_sessions`; destroyed on logout, and all sessions are cleared when the password changes; a `must_change` session may call only the password-change endpoint |
| Login throttling | **Three tiers, and deliberately no long global lock**: 5 failures per IP → 15 minutes; 15 failures per subnet (IPv4 /24, IPv6 /64) → 60-second cooldown; 30 failures site-wide → **only a 10-second cooldown plus an alert log**. Counters age out after 1 hour, and requests during a lock/cooldown return early **without reading or writing the database** (which also blocks "brute-force yourself out of the free D1 write quota") |
| Break-glass path | A login request carrying the correct `X-Setup-Key` (`BLOG_ADMIN_SETUP_KEY`) **skips every throttle** (but never the password check); the login page reveals that field automatically when throttled. An attacker can delay you by 10 seconds, never lock you out |
| Edge rate limiting (optional) | Setting `BLOG_RATE_LIMIT_BINDING` enables the Workers Rate Limiting binding (`env.LOGIN_LIMITER`) to throttle logins by IP at the Worker entry with no database traffic. You can also put `/api/admin/login` behind Cloudflare Access or a WAF rate limiting rule — see *Hardening the admin login* below |
| API auth | Every write checks `Authorization: Bearer <token>`; comparison is constant-time (SHA-256 digest + XOR) |
| Comment security | Control-character sanitising and HTML escaping, fully parameterised SQL, per-IP rate limiting, Origin validation, **duplicate blocking** (409), 300 comments per post, max 3 levels of nesting |
| Post encryption | AES-GCM-256 + PBKDF2-SHA256 (100k iterations, 16-byte random salt), **fully client-side**; the server stores only the `enc` ciphertext and never sees the plaintext. The admin browser may remember the password locally (this device only) |
| Preview links | HMAC-SHA256 signed (secret from `BLOG_PREVIEW_SECRET`, else derived from the admin password hash) with an expiry; **changing the site password invalidates every issued link**. Preview pages are `noindex`, untracked and comment-free |
| Comment anti-bot | Hidden honeypot field (filled → **silently dropped**) plus a form timestamp (submitting in under 2s is rejected). Invisible to real visitors, toggleable under Feature switches |
| Error-report limits | The public `/api/errors` endpoint allows at most 20 reports per minute per IP, truncates every field, groups by fingerprint and keeps at most 300 rows |
| Vendored dependencies | KaTeX / Mermaid / Smoji are self-hosted under `public/libs/`, so CSP `script-src` stays restricted to `'self'` — no third-party scripts are introduced |
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
node smoke-test.js      # Smoke tests: 158 cases
node gb-verify.js       # Guestbook verification: 18 cases
node search-verify.js   # Search verification: 25 cases
```

All three suites use Node built-ins only (no network, no credentials) and run automatically before every CI deploy — a failure aborts the deploy.

Coverage includes: Markdown rendering / TOC / highlighting, import-export & backups, encrypted posts (round-trip + lock screen + compatibility), per-post SEO, multi-author, **runtime mounting of the whole new admin UI (every page is mounted individually, catching cross-scope variable typos and other runtime ReferenceErrors)**, comments (nesting / paging / blocklist / anti-bot / bulk ops), subscribers & segmented broadcast, Webmention, error log, draft preview links, vendored diagrams / math, static site export, print styles, i18n integrity (5 locale packs and the embedded fallback stay key-for-key identical with no duplicates), PWA, RSS / Sitemap, and the cloud API + caching strategy.

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
| Music API works on both runtimes | `/api/music*` ships both as Pages Functions and in `worker.js`, so music works under Workers and Pages deployments alike |
| Encryption password cannot be recovered | Encryption runs in the browser (AES-GCM + PBKDF2) and the server stores only ciphertext. The password lives solely in your browser — if you lose it, the post cannot be decrypted, so back the password up |
| Editing a post keeps its original date | If you don't change the date explicitly, the original value is preserved (editor + server double fallback), so editing an old post never pushes it to the top |
| Tag rename is O(n) | Renaming or deleting a tag issues one PUT per affected post, sequentially |
| A throttled login means a short wait | Once throttled, even the correct password has to wait 10 seconds (global cooldown) / 60 seconds (same subnet) / 15 minutes (your own IP) — unless you use the setup-key break-glass path. This is deliberate: still running PBKDF2 while locked would turn a login DoS into a CPU/quota DoS |
| Admin search filters client-side | List search filters rows already fetched (10-24 per page); with very large datasets the first load still takes longer |
| Unknown paths return a real 404 | Known SPA routes still answer 200; every other extension-less path returns a real 404 status and renders the "not found" page |
| Diagrams / math load on demand | Mermaid is ~2.7 MB (≈900 KB gzipped) and KaTeX ≈560 KB with fonts; they load **only when a post actually uses them** and are then cached. Turn both off under Feature switches → Content rendering |
| Webmentions need the sender | A mention is only stored when the source site actually sends a Webmention notification; removing the link upstream does not delete the entry automatically (use Admin → Webmentions) |
| Static export excludes media | The exported ZIP contains pages and static assets only; images / audio hosted on R2 must stay publicly reachable |
| Preview links expire | Draft preview links are valid for **7 days** by default (1-30 allowed), and **changing the site password invalidates every issued link immediately** |
| No raw IPs are stored | Traffic stats keep only the two-letter country derived by Cloudflare edge geolocation plus device / OS / brand inferred from the UA — never the raw IP |
| Error log is bounded | Errors are grouped by identical message and only the most recent **300** entries are kept |

---

## 📚 Documentation Index

Every document ships in both Chinese and English: long documents come as a pair (`X.md` + `X_EN.md`), while the short ones (the contributing guide and the issue/PR templates) are bilingual inside a single file. (`LICENSE` is the exception: the MIT text is canonical in English and is deliberately left untranslated.)

| English | 中文 | Contents |
| --- | --- | --- |
| [README_EN.md](README_EN.md) | [README.md](README.md) | Project overview: quick start, features, directory structure, Cloudflare services, configuration, security, tests |
| [DEVELOPMENT_EN.md](DEVELOPMENT_EN.md) | [DEVELOPMENT.md](DEVELOPMENT.md) | Development and architecture: runtime structure, directory responsibilities, API map, D1 model, configuration, tests, release and extension points |
| [CLOUDFLARE_SETUP_GUIDE_EN.md](CLOUDFLARE_SETUP_GUIDE_EN.md) | [CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md) | **Cloudflare setup guide for beginners**: account, D1, KV, API tokens, R2, Workers AI, custom domains, secrets, deploy, self-check, troubleshooting, free-tier limits |
| [DEPLOYMENT_SECRETS_GUIDE_EN.md](DEPLOYMENT_SECRETS_GUIDE_EN.md) | [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md) | Focused on GitHub Secrets and R2 tokens: where each secret comes from, what to put in it, one bucket or two tokens |
| [SECURITY_EN.md](SECURITY_EN.md) | [SECURITY.md](SECURITY.md) | How to report a vulnerability, plus the built-in security measures |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Same file (bilingual inline) | Contribution workflow |
| [CODE_OF_CONDUCT_EN.md](CODE_OF_CONDUCT_EN.md) | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community code of conduct |
| [ABOUT_EN.md](ABOUT_EN.md) | [ABOUT.md](ABOUT.md) | About the project and the author |

---

## 📄 License

[MIT](../LICENSE)

---

<p align="center">
  If Qingyu'Blog helps you, feel free to ⭐ Star / Fork, or open an <a href="https://github.com/kejiland/qingyu-blog/issues">Issue</a>.
</p>

<p align="center">
  <b>If you find this project useful, please give it a ⭐ Star — it helps others discover it!</b>
</p>
