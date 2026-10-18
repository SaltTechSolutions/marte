import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://worker.test');
vi.mock('@/services/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

const { startWorld } = await import('./testWorld');
const repo = await import('./programTemplateRepo');

type World = Awaited<ReturnType<typeof startWorld>>;
let w: World;
const stops: (() => void)[] = [];
const track = (stop: () => void) => { stops.push(stop); return stop; };

const tpl = (id: string, tenant: string | null, data: Record<string, unknown>, at = 1) =>
  w.h.run(`INSERT INTO program_templates (id, tenant_id, data, updated_at) VALUES (?, ?, ?, ?)`, id, tenant, JSON.stringify(data), at);

beforeEach(async () => {
  w = await startWorld();   // u-mem is an active member of t1
  await w.h.run(`INSERT INTO tenants (id, code, name, created_at) VALUES ('t2','T2','Other',1)`);
  w.signInAs('fb-mem');
});
afterEach(() => stops.splice(0).forEach((s) => s()));

const full = {
  category: 'Güç', level: 'beginner', title: 'Tam gövde', durationMinutes: 45, weeklyFrequency: 'Haftada 3 gün',
  equipment: ['barbell'], summary: 'Özet', limits: ['Karın yok'], sources: ['acsm'], warmup: 'warmup-general',
  days: [{ name: 'Gün 1', exercises: [{ name: 'Squat', type: 'weight', sets: 3, reps: 8, restSeconds: 90, cue: 'Sırt düz', targetWeightKg: null }] }],
  sessionsPerWeek: 3, targets: ['quads'], goal: { wants: 'Güçlenmek', because: 'Kanıt', pairsWith: 'x' },
};

describe('watchProgramTemplates', () => {
  it('maps a full template; the tenant COLUMN wins over a tenantId in the body', async () => {
    await tpl('tp-full', 't1', { ...full, tenantId: 't2' });
    const got: any[] = [];
    track(repo.watchProgramTemplates('t1', (t) => got.push(t)));
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0]).toEqual([{ id: 'tp-full', tenantId: 't1', ...full }]);
  });

  it('fills the documented defaults for a sparse global template (no tenant)', async () => {
    await tpl('tp-sparse', null, { title: undefined });
    const got: any[] = [];
    track(repo.watchProgramTemplates('t1', (t) => got.push(t)));
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0]).toEqual([{
      id: 'tp-sparse', tenantId: null, category: '', level: 'all', title: 'tp-sparse', durationMinutes: 0, weeklyFrequency: '',
      equipment: [], summary: '', limits: [], sources: [], days: [],
    }]);
  });

  it('own gym first, then global, each group by Turkish title; never another gym\'s template', async () => {
    await w.h.run(`INSERT INTO memberships (tenant_id, member_id, status, roles, requested_at) VALUES ('t2','u-mem','active','["member"]',1)`);   // visible to the caller, but a different gym
    await tpl('g-1', null, { title: 'Ördek' });
    await tpl('g-2', null, { title: 'Çember' });
    await tpl('own-2', 't1', { title: 'Zeytin' });
    await tpl('own-1', 't1', { title: 'Ağırlık' });
    await tpl('other', 't2', { title: 'Başka salon' });
    const got: any[] = [];
    track(repo.watchProgramTemplates('t1', (t) => got.push(t)));
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0].map((t: any) => t.id)).toEqual(['own-1', 'own-2', 'g-2', 'g-1']);
  });

  it('a gym the caller does not belong to contributes nothing, even when asked for by id', async () => {
    await tpl('other', 't2', { title: 'Başka salon' });
    await tpl('glob', null, { title: 'Ortak' });
    const got: any[] = [];
    track(repo.watchProgramTemplates('t2', (t) => got.push(t)));
    await vi.waitFor(() => expect(got.length).toBe(1));
    expect(got[0].map((t: any) => t.id)).toEqual(['glob']);
    expect(await repo.getProgramTemplate('other')).toBeNull();
  });

  it('reports a failure through onError', async () => {
    const err = vi.fn();
    const { __setApiTransport } = await import('./client');
    __setApiTransport((async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 })) as never, async () => 'x');
    track(repo.watchProgramTemplates('t1', () => {}, err));
    await vi.waitFor(() => expect(err).toHaveBeenCalledTimes(1));
    expect(err.mock.calls[0][0]).toMatchObject({ code: 'functions/internal' });
  });
});

describe('getProgramTemplate', () => {
  it('returns one template (a warm-up block is a template too), or null', async () => {
    await tpl('warmup-general', null, { title: 'Genel ısınma', days: [{ name: 'Isınma', exercises: [] }] });
    expect(await repo.getProgramTemplate('warmup-general')).toMatchObject({ id: 'warmup-general', tenantId: null, title: 'Genel ısınma' });
    expect(await repo.getProgramTemplate('nope')).toBeNull();
  });
});
