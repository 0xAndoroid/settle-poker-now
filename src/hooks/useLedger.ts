import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/apiClient';
import { errorStatus as getErrorStatus } from '@/lib/errors';
import { ledgerProxyUrl } from '@/lib/pokernow';
import type { LedgerUnit } from '@/lib/types';

export type LedgerStatus = 'idle' | 'loading' | 'success' | 'error';

export interface LedgerState {
  status: LedgerStatus;
  /** Raw CSV body returned by the proxy. Kept around so we can re-parse on unit-override changes. */
  csv: string | null;
  /**
   * Authoritative unit hint from the worker (sourced from PokerNow's
   * hand-replayer API). `null` if the worker couldn't determine it (the
   * parser falls back to its heuristic).
   */
  headerUnit: LedgerUnit | null;
  error: string | null;
  errorStatus: number | null;
  gameId: string | null;
}

const INITIAL: LedgerState = {
  status: 'idle',
  csv: null,
  headerUnit: null,
  error: null,
  errorStatus: null,
  gameId: null,
};

const LEDGER_FETCH_TIMEOUT_MS = 15_000;

function readUnitHeader(headerValue: string | null): LedgerUnit | null {
  if (headerValue == null) return null;
  const v = headerValue.trim().toLowerCase();
  if (v === 'true' || v === '1') return 'cents';
  if (v === 'false' || v === '0') return 'dollars';
  return null;
}

export function useLedger() {
  const [state, setState] = useState<LedgerState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const fetchGame = useCallback(async (gameId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, LEDGER_FETCH_TIMEOUT_MS);

    setState({ ...INITIAL, status: 'loading', gameId });

    try {
      const res = await fetch(ledgerProxyUrl(gameId), {
        signal: controller.signal,
        headers: { Accept: 'text/csv' },
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new ApiError(
          res.status,
          `Couldn't fetch ledger (HTTP ${res.status}). ${detail.slice(0, 200) || 'Check the game URL.'}`
        );
      }

      const csv = await res.text();
      const headerUnit = readUnitHeader(res.headers.get('X-Pokernow-Cents'));

      setState({
        status: 'success',
        csv,
        headerUnit,
        error: null,
        errorStatus: null,
        gameId,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError' && !timedOut) return;
      const message = timedOut
        ? 'Could not fetch ledger — PokerNow did not respond within 15 seconds. The game may not exist or may be private.'
        : err instanceof Error
          ? err.message
          : 'Unknown error';
      setState({
        status: 'error',
        csv: null,
        headerUnit: null,
        error: message,
        errorStatus: timedOut ? null : getErrorStatus(err),
        gameId,
      });
    } finally {
      window.clearTimeout(timeout);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL);
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return { state, fetchGame, reset };
}
