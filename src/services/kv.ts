/**
 * Key/value storage adapter. Every call is guarded: WebView/browser storage can be missing,
 * full, or throw (private mode, previews, disabled cookies). When the platform store is
 * unusable we fall back to memory so the game keeps working for the session.
 */

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
  keys(): string[];
}

export class MemoryKV implements KV {
  private map = new Map<string, string>();
  constructor(seed?: Record<string, string>) {
    if (seed) for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): boolean {
    this.map.set(key, value);
    return true;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

class BrowserKV implements KV {
  private fallback = new MemoryKV();
  private usable: boolean;

  constructor() {
    this.usable = false;
    try {
      const ls = globalThis.localStorage;
      if (ls) {
        const probe = '__pawtopia_probe__';
        ls.setItem(probe, '1');
        ls.removeItem(probe);
        this.usable = true;
      }
    } catch {
      this.usable = false;
    }
  }

  getItem(key: string): string | null {
    if (!this.usable) return this.fallback.getItem(key);
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return this.fallback.getItem(key);
    }
  }

  setItem(key: string, value: string): boolean {
    if (!this.usable) return this.fallback.setItem(key, value);
    try {
      globalThis.localStorage.setItem(key, value);
      return true;
    } catch {
      // Quota exceeded or blocked: keep the value for this session.
      this.fallback.setItem(key, value);
      return false;
    }
  }

  removeItem(key: string): void {
    this.fallback.removeItem(key);
    if (!this.usable) return;
    try {
      globalThis.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  keys(): string[] {
    const out = new Set(this.fallback.keys());
    if (this.usable) {
      try {
        const ls = globalThis.localStorage;
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k !== null) out.add(k);
        }
      } catch {
        /* ignore */
      }
    }
    return [...out];
  }
}

let defaultKV: KV | null = null;

/** The platform store, created lazily so tests and SSR never touch `localStorage`. */
export function platformKV(): KV {
  if (!defaultKV) defaultKV = new BrowserKV();
  return defaultKV;
}

/** Parses JSON without throwing. */
export function safeParse<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
