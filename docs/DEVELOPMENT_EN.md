> 🌐 **English** · [中文](DEVELOPMENT.md)

# Development Guide

> For secondary development, maintenance and deployment troubleshooting. Current version: **v2.10.70** (2026-10-07).
>
> This document lives in `docs/`; unless stated otherwise, run every command from the **repository root**.

---

## 1. Design Principles

| Principle | Meaning |
| --- | --- |
| Static first | `public/index.html` opens directly over `file://`; writing, export and preview still work without a backend |
| No framework | The public site and admin panel use vanilla HTML / CSS / JavaScript — no React, Vue or bundler |
| No build required to run | Source files are the runtime; `.min.*` files are generated only for a release via `scripts/minify.mjs` |
| Cloud optional | D1 / KV / R2 / Workers AI / Resend are opt-in. Missing bindings degrade features instead of taking down the site |
| Lazy loading | Admin, music player, seasonal animation, Mermaid and KaTeX load only on their route or when actually used |
| Secure by default | Escaped input, parameterised SQL, fail-closed CORS, token-authenticated admin writes and security headers |

---

## 2. Runtime Architecture

```
Browser
├── public/app.js             Public SPA, routing, editor, local-first features
├── public/admin.js           Admin slice, lazy-loaded under /admin
├── public/music-player.js    Site-wide music player
├── public/bg-anim.js         Seasonal canvas animation
├── public/i18n.js            5-language runtime and fallback
└── public/sw.js              PWA shell and offline cache
        │
        ▼
Cloudflare Worker (worker.js)
├── /api/*                    Dispatch to functions/_lib and functions/api
├── /feed.xml /sitemap.xml    Dynamic feeds
├── Static assets             Read public/ through the [assets] binding
└── Cron                     Scheduled publishing + mail outbox every 5 min; daily backup
        │
        ├── D1 (DB)             Posts / comments / settings / stats / subscribers / audit / errors
        ├── KV (BLOG)           Rate limiting / dedup / AI cache
        ├── R2                  Music, media images, private backups
        ├── Workers AI (AI)     Summary / writing assistant / comment tools, Workers-only
        └── Resend              Email subscription and notifications, optional
```

### Two deployment shapes

| Shape | Entry | Notes |
| --- | --- | --- |
| Workers | `worker.js` + `wrangler.workers.toml` | Recommended; full API, Cron, AI, dynamic RSS / Sitemap |
| Pages Functions | `functions/` + `wrangler.toml` | Reuses the same `_lib` handlers; the AI binding is absent, so AI stays 404 |

---

## 3. Directory Responsibilities

| Path | Responsibility |
| --- | --- |
| [../public/](../public/) | Site itself: public UI, admin, styles, i18n, PWA and local-first features |
| [../functions/api/](../functions/api/) | Pages Functions route wrappers; Workers reuses the same handlers |
| [../functions/_lib/](../functions/_lib/) | Core business logic: API, search, analytics, backups, mail, media, music, AI, Webmention |
| [../worker.js](../worker.js) | Workers entry: API dispatch, SPA / 404 / static asset / header handling |
| [../migrations/](../migrations/) | D1 migrations, applied idempotently in filename order by CI |
| [../scripts/](../scripts/) | Minify, KV → D1 migration and screenshot tooling |
| [../.github/workflows/](../.github/workflows/) | Automatic deploy and one-off migration workflows |
| [../smoke-test.js](../smoke-test.js) | Main smoke tests: API, UI runtime and regression coverage |
| [../gb-verify.js](../gb-verify.js) | Guestbook verification |
| [../search-verify.js](../search-verify.js) | Full-text search verification |

---

## 4. Local Development

### 4.1 Static mode (fastest)

```bash
# Double-clicking public/index.html also works
python -m http.server 8080 -d public
# Open http://localhost:8080/
```

Static mode uses `posts.js` plus browser `localStorage`. It is ideal for the public UI, editor, import/export and local-first features; it does not exercise cloud API behaviour.

### 4.2 Cloud mode

1. Create D1 / KV and prepare the real IDs in a temporary configuration.
2. Never commit real IDs; keep the `{env.*}` placeholders in `wrangler.workers.toml`.
3. Temporarily replace the placeholders for local debugging, then run:

```bash
npx wrangler dev -c wrangler.workers.toml
```

Use `wrangler.toml` when validating Pages Functions. Use `wrangler.workers.toml` when validating Cron, AI or the full Workers surface.

### 4.3 Required tests

```bash
node smoke-test.js      # 158 cases
node gb-verify.js       # 18 cases
node search-verify.js   # 25 cases
```

All three use only Node built-ins. CI runs them before deploy and stops on failure.

### 4.4 Minify front-end assets after changes

```bash
node scripts/minify.mjs
```

The script calls terser / clean-css-cli through `npx` as needed and writes `public/*.min.js` and `public/*.min.css`. Before a release, also keep these three version markers in sync:

- `BLOG_VERSION` in `public/app.js`
- every `?v=` in `public/index.html`
- `CACHE_VERSION` in `public/sw.js`

---

## 5. Request Lifecycle

1. The browser reads `mode` from `public/config.js`.
2. In `auto` mode it probes `/api/posts`: success selects cloud mode, failure selects static mode.
3. The Worker matches `/api/*`, then RSS / Sitemap, then the `ASSETS` binding.
4. Known SPA routes return the app shell with 200; unknown extensionless routes return a real 404; unknown `/api/*` always returns JSON 404.
5. Admin writes use `Authorization: Bearer <session>` and pass through CORS, security headers, rate limiting and audit logging.

---

## 6. API Map

> This is a grouped index, not a complete request contract. When adding or changing routes, [../worker.js](../worker.js) is the source of truth.

| Group | Representative endpoints | Auth / notes |
| --- | --- | --- |
| Posts | `GET /api/posts`, `GET/POST /api/posts/:id`, `PUT/DELETE /api/posts/:id` | Public reads; admin session for writes |
| Search / ranking | `GET /api/search`, `GET /api/popular` | Public; FTS5 trigram with LIKE fallback for short terms |
| Comments / guestbook | `GET/POST /api/posts/:id/comments`, `DELETE /api/posts/:id/comments/:cid`, `POST /api/comments/:id/like` | Public reads; moderation / bulk operations need admin |
| Analytics | `GET /api/posts/:id/stats`, `GET /api/stats/trend`, `GET /api/admin/stats/sources` | Public stats; source aggregation needs admin |
| Relations / revisions | `GET /api/posts/:id/relations`, `GET /api/posts/:id/revisions`, `POST .../:revision/restore` | Public reads; restore needs admin |
| RSS / Sitemap | `GET /api/feed.xml`, `GET /api/sitemap.xml`, `GET /feed.xml`, `GET /sitemap.xml` | Public; drafts and encrypted posts excluded |
| Subscription / mail | `POST /api/subscribe`, `GET/POST /api/subscribe/confirm`, `/api/subscribe/unsubscribe`, `/api/admin/subscribers/*` | Public signup; admin list / broadcast |
| Media / music | `/api/media`, `/api/media/upload-url`, `/api/music`, `/api/music/upload-url` | Public reads; admin upload / edit / delete, direct-to-R2 |
| Preview links | `POST /api/admin/preview-link`, `GET /api/preview?token=...` | Admin generates; HMAC token allows anonymous reading |
| Webmention | `POST /api/webmention`, `GET /api/webmention`, `/api/admin/webmentions/*` | Public receiver; admin management |
| Error log | `POST /api/errors`, `GET/DELETE /api/admin/errors` | Public rate-limited reporting; admin read / clear |
| AI | `/api/ai/ping`, `summary`, `assist`, `comments` | Requires the Workers AI binding; can be disabled by `BLOG_AI_ENABLED` / `BLOG_AI_PUBLIC` |
| Admin operations | `/api/admin/health`, `/api/admin/audit`, `/api/admin/backups/*`, `/api/admin/tags` | Admin session; writes are audited |
| Authentication | `POST /api/admin/setup`, `login`, `logout`, `password` | `setup` may require `X-Setup-Key`; the rest use session tokens |

---

## 7. D1 Data Model

| Group | Tables |
| --- | --- |
| Content | `posts`, `post_revisions`, `comments`, `posts_fts` |
| Analytics | `stats`, `stats_daily`, `stats_sources`, `error_logs` |
| Accounts / audit | `admin_auth`, `admin_sessions`, `admin_fails`, `audit_log` |
| Site configuration | `site_settings`, `site_files` |
| Media / music | `media`, `music` |
| Subscription / mail | `subscribers`, `mail_outbox` |
| Backups / references | `backups`, `webmentions` |
| Migration ledger | `schema_migrations` |

Migrations currently run from `0001_init.sql` through `0032_post_author.sql`. When adding one:

1. Use the next number, e.g. `0033_xxx.sql`.
2. Prefer idempotent SQL: `IF NOT EXISTS` and preflight checks before adding columns.
3. Run all tests locally; inspect [../migrations/](../migrations/) for the current schema.
4. The deploy workflow applies migrations before deploying the Worker.

---

## 8. Configuration and Switches

| Location | Purpose |
| --- | --- |
| `public/config.js` | Static defaults: `mode`, `siteUrl`, `pageSize`, footer and ads |
| D1 `site_settings.features` | Admin → Feature switches: pagination, ads, error reporting, comment anti-bot, Mermaid / KaTeX |
| D1 `site_settings.nav_menu` | Admin navigation, preferred over the code fallback |
| `wrangler.workers.toml` | Workers bindings, Cron and non-sensitive runtime variables |
| GitHub Secrets | D1 / KV / R2 / Resend / AI / cache purge / setup key and other deploy settings |

See the [README runtime environment variable table](README_EN.md#full-table-of-runtime-environment-variables) and [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md) for the complete list.

---

## 9. Recent Updates (2026-10-03 / 04)

| Date | Area | Change |
| --- | --- | --- |
| 2026-10-03 | Data & admin | Trend charts and CSV stats, comment email notifications, comment likes / featuring / pinning, announcement bar, comment sorting + pagination |
| 2026-10-03 | Editor & reading | Editor table / task list / code block tools, word count, reading-position memory, text highlighting, font size and mobile floating TOC |
| 2026-10-03 | Content model | Category page and home filter, reading history / read later, links page, bulk tag API, server-side article search and pagination |
| 2026-10-03 | Security & deploy | Forced password change, 8-character password rule, real 404s, Pages / Workers music API parity |
| 2026-10-04 | Content & distribution | Per-post SEO, Mermaid / KaTeX, draft preview links, static site export, print / PDF, Webmention, multi-author |
| 2026-10-04 | Admin & observability | Feature switches, media / music / subscriber / backup pagination improvements, health check, error log, country / source / device insight, dashboard smoke coverage |
| 2026-10-04 | Stability | i18n fallback and self-healing, admin comments / post pagination regression fixes, source tracking fix, UI runtime smoke tests |
| 2026-10-04 | Documentation | Docs moved under `docs/`; README, deployment guides, security docs, llms.txt and this development guide synced to v2.10.63 |
| 2026-10-04 | Navigation | Legacy `nav_menu` data is merged with newly added defaults on first load; once saved, items deliberately removed by the owner are not re-added |
| 2026-10-04 | Navigation switch | Feature switches can hide the newly added defaults (Categories / History / Series / Popular) while keeping base navigation and custom links |
| 2026-10-05 | Admin display | Removed raw Mermaid / math syntax from feature-switch hints; AI results now use normal text layout instead of a code block |
| 2026-10-06 | First-paint stability | Timeout fallbacks for locale/API loads (a hung request no longer freezes the page), inline-style fallback for the Explore dropdown, trimmed Service Worker precache |
| 2026-10-07 | v2.10.66 | Unified all dropdown carets
| 2026-10-07 | v2.10.67 | Fixed the active state of the top-bar "Discover" item looking offset to the right: the caret is now absolutely positioned inside the right padding so the button is no longer wider than its siblings, and the active underline covers only the label width |
| 2026-10-07 | v2.10.68 | Fix 「发现」 dropdown item alignment: dropdown entries no longer inherit the top-nav underline style; now a left-aligned list with left accent bar + soft highlight for the active item. |
| 2026-10-07 | v2.10.69 | Admin nav editor supports custom dropdowns: any top-level item can host a submenu, submenus can be toggled into the 「发现」 group, and nav entries are freely drag-and-drop reorderable across levels |
| 2026-10-07 | v2.10.70 | Unify dropdown styling globally: the built-in 「发现」 menu and custom top-level dropdowns share one set of caret position, size, color and expanded-state rules, so any new dropdown added in the admin matches automatically |
| 2026-10-07 | v2.10.71 | 展开态配色统一：自定义下拉展开时主链接文字与箭头一起变为强调色（此前只有箭头变色），桌面顶栏与手机侧栏同步生效 |
| 2026-10-07 | v2.10.72 | 紧急修复：修正 index.html 中 app.min.js 脚本地址多出的反斜杠，导致线上主脚本 404、页面永久停在「加载中」；同时首屏渲染抛错时不再卡死加载动画（改为显示错误与返回首页），「发现」下拉无内容时不再渲染空菜单 |
| 2026-10-07 | v2.10.73 | 修正「发现」字号偏小：下拉触发按钮上的 font 简写会把字号重置为 16px（其他导航 18.5px），改为只继承字体族；侧栏导航同步继承字体族 |

---

## 10. Tests and CI

```text
push / workflow_dispatch
  → checkout
  → Node 24
  → install wrangler (3.90 normally, 4.36+ when edge rate limiting is enabled)
  → smoke-test / gb-verify / search-verify
  → check required secrets
  → apply D1 migrations
  → deploy Worker
  → write runtime secrets (non-empty only)
```

CI never deploys when a test fails. When troubleshooting production, check:

1. The Actions test output.
2. Cloudflare Worker logs.
3. Admin → Health check / Audit log / Front-end error log.
4. Whether `/api/posts` returns 200, to separate Worker / D1 / front-end issues.

---

## 11. Release Checklist

- [ ] Source and minified assets regenerated (`node scripts/minify.mjs`)
- [ ] `BLOG_VERSION` / `index.html ?v=` / `CACHE_VERSION` all bumped together
- [ ] All three test suites pass
- [ ] New database fields have an idempotent migration
- [ ] New secrets / variables are documented and wired into GitHub Actions
- [ ] README, docs index and this development guide are updated
- [ ] Push `main`, wait for Actions, then verify the live API and home page

---

## 12. Common Extension Points

| Task | Where to change |
| --- | --- |
| Add a public route | `public/app.js`; update `isKnownSpaRoute` in `worker.js` when needed |
| Add an API | Handler in `functions/_lib/`, dispatch in `worker.js`, Pages wrapper in `functions/api/` |
| Add an admin page | `public/admin.js` / `admin.css`; add the route and lazy-loaded assets |
| Add a database field | `migrations/NNNN_*.sql` plus backup / restore / import / export |
| Add i18n text | All five `public/locales/*.json` files + `public/i18n.js` fallback + completeness test |
| Add a security-sensitive feature | Update `SECURITY.md`, audit logging, rate limiting and tests |

---

## 13. Compatibility and Limits

| Scenario | Behaviour |
| --- | --- |
| `file://` | Static mode only; cloud API, R2, AI and mail unavailable |
| Pages Functions | API works; the Workers AI binding is unavailable |
| D1 not configured | Cloud endpoints unavailable; static experience still works |
| KV not configured | Rate limiting / dedup / AI cache degrade; core features still work |
| R2 not configured | Image / music upload and backups are disabled; other features still work |
| Resend not configured | Subscription and notifications are disabled |
| JavaScript disabled | The SPA cannot render; this is an intentional trade-off |

---

## 14. Documentation Map

| Document | Purpose |
| --- | --- |
| [README.md](README.md) | Project overview, features, variables and quick start |
| [CLOUDFLARE_SETUP_GUIDE.md](CLOUDFLARE_SETUP_GUIDE.md) | Cloudflare deployment from scratch |
| [DEPLOYMENT_SECRETS_GUIDE.md](DEPLOYMENT_SECRETS_GUIDE.md) | GitHub Secrets and R2 tokens |
| [SECURITY.md](SECURITY.md) | Security policy and reporting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution workflow and commit convention |
| [ABOUT.md](ABOUT.md) | Project introduction |
