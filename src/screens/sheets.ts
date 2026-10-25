/** Shared sheets: rules and settings. */
import type { AppContext } from '../app/context';
import type { Scope } from '../app/scope';
import { openSheet, type SheetHandle } from '../ui/sheet';
import { clearGameData } from '../services/storage';

export function showRules(scope: Scope, ctx: AppContext, onClose?: () => void): SheetHandle {
  return openSheet(
    scope,
    `
      <h2>How to play</h2>
      <div class="rules">
        <div class="rule"><div class="num">1</div><div>Every <b>row</b>, every <b>column</b> and every <b>color</b> gets exactly <b>one cat and one dog</b>.</div></div>
        <div class="rule"><div class="num">2</div><div>A cat and a dog <b>never sit side by side</b>. Touching corners (diagonal) is fine.</div></div>
        <div class="rule"><div class="num">3</div><div>Pets with a <b>home badge</b> are fixed. Pick Cat, Dog or ✕ below the board, then tap a cell.</div></div>
      </div>
      <p>Every board has exactly one answer, and you never need to guess. Faint dots show cells no pet can use.</p>
      <button class="btn btn--primary" data-act="ok"><span>Got it</span></button>`,
    (act, _el, sheet) => {
      if (act === 'ok') {
        ctx.flags.seenRules = true;
        ctx.saveFlags();
        sheet.close();
      }
    },
    { label: 'How to play', onClose },
  );
}

export function showSettings(scope: Scope, ctx: AppContext, afterReset: () => void, onClose?: () => void): SheetHandle {
  const s = ctx.settings;
  const sheet = openSheet(
    scope,
    `
      <h2>Settings</h2>
      <div class="field">
        <span class="field__label" id="lbl-input">Tapping a cell</span>
        <div class="segmented" role="radiogroup" aria-labelledby="lbl-input">
          <button role="radio" data-act="input" data-value="cycle" aria-checked="${s.inputMode === 'cycle'}">Tap ✕ then pet</button>
          <button role="radio" data-act="input" data-value="direct" aria-checked="${s.inputMode === 'direct'}">Place selected</button>
        </div>
      </div>
      <label class="switch" for="set-automark"><span>Show dots on cells no pet can use</span><input id="set-automark" type="checkbox" data-setting="autoMark" ${s.autoMark ? 'checked' : ''}></label>
      <label class="switch" for="set-haptics"><span>Haptics</span><input id="set-haptics" type="checkbox" data-setting="haptics" ${s.haptics ? 'checked' : ''}></label>
      <button class="btn btn--ghost" data-act="reset" data-armed="0">Reset progress</button>
      <button class="btn" data-act="close"><span>Done</span></button>`,
    (act, el, sh) => {
      if (act === 'input') {
        ctx.settings.inputMode = el.dataset.value === 'direct' ? 'direct' : 'cycle';
        ctx.saveSettings();
        sh.el.querySelectorAll('[data-act="input"]').forEach((b) => b.setAttribute('aria-checked', String((b as HTMLElement).dataset.value === ctx.settings.inputMode)));
      } else if (act === 'reset') {
        if (el.dataset.armed !== '1') {
          el.dataset.armed = '1';
          el.textContent = 'Tap again to erase all progress';
          return;
        }
        clearGameData();
        ctx.reload();
        sh.close();
        afterReset();
      } else if (act === 'close') sh.close();
    },
    { label: 'Settings', onClose },
  );
  sheet.scope.listen(sheet.el, 'change', (e) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.setting as 'autoMark' | 'haptics' | undefined;
    if (!key) return;
    ctx.settings[key] = input.checked;
    ctx.saveSettings();
  });
  return sheet;
}
