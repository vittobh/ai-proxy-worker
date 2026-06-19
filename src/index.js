// ai-proxy-worker — Cloudflare Worker that proxies LLM calls for vittobh.github.io prototypes.
// Solves browser CORS + hides API keys + minimal abuse protection.
// Routes:
//   GET  /health
//   POST /v1/anthropic/messages
//   POST /v1/gemini/v1/models/:model:generateContent  (everything after /v1/gemini is forwarded)
//   POST /v1/grok/chat/completions
//   POST /v1/openai/chat/completions

const ALLOWED_ORIGINS = new Set([
  'https://vittobh.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:8787',
]);

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'https://vittobh.github.io',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function proxy(upstream, init, cors) {
  const r = await fetch(upstream, init);
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: {
      'Content-Type': r.headers.get('Content-Type') || 'application/json',
      ...cors,
    },
  });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(req.url);

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({
        ok: true,
        providers: {
          anthropic: !!env.ANTHROPIC_API_KEY,
          gemini: !!env.GEMINI_API_KEY,
          grok: !!env.GROK_API_KEY,
          openai: !!env.OPENAI_API_KEY,
        },
        endpoints: [
          '/v1/anthropic/messages',
          '/v1/gemini/<path>',
          '/v1/grok/chat/completions',
          '/v1/openai/chat/completions',
        ],
      }, null, 2), {
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    if (!ALLOWED_ORIGINS.has(origin)) {
      return new Response(JSON.stringify({ error: 'Forbidden: origin not allowed', origin }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...cors },
      });
    }

    // Anthropic
    if (url.pathname === '/v1/anthropic/messages' && req.method === 'POST') {
      if (!env.ANTHROPIC_API_KEY) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not set on Worker' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      return proxy('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: await req.text(),
      }, cors);
    }

    // Gemini — pass through full path after /v1/gemini, append ?key=
    if (url.pathname.startsWith('/v1/gemini/') && req.method === 'POST') {
      if (!env.GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not set' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      const rest = url.pathname.slice('/v1/gemini'.length);
      const sep = rest.includes('?') ? '&' : '?';
      const upstream = `https://generativelanguage.googleapis.com${rest}${sep}key=${env.GEMINI_API_KEY}`;
      return proxy(upstream, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: await req.text(),
      }, cors);
    }

    // Grok (OpenAI-compatible)
    if (url.pathname === '/v1/grok/chat/completions' && req.method === 'POST') {
      if (!env.GROK_API_KEY) {
        return new Response(JSON.stringify({ error: 'GROK_API_KEY secret not set' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      return proxy('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${env.GROK_API_KEY}`,
        },
        body: await req.text(),
      }, cors);
    }

    // OpenAI
    if (url.pathname === '/v1/openai/chat/completions' && req.method === 'POST') {
      if (!env.OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: 'OPENAI_API_KEY secret not set' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...cors },
        });
      }
      return proxy('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: await req.text(),
      }, cors);
    }

    return new Response(JSON.stringify({ error: 'Not found', path: url.pathname }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  },
};
