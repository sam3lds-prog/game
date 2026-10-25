/** Owns the current screen: unmounting the old one disposes every timer, listener and sheet it created. */
import type { AppContext, Nav, Screen } from './context';
import { HomeScreen } from '../screens/home';
import { LevelsScreen } from '../screens/levels';
import { GameScreen } from '../screens/game';
import { TutorialScreen } from '../screens/tutorial';
import { CalendarScreen } from '../screens/calendar';
import { StatsScreen } from '../screens/stats';
import { CollectionScreen } from '../screens/collection';
import { loadRecords, saveRecords } from '../game/records';
import { applyTheme } from './theme';
import { silentSound, type Sound } from '../services/sound';
import { loadFlags, loadProgress, loadSettings, saveFlags, saveProgress, saveSettings } from '../services/storage';
import type { AdService } from '../services/ads';
import type { IapService } from '../services/iap';
import type { Haptics } from '../services/haptics';

export interface AppServices {
  ads: AdService;
  iap: IapService;
  haptics: Haptics;
  sound?: Sound;
  now?: () => number;
}

export class App {
  private current: Screen | null = null;
  readonly ctx: AppContext;

  constructor(
    private root: HTMLElement,
    services: AppServices,
  ) {
    const nav: Nav = {
      home: () => this.show(new HomeScreen(this.ctx)),
      levels: () => this.show(new LevelsScreen(this.ctx)),
      play: (ref) => this.show(new GameScreen(this.ctx, ref)),
      tutorial: () => this.show(new TutorialScreen(this.ctx)),
      calendar: () => this.show(new CalendarScreen(this.ctx)),
      stats: () => this.show(new StatsScreen(this.ctx)),
      collection: () => this.show(new CollectionScreen(this.ctx)),
    };
    const progress = loadProgress();
    const ctx: AppContext = {
      progress,
      settings: loadSettings(),
      flags: loadFlags(),
      records: loadRecords(progress.dailyDone),
      saveRecords: () => saveRecords(ctx.records),
      saveProgress: () => saveProgress(ctx.progress),
      saveSettings: () => saveSettings(ctx.settings),
      saveFlags: () => saveFlags(ctx.flags),
      reload: () => {
        ctx.progress = loadProgress();
        ctx.settings = loadSettings();
        ctx.flags = loadFlags();
        ctx.records = loadRecords(ctx.progress.dailyDone);
        ctx.applyAppearance();
      },
      nav,
      ads: services.ads,
      iap: services.iap,
      haptics: services.haptics,
      sound: services.sound ?? silentSound,
      now: services.now ?? (() => Date.now()),
      applyAppearance: () => {
        applyTheme(ctx.settings.theme);
        document.documentElement.setAttribute('data-cat-coat', ctx.records.selected.cat);
        document.documentElement.setAttribute('data-dog-coat', ctx.records.selected.dog);
      },
    };
    this.ctx = ctx;
    ctx.applyAppearance();
  }

  show(screen: Screen): void {
    if (this.current) {
      this.current.persist?.();
      this.current.unmount();
    }
    this.root.replaceChildren();
    this.current = screen;
    screen.mount(this.root);
  }

  /** Called on pagehide / app background. */
  persistNow(): void {
    this.current?.persist?.();
  }

  get screen(): Screen | null {
    return this.current;
  }

  destroy(): void {
    this.current?.persist?.();
    this.current?.unmount();
    this.current = null;
    this.root.replaceChildren();
  }
}
