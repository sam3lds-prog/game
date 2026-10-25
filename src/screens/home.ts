import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, h } from '../app/dom';
import { CAT_SVG, DOG_SVG } from '../game/icons';
import { dailySpec, levelSpec, localDateKey } from '../engine/levels';
import { hasSession, } from '../services/sessions';
import { puzzleKey } from '../game/puzzles';
import { showRules, showSettings } from './sheets';

export class HomeScreen implements Screen {
  private scope = new Scope();
  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    const { progress } = this.ctx;
    const today = localDateKey(new Date(this.ctx.now()));
    const daily = dailySpec(new Date(this.ctx.now()));
    const dailyDone = !!progress.dailyDone[today];
    const lvl = levelSpec(progress.level);
    const levelInProgress = hasSession(puzzleKey({ kind: 'level', level: progress.level }));
    const dailyInProgress = !dailyDone && hasSession(puzzleKey({ kind: 'daily', dateKey: today }));
    const el = h(`
      <main class="home">
        <div class="home__hero" aria-hidden="true">${CAT_SVG}<span class="vs">&amp;</span>${DOG_SVG}</div>
        <div>
          <h1>Cats &amp; Dogs</h1>
          <p class="tagline">One cat and one dog in every row, column and color. Never side by side.</p>
        </div>
        <nav class="menu">
          <button class="btn btn--primary" data-act="play">
            <span class="left"><span>${levelInProgress ? 'Continue' : 'Play'}</span><span class="sub">Level ${esc(progress.level)}</span></span>
            <span class="pill">${lvl.size}×${lvl.size}</span>
          </button>
          <button class="btn" data-act="daily">
            <span class="left"><span>Daily Puzzle</span><span class="sub">${dailyDone ? 'Done today ✓' : dailyInProgress ? 'In progress' : esc(today)} · streak ${esc(progress.streak)}</span></span>
            <span class="pill">${daily.size}×${daily.size}</span>
          </button>
          <button class="btn" data-act="levels"><span class="left"><span>Levels</span><span class="sub">${esc(progress.level - 1)} completed</span></span><span class="pill" aria-hidden="true">›</span></button>
          <button class="btn btn--ghost" data-act="rules">How to play</button>
          <button class="btn btn--ghost" data-act="settings">Settings</button>
        </nav>
      </main>`);
    this.scope.listen(el, 'click', (e) => {
      const a = actionOf(e);
      if (!a) return;
      if (a.act === 'play') this.ctx.nav.play({ kind: 'level', level: this.ctx.progress.level });
      else if (a.act === 'daily') this.ctx.nav.play({ kind: 'daily', dateKey: localDateKey(new Date(this.ctx.now())) });
      else if (a.act === 'levels') this.ctx.nav.levels();
      else if (a.act === 'rules') showRules(this.scope, this.ctx);
      else if (a.act === 'settings') showSettings(this.scope, this.ctx, () => this.ctx.nav.home());
    });
    root.appendChild(el);
  }

  unmount(): void {
    this.scope.dispose();
  }
}
