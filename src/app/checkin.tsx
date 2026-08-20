import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { FormScreen } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { canCheckIn, tenantIdIf } from '@/data/membership';
import {
  checkInByMembershipId,
  checkInByShortCode,
  confirmCheckInDespiteWarning,
  CheckInWarnReason,
  WARN_MESSAGE,
} from '@/data/firebase/checkinRepo';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';
import { hapticError, hapticSuccess } from '@/utils/haptics';

const REASON_MESSAGE: Record<string, string> = {
  'not-found': 'Bu kod tanınmadı. Kodu kontrol edip tekrar dene.',
  'wrong-tenant': 'Bu kart başka bir salona ait.',
  inactive: 'Bu üyelik aktif değil.',
  'already-checked-in': 'Bu üye az önce zaten giriş yaptı.',
};

type ScreenResult =
  | { kind: 'success'; message: string }
  | { kind: 'warn'; name: string; packageLabel: string | null; warnReason: CheckInWarnReason; membershipDocId: string }
  | { kind: 'denied'; message: string };

/** Front-desk QR scanner — camera when available, manual code entry as a reliable fallback. */
export default function AdminCheckin() {
  const router = useRouter();
  const { colors, spacing, radius } = useAppTheme();
  const { activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canCheckIn(activeMembership));

  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScreenResult | null>(null);

  // Cleared on unmount so an auto-return can't fire after the screen is gone.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const scanAgain = () => {
    setResult(null);
    setScanning(true);
  };

  const finishSubmit = (
    outcome:
      | { ok: true; name: string; access: 'ok'; packageLabel: string | null }
      | { ok: true; name: string; access: 'warn'; packageLabel: string | null; warnReason: CheckInWarnReason; membershipDocId: string }
      | { ok: false; reason: string },
  ) => {
    if (!outcome.ok) {
      hapticError();
      setResult({ kind: 'denied', message: REASON_MESSAGE[outcome.reason] ?? 'Bir hata oluştu, tekrar dene.' });
      return;
    }
    if (outcome.access === 'warn') {
      // Not written yet — staff decides. No auto-return: a silent pause here
      // would look identical to the app hanging.
      hapticError();
      setResult({ kind: 'warn', name: outcome.name, packageLabel: outcome.packageLabel, warnReason: outcome.warnReason, membershipDocId: outcome.membershipDocId });
      return;
    }
    hapticSuccess();
    setResult({ kind: 'success', message: [outcome.name, outcome.packageLabel].filter(Boolean).join(' · ') });
    // Back to scanning on its own: staff run a queue of people through and
    // shouldn't have to dismiss a confirmation between each one.
    resetTimer.current = setTimeout(scanAgain, 1600);
  };

  /** QR scan payload is the full membership id — unambiguous, never hand-typed. */
  const submitScan = async (data: string) => {
    if (!tenantId || !data.trim() || busy) return;
    setBusy(true);
    setScanning(false);
    try {
      finishSubmit(await checkInByMembershipId(tenantId, data.trim()));
    } catch {
      setResult({ kind: 'denied', message: 'Bir hata oluştu, tekrar dene.' });
    } finally {
      setBusy(false);
    }
  };

  /** Manual fallback uses the member's short 6-digit code, not the full id. */
  const submitManualCode = async () => {
    if (!tenantId || !manualCode.trim() || busy) return;
    setBusy(true);
    setScanning(false);
    try {
      finishSubmit(await checkInByShortCode(tenantId, manualCode.trim()));
    } catch {
      setResult({ kind: 'denied', message: 'Bir hata oluştu, tekrar dene.' });
    } finally {
      setBusy(false);
      setManualCode('');
    }
  };

  /** "Yine de kabul et" — staff overrides the warning. */
  const admitDespiteWarning = async () => {
    if (!tenantId || result?.kind !== 'warn' || busy) return;
    setBusy(true);
    try {
      const outcome = await confirmCheckInDespiteWarning(tenantId, result.membershipDocId, result.warnReason);
      if (outcome.ok) {
        hapticSuccess();
        setResult({ kind: 'success', message: [outcome.name, result.packageLabel].filter(Boolean).join(' · ') });
        resetTimer.current = setTimeout(scanAgain, 1600);
      } else {
        hapticError();
        setResult({ kind: 'denied', message: REASON_MESSAGE[outcome.reason] ?? 'Bir hata oluştu, tekrar dene.' });
      }
    } catch {
      setResult({ kind: 'denied', message: 'Bir hata oluştu, tekrar dene.' });
    } finally {
      setBusy(false);
    }
  };

  if (!tenantId) {
    // Top-level route (registered outside any role layout), so unlike other
    // AccessGuard call sites it has no ambient Screen already wrapping it.
    return (
      <Screen>
        <AccessGuard title="Üye kabul yetkin yok" hint="Salon yöneticisi bu yetkiyi sana verebilir." />
      </Screen>
    );
  }

  return (
    <FormScreen contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md }}>
      <View style={{ flex: 1, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Falls back to '/', which re-routes to whichever home this
              person's role gives them — the screen is now reachable by both
              admins and delegated trainers. */}
          <Pressable onPress={() => safeBack(router, '/')} hitSlop={10}>
            <Text style={{ fontSize: 20, color: colors.txt }}>‹</Text>
          </Pressable>
          <Text variant="h3">Giriş kabul et</Text>
        </View>

        {result?.kind === 'warn' ? (
          <View
            style={{
              alignItems: 'center',
              gap: 12,
              backgroundColor: colors.surf,
              borderRadius: radius.lg,
              borderWidth: 2,
              borderColor: colors.warn,
              paddingVertical: spacing.xl,
              paddingHorizontal: spacing.lg,
            }}>
            <Ionicons name="warning" size={56} color={colors.warn} />
            <Text variant="h3" style={{ textAlign: 'center' }}>
              {result.name}
            </Text>
            <Text variant="body" weight="700" style={{ textAlign: 'center', color: colors.warn }}>
              {WARN_MESSAGE[result.warnReason]}
            </Text>
            {result.packageLabel && (
              <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
                {result.packageLabel}
              </Text>
            )}
            <Button
              label={busy ? '…' : 'Yine de kabul et'}
              critical
              disabled={busy}
              onPress={admitDespiteWarning}
              style={{ alignSelf: 'stretch' }}
            />
            <Button label="Vazgeç" variant="ghost" disabled={busy} onPress={scanAgain} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : result ? (
          <View
            style={{
              alignItems: 'center',
              gap: 12,
              backgroundColor: result.kind === 'success' ? colors.p : colors.surf,
              borderRadius: radius.lg,
              borderWidth: result.kind === 'success' ? 0 : 1.5,
              borderColor: colors.danger,
              paddingVertical: spacing.xl,
              paddingHorizontal: spacing.lg,
            }}>
            <Ionicons
              name={result.kind === 'success' ? 'checkmark-circle' : 'close-circle'}
              size={56}
              color={result.kind === 'success' ? colors.onp : colors.danger}
            />
            <Text
              variant="h3"
              style={{ textAlign: 'center', color: result.kind === 'success' ? colors.onp : colors.txt }}>
              {result.message}
            </Text>
            {result.kind === 'success' ? (
              <Text variant="label" style={{ color: colors.onp, opacity: 0.8 }}>
                Sıradaki için hazırlanıyor…
              </Text>
            ) : (
              <Button label="Yeni tarama" variant="secondary" onPress={scanAgain} style={{ alignSelf: 'stretch' }} />
            )}
          </View>
        ) : (
          <>
            <View
              style={{
                height: 280,
                borderRadius: radius.lg,
                overflow: 'hidden',
                backgroundColor: colors.surf,
                borderWidth: 2,
                borderColor: colors.p,
                borderStyle: 'dashed',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {permission?.granted && scanning ? (
                <CameraView
                  style={{ width: '100%', height: '100%' }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={busy ? undefined : ({ data }) => submitScan(data)}
                />
              ) : (
                <View style={{ alignItems: 'center', gap: 10, padding: spacing.lg }}>
                  <Ionicons name="camera-outline" size={30} color={colors.sub} />
                  <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
                    {permission?.granted
                      ? 'İşleniyor…'
                      : 'Kamerayla taramak için erişim ver, ya da kodu aşağıya elle gir.'}
                  </Text>
                  {!permission?.granted && (
                    <Button label="Kameraya izin ver" compact onPress={requestPermission} />
                  )}
                </View>
              )}
            </View>

            <Text variant="label" tone="sub" style={{ textAlign: 'center' }}>
              — veya kodu elle gir —
            </Text>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextField
                placeholder="6 haneli kod"
                value={manualCode}
                onChangeText={(t) => setManualCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
                style={{ flex: 1, letterSpacing: 4, textAlign: 'center', fontSize: 20, fontWeight: '900' }}
              />
              <Button label={busy ? '…' : 'Onayla'} onPress={submitManualCode} disabled={busy || manualCode.length !== 6} compact />
            </View>
          </>
        )}
      </View>
    </FormScreen>
  );
}
