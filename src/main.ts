import './style.css';
import { dailySpec, levelSpec } from './engine/levels';
import { CAT, DOG, EMPTY, type Species } from './engine/types';
import { MARK, Session } from './game/session';
import { CAT_SVG, DOG_SVG, HEART_SVG, MARK_SVG } from './game/icons';
import { loadSave, resetProgress, saveSave, type SaveV2 } from './services/storage';
import { ads, shouldShowInterstitial } from './services/ads';
import { entitlementCounts, iap } from './services/iap';
import { type ModeRef, nextAfterWin, rulesFor } from './game/modes';
import { modeTitle, puzzleFor } from './game/puzzles';
import { captureSession, hasMeaningfulProgress, resumeSession } from './game/sessionPersistence';
import { localDateKey, prevDateKey } from './game/dates';

const app = document.getElementById('app')!;
let save: SaveV2 = loadSave().save;
let session: Session | null = null;
let mode: ModeRef | null = null;
let tool: Species = CAT;
let timerHandle: number | null = null;
/** Bumped on every screen change. Async work captures it and bails out if the player has moved on. */
let screenToken = 0;
const adCadence = { boardsSinceLast: 0, lastShownAt: null as number | null, shownToday: 0, day: localDateKey() };

function persist(): void {
  saveSave(save);
}

function removeAdsActive(): boolean {
  const ra = save.purchases.removeAds;
  return ra.active && entitlementCounts(ra.source, import.meta.env.DEV);
}

/** Saves the in-progress board so backgrounding or closing the app never loses it. */
function saveActive(): void {
  if (!session || !mode) return;
  save.lastSession = captureSession(mode, session);
  persist();
}

// ---------------------------------------------------------------- helpers
function h(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function haptic(kind: 'light' | 'error' | 'success'): void {
  if (!save.settings.haptics) return;
  try {
    const pattern = kind === 'light' ? 10 : kind === 'error' ? [30, 40, 30] : [15, 30, 15, 30, 40];
    navigator.vibrate?.(pattern);
  } catch {
    /* no haptics in this browser */
  }
}

function overlay(inner: HTMLElement): HTMLElement {
  const ov = h(`<div class="overlay"></div>`);
  ov.appendChild(inner);
  document.body.appendChild(ov);
  return ov;
}

// ---------------------------------------------------------------- home
function renderHome(): void {
  screenToken++;
  stopTimer();
  if (session && mode) saveActive();
  session = null;
  mode = null;
  const daily = dailySpec();
  const dailyDone = !!save.daily.done[daily.dateKey];
  const resumable = hasMeaningfulProgress(save.lastSession) ? save.lastSession : null;
  const level = save.journey.nextLevel;
  app.innerHTML = '';
  const el = h(`
    <div class="home">
      <div class="home__hero">${CAT_SVG}<span class="vs">VS</span>${DOG_SVG}</div>
      <div>
        <h1>Cats vs Dogs</h1>
        <p class="tagline">One cat, one dog, every row, column and color. Keep them apart.</p>
      </div>
      <div class="menu">
        ${resumable ? `<button class="btn btn--primary" data-act="resume"><span class="left"><span>Resume</span><span class="sub">${modeTitle(resumable.mode)}</span></span><span class="pill">›</span></button>` : ''}
        <button class="btn ${resumable ? '' : 'btn--primary'}" data-act="play">
          <span class="left"><span>Play</span><span class="sub">Level ${level}</span></span>
          <span class="pill">${levelSpec(level).size}×${levelSpec(level).size}</span>
        </button>
        <button class="btn" data-act="daily">
          <span class="left"><span>Daily Puzzle</span><span class="sub">${dailyDone ? 'Done today ✓' : daily.dateKey} · streak ${save.daily.streak}</span></span>
          <span class="pill">${daily.size}×${daily.size}</span>
        </button>
        <button class="btn" data-act="levels"><span class="left"><span>Levels</span><span class="sub">${level - 1} completed</span></span><span class="pill">›</span></button>
        <button class="btn btn--ghost" data-act="rules">How to play</button>
        <button class="btn btn--ghost" data-act="settings">Settings${removeAdsActive() ? ' · ad-free' : ''}</button>
      </div>
    </div>`);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'resume') resumeSaved();
    else if (act === 'play') startLevel(save.journey.nextLevel);
    else if (act === 'daily') startDaily();
    else if (act === 'levels') renderLevels();
    else if (act === 'rules') showRules();
    else if (act === 'settings') showSettings();
  });
  app.appendChild(el);
}

function renderLevels(): void {
  screenToken++;
  app.innerHTML = '';
  const level = save.journey.nextLevel;
  const total = Math.max(40, Math.ceil((level + 10) / 10) * 10);
  const cells: string[] = [];
  for (let i = 1; i <= total; i++) {
    const cls = i < level ? 'done' : i === level ? 'next' : 'locked';
    cells.push(`<button class="lvl ${cls}" data-level="${i}" ${cls === 'locked' ? 'disabled' : ''}>${i}</button>`);
  }
  const el = h(`
    <div class="game">
      <div class="topbar"><button class="icon-btn" data-act="home">‹</button><span class="title">Levels</span><span class="meta">${level - 1}/${total}</span></div>
      <div class="levels">${cells.join('')}</div>
    </div>`);
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-act="home"]')) return renderHome();
    const lv = (t.closest('[data-level]') as HTMLElement | null)?.dataset.level;
    if (lv) startLevel(Number(lv));
  });
  app.appendChild(el);
}

// ---------------------------------------------------------------- game
function startLevel(level: number): void {
  startMode({ kind: 'level', level });
}

function startDaily(): void {
  startMode({ kind: 'daily', dateKey: dailySpec().dateKey });
}

function startMode(m: ModeRef): void {
  const puzzle = puzzleFor(m);
  beginSession(m, new Session(puzzle, { hearts: rulesFor(m).hearts }));
}

function resumeSaved(): void {
  const r = resumeSession(save.lastSession);
  if (!r) {
    save.lastSession = null;
    persist();
    renderHome();
    return;
  }
  beginSession(r.mode, r.session);
  r.session.resume();
}

function beginSession(m: ModeRef, s: Session): void {
  mode = m;
  session = s;
  tool = CAT;
  renderGame(m.kind === 'daily' ? `Daily · ${m.dateKey}` : modeTitle(m));
  if (!save.onboarding.seenRules) showRules(true);
}

function renderGame(title: string): void {
  const token = ++screenToken;
  const alive = () => token === screenToken;
  const s = session!;
  const n = s.size;
  app.innerHTML = '';
  const el = h(`
    <div class="game">
      <div class="topbar">
        <button class="icon-btn" data-act="home">‹</button>
        <div style="text-align:center"><div class="title">${title}</div><div class="meta"><span data-timer>0:00</span> · ${n}×${n} · ${s.puzzle.difficulty}</div></div>
        <div class="hearts" data-hearts></div>
      </div>
      <div class="board-wrap"><div class="board" style="--n:${n}" data-board></div></div>
      <div class="toast" data-toast>Tap a cell to mark ✕, tap again to place the selected pet.</div>
      <div class="tools">
        <button class="tool" data-tool="cat">${CAT_SVG}<span>Cat</span></button>
        <button class="tool" data-tool="dog">${DOG_SVG}<span>Dog</span></button>
      </div>
      <div class="actions">
        <button class="action" data-act="undo">Undo<span class="k">last move</span></button>
        <button class="action" data-act="hint">Hint<span class="k">watch ad</span></button>
        <button class="action" data-act="rules">Rules<span class="k">how to play</span></button>
      </div>
    </div>`);
  app.appendChild(el);

  const board = el.querySelector('[data-board]') as HTMLElement;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const cell = h(`<button class="cell" data-r="${r}" data-c="${c}"></button>`);
      cell.style.background = `var(--r${s.puzzle.regions[r][c] % 10})`;
      if (c < n - 1 && s.puzzle.regions[r][c] !== s.puzzle.regions[r][c + 1]) cell.classList.add('bR');
      if (r < n - 1 && s.puzzle.regions[r][c] !== s.puzzle.regions[r + 1][c]) cell.classList.add('bB');
      board.appendChild(cell);
    }

  board.addEventListener('click', (e) => {
    const cell = (e.target as HTMLElement).closest('.cell') as HTMLElement | null;
    if (!cell || !session) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const res = session.tap(r, c, tool);
    if (res.wrong) {
      haptic('error');
      cell.classList.remove('shake');
      void cell.offsetWidth;
      cell.classList.add('shake');
      toast(`That's not where the ${tool === CAT ? 'cat' : 'dog'} goes. ${session.hearts} ${session.hearts === 1 ? 'heart' : 'hearts'} left.`);
    } else if (res.placed) {
      haptic('light');
      cell.classList.add('pop');
    } else if (res.marked) haptic('light');
    paint();
    saveActive();
    checkOutcome();
  });

  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-tool],[data-act]') as HTMLElement | null;
    if (!t || !session) return;
    if (t.dataset.tool) {
      tool = t.dataset.tool === 'cat' ? CAT : DOG;
      paint();
      return;
    }
    const act = t.dataset.act;
    if (act === 'home') {
      renderHome();
    } else if (act === 'undo') {
      if (session.undo()) {
        paint();
        saveActive();
      }
    } else if (act === 'hint') {
      void giveHint();
    } else if (act === 'rules') {
      showRules();
    }
  });

  paint();
  startTimer();

  function paint(): void {
    const s = session!;
    const dead = save.settings.autoMark ? s.deadCells() : null;
    board.querySelectorAll<HTMLElement>('.cell').forEach((cell) => {
      const r = Number(cell.dataset.r);
      const c = Number(cell.dataset.c);
      const v = s.cells[r][c];
      cell.classList.toggle('mark', v === MARK);
      cell.classList.toggle('given', s.givenMask[r][c]);
      cell.classList.toggle('dead', !!dead && dead[r][c]);
      const want = v === CAT ? CAT_SVG : v === DOG ? DOG_SVG : v === MARK ? MARK_SVG : '';
      if (cell.dataset.v !== String(v)) {
        cell.innerHTML = want;
        cell.dataset.v = String(v);
      }
    });
    el.querySelectorAll<HTMLElement>('.tool').forEach((b) => b.classList.toggle('active', (b.dataset.tool === 'cat') === (tool === CAT)));
    const hearts = el.querySelector('[data-hearts]')!;
    hearts.innerHTML = Array.from({ length: s.maxHearts }, (_, i) => HEART_SVG.replace('<svg', `<svg class="${i < s.hearts ? '' : 'off'}"`)).join('');
    (el.querySelector('[data-act="undo"]') as HTMLButtonElement).disabled = !s.canUndo();
  }

  function toast(msg: string): void {
    (el.querySelector('[data-toast]') as HTMLElement).textContent = msg;
  }

  async function giveHint(): Promise<void> {
    const s = session!;
    if (s.outcome !== 'playing') return;
    // Hints are free unless a rewarded network is live; the ad is always optional.
    if (ads.available && !removeAdsActive()) {
      s.pause();
      const ok = await ads.showRewarded('hint');
      if (!alive() || session !== s) return; // player left while the ad ran
      s.resume();
      if (!ok) return;
    }
    const hint = s.hint();
    if (!hint) return;
    const cell = board.querySelector(`.cell[data-r="${hint.r}"][data-c="${hint.c}"]`) as HTMLElement;
    cell.classList.add('glow');
    setTimeout(() => cell.classList.remove('glow'), 900);
    toast(hint.reason);
    paint();
    saveActive();
    checkOutcome();
  }

  function checkOutcome(): void {
    const s = session!;
    // claimOutcome() returns each win/loss once, so a double tap can't process it twice.
    const o = s.claimOutcome();
    if (o === 'won') onWin();
    else if (o === 'lost') onLose();
  }

  function onLose(): void {
    const s = session!;
    s.pause();
    stopTimer();
    save.stats.losses++;
    saveActive();
    haptic('error');
    const canRevive = rulesFor(mode!).revive && (removeAdsActive() || ads.available);
    const sheet = h(`
      <div class="sheet">
        <div class="big">💔</div>
        <h2>Out of hearts</h2>
        <p>Three wrong placements. ${canRevive ? 'Refill your hearts and keep this board, or start over.' : 'Start this board over and try a new line of logic.'}</p>
        ${canRevive ? `<button class="btn btn--primary" data-act="revive"><span>Refill hearts</span><span class="pill">${removeAdsActive() ? 'free' : '▶ ad'}</span></button>` : ''}
        <button class="btn" data-act="restart"><span>Restart board</span></button>
        <button class="btn btn--ghost" data-act="home">Home</button>
      </div>`);
    const ov = overlay(sheet);
    sheet.addEventListener('click', async (e) => {
      const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (!act) return;
      if (act === 'revive') {
        const ok = removeAdsActive() ? true : await ads.showRewarded('revive');
        if (!alive() || session !== s) return;
        if (ok) {
          ov.remove();
          s.revive();
          s.resume();
          startTimer();
          paint();
        }
      } else if (act === 'restart') {
        ov.remove();
        save.lastSession = null;
        persist();
        startMode(mode!);
      } else {
        ov.remove();
        renderHome();
      }
    });
  }

  function onWin(): void {
    const s = session!;
    const m = mode!;
    s.pause();
    stopTimer();
    haptic('success');
    const secs = s.elapsedSeconds();
    save.lastSession = null;
    let nextLabel = 'Next level';
    const key = m.kind === 'level' ? `L${m.level}` : m.kind === 'daily' ? `D${m.dateKey}` : '';
    const bestMap = m.kind === 'daily' ? save.daily.bestTimes : save.journey.bestTimes;
    const prevBest = key ? bestMap[key] : undefined;
    const isBest = !!key && (prevBest === undefined || secs < prevBest);
    if (isBest) bestMap[key] = secs;
    if (m.kind === 'level') {
      if (m.level >= save.journey.nextLevel) save.journey.nextLevel = m.level + 1;
    } else if (m.kind === 'daily') {
      nextLabel = 'Back home';
      if (!save.daily.done[m.dateKey]) {
        save.daily.done[m.dateKey] = { at: new Date().toISOString(), seconds: secs, mistakes: s.mistakes };
        // Yesterday relative to the puzzle's own date, so a board finished after midnight still counts.
        save.daily.streak = save.daily.lastDate === prevDateKey(m.dateKey) ? save.daily.streak + 1 : 1;
        save.daily.bestStreak = Math.max(save.daily.bestStreak, save.daily.streak);
        save.daily.lastDate = m.dateKey;
      }
    } else {
      nextLabel = 'Back home';
    }
    save.stats.solved++;
    if (s.mistakes === 0) save.stats.clean++;
    if (s.hintsUsed === 0) save.stats.hintFree++;
    persist();
    adCadence.boardsSinceLast++;

    // Celebration first. An interstitial may follow only after the player taps through.
    const sheet = h(`
      <div class="sheet">
        <div class="big">🎉</div>
        <h2>Peace restored!</h2>
        <div class="stats">
          <div><div class="v">${fmt(secs)}</div><div class="k">time${isBest ? ' · best!' : ''}</div></div>
          <div><div class="v">${s.mistakes}</div><div class="k">mistakes</div></div>
          <div><div class="v">${s.hintsUsed}</div><div class="k">hints</div></div>
        </div>
        ${m.kind === 'daily' ? `<p style="text-align:center">🔥 Streak: <b>${save.daily.streak}</b></p>` : ''}
        <button class="btn btn--primary" data-act="next"><span>${nextLabel}</span><span class="pill">›</span></button>
        <button class="btn" data-act="share"><span>Share result</span></button>
        <button class="btn btn--ghost" data-act="home">Home</button>
      </div>`);
    const ov = overlay(sheet);
    let leaving = false;
    sheet.addEventListener('click', async (e) => {
      const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (!act || leaving) return;
      if (act === 'share') {
        const text = `Cats vs Dogs ${m.kind === 'daily' ? m.dateKey : modeTitle(m)} — ${fmt(secs)} ${s.mistakes === 0 ? 'no mistakes!' : ''}`;
        try {
          if (navigator.share) await navigator.share({ text });
          else await navigator.clipboard.writeText(text);
        } catch {
          /* user cancelled */
        }
        return;
      }
      leaving = true;
      ov.remove();
      await maybeInterstitial(m);
      const next = nextAfterWin(m);
      if (act === 'next' && typeof next === 'object') startMode(next);
      else renderHome();
    });
  }
}

async function maybeInterstitial(m: ModeRef): Promise<void> {
  const today = localDateKey();
  if (adCadence.day !== today) {
    adCadence.day = today;
    adCadence.shownToday = 0;
  }
  const ok = ads.available && shouldShowInterstitial(
    { removeAds: removeAdsActive(), levelsCompleted: save.journey.nextLevel - 1, boardsSinceLast: adCadence.boardsSinceLast, lastShownAt: adCadence.lastShownAt, shownToday: adCadence.shownToday },
    { mode: m.kind, outcome: 'won', now: Date.now() },
  );
  if (!ok) return;
  if (await ads.showInterstitial()) {
    adCadence.boardsSinceLast = 0;
    adCadence.lastShownAt = Date.now();
    adCadence.shownToday++;
  }
}

function startTimer(): void {
  stopTimer();
  timerHandle = window.setInterval(() => {
    const t = document.querySelector('[data-timer]');
    if (t && session) t.textContent = fmt(session.elapsedSeconds());
  }, 500);
}
function stopTimer(): void {
  if (timerHandle !== null) {
    clearInterval(timerHandle);
    timerHandle = null;
  }
}

// ---------------------------------------------------------------- sheets
function showRules(firstRun = false): void {
  session?.pause();
  const sheet = h(`
    <div class="sheet">
      <h2>How to play</h2>
      <div class="rules">
        <div class="rule"><div class="num">1</div><div>Every <b>row</b>, every <b>column</b> and every <b>color</b> gets exactly <b>one cat and one dog</b>.</div></div>
        <div class="rule"><div class="num">2</div><div>A cat and a dog <b>never sit side by side</b>. Diagonal is fine — they can glare, not fight.</div></div>
        <div class="rule"><div class="num">3</div><div>Pets marked <b>zz</b> are already home. Tap a cell to mark ✕ (nothing here), tap again to place the selected pet. Three wrong placements and you're out of hearts.</div></div>
      </div>
      <p>Every board has exactly one answer, and you never have to guess. Faint dots show cells no pet can use.</p>
      <button class="btn btn--primary" data-act="ok"><span>${firstRun ? "Let's go" : 'Got it'}</span></button>
    </div>`);
  const ov = overlay(sheet);
  sheet.querySelector('[data-act="ok"]')!.addEventListener('click', () => {
    ov.remove();
    save.onboarding.seenRules = true;
    persist();
    session?.resume();
  });
}

function showSettings(): void {
  const sheet = h(`
    <div class="sheet">
      <h2>Settings</h2>
      <label class="switch"><span>Auto-mark dead cells</span><input type="checkbox" data-s="autoMark" ${save.settings.autoMark ? 'checked' : ''}></label>
      <label class="switch"><span>Haptics</span><input type="checkbox" data-s="haptics" ${save.settings.haptics ? 'checked' : ''}></label>
      <div style="height:6px"></div>
      ${
        removeAdsActive()
          ? `<p>✓ Ads removed. Thank you for supporting the game!</p>`
          : iap.available
            ? `<button class="btn btn--primary" data-act="buy"><span class="left"><span>Remove ads</span><span class="sub">${iap.isStub ? 'Dev store — test purchase only' : 'One-time purchase'}</span></span></button>
             <button class="btn btn--ghost" data-act="restore">Restore purchase</button>`
            : `<p>Purchases aren't available in this build yet.</p>`
      }
      <button class="btn btn--ghost" data-act="reset" data-armed="0">Reset progress</button>
      <button class="btn" data-act="close"><span>Done</span></button>
    </div>`);
  const ov = overlay(sheet);
  sheet.addEventListener('change', (e) => {
    const inp = e.target as HTMLInputElement;
    const key = inp.dataset.s as 'autoMark' | 'haptics' | undefined;
    if (!key) return;
    save.settings[key] = inp.checked;
    persist();
  });
  sheet.addEventListener('click', async (e) => {
    const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
    if (!act) return;
    if (act === 'buy') {
      const res = await iap.purchase('remove_ads');
      if (res.ok) {
        save.purchases.removeAds = { active: true, source: res.source, verifiedAt: new Date().toISOString() };
        persist();
        ov.remove();
        renderHome();
      }
    } else if (act === 'restore') {
      const res = await iap.restore();
      if (res.ok && res.owned.includes('remove_ads') && res.source) {
        save.purchases.removeAds = { active: true, source: res.source, verifiedAt: new Date().toISOString() };
        persist();
      }
      ov.remove();
      renderHome();
    } else if (act === 'reset') {
      const btn = (e.target as HTMLElement).closest('[data-act="reset"]') as HTMLElement;
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = 'Tap again to erase all progress';
        return;
      }
      // Removes only this app's keys and keeps purchases; other data on the origin is untouched.
      save = resetProgress(save);
      ov.remove();
      renderHome();
    } else ov.remove();
  });
}

// Pause the timer and save the board when the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.hidden) {
    session.pause();
    saveActive();
  } else if (!document.querySelector('.overlay')) session.resume();
});
window.addEventListener('pagehide', () => saveActive());

renderHome();

// Silence unused-import warnings for constants referenced only in templates.
void EMPTY;
void DOG;
