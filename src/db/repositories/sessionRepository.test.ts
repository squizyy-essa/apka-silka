import { describe, expect, it, vi } from 'vitest';
import { localDateOf } from '@/shared/lib/localDate';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { SessionRuleError } from '../errors';
import { SYSTEM_EXERCISES } from '../seed/systemExercises';
import { syncSystemExercises } from './dexieExerciseRepository';
import { createDexiePlanRepository } from './dexiePlanRepository';
import { createDexieSessionRepository } from './dexieSessionRepository';
import type { SessionDetail } from './types';

const nextDatabaseName = isolatedDatabaseNames();
const [BENCH, INCLINE, FLY] = SYSTEM_EXERCISES.map((seed) => seed.id) as [string, string, string];
const NOW = new Date(2026, 10, 16, 18, 30, 0);

async function setup() {
  const db = new TrainingDatabase(nextDatabaseName());
  await syncSystemExercises(db);
  const plans = createDexiePlanRepository(db);
  const sessions = createDexieSessionRepository(db);
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'fixed' });
  const day = await plans.addDay(plan.id, 'Push');
  const bench = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
  const incline = await plans.addExercise(day.id, INCLINE, { restSeconds: 90 });
  await plans.addExercise(day.id, FLY, { restSeconds: 60 });
  const benchSets = (await plans.getDay(day.id))?.exercises[0]?.sets ?? [];
  await plans.updateSet(benchSets[0]?.id ?? '', { type: 'warmup', targetWeightKg: 20, targetRepsMin: 15, targetRepsMax: 15 });
  await plans.updateSet(benchSets[1]?.id ?? '', { targetWeightKg: 62.5, targetRepsMin: 8, targetRepsMax: 12, targetRIR: 2 });
  await plans.updateExercise(bench.id, { progressionIncrementKg: 5, notes: 'Łopatki', alternativeExerciseIds: [FLY] });
  await plans.setTempoForAllSets(bench.id, '3-1-1-0');
  return { db, plans, sessions, plan, day, bench, incline };
}

describe('localDateOf (edge case 18)', () => {
  it('uses the device calendar date, also just after midnight and late in the evening', () => {
    expect(localDateOf(new Date(2026, 10, 16, 0, 5))).toBe('2026-11-16');
    expect(localDateOf(new Date(2026, 10, 16, 23, 55))).toBe('2026-11-16');
    expect(localDateOf(new Date(2026, 0, 3, 12, 0))).toBe('2026-01-03');
  });
});

describe('starting a workout', () => {
  it('copies the plan day into the session: exercises, sets, rests, notes, alternatives', async () => {
    const { db, sessions, plan, day } = await setup();

    const detail = await sessions.startFromPlanDay(day.id, NOW);

    expect(detail.session).toMatchObject({
      name: 'Push',
      status: 'active',
      sourcePlanId: plan.id,
      sourcePlanDayId: day.id,
      startedAt: NOW.toISOString(),
      localWorkoutDate: '2026-11-16',
    });
    expect(detail.session.completedAt).toBeUndefined();
    expect(detail.exercises.map((e) => [e.exercise.exerciseNameSnapshot, e.exercise.order])).toEqual([
      ['Wyciskanie sztangi na ławce poziomej', 0],
      ['Wyciskanie sztangi na ławce skośnej', 1],
      ['Wyciskanie hantli na ławce poziomej', 2],
    ]);
    const bench = detail.exercises[0];
    expect(bench?.exercise).toMatchObject({
      exerciseId: BENCH,
      measurementTypeSnapshot: 'weight_reps',
      restSecondsSnapshot: 120,
      progressionIncrementKgSnapshot: 5,
      alternativeExerciseIdsSnapshot: [FLY],
      notes: 'Łopatki',
      isSkipped: false,
    });
    expect(bench?.sets.map((s) => [s.type, s.status, s.plannedWeightKg, s.plannedRepsMin, s.plannedRepsMax, s.plannedRIR, s.tempo])).toEqual([
      ['warmup', 'pending', 20, 15, 15, undefined, '3-1-1-0'],
      ['working', 'pending', 62.5, 8, 12, 2, '3-1-1-0'],
      ['working', 'pending', undefined, undefined, undefined, undefined, '3-1-1-0'],
    ]);
    // Nothing is recorded as done yet – no invented results.
    expect(bench?.sets.every((s) => s.actualReps === undefined && s.actualWeightKg === undefined && s.completedAt === undefined)).toBe(true);
    expect(await db.sessionSets.count()).toBe(9);
    db.close();
  });

  it('snapshots supersets with their round rest', async () => {
    const { db, plans, sessions, day, bench } = await setup();
    await plans.linkWithNextExercise(bench.id);
    const groupId = (await plans.getDay(day.id))?.supersetGroups[0]?.id ?? '';
    await plans.updateSupersetRest(groupId, 150);

    const detail = await sessions.startFromPlanDay(day.id, NOW);

    expect(detail.exercises.map((e) => [e.exercise.supersetGroupId === groupId, e.exercise.supersetRestSecondsSnapshot])).toEqual([
      [true, 150],
      [true, 150],
      [false, undefined],
    ]);
    db.close();
  });

  it('is unaffected by later edits or deletion of the plan (edge cases 6, 27)', async () => {
    const { db, plans, sessions, plan, day, incline } = await setup();
    const started = await sessions.startFromPlanDay(day.id, NOW);

    await plans.updateDay(day.id, { name: 'Zmieniona nazwa' });
    await plans.removeExercise(incline.id);
    const sets = (await plans.getDay(day.id))?.exercises[0]?.sets ?? [];
    await plans.updateSet(sets[1]?.id ?? '', { targetWeightKg: 100 });
    expect(await sessions.getActive()).toEqual(started);

    await plans.deletePlan(plan.id);
    expect(await sessions.getActive()).toEqual(started);
    db.close();
  });

  it('starts an empty workout without a plan', async () => {
    const { db, sessions } = await setup();

    const detail = await sessions.startEmpty('  Trening bez planu ', NOW);

    expect(detail.session).toMatchObject({ name: 'Trening bez planu', status: 'active' });
    expect('sourcePlanId' in detail.session).toBe(false);
    expect(detail.exercises).toEqual([]);
    db.close();
  });

  it('never creates a second active session (edge case 4), even on a double tap or from two tabs', async () => {
    const { db, sessions, day } = await setup();
    const secondTab = createDexieSessionRepository(new TrainingDatabase(db.name));

    const results = await Promise.allSettled([
      sessions.startFromPlanDay(day.id, NOW),
      sessions.startFromPlanDay(day.id, NOW),
      secondTab.startEmpty('Inny', NOW),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(SessionRuleError);
        expect((result.reason as SessionRuleError).violation).toBe('already-active');
      }
    }
    expect(await db.workoutSessions.where('status').equals('active').count()).toBe(1);
    // A refused start leaves no orphaned exercises or sets behind.
    const active = await sessions.getActive();
    expect(await db.sessionExercises.count()).toBe(active?.exercises.length);
    db.close();
  });

  it('reports a missing plan day and writes nothing', async () => {
    const { db, sessions } = await setup();
    await expect(sessions.startFromPlanDay(crypto.randomUUID(), NOW)).rejects.toMatchObject({ violation: 'day-not-found' });
    expect(await db.workoutSessions.count()).toBe(0);
    db.close();
  });
});

describe('active session', () => {
  it('is found again after closing and reopening the database (edge cases 1, 2)', async () => {
    const { db, sessions, day } = await setup();
    const started = await sessions.startFromPlanDay(day.id, NOW);
    const name = db.name;
    db.close();

    const reopened = new TrainingDatabase(name);
    expect(await createDexieSessionRepository(reopened).getActive()).toEqual(started);
    reopened.close();
  });

  it('is observable: null → session → null after abandoning', async () => {
    const { db, sessions, day } = await setup();
    const seen: (SessionDetail | null)[] = [];
    const stop = sessions.observeActive((value) => seen.push(value));
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull());

    const started = await sessions.startFromPlanDay(day.id, NOW);
    await vi.waitFor(() => expect(seen.at(-1)?.session.id).toBe(started.session.id));

    await sessions.abandon(started.session.id, NOW);
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull());
    stop();
    db.close();
  });

  it('abandoning keeps the record, frees the slot for a new workout and cannot be repeated', async () => {
    const { db, sessions, day } = await setup();
    const started = await sessions.startFromPlanDay(day.id, NOW);

    await sessions.abandon(started.session.id, NOW);

    expect((await db.workoutSessions.get(started.session.id))?.status).toBe('abandoned');
    expect(await db.sessionSets.count()).toBe(9);
    expect(await sessions.getActive()).toBeNull();
    await expect(sessions.abandon(started.session.id, NOW)).rejects.toMatchObject({ violation: 'not-active' });
    await expect(sessions.abandon(crypto.randomUUID(), NOW)).rejects.toMatchObject({ violation: 'session-not-found' });
    expect((await sessions.startEmpty('Nowy', NOW)).session.status).toBe('active');
    db.close();
  });
});
