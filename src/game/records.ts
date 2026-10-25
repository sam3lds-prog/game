/**
 * Player records: solve history, statistics, awards and collectible coats.
 *
 * Every reward is idempotent: awards and coats unlock once, first-time completions are tracked by
 * puzzle id, and replaying a puzzle only adds to totals (never to "first-time" counts).
 */
import type { Difficulty } from '../engine/types';
import { KEYS, kv } from '../services/storage';
import { bestStreak, currentStreak } from './streak';

export type PlayKind = 'level' | 'daily' | 'unlimited' | 'tutorial';

export interface SolveRecord {
  id: string;
  kind: PlayKind;
  size: number;
  difficulty: Difficulty;
  mode: 'zen' | 'challenge';
  seconds: number;
  mistakes: number;
  hints: number;
  /** Local date the solve happened. */
  on: string;
}

export interface DailyRecord {
  /** Local date it was solved — equal to the daily's date when solved on the day. */
  solvedOn: string;
  seconds: number;
}

export interface Records {
  v: 1;
  total: number;
  firstTime: number;
  zeroMistake: number;
  perfect: number;
  hints: number;
  expert: number;
  noHintChallenge: number;
  dailyTotal: number;
  completed: Record<string, true>;
  daily: Record<string, DailyRecord>;
  bestStreak: number;
  /** Most recent solves, newest last (capped). */
  recent: SolveRecord[];
  awards: Record<string, string>;
  coats: { cat: string[]; dog: string[] };
  selected: { cat: string; dog: string };
}

const RECENT_CAP = 1000;

export function emptyRecords(): Records {
  return {
    v: 1,
    total: 0,
    firstTime: 0,
    zeroMistake: 0,
    perfect: 0,
    hints: 0,
    expert: 0,
    noHintChallenge: 0,
    dailyTotal: 0,
    completed: {},
    daily: {},
    bestStreak: 0,
    recent: [],
    awards: {},
    coats: { cat: ['ginger'], dog: ['cocoa'] },
    selected: { cat: 'ginger', dog: 'cocoa' },
  };
}

export function loadRecords(legacyDailyDone?: Record<string, boolean>): Records {
  const r = kv.get<Partial<Records> | null>(KEYS.records, null);
  if (r && r.v === 1) return { ...emptyRecords(), ...r, coats: { ...emptyRecords().coats, ...(r.coats ?? {}) }, selected: { ...emptyRecords().selected, ...(r.selected ?? {}) } };
  // First run of v2 records: carry over dailies solved before (assume they were solved on the day).
  const fresh = emptyRecords();
  for (const [date, done] of Object.entries(legacyDailyDone ?? {})) if (done) fresh.daily[date] = { solvedOn: date, seconds: 0 };
  fresh.dailyTotal = Object.keys(fresh.daily).length;
  return fresh;
}

export function saveRecords(r: Records): void {
  kv.set(KEYS.records, r);
}

export function solvedOnTheDay(r: Records): Set<string> {
  return new Set(Object.entries(r.daily).filter(([date, d]) => d.solvedOn === date).map(([date]) => date));
}

export function streakFor(r: Records, today: string) {
  return currentStreak(solvedOnTheDay(r), today);
}

// ---------------------------------------------------------------- awards

export interface Award {
  id: string;
  title: string;
  detail: string;
  earned(r: Records): boolean;
}

export const AWARDS: Award[] = [
  { id: 'first-solve', title: 'First steps', detail: 'Solve your first puzzle.', earned: (r) => r.total >= 1 },
  { id: 'solves-10', title: 'Getting the hang of it', detail: 'Solve 10 different puzzles.', earned: (r) => r.firstTime >= 10 },
  { id: 'solves-25', title: 'Pet whisperer', detail: 'Solve 25 different puzzles.', earned: (r) => r.firstTime >= 25 },
  { id: 'solves-100', title: 'Hundred households', detail: 'Solve 100 different puzzles.', earned: (r) => r.firstTime >= 100 },
  { id: 'daily-7', title: 'Seven dailies', detail: 'Complete 7 Daily Puzzles.', earned: (r) => r.dailyTotal >= 7 },
  { id: 'first-perfect', title: 'Clean sweep', detail: 'Solve a puzzle with no mistakes and no hints.', earned: (r) => r.perfect >= 1 },
  { id: 'first-expert', title: 'Expert mediator', detail: 'Solve an expert puzzle.', earned: (r) => r.expert >= 1 },
  { id: 'no-hint-challenge', title: 'No help needed', detail: 'Finish a Challenge-mode puzzle without hints.', earned: (r) => r.noHintChallenge >= 1 },
  { id: 'streak-7', title: 'A week of peace', detail: 'Reach a 7-day Daily streak.', earned: (r) => r.bestStreak >= 7 },
];

// ---------------------------------------------------------------- coats (recolors only: same art, same footprint)

export interface Coat {
  id: string;
  species: 'cat' | 'dog';
  name: string;
  unlock: string;
  unlocked(r: Records): boolean;
}

export const COATS: Coat[] = [
  { id: 'ginger', species: 'cat', name: 'Ginger', unlock: 'Starter', unlocked: () => true },
  { id: 'smoke', species: 'cat', name: 'Smoke', unlock: 'Solve 10 different puzzles', unlocked: (r) => r.firstTime >= 10 },
  { id: 'shadow', species: 'cat', name: 'Shadow', unlock: 'Solve 25 different puzzles', unlocked: (r) => r.firstTime >= 25 },
  { id: 'cream', species: 'cat', name: 'Cream', unlock: 'Earn “Clean sweep”', unlocked: (r) => !!r.awards['first-perfect'] },
  { id: 'snow', species: 'cat', name: 'Snow', unlock: 'Earn “Seven dailies”', unlocked: (r) => !!r.awards['daily-7'] },
  { id: 'cocoa', species: 'dog', name: 'Cocoa', unlock: 'Starter', unlocked: () => true },
  { id: 'golden', species: 'dog', name: 'Golden', unlock: 'Solve 5 different puzzles', unlocked: (r) => r.firstTime >= 5 },
  { id: 'slate', species: 'dog', name: 'Slate', unlock: 'Earn “Expert mediator”', unlocked: (r) => !!r.awards['first-expert'] },
  { id: 'biscuit', species: 'dog', name: 'Biscuit', unlock: 'Earn “No help needed”', unlocked: (r) => !!r.awards['no-hint-challenge'] },
  { id: 'rust', species: 'dog', name: 'Rust', unlock: 'Solve 50 different puzzles', unlocked: (r) => r.firstTime >= 50 },
];

// ---------------------------------------------------------------- recording a solve

export interface SolveOutcome {
  records: Records;
  firstTime: boolean;
  newAwards: Award[];
  newCoats: Coat[];
}

/** Adds one solve. Pure: returns new records plus what was newly earned. */
export function recordSolve(prev: Records, s: SolveRecord, dailyDate?: string): SolveOutcome {
  const r: Records = structuredCloneRecords(prev);
  const firstTime = !r.completed[s.id];
  r.total++;
  r.hints += s.hints;
  if (firstTime) {
    r.firstTime++;
    r.completed[s.id] = true;
  }
  if (s.mistakes === 0) r.zeroMistake++;
  if (s.mistakes === 0 && s.hints === 0) r.perfect++;
  if (s.difficulty === 'expert') r.expert++;
  if (s.mode === 'challenge' && s.hints === 0) r.noHintChallenge++;
  if (dailyDate && !r.daily[dailyDate]) {
    r.daily[dailyDate] = { solvedOn: s.on, seconds: s.seconds };
    r.dailyTotal++;
  }
  r.bestStreak = Math.max(r.bestStreak, bestStreak(solvedOnTheDay(r)));
  r.recent.push(s);
  if (r.recent.length > RECENT_CAP) r.recent.splice(0, r.recent.length - RECENT_CAP);

  const newAwards = AWARDS.filter((a) => !r.awards[a.id] && a.earned(r));
  for (const a of newAwards) r.awards[a.id] = s.on;
  const newCoats = COATS.filter((c) => !r.coats[c.species].includes(c.id) && c.unlocked(r));
  for (const c of newCoats) r.coats[c.species].push(c.id);
  return { records: r, firstTime, newAwards, newCoats };
}

function structuredCloneRecords(r: Records): Records {
  return JSON.parse(JSON.stringify(r)) as Records;
}

// ---------------------------------------------------------------- statistics

export interface SizeStat {
  size: number;
  solves: number;
  medianSeconds: number;
  averageSeconds: number;
  bestSeconds: number;
}

export function sizeStats(r: Records): SizeStat[] {
  const bySize = new Map<number, number[]>();
  for (const s of r.recent) bySize.set(s.size, [...(bySize.get(s.size) ?? []), s.seconds]);
  return [...bySize.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, xs]) => {
      const sorted = xs.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
      return { size, solves: xs.length, medianSeconds: median, averageSeconds: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), bestSeconds: sorted[0] };
    });
}

export function hintsPerSolve(r: Records): number {
  return r.total ? Math.round((r.hints / r.total) * 10) / 10 : 0;
}
