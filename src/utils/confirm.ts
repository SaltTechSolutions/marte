import { Alert } from 'react-native';

/**
 * One confirmation shape for every irreversible action, so the app doesn't
 * ask in three different ways.
 *
 * Deliberately NOT used for everything destructive-sounding. A member
 * cancelling a class booking is undoable and already answered with a
 * snackbar; putting a dialog in front of it would train people to dismiss
 * dialogs without reading them, which is exactly what makes the real ones
 * useless.
 *
 * Reserve it for actions with no path back: rejecting someone's request,
 * rejecting a payment, cancelling an appointment, deleting saved work.
 */
export function confirmDestructive(params: {
  title: string;
  message: string;
  /** Verb, not "OK" — the button should say what it will do. */
  confirmLabel: string;
  onConfirm: () => void;
}): void {
  Alert.alert(params.title, params.message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: params.confirmLabel, style: 'destructive', onPress: params.onConfirm },
  ]);
}
