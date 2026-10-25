import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, h } from '../app/dom';
import { hasSession } from '../services/sessions';
import { puzzleKey } from '../game/puzzles';
import { CAMPAIGN_LENGTH } from '../game/catalog';

export class LevelsScreen implements Screen {
  private scope = new Scope();
  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    const { progress } = this.ctx;
    const total = CAMPAIGN_LENGTH;
    const cells: string[] = [];
    for (let i = 1; i <= total; i++) {
      const state = i < progress.level ? 'done' : i === progress.level ? 'next' : 'locked';
      const inProgress = state !== 'locked' && hasSession(puzzleKey({ kind: 'level', level: i }));
      const label = `Level ${i}${state === 'done' ? ', completed' : state === 'locked' ? ', locked' : ''}${inProgress ? ', in progress' : ''}`;
      cells.push(`<button class="lvl ${state}${inProgress ? ' in-progress' : ''}" data-act="open" data-level="${i}" aria-label="${label}" ${state === 'locked' ? 'disabled' : ''}>${i}</button>`);
    }
    const el = h(`
      <main class="game">
        <div class="topbar"><button class="icon-btn" data-act="home" aria-label="Back">‹</button><h1 class="title">Levels</h1><span class="meta">${progress.level - 1} done</span></div>
        <div class="levels">${cells.join('')}</div>
      </main>`);
    this.scope.listen(el, 'click', (e) => {
      const a = actionOf(e);
      if (!a) return;
      if (a.act === 'home') this.ctx.nav.home();
      else if (a.act === 'open') this.ctx.nav.play({ kind: 'level', level: Number(a.el.dataset.level) });
    });
    root.appendChild(el);
  }

  unmount(): void {
    this.scope.dispose();
  }
}
