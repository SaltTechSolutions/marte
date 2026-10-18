import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));
vi.setConfig({ testTimeout: 60_000 });
const resize = vi.fn();
const dropTemp = vi.fn(async () => {});
vi.mock('./imageTools', () => ({ resizeToJpeg: resize, dropTemp }));

const { startWorld } = await import('./testWorld');
const { uploadMemberPhoto, deleteMemberPhoto } = await import('./memberPhotoRepo');
const { uploadTenantLogo } = await import('./tenantRepo');

const jpegB64 = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, ...new Array(30).fill(1)));

beforeEach(() => {
  resize.mockReset().mockResolvedValue({ uri: 'file:///tmp/r.jpg', base64: jpegB64 });
  dropTemp.mockClear();
});

describe('media repos (R2 through the Worker)', () => {
  it('member photo: resized, uploaded, public URL returned, temp file removed, deletable', async () => {
    const w = await startWorld();
    const url = await uploadMemberPhoto('file:///pick.jpg');
    expect(url).toMatch(/\/media\/members\/u-mem\/[0-9a-f]{32}\.jpg$/);
    expect(w.h.media.store.size).toBe(1);
    expect(dropTemp).toHaveBeenCalledWith('file:///tmp/r.jpg');
    await deleteMemberPhoto();
    expect(w.h.media.store.size).toBe(0);
  });

  it('gym logo: admin only; a refusal still removes the temp file', async () => {
    const w = await startWorld();
    w.signInAs('fb-admin');
    expect(await uploadTenantLogo('t1', 'file:///logo.png')).toMatch(/\/media\/tenants\/t1\//);
    w.signInAs('fb-mem');
    await expect(uploadTenantLogo('t1', 'file:///logo.png')).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect(dropTemp).toHaveBeenCalledTimes(2);
  });

  it('a conversion that yields no bytes fails before any request', async () => {
    const w = await startWorld();
    resize.mockRejectedValue(new Error('Görsel dönüştürülemedi.'));
    await expect(uploadMemberPhoto('file:///pick.jpg')).rejects.toThrow(/dönüştürülemedi/);
    expect(w.h.media.store.size).toBe(0);
  });
});
