/** Personal statistics and awards. */
import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, fmtTime, h } from '../app/dom';
import { localDateKey } from '../engine/levels';
import { AWARDS, hintsPerSolve, sizeStats, streakFor } from '../game/records';

export class StatsScreen implements Screen {
  private scope = new Scope();
  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    const r = this.ctx.records;
    const streak = streakFor(r, localDateKey(new Date(this.ctx.now())));
    const sizes = sizeStats(r);
    const tile = (v: string | number, k: string) => `<div class="tile"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`;
    const el = h(`
      <main class="game page">
        <div class="topbar"><button class="icon-btn" data-act="home" aria-label="Home">‹</button><h1 class="title">Stats &amp; awards</h1><span class="topbar__spacer"></span></div>
        <section class="tiles">
          ${tile(r.total, 'puzzles solved')}
          ${tile(r.firstTime, 'different puzzles')}
          ${tile(streak.current, 'current streak')}
          ${tile(Math.max(r.bestStreak, streak.current), 'best streak')}
          ${tile(r.zeroMistake, 'no-mistake solves')}
          ${tile(hintsPerSolve(r), 'hints per solve')}
        </section>
        <section class="card">
          <h2>Times by board size</h2>
          ${
            sizes.length
              ? `<div class="table-wrap"><table class="table"><thead><tr><th>Board</th><th>Solves</th><th>Median</th><th>Average</th><th>Best</th></tr></thead><tbody>
            ${sizes.map((s) => `<tr><td>${s.size}×${s.size}</td><td>${s.solves}</td><td>${fmtTime(s.medianSeconds)}</td><td>${fmtTime(s.averageSeconds)}</td><td>${fmtTime(s.bestSeconds)}</td></tr>`).join('')}
            </tbody></table></div>`
              : '<p class="fine">Solve a puzzle to see your times here.</p>'
          }
        </section>
        <section class="card">
          <h2>Awards</h2>
          <ul class="awards">
            ${AWARDS.map((a) => {
              const on = !!r.awards[a.id];
              return `<li class="award${on ? ' is-earned' : ''}"><span class="award__mark" aria-hidden="true">${on ? '★' : '☆'}</span><span><b>${esc(a.title)}</b><span class="fine">${esc(a.detail)}${on ? ` Earned ${esc(r.awards[a.id])}.` : ''}</span></span></li>`;
            }).join('')}
          </ul>
        </section>
      </main>`);
    this.scope.listen(el, 'click', (e) => {
      if (actionOf(e)?.act === 'home') this.ctx.nav.home();
    });
    root.appendChild(el);
  }

  unmount(): void {
    this.scope.dispose();
  }
}
