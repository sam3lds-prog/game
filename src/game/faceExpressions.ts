/**
 * Typed facial states and the event → expression tables for each species.
 * Durations follow the spec's ranges (section 5.2); tests assert them.
 */

export type FaceState =
  | 'neutral'
  | 'blink'
  | 'happy'
  | 'annoyed'
  | 'surprised'
  | 'puzzled'
  | 'thinking'
  | 'worried'
  | 'celebrate'
  | 'content';

export type FaceEvent = 'placed_correct' | 'invalid_adjacent' | 'invalid_other' | 'hint' | 'lost' | 'won' | 'pet' | 'idle';

export type Species = 'cat' | 'dog';

/** won > lost > invalid > correct > hint > pet (interact) > idle */
export const EVENT_PRIORITY: Record<FaceEvent, number> = {
  won: 7,
  lost: 6,
  invalid_adjacent: 5,
  invalid_other: 5,
  placed_correct: 4,
  hint: 3,
  pet: 2,
  idle: 1,
};

export interface Reaction {
  state: FaceState;
  ms: number;
}

export const REACTIONS: Record<Species, Record<FaceEvent, Reaction>> = {
  cat: {
    idle: { state: 'blink', ms: 160 },
    placed_correct: { state: 'happy', ms: 550 }, // small smile, bright eyes
    invalid_adjacent: { state: 'annoyed', ms: 500 }, // narrowed eyes, frown
    invalid_other: { state: 'puzzled', ms: 500 },
    hint: { state: 'thinking', ms: 500 },
    lost: { state: 'worried', ms: 750 },
    won: { state: 'celebrate', ms: 500 }, // per wave; see victoryPlan
    pet: { state: 'content', ms: 600 }, // contented eyes and smile
  },
  dog: {
    idle: { state: 'blink', ms: 160 },
    placed_correct: { state: 'happy', ms: 550 }, // wider smile, bright eyes
    invalid_adjacent: { state: 'surprised', ms: 500 }, // surprised eyes, concerned mouth
    invalid_other: { state: 'puzzled', ms: 500 },
    hint: { state: 'thinking', ms: 500 },
    lost: { state: 'worried', ms: 750 },
    won: { state: 'celebrate', ms: 500 },
    pet: { state: 'content', ms: 600 }, // affectionate eyes and smile
  },
};

/** Spec ranges in ms, used by tests. */
export const SPEC_RANGES: Record<FaceEvent, [number, number]> = {
  idle: [120, 200],
  placed_correct: [450, 650],
  invalid_adjacent: [350, 600],
  invalid_other: [350, 600],
  hint: [400, 600],
  lost: [600, 900],
  won: [450, 650],
  pet: [450, 700],
};

export const LIMITS = {
  /** Concurrent reactions during ordinary solving. */
  maxActive: 3,
  /** Idle blinks never take more than this many of the active slots. */
  maxIdleActive: 2,
  /** Concurrent faces during a win/lose sequence. */
  waveSize: 6,
  /** Whole victory sequence must fit in 0.8–1.5 s. */
  victoryMinMs: 800,
  victoryMaxMs: 1500,
  /** Idle blink spacing per animal. */
  idleMinMs: 10_000,
  idleMaxMs: 20_000,
  /** Slower idle on the busiest boards. */
  idleMinMsLarge: 15_000,
  idleMaxMsLarge: 25_000,
  invalidDebounceMs: 400,
  /** Stagger between faces starting inside one wave. */
  waveStaggerMs: 30,
};

export interface WavePlan {
  waves: number;
  waveMs: number;
  totalMs: number;
}

/**
 * Splits N animals into waves of ≤ waveSize. Win: the whole sequence lasts 0.8–1.5 s.
 * Lose: each wave lasts 600–900 ms.
 */
export function wavePlan(count: number, event: 'won' | 'lost'): WavePlan {
  if (count <= 0) return { waves: 0, waveMs: 0, totalMs: 0 };
  const waves = Math.ceil(count / LIMITS.waveSize);
  let waveMs: number;
  if (event === 'won') {
    waveMs = Math.floor(LIMITS.victoryMaxMs / waves);
    waveMs = Math.min(waveMs, 800);
    waveMs = Math.max(waveMs, Math.ceil(LIMITS.victoryMinMs / waves));
    waveMs = Math.min(waveMs, Math.floor(LIMITS.victoryMaxMs / waves));
  } else {
    waveMs = Math.max(600, Math.min(900, Math.floor(1800 / waves)));
  }
  return { waves, waveMs, totalMs: waves * waveMs };
}

/** What a face rests on when expressions are Off (no motion, state-appropriate). */
export const STATIC_OUTCOME_FACE: Record<'won' | 'lost', FaceState> = { won: 'happy', lost: 'worried' };
