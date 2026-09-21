import Ionicons from '@expo/vector-icons/Ionicons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/ThemeContext';
import { hapticError, hapticSuccess } from '@/utils/haptics';

import { Text } from './Text';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastRequest {
  message: string;
  tone?: ToastTone;
  /** A real action — undo, retry, "go there". Omit for plain acknowledgement. */
  action?: { label: string; onPress: () => void };
}

interface ToastApi {
  show: (req: ToastRequest) => void;
  success: (message: string, action?: ToastRequest['action']) => void;
  error: (message: string, action?: ToastRequest['action']) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

/** Errors are read, not glanced at, so they get longer on screen. */
const DURATION: Record<ToastTone, number> = { success: 3000, info: 3500, error: 5000 };

/**
 * App-wide transient feedback.
 *
 * This replaces a per-screen `snack` state that rendered a `Snackbar` at the
 * *end of the scroll content*: on a list of fifty members the confirmation
 * appeared below the fold, so the user never saw it. It also never dismissed
 * itself, and its button was labelled "Geri Al" while only closing the
 * message — the label was describing an undo that did not exist.
 *
 * Floating, self-dismissing, and tone-aware. The action is optional and, when
 * present, does something real.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<(ToastRequest & { id: number }) | null>(null);
  const nextId = useRef(0);

  const show = useCallback((req: ToastRequest) => {
    if (req.tone === 'success') hapticSuccess();
    else if (req.tone === 'error') hapticError();
    nextId.current += 1;
    setToast({ ...req, id: nextId.current });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message, action) => show({ message, tone: 'success', action }),
      error: (message, action) => show({ message, tone: 'error', action }),
    }),
    [show],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {toast && <ToastView key={toast.id} {...toast} onDone={() => setToast(null)} />}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const ICON: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

function ToastView({
  message,
  tone = 'info',
  action,
  onDone,
}: ToastRequest & { onDone: () => void }) {
  const { colors, radius, spacing } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // The toast is visual and self-dismissing, so a screen-reader user would
    // never hear "Kaydedildi" or an error. iOS ignores `alert` on a plain
    // element and Android only reads live regions that change, so announce.
    AccessibilityInfo.announceForAccessibility(message);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 9, tension: 70 }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(onDone);
    }, DURATION[tone]);
    return () => clearTimeout(timer);
    // Mount-only: a re-run would restart the countdown mid-display. A new
    // message arrives as a new element (keyed by id), not as a prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accent = tone === 'success' ? colors.ok : tone === 'error' ? colors.danger : colors.pText;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing.md,
        right: spacing.md,
        // Above the tab bar rather than under it — the bar is ~64pt plus the
        // system inset on hardware that has one.
        bottom: insets.bottom + 74,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}>
      <Pressable
        onPress={onDone}
        // With an action the toast must not be one accessible element: a
        // labelled Pressable hides its children from VoiceOver, and the
        // "Geri al" button would be unreachable.
        accessible={!action}
        accessibilityRole={action ? undefined : 'alert'}
        accessibilityLabel={action ? undefined : message}
        accessibilityLiveRegion="polite"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surf2,
          borderLeftWidth: 3,
          borderLeftColor: accent,
          borderRadius: radius.md,
          paddingVertical: 12,
          paddingHorizontal: 14,
          // Lifted off the content it covers.
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}>
        <Ionicons name={ICON[tone]} size={19} color={accent} />
        <Text variant="helper" weight="600" style={{ flex: 1 }}>
          {message}
        </Text>
        {action && (
          <Pressable
            onPress={() => {
              action.onPress();
              onDone();
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="helper" weight="900" style={{ color: colors.pText }}>
              {action.label}
            </Text>
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}
