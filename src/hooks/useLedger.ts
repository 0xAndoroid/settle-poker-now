import { useCallback, useEffect, useRef, useState } from 'react';
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
  gameId: string | null;
}

const INITIAL: LedgerState = {
  status: 'idle',
  csv: null,
  headerUnit: null,
  error: null,
  gameId: null,
};

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

    setState({ ...INITIAL, status: 'loading', gameId });

    try {
      const res = await fetch(ledgerProxyUrl(gameId), {
        signal: controller.signal,
        headers: { Accept: 'text/csv' },
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(
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
        gameId,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message =
        err instanceof Error ? err.message : 'Unknown error';
      setState({
        status: 'error',
        csv: null,
        headerUnit: null,
        error: message,
        gameId,
      });
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
