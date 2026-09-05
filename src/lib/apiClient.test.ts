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
    note: null,
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

const fetchMock = vi.fn<typeof fetch>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('apiClient', () => {
  it('setPaymentCompleted sends the actor and completion state and returns the full snapshot', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ game: SAMPLE_SNAPSHOT }));

    const result = await setPaymentCompleted({
      gameId: 'abc12345',
      paymentId: 'p1',
      completed: true,
      actorLabel: 'Andrew',
    });

    expect(result).toEqual(SAMPLE_SNAPSHOT);
    const call = fetchMock.mock.calls[0]!;
    const url = String(call[0]);
    const init = call[1] as RequestInit;
    expect(url).toBe('/api/games/abc12345/payments/p1');
    expect(init.method).toBe('PATCH');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Actor-Label']).toBe('Andrew');
    expect(JSON.parse(init.body as string)).toEqual({ completed: true });
  });

  it('setPaymentCompleted throws ApiError with server message on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(
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
    fetchMock.mockResolvedValueOnce(okJson({ game: SAMPLE_SNAPSHOT }));
    const result = await runner();
    expect(result).toEqual(SAMPLE_SNAPSHOT);
  });

  it('ApiError surfaces non-JSON error bodies as text', async () => {
    fetchMock.mockResolvedValueOnce(
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
    ).rejects.toMatchObject(new ApiError(502, 'upstream went away'));
  });
});
