/**
 * Shared response helpers for Pages Functions. CORS is permissive because
 * the worker is consumed only by our own SPA at the same origin, but
 * leaving the doors open simplifies local dev (vite on :5173 hitting
 * wrangler on :4173).
 */

export const CORS_HEADERS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type, X-Actor-Label, X-Client-Event-Id',
  'Access-Control-Expose-Headers':
    'X-Pokernow-Cents, X-Demo-Source, X-Upstream-Hosts, X-Game-Id, X-Live-Game-Id',
};

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const merged: ResponseInit = {
    ...init,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
  };
  return new Response(JSON.stringify(body), merged);
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}

export async function readJsonBody<T>(request: Request): Promise<
  | {
      ok: true;
      body: T;
    }
  | {
      ok: false;
      response: Response;
    }
> {
  try {
    return { ok: true, body: (await request.json()) as T };
  } catch {
    return { ok: false, response: errorResponse(400, 'Body must be JSON.') };
  }
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
 * Read the actor label from request headers. Used for audit trail. Bounded
 * to 64 chars to keep audit payloads sane.
 */
export function readActorLabel(request: Request): string | null {
  const raw = request.headers.get('X-Actor-Label');
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed.length > 0 ? trimmed : null;
}

export function readClientEventId(
  request: Request,
  body?: { clientEventId?: unknown }
): string | null {
  const raw =
    request.headers.get('X-Client-Event-Id') ??
    (typeof body?.clientEventId === 'string' ? body.clientEventId : null);
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, 120);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Map a known mutation error class to an HTTP response. Returns
 * `null` if the error isn't one we recognise — caller should rethrow
 * so the platform's default error handler logs it.
 *
 * Centralising the mapping keeps every mutation route's catch block
 * to one line. The two recognised classes:
 *   - `LockedError` (game is finalized) → 423 Locked
 *   - any other error with a `.name` of `*ValidationError` → 400 Bad Request
 */
export function mapMutationError(err: unknown): Response | null {
  if (!(err instanceof Error)) return null;
  if (err.name === 'LockedError') {
    return errorResponse(423, err.message);
  }
  if (err.name.endsWith('ValidationError')) {
    return errorResponse(400, err.message);
  }
  return null;
}
