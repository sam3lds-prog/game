/** Collectible coats: recolors of the same cat and dog. Cosmetic only. */
import type { AppContext, Screen } from '../app/context';
import { Scope } from '../app/scope';
import { actionOf, esc, h } from '../app/dom';
import { COATS } from '../game/records';
import { CAT_SVG, DOG_SVG } from '../game/icons';

export class CollectionScreen implements Screen {
  private scope = new Scope();
  private el!: HTMLElement;
  constructor(private ctx: AppContext) {}

  mount(root: HTMLElement): void {
    this.el = h(`<main class="game page"></main>`);
    root.appendChild(this.el);
    this.scope.listen(this.el, 'click', (e) => {
      const a = actionOf(e);
      if (!a) return;
      if (a.act === 'home') return this.ctx.nav.home();
      if (a.act === 'wear') {
        const species = a.el.dataset.species as 'cat' | 'dog';
        const id = a.el.dataset.coat!;
        if (!this.ctx.records.coats[species].includes(id)) return;
        this.ctx.records = { ...this.ctx.records, selected: { ...this.ctx.records.selected, [species]: id } };
        this.ctx.saveRecords();
        this.ctx.applyAppearance();
        this.render();
      }
    });
    this.render();
  }

  unmount(): void {
    this.scope.dispose();
  }

  private render(): void {
    const r = this.ctx.records;
    const group = (species: 'cat' | 'dog') =>
      COATS.filter((c) => c.species === species)
        .map((c) => {
          const owned = r.coats[species].includes(c.id);
          const worn = r.selected[species] === c.id;
          const art = species === 'cat' ? CAT_SVG : DOG_SVG;
          return `
            <button class="coat${worn ? ' is-worn' : ''}${owned ? '' : ' is-locked'}" data-act="wear" data-species="${species}" data-coat="${c.id}" ${owned ? '' : 'aria-disabled="true"'} aria-pressed="${worn}" data-${species}-coat="${c.id}">
              <span class="coat__art" aria-hidden="true">${art}</span>
              <span class="coat__name">${esc(c.name)}</span>
              <span class="coat__note">${worn ? 'Wearing' : owned ? 'Tap to use' : esc(c.unlock)}</span>
            </button>`;
        })
        .join('');
    this.el.innerHTML = `
      <div class="topbar"><button class="icon-btn" data-act="home" aria-label="Home">‹</button><h1 class="title">Pets</h1><span class="topbar__spacer"></span></div>
      <p class="fine center">Coats are just for looks: same pets, same rules.</p>
      <section class="card"><h2>Cats</h2><div class="coats">${group('cat')}</div></section>
      <section class="card"><h2>Dogs</h2><div class="coats">${group('dog')}</div></section>`;
  }
}
