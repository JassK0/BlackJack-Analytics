// Browser-only persistence: everything lives in this viewer's localStorage
import { useCallback, useEffect, useRef, useState } from 'react';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Returns false when the browser refuses (private mode, quota). */
export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** useState that survives reloads. `clean` repairs whatever was stored by an older version. */
export function usePersisted<T>(key: string, initial: T, clean?: (v: T) => T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = load<T>(key, initial);
    try { return clean ? clean(stored) : stored; } catch { return initial; }
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    save(key, value);
  }, [key, value]);
  const set = useCallback((v: T | ((p: T) => T)) => setValue(v), []);
  return [value, set];
}

/** Keep the newest runs that fit; oldest are dropped first when storage is full. */
export function saveHistory<T>(key: string, runs: T[], max: number): T[] {
  let list = runs.slice(0, max);
  while (list.length && !save(key, list)) list = list.slice(0, -1);
  if (!list.length) save(key, []);
  return list;
}
