/** Tiny DOM helpers. All dynamic text goes through esc(). */

export function h<T extends HTMLElement = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export function esc(s: string | number): string {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Finds the closest [data-act] ancestor of an event target and returns its action name. */
export function actionOf(e: Event): { act: string; el: HTMLElement } | null {
  const el = (e.target as HTMLElement | null)?.closest?.('[data-act]') as HTMLElement | null;
  return el?.dataset.act ? { act: el.dataset.act, el } : null;
}
