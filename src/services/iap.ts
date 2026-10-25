/**
 * In-app purchases: one non-consumable product, `remove_ads`.
 *
 * An entitlement is stored ONLY after a provider reports a verified purchase or restore — never on
 * a button tap. Release builds ship with UnavailableIap (commerce hidden) until StoreKit/RevenueCat
 * is configured; see docs/monetization.md.
 */
import { kv, PREFIX } from './storage';

export type ProductId = 'remove_ads';

export interface Entitlement {
  product: ProductId;
  /** Where the proof came from. 'dev-demo' is ignored outside development builds. */
  source: 'storekit' | 'revenuecat' | 'dev-demo';
  transactionId: string;
  verifiedAt: string;
}

export type PurchaseResult =
  | { status: 'purchased'; entitlement: Entitlement }
  | { status: 'cancelled' }
  | { status: 'pending' }
  | { status: 'failed'; message: string };

export interface IapProvider {
  readonly id: string;
  available(): boolean;
  /** Localized price string from the store, or null if unknown. */
  price(product: ProductId): string | null;
  purchase(product: ProductId): Promise<PurchaseResult>;
  restore(): Promise<Entitlement[]>;
}

const KEY = `${PREFIX}v2.entitlements`;
const DEV = import.meta.env?.DEV ?? false;

export function loadEntitlements(): Entitlement[] {
  return kv.get<Entitlement[]>(KEY, []).filter((e) => e && e.product && e.transactionId && (e.source !== 'dev-demo' || DEV));
}

export function hasEntitlement(product: ProductId): boolean {
  return loadEntitlements().some((e) => e.product === product);
}

function storeEntitlements(list: Entitlement[]): void {
  const byProduct = new Map<string, Entitlement>();
  for (const e of [...kv.get<Entitlement[]>(KEY, []), ...list]) byProduct.set(`${e.product}:${e.source}`, e);
  kv.set(KEY, [...byProduct.values()]);
}

export type IapEventSink = (event: 'purchase_started' | 'purchase_succeeded' | 'purchase_restored', props: Record<string, string | number>) => void;

/** Thin wrapper: runs the provider and records entitlements only from verified results. */
export class Purchases {
  constructor(
    readonly provider: IapProvider,
    private emit: IapEventSink = () => undefined,
  ) {}

  available(): boolean {
    return this.provider.available();
  }

  /**
   * Runs a purchase. A 'purchased' result is returned only when it carried a verifiable entitlement
   * for this product and that entitlement is now active; anything else becomes 'failed', so the UI
   * can never claim success for a purchase that wasn't stored.
   */
  async buy(product: ProductId): Promise<PurchaseResult> {
    this.emit('purchase_started', { product });
    let r: PurchaseResult;
    try {
      r = await this.provider.purchase(product);
    } catch (e) {
      return { status: 'failed', message: e instanceof Error ? e.message : 'The App Store didn’t respond.' };
    }
    if (r.status !== 'purchased') return r;
    if (r.entitlement?.product === product && r.entitlement.transactionId) storeEntitlements([r.entitlement]);
    if (!hasEntitlement(product)) return { status: 'failed', message: 'The purchase couldn’t be verified.' };
    this.emit('purchase_succeeded', { product });
    return r;
  }

  async restore(): Promise<number> {
    let found: Entitlement[];
    try {
      found = await this.provider.restore();
    } catch {
      return 0;
    }
    const list = found.filter((e) => e && e.product && e.transactionId);
    if (list.length) {
      storeEntitlements(list);
      this.emit('purchase_restored', { count: list.length });
    }
    return list.length;
  }
}

/** Release default: purchases not configured → the store UI is hidden. */
export const unavailableIap: IapProvider = {
  id: 'none',
  available: () => false,
  price: () => null,
  purchase: async () => ({ status: 'failed', message: 'Purchases are not available in this build.' }),
  restore: async () => [],
};

/** Development-only demo store. Its entitlements are ignored by release builds. */
export const demoIap: IapProvider = {
  id: 'demo',
  available: () => true,
  price: () => '$3.99 (demo)',
  purchase: async (product) => ({
    status: 'purchased',
    entitlement: { product, source: 'dev-demo', transactionId: `demo-${Date.now()}`, verifiedAt: new Date().toISOString() },
  }),
  restore: async () => [],
};
