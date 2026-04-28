import { useCallback, useEffect, useRef, useState } from 'react';
import { LedgerParseError, parseLedgerCsv } from '@/lib/csv';
import { ledgerProxyUrl } from '@/lib/pokernow';
import type { ParsedLedger } from '@/lib/types';

export interface LedgerState {
  status: 'idle' | 'loading' | 'success' | 'error';
  ledger: ParsedLedger | null;
  error: string | null;
  gameId: string | null;
}

const INITIAL: LedgerState = {
  status: 'idle',
  ledger: null,
  error: null,
  gameId: null,
};

export function useLedger() {
  const [state, setState] = useState<LedgerState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const fetchGame = useCallback(async (gameId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: 'loading', ledger: null, error: null, gameId });

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
      const ledger = parseLedgerCsv(csv);
      setState({ status: 'success', ledger, error: null, gameId });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const message =
        err instanceof LedgerParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Unknown error';
      setState({ status: 'error', ledger: null, error: message, gameId });
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
