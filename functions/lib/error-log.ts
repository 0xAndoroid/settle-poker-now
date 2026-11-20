/**
 * Cloudflare Pages keeps no Function logs, so an uncaught exception is
 * written to the `function_errors` table (migrations/0009) and the client
 * gets only the row's id. README § Function errors has the read command.
 */

import { newGameSlug } from './db';
import { jsonResponse } from './responses';

interface Env {
  DB: D1Database;
}

// The exception being recorded may be D1 itself failing, so a failed write is
// retried after each of these waits. The Workers runtime cancels `waitUntil`
// work 30 s after the response, which the last attempt (at 20 s) must precede.
const RETRY_DELAYS_MS = [1_000, 4_000, 15_000];

export const recordUncaughtErrors: PagesFunction<Env> = async (ctx) => {
  try {
    return await ctx.next();
  } catch (err) {
    const errorId = newGameSlug();
    console.error(`function error ${errorId}`, err);
    ctx.waitUntil(writeErrorRow(ctx.env.DB, errorId, ctx.request, err));
    return jsonResponse(
      { error: `Server error (id ${errorId}).`, errorId },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
};

/** Never rejects: a write that cannot be made is only reported to the console. */
async function writeErrorRow(
  db: D1Database,
  errorId: string,
  request: Request,
  err: unknown
): Promise<void> {
  try {
    const { name, message, stack } =
      err instanceof Error ? err : { name: typeof err, message: String(err), stack: undefined };
    // OR IGNORE: a retry may follow a write that was applied but whose reply was lost.
    const insert = db
      .prepare(
        `INSERT OR IGNORE INTO function_errors
           (id, occurred_at, method, pathname, error_name, message, stack, cf_ray)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        errorId,
        Date.now(),
        request.method,
        new URL(request.url).pathname.slice(0, 500),
        name.slice(0, 200),
        message.slice(0, 2_000),
        stack?.slice(0, 8_000) ?? null,
        request.headers.get('cf-ray')
      );
    for (let attempt = 0; ; attempt++) {
      try {
        await insert.run();
        return;
      } catch (writeErr) {
        const delayMs = RETRY_DELAYS_MS[attempt];
        if (delayMs === undefined) throw writeErr;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } catch (writeErr) {
    console.error(`function error ${errorId} was not recorded`, writeErr);
  }
}
