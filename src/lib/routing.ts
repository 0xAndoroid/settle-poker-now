/**
 * Tiny URL-router. Two top-level routes:
 *   - `{kind:'home'}`  — landing + ephemeral hash-state mode (path = '/')
 *   - `{kind:'game', id}` — persistent game view (path = '/g/:id')
 *
 * Anything else falls back to `home`. We intentionally avoid pulling in
 * react-router for two routes.
 */

export type Route = { kind: 'home' } | { kind: 'game'; id: string };

const GAME_PATH = /^\/g\/([0-9a-z]{6,16})\/?$/i;

export function parseRoute(pathname: string): Route {
  const match = pathname.match(GAME_PATH);
  if (match) return { kind: 'game', id: match[1]! };
  return { kind: 'home' };
}

export function gamePath(id: string): string {
  return `/g/${id}`;
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const fn = options.replace ? 'replaceState' : 'pushState';
  window.history[fn](null, '', path);
  // Synthesize a popstate so the app can re-read the path.
  window.dispatchEvent(new PopStateEvent('popstate'));
}
