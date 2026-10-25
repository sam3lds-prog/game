/** Shared app state and services handed to every screen. Tests build their own context. */
import type { AdService } from '../services/ads';
import type { Purchases } from '../services/iap';
import type { Analytics } from '../services/analytics';
import type { Haptics } from '../services/haptics';
import type { Sound } from '../services/sound';
import type { Records } from '../game/records';
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
  tutorial(): void;
  calendar(): void;
  stats(): void;
  collection(): void;
}

export interface Reminders {
  available(): boolean;
  schedule(hour: number, minute: number): Promise<boolean>;
  cancel(): Promise<void>;
}

export interface AppContext {
  progress: Progress;
  settings: Settings;
  flags: Flags;
  records: Records;
  saveRecords(): void;
  saveProgress(): void;
  saveSettings(): void;
  saveFlags(): void;
  /** Reloads progress/settings/flags from storage (after a reset). */
  reload(): void;
  nav: Nav;
  ads: AdService;
  purchases: Purchases;
  analytics: Analytics;
  haptics: Haptics;
  sound: Sound;
  share(text: string): Promise<boolean>;
  reminders: Reminders;
  now(): number;
  /** Re-applies appearance settings (theme) after a change. */
  applyAppearance(): void;
}
