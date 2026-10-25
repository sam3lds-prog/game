/**
 * App-scoped persistence.
 *
 * - Every key starts with `cd.` (v2) — v1 used `cvd.`. Reset removes only those prefixes.
 * - Reads and writes never throw: storage can be missing, full, or blocked.
 * - v1 progress is migrated once into the v2 layout; the v1 key is left in place as a backup.
 */

export const PREFIX = 'cd.';
const LEGACY_PREFIX = 'cvd.';

export const KEYS = {
  progress: 'cd.v2.progress',
  settings: 'cd.v2.settings',
  flags: 'cd.v2.flags',
  sessionIndex: 'cd.v2.sessions',
  records: 'cd.v2.records',
  session: (puzzleKey: string) => `cd.v2.session.${puzzleKey}`,
  legacyProgress: 'cvd.progress.v1',
  legacySeenRules: 'cvd.seenRules',
} as const;

/** Optional mirror for native durability (wired in the native layer). */
export interface StorageMirror {
  set(key: string, value: string): void;
  remove(key: string): void;
}
let mirror: StorageMirror | null = null;
export function setStorageMirror(m: StorageMirror | null): void {
  mirror = m;
}

export const kv = {
  getRaw(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  get<T>(key: string, fallback: T): T {
    const raw = kv.getRaw(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): boolean {
    const raw = JSON.stringify(value);
    try {
      localStorage.setItem(key, raw);
      mirror?.set(key, raw);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
      mirror?.remove(key);
    } catch {
      /* ignore */
    }
  },
  keys(prefix: string): string[] {
    const out: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) out.push(k);
      }
    } catch {
      /* ignore */
    }
    return out;
  },
};

// ---------------------------------------------------------------- progress

export interface Progress {
  v: 2;
  /** Next campaign level to play (1-based). */
  level: number;
  /** key: `L${level}` | `D${dateKey}` → seconds */
  bestTimes: Record<string, number>;
  dailyDone: Record<string, boolean>;
  streak: number;
  lastDailyDate: string | null;
  installDate: string;
  /** v1 stub flag. Not a verified entitlement; replaced by the entitlement model in Sprint 6. */
  removeAds: boolean;
  /** Last unlimited board, so it can be continued. */
  lastUnlimited?: { difficulty: 'easy' | 'medium' | 'hard'; seed: number };
}

export function defaultProgress(): Progress {
  return {
    v: 2,
    level: 1,
    bestTimes: {},
    dailyDone: {},
    streak: 0,
    lastDailyDate: null,
    installDate: new Date().toISOString(),
    removeAds: false,
  };
}

interface LegacyProgressV1 {
  level?: number;
  bestTimes?: Record<string, number>;
  dailyDone?: Record<string, boolean>;
  streak?: number;
  lastDailyDate?: string | null;
  installDate?: string;
}

/** Converts v1 progress into v2. The unverified v1 `removeAds` stub flag is intentionally not carried over. */
export function migrateV1(v1: LegacyProgressV1): Progress {
  const d = defaultProgress();
  const level = Number.isFinite(v1.level) && (v1.level as number) >= 1 ? Math.floor(v1.level as number) : 1;
  return {
    ...d,
    level,
    bestTimes: { ...(v1.bestTimes ?? {}) },
    dailyDone: { ...(v1.dailyDone ?? {}) },
    streak: Number.isFinite(v1.streak) ? (v1.streak as number) : 0,
    lastDailyDate: v1.lastDailyDate ?? null,
    installDate: v1.installDate && !Number.isNaN(Date.parse(v1.installDate)) ? v1.installDate : d.installDate,
  };
}

export function loadProgress(): Progress {
  const v2 = kv.get<Partial<Progress> | null>(KEYS.progress, null);
  if (v2 && v2.v === 2) return { ...defaultProgress(), ...v2, v: 2 };
  const v1 = kv.get<LegacyProgressV1 | null>(KEYS.legacyProgress, null);
  const migrated = v1 ? migrateV1(v1) : defaultProgress();
  kv.set(KEYS.progress, migrated);
  return migrated;
}

export function saveProgress(p: Progress): void {
  kv.set(KEYS.progress, p);
}

// ---------------------------------------------------------------- settings & flags

export type InputMode = 'cycle' | 'direct';
export type FaceLevel = 'on' | 'minimal' | 'off';
export type Theme = 'system' | 'light' | 'dark';
export type PlayMode = 'zen' | 'challenge';

export interface Settings {
  /** direct: tap places the selected tool. cycle: tap ✕, tap again for the selected pet. */
  inputMode: InputMode;
  autoMark: boolean;
  haptics: boolean;
  sound: boolean;
  /** Animal expressions: On (reactions + idle blinks), Minimal (reactions only), Off (static faces). */
  faces: FaceLevel;
  /** Mode for new boards. Saved boards keep the mode they were started in. */
  defaultMode: PlayMode;
  theme: Theme;
  /** Low-contrast patterns per region, for color-vision differences. */
  patterns: boolean;
  /** Row, column and region pips showing which pets are still needed. */
  counters: boolean;
  /** Optional daily reminder (iOS app only), off by default. */
  reminder: { enabled: boolean; hour: number; minute: number };
}

export function defaultSettings(): Settings {
  return { inputMode: 'direct', autoMark: true, haptics: true, sound: false, faces: 'on', defaultMode: 'zen', theme: 'system', patterns: false, counters: true, reminder: { enabled: false, hour: 19, minute: 0 } };
}

export function loadSettings(): Settings {
  const stored = kv.get<Partial<Settings> | null>(KEYS.settings, null);
  if (stored) return { ...defaultSettings(), ...stored };
  // v1 kept a few settings inside its progress blob; v1 players were used to tap-cycle and hearts.
  const v1 = kv.get<{ settings?: { autoMark?: boolean; haptics?: boolean } } | null>(KEYS.legacyProgress, null);
  if (!v1) return defaultSettings();
  return {
    ...defaultSettings(),
    inputMode: 'cycle',
    defaultMode: 'challenge',
    ...(v1.settings?.autoMark !== undefined ? { autoMark: v1.settings.autoMark } : {}),
    ...(v1.settings?.haptics !== undefined ? { haptics: v1.settings.haptics } : {}),
  };
}

export function saveSettings(s: Settings): void {
  kv.set(KEYS.settings, s);
}

export interface Flags {
  seenRules: boolean;
  /** Finished or skipped the interactive tutorial. */
  tutorialDone: boolean;
}

export function loadFlags(): Flags {
  const f = kv.get<Partial<Flags> | null>(KEYS.flags, null);
  if (f) return { seenRules: !!f.seenRules, tutorialDone: !!f.tutorialDone };
  // v1 players already know the rules: skip the tutorial for them.
  const veteran = kv.getRaw(KEYS.legacySeenRules) === '1' || kv.getRaw(KEYS.legacyProgress) !== null;
  return { seenRules: veteran, tutorialDone: veteran };
}

export function saveFlags(f: Flags): void {
  kv.set(KEYS.flags, f);
}

// ---------------------------------------------------------------- reset

/**
 * Kept by "Reset progress": the player's settings (incl. the daily reminder, so the scheduled
 * notification and the toggle stay in sync), verified purchases (a paid Remove Ads must survive a
 * reset) and the analytics consent choice with its anonymous id/buffer (the in-memory analytics
 * state must keep matching storage).
 */
const RESET_KEEPS = [KEYS.settings, `${PREFIX}v2.entitlements`, `${PREFIX}v2.analytics.`];

/**
 * "Reset progress": removes this game's progress, records, saved boards, flags and ad pacing —
 * only `cd.`/`cvd.` keys, never other data on the same origin — and keeps RESET_KEEPS.
 */
export function clearGameData(): void {
  const keep = (k: string) => RESET_KEEPS.some((p) => k === p || (p.endsWith('.') && k.startsWith(p)));
  for (const k of [...kv.keys(PREFIX), ...kv.keys(LEGACY_PREFIX)]) if (!keep(k)) kv.remove(k);
}

/** Days since install, for ad cadence. */
export function tenureDays(p: Progress): number {
  const t = Date.parse(p.installDate);
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
}
