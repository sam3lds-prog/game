/**
 * Modal sheets. Static: no entrance animation. A sheet belongs to a Scope — when its screen
 * unmounts, the sheet is removed and its handlers are gone.
 */
import { Scope } from '../app/scope';
import { actionOf, h } from '../app/dom';

export interface SheetHandle {
  el: HTMLElement;
  scope: Scope;
  close(): void;
  readonly open: boolean;
}

export function openSheet(parent: Scope, html: string, onAction: (act: string, el: HTMLElement, sheet: SheetHandle) => void, opts: { label?: string; onClose?: () => void } = {}): SheetHandle {
  const scope = new Scope();
  const overlay = h(`<div class="overlay" role="dialog" aria-modal="true"${opts.label ? ` aria-label="${opts.label}"` : ''}><div class="sheet">${html}</div></div>`);
  document.body.appendChild(overlay);
  let isOpen = true;
  const handle: SheetHandle = {
    el: overlay.querySelector('.sheet') as HTMLElement,
    scope,
    get open() {
      return isOpen;
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      scope.dispose();
      overlay.remove();
      opts.onClose?.();
    },
  };
  scope.listen(overlay, 'click', (e) => {
    const a = actionOf(e);
    if (a) onAction(a.act, a.el, handle);
  });
  parent.add(() => handle.close());
  // Focus the first control for keyboard and VoiceOver users.
  (overlay.querySelector('button, [href], input') as HTMLElement | null)?.focus({ preventScroll: true });
  return handle;
}
