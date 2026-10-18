import { AVATARS, type AvatarDef } from '@/data/avatars.generated';

/** The catalogue entry for an id; `null` for an unknown, empty or removed id (the caller then shows initials). */
export function avatarById(id: string | null | undefined): AvatarDef | null {
  if (!id) return null;
  return AVATARS.find((a) => a.id === id) ?? null;
}

export const isAvatarId = (id: unknown): id is string => typeof id === 'string' && avatarById(id) !== null;

/**
 * Refuses an id the Worker would refuse, before any request. The server answers a bad id with a bare field name,
 * which is not a sentence a person can act on; this one is. Shaped like a callable error so `reportError` shows it.
 */
export function assertAvatarId(id: string | null): void {
  if (id === null || isAvatarId(id)) return;
  throw Object.assign(new Error('Bu avatar seçilemedi, listeden başka bir tane seç.'), { code: 'functions/invalid-argument' });
}

/** Up to two initials; `?` when the name has none. */
export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** What a member mark shows: the avatar when the id is one we know, otherwise the initials. */
export type MemberMark = { kind: 'avatar'; avatar: AvatarDef } | { kind: 'initials'; initials: string };

export function memberMark(name: string, avatarId: string | null | undefined): MemberMark {
  const avatar = avatarById(avatarId);
  return avatar ? { kind: 'avatar', avatar } : { kind: 'initials', initials: initialsOf(name) };
}

/** Spoken label of a picker option: "Kaya" or "Kaya, seçili". */
export const optionLabel = (name: string, selected: boolean) => (selected ? `${name}, seçili` : name);

export const CLEAR_AVATAR_LABEL = 'Baş harflerimi göster';

export interface PickerOption {
  /** `null` is the "show my initials" option. */
  id: string | null;
  name: string;
  selected: boolean;
  label: string;
}

/**
 * The picker's options in display order. A radio group always has exactly one selected option: an id that is
 * unset or no longer in the catalogue counts as the "initials" option, which is what the member actually sees.
 */
export function pickerOptions(selectedId: string | null | undefined): { avatars: PickerOption[]; clear: PickerOption } {
  const current = avatarById(selectedId)?.id ?? null;
  return {
    avatars: AVATARS.map((a) => ({ id: a.id, name: a.name, selected: a.id === current, label: optionLabel(a.name, a.id === current) })),
    clear: { id: null, name: CLEAR_AVATAR_LABEL, selected: current === null, label: optionLabel(CLEAR_AVATAR_LABEL, current === null) },
  };
}
