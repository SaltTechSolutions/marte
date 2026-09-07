import React from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, ViewStyle } from 'react-native';

import { Screen } from './Screen';

/**
 * Wrapper for any screen with text input.
 *
 * Two things every form needs and none of ours had:
 *
 * 1. **Keyboard avoidance.** On iOS the keyboard overlays content, so the
 *    field being typed into — and the submit button under it — can end up
 *    hidden. Android resizes the window instead, which is why `behavior`
 *    differs per platform; forcing `padding` there double-counts the inset.
 * 2. **Tap-outside to dismiss.** Without it the only way out of a numeric
 *    keypad (no return key) is the system gesture, which people don't try.
 *
 * `keyboardShouldPersistTaps="handled"` matters: without it the first tap
 * anywhere only dismisses the keyboard, so buttons need pressing twice.
 */
export function FormScreen({
  children,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
}) {
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable onPress={Keyboard.dismiss} accessible={false} style={{ flex: 1 }}>
            {children}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * Drop-in replacement for `ScrollView` on screens that already scroll but
 * contain text input — the payment, class and check-in forms.
 *
 * Same two fixes as FormScreen, without restructuring the screen: the
 * keyboard no longer covers the field being typed into, dragging the list
 * dismisses it, and buttons respond to the first tap instead of the second.
 */
export function KeyboardAwareScroll({
  children,
  contentContainerStyle,
}: {
  children: React.ReactNode;
  contentContainerStyle?: ViewStyle;
}) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
