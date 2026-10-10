export function sessionMemoryKey(userId: string, kind: string, scope: string) {
  return `krc:memory:v1:${encodeURIComponent(userId)}:${kind}:${encodeURIComponent(scope)}`;
}

export function readSessionMemory(key: string): string | null {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

export function writeSessionMemory(key: string, value: string | null): boolean {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

export function parseListMemory(raw: string | null): Record<string, unknown> {
  if (!raw || raw.length > 100_000) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([key]) => !["__proto__", "constructor", "prototype"].includes(key)))
      : {};
  } catch { return {}; }
}

export function matchesMemoryShape(value: unknown, initial: unknown): boolean {
  if (initial === null) return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
  if (Array.isArray(initial)) return Array.isArray(value) && value.length <= 10_000 && value.every((item) => initial.length === 0 || matchesMemoryShape(item, initial[0]));
  if (typeof initial === "object") {
    return !!value && typeof value === "object" && !Array.isArray(value) &&
      Object.entries(initial as Record<string, unknown>).every(([key, sample]) => Object.hasOwn(value, key) && matchesMemoryShape((value as Record<string, unknown>)[key], sample));
  }
  return typeof value === typeof initial && (typeof value !== "number" || Number.isFinite(value));
}

export function restoreListValue<T>(value: unknown, initial: T, allowed?: readonly T[]): T {
  return matchesMemoryShape(value, initial) && (!allowed || allowed.includes(value as T)) ? value as T : initial;
}

export function parseFormDraft<T>(raw: string | null, initial: T, revision: string) {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const draft = JSON.parse(raw) as { revision?: unknown; value?: unknown };
    return draft.revision === revision && matchesMemoryShape(draft.value, initial) ? draft.value as T : null;
  } catch { return null; }
}
