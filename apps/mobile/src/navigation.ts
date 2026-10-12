import { router, type Href } from 'expo-router';

/**
 * Leaves a screen when it was opened from inside the app, but keeps direct
 * web/deep-link visits usable when there is no history entry to pop.
 */
export function safeBack(fallback: Href = '/') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
