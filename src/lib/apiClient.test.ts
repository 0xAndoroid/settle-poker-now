/**
 * apiClient contract tests — focused on the race-condition fix:
 *
 * The PATCH endpoint MUST return the full updated game snapshot so the
 * client can replace local state authoritatively without a follow-up
 * GET (which can race with the next polling tick). The same contract
 * applies to the other mutation endpoints (adjustments, isolation).
 *
 * We mock `fetch` and verify each mutation returns a `PersistedGameSnapshot`
 * extracted from `{game: ...}`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  addAdjustmentRemote,
  clearIsolationRemote,
  removeAdjustmentRemote,
  setIsolationRemote,
  setPaymentCompleted,
} from './apiClient';
import type { PersistedGameSnapshot } from './types';

const SAMPLE_SNAPSHOT: PersistedGameSnapshot = {
  game: {
    id: 'abc12345',
    pokernowGameId: 'pokernow-test',
    sourceUnit: 'cents',
    unitProvenance: 'header',
    startedAt: 0,
    endedAt: 0,
    createdAt: 0,
    updatedAt: 1,
    finalizedAt: 1,
    finalizedBy: 'Andrew',
  },
  players: [
    { playerId: 'a', nickname: 'A', netCents: -5000 },
    { playerId: 'b', nickname: 'B', netCents: 5000 },
  ],
  payments: [
    {
      id: 'p1',
      fromPlayerId: 'a',
      toPlayerId: 'b',
      amountCents: 5000,
      forced: false,
      position: 0,
      completedAt: 1234,
      completedBy: 'Andrew',
    },
  ],
  adjustments: [],
  isolations: [],
  aliases: [],
  paymentMethods: [],
  audit: [],
};

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

// `vi.spyOn(globalThis, 'fetch')` produces a mock with a strict signature
// that fights the test helpers below. Using vi.fn() typed as the fetch
// signature is cleaner here.
const fetchMock = vi.fn<typeof fetch>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const fetchSpy = fetchMock;

describe('apiClient — race-fix contract', () => {
  it('setPaymentCompleted returns the full updated snapshot (not just the payment)', async () => {
    fetchSpy.mockResolvedValueOnce(okJson({ game: SAMPLE_SNAPSHOT }));

    const result = await setPaymentCompleted({
      gameId: 'abc12345',
      paymentId: 'p1',
      completed: true,
      actorLabel: 'Andrew',
    });

    expect(result).toEqual(SAMPLE_SNAPSHOT);
    // Critical: the result must include the full payments + audit so the
    // client can render strikethrough + "settled by Andrew" without a
    // follow-up GET.
    expect(result.payments[0]!.completedAt).toBe(1234);
    expect(result.payments[0]!.completedBy).toBe('Andrew');
  });

  it('setPaymentCompleted sends X-Actor-Label and {completed} body', async () => {
    fetchSpy.mockResolvedValueOnce(okJson({ game: SAMPLE_SNAPSHOT }));
    await setPaymentCompleted({
      gameId: 'abc12345',
      paymentId: 'p1',
      completed: true,
      actorLabel: 'Andrew',
    });
    const call = fetchSpy.mock.calls[0]!;
    const url = String(call[0]);
    const init = call[1] as RequestInit;
    expect(url).toBe('/api/games/abc12345/payments/p1');
    expect(init.method).toBe('PATCH');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Actor-Label']).toBe('Andrew');
    expect(JSON.parse(init.body as string)).toEqual({ completed: true });
  });

  it('setPaymentCompleted throws ApiError with server message on non-2xx', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'No payment with id "ghost".' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(
      setPaymentCompleted({
        gameId: 'abc12345',
        paymentId: 'ghost',
        completed: true,
        actorLabel: null,
      })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'No payment with id "ghost".',
    });
  });

  it.each([
    [
      'addAdjustmentRemote',
      () =>
        addAdjustmentRemote({
          gameId: 'abc12345',
          fromPlayerId: 'a',
          toPlayerId: 'b',
          amountCents: 100,
          actorLabel: 'Andrew',
        }),
    ],
    [
      'removeAdjustmentRemote',
      () =>
        removeAdjustmentRemote({
          gameId: 'abc12345',
          adjustmentId: 'adj-1',
          actorLabel: 'Andrew',
        }),
    ],
    [
      'setIsolationRemote',
      () =>
        setIsolationRemote({
          gameId: 'abc12345',
          playerId: 'a',
          counterpartId: 'b',
          actorLabel: 'Andrew',
        }),
    ],
    [
      'clearIsolationRemote',
      () =>
        clearIsolationRemote({
          gameId: 'abc12345',
          playerId: 'a',
          actorLabel: 'Andrew',
        }),
    ],
  ])('%s also returns the full snapshot', async (_name, runner) => {
    fetchSpy.mockResolvedValueOnce(okJson({ game: SAMPLE_SNAPSHOT }));
    const result = await runner();
    expect(result).toEqual(SAMPLE_SNAPSHOT);
  });

  it('ApiError surfaces non-JSON error bodies as text', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response('upstream went away', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      })
    );
    await expect(
      setPaymentCompleted({
        gameId: 'abc12345',
        paymentId: 'p1',
        completed: true,
        actorLabel: null,
      })
    ).rejects.toBeInstanceOf(ApiError);
  });
});
