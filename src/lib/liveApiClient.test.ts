import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteLiveGameRemote } from './liveApiClient';

const fetchMock = vi.fn<typeof fetch>();
const realFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('liveApiClient', () => {
  it('deletes a live game by id', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await deleteLiveGameRemote('abc123');

    expect(fetchMock).toHaveBeenCalledWith('/api/live-games/abc123', {
      method: 'DELETE',
      signal: undefined,
    });
  });

  it('throws ApiError with server message when delete fails', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Live game is finalized.' }), {
        status: 423,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(deleteLiveGameRemote('abc123')).rejects.toMatchObject({
      name: 'ApiError',
      status: 423,
      message: 'Live game is finalized.',
    });
  });
});
