/** Daily calendar: solved days, rest days, missed days, today, and replay of earlier dailies. */
import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, h } from '../app/dom';
import { dateFromKey, localDateKey } from '../engine/levels';
import { DAILY_FIRST, DAILY_LAST, dailyEntry } from '../game/catalog';
import { streakFor } from '../game/records';
import { REST_DAY_WINDOW } from '../game/streak';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export class CalendarScreen implements Screen {
  private scope = new Scope();
  private el!: HTMLElement;
  private month: { y: number; m: number };

  constructor(private ctx: AppContext) {
    const today = dateFromKey(localDateKey(new Date(ctx.now())));
    this.month = { y: today.getFullYear(), m: today.getMonth() };
  }

  mount(root: HTMLElement): void {
    this.el = h(`<main class="game page"></main>`);
    root.appendChild(this.el);
    this.scope.listen(this.el, 'click', (e) => {
      const a = actionOf(e);
      if (!a) return;
      if (a.act === 'home') this.ctx.nav.home();
      else if (a.act === 'prev' || a.act === 'next') {
        const d = new Date(this.month.y, this.month.m + (a.act === 'next' ? 1 : -1), 1);
        this.month = { y: d.getFullYear(), m: d.getMonth() };
        this.render();
      } else if (a.act === 'day') this.ctx.nav.play({ kind: 'daily', dateKey: a.el.dataset.date! });
    });
    this.render();
  }

  unmount(): void {
    this.scope.dispose();
  }

  private render(): void {
    const today = localDateKey(new Date(this.ctx.now()));
    const r = this.ctx.records;
    const streak = streakFor(r, today);
    const rest = new Set(streak.restDays);
    const { y, m } = this.month;
    const first = new Date(y, m, 1);
    const days = new Date(y, m + 1, 0).getDate();
    const firstKey = localDateKey(first);
    const lastKey = localDateKey(new Date(y, m, days));
    const canPrev = !!DAILY_FIRST && firstKey > DAILY_FIRST;
    const canNext = !!DAILY_LAST && lastKey < DAILY_LAST;
    const cells: string[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<span class="cal__blank" aria-hidden="true"></span>');
    for (let d = 1; d <= days; d++) {
      const key = localDateKey(new Date(y, m, d));
      const inCatalog = !!dailyEntry(key);
      const rec = r.daily[key];
      let state = 'none';
      let label = 'no puzzle';
      if (inCatalog) {
        if (key > today) [state, label] = ['future', 'not yet'];
        else if (rec && rec.solvedOn === key) [state, label] = ['solved', 'solved on the day'];
        else if (rec) [state, label] = ['late', 'solved later'];
        else if (rest.has(key)) [state, label] = ['rest', 'rest day'];
        else if (key === today) [state, label] = ['open', 'today, not solved yet'];
        else [state, label] = ['missed', 'not solved'];
      }
      const playable = inCatalog && key <= today;
      const tag = playable ? 'button' : 'span';
      cells.push(
        `<${tag} class="cal__day cal__day--${state}${key === today ? ' is-today' : ''}" ${playable ? `data-act="day" data-date="${key}"` : ''} aria-label="${MONTHS[m]} ${d}: ${label}"><span>${d}</span></${tag}>`,
      );
    }
    this.el.innerHTML = `
      <div class="topbar"><button class="icon-btn" data-act="home" aria-label="Home">‹</button><h1 class="title">Daily calendar</h1><span class="topbar__spacer"></span></div>
      <section class="card streak-card">
        <div class="stats">
          <div><div class="v">${streak.current}</div><div class="k">current streak</div></div>
          <div><div class="v">${Math.max(r.bestStreak, streak.current)}</div><div class="k">best streak</div></div>
          <div><div class="v">${r.dailyTotal}</div><div class="k">dailies solved</div></div>
        </div>
        <p class="fine">Your streak counts days you solve that day’s Daily. Miss a single day and it keeps going (a rest day, at most once every ${REST_DAY_WINDOW} days). Miss two in a row and it starts over. Old dailies count toward totals, not streaks.${streak.atRisk ? ' <b>Solve today’s Daily to keep your streak.</b>' : ''}</p>
      </section>
      <div class="cal">
        <div class="cal__head">
          <button class="icon-btn" data-act="prev" aria-label="Previous month" ${canPrev ? '' : 'disabled'}>‹</button>
          <h2>${esc(MONTHS[m])} ${y}</h2>
          <button class="icon-btn" data-act="next" aria-label="Next month" ${canNext ? '' : 'disabled'}>›</button>
        </div>
        <div class="cal__grid" role="grid">
          ${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span class="cal__dow" aria-hidden="true">${d}</span>`).join('')}
          ${cells.join('')}
        </div>
        <div class="cal__legend" aria-hidden="true">
          <span><i class="cal__key cal__day--solved"></i>Solved</span>
          <span><i class="cal__key cal__day--late"></i>Solved later</span>
          <span><i class="cal__key cal__day--rest"></i>Rest day</span>
          <span><i class="cal__key cal__day--missed"></i>Open</span>
        </div>
      </div>`;
  }
}
