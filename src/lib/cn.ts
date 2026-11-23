
type ClassValue = string | number | false | null | undefined;

export function cn(...args: ClassValue[]): string {
  let out = '';
  for (const arg of args) {
    if (!arg && arg !== 0) continue;
    out = out ? `${out} ${arg}` : String(arg);
  }
  return out;
}
