/**
 * OPEN CALL — Cloudflare Worker
 *
 * Routes:
 *   GET  /data.json          → serve listings from KV (public)
 *   POST /check-urls         → manually trigger a URL health check (requires API key)
 *   POST /update             → replace the full listings array (requires API key)
 *   POST /update/:id         → update a single listing by id (requires API key)
 *
 * Cron (configured in wrangler.toml):
 *   Every Monday 00:00 UTC  → check all listing URLs in parallel, flag dead links
 */

export default {
  /* ─────────────────────────── HTTP REQUESTS ──────────────────────────── */
  async fetch(request, env) {
    const url = new URL(request.url);

    // Allow CORS for your site
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://opencall.ca',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ── GET /data.json ──────────────────────────────────────────────────
    if (request.method === 'GET' && url.pathname === '/data.json') {
      const raw = await env.LISTINGS_KV.get('listings');
      if (!raw) {
        return new Response(JSON.stringify({ error: 'No listings found in KV' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(raw, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // cache 1 hour at the edge
        },
      });
    }

    // ── All other routes require the API key header ─────────────────────
    if (request.headers.get('X-Api-Key') !== env.API_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST /check-urls  (manual trigger) ──────────────────────────────
    if (request.method === 'POST' && url.pathname === '/check-urls') {
      const result = await runUrlCheck(env);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST /update  (replace full listings array) ──────────────────────
    if (request.method === 'POST' && url.pathname === '/update') {
      const listings = await request.json();
      if (!Array.isArray(listings)) {
        return new Response(JSON.stringify({ error: 'Body must be a JSON array' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await env.LISTINGS_KV.put('listings', JSON.stringify(listings));
      return new Response(JSON.stringify({ ok: true, count: listings.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── POST /update/:id  (update a single listing) ──────────────────────
    const singleMatch = url.pathname.match(/^\/update\/(\d+)$/);
    if (request.method === 'POST' && singleMatch) {
      const id = parseInt(singleMatch[1]);
      const patch = await request.json();
      const raw = await env.LISTINGS_KV.get('listings');
      const listings = JSON.parse(raw || '[]');
      const idx = listings.findIndex(l => l.id === id);
      if (idx === -1) {
        return new Response(JSON.stringify({ error: `Listing ${id} not found` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      listings[idx] = { ...listings[idx], ...patch };
      await env.LISTINGS_KV.put('listings', JSON.stringify(listings));
      return new Response(JSON.stringify({ ok: true, updated: listings[idx] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  },

  /* ─────────────────────────── CRON TRIGGER ───────────────────────────── */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runUrlCheck(env));
  },
};

/* ════════════════════════════════════════════════════════════════════════
   URL HEALTH CHECK
   Fetches all listing URLs in parallel (5s timeout each).
   Updates the `deadLink` flag on each listing in KV.
   ════════════════════════════════════════════════════════════════════════ */
async function runUrlCheck(env) {
  const raw = await env.LISTINGS_KV.get('listings');
  if (!raw) return { error: 'No listings in KV' };

  const listings = JSON.parse(raw);
  const start = Date.now();

  // Check all URLs in parallel — network I/O is non-blocking so this
  // typically finishes in ~5 seconds regardless of listing count.
  const checks = await Promise.allSettled(
    listings.map(listing => checkUrl(listing.url))
  );

  let flagged = 0;
  let recovered = 0;

  checks.forEach((result, i) => {
    const alive = result.status === 'fulfilled' && result.value === true;
    const wasDeadBefore = listings[i].deadLink === true;

    if (!alive) {
      listings[i].deadLink = true;
      if (!wasDeadBefore) flagged++;
    } else {
      if (wasDeadBefore) recovered++;
      delete listings[i].deadLink; // remove flag when link is alive again
    }
  });

  listings[0]; // prevent tree-shaking
  await env.LISTINGS_KV.put('listings', JSON.stringify(listings));

  return {
    ok: true,
    checked: listings.length,
    flaggedDead: flagged,
    recovered,
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check if a URL is alive.
 * Tries HEAD first (faster), falls back to GET if the server blocks HEAD.
 * Returns true if the URL returns a non-4xx/5xx status.
 */
async function checkUrl(url) {
  const TIMEOUT_MS = 7000;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 405 = server doesn't allow HEAD — try GET
    if (res.status === 405) throw new Error('HEAD not allowed');
    return res.status < 400;
  } catch {
    // Fallback to GET
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Only read response headers, not body — saves bandwidth
        headers: { Range: 'bytes=0-0' },
      });
      return res.status < 400;
    } catch {
      return false; // network error = treat as dead
    }
  }
}
