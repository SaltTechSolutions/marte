import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PurchasesOffering } from 'react-native-purchases';

/**
 * RevenueCat setup (P0-1).
 *
 * The gym — not the person — is what holds a subscription, so the RevenueCat
 * app user id is the TENANT id. Two admins of the same gym must see the same
 * subscription, and one of them deleting their account must not cancel the
 * gym's plan.
 *
 * Nothing here decides whether a gym is entitled. The app calls `purchase`,
 * RevenueCat verifies the receipt with Apple/Google, and the
 * `revenueCatWebhook` function writes `tenants/{id}.subscription`. The client
 * then reads that field like any other. A client that judged its own
 * entitlement would be a client that could grant it.
 */

/** Must match the entitlement identifier configured in RevenueCat. */
export const PRO_ENTITLEMENT = 'pro';

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
});

/**
 * Whether purchasing can work at all in this build.
 *
 * Expo Go has no native module, and a build whose EAS environment variables
 * were never set has no key — in both cases the paywall must say so rather
 * than show a button that throws. (`.env` is invisible to standalone builds;
 * the keys have to exist as EAS environment variables. See AGENTS §6.)
 */
export function isPurchaseAvailable(): boolean {
  // `executionEnvironment`, not the deprecated `appOwnership`: the latter is
  // marked for removal and already documented as "use the other one".
  return !!API_KEY && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

let configuredFor: string | null = null;

/**
 * Idempotent per gym. Called on every paywall mount rather than once at
 * startup: the tenant is not known at startup, and an admin who switches
 * gyms must not carry the previous gym's subscription state with them.
 */
export async function configurePurchases(tenantId: string): Promise<void> {
  if (!isPurchaseAvailable() || configuredFor === tenantId) return;

  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  await Purchases.configure({ apiKey: API_KEY!, appUserID: tenantId });
  configuredFor = tenantId;
}

export async function getProOffering(): Promise<PurchasesOffering | null> {
  if (!isPurchaseAvailable()) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

/**
 * Runs the store's purchase sheet.
 *
 * Returns `false` for a user cancellation — a normal outcome that must not be
 * reported as an error, and the one case the store surfaces as a throw.
 */
export async function purchaseProPackage(pkg: Parameters<typeof Purchases.purchasePackage>[0]): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return !!customerInfo.entitlements.active[PRO_ENTITLEMENT];
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return false;
    throw e;
  }
}

/**
 * "Satın alımlarımı geri yükle" — required by App Store review, and genuinely
 * needed: a gym owner reinstalling the app or moving to a new phone has a
 * valid subscription that the fresh install knows nothing about.
 */
export async function restorePurchases(): Promise<boolean> {
  if (!isPurchaseAvailable()) return false;
  const customerInfo = await Purchases.restorePurchases();
  return !!customerInfo.entitlements.active[PRO_ENTITLEMENT];
}
