import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from 'firebase/auth';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { FormScreen } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { AppleIcon } from '@/components/AppleIcon';
import { GoogleIcon } from '@/components/GoogleIcon';
import { LegalConsentNotice } from '@/components/LegalLinks';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { requestPasswordReset } from '@/data/firebase/authRepo';
import { getActiveMemberships } from '@/data/firebase/membershipRepo';
import { primaryRole, ROLE_HOME } from '@/data/membership';
import { auth } from '@/services/firebase';
import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '@/services/socialAuth';
import { useToast } from '@/components/Toast';
import { useAppTheme } from '@/theme/ThemeContext';

function authErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.';
    case 'auth/invalid-email':
      return 'E-posta adresi geçersiz görünüyor.';
    case 'auth/weak-password':
      return 'Şifre en az 6 karakter olmalı.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-posta veya şifre hatalı.';
    default:
      return 'Bir şeyler ters gitti. Tekrar deneyin.';
  }
}

/** Shared by every sign-in path (email, Google, Apple): existing member goes
 * straight to their role's home, first-timer goes to pick/create a gym. */
async function routeAfterAuth(router: ReturnType<typeof useRouter>, user: User) {
  const membership = (await getActiveMemberships(user.uid))[0] ?? null;
  const role = primaryRole(membership);
  if (role) {
    router.replace(ROLE_HOME[role]);
  } else {
    router.push('/onboarding/gym-code');
  }
}

/** Onboarding 1/4 — sign up (or sign in for returning users) with Firebase Auth. */
export default function RegisterScreen() {
  const router = useRouter();
  const { spacing, colors } = useAppTheme();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  // modeOverride wins once the user taps the toggle; until then the mode
  // tracks the ?mode= param, including when Expo Router reuses this same
  // screen instance for a fresh navigation instead of remounting it.
  const [modeOverride, setModeOverride] = useState<'signUp' | 'signIn' | null>(null);
  const mode = modeOverride ?? (modeParam === 'signIn' ? 'signIn' : 'signUp');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const toast = useToast();

  /**
   * PER-2. Uses whatever is already typed in the e-mail field rather than
   * opening a second screen to ask for it again — someone tapping this has
   * just failed to sign in, so the address is nearly always right there.
   *
   * The confirmation is deliberately the same whether or not an account
   * exists. Saying "no such account" would let anyone probe addresses.
   */
  const forgotPassword = async () => {
    const address = email.trim();
    if (!address.includes('@')) {
      setError('Önce e-posta adresini yaz, sonra sıfırlama bağlantısı gönderelim.');
      return;
    }
    setError(null);
    setResetting(true);
    try {
      const { retryAfterSeconds } = await requestPasswordReset(address);
      if (retryAfterSeconds && retryAfterSeconds > 0) {
        const minutes = Math.ceil(retryAfterSeconds / 60);
        toast.show({
          message:
            minutes <= 1
              ? 'Az önce istedin. Bir dakika sonra tekrar deneyebilirsin.'
              : `Az önce istedin. ${minutes} dakika sonra tekrar deneyebilirsin.`,
          tone: 'info',
        });
        return;
      }
      toast.success('Bu adres kayıtlıysa sıfırlama bağlantısı gönderildi.');
    } catch {
      setError('Şu an gönderilemedi. Biraz sonra tekrar dene.');
    } finally {
      setResetting(false);
    }
  };

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signUp') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
        router.push('/onboarding/gym-code');
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await routeAfterAuth(router, cred.user);
      }
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      setError(authErrorMessage(code));
    } finally {
      setLoading(false);
    }
  };

  const continueWithGoogle = async () => {
    setError(null);
    setSocialLoading('google');
    try {
      const cred = await signInWithGoogle();
      await routeAfterAuth(router, cred.user);
    } catch (e) {
      if ((e as { message?: string }).message !== 'GOOGLE_SIGN_IN_CANCELLED') {
        setError('Google ile giriş başarısız oldu. Tekrar deneyin.');
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const continueWithApple = async () => {
    setError(null);
    setSocialLoading('apple');
    try {
      const cred = await signInWithApple();
      await routeAfterAuth(router, cred.user);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code !== 'ERR_REQUEST_CANCELED') {
        setError('Apple ile giriş başarısız oldu. Tekrar deneyin.');
      }
    } finally {
      setSocialLoading(null);
    }
  };

  const canSubmit = email.trim().length > 3 && password.length >= 6 && (mode === 'signIn' || name.trim().length > 0);

  return (
    <FormScreen contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: 44, gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.md }}>
        <View style={{ alignItems: 'center', gap: 4, marginBottom: spacing.lg }}>
          <Text variant="h2">GymEntra</Text>
          <Text variant="helper" tone="sub">
            Powering Modern Gyms
          </Text>
        </View>

        {mode === 'signUp' && (
          <TextField placeholder="Ad Soyad" value={name} onChangeText={setName} autoCapitalize="words" />
        )}
        <TextField
          placeholder="E-posta"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          placeholder="Şifre"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        {error && (
          <Text variant="helper" style={{ color: '#F87171' }}>
            {error}
          </Text>
        )}

        <Button
          label={loading ? 'Lütfen bekleyin…' : mode === 'signUp' ? 'Devam et' : 'Giriş yap'}
          onPress={submit}
          disabled={!canSubmit || loading}
          style={{ marginTop: spacing.sm }}
        />

        {/* Sign-up only: this is the moment data is first collected, and the
            notice sits under the action it qualifies so it is read before the
            tap, not after. It also covers the social buttons further down —
            those create an account too. */}
        {mode === 'signUp' && <LegalConsentNotice />}

        {/* The question stays quiet; the action carries the weight and the
            brand colour. As one flat muted line the tappable half read as
            body copy and people missed it. */}
        {mode === 'signIn' && (
          <Pressable
            onPress={forgotPassword}
            disabled={resetting}
            accessibilityRole="button"
            style={{ alignItems: 'center', paddingVertical: 11, minHeight: 44, justifyContent: 'center' }}>
            <Text variant="helper" tone="sub">
              {resetting ? 'Gönderiliyor…' : 'Şifremi unuttum'}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() => setModeOverride(mode === 'signUp' ? 'signIn' : 'signUp')}
          accessibilityRole="button"
          accessibilityLabel={mode === 'signUp' ? 'Giriş yap' : 'Kayıt ol'}
          style={{ alignItems: 'center', paddingVertical: 13, minHeight: 44, justifyContent: 'center' }}>
          <Text variant="helper" tone="sub">
            {mode === 'signUp' ? 'Zaten hesabın var mı? ' : 'Hesabın yok mu? '}
            <Text variant="helper" weight="900" style={{ color: colors.pText }}>
              {mode === 'signUp' ? 'Giriş yap' : 'Kayıt ol'}
            </Text>
          </Text>
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
          <Text variant="label" tone="sub">
            VEYA
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        </View>

        {isAppleSignInAvailable() && (
          <Button
            label={socialLoading === 'apple' ? '…' : 'Apple ile devam et'}
            variant="secondary"
            leftIcon={<AppleIcon />}
            onPress={continueWithApple}
            disabled={socialLoading !== null}
          />
        )}
        <Button
          label={socialLoading === 'google' ? '…' : 'Google ile devam et'}
          variant="secondary"
          leftIcon={<GoogleIcon />}
          onPress={continueWithGoogle}
          disabled={socialLoading !== null}
        />

        <View style={{ flex: 1 }} />
        <Text variant="label" tone="sub" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
          Doğum günü, fotoğraf vs. SONRA sorulur
        </Text>
      </View>
    </FormScreen>
  );
}
