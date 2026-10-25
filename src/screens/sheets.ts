/** Shared sheets: rules and settings. */
import type { AppContext } from '../app/context';
import type { Scope } from '../app/scope';
import { openSheet, type SheetHandle } from '../ui/sheet';
import { clearGameData, type Settings } from '../services/storage';

export function showRules(scope: Scope, ctx: AppContext, onClose?: () => void): SheetHandle {
  return openSheet(
    scope,
    `
      <h2>Rules</h2>
      <div class="rules">
        <div class="rule"><div class="num">1</div><div>Every <b>row</b>, every <b>column</b> and every <b>color</b> gets exactly <b>one cat and one dog</b>.</div></div>
        <div class="rule"><div class="num">2</div><div>A cat and a dog <b>never sit side by side</b>. Touching corners (diagonal) is fine.</div></div>
        <div class="rule"><div class="num">3</div><div>Pets with a <b>house badge</b> are fixed. Pick Cat, Dog or Empty (✕) below the board, then tap a cell. Hold a pet to give it a pat.</div></div>
      </div>
      <p>Every board has exactly one answer, and you never need to guess. Faint dots show cells no pet can use; the pips beside each row and column show which pets it still needs.</p>
      <button class="btn btn--primary" data-act="ok"><span>Got it</span></button>`,
    (act, _el, sheet) => {
      if (act === 'ok') {
        ctx.flags.seenRules = true;
        ctx.saveFlags();
        sheet.close();
      }
    },
    { label: 'Rules', onClose },
  );
}

type Choice<K extends keyof Settings> = { key: K; label: string; options: Array<[Settings[K], string]> };

function segmented<K extends keyof Settings>(s: Settings, c: Choice<K>): string {
  return `
    <div class="field">
      <span class="field__label" id="lbl-${String(c.key)}">${c.label}</span>
      <div class="segmented" role="radiogroup" aria-labelledby="lbl-${String(c.key)}">
        ${c.options.map(([v, t]) => `<button role="radio" data-act="choose" data-key="${String(c.key)}" data-value="${String(v)}" aria-checked="${s[c.key] === v}">${t}</button>`).join('')}
      </div>
    </div>`;
}

function toggle(s: Settings, key: keyof Settings, label: string): string {
  return `<label class="switch" for="set-${key}"><span>${label}</span><input id="set-${key}" type="checkbox" data-setting="${key}" ${s[key] ? 'checked' : ''}></label>`;
}

export function showSettings(scope: Scope, ctx: AppContext, afterReset: () => void, onClose?: () => void): SheetHandle {
  const s = ctx.settings;
  const sheet = openSheet(
    scope,
    `
      <h2>Settings</h2>
      ${segmented(s, { key: 'defaultMode', label: 'Mode for new boards', options: [['zen', 'Zen'], ['challenge', 'Challenge']] })}
      ${segmented(s, { key: 'inputMode', label: 'Tapping a cell', options: [['direct', 'Place selected'], ['cycle', 'Tap ✕, then pet']] })}
      ${segmented(s, { key: 'faces', label: 'Animal expressions', options: [['on', 'On'], ['minimal', 'Minimal'], ['off', 'Off']] })}
      ${segmented(s, { key: 'theme', label: 'Appearance', options: [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] })}
      ${toggle(s, 'counters', 'Show row, column and color pips')}
      ${toggle(s, 'autoMark', 'Show dots on cells no pet can use')}
      ${toggle(s, 'patterns', 'Region patterns (color-blind friendly)')}
      ${toggle(s, 'sound', 'Sound')}
      ${toggle(s, 'haptics', 'Haptics')}
      <button class="btn btn--ghost" data-act="reset" data-armed="0">Reset progress</button>
      <button class="btn" data-act="close"><span>Done</span></button>`,
    (act, el, sh) => {
      if (act === 'choose') {
        const key = el.dataset.key as keyof Settings;
        const raw = el.dataset.value!;
        (ctx.settings as unknown as Record<string, unknown>)[key] = raw;
        ctx.saveSettings();
        if (key === 'theme') ctx.applyAppearance();
        sh.el.querySelectorAll<HTMLElement>(`[data-act="choose"][data-key="${key}"]`).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === raw)));
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
    const key = input.dataset.setting as 'autoMark' | 'haptics' | 'sound' | 'patterns' | 'counters' | undefined;
    if (!key) return;
    ctx.settings[key] = input.checked;
    ctx.saveSettings();
  });
  return sheet;
}
