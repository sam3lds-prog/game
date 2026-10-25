/**
 * In-app purchases. Stub now; RevenueCat (or StoreKit via Capacitor) later.
 * Product: remove_ads — one-time, non-consumable.
 */

export interface IapService {
  purchaseRemoveAds(): Promise<boolean>;
  restore(): Promise<boolean>;
}

export class StubIapService implements IapService {
  async purchaseRemoveAds(): Promise<boolean> {
    // Stub: always succeeds so the ad-free path can be tested end to end.
    return true;
  }
  async restore(): Promise<boolean> {
    return false;
  }
}

export const iap: IapService = new StubIapService();
