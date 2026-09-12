import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';

import { useAppTheme } from '@/theme/ThemeContext';

/**
 * Pull-to-refresh for screens that are already live (UX-7).
 *
 * Every list here is fed by an `onSnapshot` listener, so there is nothing to
 * re-fetch — the data is as current as the connection allows. The gesture is
 * still worth having: it is what people reach for, and after a connection
 * blip it is the only way to ask "am I actually seeing the latest?" and get
 * an answer.
 *
 * `onRefresh` should tear the subscription down and rebuild it (the usual
 * `setRetryKey(k => k + 1)`), which is real work rather than a placebo — a
 * listener dropped while offline does not always recover on its own.
 *
 * The spinner is held for a fixed moment because a re-subscribe gives no
 * completion signal to wait on: the first snapshot may arrive in 20ms from
 * cache, and hiding the spinner that fast reads as "nothing happened".
 */
const SPINNER_MS = 600;

export function useRefreshControl(onRefresh?: () => void) {
  const { colors } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handle = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRefreshing(true);
    onRefresh?.();
    timer.current = setTimeout(() => setRefreshing(false), SPINNER_MS);
  }, [onRefresh]);

  return <RefreshControl refreshing={refreshing} onRefresh={handle} tintColor={colors.pText} colors={[colors.pText]} />;
}
