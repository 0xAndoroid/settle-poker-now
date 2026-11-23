
export function newId(prefix = ''): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}${crypto.randomUUID()}`;
  }
  const random = Math.floor(Math.random() * 0xfffffffffff).toString(36);
  const time = Date.now().toString(36);
  return `${prefix}${time}-${random}`;
}
