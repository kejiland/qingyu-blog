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
| Administrator initialisation | `BLOG_ADMIN_SETUP_KEY` is optional: once configured, initialisation must be explicit and carry the `X-Setup-Key` header (anti-squatting), and any login before initialisation returns 403; when it is unset the old behaviour applies — the first login auto-generates a random default password (mustChange=true, with a first-come-first-served race, so configuring the key is recommended for a brand-new deployment) |
| Security response headers | Every HTTP response carries CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / COOP (fully in effect under a Workers deployment; for pure-static Pages assets the host returns them directly, while API responses always carry them) |
| Post encryption | The API reserves the `enc` / `protected` fields (so externally encrypted posts can be imported); the editor does not yet expose an end-to-end encryption UI |
| Comment security | XSS escaping + parameterised SQL against injection + rate limiting + duplicate-submission blocking |

---

> The Chinese version is at [SECURITY.md](SECURITY.md).
