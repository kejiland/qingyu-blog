> 🌐 **English** · [中文](SECURITY.md)

# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please do **NOT** report it through a public GitHub Issue.

Instead, contact the maintainer privately through one of the channels below, and we will deal with it as soon as possible. We will respond as quickly as possible and coordinate a fix before public disclosure:

- GitHub: [@kejiland](https://github.com/kejiland)

## Security Measures

This project ships with multiple layers of built-in protection:

| Layer | Mechanism |
|---|---|
| Password storage | PBKDF2-SHA256 salted hash (100,000 iterations), passwords at least 8 characters long |
| Session management | Random token, valid for 7 days; expired sessions are also pruned on login |
| Rate limiting | **Three tiers, deliberately without a long global lock**: 5 consecutive failures from the same IP → 15 minutes; 15 failures from the same subnet (IPv4 /24, IPv6 /64) → 60-second cooldown; 30 failures site-wide → **only a 10-second cooldown plus an alert log**. A login request carrying the correct `X-Setup-Key` (`BLOG_ADMIN_SETUP_KEY`) is a break-glass path that skips every throttle but never the password check; counters age out after 1 hour, and requests during a lock or cooldown return early **without reading or writing the database**. Only `CF-Connecting-IP` is trusted, never the spoofable `X-Forwarded-For` |
| Administrator initialisation | `BLOG_ADMIN_SETUP_KEY` is optional: once configured, initialisation must be explicit and carry the `X-Setup-Key` header (anti-squatting), and any login before initialisation returns 403; when it is unset the old behaviour applies — the first login auto-generates a random default password (mustChange=true, with a first-come-first-served race, so configuring the key is recommended for a brand-new deployment). Until it is changed, admin APIs return 403 `PASSWORD_CHANGE_REQUIRED`; only password change and logout are allowed |
| Security response headers | Every HTTP response carries CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / COOP (fully in effect under a Workers deployment; for pure-static Pages assets the host returns them directly, while API responses always carry them) |
| Post encryption | The editor can encrypt a post body: **AES-GCM-256 + PBKDF2-SHA256 (100k iterations), fully client-side**. Plaintext is never uploaded — the server stores only the ciphertext (`enc`). Readers decrypt in the browser with a password that is never stored server-side. The admin editor can remember it in this browser (plaintext localStorage) for later viewing — avoid on shared machines |
| Preview links | HMAC-SHA256 signed (secret from `BLOG_PREVIEW_SECRET`, otherwise derived from the admin password hash) with an expiry; **changing the password invalidates every issued link**. Preview pages are `noindex`, untracked, comment-free and served with `no-store` |
| Comment anti-bot | Hidden honeypot field (filled → **silently dropped**) plus a form timestamp (under 2s is treated as a bot); HTTP-level per-IP rate limiting and duplicate blocking still apply |
| Front-end error reporting | The public `/api/errors` endpoint allows at most 20 reports per minute per IP; every field is truncated; errors are grouped by fingerprint and capped at 300 rows so the table cannot be flooded |
| Webmention | A mention is stored only after **fetching the source page and verifying it really links to the post** (8s timeout, 200 KB cap, HTML only); the `target` must resolve to an existing post on this site |
| Traffic-stat privacy | Only the two-letter country from Cloudflare edge IP geolocation plus UA-derived device info are stored — **never the raw IP**; likes/views deduplicate on hashed keys |
| Vendored third-party libs | KaTeX / Mermaid / Smoji are self-hosted under `public/libs/`, so CSP `script-src` stays restricted to `'self'` |
| Comment security | XSS escaping + parameterised SQL against injection + rate limiting + duplicate-submission blocking |

---

> The Chinese version is at [SECURITY.md](SECURITY.md).
