/**
 * Play modes and how each one identifies its puzzle. A ModeRef is all we need to rebuild the exact
 * same board later (resume after the app was closed, share, verify), because the generator is
 * deterministic for (size, seed).
 */

export type ModeRef =
  | { kind: 'level'; level: number }
  | { kind: 'daily'; dateKey: string }
  | { kind: 'zen'; size: number; seed: number }
  | { kind: 'cup'; weekKey: string; index: number };

export type ModeKind = ModeRef['kind'];

export interface ModeRules {
  /** Hearts and the three-mistake loss. Off in Zen. */
  hearts: boolean;
  /** Show the running clock. */
  timer: boolean;
  /** Hints available. Never in Paw Cup (competitive rules). */
  hints: boolean;
  /** Revive after losing. Never in Paw Cup. */
  revive: boolean;
  /** Earns Paw Coins on first clear. */
  rewards: boolean;
}

export function rulesFor(mode: ModeRef): ModeRules {
  switch (mode.kind) {
    case 'level':
      return { hearts: true, timer: true, hints: true, revive: true, rewards: true };
    case 'daily':
      return { hearts: true, timer: true, hints: true, revive: true, rewards: true };
    case 'zen':
      return { hearts: false, timer: false, hints: true, revive: false, rewards: false };
    case 'cup':
      return { hearts: true, timer: true, hints: false, revive: false, rewards: false };
  }
}

/** Stable string id for a mode's board, e.g. `L12`, `D2026-10-25`, `Z7-123`, `C2026-W43-2`. */
export function modeKey(mode: ModeRef): string {
  switch (mode.kind) {
    case 'level':
      return `L${mode.level}`;
    case 'daily':
      return `D${mode.dateKey}`;
    case 'zen':
      return `Z${mode.size}-${mode.seed}`;
    case 'cup':
      return `C${mode.weekKey}-${mode.index}`;
  }
}

/**
 * What the win sheet's primary button should open. Journey advances to the level after the one
 * just solved (the v1 bug replayed the same level); other modes go back to where they came from.
 */
export function nextAfterWin(mode: ModeRef): ModeRef | 'home' | 'cup' {
  if (mode.kind === 'level') return { kind: 'level', level: mode.level + 1 };
  if (mode.kind === 'cup') return 'cup';
  return 'home';
}

export function isValidModeRef(x: unknown): x is ModeRef {
  if (!x || typeof x !== 'object') return false;
  const m = x as Record<string, unknown>;
  switch (m.kind) {
    case 'level':
      return Number.isInteger(m.level) && (m.level as number) >= 1;
    case 'daily':
      return typeof m.dateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.dateKey);
    case 'zen':
      return Number.isInteger(m.size) && (m.size as number) >= 5 && (m.size as number) <= 9 && Number.isInteger(m.seed);
    case 'cup':
      return typeof m.weekKey === 'string' && Number.isInteger(m.index);
    default:
      return false;
  }
}
