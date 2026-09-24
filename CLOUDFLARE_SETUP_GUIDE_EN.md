> 🌐 **English** · [中文](CLOUDFLARE_SETUP_GUIDE.md)

# The Complete Cloudflare Setup Guide (Beginner Edition)

> This guide is aimed at readers **using Cloudflare for the first time**: it assumes you know only a little about the command line and have never touched Workers, D1, KV or R2.
> Work through this document from top to bottom and you will end up with a complete blog running on Cloudflare's edge network.
>
> Related documents:
> - [README_EN.md](README_EN.md) — what the project is and how to use it
> - [DEPLOYMENT_SECRETS_GUIDE_EN.md](DEPLOYMENT_SECRETS_GUIDE_EN.md) — covers only GitHub Secrets and R2 tokens (this document is a superset that includes that part too)
>
> A note on quoted messages: the Worker's runtime messages and the CI validation messages are hard-coded in Chinese, so this guide quotes them verbatim and adds an English gloss in parentheses — that way you can match what you actually see in your terminal, in the Worker logs or in an API response.

---

## 0. The bottom line: how many things you need to do

| Step | What to do | Required? | Roughly how long |
| --- | --- | --- | --- |
| 1 | Sign up for a Cloudflare account and find the **Account ID** | ✅ Required | 5 minutes |
| 2 | Create the **D1 database** and note down `database_id` | ✅ Required | 3 minutes |
| 3 | Create the **KV namespace** and note down `id` | ✅ Required | 3 minutes |
| 4 | Create a **Cloudflare API Token** (for deploying) | ✅ Required | 5 minutes |
| 5 | Put the four values into **GitHub Secrets** | ✅ Required | 5 minutes |
| 6 | Push the code / run the Action manually, then wait for the deploy to finish | ✅ Required | 3 minutes |
| 7 | Open `/admin` and initialize the admin password | ✅ Required | 2 minutes |
| 8 | Create the **R2 buckets** + custom domain + CORS + R2 token | ⭕ Optional (for image/music uploads) | 20 minutes |
| 9 | Bind a **custom domain** and configure the Zone ID (purge the cache on publish) | ⭕ Optional | 10 minutes |
| 10 | Turn on **Workers AI** (post summaries / writing assistant / comment digests) | ⭕ Optional | 3 minutes |
| ⭐ | **Harden the admin login** (Cloudflare Access / rate limiting rule, see [section 9](#9-hardening-the-admin-login-optional-strongly-recommended)) | ⭕ Strongly recommended | 10 minutes |

**As soon as steps 1–7 are done, the blog is already fully usable.** Steps 8, 9 and 10 are "nice extras": skipping them raises no errors, and the corresponding features degrade gracefully (the upload button returns 503, the AI entries hide themselves).
The ⭐ row is not a functional step, but it removes both the brute-force risk and the "admin panel locked out" risk in one go, so it is worth doing while you are here.

> 💡 **Zero cost** throughout. A personal blog's usage is far below Cloudflare's free-tier quotas; see [section 16](#16-free-tier-quotas-and-cost) for the actual numbers.

---

## 1. Which Cloudflare services this project uses

```
                    ┌────────────────────────────────────────────────────┐
                    │  Cloudflare Workers (compute + static assets)      │
                    │  ├── /api/*  →  backend API                        │
                    │  └── rest    →  public/ static pages               │
                    └───────┬───────────────────┬───────────────────┬────────┘
                            │                   │                   │
                    ┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
                    │ D1             │  │ KV             │  │ R2             │
                    │ primary DB     │  │ rate limit     │  │ images/audio   │
                    │ posts/comments │  │ dedup/AI cache │  │ direct upload  │
                    └────────────────┘  └────────────────┘  └────────────────┘
                            │
                    ┌───────▼─────────────────┐
                    │ Workers AI              │  summaries / polish / comment digests
                    └─────────────────────────┘
```

| Service | What it does in this project | Required | Binding name in the code |
| --- | --- | --- | --- |
| **Workers** | Runs the backend API and also hosts the static assets in `public/` | ✅ | `ASSETS` (static assets) |
| **D1** | Primary database: posts, comments, stats, passwords, settings, music metadata | ✅ | `DB` |
| **KV** | Comment/like/view rate limiting and dedup, AI usage counters and summary cache | ✅ (it runs without it, but rate limiting and dedup stop working) | `BLOG` |
| **R2** | Stores the **file bodies** of images and audio (direct upload, never through the Worker) | ⭕ | Accessed through environment variables |
| **Workers AI** | Post summaries, writing assistant (titles/polish/translation), comment digests and spam screening | ⭕ | `AI` |
| **Cache Purge** | Clears the edge cache after you publish a post so the new content takes effect immediately | ⭕ | Through the API token |

> ⚠️ One important precondition: this project deploys to **Workers** (config file `wrangler.workers.toml`), not Cloudflare Pages.
> The two look very similar, but the music endpoints (`/api/music*`) are implemented only in `worker.js`, so **music is unavailable under a Pages deployment**. Beginners should always follow the Workers path described here.

---

## 2. Preparing your account and domain

### 2.1 Signing up for Cloudflare

1. Open <https://dash.cloudflare.com/sign-up>;
2. Enter your email and a password, then click the verification link in your inbox;
3. After logging in you will see entries such as "Workers & Pages", which means the account was created successfully.

### 2.2 Finding the Account ID

`CLOUDFLARE_ACCOUNT_ID` is exactly this: a 32-character hexadecimal string (for example `a1b2c3d4e5f678901234567890abcdef`). There are three ways to find it:

| Method | What to do |
| --- | --- |
| **Look at the address bar** (fastest) | After logging in the URL looks like `dash.cloudflare.com/<this string is the Account ID>/...` |
| **Look in the dashboard** | Click **Workers & Pages** in the left sidebar → on the right (or on the Overview page) there is an **Account ID** field; click to copy |
| **Look on the domain page** | Open any domain → Overview → the **API** section in the lower right also shows the Account ID |

> 🔎 Look for the exact words **Account ID**. It is not the same as the **Zone ID** (domain ID) — do not mix them up.

### 2.3 Do you need a domain? (you can start without one)

- **It works without a domain**: Workers gives you a `https://<worker-name>.<your-account-subdomain>.workers.dev` address by default, which you can visit straight away.
- **If you want your own domain** (recommended, and it looks more like a proper site):
  1. Get a domain (any registrar will do);
  2. Cloudflare dashboard → **Add a site** → enter the domain → choose the **Free** plan;
  3. Cloudflare gives you two **nameservers** (in the form `xxx.ns.cloudflare.com`);
  4. Go back to your registrar's control panel, change the DNS servers to those two and wait for it to take effect (a few minutes to 24 hours);
  5. Once the status becomes **Active** you are done.

### 2.4 Installing Node.js and Wrangler (for the local command line, optional)

If you plan to **do everything by clicking in the browser**, you can skip this section. But some operations (creating D1/KV, checking logs) are easier from the command line:

```bash
# 1) Install Node.js 20 or newer (https://nodejs.org)
node -v      # should print v20.x or above

# 2) Log in to Cloudflare (a browser window opens for you to authorize)
npx wrangler login

# 3) Verify the login status
npx wrangler whoami
```

`wrangler whoami` prints your account email and Account ID — this is the Account ID from section 2.2, ready to copy.

---

## 3. Creating the D1 database (required)

D1 is this blog's **primary database**: posts, comments, stats and the administrator password all live here.

### Method A: the web dashboard (recommended for beginners)

1. Left sidebar → **Workers & Pages**;
2. Find **D1 SQL database** at the top or in the left sidebar;
3. Click **Create database**;
4. Set **Database name** to `blog` (it must be called `blog`, because `wrangler.workers.toml` hard-codes `database_name = "blog"`);
5. Pick a **Location** close to your readers (for example `APAC`); if you are unsure, keep the default;
6. After creating it, open the database detail page and find the **Database ID** — a **UUID (with hyphens)** such as `0fa366ac-f04a-4be2-8e11-5adc6ee6d686`.

### Method B: the command line

```bash
npx wrangler d1 create blog
```

The output contains:

```toml
[[d1_databases]]
binding = "DB"
database_name = "blog"
database_id = "0fa366ac-f04a-4be2-8e11-5adc6ee6d686"
```

Just copy down `database_id` (you do **not** need to edit any file in the repository by hand for this step — CI substitutes it automatically).

### Format validation (very important)

| Item | Correct format | Wrong examples |
| --- | --- | --- |
| D1 `database_id` | 36-character UUID: hexadecimal `8-4-4-4-12` with hyphens | ❌ The database name `blog`<br>❌ A KV 32-character id |

The deploy workflow validates this: with the hyphens removed it must be 32 hexadecimal characters, otherwise it fails immediately with
`BLOG_D1_ID 不是有效的 D1 database_id` (BLOG_D1_ID is not a valid D1 database_id).

### What about creating the tables?

**You do not need to create tables by hand.** Before deploying, GitHub Actions creates the tables and adds the indexes automatically from `migrations/*.sql` (0001 to 0015), and writes to the `schema_migrations` ledger table so that repeated runs are safe.

If you want to look for yourself, run this in the D1 detail page → **Console**:

```sql
SELECT name FROM sqlite_master WHERE type='table';
```

---

## 4. Creating the KV namespace (required)

KV is used for **rate limiting, dedup and the AI cache** (for example "at most 5 comments per IP per minute" and "one view per IP per post").

### Method A: the web dashboard

1. **Workers & Pages** (or **Storage & Databases** in the left sidebar) → **KV**;
2. Click **Create namespace**;
3. Name it `BLOG` (any name works, but `BLOG` is recommended so that it matches the binding name and is easy to cross-check);
4. The list then shows an **ID** — a 32-character hexadecimal string such as `0123456789abcdef0123456789abcdef`.

### Method B: the command line

```bash
npx wrangler kv namespace create BLOG
```

The `id = "..."` in the output is it.

> ⚠️ **The easiest trap to fall into**: a KV `id` in `wrangler.toml` **does not support `{env.X}` environment-variable interpolation** (D1 does, KV does not).
> That is why this project's deploy workflow uses a short Python script to replace the
> `{env.BLOG_KV_ID}` placeholder in `wrangler.workers.toml` **with the real value**, generating a temporary `wrangler.workers.ci.toml` before deploying.
> You do not need to edit any file by hand — just fill in `BLOG_KV_ID` correctly.

### What happens if KV is not configured?

The blog still runs, but the following protections **silently stop working** (a single warning is logged in the Worker logs):

- Comment rate limiting (5 per minute)
- Like/view rate limiting and dedup
- AI usage counters and the summary cache (the usage caps stop working, so mind your quota)

So **configuring it is strongly recommended**.

---

## 5. Creating an API Token (required, and the easiest step to get wrong)

### 5.1 First, tell the three kinds of "token" apart

90% of beginner confusion comes from here:

| Name | Where to create it | Purpose | Corresponds to this project |
| --- | --- | --- | --- |
| **Account API Token** | Avatar → My Profile → **API Tokens** | Lets GitHub Actions deploy the Worker, run D1 migrations and purge the cache | `CLOUDFLARE_API_TOKEN` (GitHub Secret) |
| **R2 API Token** (S3 credentials) | **R2** → **API** → Manage API Tokens | Lets the Worker sign R2 direct-upload URLs for the browser | `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` (two GitHub Secrets) |
| **Global API Key** | Avatar → My Profile → bottom of API Tokens | A master key — **do not use it** | ❌ Not used by this project |

- An Account API Token is an ordinary string.
- An R2 API Token gives you a **pair** of values: `Access Key ID` + `Secret Access Key` (the secret is shown only once, at creation time, so save it immediately).

### 5.2 Steps to create an Account API Token

1. **Avatar** in the top right → **My Profile**;
2. **API Tokens** in the left sidebar → **Create Token**;
3. Scroll to the bottom and choose **Create Custom Token**;
4. Give **Token name** something recognisable, such as `qingyu-blog-deploy`;
5. Add **Permissions** one by one, following the table below:

| Permission group | Resource | Level | Why it is needed | Required |
| --- | --- | --- | --- | --- |
| Account | Workers Scripts | **Edit** | Deploy / update the Worker | ✅ |
| Account | D1 | **Edit** | Run database migrations before deploying | ✅ |
| Account | Workers KV Storage | **Edit** | Deploy the KV binding | ✅ |
| Zone | Cache Purge | **Purge** | Purge the edge cache after publishing a post | ⭕ Optional |
| Account | Workers AI | **Edit** | Create the AI binding on the first deploy | ⭕ Optional (only needed if you enable AI) |
| Account | Account Settings | **Read** | Some wrangler commands need to read account information | ⭕ Recommended |

6. **Account Resources**: choose `Include` → your account;
7. **Zone Resources** (if you added a Zone permission): choose `Include` → `Specific zone` → your domain (or `All zones`);
8. **Continue to summary → Create Token**;
9. **Copy this token immediately** (it is shown only once) and paste it into a text editor first.

> 💡 Cannot be bothered picking permissions by hand? Cloudflare also offers a ready-made **"Edit Cloudflare Workers"** template, but it **does not include D1 or KV**, so you still have to add them yourself. For beginners, ticking the boxes manually as in the table above is the safest.
>
> 💡 For convenience you can also use a broad Account token such as **"Workers Admin Read & Write"**, and it will work; but least privilege is recommended for production.

### 5.3 Verifying that the token works

```bash
# Works in PowerShell / macOS / Linux alike; set the environment variables first
export CLOUDFLARE_API_TOKEN="the token you just copied"
export CLOUDFLARE_ACCOUNT_ID="your Account ID"

npx wrangler whoami
```

If it prints your account information and a permission list, the token is valid.

> On Windows PowerShell use `$env:CLOUDFLARE_API_TOKEN="..."` instead of `export`.

### 5.4 Common token-related errors

| Error | Cause | Fix |
| --- | --- | --- |
| `Authentication error [code: 10000]` | Misspelt token / deleted token / leading or trailing spaces or newlines | Copy it again, taking care not to include a newline |
| `A request to the Cloudflare API failed` + `8000007` | The token's **Account Resources** do not include your account | Edit the token and add the account under Account Resources |
| `Unable to authenticate request` | You used the Global API Key instead of a token | Create a token again as in 5.2 |
| The deploy succeeded but the D1 migration failed | The token is missing the `D1: Edit` permission | Add the permission and run the deploy again |
| The cache was not purged after publishing | The token is missing `Zone: Cache Purge`, or `CF_ZONE_ID` is not configured | You need both |

---

## 6. R2: image and music uploads (optional)

**The blog works without it**, except that uploads in the admin panel's "Media Library / Music Manager" return `503` (with the message `R2 未配置（缺少 R2 凭据 / R2_BUCKET），无法上传` — "R2 is not configured, so uploads are unavailable").

> Why R2: R2 **egress is free**. A blog's images and music are read over and over, so with R2 you pay almost only for storage, and the free storage quota is 10 GB per month.

### 6.1 Creating the buckets

Two buckets with separate jobs are recommended:

| Purpose | Suggested bucket name | Example public read domain |
| --- | --- | --- |
| Music audio | `qingyu-music` | `https://music.example.com` |
| Image media | `qingyu-media` | `https://media.example.com` |

1. **R2 object storage** in the left sidebar → **Create bucket**;
2. Set **Bucket name** to `qingyu-music` and choose `Automatic` for **Location** (or a region near you);
3. Repeat once to create `qingyu-media`.

> Using a single bucket is fine too: point both purposes at the same bucket (see [6.6](#66-two-buckets-or-one)).

### 6.2 Making a bucket publicly readable

Objects in R2 are **private** by default, so a browser `<img>` / `<audio>` request straight to them returns 403; you have to open a public entry point. There are two:

#### Option 1: bind a custom domain (**recommended**)

1. Open the bucket → **Settings** → **Public access**;
2. Find **Custom Domains** → **Connect Domain**;
3. Enter a **subdomain**, for example `music.example.com` (that domain must already be in the same Cloudflare account, i.e. onboarded as in section 2.3);
4. Cloudflare adds a DNS record automatically; once the status becomes **Active** you are done.

Visiting `https://music.example.com/<object key>` then returns the file.

#### Option 2: the r2.dev development domain (**testing only**)

The same page has an **R2.dev subdomain**; clicking **Allow Access** gives you a `https://pub-xxxx.r2.dev` domain.
It **is rate limited and is not recommended for production**; it is only good for getting the flow working first.

> ⚠️ When putting a custom domain or an r2.dev domain into `R2_PUBLIC_BASE` / `R2_MEDIA_PUBLIC_BASE`:
> **it must start with `https://`, and you must not add a `/` at the end.**
> And do **not** put the R2 S3 Endpoint (`...r2.cloudflarestorage.com`) there.

### 6.3 Configuring CORS (**the number one cause of failed uploads**)

The browser uploads **directly** to R2 (the file never passes through the Worker), so R2 must allow cross-origin `PUT` from your site; otherwise the browser preflight is blocked and the frontend only sees `HTTP 0：预检被拦截 / CORS 或网络中断` (HTTP 0: preflight blocked / CORS or network interruption).

1. Open the bucket → **Settings** → **CORS Policy** → **Add CORS policy**;
2. Paste the following as-is (replacing `www.example.com` with your own domain):

```json
[
  {
    "AllowedOrigins": [
      "https://www.example.com",
      "https://example.com"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

3. Save. Both buckets need this configured.

Key points:

| Setting | Why | Common mistake |
| --- | --- | --- |
| `AllowedOrigins` | Only your site may upload, so nobody else can hijack it | Forgetting the `www` variant or omitting `https://` |
| `AllowedMethods` including **PUT** | Uploads use `PUT` | Listing only `GET` |
| `AllowedHeaders` including **`Content-Type`** | The presigned URL **includes `content-type` in the signature**, so the browser must send that header verbatim | Writing it in lowercase as `content-type`, or leaving it out |
| `ExposeHeaders: ETag` | Some browsers need to read the ETag | Usually not fatal if missing |
| `MaxAgeSeconds` | How long the preflight result is cached | — |

> 💡 If you use both `example.com` and `www.example.com`, **both must go into `AllowedOrigins`**.

### 6.4 Creating an R2 API token (S3 credentials)

1. **R2** in the left sidebar → **API** → **Manage API Tokens**;
2. **Create API token**;
3. Choose **Object Read & Write** under **Permissions**;
4. **Specify bucket(s)**: tick **both** `qingyu-music` and `qingyu-media`;
   - If the interface only allows a single choice, pick **All buckets**;
5. Save three things immediately after creating it:

| What is shown | Which Secret it goes into |
| --- | --- |
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key (**shown only once**) | `R2_SECRET_ACCESS_KEY` |
| Endpoint (in the form `https://<accountid>.r2.cloudflarestorage.com`) | `R2_ENDPOINT` |

> ❗ **This project needs only one set of R2 credentials**: music and images share the same pair of Access Key / Secret.
> The code reads only the `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` variables; there are no "music-only credentials".
> So this pair of credentials **must be able to access both buckets**; authorising only a single bucket makes uploads on the other side return 403.

### 6.5 The correct way to write `R2_ENDPOINT`

```
✅ https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com
❌ https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com/qingyu-media   (do not include the bucket name)
❌ https://music.example.com                                                       (this is the public domain, not the Endpoint)
❌ https://...r2.cloudflarestorage.com/                                             (do not add a trailing /)
```

### 6.6 Two buckets or one?

| Approach | What to fill in | Who it suits |
| --- | --- | --- |
| **Two buckets** (recommended) | `R2_BUCKET=qingyu-music`, `R2_PUBLIC_BASE=https://music.example.com`, `R2_MEDIA_BUCKET=qingyu-media`, `R2_MEDIA_PUBLIC_BASE=https://media.example.com` | You want to manage them separately and add separate cache rules |
| **One bucket** | Fill all four variables with the same bucket name and the same domain | You only want to maintain one bucket — the least effort |
| Images only | Fill `R2_BUCKET` / `R2_PUBLIC_BASE` with the media bucket too (the workflow requires them to be non-empty before it writes any R2 config) | You do not plan to host music |
| Music only | Leave `R2_MEDIA_BUCKET` / `R2_MEDIA_PUBLIC_BASE` empty | You do not plan to upload images |

The music-bucket decision logic (at the code level):

```
music upload target = (R2_BUCKET and R2_PUBLIC_BASE both non-empty) ? music bucket : media bucket
```

In other words: **as soon as both music-bucket variables are empty, music automatically lands in the media bucket**. If you find music going into the media bucket, first check whether `R2_BUCKET` / `R2_PUBLIC_BASE` were left blank.

> ⚠️ Note one detail of the workflow: `R2_MEDIA_BUCKET` is written to the Worker only when all four of `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT` and `R2_MEDIA_BUCKET` are non-empty.
> So in the "images only" approach you **must** also fill in `R2_BUCKET` / `R2_PUBLIC_BASE`, otherwise the whole R2 configuration has no effect.

### 6.7 Adding caching for the media domain (strongly recommended)

R2 objects uploaded directly from the browser carry **no long-lived cache headers** by default, so thumbnails/covers hit the origin on first load. Add one cache rule and both old and new objects go through the cache:

1. Dashboard → your **domain** → **Caching** → **Cache Rules** → **Create rule**;
2. **When incoming requests match**: `Hostname` equals `media.example.com` (or use `or` in a `Custom filter expression` to match `music.example.com` as well);
3. **Then**:
   - **Cache eligibility** → `Eligible for cache` (called **Cache Everything** in the old interface)
   - **Edge TTL** → `Ignore cache-control header and use this TTL` → **1 month**
   - **Browser TTL** → `Override origin` → **1 month**
4. Save. The first request still goes to the origin once; after that both the browser and the edge serve from cache.

### 6.8 R2 troubleshooting cheat sheet

| Symptom | Common cause | Fix |
| --- | --- | --- |
| Uploads return **503** `R2 未配置` | `R2_BUCKET` is missing, or the R2 Secrets are not all filled in | Check that all 7 R2 variables are present, then **run the deploy again** |
| Browser upload shows `HTTP 0` | The R2 bucket has no CORS config, or `AllowedOrigins` does not include the current domain | Add CORS as in 6.3 |
| Uploads return **403** | ① The token lacks write permission on the target bucket ② `R2_ENDPOINT` is wrong ③ The Access Key and Secret do not match ④ CORS does not allow that origin | Check 6.3 / 6.4 / 6.5 one by one |
| `SignatureDoesNotMatch` | `R2_ENDPOINT` includes the bucket name or a trailing slash; or the credentials contain spaces or newlines | Correct it as in 6.5 |
| The upload succeeds but visiting the URL returns **404** | The public domain is not bound to the right bucket, or `R2_PUBLIC_BASE` / `R2_MEDIA_PUBLIC_BASE` is wrong | Verify by opening `public-domain/<object key>` directly in the browser |
| Music still ends up in the media bucket | `R2_BUCKET` or `R2_PUBLIC_BASE` is empty | Fill in both and redeploy |
| Nothing changed online after editing a Secret | **Changes to GitHub Secrets do not take effect automatically** | You must run the deploy workflow again |

---

## 7. Workers AI (optional)

Switching it on adds these capabilities to the blog (all of them degrade gracefully):

| Where | Feature |
| --- | --- |
| Post page | An "AI Summary" button (30-day per-post cache) |
| Admin editor | "AI Writing Assistant": title suggestions / polish / translation (5 target languages) |
| Admin comments page | A "Comments summary" of recent comment highlights + spam screening for a single comment |
| Public home page | AI-generated versions of the card excerpts |

**Where does the binding come from?** `wrangler.workers.toml` already has:

```toml
[ai]
binding = "AI"
```

`wrangler deploy` creates this binding automatically — **no manual action needed** (provided the token has the `Workers AI: Edit` permission and Workers AI is enabled on the account).

**How do you confirm it is working?** After deploying, visit:

```
https://your-domain/api/ai/ping
```

- Returns `{"ok":true}` → AI is available and the frontend shows every AI entry;
- Returns `404 {"ok":false,"error":"AI 未启用"}` (AI is not enabled) → AI is unavailable and the frontend **automatically hides** every AI entry (so the page never shows a broken button).

**How do you switch it all off?** Set environment variables on the Worker (**not** GitHub Secrets; the workflow does not write these two variables):

```bash
# Turn off all AI features
npx wrangler secret put BLOG_AI_ENABLED     # enter one of 0 / false / off
```

- `BLOG_AI_ENABLED = 0`: every `/api/ai/*` returns 404;
- `BLOG_AI_PUBLIC = 0`: turns off only "anonymous visitors may also generate summaries"; it still works once logged in (reading the summary cache is unaffected).

> 🔐 **Privacy note**: once AI is on, post bodies / comment content are sent **in plaintext** to the Cloudflare Workers AI model (by default `@cf/meta/llama-3.2-3b-instruct`) for inference. If your content is sensitive, do not enable it, or switch everything off with `BLOG_AI_ENABLED=0`.

---

## 8. Custom domain and Zone ID (optional)

### 8.1 Binding the domain to the Worker

1. Dashboard → **Workers & Pages** → click into your Worker (named `kejiland` by default);
2. **Settings** → **Domains & Routes** → **Add** → **Custom Domain**;
3. Enter `www.example.com` (the domain must already be onboarded to the same account);
4. Once the status becomes **Active** you can reach the blog at `https://www.example.com`.

> You can also add a second one for `example.com`, or set up a `example.com → www.example.com` 301 redirect in Cloudflare's **Rules → Redirect Rules**.

### 8.2 Finding the Zone ID

To get "purge the cache on publish" after deploying, you need the **Zone ID**:

1. Select **your domain** in the left sidebar of the dashboard;
2. The **Overview** page;
3. The **API** section in the right sidebar (or at the bottom of the page) → **Zone ID**, click to copy.

It looks like `0123456789abcdef0123456789abcdef` (32 hexadecimal characters). Put it into the GitHub Secret `CF_ZONE_ID`.

### 8.3 How cache purging works

- When a post is created/edited/deleted or liked, the code calls Cloudflare's Cache Purge API and uses `Cache-Tag` (`posts` / `feed` / `sitemap` / `post:<id>` / `stats:<id>`) to **purge exactly the relevant cache entries**;
- Preconditions: `CF_ZONE_ID` plus a token with the **Zone / Cache Purge** permission. The workflow also writes the `CLOUDFLARE_API_TOKEN` you supplied into the Worker as `CF_API_TOKEN`;
- If either precondition is missing, cache purging is **silently skipped** (nothing breaks; new content may simply have to wait for `s-maxage` to expire, usually 1–5 minutes).

**"Purge by tag" is available on every plan** (Free / Pro / Business / Enterprise all support it), with a limit of 5 purge requests per minute and at most 100 operations per request — far more than enough for a personal blog.

> Without a custom domain (using only `*.workers.dev`) there is **no zone**, hence no Zone ID, so cache purging is unavailable. In that case static assets carry a `?v=` version suffix and long cache lifetimes while the HTML entry is `no-cache`, so content rarely goes stale anyway.

---

## 9. Hardening the admin login (optional, strongly recommended)

`/api/admin/login` is the only place on the whole site where you get in with a password, and it is the most worthwhile place to spend 10 minutes hardening.

The project already implements three tiers of throttling internally (per IP / per subnet / global cooldown) and **guarantees that the site owner can always get in** (see [9.5](#95-the-three-tier-throttling-built-into-the-project-already-in-effect-by-default)); but if you can block brute-force traffic at the **edge**, you save even the CPU and database quota.

### 9.1 Option A: put `/admin` behind Cloudflare Access (most recommended)

Effect: **requests that have not passed Cloudflare authentication never even reach the Worker's login endpoint**. Brute force, accidental lockouts, and CPU and D1 quota consumption all disappear at once.

1. Find **Zero Trust** in the left sidebar of the dashboard (the first visit asks you for a team name, for example `your-name`; the free plan is fine);
2. **Access → Applications → Add an application → Self-hosted**;
3. Set **Application name** to `Qingyu Blog Admin`;
4. **Public hostname**: choose your domain and set **Path** to `admin` (this protects only `/admin*`); then click **Add public hostname** to add a second one: the same domain with **Path** set to `api/admin` (this protects the login and setup endpoints — a crucial entry);
5. Create one new **Access policy**: Action = `Allow`, Include = `Emails` = your email address;
6. Choose **One-time PIN** under **Authentication** (free; the code is emailed to you and no external identity provider needs configuring);
7. Save. After that, opening `/admin` shows Cloudflare's email verification page first, and only then the blog's own login page.

Things to watch out for:

- **Protect only `/admin*` and `/api/admin/*`**; do not protect the whole domain, or visitors will be locked out too;
- Do **not** add public endpoints such as `/api/posts`, `/api/comments` and `/api/music`;
- The public "edit post" entry is `/posts/<slug>/edit`, which also loads the admin panel; if that bothers you, add it to the Path list as well (leaving it out is not a vulnerability — without a session token that page cannot save anything);
- Free-plan Zero Trust supports up to 50 users, which is more than enough for a personal blog;
- Once Access is configured, the blog's own password login still works: two independent gates.

### 9.2 Option B: add a rate limiting rule for the login endpoint

If you do not want an extra login step for the admin panel, use a WAF rate limiting rule as an edge backstop:

1. Dashboard → your **domain** → **Security** → **Security rules** → **Rate limiting rules** → **Create rule**;
2. **When incoming requests match**: `URI Path` **equals** `/api/admin/login` (on the free plan `Path` is the only available field, which is exactly enough);
3. **Rate**: `10` requests per `10 seconds` (on the free plan both the counting window and the mitigation duration are fixed at 10 seconds);
4. **Then**: **Block**, Duration `10 seconds`;
5. Save.

Blocked requests **never reach the Worker**, so they consume neither the Worker request quota nor D1/KV quota. The free plan includes **1** rate limiting rule, and the login endpoint is the best possible use for it.

### 9.3 Option C: enable the edge rate limiting binding in the Worker (optional)

The project also integrates the Workers Rate Limiting API: once `BLOG_RATE_LIMIT_BINDING` is configured, the Worker throttles at the entry point by IP (10 per minute per location by default), and blocked requests **neither read nor write the database**.

| Item | Description |
| --- | --- |
| How to enable it | Add `BLOG_RATE_LIMIT_BINDING` to GitHub Secrets with a **positive integer namespace** as its value (for example `1001`), then redeploy |
| What happens automatically | The workflow switches to wrangler 4.x (the binding requires ≥ 4.36) and injects `[[ratelimits]]` into the deploy config, with the binding name fixed as `LOGIN_LIMITER` |
| What happens without it | Nothing is affected: when the code cannot detect the binding it falls back to D1 counters (the default behaviour) |
| What if the deploy errors out | It means your account/plan does not support the binding yet: delete this Secret and redeploy to recover |
| Characteristics | The counters are cached locally per Cloudflare data centre and are eventually consistent; the purpose is abuse prevention rather than precise metering |

### 9.4 How to choose among the three options

| Your situation | Recommendation |
| --- | --- |
| Least effort with the best security | **Option A** (Access): configure once, effective long-term |
| No extra login step for the admin panel | **Option B** (rate limiting rule); if you can, do A + B together |
| Your account supports it and you cannot be bothered with the dashboard | **Option C**: just one extra Secret |
| You do not want to configure anything | That is fine too: the project's built-in three-tier throttling is still in effect (see the next section) |

### 9.5 The three-tier throttling built into the project (already in effect by default)

Even with none of the options configured, the login endpoint has its own protection, and it **never locks the site owner out**:

| Dimension | Threshold | Cooldown | Notes |
| --- | --- | --- | --- |
| Single IP | 5 failures | 15 minutes | Only affects the attacker's own egress IP |
| Subnet (IPv4 /24, IPv6 /64) | 15 failures | 60 seconds | Raises the cost of "rotating IPs"; the cooldown is short so that other people on the same subnet are not caught in the blast |
| Global | 30 failures | **10 seconds** + alert log | Only a short cooldown, **never a long lock** (otherwise an attacker could lock the only administrator out); during the cooldown requests return early without writing to the database, which acts as a write-amplification gate against distributed brute force |

All three counters age out and reset automatically one hour after the last failure; the counts are retained for a while just after a cooldown ends, so an attacker cannot farm attempts indefinitely by "waiting for the cooldown to reset and retrying".

**Break-glass path**: a login request carrying the correct `X-Setup-Key` (that is, `BLOG_ADMIN_SETUP_KEY`) **skips every throttle above** — but **not the password check**. When throttling kicks in, the admin login page automatically reveals the "Sign in with the setup key" entry. In other words:
> The worst an attacker can do is stop someone logging in for 10 seconds; **you always have a way in**.

> ⚠️ This is also why this project **deliberately rejects** the common practice of a "global lock": for a single-administrator system a long global lock does not stop an attacker (he switches IP and carries on) but it can be used for an availability DoS. The related trade-offs are documented in the "layered counters for login throttling" comment in `functions/_lib/api-core.js`.

---

## 10. The complete GitHub Secrets checklist

Repository → **Settings** → **Secrets and variables** → **Actions** → the **Secrets** tab → **New repository secret**.

> ⚠️ They must go under **Secrets**, **not** under **Variables** — the workflow reads only Secrets.
> ⚠️ Names are **case-sensitive**; do **not** write `NAME=` in the value, and generally do **not** add quotation marks.

### 10.1 Required (the deploy stops if one is missing)

| Secret | What to put in | Format |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | The Account API Token created in section 5 | An ordinary string |
| `CLOUDFLARE_ACCOUNT_ID` | The Account ID from section 2.2 | 32 hexadecimal characters |
| `BLOG_D1_ID` | The D1 **Database ID** from section 3 | UUID (with hyphens) |
| `BLOG_KV_ID` | The KV **Namespace ID** from section 4 | 32 hexadecimal characters |

### 10.2 Recommended

| Secret | What to put in | Notes |
| --- | --- | --- |
| `BLOG_ADMIN_SETUP_KEY` | A long random value you generate yourself | **Strongly recommended**. Once configured, only someone holding this key can initialize the admin password; leave it empty and it degrades to "the first login auto-generates a random default password" (with a race if someone beats you to it) |
| `SITE_URL` | `https://www.example.com` | The site's canonical address; **do not add a trailing `/`**. Used to tighten CORS (without it every cross-origin request is rejected), RSS/Sitemap links and comment origin validation |

### 10.3 Optional

| Secret | What to put in | Notes |
| --- | --- | --- |
| `CF_ZONE_ID` | The Zone ID from section 8.2 | Together with the Cache Purge permission → purge the cache on publish |
| `PAGES_PROJECT_NAME` | The Worker name | **The name is misleading**: what it actually does is override the Worker name (`--name`). If empty, `kejiland` from `wrangler.workers.toml` is used. **Beginners should leave it empty**; renaming it casually deploys a brand-new Worker |
| `BLOG_WRITE_TOKEN` | Legacy write token | Not needed for new deployments |
| `BLOG_RATE_LIMIT_BINDING` | A positive integer, such as `1001` | Enables edge login rate limiting inside the Worker (see [9.3](#93-option-c-enable-the-edge-rate-limiting-binding-in-the-worker-optional)); it makes the workflow switch to wrangler 4.x. Delete it if your account does not support it |
| `R2_ACCESS_KEY_ID` | Section 6.4 | R2 uploads |
| `R2_SECRET_ACCESS_KEY` | Section 6.4 | R2 uploads |
| `R2_ENDPOINT` | Section 6.5 | R2 uploads |
| `R2_BUCKET` | The music bucket name, e.g. `qingyu-music` | R2 uploads (**must not be empty**, otherwise no R2 config is written at all) |
| `R2_PUBLIC_BASE` | The music bucket's public domain | R2 playback URLs |
| `R2_MEDIA_BUCKET` | The media bucket name, e.g. `qingyu-media` | Image uploads |
| `R2_MEDIA_PUBLIC_BASE` | The media bucket's public domain | Image URLs |

### 10.4 Example with everything filled in at once

```text
CLOUDFLARE_API_TOKEN=your deploy token
CLOUDFLARE_ACCOUNT_ID=a1b2c3d4e5f678901234567890abcdef
BLOG_D1_ID=0fa366ac-f04a-4be2-8e11-5adc6ee6d686
BLOG_KV_ID=0123456789abcdef0123456789abcdef
BLOG_ADMIN_SETUP_KEY=generate a long enough random value
SITE_URL=https://www.example.com
CF_ZONE_ID=0123456789abcdef0123456789abcdef
BLOG_RATE_LIMIT_BINDING=1001   # optional: enables edge login rate limiting (delete this line if your account does not support it)

R2_ACCESS_KEY_ID=AccessKeyID of the shared R2 token
R2_SECRET_ACCESS_KEY=SecretAccessKey of the shared R2 token
R2_ENDPOINT=https://a1b2c3d4e5f678901234567890abcdef.r2.cloudflarestorage.com
R2_BUCKET=qingyu-music
R2_PUBLIC_BASE=https://music.example.com
R2_MEDIA_BUCKET=qingyu-media
R2_MEDIA_PUBLIC_BASE=https://media.example.com
```

> A couple of tricks for generating a random key:
> - PowerShell: `-join ((48..57) + (97..122) | Get-Random -Count 40 | % {[char]$_})`
> - macOS / Linux: `openssl rand -hex 24`

---

## 11. Triggering a deployment

### 11.1 Automatic trigger

```bash
git add .
git commit -m "chore: configure deployment"
git push origin main
```

Pushing to `main` triggers **Deploy to Cloudflare Workers**.

### 11.2 Manual trigger

Repository **Actions** → **Deploy to Cloudflare Workers** in the left sidebar → **Run workflow** → choose `main` → **Run workflow**.

A manual trigger runs an extra `wrangler whoami` step, which makes credential problems easier to diagnose.

### 11.3 What the workflow actually does

| Order | Step | Typical reason for failure |
| --- | --- | --- |
| 1 | Checkout + Setup Node 24 + install wrangler (`3.90.0` by default; `4.x` when `BLOG_RATE_LIMIT_BINDING` is set) | — |
| 2 | Run three test suites: `smoke-test.js`(78) / `gb-verify.js`(18) / `search-verify.js`(13) | You broke the code; after a test failure the workflow **does not** proceed to the deploy |
| 3 | Validate that the required Secrets are all present | They were put under Variables, the name is misspelt, or the value has leading/trailing spaces |
| 4 | Validate `BLOG_KV_ID` (32 hexadecimal characters) and `BLOG_D1_ID` (UUID), replace the `{env.*}` placeholders with the real values and generate `wrangler.workers.ci.toml` | A database name was used, or the two kinds of ID were mixed up |
| 5 | Run the D1 migrations in `migrations/*.sql` order (three-layer idempotency protection) | The token lacks the D1 permission, or the D1 ID is wrong |
| 6 | `wrangler deploy` deploys the Worker | The token lacks the Workers Scripts permission |
| 7 | Write the runtime Secrets (setup key, R2 credentials, `CF_API_TOKEN`, etc.) | Not fatal; skipped when the variable is missing |

After a successful deploy the Actions log prints the Worker's URL at the end.

### 11.4 After changing a Secret you must redeploy

Changes to GitHub Secrets are **not** synced automatically to an already-deployed Worker. After any Secret change you have to run the deploy workflow again.

---

## 12. Initializing the administrator for the first time

Open `https://your-domain/admin`.

### Case A: `BLOG_ADMIN_SETUP_KEY` is configured (recommended)

1. The page shows "Admin Login";
2. Click "First deploy? Initialize with setup key";
3. Enter the **new admin password** (**at least 8 characters**) + the **setup key** and submit;
4. You are logged in automatically — start writing.

> Before it is initialized, the login endpoint always returns 403, so even someone who knows the URL **cannot steal** your administrator account.

### Case B: `BLOG_ADMIN_SETUP_KEY` is not configured

1. Log in once with **any password**;
2. The backend automatically generates a random default password (in the form `abcd-efgh`) and shows a prompt on the page;
3. Once you are in with it, **change the password immediately** (account menu in the top right → Change Password).

> ⚠️ This path has a first-come-first-served race: whoever visits first gets the default password. **Always configure `BLOG_ADMIN_SETUP_KEY` on a brand-new deployment.**

### What if you forget the password?

To prevent account squatting, the current API **offers no online reset**. To reset it manually:

1. Dashboard → **D1** → your `blog` database → **Console**;
2. Run:

```sql
DELETE FROM admin_auth WHERE k = 'auth';
DELETE FROM admin_sessions;
```

3. Go back to `/admin` and re-initialize following the process in section 12.

---

## 13. Post-deployment self-check checklist

Work through these in order; if they all pass, your configuration is correct:

| # | Check | Expected result |
| --- | --- | --- |
| 1 | Open the home page | It renders normally; if the cloud probe succeeded, `/api/posts` is reachable |
| 2 | Open `/admin` | You can log in and reach the dashboard |
| 3 | Admin → all posts → write a new post → publish | The new post appears in the list and is visible on the public home page |
| 4 | Open `/feed.xml` and `/sitemap.xml` | They return XML and **include the post you just published** (which proves the D1 write succeeded) |
| 5 | Open `/api/ai/ping` | `{"ok":true}` (AI is on) or 404 (AI is off, which is normal) |
| 6 | Admin → Media Library → upload an image | The progress bar completes and a thumbnail appears on the card; the address you get from "Copy" opens in the browser |
| 7 | Admin → Music Manager → upload an mp3 | The track appears in the table, and the inline preview plays it and shows the duration |
| 8 | The music button in the bottom-right of the public site | It slides out on hover, and clicking it shows the playlist |
| 9 | Post a comment on a public post page | You get a success message; it is visible on the admin comments page (with moderation on, the status is "Pending") |
| 10 | Post the same comment twice in a row | It returns 409 `请勿重复发送相同内容` ("please do not send the same content twice", which proves D1 + KV are both working) |
| 11 | Dashboard → D1 → Console, run `SELECT COUNT(*) FROM posts;` | The number matches your post count |
| 12 | Dashboard → Workers & Pages → your Worker → Logs | Live request logs appear, with no red errors |

---

## 14. Troubleshooting cheat sheet

| Symptom | Most likely cause | Fix |
| --- | --- | --- |
| Actions says `缺少必要的 GitHub Secrets` ("missing required GitHub Secrets") | They were put under Variables, or the name is misspelt / has the wrong case | Move them to Secrets and check letter by letter |
| Actions says `BLOG_KV_ID 不是有效的 32 位十六进制` (BLOG_KV_ID is not valid 32-character hexadecimal) | The KV id and the D1 UUID were mixed up | KV = 32 characters with no hyphens; D1 = a UUID with hyphens |
| The deploy reports `Authentication error [code: 10000]` | The token is wrong or has been deleted | Create a new token and update the Secret |
| The deploy reports `8000007` | The token's Account Resources do not include the account | Edit the token and add the account |
| The page loads but the post list is empty | D1 is not bound / the migrations did not run / it is a brand-new empty database | Look at step 6 of the Actions log; run `SELECT COUNT(*) FROM posts` in the dashboard |
| The API returns `数据库未配置：请创建并绑定名为 DB 的 D1 数据库` (database not configured: create and bind a D1 database named DB) | `BLOG_D1_ID` is wrong, or the KV/D1 bindings did not take effect | Check the IDs and redeploy |
| Uploading an image/music returns **503** | The R2 configuration is incomplete (especially an empty `R2_BUCKET`) | Fill in the missing R2 variables and redeploy |
| Browser upload shows `HTTP 0` | The R2 bucket has no CORS config / the origin is not allow-listed | Configure it as in 6.3 |
| Uploads return **403** | The token has no write permission on the bucket / the Endpoint is wrong / the Access Key and Secret do not match | Check as in 6.4 and 6.5 |
| The upload succeeds but opening the URL returns **404** | The public domain is not bound to the bucket, or `*_PUBLIC_BASE` is wrong | Verify by visiting `public-domain/<key>` directly |
| Nothing changed online after editing a Secret | The deploy was not re-run | Run the workflow again |
| After publishing, the public site still shows the old content | `CF_ZONE_ID` is missing or the token lacks the Cache Purge permission | Add it; or wait 1–5 minutes for the cache to expire |
| A cross-origin API call is blocked by the browser | `SITE_URL` is missing or wrong (when it is unset the behaviour is "reject everything" rather than "echo the origin") | Set `SITE_URL` correctly (including `https://`, with no trailing `/`) |
| No AI entries appear | AI is not bound, `BLOG_AI_ENABLED` is off, or `/api/ai/ping` returns 404 | Visit `/api/ai/ping` to confirm; refresh the page after fixing it (the unavailable state is cached for only 30 seconds) |
| The admin panel keeps saying "session expired" | The 7-day session expired, or you changed the password (which clears all sessions) | Log in again |
| Admin login is locked out | ① 5 consecutive failures from the same IP → 15-minute lock ② 15 failures from the same subnet → 60-second cooldown ③ 30 site-wide failures → 10-second cooldown | First choice: on the login page click "Rate limited? Sign in with the setup key" and enter `BLOG_ADMIN_SETUP_KEY` to get in immediately; failing that, wait 10–60 seconds and retry; as a last resort run `DELETE FROM admin_fails;` in D1 |
| The login page keeps saying "尝试次数过多" (too many attempts) | Someone is brute-forcing your login endpoint | Search the Worker logs for "全局失败冷却已触发" (global failure cooldown triggered) to see the source IP; configuring Access or a rate limiting rule as in [section 9](#9-hardening-the-admin-login-optional-strongly-recommended) is recommended to block it at the source |
| The player duration in Music Manager shows 0:00 | The audio has not finished loading its metadata yet / no public domain is configured in production | This is normal; it updates after you click play |

---

## 15. Full table of environment variables

This table lists every variable the **code actually reads**, ordered by default behaviour, to make it easier to work out "what did I forget to configure".

| Name | Type | Required | When it is not configured |
| --- | --- | --- | --- |
| `DB` | D1 binding | ✅ | Every endpoint returns `数据库未配置：请创建并绑定名为 DB 的 D1 数据库` ("database not configured") |
| `ASSETS` | Static asset binding | ✅ (Workers has it automatically) | Static pages return 404 |
| `BLOG` | KV binding | Recommended | Comment/like/view rate limiting and dedup stop working; AI usage counters stop working |
| `SITE_URL` | Variable (`[vars]`) | Recommended | **Every cross-origin request is rejected**; RSS/Sitemap use the request origin |
| `CF_ZONE_ID` | Variable (`[vars]`) | ⭕ | No edge cache purging |
| `CF_API_TOKEN` | Secret | ⭕ | No edge cache purging (written automatically by the workflow) |
| `BLOG_ADMIN_SETUP_KEY` | Secret | Recommended | The first login auto-generates a random default password (with a race); it is **also the break-glass path for login throttling** |
| `BLOG_WRITE_TOKEN` | Secret | ⭕ | Only session login is available |
| `BLOG_RATE_LIMIT_BINDING` | Secret (read at deploy time) | ⭕ | No edge rate limiting binding is injected; login throttling falls back to D1 counters |
| `LOGIN_LIMITER` | Workers Rate Limiting binding | ⭕ | Login throttling happens only at the D1 layer (injected by `BLOG_RATE_LIMIT_BINDING`) |
| `AI` | Workers AI binding | ⭕ | Every `/api/ai/*` returns 404 and the frontend hides the entries |
| `BLOG_AI_ENABLED` | Variable | ⭕ | Considered on whenever `AI` + `DB` are present |
| `BLOG_AI_PUBLIC` | Variable | ⭕ | Anonymous summary generation is allowed |
| `R2_ACCESS_KEY_ID` | Secret | ⭕ | The upload endpoint returns 503 |
| `R2_SECRET_ACCESS_KEY` | Secret | ⭕ | The upload endpoint returns 503 |
| `R2_ENDPOINT` | Secret | ⭕ | The upload endpoint returns 503 |
| `R2_BUCKET` | Secret | ⭕ | Music falls back to the media bucket |
| `R2_PUBLIC_BASE` | Secret | ⭕ | Same as above |
| `R2_MEDIA_BUCKET` | Secret | ⭕ | Image uploads return 503 |
| `R2_MEDIA_PUBLIC_BASE` | Secret | ⭕ | Same as above |

`BLOG_AI_ENABLED` / `BLOG_AI_PUBLIC` **are not written by the workflow**; you have to set them on the Worker yourself:

```bash
npx wrangler secret put BLOG_AI_ENABLED --name kejiland
```

---

## 16. Free-tier quotas and cost

Here are the free-tier quotas from Cloudflare's official pricing pages (Free plan); a personal blog will hardly ever exhaust them:

| Service | Free quota | What it means for this project |
| --- | --- | --- |
| **Workers requests** | 100,000 per day | About 3 million per month. **Static asset requests are free and unlimited**; only `/api/*` calls that actually reach the Worker count |
| **Workers CPU** | 10 milliseconds per invocation | This project's endpoints are simple D1 reads/writes, far below that |
| **KV reads** | 100,000 per day | Rate limiting and dedup live here |
| **KV writes** | 1,000 per day | Every comment/like/view costs 1–2 writes — **this is the quota you are most likely to hit first** |
| **KV storage** | 1 GB | It stores only counters and small caches, so usage is tiny |
| **D1 rows read** | 5,000,000 per day | Post lists, comment lists and similar queries |
| **D1 rows written** | 100,000 per day | Publishing posts, posting comments, liking |
| **D1 storage** | 5 GB (account total) | Plain-text posts: enough for tens of thousands of them |
| **R2 storage** | 10 GB-month | About 3,000 3 MB images, or 300 30 MB audio tracks |
| **R2 Class A operations** | 1,000,000 per month | Uploading/listing objects |
| **R2 Class B operations** | 10,000,000 per month | Reading objects |
| **R2 egress** | **Free** | Playing music and showing images costs nothing (this is the core reason for choosing R2) |
| **Workers AI** | About 10,000 Neurons/day | Enough for several thousand summary-level calls; beyond that roughly $0.011 per thousand Neurons |

**What happens when a quota runs out?** You are not charged; instead **that kind of operation simply fails** (after the KV write quota is exceeded, for example, rate limit counters stop working). If that worries you, you can upgrade to Workers Paid (from $5/month), and the quotas rise substantially.

References:
- [Workers pricing and quotas](https://developers.cloudflare.com/workers/platform/pricing/)
- [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)
- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Availability and limits of cache purge](https://developers.cloudflare.com/cache/how-to/purge-cache/)

---

## 17. Security recommendations

| Recommendation | How to do it |
| --- | --- |
| Least-privilege tokens | Keep the setup key, the R2 credentials and the deploy token separate; do not use one master key |
| Configure the setup key | Always fill in `BLOG_ADMIN_SETUP_KEY` so that nobody can initialize the instance ahead of you; it is also the **break-glass path** for login throttling, so forgetting it means losing a lifeline |
| Harden the login endpoint | Use Cloudflare Access or a rate limiting rule as in [section 9](#9-hardening-the-admin-login-optional-strongly-recommended) to block `/api/admin/login` at the edge |
| Do not use a long global lock | For a system with a single administrator a long global lock does not stop an attacker (he switches IP and carries on) but it can be used to lock you out; this project uses "three tiers of short cooldowns + a break-glass path" instead |
| Rotate regularly | If you suspect a leak, recreate the token / R2 credentials, and **redeploy** after updating the Secrets |
| Do not commit secrets to the repository | Every sensitive value in this project goes through GitHub Secrets / Worker Secrets; `wrangler.toml` contains only `{env.X}` placeholders |
| Make the password long enough | Cloud mode requires **at least 8 characters**; use a password manager to generate it |
| Protect the R2 buckets | Only allow your own domain in CORS; do not take the lazy route of writing `"AllowedOrigins": ["*"]` |
| Mind AI privacy | Enabling AI sends posts/comments to the model in plaintext, so switch it off for sensitive content |
| Back up your data | Export regularly from the D1 Console, or export posts as `posts.js` / Markdown and keep them locally |

---

## 18. Appendix: common commands cheat sheet

```bash
# Log in / inspect the account
npx wrangler login
npx wrangler whoami

# D1
npx wrangler d1 create blog                                   # create the database
npx wrangler d1 list                                          # list databases
npx wrangler d1 execute blog --remote --command "SELECT COUNT(*) FROM posts"
npx wrangler d1 execute blog --remote --file=./migrations/0015_hot_path_indexes.sql

# KV
npx wrangler kv namespace create BLOG
npx wrangler kv namespace list

# Local development (uses local D1/KV emulation and never touches live data)
npx wrangler dev -c wrangler.workers.toml

# Deploy
npx wrangler deploy -c wrangler.workers.toml

# View live logs
npx wrangler tail --name kejiland

# Runtime Secrets (no redeploy needed after changing them)
npx wrangler secret put BLOG_AI_ENABLED --name kejiland
npx wrangler secret list --name kejiland
```

> Running `wrangler dev` locally with `wrangler.workers.toml` hits the `{env.BLOG_KV_ID}` placeholder problem:
> replace it temporarily with the real id, or switch to `wrangler dev --local` and live with the binding error (which is perfectly adequate for debugging static pages locally).

---

<p align="center">
  Stuck while configuring? Ask in <a href="https://github.com/kejiland/qingyu-blog/issues">Issues</a> and include the Actions log or the API response — that makes it much quicker to pin down.
</p>
