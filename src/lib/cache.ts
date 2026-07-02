interface CacheEnvelope<T> {
  value: T;
  savedAt: number;
}

export function readCache<T>(key: string, maxAgeMs: number): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > maxAgeMs) return null;

    return parsed.value;
  } catch {
    return null;
  }
}

export function readAnyCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as CacheEnvelope<T>).value;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({ value, savedAt: Date.now() } satisfies CacheEnvelope<T>),
    );
  } catch {
    // Storage can fail in private mode or when quota is exceeded.
  }
}
