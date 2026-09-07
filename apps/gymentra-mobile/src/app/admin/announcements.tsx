import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccessGuard } from '@/components/AccessGuard';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorNotice } from '@/components/ErrorNotice';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import {
  ANNOUNCEMENT_BODY_MAX,
  ANNOUNCEMENT_DEFAULT_DAYS,
  ANNOUNCEMENT_TITLE_MAX,
  createAnnouncement,
  deleteAnnouncement,
  isLive,
  watchAnnouncements,
} from '@/data/firebase/announcementRepo';
import { canManageGym, tenantIdIf } from '@/data/membership';
import { Announcement } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';
import { confirmDestructive } from '@/utils/confirm';

function when(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

/**
 * Announcements (PER-16): the gym talking to everyone at once.
 *
 * Composer and list on one screen — a post is two fields, not a form worth
 * a route. No editing: a wrong post is deleted and re-posted, because the
 * push already went out with the old words and an edit cannot recall it.
 */
export default function AdminAnnouncements() {
  const { colors, spacing } = useAppTheme();
  const toast = useToast();
  const { user, activeMembership } = useAuth();
  const tenantId = tenantIdIf(activeMembership, canManageGym(activeMembership));

  const [items, setItems] = useState<Announcement[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!tenantId) return;
    return watchAnnouncements(tenantId, setItems, () => setFailed(true));
  }, [tenantId, retryKey]);

  if (!tenantId || !user) return <AccessGuard title="Salon yönetici oturumu gerekli" />;

  const publish = async () => {
    if (!title.trim() || sending) return;
    setSending(true);
    try {
      await createAnnouncement({ tenantId, title, body, createdBy: user.uid, createdByName: user.displayName ?? undefined });
      setTitle('');
      setBody('');
      toast.success('Duyuru yayınlandı, üyelere bildirim gitti');
    } catch (e) {
      reportError(e, toast, 'Yayınlanamadı, tekrar dene.');
    } finally {
      setSending(false);
    }
  };

  const remove = (a: Announcement) =>
    confirmDestructive({
      title: 'Duyuruyu kaldır',
      message: `"${a.title}" üyelerin ekranından kalkacak. Gönderilmiş bildirim geri alınamaz.`,
      confirmLabel: 'Kaldır',
      onConfirm: () => void deleteAnnouncement(a.id).catch((e) => reportError(e, toast, 'Kaldırılamadı, tekrar dene.')),
    });

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.sm, paddingBottom: spacing.lg }}>
      <Card style={{ gap: 10 }}>
        <Text variant="label" tone="sub">
          YENİ DUYURU
        </Text>
        <TextField placeholder="Başlık — örn. Pazar kapalıyız" value={title} onChangeText={(v) => setTitle(v.slice(0, ANNOUNCEMENT_TITLE_MAX))} />
        <TextField placeholder="Açıklama (isteğe bağlı)" value={body} onChangeText={(v) => setBody(v.slice(0, ANNOUNCEMENT_BODY_MAX))} multiline />
        <Text variant="label" tone="sub">
          Tüm üye ve antrenörlere bildirim gider; ana ekranda {ANNOUNCEMENT_DEFAULT_DAYS} gün kalır.
        </Text>
        <Button label={sending ? '…' : 'Yayınla'} disabled={!title.trim() || sending} onPress={publish} />
      </Card>

      <Text variant="label" tone="sub" style={{ marginTop: spacing.xs }}>
        YAYINDA
      </Text>
      {failed ? (
        <ErrorNotice message="Duyurular alınamadı." onRetry={() => { setFailed(false); setRetryKey((k) => k + 1); }} />
      ) : items === undefined ? (
        <Text variant="helper" tone="sub">
          Yükleniyor…
        </Text>
      ) : items.length === 0 ? (
        <EmptyState icon="megaphone-outline" title="Henüz duyuru yok" description="İlk duyurunu yukarıdan yayınla." />
      ) : (
        items.map((a) => (
          <Card key={a.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <Text variant="helper" weight="700" style={{ flex: 1 }}>
                {a.title}
              </Text>
              <Text variant="label" tone="sub">
                {when(a.createdAt)}{isLive(a) ? '' : ' · süresi doldu'}
              </Text>
            </View>
            {a.body ? (
              <Text variant="label" tone="sub">
                {a.body}
              </Text>
            ) : null}
            <View style={{ alignItems: 'flex-end' }}>
              <Button label="Kaldır" variant="ghost" compact onPress={() => remove(a)} />
            </View>
          </Card>
        ))
      )}
      <Text variant="label" tone="sub" style={{ color: colors.sub }}>
        Duyuru düzenlenemez — yanlış yazıldıysa kaldırıp yeniden yayınla.
      </Text>
    </ScrollView>
  );
}
