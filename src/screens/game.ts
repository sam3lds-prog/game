/**
 * The game screen. Owns one Session, one BoardView and one ActiveTimer.
 * Everything it starts (timers, listeners, sheets, pending ad callbacks) is tied to its Scope,
 * so leaving the screen cancels all of it.
 */
import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, fmtTime, h } from '../app/dom';
import { CAT, DOG, EMPTY, type Species } from '../engine/types';
import { MARK, Session, toolSpecies, type CellValue, type MoveResult, type Tool, type Violation } from '../game/session';
import { ActiveTimer } from '../game/timer';
import { loadPuzzle, puzzleKey, refTitle, type PuzzleRef } from '../game/puzzles';
import { recordDailyWin, recordLevelWin } from '../game/progression';
import { clearSession, loadSession, saveSession } from '../services/sessions';
import { BoardView, REGION_NAMES } from '../ui/board';
import { openSheet, type SheetHandle } from '../ui/sheet';
import { CAT_SVG, DOG_SVG, HEART_SVG, MARK_SVG } from '../game/icons';
import { showRules, showSettings } from './sheets';
import { AnimalFaceController } from '../game/animalFaces';
import { faceCuesFor, type GameEvent } from '../game/events';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

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

  constructor(
    private ctx: AppContext,
    private ref: PuzzleRef,
  ) {
    this.key = puzzleKey(ref);
  }

  // ------------------------------------------------------------ lifecycle

  mount(root: HTMLElement): void {
    const saved = loadSession(this.key);
    const fresh = saved && saved.outcome !== 'won' ? null : loadPuzzle(this.ref);
    if (!saved && !fresh) return this.mountMissing(root);
    this.session = saved && saved.outcome !== 'won' ? Session.fromSnapshot(saved) : new Session(fresh!, 'challenge');
    this.timer = new ActiveTimer(this.session.restoredActiveMs, this.ctx.now);
    const s = this.session;
    const n = s.size;

    this.el = h(`
      <main class="game">
        <div class="topbar">
          <button class="icon-btn" data-act="home" aria-label="Home">‹</button>
          <div class="topbar__center">
            <h1 class="title">${esc(refTitle(this.ref))}</h1>
            <div class="meta"><span data-timer>0:00</span> · ${n}×${n} · ${esc(s.puzzle.difficulty)}</div>
          </div>
          <div class="hearts" data-hearts aria-label=""></div>
        </div>
        <div class="board-wrap" data-board-wrap></div>
        <p class="status" data-status role="status" aria-live="polite"></p>
        <div class="tools" role="toolbar" aria-label="Choose what to place">
          <button class="tool" data-tool="cat" aria-pressed="false">${CAT_SVG}<span>Cat</span></button>
          <button class="tool" data-tool="dog" aria-pressed="false">${DOG_SVG}<span>Dog</span></button>
          <button class="tool tool--mark" data-tool="mark" aria-pressed="false">${MARK_SVG}<span>Empty</span></button>
        </div>
        <div class="actions">
          <button class="action" data-act="undo">Undo</button>
          <button class="action" data-act="hint">Hint</button>
          <button class="action" data-act="pause">Pause</button>
        </div>
      </main>`);
    this.board = new BoardView(s.puzzle, this.scope, {
      tap: (r, c) => this.onTap(r, c),
      longPress: (r, c) => this.onLongPress(r, c),
      cellChanged: (r, c) => this.faces?.cellChanged(r, c),
    });
    this.el.querySelector('[data-board-wrap]')!.appendChild(this.board.el);
    root.appendChild(this.el);
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
    this.scope.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.persist();
      this.syncTimer();
    });
    this.scope.interval(() => this.paintTimer(), 500);

    this.status(this.ctx.settings.inputMode === 'direct' ? 'Pick Cat, Dog or ✕, then tap a cell.' : 'Tap a cell to mark ✕, tap again to place the selected pet.');
    this.render();

    if (s.outcome === 'lost') {
      this.outcomeHandled = 'lost';
      this.showLose();
    } else if (!this.ctx.flags.seenRules) {
      this.pausing(showRules(this.scope, this.ctx, () => this.sheetClosed()));
    }
    this.syncTimer();
  }

  /** No puzzle for this level/date in the catalog (past the campaign, or a daily outside the catalog). */
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

  // ------------------------------------------------------------ timer

  private syncTimer(): void {
    const visible = this.scope.alive && !document.hidden && this.pausingSheets === 0;
    const run = visible && this.session.outcome === 'playing';
    if (run) this.timer.start();
    else this.timer.stop();
    // Faces rest whenever the board is hidden or covered; outcome sequences manage themselves.
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

  private targetFor(cur: CellValue): CellValue {
    const tool = this.session.tool;
    const species = toolSpecies(tool);
    if (this.ctx.settings.inputMode === 'direct') {
      const want: CellValue = species ?? MARK;
      return cur === want ? EMPTY : want;
    }
    if (!species) return cur === EMPTY ? MARK : EMPTY;
    if (cur === EMPTY) return MARK;
    if (cur === MARK) return species;
    return EMPTY;
  }

  private onTap(r: number, c: number): void {
    const s = this.session;
    if (s.outcome !== 'playing' || this.pausingSheets > 0) return;
    const target = this.targetFor(s.cells[r][c]);
    const res = s.setCell(r, c, target);
    this.handleResult(res, r, c, target);
  }

  private handleResult(res: MoveResult, r: number, c: number, target: CellValue): void {
    let event: GameEvent | null = null;
    if (res.accepted) {
      if (target === CAT || target === DOG) {
        this.haptic('light');
        event = { type: 'placed', r, c, species: target };
      }
    } else if (res.violation) {
      event = { type: 'rejected', r, c, violation: res.violation, conflicts: res.conflicts };
      const species = (target === CAT || target === DOG ? target : CAT) as Species;
      const region = REGION_NAMES[this.session.puzzle.regions[r][c] % 10];
      let msg = violationText(res.violation, species, r, c, region);
      if (res.heartLost) msg += this.session.hearts > 0 ? ` ${this.session.hearts} ${this.session.hearts === 1 ? 'heart' : 'hearts'} left.` : '';
      this.status(msg);
      if (res.violation !== 'given_cell') {
        this.board.flash([{ r, c }], 'is-error');
        if (res.conflicts.length) this.board.flash(res.conflicts, 'is-conflict');
        this.haptic('error');
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
    if (act === 'undo') {
      if (s.undo()) {
        this.render();
        this.persist();
      }
      return;
    }
    if (act === 'hint') return void this.giveHint();
    if (act === 'pause') return this.showPause();
  }

  private async giveHint(): Promise<void> {
    const s = this.session;
    if (s.outcome !== 'playing') return;
    this.pausingSheets++;
    this.syncTimer();
    const ok = await this.scope.guard(this.ctx.ads.showRewarded('hint', this.ctx.progress));
    if (!this.scope.alive) return;
    this.sheetClosed();
    if (!ok) return;
    const hint = s.hint();
    if (!hint) return this.status('No hint available right now.');
    this.board.flash([{ r: hint.r, c: hint.c }], 'is-hint', 1600);
    this.status(hint.reason);
    this.render();
    if (s.outcome === 'playing') this.cue({ type: 'hint', focus: [{ r: hint.r, c: hint.c }] });
    this.persist();
    this.checkOutcome();
  }

  private haptic(kind: 'light' | 'error' | 'success'): void {
    if (this.ctx.settings.haptics) this.ctx.haptics.play(kind);
  }

  // ------------------------------------------------------------ rendering

  private status(msg: string): void {
    const el = this.el.querySelector('[data-status]');
    if (el) el.textContent = msg;
  }

  private render(): void {
    const s = this.session;
    this.board.update({ cells: s.cells, givenMask: s.givenMask, dead: this.ctx.settings.autoMark ? s.deadCells() : null });
    this.renderTools();
    const hearts = this.el.querySelector('[data-hearts]') as HTMLElement;
    hearts.innerHTML = Array.from({ length: s.maxHearts }, (_, i) => HEART_SVG.replace('<svg', `<svg class="${i < s.hearts ? 'on' : 'off'}"`)).join('');
    hearts.setAttribute('aria-label', `${s.hearts} of ${s.maxHearts} hearts left`);
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

    // One facial celebration inside the occupied tiles, then the static result.
    await this.scope.guard(new Promise<void>((resolve) => this.faces.reactAllOccupied('won', resolve)));
    if (!this.scope.alive) return;
    await this.scope.guard(this.ctx.ads.maybeShowInterstitial(this.ctx.progress));
    if (!this.scope.alive) return;

    const ref = this.ref;
    this.pausing(
      openSheet(
        this.scope,
        `
        <h2>Solved!</h2>
        <div class="stats">
          <div><div class="v">${fmtTime(secs)}</div><div class="k">time${isBest ? ' · best' : ''}</div></div>
          <div><div class="v">${s.mistakes}</div><div class="k">mistakes</div></div>
          <div><div class="v">${s.hintsRevealed + s.hintsExplained}</div><div class="k">hints</div></div>
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
    this.pausing(
      openSheet(
        this.scope,
        `
        <h2>Paused</h2>
        <button class="btn btn--primary" data-act="resume"><span>Resume</span></button>
        <button class="btn" data-act="rules"><span>How to play</span></button>
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

  /** Read-only view for tests. */
  get debug() {
    return { session: this.session, timer: this.timer, scope: this.scope, board: this.board, faces: this.faces };
  }
}
