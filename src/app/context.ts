/** Shared app state and services handed to every screen. Tests build their own context. */
import type { AdService } from '../services/ads';
import type { IapService } from '../services/iap';
import type { Haptics } from '../services/haptics';
import type { Flags, Progress, Settings } from '../services/storage';
import type { PuzzleRef } from '../game/puzzles';

export interface Screen {
  mount(root: HTMLElement): void;
  unmount(): void;
  /** Save anything in progress right now (app going to background, page closing). */
  persist?(): void;
}

export interface Nav {
  home(): void;
  levels(): void;
  play(ref: PuzzleRef): void;
}

export interface AppContext {
  progress: Progress;
  settings: Settings;
  flags: Flags;
  saveProgress(): void;
  saveSettings(): void;
  saveFlags(): void;
  /** Reloads progress/settings/flags from storage (after a reset). */
  reload(): void;
  nav: Nav;
  ads: AdService;
  iap: IapService;
  haptics: Haptics;
  now(): number;
}
