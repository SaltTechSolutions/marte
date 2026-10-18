import React from 'react';
import { SvgXml } from 'react-native-svg';

import { avatarById } from '@/utils/avatars';

/**
 * One of the predefined avatars at any size. The artwork is a complete 100x100 disc (ring and symbol included),
 * so it needs no frame; an id that is not in the catalogue draws nothing and the caller falls back to initials.
 * Decorative: whoever places it names the person or the option.
 */
export function AvatarGlyph({ id, size }: { id: string | null | undefined; size: number }) {
  const avatar = avatarById(id);
  if (!avatar) return null;
  return <SvgXml xml={avatar.xml} width={size} height={size} accessible={false} />;
}
