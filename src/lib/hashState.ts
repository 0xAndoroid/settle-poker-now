/**
 * Encode/decode local UI state into the URL hash so that links are shareable
 * and refresh-safe. State persisted:
 *   - gameId
 *   - adjustments (already-paid transfers)
 *   - isolations (per-player "settle only with X" rules)
 *
 * The encoded payload is a base64url-encoded JSON blob (no compression — the
 * payload is small for typical 2–10-player games).
 */

import type { Adjustment, IsolationRule } from './types';

export interface HashState {
  gameId: string | null;
  adjustments: Adjustment[];
  isolations: IsolationRule[];
}

const EMPTY: HashState = { gameId: null, adjustments: [], isolations: [] };

function toBase64Url(input: string): string {
  // btoa requires latin-1; encode UTF-8 first.
  const utf8 = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeHash(state: HashState): string {
  if (!state.gameId && state.adjustments.length === 0 && state.isolations.length === 0) {
    return '';
  }
  const payload = {
    g: state.gameId ?? null,
    a: state.adjustments.map((a) => ({
      i: a.id,
      f: a.fromId,
      t: a.toId,
      c: a.amountCents,
    })),
    iso: state.isolations.map((r) => ({ p: r.playerId, c: r.counterpartId })),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeHash(hash: string): HashState {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return { ...EMPTY };

  try {
    const json = fromBase64Url(raw);
    const parsed = JSON.parse(json) as {
      g?: string | null;
      a?: { i: string; f: string; t: string; c: number }[];
      iso?: { p: string; c: string }[];
    };

    const adjustments: Adjustment[] = (parsed.a ?? [])
      .filter(
        (row) =>
          typeof row.i === 'string' &&
          typeof row.f === 'string' &&
          typeof row.t === 'string' &&
          Number.isFinite(row.c)
      )
      .map((row) => ({
        id: row.i,
        fromId: row.f,
        toId: row.t,
        amountCents: Math.trunc(row.c),
      }));

    const isolations: IsolationRule[] = (parsed.iso ?? [])
      .filter((row) => typeof row.p === 'string' && typeof row.c === 'string')
      .map((row) => ({ playerId: row.p, counterpartId: row.c }));

    return {
      gameId: typeof parsed.g === 'string' ? parsed.g : null,
      adjustments,
      isolations,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function readHashFromLocation(): HashState {
  if (typeof window === 'undefined') return { ...EMPTY };
  return decodeHash(window.location.hash);
}

export function writeHashToLocation(state: HashState): void {
  if (typeof window === 'undefined') return;
  const encoded = encodeHash(state);
  const next = encoded ? `#${encoded}` : '';
  // replaceState keeps history clean and prevents back-button spam.
  const target = `${window.location.pathname}${window.location.search}${next}`;
  window.history.replaceState(null, '', target);
}
