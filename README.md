# ai-proxy-worker

Cloudflare Worker that proxies LLM calls (Anthropic · Gemini · Grok · OpenAI) for the [vittobh.github.io](https://vittobh.github.io) prototype gallery. Solves browser CORS, hides API keys server-side, adds an origin allowlist.

**Live:** `https://ai-proxy.<your-subdomain>.workers.dev`

## Endpoints

| Method | Path | Forwards to |
|---|---|---|
| GET  | `/health` | self — returns provider availability |
| POST | `/v1/anthropic/messages` | `https://api.anthropic.com/v1/messages` |
| POST | `/v1/gemini/<rest>` | `https://generativelanguage.googleapis.com/<rest>?key=…` |
| POST | `/v1/grok/chat/completions` | `https://api.x.ai/v1/chat/completions` |
| POST | `/v1/openai/chat/completions` | `https://api.openai.com/v1/chat/completions` |

Request body is passed through verbatim. Response is passed through with CORS headers added.

## Origin allowlist
Only these origins can call the proxy:
- `https://vittobh.github.io` (covers all 10 GitHub Pages prototypes)
- `http://localhost:8000` / `http://127.0.0.1:8000` (local dev)
- `http://localhost:8787` (`wrangler dev` default port)

All others receive **403**.

## Deploy

```bash
npm install -g wrangler   # or: npx wrangler ...
wrangler login            # or set CLOUDFLARE_API_TOKEN env var
wrangler deploy

# Set provider secrets (only the ones you use):
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put GEMINI_API_KEY
wrangler secret put GROK_API_KEY
wrangler secret put OPENAI_API_KEY
```

Secrets live encrypted on Cloudflare — never in the repo, never in the browser.

## Local dev

```bash
wrangler dev   # http://localhost:8787
```

## Cost (2026 Cloudflare free tier)
- 100,000 requests / day free
- 10ms CPU / request free
- Beyond that: $5/month for 10M requests

## Security posture
- ✅ API keys never reach the browser
- ✅ Origin allowlist blocks scraping from arbitrary domains
- ⚠️ Origin can be spoofed by a determined attacker — acceptable for portfolio/demo, not a paid product
- ⚠️ No per-IP rate limit in v1 (add via Cloudflare KV in v2)

## Client usage (from any prototype)
```js
const PROXY = 'https://ai-proxy.<your-subdomain>.workers.dev/v1';

const r = await fetch(`${PROXY}/anthropic/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 512,
    system: 'You are…',
    messages: [{ role: 'user', content: 'Hello' }],
  }),
});
```

No API key needed on the client side.

---
License: MIT · Author: Vittobha Vignesh S
