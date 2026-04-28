/**
 * Shared response helpers for Pages Functions. CORS is permissive because
 * the worker is consumed only by our own SPA at the same origin, but
 * leaving the doors open simplifies local dev (vite on :5173 hitting
 * wrangler on :4173).
 */

export const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type, X-Actor-Label',
  'Access-Control-Expose-Headers':
    'X-Pokernow-Cents, X-Demo-Source, X-Upstream-Hosts, X-Game-Id',
};

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const merged: ResponseInit = {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  };
  return new Response(JSON.stringify(body), merged);
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}

export function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export const OPTIONS_NO_CONTENT = new Response(null, {
  status: 204,
  headers: CORS_HEADERS,
});

/**
 * Convert a `DbGameSnapshot` to a JSON-friendly payload. Currently identity —
 * but kept as a seam so we can prune internal fields later without
 * touching call sites.
 */
export function gameToJson<T>(snap: T): T {
  return snap;
}

/**
 * Read the actor label from request headers. Used for audit trail. Bounded
 * to 64 chars to keep audit payloads sane.
 */
export function readActorLabel(request: Request): string | null {
  const raw = request.headers.get('X-Actor-Label');
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}
