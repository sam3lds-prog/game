/**
 * Versioned local save.
 *
 *  - v1 (`cvd.progress.v1`) is the original Cats vs Dogs save. It is read once, copied to a backup key,
 *    and mapped into v2. The v1 key itself is never deleted by migration, so a rollback build still works.
 *  - v2 (`pawtopia.save.v2`) holds journey, daily, inventory (append-only coin ledger), sanctuary,
 *    missions, achievements, settings, purchases and the in-progress board.
 *  - Every field is normalized on load, so new optional fields can be added without a version bump and
 *    a corrupted or partial save degrades to defaults instead of crashing.
 *  - Reset only removes keys this app owns (`pawtopia.*`, `cvd.*`) and keeps purchase entitlements.
 */

import { type KV, platformKV, safeParse } from './kv';
import type { ModeRef } from '../game/modes';
import { isValidModeRef } from '../game/modes';
import type { SessionSnapshot } from '../game/session';

// ------------------------------------------------------------------ keys

export const V1_KEY = 'cvd.progress.v1';
export const V1_RULES_KEY = 'cvd.seenRules';
export const V2_KEY = 'pawtopia.save.v2';
export const V1_BACKUP_KEY = 'pawtopia.backup.cvd.progress.v1';
export const APP_KEY_PREFIXES = ['pawtopia.', 'cvd.'];

// ------------------------------------------------------------------ v1 (legacy) shape

/** The original v1 save. Kept for migration and fixtures. */
export interface ProgressV1 {
  level: number;
  bestTimes: Record<string, number>; // `L${level}` | `D${dateKey}` → seconds
  dailyDone: Record<string, boolean>;
  streak: number;
  lastDailyDate: string | null;
  installDate: string;
  removeAds: boolean;
  settings: { autoMark: boolean; haptics: boolean; sound: boolean };
}

// ------------------------------------------------------------------ v2 shape

export type ReducedMotionPref = 'system' | 'reduce' | 'full';
export type ControlScheme = 'tools' | 'classic';

export interface Settings {
  autoMark: boolean;
  haptics: boolean;
  sound: boolean;
  music: boolean;
  reducedMotion: ReducedMotionPref;
  highContrast: boolean;
  regionPatterns: boolean;
  leftHanded: boolean;
  controls: ControlScheme;
  showTimer: boolean;
  largeBoard: boolean;
}

export interface LevelClear {
  firstClearAt: string;
  bestSeconds: number;
  bestMistakes: number;
  clean: boolean; // ever solved with zero mistakes
  hintFree: boolean; // ever solved without hints
  stars: number; // 1–3, cosmetic only
}

export interface DailyClear {
  at: string;
  seconds: number;
  mistakes: number;
}

export interface LedgerEntry {
  /** Idempotency key, e.g. `clear:L12`, `buy:decor:lamp`. A given id is applied at most once. */
  id: string;
  delta: number;
  at: string;
  source: 'journey' | 'daily' | 'mission' | 'achievement' | 'chapter' | 'migration' | 'shop' | 'revive' | 'gift';
  note?: string;
}

export interface CupAttemptRecord {
  at: string;
  completed: boolean;
  seconds: number;
  mistakes: number;
  score: number;
}

export interface SaveV2 {
  progressVersion: 2;
  installDate: string;
  migratedFrom: 'v1' | null;
  journey: {
    nextLevel: number;
    bestTimes: Record<string, number>; // `L${level}` → seconds (kept in v1 format for continuity)
    clears: Record<string, LevelClear>; // `L${level}`
  };
  daily: {
    done: Record<string, DailyClear>; // dateKey (local)
    bestTimes: Record<string, number>; // `D${dateKey}` → seconds
    streak: number;
    bestStreak: number;
    lastDate: string | null;
    cozyDays: Record<string, string>; // monthKey → the dateKey a Cozy Day covered
  };
  zen: { solved: number; nextSeed: number };
  cup: { attempts: Record<string, CupAttemptRecord[]> }; // `C${weekKey}-${index}`
  inventory: {
    ledger: LedgerEntry[];
    pets: Record<string, { unlockedAt: string }>;
    accents: Record<string, string>; // `${petId}:${accentId}` → ownedAt
    equippedAccent: Record<string, string>; // petId → accentId
    favorites: Record<string, boolean>;
    decor: Record<string, { ownedAt: string }>;
  };
  sanctuary: { hidden: Record<string, boolean>; visits: number };
  missions: { dayKey: string | null; weekKey: string | null; progress: Record<string, number>; claimed: Record<string, boolean> };
  achievements: Record<string, string>; // id → unlockedAt
  stats: {
    solved: number;
    clean: number;
    hintFree: number;
    losses: number;
    comebacks: number;
    bestBySize: Record<string, number>; // size → seconds
    sizesThisWeek: Record<string, boolean>;
    playDays: Record<string, boolean>;
  };
  settings: Settings;
  purchases: {
    removeAds: { active: boolean; source: 'legacy-v1' | 'store' | 'dev' | null; verifiedAt: string | null };
    owned: Record<string, { source: 'store' | 'dev'; at: string }>;
  };
  onboarding: {
    seenRules: boolean;
    tutorialDone: boolean;
    starterDecorChosen: boolean;
    seenLeagueIntro: boolean;
    sessions: number;
  };
  lastSession: SavedSession | null;
}

export interface SavedSession {
  mode: ModeRef;
  /** Digest of (size, regions, givens) so a regenerated board that differs is never resumed. */
  digest: string;
  generatorVersion: number;
  savedAt: string;
  snap: SessionSnapshot;
}

export function defaultSettings(): Settings {
  return {
    autoMark: true,
    haptics: true,
    sound: true,
    music: false,
    reducedMotion: 'system',
    highContrast: false,
    regionPatterns: false,
    leftHanded: false,
    controls: 'tools',
    showTimer: true,
    largeBoard: false,
  };
}

export function defaultSave(now = new Date()): SaveV2 {
  return {
    progressVersion: 2,
    installDate: now.toISOString(),
    migratedFrom: null,
    journey: { nextLevel: 1, bestTimes: {}, clears: {} },
    daily: { done: {}, bestTimes: {}, streak: 0, bestStreak: 0, lastDate: null, cozyDays: {} },
    zen: { solved: 0, nextSeed: 1 },
    cup: { attempts: {} },
    inventory: { ledger: [], pets: {}, accents: {}, equippedAccent: {}, favorites: {}, decor: {} },
    sanctuary: { hidden: {}, visits: 0 },
    missions: { dayKey: null, weekKey: null, progress: {}, claimed: {} },
    achievements: {},
    stats: { solved: 0, clean: 0, hintFree: 0, losses: 0, comebacks: 0, bestBySize: {}, sizesThisWeek: {}, playDays: {} },
    settings: defaultSettings(),
    purchases: { removeAds: { active: false, source: null, verifiedAt: null }, owned: {} },
    onboarding: { seenRules: false, tutorialDone: false, starterDecorChosen: false, seenLeagueIntro: false, sessions: 0 },
    lastSession: null,
  };
}

// ------------------------------------------------------------------ normalization helpers

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);
const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
const int = (x: unknown, d: number, lo = -Infinity, hi = Infinity) =>
  typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d;
const str = (x: unknown, d: string) => (typeof x === 'string' ? x : d);
const strOrNull = (x: unknown) => (typeof x === 'string' ? x : null);
function oneOf<T extends string>(x: unknown, opts: readonly T[], d: T): T {
  return typeof x === 'string' && (opts as readonly string[]).includes(x) ? (x as T) : d;
}
function rec<T>(x: unknown, item: (v: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObj(x)) return out;
  for (const [k, v] of Object.entries(x)) {
    const it = item(v);
    if (it !== undefined) out[k] = it;
  }
  return out;
}
const numItem = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const boolItem = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const strItem = (v: unknown) => (typeof v === 'string' ? v : undefined);

function normSettings(x: unknown): Settings {
  const d = defaultSettings();
  if (!isObj(x)) return d;
  return {
    autoMark: bool(x.autoMark, d.autoMark),
    haptics: bool(x.haptics, d.haptics),
    sound: bool(x.sound, d.sound),
    music: bool(x.music, d.music),
    reducedMotion: oneOf(x.reducedMotion, ['system', 'reduce', 'full'] as const, d.reducedMotion),
    highContrast: bool(x.highContrast, d.highContrast),
    regionPatterns: bool(x.regionPatterns, d.regionPatterns),
    leftHanded: bool(x.leftHanded, d.leftHanded),
    controls: oneOf(x.controls, ['tools', 'classic'] as const, d.controls),
    showTimer: bool(x.showTimer, d.showTimer),
    largeBoard: bool(x.largeBoard, d.largeBoard),
  };
}

const LEDGER_SOURCES = ['journey', 'daily', 'mission', 'achievement', 'chapter', 'migration', 'shop', 'revive', 'gift'] as const;

function normLedger(x: unknown): LedgerEntry[] {
  if (!Array.isArray(x)) return [];
  const seen = new Set<string>();
  const out: LedgerEntry[] = [];
  for (const e of x) {
    if (!isObj(e) || typeof e.id !== 'string' || seen.has(e.id)) continue;
    if (typeof e.delta !== 'number' || !Number.isFinite(e.delta)) continue;
    seen.add(e.id);
    out.push({
      id: e.id,
      delta: Math.round(e.delta),
      at: str(e.at, ''),
      source: oneOf(e.source, LEDGER_SOURCES, 'gift'),
      ...(typeof e.note === 'string' ? { note: e.note } : {}),
    });
  }
  return out;
}

function normSavedSession(x: unknown): SavedSession | null {
  if (!isObj(x) || !isValidModeRef(x.mode) || typeof x.digest !== 'string' || !isObj(x.snap)) return null;
  return {
    mode: x.mode,
    digest: x.digest,
    generatorVersion: int(x.generatorVersion, 1),
    savedAt: str(x.savedAt, ''),
    snap: x.snap as unknown as SessionSnapshot,
  };
}

/** Coerces any parsed JSON into a complete, well-typed v2 save. */
export function normalizeSave(x: unknown, now = new Date()): SaveV2 {
  const d = defaultSave(now);
  if (!isObj(x)) return d;
  const j = isObj(x.journey) ? x.journey : {};
  const dl = isObj(x.daily) ? x.daily : {};
  const z = isObj(x.zen) ? x.zen : {};
  const cup = isObj(x.cup) ? x.cup : {};
  const inv = isObj(x.inventory) ? x.inventory : {};
  const san = isObj(x.sanctuary) ? x.sanctuary : {};
  const mi = isObj(x.missions) ? x.missions : {};
  const st = isObj(x.stats) ? x.stats : {};
  const pu = isObj(x.purchases) ? x.purchases : {};
  const ra = isObj(pu.removeAds) ? pu.removeAds : {};
  const ob = isObj(x.onboarding) ? x.onboarding : {};

  return {
    progressVersion: 2,
    installDate: str(x.installDate, d.installDate),
    migratedFrom: x.migratedFrom === 'v1' ? 'v1' : null,
    journey: {
      nextLevel: int(j.nextLevel, 1, 1, 100000),
      bestTimes: rec(j.bestTimes, numItem),
      clears: rec(j.clears, (v) => {
        if (!isObj(v)) return undefined;
        return {
          firstClearAt: str(v.firstClearAt, ''),
          bestSeconds: int(v.bestSeconds, 0, 0),
          bestMistakes: int(v.bestMistakes, 0, 0),
          clean: bool(v.clean, false),
          hintFree: bool(v.hintFree, false),
          stars: int(v.stars, 1, 1, 3),
        };
      }),
    },
    daily: {
      done: rec(dl.done, (v) => (isObj(v) ? { at: str(v.at, ''), seconds: int(v.seconds, 0, 0), mistakes: int(v.mistakes, 0, 0) } : undefined)),
      bestTimes: rec(dl.bestTimes, numItem),
      streak: int(dl.streak, 0, 0),
      bestStreak: int(dl.bestStreak, 0, 0),
      lastDate: strOrNull(dl.lastDate),
      cozyDays: rec(dl.cozyDays, strItem),
    },
    zen: { solved: int(z.solved, 0, 0), nextSeed: int(z.nextSeed, 1, 1) },
    cup: {
      attempts: rec(cup.attempts, (v) =>
        Array.isArray(v)
          ? v.filter(isObj).map((a) => ({
              at: str(a.at, ''),
              completed: bool(a.completed, false),
              seconds: int(a.seconds, 0, 0),
              mistakes: int(a.mistakes, 0, 0),
              score: int(a.score, 0, 0),
            }))
          : undefined,
      ),
    },
    inventory: {
      ledger: normLedger(inv.ledger),
      pets: rec(inv.pets, (v) => (isObj(v) ? { unlockedAt: str(v.unlockedAt, '') } : undefined)),
      accents: rec(inv.accents, strItem),
      equippedAccent: rec(inv.equippedAccent, strItem),
      favorites: rec(inv.favorites, boolItem),
      decor: rec(inv.decor, (v) => (isObj(v) ? { ownedAt: str(v.ownedAt, '') } : undefined)),
    },
    sanctuary: { hidden: rec(san.hidden, boolItem), visits: int(san.visits, 0, 0) },
    missions: {
      dayKey: strOrNull(mi.dayKey),
      weekKey: strOrNull(mi.weekKey),
      progress: rec(mi.progress, numItem),
      claimed: rec(mi.claimed, boolItem),
    },
    achievements: rec(x.achievements, strItem),
    stats: {
      solved: int(st.solved, 0, 0),
      clean: int(st.clean, 0, 0),
      hintFree: int(st.hintFree, 0, 0),
      losses: int(st.losses, 0, 0),
      comebacks: int(st.comebacks, 0, 0),
      bestBySize: rec(st.bestBySize, numItem),
      sizesThisWeek: rec(st.sizesThisWeek, boolItem),
      playDays: rec(st.playDays, boolItem),
    },
    settings: normSettings(x.settings),
    purchases: {
      removeAds: {
        active: bool(ra.active, false),
        source: ra.source === 'legacy-v1' || ra.source === 'store' || ra.source === 'dev' ? ra.source : null,
        verifiedAt: strOrNull(ra.verifiedAt),
      },
      owned: rec(pu.owned, (v) => (isObj(v) && (v.source === 'store' || v.source === 'dev') ? { source: v.source, at: str(v.at, '') } : undefined)),
    },
    onboarding: {
      seenRules: bool(ob.seenRules, false),
      tutorialDone: bool(ob.tutorialDone, false),
      starterDecorChosen: bool(ob.starterDecorChosen, false),
      seenLeagueIntro: bool(ob.seenLeagueIntro, false),
      sessions: int(ob.sessions, 0, 0),
    },
    lastSession: normSavedSession(x.lastSession),
  };
}

// ------------------------------------------------------------------ migration

/** Maps a (possibly partial) v1 save into v2. Pure: does not touch storage. */
export function migrateV1(v1raw: unknown, seenRules: boolean, now = new Date()): SaveV2 {
  const s = defaultSave(now);
  s.migratedFrom = 'v1';
  s.onboarding.seenRules = seenRules;
  if (!isObj(v1raw)) return s;
  const v1 = v1raw as Partial<ProgressV1>;
  s.installDate = str(v1.installDate, s.installDate);
  const level = int(v1.level, 1, 1, 100000);
  s.journey.nextLevel = level;
  // A returning player has seen the rules and finished level 1 — don't run the tutorial again.
  if (level > 1) {
    s.onboarding.seenRules = true;
    s.onboarding.tutorialDone = true;
  }
  const times = rec(v1.bestTimes, numItem);
  for (const [k, secs] of Object.entries(times)) {
    if (/^L\d+$/.test(k)) s.journey.bestTimes[k] = secs;
    else if (/^D\d{4}-\d{2}-\d{2}$/.test(k)) s.daily.bestTimes[k] = secs;
  }
  // Levels below `level` were cleared in v1. Record them so replays never mint first-clear coins twice.
  const at = now.toISOString();
  for (let L = 1; L < level; L++) {
    const key = `L${L}`;
    s.journey.clears[key] = { firstClearAt: at, bestSeconds: s.journey.bestTimes[key] ?? 0, bestMistakes: 0, clean: false, hintFree: false, stars: 1 };
  }
  const done = rec(v1.dailyDone, boolItem);
  for (const [dateKey, ok] of Object.entries(done)) {
    if (!ok || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    s.daily.done[dateKey] = { at, seconds: s.daily.bestTimes[`D${dateKey}`] ?? 0, mistakes: 0 };
  }
  s.daily.streak = int(v1.streak, 0, 0);
  s.daily.bestStreak = s.daily.streak;
  s.daily.lastDate = strOrNull(v1.lastDailyDate);
  if (v1.removeAds === true) {
    // Honored, but flagged: v1 used a stub store, so this must be confirmed by a real restore later.
    s.purchases.removeAds = { active: true, source: 'legacy-v1', verifiedAt: null };
  }
  if (isObj(v1.settings)) {
    s.settings.autoMark = bool(v1.settings.autoMark, s.settings.autoMark);
    s.settings.haptics = bool(v1.settings.haptics, s.settings.haptics);
    s.settings.sound = bool(v1.settings.sound, s.settings.sound);
  }
  return s;
}

export interface LoadResult {
  save: SaveV2;
  source: 'v2' | 'migrated-v1' | 'fresh' | 'recovered';
}

/**
 * Loads the save. Order: valid v2 → migrate v1 (backup first, verify round-trip) → fresh.
 * Idempotent: if the app dies mid-migration, the next launch simply migrates again from the untouched v1 key.
 */
export function loadSave(kv: KV = platformKV(), now = new Date()): LoadResult {
  const rawV2 = kv.getItem(V2_KEY);
  if (rawV2 !== null) {
    const parsed = safeParse<unknown>(rawV2);
    if (isObj(parsed) && parsed.progressVersion === 2) return { save: normalizeSave(parsed, now), source: 'v2' };
    // Corrupt v2: fall through to v1 if present, otherwise start fresh (keep the bad copy for support).
    kv.setItem('pawtopia.corrupt.v2', rawV2);
  }
  const rawV1 = kv.getItem(V1_KEY);
  if (rawV1 !== null) {
    const seenRules = kv.getItem(V1_RULES_KEY) !== null;
    if (kv.getItem(V1_BACKUP_KEY) === null) kv.setItem(V1_BACKUP_KEY, rawV1);
    const migrated = migrateV1(safeParse<unknown>(rawV1), seenRules, now);
    const json = JSON.stringify(migrated);
    kv.setItem(V2_KEY, json);
    // Round-trip check: what we read back must equal what we wrote.
    const back = kv.getItem(V2_KEY);
    if (back !== json) return { save: migrated, source: 'migrated-v1' };
    return { save: normalizeSave(JSON.parse(back), now), source: 'migrated-v1' };
  }
  return { save: defaultSave(now), source: rawV2 !== null ? 'recovered' : 'fresh' };
}

export function saveSave(save: SaveV2, kv: KV = platformKV()): boolean {
  return kv.setItem(V2_KEY, JSON.stringify(save));
}

/**
 * Erases local progress after the player confirmed. Only app-owned keys are removed, so other data
 * on the same origin survives, and purchase entitlements + settings are carried into the fresh save.
 */
export function resetProgress(current: SaveV2, kv: KV = platformKV(), now = new Date()): SaveV2 {
  for (const k of kv.keys()) {
    if (APP_KEY_PREFIXES.some((p) => k.startsWith(p))) kv.removeItem(k);
  }
  const fresh = defaultSave(now);
  fresh.purchases = JSON.parse(JSON.stringify(current.purchases));
  fresh.settings = { ...current.settings };
  fresh.onboarding.seenRules = true;
  saveSave(fresh, kv);
  return fresh;
}

/** Days since install, for ad cadence. */
export function tenureDays(save: Pick<SaveV2, 'installDate'>, now = Date.now()): number {
  const t = Date.parse(save.installDate);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}
