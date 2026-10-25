/**
 * Interactive tutorial (5 steps). Uses the real board, tools and faces in Zen rules with direct
 * placement, so what players learn is exactly how the game plays.
 */
import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, h } from '../app/dom';
import { prefersReducedMotion } from '../app/theme';
import { CAT, DOG, type Species } from '../engine/types';
import { type Session, type Tool, type CellValue } from '../game/session';
import { buildLessons, lessonComplete, lessonSession, type Lesson } from '../game/tutorial';
import { tutorialPool } from '../game/catalog';
import { BoardView, REGION_NAMES } from '../ui/board';
import { CAT_SVG, DOG_SVG, MARK_SVG } from '../game/icons';
import { AnimalFaceController } from '../game/animalFaces';
import { faceCuesFor } from '../game/events';
import { tapTarget, violationText } from './game';
import { planHint, revealHint } from '../game/hints';

export class TutorialScreen implements Screen {
  private scope = new Scope();
  private stepScope = new Scope();
  private lessons: Lesson[] = [];
  private index = 0;
  private session!: Session;
  private board!: BoardView;
  private faces!: AnimalFaceController;
  private el!: HTMLElement;
  private done = false;
  private pendingHint: ReturnType<typeof planHint> | null = null;

  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    this.lessons = buildLessons(tutorialPool()) ?? [];
    this.el = h(`
      <main class="game tutorial">
        <div class="topbar">
          <button class="icon-btn" data-act="home" aria-label="Home">‹</button>
          <div class="topbar__center"><h1 class="title">How to play</h1></div>
          <button class="btn btn--ghost" data-act="skip">Skip</button>
        </div>
        <section class="lesson" data-lesson aria-live="polite"></section>
        <div class="board-wrap" data-board-wrap></div>
        <p class="status" data-status></p>
        <div class="tools" role="toolbar" aria-label="Choose what to place">
          <button class="tool" data-tool="cat" aria-pressed="false">${CAT_SVG}<span>Cat</span></button>
          <button class="tool" data-tool="dog" aria-pressed="false">${DOG_SVG}<span>Dog</span></button>
          <button class="tool tool--mark" data-tool="mark" aria-pressed="false">${MARK_SVG}<span>Empty</span></button>
        </div>
      </main>`);
    root.appendChild(this.el);
    this.scope.listen(this.el, 'click', (e) => {
      const tool = (e.target as HTMLElement).closest?.('[data-tool]') as HTMLElement | null;
      if (tool) return this.selectTool(tool.dataset.tool as Tool);
      const a = actionOf(e);
      if (!a) return;
      if (a.act === 'home') this.ctx.nav.home();
      else if (a.act === 'skip') this.finish(false);
      else if (a.act === 'next') this.goTo(this.index + 1);
      else if (a.act === 'hint') this.hint();
      else if (a.act === 'start') this.finish(true);
    });
    this.scope.add(() => this.stepScope.dispose());
    if (!this.lessons.length) return this.finish(false);
    this.goTo(0);
  }

  unmount(): void {
    this.scope.dispose();
  }

  private goTo(i: number): void {
    if (i >= this.lessons.length) return this.finish(true);
    this.stepScope.dispose();
    this.stepScope = new Scope();
    this.index = i;
    const l = this.lessons[i];
    this.done = false;
    this.session = lessonSession(l);
    const wrap = this.el.querySelector('[data-board-wrap]') as HTMLElement;
    wrap.replaceChildren();
    this.board = new BoardView(l.puzzle, this.stepScope, {
      tap: (r, c) => this.onTap(r, c),
      longPress: (r, c) => {
        const v = this.session.cells[r][c];
        if (v === CAT || v === DOG) for (const f of faceCuesFor({ type: 'pet', r, c })) this.faces.react(f.r, f.c, f.event);
      },
      cellChanged: (r, c) => this.faces?.cellChanged(r, c),
    }, { counters: this.ctx.settings.counters, patterns: this.ctx.settings.patterns });
    wrap.appendChild(this.board.el);
    this.board.fitTo(wrap);
    const reduced = prefersReducedMotion();
    this.board.setFacesStill(reduced || this.ctx.settings.faces === 'off');
    this.faces = new AnimalFaceController(this.board, { level: this.ctx.settings.faces, reducedMotion: reduced, now: this.ctx.now });
    this.stepScope.add(() => this.faces.dispose());
    this.board.tintUnits(l.highlight, 'in-lesson-unit');
    this.ctx.analytics.track('tutorial_step_started', { step: l.step });
    this.renderLesson();
    this.status(l.target ? '' : 'Tip: use Empty (✕) to mark cells you’ve ruled out.');
    this.render();
  }

  private renderLesson(extra = ''): void {
    const l = this.lessons[this.index];
    const card = this.el.querySelector('[data-lesson]') as HTMLElement;
    card.innerHTML = `
      <span class="lesson__step">Step ${l.step} of ${this.lessons.length}</span>
      <h2>${esc(l.title)}</h2>
      <p>${esc(this.done ? l.success : l.body)}</p>
      ${extra}`;
  }

  private selectTool(t: Tool): void {
    this.session.tool = t;
    this.render();
  }

  private onTap(r: number, c: number): void {
    if (this.done) return;
    if (this.pendingHint) {
      this.pendingHint = null;
      this.board.clear('in-lesson-unit');
      const btn = this.el.querySelector('[data-act="hint"]');
      if (btn) btn.textContent = 'Hint';
    }
    const s = this.session;
    const target = tapTarget(s.cells[r][c], s.tool, 'direct');
    const res = s.setCell(r, c, target);
    if (res.violation && (target === CAT || target === DOG)) {
      const region = REGION_NAMES[s.puzzle.regions[r][c] % 10];
      this.status(violationText(res.violation, target as Species, r, c, region));
      this.board.flash([{ r, c }], 'is-error');
      if (res.conflicts.length) this.board.flash(res.conflicts, 'is-conflict');
      for (const f of faceCuesFor({ type: 'rejected', r, c, violation: res.violation, conflicts: res.conflicts })) this.faces.react(f.r, f.c, f.event);
      if (this.ctx.settings.haptics) this.ctx.haptics.play('error');
    } else if (res.accepted && (target === CAT || target === DOG)) {
      this.status('');
      if (this.ctx.settings.haptics) this.ctx.haptics.play('light');
    }
    this.render();
    if (res.accepted && (target === CAT || target === DOG) && s.outcome === 'playing') for (const f of faceCuesFor({ type: 'placed', r, c, species: target as Species })) this.faces.react(f.r, f.c, f.event);
    this.checkDone();
  }

  /** Two stages, like the game: first tap explains, second tap reveals. */
  private hint(): void {
    const btn = this.el.querySelector('[data-act="hint"]') as HTMLElement | null;
    if (this.pendingHint) {
      revealHint(this.session, this.pendingHint);
      this.pendingHint = null;
      this.board.clear('in-lesson-unit');
      if (btn) btn.textContent = 'Hint';
      this.render();
      this.checkDone();
      return;
    }
    const plan = planHint(this.session);
    if (plan.kind === 'none') return;
    this.pendingHint = plan;
    this.status(plan.lines[plan.lines.length - 1]);
    this.board.tintUnits(plan.units, 'in-lesson-unit');
    if (btn) btn.textContent = 'Reveal';
  }

  private checkDone(): void {
    const l = this.lessons[this.index];
    if (this.done || !lessonComplete(l, this.session)) return;
    this.done = true;
    this.ctx.analytics.track('tutorial_step_completed', { step: l.step });
    this.board.clear('in-lesson-unit');
    const last = this.index === this.lessons.length - 1;
    const after = () => {
      if (!this.stepScope.alive) return;
      this.renderLesson(
        last
          ? `<button class="btn btn--primary" data-act="start"><span>Start Level 1</span><span class="pill" aria-hidden="true">›</span></button>`
          : `<button class="btn btn--primary" data-act="next"><span>Next</span><span class="pill" aria-hidden="true">›</span></button>`,
      );
      (this.el.querySelector('[data-act="next"], [data-act="start"]') as HTMLElement | null)?.focus();
    };
    if (last || this.session.outcome === 'won') this.faces.reactAllOccupied('won', after);
    else after();
  }

  private finish(completed: boolean): void {
    this.ctx.flags.tutorialDone = true;
    this.ctx.flags.seenRules = true;
    this.ctx.saveFlags();
    if (completed) this.ctx.nav.play({ kind: 'level', level: this.ctx.progress.level });
    else this.ctx.nav.home();
  }

  private status(msg: string): void {
    (this.el.querySelector('[data-status]') as HTMLElement).textContent = msg;
  }

  private render(): void {
    const s = this.session;
    this.board.update({ cells: s.cells as CellValue[][], givenMask: s.givenMask, dead: this.ctx.settings.autoMark ? s.deadCells() : null });
    this.el.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => {
      const on = b.dataset.tool === s.tool;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const l = this.lessons[this.index];
    if (!l.target && !this.el.querySelector('[data-act="hint"]')) {
      this.el.querySelector('.tools')!.insertAdjacentHTML('afterend', `<div class="actions" data-lesson-actions><button class="action" data-act="hint">Hint</button></div>`);
    } else if (l.target) this.el.querySelector('[data-lesson-actions]')?.remove();
  }

  get debug() {
    return { lessons: this.lessons, session: this.session, index: this.index };
  }
}
