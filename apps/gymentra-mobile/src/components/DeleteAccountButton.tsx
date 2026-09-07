import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { deleteMyAccount } from '@/services/accountDeletion';
import { useAppTheme } from '@/theme/ThemeContext';
import { signOutAndForget } from '@/services/signOut';

import { Text } from './Text';

/**
 * In-app account deletion — required by App Store Guideline 5.1.1(v) for any
 * app that lets users create an account, and by Google Play's data-deletion
 * policy.
 *
 * Two-step confirmation because it's irreversible. Deliberately styled as a
 * quiet destructive link, not a button: it must be findable, never inviting.
 */
export function DeleteAccountButton() {
  const router = useRouter();
  const { colors, spacing } = useAppTheme();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await deleteMyAccount();
      await signOutAndForget();
      router.replace('/onboarding/register');
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      const message = (e as { message?: string }).message ?? '';
      Alert.alert(
        'Hesap silinemedi',
        // The only expected business failure is "you're the last admin",
        // which the function explains in Turkish — surface it verbatim.
        code.includes('failed-precondition') && message
          ? message
          : 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.',
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    Alert.alert(
      'Hesabını sil',
      'Hesabın ve kişisel verilerin (ölçümlerin, antrenman geçmişin, salon üyeliklerin) kalıcı olarak silinecek. Bu işlem geri alınamaz.\n\nSalonun ödeme kayıtları, işletme muhasebesi gereği adın çıkarılarak saklanır.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Devam et',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Emin misin?', 'Bu son onay. Hesabın kalıcı olarak silinecek.', [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Hesabımı sil', style: 'destructive', onPress: run },
            ]),
        },
      ],
    );
  };

  return (
    <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
      <Pressable onPress={confirm} disabled={busy} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text variant="helper" style={{ color: colors.danger, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Siliniyor…' : 'Hesabımı sil'}
        </Text>
      </Pressable>
    </View>
  );
}
