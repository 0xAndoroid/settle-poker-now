import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordUncaughtErrors } from './error-log';
import { errorResponse } from './responses';

const THROWN_AT = Date.UTC(2026, 10, 20, 2, 0, 28);

function fakeDb(failedWrites = 0) {
  const rows: Record<string, unknown>[] = [];
  let writeAttempts = 0;
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        run: async () => {
          writeAttempts += 1;
          if (writeAttempts <= failedWrites) throw new Error('D1_ERROR: Network connection lost.');
          const columns = /\(([^)]+)\)\s+VALUES/.exec(sql)![1]!.split(',');
          rows.push(Object.fromEntries(columns.map((column, i) => [column.trim(), values[i]])));
        },
      }),
    }),
  } as unknown as D1Database;
  return { db, rows, writeAttempts: () => writeAttempts };
}

async function handle(
  db: D1Database,
  next: () => Promise<Response>,
  request = new Request('https://settle.test/api/live-games/abc123')
) {
  const background: Promise<unknown>[] = [];
  const response = await recordUncaughtErrors({
    request,
    env: { DB: db },
    next,
    waitUntil: (work: Promise<unknown>) => void background.push(work),
  } as unknown as Parameters<typeof recordUncaughtErrors>[0]);
  return { response, background };
}

describe('recordUncaughtErrors', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: THROWN_AT });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('answers an uncaught exception with an id-only 500 and records the exception', async () => {
    const { db, rows } = fakeDb();
    const thrown = new TypeError('m'.repeat(9_000));
    thrown.stack = 's'.repeat(9_000);
    const request = new Request('https://settle.test/api/live-games/abc123/players?token=q', {
      method: 'POST',
      headers: { 'cf-ray': '9a1b2c3d4e5f-EWR', 'X-Actor-Label': 'Kevin' },
      body: 'null',
    });

    const { response, background } = await handle(db, () => Promise.reject(thrown), request);

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const text = await response.text();
    const body = JSON.parse(text) as { error: string; errorId: string };
    expect(Object.keys(body).sort()).toEqual(['error', 'errorId']);
    expect(body.errorId).toMatch(/^\w+$/);
    expect(body.error).toContain(body.errorId);
    expect(text).not.toContain('mmm');
    expect(text).not.toContain('sss');

    await Promise.all(background);
    expect(rows).toEqual([
      {
        id: body.errorId,
        occurred_at: THROWN_AT,
        method: 'POST',
        pathname: '/api/live-games/abc123/players',
        error_name: 'TypeError',
        message: 'm'.repeat(2_000),
        stack: 's'.repeat(8_000),
        cf_ray: '9a1b2c3d4e5f-EWR',
      },
    ]);
  });

  it('retries a failed write after the response has been returned', async () => {
    const { db, rows, writeAttempts } = fakeDb(2);

    const { response, background } = await handle(db, () => Promise.reject(new Error('boom')));

    expect(response.status).toBe(500);
    expect(writeAttempts()).toBe(1);
    expect(rows).toEqual([]);

    await vi.runAllTimersAsync();
    await Promise.all(background);
    expect(writeAttempts()).toBe(3);
    expect(rows).toEqual([expect.objectContaining({ occurred_at: THROWN_AT })]);
  });

  it('gives up inside the 30 s waitUntil window when the write keeps failing', async () => {
    const { db, rows, writeAttempts } = fakeDb(Infinity);

    const { response, background } = await handle(db, () => Promise.reject(new Error('boom')));
    await vi.runAllTimersAsync();

    await expect(Promise.all(background)).resolves.toHaveLength(1);
    expect(response.status).toBe(500);
    expect(writeAttempts()).toBeGreaterThan(1);
    expect(Date.now() - THROWN_AT).toBeLessThan(30_000);
    expect(rows).toEqual([]);
  });

  it('passes successful and handled error responses through untouched', async () => {
    const { db, writeAttempts } = fakeDb();

    for (const passed of [new Response('ok'), errorResponse(404, 'No live game with id "x".')]) {
      const { response, background } = await handle(db, async () => passed);
      expect(response).toBe(passed);
      expect(background).toEqual([]);
    }
    expect(writeAttempts()).toBe(0);
  });
});
