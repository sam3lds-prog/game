import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, h } from '../app/dom';
import { CAT_SVG, DOG_SVG } from '../game/icons';
import { localDateKey } from '../engine/levels';
import { hasSession } from '../services/sessions';
import { puzzleKey } from '../game/puzzles';
import { CAMPAIGN_LENGTH, campaignEntry, dailyEntry } from '../game/catalog';
import { showSettings } from './sheets';
import { openSheet } from '../ui/sheet';
import { streakFor } from '../game/records';
import { newUnlimitedRef, UNLIMITED_SIZE, type UnlimitedDifficulty } from '../game/puzzles';
import type { PlayMode } from '../services/storage';
import { BRAND } from '../brand';

export const MODE_COPY: Record<PlayMode, string> = {
  zen: 'Zen: no hearts and no clock. Only moves that break a rule are blocked, and you can change your mind anytime.',
  challenge: 'Challenge: 3 hearts and a clock. Every pet is checked against the answer as you place it; a wrong one costs a heart.',
};

export class HomeScreen implements Screen {
  private scope = new Scope();
  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    const { progress, settings, flags } = this.ctx;
    const today = localDateKey(new Date(this.ctx.now()));
    const daily = dailyEntry(today);
    const dailyDone = !!this.ctx.records.daily[today];
    const streak = streakFor(this.ctx.records, today);
    const lvl = campaignEntry(Math.min(progress.level, CAMPAIGN_LENGTH));
    const campaignDone = progress.level > CAMPAIGN_LENGTH;
    const levelInProgress = hasSession(puzzleKey({ kind: 'level', level: progress.level }));
    const dailyInProgress = !dailyDone && hasSession(puzzleKey({ kind: 'daily', dateKey: today }));
    const firstRun = !flags.tutorialDone;
    const mode = settings.defaultMode;

    const play = firstRun
      ? `<button class="btn btn--primary" data-act="tutorial"><span class="left"><span>Start here</span><span class="sub">A 2-minute guided tutorial</span></span><span class="pill" aria-hidden="true">›</span></button>`
      : campaignDone
        ? `<button class="btn btn--primary" data-act="levels"><span class="left"><span>Campaign complete</span><span class="sub">All ${CAMPAIGN_LENGTH} levels solved</span></span><span class="pill" aria-hidden="true">›</span></button>`
        : `<button class="btn btn--primary" data-act="play"><span class="left"><span>${levelInProgress ? 'Continue' : 'Play'}</span><span class="sub">Level ${esc(progress.level)}</span></span><span class="pill">${lvl ? `${lvl.size}×${lvl.size}` : ''}</span></button>`;
    const dailyBtn = daily
      ? `<button class="btn" data-act="daily"><span class="left"><span>Daily Puzzle</span><span class="sub">${dailyDone ? 'Done today ✓' : dailyInProgress ? 'In progress' : streak.atRisk ? 'Keep your streak going' : esc(today)} · streak ${esc(streak.current)}</span></span><span class="pill">${daily.size}×${daily.size}</span></button>`
      : `<div class="btn btn--static"><span class="left"><span>Daily Puzzle</span><span class="sub">New dailies arrive with the next update</span></span></div>`;

    const el = h(`
      <main class="home">
        <div class="home__hero" aria-hidden="true">${CAT_SVG}<span class="vs">&amp;</span>${DOG_SVG}</div>
        <div>
          <h1>${esc(BRAND.name)}</h1>
          <p class="tagline">${esc(BRAND.tagline)}</p>
        </div>
        <div class="mode-picker">
          <div class="segmented" role="radiogroup" aria-label="Mode for new boards">
            <button role="radio" data-act="mode" data-value="zen" aria-checked="${mode === 'zen'}">Zen</button>
            <button role="radio" data-act="mode" data-value="challenge" aria-checked="${mode === 'challenge'}">Challenge</button>
          </div>
          <p data-mode-copy>${esc(MODE_COPY[mode])}</p>
        </div>
        <nav class="menu">
          ${play}
          ${firstRun ? '' : dailyBtn}
          ${
            firstRun
              ? '<button class="btn btn--ghost" data-act="skip-tutorial">Skip the tutorial</button>'
              : `<div class="tiles tiles--nav">
            <button class="tile" data-act="levels"><span class="v">${esc(Math.min(progress.level - 1, CAMPAIGN_LENGTH))}/${CAMPAIGN_LENGTH}</span><span class="k">Levels</span></button>
            <button class="tile" data-act="calendar"><span class="v">${esc(this.ctx.records.dailyTotal)}</span><span class="k">Calendar</span></button>
            <button class="tile" data-act="unlimited"><span class="v">∞</span><span class="k">Unlimited</span></button>
            <button class="tile" data-act="stats"><span class="v">${esc(this.ctx.records.total)}</span><span class="k">Stats</span></button>
            <button class="tile" data-act="collection"><span class="v">${esc(this.ctx.records.coats.cat.length + this.ctx.records.coats.dog.length)}</span><span class="k">Pets</span></button>
            <button class="tile" data-act="tutorial"><span class="v">?</span><span class="k">How to play</span></button>
          </div>`
          }
          <button class="btn btn--ghost" data-act="settings">Settings</button>
        </nav>
      </main>`);
    this.scope.listen(el, 'click', (e) => {
      const a = actionOf(e);
      if (!a) return;
      const nav = this.ctx.nav;
      if (a.act === 'play') nav.play({ kind: 'level', level: this.ctx.progress.level });
      else if (a.act === 'daily') nav.play({ kind: 'daily', dateKey: localDateKey(new Date(this.ctx.now())) });
      else if (a.act === 'levels') nav.levels();
      else if (a.act === 'calendar') nav.calendar();
      else if (a.act === 'stats') nav.stats();
      else if (a.act === 'collection') nav.collection();
      else if (a.act === 'unlimited') this.unlimited();
      else if (a.act === 'tutorial') nav.tutorial();
      else if (a.act === 'skip-tutorial') {
        this.ctx.flags.tutorialDone = true;
        this.ctx.saveFlags();
        nav.home();
      } else if (a.act === 'mode') {
        const m = a.el.dataset.value === 'challenge' ? 'challenge' : 'zen';
        this.ctx.settings.defaultMode = m;
        this.ctx.saveSettings();
        this.ctx.analytics.track('mode_selected', { mode: m });
        el.querySelectorAll<HTMLElement>('[data-act="mode"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === m)));
        el.querySelector('[data-mode-copy]')!.textContent = MODE_COPY[m];
      } else if (a.act === 'settings') showSettings(this.scope, this.ctx, () => nav.home(), () => nav.home());
    });
    root.appendChild(el);
  }

  private unlimited(): void {
    const last = this.ctx.progress.lastUnlimited;
    const lastRef = last ? ({ kind: 'unlimited', difficulty: last.difficulty, seed: last.seed } as const) : null;
    const canContinue = !!lastRef && hasSession(puzzleKey(lastRef));
    const option = (d: UnlimitedDifficulty, note: string) =>
      `<button class="btn" data-act="u-${d}"><span class="left"><span>${d[0].toUpperCase()}${d.slice(1)}</span><span class="sub">${note}</span></span><span class="pill">${UNLIMITED_SIZE[d]}×${UNLIMITED_SIZE[d]}</span></button>`;
    openSheet(
      this.scope,
      `
        <h2>Unlimited</h2>
        <p>Fresh boards whenever you want, at the difficulty you pick. They don’t affect your campaign or streak.</p>
        ${canContinue ? `<button class="btn btn--primary" data-act="u-continue"><span>Continue last board</span></button>` : ''}
        ${option('easy', 'Only “last spot” logic')}
        ${option('medium', 'Needs a little planning')}
        ${option('hard', 'Pairs of rows, columns and colors')}
        <button class="btn btn--ghost" data-act="close">Close</button>`,
      (act, _el, sheet) => {
        if (act === 'close') return sheet.close();
        if (act === 'u-continue' && lastRef) return this.ctx.nav.play(lastRef);
        const d = act.slice(2) as UnlimitedDifficulty;
        if (d in UNLIMITED_SIZE) this.ctx.nav.play(newUnlimitedRef(d));
      },
      { label: 'Unlimited' },
    );
  }

  unmount(): void {
    this.scope.dispose();
  }
}
