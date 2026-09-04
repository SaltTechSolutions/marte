import { onAuthStateChanged, User } from 'firebase/auth';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

import { getActiveMemberships, watchMembership } from '@/data/firebase/membershipRepo';
import { getTenant } from '@/data/firebase/tenantRepo';
import { primaryRole, selectMembership } from '@/data/membership';
import { MembershipRole, Tenant, TenantMembership } from '@/data/types';
import { loadActiveRole, saveActiveRole } from '@/services/activeRole';
import { loadActiveTenant, saveActiveTenant } from '@/services/activeTenant';
import { auth } from '@/services/firebase';
import { clearMembershipCache, loadMembershipCache, saveMembershipCache } from '@/services/membershipCache';

interface AuthState {
  user: User | null;
  authLoading: boolean;
  activeMembership: TenantMembership | null;
  activeTenant: Tenant | null;
  /**
   * Kişinin aktif olduğu tüm salonlar (P1-8). Çoğu hesapta tek eleman;
   * ekranlar "birden fazla mı" sorusunu buradan sorar.
   */
  memberships: TenantMembership[];
  /** Görüntülenen salonu değiştirir; seçim cihazda saklanır. */
  switchTenant: (tenantId: string) => Promise<void>;
  membershipLoading: boolean;
  /** True when the membership on screen came from disk and the network
   * refresh hasn't landed — the QR card uses it to flag stale data. */
  membershipFromCache: boolean;
  /** Which surface a multi-role user is working in. Null until membership
   * resolves; otherwise always one of `activeMembership.roles`. */
  activeRole: MembershipRole | null;
  setActiveRole: (role: MembershipRole) => Promise<void>;
  refreshMembership: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeMembership, setActiveMembership] = useState<TenantMembership | null>(null);
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [membershipFromCache, setMembershipFromCache] = useState(false);
  const [activeRole, setActiveRoleState] = useState<MembershipRole | null>(null);
  // Guards against a slow response for a previous user overwriting the
  // current one's state after a fast account switch.
  const activeUidRef = useRef<string | null>(null);
  // Read inside the live-membership subscription without making the tenant a
  // dependency, which would tear the listener down on every refresh.
  const activeTenantRef = useRef<Tenant | null>(null);
  useEffect(() => {
    activeTenantRef.current = activeTenant;
  }, [activeTenant]);
  const membershipsRef = useRef<TenantMembership[]>([]);
  useEffect(() => {
    membershipsRef.current = memberships;
  }, [memberships]);

  /** Restore the stored surface, falling back to the most privileged role.
   * A stored role that is no longer granted (an admin demoted to trainer)
   * must not strand the user on a screen they can no longer use. */
  const resolveRole = async (uid: string, membership: TenantMembership | null) => {
    const fallback = primaryRole(membership);
    if (!membership) return fallback;
    const stored = await loadActiveRole(uid);
    return stored && membership.roles.includes(stored) ? stored : fallback;
  };

  const loadMembership = async (uid: string) => {
    setMembershipLoading(true);

    // Disk first: instant, and the only path that works with no signal.
    const cached = await loadMembershipCache(uid);
    if (cached && activeUidRef.current === uid) {
      setActiveMembership(cached.membership);
      setMemberships(cached.memberships ?? (cached.membership ? [cached.membership] : []));
      setActiveTenant(cached.tenant);
      setMembershipFromCache(true);
      setActiveRoleState(await resolveRole(uid, cached.membership));
    }

    try {
      const all = await getActiveMemberships(uid);
      // Son seçilen salon hâlâ listedeyse o, değilse listenin ilki. Ayrılınan
      // bir salonda takılı kalmamak için seçim her yüklemede doğrulanıyor.
      const membership = selectMembership(all, await loadActiveTenant(uid));
      const tenant = membership ? await getTenant(membership.tenantId) : null;
      if (activeUidRef.current !== uid) return;
      setActiveMembership(membership);
      setMemberships(all);
      setActiveTenant(tenant);
      setMembershipFromCache(false);
      setActiveRoleState(await resolveRole(uid, membership));
      await saveMembershipCache(uid, { membership, tenant, memberships: all });
    } catch (error) {
      // Offline or permission error. If the cache already populated the UI we
      // stay on it; otherwise the caller sees no membership, same as before.
      console.warn('[auth] üyelik yenilenemedi, önbellek kullanılıyor:', error);
    } finally {
      if (activeUidRef.current === uid) setMembershipLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      activeUidRef.current = firebaseUser?.uid ?? null;
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        await loadMembership(firebaseUser.uid);
      } else {
        setActiveMembership(null);
        setMemberships([]);
        setActiveTenant(null);
        setMembershipFromCache(false);
        setActiveRoleState(null);
      }
    });
    return unsubscribe;
    // Subscribe to auth state exactly once. `loadMembership` is redefined on
    // every render, so listing it here would tear down and re-create the
    // Firebase listener continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Keep the membership live once we know which gym it belongs to.
   *
   * Roles and permissions change while the app is open — an owner leaving
   * for the afternoon grants the trainer at the desk check-in access. Before
   * this the membership was read once at sign-in, so that trainer had to
   * fully restart the app before the door would work for them.
   *
   * Also revokes access promptly if the membership is suspended.
   */
  useEffect(() => {
    const uid = user?.uid;
    const tenantId = activeMembership?.tenantId;
    if (!uid || !tenantId) return;
    return watchMembership(tenantId, uid, async (membership) => {
      if (activeUidRef.current !== uid) return;
      setActiveMembership(membership);
      setMembershipFromCache(false);
      setActiveRoleState(await resolveRole(uid, membership));
      await saveMembershipCache(uid, { membership, tenant: activeTenantRef.current, memberships: membershipsRef.current });
    });
    // uid + tenant are the only inputs that should restart the listener.
  }, [user?.uid, activeMembership?.tenantId]);

  const refreshMembership = async () => {
    if (user) await loadMembership(user.uid);
  };

  /**
   * Görüntülenen salonu değiştirir.
   *
   * Rol salona göre değişir — biri kendi salonunda yönetici, gittiği başka
   * salonda üyedir — bu yüzden yüzey de yeniden çözülüyor. Tema ve canlı
   * dinleyiciler `activeMembership.tenantId`'yi izlediği için kendiliğinden
   * yeni salona geçer.
   */
  const switchTenant = async (tenantId: string) => {
    const uid = user?.uid;
    const next = memberships.find((m) => m.tenantId === tenantId);
    if (!uid || !next || next.tenantId === activeMembership?.tenantId) return;
    setActiveMembership(next);
    setActiveRoleState(await resolveRole(uid, next));
    await saveActiveTenant(uid, tenantId);
    try {
      const tenant = await getTenant(tenantId);
      if (activeUidRef.current !== uid) return;
      setActiveTenant(tenant);
      await saveMembershipCache(uid, { membership: next, tenant, memberships });
    } catch (error) {
      // Salon belgesi çevrimdışı okunamadı: üyelik zaten değişti, marka
      // bilgisi ağ dönünce yerine oturur.
      console.warn('[auth] salon bilgisi alınamadı:', error);
    }
  };

  const setActiveRole = async (role: MembershipRole) => {
    if (!user || !activeMembership?.roles.includes(role)) return;
    setActiveRoleState(role);
    await saveActiveRole(user.uid, role);
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        authLoading,
        activeMembership,
        activeTenant,
        memberships,
        switchTenant,
        membershipLoading,
        membershipFromCache,
        activeRole,
        setActiveRole,
        refreshMembership,
      }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Called on sign-out so a shared device doesn't keep the previous member's card. */
export async function forgetCachedMembership(uid: string): Promise<void> {
  await clearMembershipCache(uid);
}
