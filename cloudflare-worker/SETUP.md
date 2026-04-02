# Cloudflare Worker — Setup Guide

This Worker does two things automatically:

1. **Serves your listings** from Cloudflare KV (fast edge cache, easily updated via API)
2. **Checks all listing URLs weekly** — any dead link gets a red "⚠ link" badge on the card

---

## One-time setup (~15 minutes)

### 1. Install Wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
wrangler login
```

### 2. Create a KV namespace

```bash
wrangler kv:namespace create LISTINGS_KV
```

Copy the `id` it outputs and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "LISTINGS_KV"
id = "paste-your-id-here"
```

### 3. Upload your listings data into KV

From the `github-deploy` folder (one level up from this folder):

```bash
wrangler kv:key put --binding=LISTINGS_KV "listings" --path=data.json
```

### 4. Set your secret API key

Pick any random string as your API key — you'll use it to call the `/update` endpoints later.

```bash
wrangler secret put API_KEY
# (you'll be prompted to type the value — keep it somewhere safe)
```

### 5. Deploy the Worker

From inside the `cloudflare-worker` folder:

```bash
wrangler deploy
```

Wrangler will print your Worker URL, e.g.:
`https://opencall-worker.your-name.workers.dev`

### 6. Point the site at the Worker

In `main.js`, update this line near the top:

```js
const WORKER_URL = 'https://opencall-worker.your-name.workers.dev/data.json';
```

Commit and push. Your site now fetches live data from Cloudflare instead of the static file.

---

## How the cron works

Every Monday at midnight UTC, the Worker:
- Pings all listing URLs in parallel (7-second timeout each)
- If a URL returns 404 or fails → `deadLink: true` is set on that listing in KV
- If a previously dead URL comes back → the flag is removed
- The site reads the flag and shows a red **⚠ link** badge on the card

No action needed from you — it runs automatically.

---

## Updating listings manually

**Add or edit a listing** — update `data.json` on GitHub, then re-upload to KV:

```bash
wrangler kv:key put --binding=LISTINGS_KV "listings" --path=data.json
```

**Update a single listing via API** (no need to re-upload the whole file):

```bash
curl -X POST https://your-worker.workers.dev/update/42 \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_SECRET_KEY" \
  -d '{"deadline": "2026-11-01"}'
```

**Manually trigger a URL check** (don't wait until Monday):

```bash
curl -X POST https://your-worker.workers.dev/check-urls \
  -H "X-Api-Key: YOUR_SECRET_KEY"
```

Returns: `{ "checked": 395, "flaggedDead": 3, "recovered": 1, "durationMs": 4821 }`

---

## Cost

All of this runs on Cloudflare's **free tier**:
- Workers: 100,000 requests/day free (your site traffic would need to be enormous to hit this)
- KV: 100,000 reads/day, 1,000 writes/day free
- Cron triggers: free
