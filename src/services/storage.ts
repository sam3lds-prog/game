/** Local persistence. Every read/write is guarded: browser storage can be empty or throw (private mode, previews). */

export interface Progress {
  level: number; // next level to play
  bestTimes: Record<string, number>; // key: `L${level}` | `D${dateKey}` → seconds
  dailyDone: Record<string, boolean>;
  streak: number;
  lastDailyDate: string | null;
  installDate: string; // ISO date, used for ad-cadence tenure
  removeAds: boolean;
  settings: {
    autoMark: boolean;
    haptics: boolean;
    sound: boolean;
  };
}

const KEY = 'cvd.progress.v1';

export function defaultProgress(): Progress {
  return {
    level: 1,
    bestTimes: {},
    dailyDone: {},
    streak: 0,
    lastDailyDate: null,
    installDate: new Date().toISOString(),
    removeAds: false,
    settings: { autoMark: true, haptics: true, sound: true },
  };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { ...defaultProgress(), ...parsed, settings: { ...defaultProgress().settings, ...(parsed.settings ?? {}) } };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable — play on without persistence */
  }
}

/** Removes only this game's keys (prefix `cvd.`), never other data on the same origin. */
export function clearGameData(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cvd.')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}

/** Days since install, for ad cadence. */
export function tenureDays(p: Progress): number {
  const t = Date.parse(p.installDate);
  if (Number.isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 86_400_000);
}
