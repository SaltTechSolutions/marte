import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { FormScreen } from '@/components/FormScreen';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/context/AuthContext';
import { canCheckIn, tenantIdIf } from '@/data/membership';
import { checkInByMembershipId, checkInByShortCode } from '@/data/firebase/checkinRepo';
import { useAppTheme } from '@/theme/ThemeContext';
import { safeBack } from '@/utils/navigation';
import { hapticError, hapticSuccess } from '@/utils/haptics';

const REASON_MESSAGE: Record<string, string> = {
  'not-found': 'Bu kod tanınmadı. Kodu kontrol edip tekrar dene.',
  'wrong-tenant': 'Bu kart başka bir salona ait.',
  inactive: 'Bu üyelik aktif değil.',
  'already-checked-in': 'Bu üye az önce zaten giriş yaptı.',
};

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
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Cleared on unmount so an auto-return can't fire after the screen is gone.
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const finishSubmit = (outcome: { ok: true; name: string } | { ok: false; reason: string }) => {
    if (outcome.ok) {
      hapticSuccess();
      setResult({ ok: true, message: `${outcome.name} içeri girdi` });
      // Back to scanning on its own: staff run a queue of people through and
      // shouldn't have to dismiss a confirmation between each one.
      resetTimer.current = setTimeout(scanAgain, 1600);
    } else {
      hapticError();
      setResult({ ok: false, message: REASON_MESSAGE[outcome.reason] ?? 'Bir hata oluştu, tekrar dene.' });
    }
  };

  /** QR scan payload is the full membership id — unambiguous, never hand-typed. */
  const submitScan = async (data: string) => {
    if (!tenantId || !data.trim() || busy) return;
    setBusy(true);
    setScanning(false);
    try {
      finishSubmit(await checkInByMembershipId(tenantId, data.trim()));
    } catch {
      setResult({ ok: false, message: 'Bir hata oluştu, tekrar dene.' });
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
      setResult({ ok: false, message: 'Bir hata oluştu, tekrar dene.' });
    } finally {
      setBusy(false);
      setManualCode('');
    }
  };

  const scanAgain = () => {
    setResult(null);
    setScanning(true);
  };

  if (!tenantId) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: 6 }}>
          <Text style={{ fontSize: 28 }}>🔒</Text>
          <Text variant="body" weight="900" style={{ textAlign: 'center' }}>
            Üye kabul yetkin yok
          </Text>
          <Text variant="helper" tone="sub" style={{ textAlign: 'center' }}>
            Salon yöneticisi bu yetkiyi sana verebilir.
          </Text>
        </View>
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

        {result ? (
          <View
            style={{
              alignItems: 'center',
              gap: 12,
              backgroundColor: result.ok ? colors.p : colors.surf,
              borderRadius: radius.lg,
              borderWidth: result.ok ? 0 : 1.5,
              borderColor: colors.danger,
              paddingVertical: spacing.xl,
              paddingHorizontal: spacing.lg,
            }}>
            <Ionicons
              name={result.ok ? 'checkmark-circle' : 'close-circle'}
              size={56}
              color={result.ok ? colors.onp : colors.danger}
            />
            <Text
              variant="h3"
              style={{ textAlign: 'center', color: result.ok ? colors.onp : colors.txt }}>
              {result.message}
            </Text>
            {result.ok ? (
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
                  <Text style={{ fontSize: 30 }}>📷</Text>
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
