/**
 * A Scope owns every timer, listener and pending async callback created by one screen or sheet.
 * dispose() cancels all of them, so nothing outlives the screen that started it.
 */
export class Scope {
  private cleanups: Array<() => void> = [];
  private _alive = true;

  get alive(): boolean {
    return this._alive;
  }

  timeout(fn: () => void, ms: number): number {
    const id = window.setTimeout(() => {
      if (this._alive) fn();
    }, ms);
    this.cleanups.push(() => clearTimeout(id));
    return id;
  }

  interval(fn: () => void, ms: number): number {
    const id = window.setInterval(() => {
      if (this._alive) fn();
    }, ms);
    this.cleanups.push(() => clearInterval(id));
    return id;
  }

  listen<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    const wrapped = (e: Event) => {
      if (this._alive) fn(e);
    };
    target.addEventListener(type, wrapped, opts);
    this.cleanups.push(() => target.removeEventListener(type, wrapped, opts));
  }

  /** Register any extra cleanup (e.g. a child controller's dispose). */
  add(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  /** Awaits a promise but resolves to `undefined` if the scope died meanwhile — callers bail out. */
  async guard<T>(p: Promise<T>): Promise<T | undefined> {
    const v = await p;
    return this._alive ? v : undefined;
  }

  dispose(): void {
    if (!this._alive) return;
    this._alive = false;
    const list = this.cleanups.splice(0).reverse();
    for (const c of list) {
      try {
        c();
      } catch {
        /* keep disposing */
      }
    }
  }
}
