/**
 * Tiny URL-router. Three top-level routes:
 *   - `{kind:'home'}`  — landing + ephemeral hash-state mode (path = '/')
 *   - `{kind:'game', id}` — persistent game view (path = '/g/:id')
 *   - `{kind:'live', id}` — in-progress live game workflow (path = '/live/:id')
 *
 * Anything else falls back to `home`. We intentionally avoid pulling in
 * react-router for two routes.
 */

import { flushSync } from 'react-dom';

export type Route =
  | { kind: 'home' }
  | { kind: 'game'; id: string }
  | { kind: 'live'; id: string };

const GAME_PATH = /^\/g\/([0-9a-z]{6,16})\/?$/i;
const LIVE_PATH = /^\/live\/([0-9a-z]{6,16})\/?$/i;

export function parseRoute(pathname: string): Route {
  const gameMatch = pathname.match(GAME_PATH);
  if (gameMatch) return { kind: 'game', id: gameMatch[1]! };
  const liveMatch = pathname.match(LIVE_PATH);
  if (liveMatch) return { kind: 'live', id: liveMatch[1]! };
  return { kind: 'home' };
}

export function gamePath(id: string): string {
  return `/g/${id}`;
}

export function liveGamePath(id: string): string {
  return `/live/${id}`;
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const apply = () => {
    const fn = options.replace ? 'replaceState' : 'pushState';
    window.history[fn](null, '', path);
    // Synthesize a popstate so the app can re-read the path. flushSync so
    // the new view is committed to the DOM inside the view-transition
    // callback — otherwise the morph captures a stale frame.
    flushSync(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  };
  if (
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    document.startViewTransition(apply);
  } else {
    apply();
  }
}
