/**
 * Minimal className concatenator. Filters falsy values; collapses whitespace.
 * Avoids pulling in `clsx` + `tailwind-merge` for a UI of this size.
 */

type ClassValue = string | number | false | null | undefined;

export function cn(...args: ClassValue[]): string {
  let out = '';
  for (const arg of args) {
    if (!arg && arg !== 0) continue;
    out = out ? `${out} ${arg}` : String(arg);
  }
  return out;
}
