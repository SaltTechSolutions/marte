import { deliverOutbox } from './jobs/outboxDelivery';
import { runPackageJobs } from './jobs/packageJobs';
import { runClassReminders } from './groupClasses';
import { sendPtReminders } from './ptReminders';
import type { Env } from './types';

/** Cron expressions (UTC) — keep in sync with wrangler.jsonc `triggers.crons`. Istanbul is UTC+3 all year. */
export const CRON_OUTBOX = '* * * * *';
export const CRON_REMINDERS = '*/15 * * * *';
export const CRON_DAILY = '5 21 * * *';   // 00:05 Istanbul

/**
 * One Worker `scheduled` entry for all triggers. A failing job never blocks the others, and every job
 * is idempotent, so a retried or overlapping trigger is harmless.
 */
export async function runScheduled(env: Env, cron: string, now = Date.now()): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const attempt = async (name: string, fn: () => Promise<unknown>) => {
    try { out[name] = await fn(); } catch (e) { out[name] = { error: String((e as Error).message) }; console.error(`[cron ${cron}] ${name} failed`, e); }
  };
  if (cron === CRON_OUTBOX) await attempt('outbox', () => deliverOutbox(env, now));
  if (cron === CRON_REMINDERS) {
    await attempt('classReminders', () => runClassReminders(env.DB, now));
    await attempt('ptReminders', () => sendPtReminders(env.DB, now));
  }
  if (cron === CRON_DAILY) await attempt('packageJobs', () => runPackageJobs(env.DB, now));
  return out;
}
