import './style.css';
import { generatePuzzle } from './engine/generator';
import { dailySpec, levelSpec } from './engine/levels';
import { CAT, DOG, EMPTY, type Puzzle, type Species } from './engine/types';
import { MARK, Session } from './game/session';
import { CAT_SVG, DOG_SVG, HEART_SVG, MARK_SVG } from './game/icons';
import { loadProgress, saveProgress, type Progress } from './services/storage';
import { ads } from './services/ads';
import { iap } from './services/iap';

type Mode = { kind: 'level'; level: number } | { kind: 'daily'; dateKey: string };

const app = document.getElementById('app')!;
let progress: Progress = loadProgress();
let session: Session | null = null;
let mode: Mode | null = null;
let tool: Species = CAT;
let timerHandle: number | null = null;

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
  if (!progress.settings.haptics) return;
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
  stopTimer();
  session = null;
  const daily = dailySpec();
  const dailyDone = !!progress.dailyDone[daily.dateKey];
  app.innerHTML = '';
  const el = h(`
    <div class="home">
      <div class="home__hero">${CAT_SVG}<span class="vs">VS</span>${DOG_SVG}</div>
      <div>
        <h1>Cats vs Dogs</h1>
        <p class="tagline">One cat, one dog, every row, column and color. Keep them apart.</p>
      </div>
      <div class="menu">
        <button class="btn btn--primary" data-act="play">
          <span class="left"><span>Play</span><span class="sub">Level ${progress.level}</span></span>
          <span class="pill">${levelSpec(progress.level).size}×${levelSpec(progress.level).size}</span>
        </button>
        <button class="btn" data-act="daily">
          <span class="left"><span>Daily Puzzle</span><span class="sub">${dailyDone ? 'Done today ✓' : daily.dateKey} · streak ${progress.streak}</span></span>
          <span class="pill">${daily.size}×${daily.size}</span>
        </button>
        <button class="btn" data-act="levels"><span class="left"><span>Levels</span><span class="sub">${progress.level - 1} completed</span></span><span class="pill">›</span></button>
        <button class="btn btn--ghost" data-act="rules">How to play</button>
        <button class="btn btn--ghost" data-act="settings">Settings${progress.removeAds ? ' · ad-free' : ''}</button>
      </div>
    </div>`);
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'play') startLevel(progress.level);
    else if (act === 'daily') startDaily();
    else if (act === 'levels') renderLevels();
    else if (act === 'rules') showRules();
    else if (act === 'settings') showSettings();
  });
  app.appendChild(el);
}

function renderLevels(): void {
  app.innerHTML = '';
  const total = Math.max(40, Math.ceil((progress.level + 10) / 10) * 10);
  const cells: string[] = [];
  for (let i = 1; i <= total; i++) {
    const cls = i < progress.level ? 'done' : i === progress.level ? 'next' : 'locked';
    cells.push(`<button class="lvl ${cls}" data-level="${i}" ${cls === 'locked' ? 'disabled' : ''}>${i}</button>`);
  }
  const el = h(`
    <div class="game">
      <div class="topbar"><button class="icon-btn" data-act="home">‹</button><span class="title">Levels</span><span class="meta">${progress.level - 1}/${total}</span></div>
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
  const spec = levelSpec(level);
  const puzzle = generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
  mode = { kind: 'level', level };
  beginSession(puzzle, `Level ${level}`);
}

function startDaily(): void {
  const spec = dailySpec();
  const puzzle = generatePuzzle({ size: spec.size, seed: spec.seed, difficulty: spec.difficulty });
  mode = { kind: 'daily', dateKey: spec.dateKey };
  beginSession(puzzle, `Daily · ${spec.dateKey}`);
}

function beginSession(puzzle: Puzzle, title: string): void {
  session = new Session(puzzle);
  tool = CAT;
  renderGame(title);
  if (!localStorage.getItem('cvd.seenRules')) {
    showRules(true);
  }
}

function renderGame(title: string): void {
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
      if (session.undo()) paint();
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
    const dead = progress.settings.autoMark ? s.deadCells() : null;
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
    s.pause();
    const ok = progress.removeAds ? true : await ads.showRewarded('hint', progress);
    s.resume();
    if (!ok) return;
    const hint = s.hint();
    if (!hint) return;
    const cell = board.querySelector(`.cell[data-r="${hint.r}"][data-c="${hint.c}"]`) as HTMLElement;
    cell.classList.add('glow');
    setTimeout(() => cell.classList.remove('glow'), 900);
    toast(hint.reason);
    paint();
    checkOutcome();
  }

  function checkOutcome(): void {
    const s = session!;
    if (s.outcome === 'won') void onWin();
    else if (s.outcome === 'lost') onLose();
  }

  function onLose(): void {
    const s = session!;
    s.pause();
    stopTimer();
    haptic('error');
    const sheet = h(`
      <div class="sheet">
        <div class="big">💔</div>
        <h2>Out of hearts</h2>
        <p>Three wrong placements. Watch a short ad to refill your hearts and keep this board, or start over.</p>
        <button class="btn btn--primary" data-act="revive"><span>Refill hearts</span><span class="pill">▶ ad</span></button>
        <button class="btn" data-act="restart"><span>Restart board</span></button>
        <button class="btn btn--ghost" data-act="home">Home</button>
      </div>`);
    const ov = overlay(sheet);
    sheet.addEventListener('click', async (e) => {
      const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (!act) return;
      if (act === 'revive') {
        const ok = progress.removeAds ? true : await ads.showRewarded('revive', progress);
        if (ok) {
          ov.remove();
          s.revive();
          s.resume();
          startTimer();
          paint();
        }
      } else if (act === 'restart') {
        ov.remove();
        if (mode?.kind === 'level') startLevel(mode.level);
        else startDaily();
      } else {
        ov.remove();
        renderHome();
      }
    });
  }

  async function onWin(): Promise<void> {
    const s = session!;
    s.pause();
    stopTimer();
    haptic('success');
    const secs = s.elapsedSeconds();
    let key = '';
    let nextLabel = 'Next level';
    if (mode?.kind === 'level') {
      key = `L${mode.level}`;
      if (mode.level >= progress.level) progress.level = mode.level + 1;
    } else if (mode?.kind === 'daily') {
      key = `D${mode.dateKey}`;
      nextLabel = 'Back home';
      if (!progress.dailyDone[mode.dateKey]) {
        progress.dailyDone[mode.dateKey] = true;
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
        progress.streak = progress.lastDailyDate === yKey ? progress.streak + 1 : 1;
        progress.lastDailyDate = mode.dateKey;
      }
    }
    const best = progress.bestTimes[key];
    const isBest = best === undefined || secs < best;
    if (isBest) progress.bestTimes[key] = secs;
    saveProgress(progress);

    // Interstitial first (the category's main revenue lever), then the celebration.
    await ads.maybeShowInterstitial(progress);

    const sheet = h(`
      <div class="sheet">
        <div class="big">🎉</div>
        <h2>Peace restored!</h2>
        <div class="stats">
          <div><div class="v">${fmt(secs)}</div><div class="k">time${isBest ? ' · best!' : ''}</div></div>
          <div><div class="v">${s.mistakes}</div><div class="k">mistakes</div></div>
          <div><div class="v">${s.hintsUsed}</div><div class="k">hints</div></div>
        </div>
        ${mode?.kind === 'daily' ? `<p style="text-align:center">🔥 Streak: <b>${progress.streak}</b></p>` : ''}
        <button class="btn btn--primary" data-act="next"><span>${nextLabel}</span><span class="pill">›</span></button>
        <button class="btn" data-act="share"><span>Share result</span></button>
        <button class="btn btn--ghost" data-act="home">Home</button>
      </div>`);
    const ov = overlay(sheet);
    sheet.addEventListener('click', async (e) => {
      const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
      if (!act) return;
      if (act === 'next') {
        ov.remove();
        if (mode?.kind === 'level') startLevel(mode.level);
        else renderHome();
      } else if (act === 'share') {
        const text = `Cats vs Dogs ${mode?.kind === 'daily' ? mode.dateKey : 'Level ' + (mode as { level: number }).level} — ${fmt(secs)} ${'🐱'.repeat(Math.min(5, s.size - 4))}${'🐶'.repeat(Math.min(5, s.size - 4))} ${s.mistakes === 0 ? 'no mistakes!' : ''}`;
        try {
          if (navigator.share) await navigator.share({ text });
          else await navigator.clipboard.writeText(text);
        } catch {
          /* user cancelled */
        }
      } else {
        ov.remove();
        renderHome();
      }
    });
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
    try {
      localStorage.setItem('cvd.seenRules', '1');
    } catch {
      /* ignore */
    }
    session?.resume();
  });
}

function showSettings(): void {
  const sheet = h(`
    <div class="sheet">
      <h2>Settings</h2>
      <label class="switch"><span>Auto-mark dead cells</span><input type="checkbox" data-s="autoMark" ${progress.settings.autoMark ? 'checked' : ''}></label>
      <label class="switch"><span>Haptics</span><input type="checkbox" data-s="haptics" ${progress.settings.haptics ? 'checked' : ''}></label>
      <div style="height:6px"></div>
      ${
        progress.removeAds
          ? `<p>✓ Ads removed. Thank you for supporting the game!</p>`
          : `<button class="btn btn--primary" data-act="buy"><span class="left"><span>Remove ads</span><span class="sub">One-time purchase · keeps rewarded hints optional</span></span><span class="pill">$3.99</span></button>
             <button class="btn btn--ghost" data-act="restore">Restore purchase</button>`
      }
      <button class="btn btn--ghost" data-act="reset" data-armed="0">Reset progress</button>
      <button class="btn" data-act="close"><span>Done</span></button>
    </div>`);
  const ov = overlay(sheet);
  sheet.addEventListener('change', (e) => {
    const inp = e.target as HTMLInputElement;
    const key = inp.dataset.s as 'autoMark' | 'haptics' | undefined;
    if (!key) return;
    progress.settings[key] = inp.checked;
    saveProgress(progress);
  });
  sheet.addEventListener('click', async (e) => {
    const act = ((e.target as HTMLElement).closest('[data-act]') as HTMLElement | null)?.dataset.act;
    if (!act) return;
    if (act === 'buy') {
      if (await iap.purchaseRemoveAds()) {
        progress.removeAds = true;
        saveProgress(progress);
        ov.remove();
        renderHome();
      }
    } else if (act === 'restore') {
      if (await iap.restore()) {
        progress.removeAds = true;
        saveProgress(progress);
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
      const keep = progress.removeAds;
      try {
        localStorage.clear();
      } catch {
        /* ignore */
      }
      progress = loadProgress();
      progress.removeAds = keep;
      saveProgress(progress);
      ov.remove();
      renderHome();
    } else ov.remove();
  });
}

// Pause the timer when the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (!session) return;
  if (document.hidden) session.pause();
  else session.resume();
});

renderHome();

// Silence unused-import warnings for constants referenced only in templates.
void EMPTY;
void DOG;
