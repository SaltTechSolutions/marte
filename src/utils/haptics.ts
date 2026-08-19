import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * The app's haptic vocabulary, in one place.
 *
 * Before this, feedback existed only on check-in, the workout stepper and
 * set completion — so the same tap felt different depending on which screen
 * you were on, which reads as flakiness rather than polish.
 *
 * Every call is fire-and-forget: haptics are unavailable on web, silently
 * ignored on devices without a Taptic Engine, and must never delay or fail
 * the action they accompany.
 */

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Moving between options — chips, steppers, calendar days, tabs. */
export function hapticSelection(): void {
  if (enabled) void Haptics.selectionAsync();
}

/** A primary action was committed — submitting, booking, saving. */
export function hapticAction(): void {
  if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** The thing the user wanted actually happened. */
export function hapticSuccess(): void {
  if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

/** It didn't — paired with a visible message, never on its own. */
export function hapticError(): void {
  if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
