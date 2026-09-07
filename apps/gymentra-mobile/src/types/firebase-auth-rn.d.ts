// firebase's published type declarations resolve through the "types"
// export condition, which always points at auth-public.d.ts regardless of
// platform — so getReactNativePersistence never shows up there even though
// it is genuinely exported by the "react-native" runtime build that Metro
// resolves. This augmentation restores the type for that one export.
// See: node_modules/@firebase/auth/dist/src/platform_react_native/persistence/react_native.d.ts
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
