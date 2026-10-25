import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, h } from '../app/dom';
import { CAT_SVG, DOG_SVG } from '../game/icons';
import { localDateKey } from '../engine/levels';
import { hasSession } from '../services/sessions';
import { puzzleKey } from '../game/puzzles';
import { CAMPAIGN_LENGTH, campaignEntry, dailyEntry } from '../game/catalog';
import { showSettings } from './sheets';
import type { PlayMode } from '../services/storage';

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
    const dailyDone = !!progress.dailyDone[today];
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
      ? `<button class="btn" data-act="daily"><span class="left"><span>Daily Puzzle</span><span class="sub">${dailyDone ? 'Done today ✓' : dailyInProgress ? 'In progress' : esc(today)} · streak ${esc(progress.streak)}</span></span><span class="pill">${daily.size}×${daily.size}</span></button>`
      : `<div class="btn btn--static"><span class="left"><span>Daily Puzzle</span><span class="sub">New dailies arrive with the next update</span></span></div>`;

    const el = h(`
      <main class="home">
        <div class="home__hero" aria-hidden="true">${CAT_SVG}<span class="vs">&amp;</span>${DOG_SVG}</div>
        <div>
          <h1>Cats &amp; Dogs</h1>
          <p class="tagline">One cat and one dog in every row, column and color. Never side by side.</p>
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
          ${firstRun ? '' : `<button class="btn" data-act="levels"><span class="left"><span>Levels</span><span class="sub">${esc(Math.min(progress.level - 1, CAMPAIGN_LENGTH))} of ${CAMPAIGN_LENGTH} solved</span></span><span class="pill" aria-hidden="true">›</span></button>`}
          ${firstRun ? '<button class="btn btn--ghost" data-act="skip-tutorial">Skip the tutorial</button>' : '<button class="btn btn--ghost" data-act="tutorial">How to play</button>'}
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
      else if (a.act === 'tutorial') nav.tutorial();
      else if (a.act === 'skip-tutorial') {
        this.ctx.flags.tutorialDone = true;
        this.ctx.saveFlags();
        nav.home();
      } else if (a.act === 'mode') {
        const m = a.el.dataset.value === 'challenge' ? 'challenge' : 'zen';
        this.ctx.settings.defaultMode = m;
        this.ctx.saveSettings();
        el.querySelectorAll<HTMLElement>('[data-act="mode"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === m)));
        el.querySelector('[data-mode-copy]')!.textContent = MODE_COPY[m];
      } else if (a.act === 'settings') showSettings(this.scope, this.ctx, () => nav.home(), () => nav.home());
    });
    root.appendChild(el);
  }

  unmount(): void {
    this.scope.dispose();
  }
}
