/**
 * AnimalFaceController — the only thing that changes animal expressions.
 *
 * It never moves, replaces or resizes a pet: it sets `data-face` on an existing pet <svg> and
 * later removes it. CSS (src/style/animal-faces.css) maps that state to face-part changes.
 *
 *  - Priority: won > lost > invalid > correct > hint > pet > idle. Higher interrupts lower.
 *  - At most 3 concurrent reactions while solving (idle blinks ≤ 2 of them).
 *  - Invalid reactions are debounced per cell.
 *  - Idle blinks are scheduled per animal at random 10–20 s (15–25 s on 9×9) — never in sync.
 *  - Win/lose sequences run in waves of ≤ 6 faces; a win finishes within 1.5 s.
 *  - Levels: on (everything), minimal (direct reactions only), off (static outcome faces only).
 *  - Reduced motion: no idle, no sequences; expressions swap without movement.
 *  - pause() / dispose() cancel everything and return faces to neutral.
 */
import { EVENT_PRIORITY, LIMITS, REACTIONS, STATIC_OUTCOME_FACE, wavePlan, type FaceEvent, type FaceState, type Species } from './faceExpressions';

export type ExpressionLevel = 'on' | 'minimal' | 'off';

export interface FaceHost {
  readonly size: number;
  petEl(r: number, c: number): SVGSVGElement | null;
  /** Cells that currently hold a pet, row-major. */
  occupied(): Array<{ r: number; c: number }>;
}

export interface FaceController {
  react(row: number, col: number, event: FaceEvent): void;
  reactAllOccupied(event: 'won' | 'lost', onDone?: () => void): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export interface FaceOptions {
  level: ExpressionLevel;
  reducedMotion: boolean;
  now?: () => number;
  random?: () => number;
}

interface Active {
  el: SVGSVGElement;
  priority: number;
  event: FaceEvent;
  timer: number;
}

const key = (r: number, c: number) => `${r},${c}`;

export class AnimalFaceController implements FaceController {
  private active = new Map<string, Active>();
  private lastInvalid = new Map<string, number>();
  private nextBlink = new Map<string, number>();
  private idleTimer: number | null = null;
  private seqTimers: number[] = [];
  private seqDone: (() => void) | null = null;
  private sequence: 'won' | 'lost' | null = null;
  private staticOutcome: 'won' | 'lost' | null = null;
  private paused = false;
  private disposed = false;
  private level: ExpressionLevel;
  private reducedMotion: boolean;
  private now: () => number;
  private random: () => number;

  constructor(
    private host: FaceHost,
    opts: FaceOptions,
  ) {
    this.level = opts.level;
    this.reducedMotion = opts.reducedMotion;
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.scheduleIdle();
  }

  /** True when faces should not move at all (Off or reduced motion). */
  get still(): boolean {
    return this.level === 'off' || this.reducedMotion;
  }

  get activeCount(): number {
    return this.active.size;
  }

  get inSequence(): boolean {
    return this.sequence !== null;
  }

  configure(level: ExpressionLevel, reducedMotion: boolean): void {
    this.level = level;
    this.reducedMotion = reducedMotion;
    this.cancelAll();
    this.scheduleIdle();
  }

  // ------------------------------------------------------------ reactions

  react(r: number, c: number, event: FaceEvent): boolean {
    if (this.disposed || this.paused) return false;
    if (this.level === 'off') return false;
    // Idle blinks only at full level without reduced motion; petting is skipped at minimal.
    if (event === 'idle' && (this.level !== 'on' || this.reducedMotion)) return false;
    if (event === 'pet' && this.level === 'minimal') return false;
    if (event === 'won' || event === 'lost') return false; // whole-board events go through reactAllOccupied
    if (this.sequence || this.staticOutcome) return false;
    const el = this.host.petEl(r, c);
    if (!el) return false; // empty and ✕ cells never get faces
    const k = key(r, c);
    const prio = EVENT_PRIORITY[event];

    if (event === 'invalid_adjacent' || event === 'invalid_other') {
      const last = this.lastInvalid.get(k);
      if (last !== undefined && this.now() - last < LIMITS.invalidDebounceMs) return false;
      this.lastInvalid.set(k, this.now());
    }

    const existing = this.active.get(k);
    if (existing) {
      if (existing.priority > prio) return false;
      this.end(k);
    } else {
      const cap = event === 'idle' ? Math.min(LIMITS.maxIdleActive, LIMITS.maxActive) : LIMITS.maxActive;
      const pool = event === 'idle' ? [...this.active.entries()].filter(([, a]) => a.event === 'idle') : [...this.active.entries()];
      if (event === 'idle' && this.active.size >= LIMITS.maxActive) return false;
      if (pool.length >= cap) {
        const [lowKey, low] = pool.reduce((m, x) => (x[1].priority < m[1].priority ? x : m));
        if (low.priority >= prio) return false;
        this.end(lowKey);
      }
    }

    const reaction = REACTIONS[speciesOf(el)][event];
    this.apply(el, reaction.state);
    const timer = window.setTimeout(() => this.end(k), reaction.ms);
    this.active.set(k, { el, priority: prio, event, timer });
    return true;
  }

  /** Win/lose for every pet on the board. Calls onDone when the sequence is over (immediately when still). */
  reactAllOccupied(event: 'won' | 'lost', onDone?: () => void): number {
    this.cancelAll();
    this.clearIdle();
    if (this.disposed) {
      onDone?.();
      return 0;
    }
    const cells = this.host.occupied();
    if (this.still) {
      // Static, state-appropriate faces: no timers, no movement.
      this.staticOutcome = event;
      const state = STATIC_OUTCOME_FACE[event];
      for (const p of cells) {
        const el = this.host.petEl(p.r, p.c);
        if (el) this.apply(el, state);
      }
      onDone?.();
      return 0;
    }
    if (this.paused || cells.length === 0) {
      onDone?.();
      return 0;
    }
    this.sequence = event;
    this.seqDone = onDone ?? null;
    const plan = wavePlan(cells.length, event);
    cells.forEach((p, i) => {
      const wave = Math.floor(i / LIMITS.waveSize);
      const inWave = i % LIMITS.waveSize;
      const start = wave * plan.waveMs + inWave * LIMITS.waveStaggerMs;
      const end = (wave + 1) * plan.waveMs - 20;
      this.seqTimers.push(
        window.setTimeout(() => {
          const el = this.host.petEl(p.r, p.c);
          if (el) this.apply(el, REACTIONS[speciesOf(el)][event].state);
        }, start),
      );
      this.seqTimers.push(
        window.setTimeout(() => {
          const el = this.host.petEl(p.r, p.c);
          if (el) this.reset(el);
        }, end),
      );
    });
    this.seqTimers.push(window.setTimeout(() => this.finishSequence(), plan.totalMs));
    return plan.totalMs;
  }

  /** Back to normal after a revive or restart. */
  clearOutcome(): void {
    this.staticOutcome = null;
    for (const p of this.host.occupied()) {
      const el = this.host.petEl(p.r, p.c);
      if (el) this.reset(el);
    }
    this.scheduleIdle();
  }

  /** A cell's occupant changed (placed, removed, undone): drop any reaction tied to it. */
  cellChanged(r: number, c: number): void {
    const k = key(r, c);
    if (this.active.has(k)) this.end(k);
    this.nextBlink.delete(k);
    this.scheduleIdle();
  }

  // ------------------------------------------------------------ lifecycle

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.cancelAll();
    this.clearIdle();
  }

  resume(): void {
    if (!this.paused || this.disposed) return;
    this.paused = false;
    this.scheduleIdle();
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
    this.nextBlink.clear();
    this.lastInvalid.clear();
  }

  // ------------------------------------------------------------ internals

  private apply(el: SVGSVGElement, state: FaceState): void {
    el.setAttribute('data-face', state);
  }

  private reset(el: SVGSVGElement): void {
    el.removeAttribute('data-face');
  }

  private end(k: string): void {
    const a = this.active.get(k);
    if (!a) return;
    clearTimeout(a.timer);
    this.reset(a.el);
    this.active.delete(k);
  }

  private finishSequence(): void {
    for (const t of this.seqTimers) clearTimeout(t);
    this.seqTimers = [];
    this.sequence = null;
    for (const p of this.host.occupied()) {
      const el = this.host.petEl(p.r, p.c);
      if (el) this.reset(el);
    }
    const done = this.seqDone;
    this.seqDone = null;
    done?.();
  }

  private cancelAll(): void {
    for (const k of [...this.active.keys()]) this.end(k);
    if (this.sequence) this.finishSequence();
  }

  private clearIdle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private idleRange(): [number, number] {
    return this.host.size >= 9 ? [LIMITS.idleMinMsLarge, LIMITS.idleMaxMsLarge] : [LIMITS.idleMinMs, LIMITS.idleMaxMs];
  }

  private scheduleIdle(): void {
    this.clearIdle();
    if (this.disposed || this.paused || this.level !== 'on' || this.reducedMotion || this.sequence || this.staticOutcome) return;
    const occupied = this.host.occupied();
    if (!occupied.length) return;
    const now = this.now();
    const [lo, hi] = this.idleRange();
    const live = new Set<string>();
    for (const p of occupied) {
      const k = key(p.r, p.c);
      live.add(k);
      if (!this.nextBlink.has(k)) this.nextBlink.set(k, now + lo + this.random() * (hi - lo));
    }
    for (const k of [...this.nextBlink.keys()]) if (!live.has(k)) this.nextBlink.delete(k);
    const earliest = Math.min(...this.nextBlink.values());
    this.idleTimer = window.setTimeout(() => this.idleTick(), Math.max(50, earliest - now));
  }

  private idleTick(): void {
    this.idleTimer = null;
    const now = this.now();
    const [lo, hi] = this.idleRange();
    for (const [k, t] of this.nextBlink) {
      if (t > now) continue;
      const [r, c] = k.split(',').map(Number);
      const ok = this.react(r, c, 'idle');
      // If the slot was busy, try again shortly; otherwise wait a fresh random interval.
      this.nextBlink.set(k, ok ? now + lo + this.random() * (hi - lo) : now + 1000 + this.random() * 1500);
    }
    this.scheduleIdle();
  }
}

function speciesOf(el: SVGSVGElement): Species {
  return el.classList.contains('pet--dog') ? 'dog' : 'cat';
}
