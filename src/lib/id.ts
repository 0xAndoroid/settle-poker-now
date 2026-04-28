/**
 * Lightweight ID generator. Avoids pulling in `uuid` for a single use.
 * Uses crypto.randomUUID() when available, falls back to a Math.random-based
 * 12-char base36 string. IDs are local-only — uniqueness within a session is
 * the only requirement.
 */

export function newId(prefix = ''): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  const random = Math.floor(Math.random() * 0xfffffffffff).toString(36);
  const time = Date.now().toString(36);
  return `${prefix}${time}-${random}`;
}
