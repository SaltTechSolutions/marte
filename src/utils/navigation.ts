import { Href, useRouter } from 'expo-router';

/**
 * Go back if there's history, otherwise fall back to a known-safe route.
 * router.back() throws a dev warning (and does nothing in prod) when the
 * screen has no navigation history — e.g. opened directly via deep link.
 */
export function safeBack(router: ReturnType<typeof useRouter>, fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
