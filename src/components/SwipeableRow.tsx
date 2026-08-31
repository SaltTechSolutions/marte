import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import { useAppTheme } from '@/theme/ThemeContext';

import { Text } from './Text';

export interface SwipeAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Paints the action destructive; also what the row snaps closed after. */
  destructive?: boolean;
  onPress: () => void;
}

/**
 * A list row that reveals icon buttons when swiped left.
 *
 * The actions are real buttons, not a whole-row gesture: a swipe that fires
 * on release makes destructive actions terrifyingly easy to trigger by
 * accident. Here the swipe only *reveals* — deleting still takes a
 * deliberate tap (and, on the delete path, two confirmations).
 *
 * The row closes itself after any action so the list never keeps a stale
 * open row behind a navigation or a re-render.
 */
export function SwipeableRow({
  actions,
  children,
}: {
  actions: SwipeAction[];
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const ref = useRef<SwipeableMethods>(null);

  const renderActions = () => (
    <View style={{ flexDirection: 'row' }}>
      {actions.map((a) => (
        <Pressable
          key={a.label}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          onPress={() => {
            ref.current?.close();
            a.onPress();
          }}
          style={{
            width: 72,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            backgroundColor: a.destructive ? colors.danger : colors.surf2,
          }}>
          <Ionicons name={a.icon} size={20} color={a.destructive ? colors.onp : colors.txt} />
          <Text variant="label" style={{ color: a.destructive ? colors.onp : colors.txt }}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      renderRightActions={renderActions}
      // friction 1 = the row tracks the finger 1:1, which is what iOS's own
      // swipe rows do. At 2 the row lagged behind the finger and, on the way
      // back, the buttons stayed visible after the gesture had clearly
      // reversed — it read as unresponsive rather than as resistance.
      friction={1}
      // Low threshold so a short flick settles open instead of snapping shut.
      rightThreshold={24}
      overshootRight={false}>
      {children}
    </ReanimatedSwipeable>
  );
}
