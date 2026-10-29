import { beforeEach, describe, expect, it, vi } from 'vitest';

import { refusal, world } from './membershipTestKit';
import * as repo from './exerciseReportRepo';

vi.hoisted(() => { process.env.EXPO_PUBLIC_API_URL = 'http://worker.test'; });   // before client.ts is imported
vi.mock('@/services/firebase', () => ({ app: {}, db: {}, auth: { currentUser: null } }));
vi.mock('react-native', () => ({ AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } }));

type W = Awaited<ReturnType<typeof world>>;
let w: W;
beforeEach(async () => { w = await world(); await w.h.run(`UPDATE users SET display_name = 'Yönetici' WHERE id = 'u-admin'`); });

const report = (over: Partial<Parameters<typeof repo.reportExercise>[0]> = {}) =>
  repo.reportExercise({ exerciseId: 'squat', exerciseName: 'Squat', tenantId: 't1', reportedBy: 'fb-admin', reportedByName: 'yok sayılır', reason: 'pose', note: '  Diz yanlış  ', ...over });

describe('exercise reports', () => {
  it('staff files a report; the reporter comes from the signed-in user and the note is trimmed', async () => {
    w.as('admin');
    await report();
    expect(await w.h.one(`SELECT exercise_id, exercise_name, tenant_id, reported_by, reported_by_name, reason, note FROM exercise_reports`)).toEqual({
      exercise_id: 'squat', exercise_name: 'Squat', tenant_id: 't1', reported_by: 'u-admin', reported_by_name: 'Yönetici', reason: 'pose', note: 'Diz yanlış',
    });
  });

  it('an over-long note is cut to 500 instead of refused', async () => {
    w.as('admin');
    await report({ note: 'n'.repeat(700) });
    expect((await w.h.one(`SELECT length(note) AS n FROM exercise_reports`)).n).toBe(500);
  });

  it('a plain member and a bad reason are refused', async () => {
    expect((await refusal(report())).code).toBe('functions/permission-denied');
    w.as('admin');
    expect((await refusal(report({ reason: 'weird' as never }))).code).toBe('functions/invalid-argument');
  });
});
