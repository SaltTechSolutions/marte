import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { reportError } from '@/data/errors';
import { MEMBER_ADMIN_NOTE_MAX, setMemberAdminNote, watchMemberAdminNote } from '@/data/firebase/memberAdminNoteRepo';
import { MEMBER_NOTE_MAX, setMemberNote, watchMemberNote } from '@/data/firebase/memberNoteRepo';
import { MemberNote } from '@/data/types';
import { useAppTheme } from '@/theme/ThemeContext';

import { Button } from './Button';
import { Card } from './Card';
import { Text } from './Text';
import { TextField } from './TextField';
import { useToast } from './Toast';

function formatWhen(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

/**
 * The coach's note about a member (PER-14c) — injury, goal, what to watch.
 *
 * Shared by the gym's staff and never shown to the member; the rules enforce
 * the second part, not this component. Edits are explicit (Düzenle → Kaydet)
 * rather than saved on every keystroke: a note about someone's knee is worth
 * a deliberate save, and a half-typed thought must not land in front of the
 * next coach who opens the screen.
 *
 * `kind="admin"` is the owner's private note (14 Oct 2026): the same card
 * against a second, admin-only collection. A trainer never reaches it — the
 * admin detail screen is the only place it is mounted, and the rules refuse
 * everyone but admins regardless.
 */
type NoteKind = 'trainer' | 'admin';

const NOTE_COPY: Record<NoteKind, { title: string; badge: string; placeholder: string; max: number }> = {
  trainer: {
    title: 'ANTRENÖR NOTU',
    badge: 'üye görmez',
    placeholder: 'Sakatlık, hedef, dikkat edilecekler…',
    max: MEMBER_NOTE_MAX,
  },
  admin: {
    title: 'ÖZEL NOT',
    badge: 'yalnızca yöneticiler görür',
    placeholder: 'Ödeme düzeni, şikâyet, aile durumu…',
    max: MEMBER_ADMIN_NOTE_MAX,
  },
};

export function MemberNoteCard({
  tenantId,
  memberId,
  kind = 'trainer',
}: {
  tenantId: string;
  memberId: string;
  kind?: NoteKind;
}) {
  const copy = NOTE_COPY[kind];
  const watchNote = kind === 'admin' ? watchMemberAdminNote : watchMemberNote;
  const saveNote = kind === 'admin' ? setMemberAdminNote : setMemberNote;
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const toast = useToast();
  const [note, setNote] = useState<MemberNote | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    return watchNote(tenantId, memberId, setNote, () => setFailed(true));
  }, [watchNote, tenantId, memberId]);

  const startEdit = () => {
    setDraft(note?.text ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (!user || saving) return;
    setSaving(true);
    try {
      await saveNote({
        tenantId,
        memberId,
        text: draft,
        updatedBy: user.uid,
        updatedByName: user.displayName ?? undefined,
      });
      setEditing(false);
    } catch (e) {
      reportError(e, toast, 'Not kaydedilemedi, tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="label" tone="sub">
          {copy.title}
        </Text>
        <Text variant="label" tone="sub">
          {copy.badge}
        </Text>
      </View>

      {editing ? (
        <>
          <TextField
            value={draft}
            onChangeText={(v) => setDraft(v.slice(0, copy.max))}
            placeholder={copy.placeholder}
            multiline
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Vazgeç" variant="ghost" compact style={{ flex: 1 }} disabled={saving} onPress={() => setEditing(false)} />
            <Button label={saving ? '…' : 'Kaydet'} compact style={{ flex: 1 }} disabled={saving} onPress={save} />
          </View>
        </>
      ) : failed ? (
        <Text variant="helper" style={{ color: colors.danger }}>
          Not yüklenemedi.
        </Text>
      ) : note === undefined ? (
        <Text variant="helper" tone="sub">
          Yükleniyor…
        </Text>
      ) : (
        <>
          <Text variant="helper" tone={note ? undefined : 'sub'}>
            {note ? note.text : 'Henüz not yok.'}
          </Text>
          {note ? (
            <Text variant="label" tone="sub">
              {note.updatedByName ? `${note.updatedByName} · ` : ''}
              {formatWhen(note.updatedAt)}
            </Text>
          ) : null}
          <Button label={note ? 'Düzenle' : 'Not ekle'} variant="secondary" compact onPress={startEdit} />
        </>
      )}
    </Card>
  );
}
