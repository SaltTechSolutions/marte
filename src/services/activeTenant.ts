import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Birden çok salona üye olan kişinin en son hangi salonda olduğu (P1-8).
 *
 * Seçim uygulama kapanınca kaybolmamalı: iki salona da giden biri her açılışta
 * listenin ilkine düşerse, kendi salonuna geçmek her seferinde iki dokunuş
 * eder. `activeRole` ile aynı desen.
 *
 * Uid başına saklanır: ortak kullanılan bir ön büro cihazında bir kişinin
 * seçimi diğerine taşınmamalı.
 */

const KEY_PREFIX = 'gymentra.activeTenant.v1.';

export async function saveActiveTenant(uid: string, tenantId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + uid, tenantId);
  } catch {
    // Tercih yazımının başarısız olması kullanıcıyı kesmeye değmez.
  }
}

export async function loadActiveTenant(uid: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_PREFIX + uid);
  } catch {
    return null;
  }
}

export async function clearActiveTenant(uid: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + uid);
  } catch {
    // Aynı gerekçe.
  }
}
