/**
 * In-app purchases. The game talks to `IapService` only.
 *
 * Release builds use `UnavailableIapService` until a verified StoreKit bridge (e.g. RevenueCat's
 * Capacitor SDK) is integrated: no product can be bought and nothing is granted. The dev stub exists
 * only in development builds and tags every grant with source `dev`, which release builds ignore.
 */

export type ProductId = 'remove_ads' | 'starter_decor' | 'cozy_theme' | 'pet_portraits' | 'supporter';

export interface ProductInfo {
  id: ProductId;
  title: string;
  description: string;
  /** Localized price string from the store. Null until a store answers. */
  price: string | null;
}

export type PurchaseResult = { ok: true; id: ProductId; source: 'store' | 'dev' } | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' };

export interface IapService {
  readonly available: boolean;
  readonly isStub: boolean;
  products(): Promise<ProductInfo[]>;
  purchase(id: ProductId): Promise<PurchaseResult>;
  /** Returns the product ids the store confirms the player owns. */
  restore(): Promise<{ ok: boolean; owned: ProductId[]; source: 'store' | 'dev' | null }>;
}

/** Catalog copy. Prices are never hard-coded: they come from the store at runtime. */
export const PRODUCT_CATALOG: Array<Omit<ProductInfo, 'price'>> = [
  { id: 'remove_ads', title: 'Remove interruptions', description: 'No forced ads between boards. Optional rewarded ads stay optional.' },
  { id: 'starter_decor', title: 'Sanctuary Starter Decor', description: 'A named five-piece cosmetic set for your sanctuary.' },
  { id: 'cozy_theme', title: 'Cozy Theme Bundle', description: 'Board skin and sanctuary colors. Accessibility contrast is always kept.' },
  { id: 'pet_portraits', title: 'Pet Portrait Bundle', description: 'Extra cosmetic accents for your pets. No gameplay effect.' },
  { id: 'supporter', title: 'Supporter Pack', description: 'A thank-you badge and keepsake items. No leaderboard benefit.' },
];

export class UnavailableIapService implements IapService {
  readonly available = false;
  readonly isStub = false;
  async products(): Promise<ProductInfo[]> {
    return PRODUCT_CATALOG.map((p) => ({ ...p, price: null }));
  }
  async purchase(): Promise<PurchaseResult> {
    return { ok: false, reason: 'unavailable' };
  }
  async restore() {
    return { ok: false, owned: [] as ProductId[], source: null };
  }
}

/** Development-only simulated store. Its grants are tagged `dev` and ignored by release builds. */
export class DevStubIapService implements IapService {
  readonly available = true;
  readonly isStub = true;
  private owned = new Set<ProductId>();
  async products(): Promise<ProductInfo[]> {
    return PRODUCT_CATALOG.map((p) => ({ ...p, price: 'DEV' }));
  }
  async purchase(id: ProductId): Promise<PurchaseResult> {
    this.owned.add(id);
    return { ok: true, id, source: 'dev' };
  }
  async restore() {
    return { ok: true, owned: [...this.owned], source: 'dev' as const };
  }
}

export function createIapService(isDev: boolean): IapService {
  return isDev ? new DevStubIapService() : new UnavailableIapService();
}

export const iap: IapService = createIapService(import.meta.env.DEV);

/** Whether an entitlement record should count in this build. Dev grants never count in release. */
export function entitlementCounts(source: 'legacy-v1' | 'store' | 'dev' | null, isDev: boolean): boolean {
  if (source === 'store' || source === 'legacy-v1') return true;
  if (source === 'dev') return isDev;
  return false;
}
