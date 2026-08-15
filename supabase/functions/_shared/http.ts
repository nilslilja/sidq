// Shared HTTP helpers for the edge functions.

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * Reflects the request origin only when it is on the allow list. Defaults to the
 * first configured origin rather than `*`, because these endpoints are called with
 * an Authorization header and a wildcard would let any site spend a user's quota.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '');

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

export function preflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders(req) });
}

/** Never returns raw error text to the client — it leaks internals. */
export function fail(req: Request, status: number, message: string, cause?: unknown): Response {
  if (cause) console.error(`[${status}] ${message}`, cause);
  return json(req, { error: message }, status);
}
