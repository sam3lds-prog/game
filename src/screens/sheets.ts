/** Shared sheets: rules and settings. */
import type { AppContext } from '../app/context';
import type { Scope } from '../app/scope';
import { openSheet, type SheetHandle } from '../ui/sheet';
import { clearGameData, type Settings } from '../services/storage';
import { hasEntitlement } from '../services/iap';
import { BRAND } from '../brand';
import { esc } from '../app/dom';

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

function purchasesBlock(ctx: AppContext): string {
  if (!ctx.purchases.available()) return '';
  if (hasEntitlement('remove_ads')) return `<p class="fine" data-purchase-status>Ads removed. Thank you for supporting the game.</p><button class="btn btn--ghost" data-act="restore">Restore purchases</button>`;
  const price = ctx.purchases.provider.price('remove_ads');
  return `
    <button class="btn" data-act="buy"><span class="left"><span>Remove ads</span><span class="sub">One-time purchase. Hints and Zen stay free.</span></span>${price ? `<span class="pill">${esc(price)}</span>` : ''}</button>
    <button class="btn btn--ghost" data-act="restore">Restore purchases</button>
    <p class="fine" data-purchase-status role="status"></p>`;
}

function reminderBlock(ctx: AppContext): string {
  if (!ctx.reminders.available()) return '';
  const r = ctx.settings.reminder;
  const time = `${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')}`;
  return `
    <label class="switch" for="set-reminder"><span>Daily reminder (quiet)</span><input id="set-reminder" type="checkbox" data-reminder="enabled" ${r.enabled ? 'checked' : ''}></label>
    <label class="switch" for="set-reminder-time"><span>Reminder time</span><input id="set-reminder-time" type="time" data-reminder="time" value="${time}"></label>
    <p class="fine" data-reminder-status role="status"></p>`;
}

export function showPrivacy(scope: Scope): SheetHandle {
  return openSheet(
    scope,
    `
      <h2>Privacy</h2>
      <p>${esc(BRAND.name)} works offline. Your progress stays on this device (and in your device backup).</p>
      <p>No account, no ads tracking, no personal data. If you turn on “Share anonymous gameplay stats”, the app records events like “level 12 solved in 3:10 with 1 hint” with a random install id, to improve puzzles. Turning it off deletes that id and the stored events.</p>
      <p class="fine">Full policy: ${esc(BRAND.privacyUrl)}</p>
      <button class="btn btn--primary" data-act="close"><span>Done</span></button>`,
    (act, _el, sh) => {
      if (act === 'close') sh.close();
    },
    { label: 'Privacy' },
  );
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
      ${reminderBlock(ctx)}
      <label class="switch" for="set-analytics"><span>Share anonymous gameplay stats</span><input id="set-analytics" type="checkbox" data-consent="analytics" ${ctx.analytics.consent ? 'checked' : ''}></label>
      <button class="btn btn--ghost" data-act="privacy">Privacy</button>
      ${purchasesBlock(ctx)}
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
      } else if (act === 'privacy') showPrivacy(sh.scope);
      else if (act === 'buy') void buy(sh.el);
      else if (act === 'restore') void restore(sh.el);
      else if (act === 'close') sh.close();
    },
    { label: 'Settings', onClose },
  );
  const purchaseStatus = (root: HTMLElement, msg: string) => {
    const el = root.querySelector('[data-purchase-status]');
    if (el) el.textContent = msg;
  };
  const buy = async (root: HTMLElement) => {
    purchaseStatus(root, 'Contacting the App Store…');
    const r = await ctx.purchases.buy('remove_ads');
    if (!sheet.open) return;
    purchaseStatus(
      root,
      r.status === 'purchased'
        ? 'Ads removed. Thank you!'
        : r.status === 'cancelled'
          ? 'Purchase cancelled. Nothing was charged.'
          : r.status === 'pending'
            ? 'Purchase pending approval. Ads will turn off once it completes.'
            : `Purchase didn’t go through: ${r.message} Try again later.`,
    );
  };
  const restore = async (root: HTMLElement) => {
    purchaseStatus(root, 'Checking your purchases…');
    const n = await ctx.purchases.restore();
    if (sheet.open) purchaseStatus(root, n ? 'Purchases restored.' : 'No previous purchases found for this Apple ID.');
  };
  sheet.scope.listen(sheet.el, 'change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.dataset.consent === 'analytics') {
      ctx.analytics.setConsent(input.checked);
      return;
    }
    if (input.dataset.reminder) {
      const r = { ...ctx.settings.reminder };
      if (input.dataset.reminder === 'enabled') r.enabled = input.checked;
      else {
        const [hh, mm] = input.value.split(':').map(Number);
        if (Number.isFinite(hh) && Number.isFinite(mm)) {
          r.hour = hh;
          r.minute = mm;
        }
      }
      ctx.settings.reminder = r;
      ctx.saveSettings();
      const status = sheet.el.querySelector('[data-reminder-status]');
      void (async () => {
        if (!r.enabled) {
          await ctx.reminders.cancel();
          if (status) status.textContent = 'Reminder off.';
          return;
        }
        const ok = await ctx.reminders.schedule(r.hour, r.minute);
        if (!ok) {
          ctx.settings.reminder = { ...r, enabled: false };
          ctx.saveSettings();
          const box = sheet.el.querySelector<HTMLInputElement>('[data-reminder="enabled"]');
          if (box) box.checked = false;
        }
        if (status) status.textContent = ok ? `Reminder set for ${String(r.hour).padStart(2, '0')}:${String(r.minute).padStart(2, '0')} every day.` : 'Notifications are turned off for this app in iOS Settings.';
      })();
      return;
    }
    const key = input.dataset.setting as 'autoMark' | 'haptics' | 'sound' | 'patterns' | 'counters' | undefined;
    if (!key) return;
    ctx.settings[key] = input.checked;
    ctx.saveSettings();
  });
  return sheet;
}
