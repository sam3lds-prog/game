/** Owns the current screen: unmounting the old one disposes every timer, listener and sheet it created. */
import type { AppContext, Nav, Screen } from './context';
import { HomeScreen } from '../screens/home';
import { LevelsScreen } from '../screens/levels';
import { GameScreen } from '../screens/game';
import { loadFlags, loadProgress, loadSettings, saveFlags, saveProgress, saveSettings } from '../services/storage';
import type { AdService } from '../services/ads';
import type { IapService } from '../services/iap';
import type { Haptics } from '../services/haptics';

export interface AppServices {
  ads: AdService;
  iap: IapService;
  haptics: Haptics;
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
    };
    const ctx: AppContext = {
      progress: loadProgress(),
      settings: loadSettings(),
      flags: loadFlags(),
      saveProgress: () => saveProgress(ctx.progress),
      saveSettings: () => saveSettings(ctx.settings),
      saveFlags: () => saveFlags(ctx.flags),
      reload: () => {
        ctx.progress = loadProgress();
        ctx.settings = loadSettings();
        ctx.flags = loadFlags();
      },
      nav,
      ads: services.ads,
      iap: services.iap,
      haptics: services.haptics,
      now: services.now ?? (() => Date.now()),
    };
    this.ctx = ctx;
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
