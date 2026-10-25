/**
 * The game screen. Owns one Session, one BoardView, one face controller and one ActiveTimer.
 * Everything it starts (timers, listeners, sheets, pending ad callbacks) is tied to its Scope,
 * so leaving the screen cancels all of it.
 *
 * Modes: Zen (no hearts, no clock shown, only visible rule breaks are blocked) and Challenge
 * (3 hearts, clock, every pet checked against the answer immediately — disclosed on Home).
 */
import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, fmtTime, h } from '../app/dom';
import { prefersReducedMotion } from '../app/theme';
import { CAT, DOG, EMPTY, type Species } from '../engine/types';
import { MARK, Session, toolSpecies, type CellValue, type MoveResult, type Tool, type Violation } from '../game/session';
import { ActiveTimer } from '../game/timer';
import { loadPuzzle, puzzleKey, refTitle, type PuzzleRef } from '../game/puzzles';
import { recordDailyWin, recordLevelWin } from '../game/progression';
import { planHint, revealHint, type HintPlan } from '../game/hints';
import { clearSession, loadSession, saveSession } from '../services/sessions';
import { BoardView, REGION_NAMES } from '../ui/board';
import { openSheet, type SheetHandle } from '../ui/sheet';
import { CAT_SVG, DOG_SVG, HEART_SVG, MARK_SVG } from '../game/icons';
import { showRules, showSettings } from './sheets';
import { AnimalFaceController } from '../game/animalFaces';
import { faceCuesFor, type GameEvent } from '../game/events';
import type { SoundKind } from '../services/sound';

const SPECIES_NAME: Record<Species, string> = { [CAT]: 'cat', [DOG]: 'dog' };

export function violationText(v: Violation, species: Species, r: number, c: number, regionName: string): string {
  const s = SPECIES_NAME[species];
  switch (v) {
    case 'duplicate_species_in_row':
      return `Row ${r + 1} already has a ${s}.`;
    case 'duplicate_species_in_column':
      return `Column ${c + 1} already has a ${s}.`;
    case 'duplicate_species_in_region':
      return `The ${regionName} region already has a ${s}.`;
    case 'adjacent_conflict':
      return 'Cats and dogs can’t sit side by side. Corners are fine.';
    case 'solution_mismatch':
      return `That’s not where this ${s} goes.`;
    case 'given_cell':
      return 'That pet is fixed.';
  }
}

/** The new value for a tap, given the current value, tool and input mode. */
export function tapTarget(cur: CellValue, tool: Tool, mode: 'cycle' | 'direct'): CellValue {
  const species = toolSpecies(tool);
  if (mode === 'direct') {
    const want: CellValue = species ?? MARK;
    return cur === want ? EMPTY : want;
  }
  if (!species) return cur === EMPTY ? MARK : EMPTY;
  if (cur === EMPTY) return MARK;
  if (cur === MARK) return species;
  return EMPTY;
}

export class GameScreen implements Screen {
  private scope = new Scope();
  private session!: Session;
  private timer!: ActiveTimer;
  private board!: BoardView;
  private faces!: AnimalFaceController;
  private el!: HTMLElement;
  private readonly key: string;
  private pausingSheets = 0;
  private outcomeHandled: 'won' | 'lost' | null = null;
  private finished = false;
  private hintPanel: HTMLElement | null = null;
  private hintPlan: HintPlan | null = null;

  constructor(
    private ctx: AppContext,
    private ref: PuzzleRef,
  ) {
    this.key = puzzleKey(ref);
  }

  // ------------------------------------------------------------ lifecycle

  mount(root: HTMLElement): void {
    const saved = loadSession(this.key);
    const resumable = saved && saved.outcome !== 'won' ? saved : null;
    const fresh = resumable ? null : loadPuzzle(this.ref);
    if (!resumable && !fresh) return this.mountMissing(root);
    this.session = resumable ? Session.fromSnapshot(resumable) : new Session(fresh!, this.ctx.settings.defaultMode);
    this.timer = new ActiveTimer(this.session.restoredActiveMs, this.ctx.now);
    const s = this.session;
    const n = s.size;
    const zen = s.mode === 'zen';

    this.el = h(`
      <main class="game">
        <div class="topbar">
          <button class="icon-btn" data-act="home" aria-label="Home">‹</button>
          <div class="topbar__center">
            <h1 class="title">${esc(refTitle(this.ref))}</h1>
            <div class="meta">${zen ? '' : '<span data-timer>0:00</span> · '}${n}×${n} · ${esc(s.puzzle.difficulty)}</div>
          </div>
          ${zen ? '<span class="chip" data-mode>Zen</span>' : '<div class="hearts" data-hearts role="img"></div>'}
        </div>
        <div class="board-wrap" data-board-wrap></div>
        <p class="status" data-status></p>
        <p class="visually-hidden" data-live aria-live="polite"></p>
        <div class="tools" role="toolbar" aria-label="Choose what to place">
          <button class="tool" data-tool="cat" aria-pressed="false" aria-keyshortcuts="C">${CAT_SVG}<span>Cat</span></button>
          <button class="tool" data-tool="dog" aria-pressed="false" aria-keyshortcuts="D">${DOG_SVG}<span>Dog</span></button>
          <button class="tool tool--mark" data-tool="mark" aria-pressed="false" aria-keyshortcuts="X">${MARK_SVG}<span>Empty</span></button>
        </div>
        <div class="actions">
          <button class="action" data-act="undo" aria-keyshortcuts="U">Undo</button>
          <button class="action" data-act="hint" aria-keyshortcuts="H">Hint</button>
          <button class="action" data-act="pause">Pause</button>
        </div>
      </main>`);
    this.board = new BoardView(
      s.puzzle,
      this.scope,
      {
        tap: (r, c) => this.onTap(r, c),
        longPress: (r, c) => this.onLongPress(r, c),
        cellChanged: (r, c) => this.faces?.cellChanged(r, c),
      },
      { counters: this.ctx.settings.counters, patterns: this.ctx.settings.patterns },
    );
    const wrap = this.el.querySelector('[data-board-wrap]') as HTMLElement;
    wrap.appendChild(this.board.el);
    root.appendChild(this.el);
    this.board.fitTo(wrap);

    const reduced = prefersReducedMotion();
    this.board.setFacesStill(reduced || this.ctx.settings.faces === 'off');
    this.faces = new AnimalFaceController(this.board, { level: this.ctx.settings.faces, reducedMotion: reduced, now: this.ctx.now });
    this.scope.add(() => this.faces.dispose());

    this.scope.listen(this.el, 'click', (e) => {
      const tool = (e.target as HTMLElement).closest?.('[data-tool]') as HTMLElement | null;
      if (tool) return this.selectTool(tool.dataset.tool as Tool);
      const a = actionOf(e);
      if (a) this.onAction(a.act);
    });
    this.scope.listen(document, 'keydown', (e) => this.onKey(e));
    this.scope.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.persist();
      this.syncTimer();
    });
    this.scope.interval(() => this.paintTimer(), 500);

    this.status(this.ctx.settings.inputMode === 'direct' ? 'Pick Cat, Dog or Empty (✕), then tap a cell.' : 'Tap a cell to mark ✕, tap again to place the selected pet.');
    this.render();

    if (s.outcome === 'lost') {
      this.outcomeHandled = 'lost';
      this.showLose();
    }
    this.syncTimer();
  }

  /** No puzzle for this level/date in the catalog. */
  private mountMissing(root: HTMLElement): void {
    this.finished = true;
    const el = h(`
      <main class="game">
        <div class="topbar"><button class="icon-btn" data-act="home" aria-label="Home">‹</button><h1 class="title">${esc(refTitle(this.ref))}</h1><span></span></div>
        <p class="status">${this.ref.kind === 'daily' ? 'This day’s puzzle isn’t in this version of the app. New dailies arrive with app updates.' : 'You’ve reached the end of the campaign.'}</p>
        <button class="btn btn--primary" data-act="home"><span>Back home</span></button>
      </main>`);
    this.scope.listen(el, 'click', (e) => {
      if (actionOf(e)?.act === 'home') this.ctx.nav.home();
    });
    root.appendChild(el);
  }

  unmount(): void {
    this.timer?.stop();
    this.scope.dispose();
  }

  persist(): void {
    if (this.finished || !this.session || !this.timer) return;
    saveSession(this.key, this.session.toSnapshot(this.timer.elapsedMs()));
  }

  // ------------------------------------------------------------ timer & faces

  private syncTimer(): void {
    const visible = this.scope.alive && !document.hidden && this.pausingSheets === 0;
    const run = visible && this.session.outcome === 'playing';
    if (run) this.timer.start();
    else this.timer.stop();
    if (this.faces && !this.faces.inSequence) {
      if (visible) this.faces.resume();
      else this.faces.pause();
    }
    this.paintTimer();
  }

  private paintTimer(): void {
    const t = this.el?.querySelector('[data-timer]');
    if (t) t.textContent = fmtTime(this.timer.elapsedMs() / 1000);
  }

  private pausing(sheet: SheetHandle): SheetHandle {
    this.pausingSheets++;
    this.syncTimer();
    return sheet;
  }

  private sheetClosed(): void {
    this.pausingSheets = Math.max(0, this.pausingSheets - 1);
    this.syncTimer();
  }

  // ------------------------------------------------------------ input

  private selectTool(t: Tool): void {
    this.session.tool = t;
    this.renderTools();
    this.persist();
  }

  private onKey(e: KeyboardEvent): void {
    if (this.pausingSheets > 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'c') this.selectTool('cat');
    else if (k === 'd') this.selectTool('dog');
    else if (k === 'x') this.selectTool('mark');
    else if (k === 'u') this.onAction('undo');
    else if (k === 'h') this.onAction('hint');
    else return;
    e.preventDefault();
  }

  private onTap(r: number, c: number): void {
    const s = this.session;
    if (s.outcome !== 'playing' || this.pausingSheets > 0) return;
    this.closeHint();
    const target = tapTarget(s.cells[r][c], s.tool, this.ctx.settings.inputMode);
    const res = s.setCell(r, c, target);
    this.handleResult(res, r, c, target);
  }

  private handleResult(res: MoveResult, r: number, c: number, target: CellValue): void {
    let event: GameEvent | null = null;
    if (res.accepted) {
      if (target === CAT || target === DOG) {
        this.haptic('light');
        this.sound('place');
        event = { type: 'placed', r, c, species: target };
        this.announce(`${SPECIES_NAME[target]} placed, row ${r + 1}, column ${c + 1}.`);
      } else if (target === MARK) {
        this.sound('mark');
      }
    } else if (res.violation) {
      event = { type: 'rejected', r, c, violation: res.violation, conflicts: res.conflicts };
      const species = (target === CAT || target === DOG ? target : CAT) as Species;
      const region = REGION_NAMES[this.session.puzzle.regions[r][c] % 10];
      let msg = violationText(res.violation, species, r, c, region);
      if (res.heartLost && this.session.hearts > 0) msg += ` ${this.session.hearts} ${this.session.hearts === 1 ? 'heart' : 'hearts'} left.`;
      this.status(msg);
      this.announce(msg);
      if (res.violation !== 'given_cell') {
        this.board.flash([{ r, c }], 'is-error');
        if (res.conflicts.length) this.board.flash(res.conflicts, 'is-conflict');
        this.haptic('error');
        this.sound('error');
      }
    }
    this.render();
    if (event && res.outcome === 'playing') this.cue(event);
    this.persist();
    this.checkOutcome();
  }

  private cue(event: GameEvent): void {
    for (const f of faceCuesFor(event)) this.faces.react(f.r, f.c, f.event);
  }

  private onLongPress(r: number, c: number): void {
    const v = this.session.cells[r][c];
    if ((v !== CAT && v !== DOG) || this.pausingSheets > 0) return;
    this.cue({ type: 'pet', r, c });
  }

  private onAction(act: string): void {
    const s = this.session;
    if (act === 'home') return this.ctx.nav.home();
    if (this.pausingSheets > 0) return;
    if (act === 'undo') {
      this.closeHint();
      if (s.undo()) {
        this.render();
        this.persist();
      }
      return;
    }
    if (act === 'hint') return this.explainHint();
    if (act === 'pause') return this.showPause();
    if (act === 'hint-reveal') return void this.revealHint();
    if (act === 'hint-close') return this.closeHint();
  }

  // ------------------------------------------------------------ hints (explain → reveal)

  private explainHint(): void {
    const s = this.session;
    if (s.outcome !== 'playing') return;
    this.closeHint();
    const plan = planHint(s);
    if (plan.kind === 'none') return this.status(plan.lines[0]);
    this.hintPlan = plan;
    s.hintsExplained++;
    this.sound('hint');
    this.board.tintUnits(plan.units, 'in-hint-unit');
    if (plan.focus.length) this.board.flash(plan.focus, 'is-hint', 0);
    // Thinking faces on up to two pets inside the units being discussed.
    const inUnits = (p: { r: number; c: number }) => plan.units.some((u) => (u.kind === 'row' ? u.index === p.r : u.kind === 'col' ? u.index === p.c : s.puzzle.regions[p.r][p.c] === u.index));
    this.cue({ type: 'hint', focus: this.board.occupied().filter(inUnits) });
    const panel = h(`
      <section class="hint-panel" aria-label="Hint">
        ${plan.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        <div class="row">
          <button class="btn" data-act="hint-close"><span>Got it</span></button>
          <button class="btn btn--primary" data-act="hint-reveal"><span>${plan.kind === 'wrong-pet' ? 'Show and remove it' : 'Reveal'}</span></button>
        </div>
      </section>`);
    this.el.querySelector('.tools')!.before(panel);
    this.el.classList.add('has-hint');
    this.hintPanel = panel;
    this.announce(plan.lines.join(' '));
    this.persist();
  }

  private async revealHint(): Promise<void> {
    const s = this.session;
    const plan = this.hintPlan;
    if (!plan || s.outcome !== 'playing') return;
    const cell = revealHint(s, plan);
    this.closeHint();
    if (!cell) return;
    this.board.flash([cell], 'is-hint', 1600);
    this.status(plan.kind === 'wrong-pet' ? 'That pet didn’t belong there, so it’s been taken back.' : 'Placed. Keep going!');
    this.render();
    this.persist();
    this.checkOutcome();
  }

  private closeHint(): void {
    if (!this.hintPanel) return;
    this.hintPanel.remove();
    this.el.classList.remove('has-hint');
    this.hintPanel = null;
    this.hintPlan = null;
    this.board.clear('in-hint-unit');
    this.board.clear('is-hint');
  }

  // ------------------------------------------------------------ feedback

  private haptic(kind: 'light' | 'error' | 'success'): void {
    if (this.ctx.settings.haptics) this.ctx.haptics.play(kind);
  }

  private sound(kind: SoundKind): void {
    if (this.ctx.settings.sound) this.ctx.sound.play(kind);
  }

  private status(msg: string): void {
    const el = this.el.querySelector('[data-status]');
    if (el) el.textContent = msg;
  }

  private announce(msg: string): void {
    const el = this.el.querySelector('[data-live]');
    if (el) el.textContent = msg;
  }

  // ------------------------------------------------------------ rendering

  private render(): void {
    const s = this.session;
    this.board.update({ cells: s.cells, givenMask: s.givenMask, dead: this.ctx.settings.autoMark ? s.deadCells() : null });
    this.renderTools();
    const hearts = this.el.querySelector('[data-hearts]') as HTMLElement | null;
    if (hearts) {
      hearts.innerHTML = Array.from({ length: s.maxHearts }, (_, i) => HEART_SVG.replace('<svg', `<svg class="${i < s.hearts ? 'on' : 'off'}"`)).join('');
      hearts.setAttribute('aria-label', `${s.hearts} of ${s.maxHearts} hearts left`);
    }
    (this.el.querySelector('[data-act="undo"]') as HTMLButtonElement).disabled = !s.canUndo();
  }

  private renderTools(): void {
    this.el.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => {
      const on = b.dataset.tool === this.session.tool;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // ------------------------------------------------------------ outcomes

  private checkOutcome(): void {
    const s = this.session;
    if (s.outcome === 'playing' || s.outcome === this.outcomeHandled) return;
    this.outcomeHandled = s.outcome;
    this.closeHint();
    this.syncTimer();
    if (s.outcome === 'won') void this.onWin();
    else this.onLose();
  }

  private onLose(): void {
    this.haptic('error');
    this.persist();
    this.faces.reactAllOccupied('lost', () => {
      if (this.scope.alive && this.session.outcome === 'lost') this.showLose();
    });
  }

  private showLose(): void {
    this.pausing(
      openSheet(
        this.scope,
        `
        <h2>Out of hearts</h2>
        <p>Three wrong placements. Refill your hearts to keep this board, or start it again.</p>
        <button class="btn btn--primary" data-act="revive"><span>Refill hearts</span></button>
        <button class="btn" data-act="restart"><span>Restart board</span></button>
        <button class="btn btn--ghost" data-act="home">Home</button>`,
        (act, _el, sheet) => {
          if (act === 'revive') void this.revive(sheet);
          else if (act === 'restart') this.restart();
          else if (act === 'home') this.ctx.nav.home();
        },
        { label: 'Out of hearts', onClose: () => this.sheetClosed() },
      ),
    );
  }

  private async revive(sheet: SheetHandle): Promise<void> {
    const ok = await this.scope.guard(this.ctx.ads.showRewarded('revive', this.ctx.progress));
    if (!ok || !this.scope.alive) return;
    this.session.revive();
    this.outcomeHandled = null;
    this.faces.clearOutcome();
    sheet.close();
    this.render();
    this.persist();
    this.syncTimer();
  }

  private restart(): void {
    clearSession(this.key);
    this.finished = true;
    this.ctx.nav.play(this.ref);
  }

  private async onWin(): Promise<void> {
    const s = this.session;
    this.haptic('success');
    this.sound('win');
    const secs = Math.floor(this.timer.elapsedMs() / 1000);
    this.finished = true;
    clearSession(this.key);
    let isBest = false;
    let nextLevel = 0;
    if (this.ref.kind === 'level') {
      const res = recordLevelWin(this.ctx.progress, this.ref.level, secs);
      this.ctx.progress = res.progress;
      isBest = res.isBest;
      nextLevel = res.nextLevel;
    } else {
      const res = recordDailyWin(this.ctx.progress, this.ref.dateKey, secs, new Date(this.ctx.now()));
      this.ctx.progress = res.progress;
      isBest = res.isBest;
    }
    this.ctx.saveProgress();
    this.status('Solved!');
    this.announce('Puzzle solved.');

    // One facial celebration inside the occupied tiles, then the static result.
    await this.scope.guard(new Promise<void>((resolve) => this.faces.reactAllOccupied('won', resolve)));
    if (!this.scope.alive) return;
    await this.scope.guard(this.ctx.ads.maybeShowInterstitial(this.ctx.progress));
    if (!this.scope.alive) return;

    const ref = this.ref;
    const hints = s.hintsRevealed + s.hintsExplained;
    this.pausing(
      openSheet(
        this.scope,
        `
        <h2>Solved!</h2>
        <div class="stats">
          <div><div class="v">${fmtTime(secs)}</div><div class="k">time${isBest ? ' · best' : ''}</div></div>
          <div><div class="v">${s.mistakes}</div><div class="k">mistakes</div></div>
          <div><div class="v">${hints}</div><div class="k">hints</div></div>
        </div>
        ${ref.kind === 'daily' ? `<p class="center">Streak: <b>${this.ctx.progress.streak}</b></p>` : ''}
        <button class="btn btn--primary" data-act="next"><span>${ref.kind === 'level' ? `Level ${nextLevel}` : 'Back home'}</span><span class="pill" aria-hidden="true">›</span></button>
        ${ref.kind === 'level' ? '<button class="btn" data-act="replay"><span>Replay level</span></button>' : ''}
        <button class="btn" data-act="share"><span>Share result</span></button>
        <button class="btn btn--ghost" data-act="home">Home</button>`,
        (act) => {
          if (act === 'next') {
            if (ref.kind === 'level') this.ctx.nav.play({ kind: 'level', level: nextLevel });
            else this.ctx.nav.home();
          } else if (act === 'replay') this.ctx.nav.play(ref);
          else if (act === 'share') void this.share(secs);
          else if (act === 'home') this.ctx.nav.home();
        },
        { label: 'Puzzle solved', onClose: () => this.sheetClosed() },
      ),
    );
  }

  private async share(secs: number): Promise<void> {
    const s = this.session;
    const what = this.ref.kind === 'daily' ? `Daily ${this.ref.dateKey}` : `Level ${this.ref.level}`;
    const text = `Cats & Dogs — ${what} · ${s.size}×${s.size} ${s.puzzle.difficulty} · ${fmtTime(secs)} · ${s.mistakes} mistakes · ${s.hintsRevealed + s.hintsExplained} hints`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      if (this.scope.alive) this.status('Result copied.');
    } catch {
      /* cancelled or unavailable */
    }
  }

  private showPause(): void {
    this.closeHint();
    this.pausing(
      openSheet(
        this.scope,
        `
        <h2>Paused</h2>
        <button class="btn btn--primary" data-act="resume"><span>Resume</span></button>
        <button class="btn" data-act="rules"><span>Rules</span></button>
        <button class="btn" data-act="settings"><span>Settings</span></button>
        <button class="btn" data-act="restart"><span>Restart board</span></button>
        <button class="btn btn--ghost" data-act="home">Home</button>`,
        (act, _el, sheet) => {
          if (act === 'resume') sheet.close();
          else if (act === 'rules') {
            sheet.close();
            this.pausing(showRules(this.scope, this.ctx, () => this.sheetClosed()));
          } else if (act === 'settings') {
            sheet.close();
            this.pausing(
              showSettings(
                this.scope,
                this.ctx,
                () => this.ctx.nav.home(),
                () => {
                  this.sheetClosed();
                  const reduced = prefersReducedMotion();
                  this.faces.configure(this.ctx.settings.faces, reduced);
                  this.board.setFacesStill(reduced || this.ctx.settings.faces === 'off');
                  this.board.setOptions({ counters: this.ctx.settings.counters, patterns: this.ctx.settings.patterns });
                  this.render();
                },
              ),
            );
          } else if (act === 'restart') this.restart();
          else if (act === 'home') this.ctx.nav.home();
        },
        { label: 'Paused', onClose: () => this.sheetClosed() },
      ),
    );
  }

  // ------------------------------------------------------------ test hooks

  get debug() {
    return { session: this.session, timer: this.timer, scope: this.scope, board: this.board, faces: this.faces };
  }
}
