import { describe, expect, it } from 'vitest';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { SessionRuleError } from '../errors';
import { SYSTEM_EXERCISES } from '../seed/systemExercises';
import { syncSystemExercises } from './dexieExerciseRepository';
import { createDexiePlanRepository } from './dexiePlanRepository';
import { createDexieSessionRepository } from './dexieSessionRepository';

const nextDatabaseName = isolatedDatabaseNames();
const BENCH = SYSTEM_EXERCISES[0]?.id ?? '';
const at = (day: number, minutes = 0) => new Date(2026, 10, day, 18, minutes, 0);

/** Plan "PPL" / "Push" with bench 3 × 8–12 @ 60 kg. */
async function setup() {
  const db = new TrainingDatabase(nextDatabaseName());
  await syncSystemExercises(db);
  const plans = createDexiePlanRepository(db);
  const sessions = createDexieSessionRepository(db);
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
  const day = await plans.addDay(plan.id, 'Push');
  await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
  for (const set of (await plans.getDay(day.id))?.exercises[0]?.sets ?? []) {
    await plans.updateSet(set.id, { targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12 });
  }
  return { db, sessions, dayId: day.id };
}

async function finishedWorkout(
  sessions: ReturnType<typeof createDexieSessionRepository>,
  dayId: string,
  date: number,
  kg: number,
  reps: number,
) {
  const detail = await sessions.startFromPlanDay(dayId, at(date));
  for (const set of detail.exercises[0]?.sets ?? []) {
    await sessions.updateSet(set.id, { actualWeightKg: kg, actualReps: reps });
    await sessions.setSetStatus(set.id, 'completed', at(date, 5));
  }
  return sessions.finish(detail.session.id, {}, at(date, 40));
}

describe('history of finished workouts', () => {
  it('lists only finished workouts, newest first, with every set', async () => {
    const { db, sessions, dayId } = await setup();
    const first = await finishedWorkout(sessions, dayId, 2, 60, 10);
    const second = await finishedWorkout(sessions, dayId, 9, 62.5, 10);
    const active = await sessions.startFromPlanDay(dayId, at(16));
    const abandoned = await sessions.startEmpty('Pusty', at(17)).catch(() => null);
    expect(abandoned).toBeNull(); // one active workout at a time

    const seen = await new Promise<string[]>((resolve) => {
      const stop = sessions.observeCompleted((list) => {
        stop();
        resolve(list.map(({ session }) => session.id));
      });
    });
    expect(seen).toEqual([second.session.id, first.session.id]);
    expect(seen).not.toContain(active.session.id);
    db.close();
  });

  it('corrects a recorded set of a finished workout and keeps the plan values', async () => {
    const { db, sessions, dayId } = await setup();
    const done = await finishedWorkout(sessions, dayId, 2, 60, 10);
    const setId = done.exercises[0]?.sets[0]?.id ?? '';

    const edited = await sessions.updateFinishedSet(
      setId,
      { actualWeightKg: 65, actualReps: 9, actualRIR: 1 },
      at(3),
    );

    expect(edited).toMatchObject({
      status: 'completed',
      actualWeightKg: 65,
      actualReps: 9,
      actualRIR: 1,
      plannedWeightKg: 60,
    });
    const stored = await sessions.get(done.session.id);
    expect(stored?.exercises[0]?.sets[0]).toMatchObject({ actualWeightKg: 65 });
    expect(stored?.session.updatedAt).toBe(at(3).toISOString());
    expect(stored?.session.status).toBe('completed');
    db.close();
  });

  it('switches a set between completed and failed; completing needs a result', async () => {
    const { db, sessions, dayId } = await setup();
    const done = await finishedWorkout(sessions, dayId, 2, 60, 10);
    const setId = done.exercises[0]?.sets[0]?.id ?? '';

    expect((await sessions.updateFinishedSet(setId, { status: 'failed' })).status).toBe('failed');
    expect((await sessions.updateFinishedSet(setId, { status: 'completed' })).status).toBe('completed');

    await sessions.updateFinishedSet(setId, { status: 'failed', actualReps: undefined });
    const refused = await sessions.updateFinishedSet(setId, { status: 'completed' }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SessionRuleError);
    expect(refused).toMatchObject({ violation: 'missing-result', missing: 'reps' });
    db.close();
  });

  it('refuses to edit a set or a workout that is still in progress', async () => {
    const { db, sessions, dayId } = await setup();
    const active = await sessions.startFromPlanDay(dayId, at(2));
    const setId = active.exercises[0]?.sets[0]?.id ?? '';

    expect(await sessions.updateFinishedSet(setId, { actualReps: 5 }).catch((e: unknown) => e)).toMatchObject(
      {
        violation: 'not-finished',
      },
    );
    expect(
      await sessions.updateFinishedSession(active.session.id, { notes: 'x' }).catch((e: unknown) => e),
    ).toMatchObject({
      violation: 'not-finished',
    });
    expect((await sessions.get(active.session.id))?.exercises[0]?.sets[0]?.actualReps).toBeUndefined();
    db.close();
  });

  it('edits the note and rating, and clears them again', async () => {
    const { db, sessions, dayId } = await setup();
    const done = await finishedWorkout(sessions, dayId, 2, 60, 10);

    const edited = await sessions.updateFinishedSession(done.session.id, {
      notes: 'Dobry dzień',
      wellbeingRating: 4,
    });
    expect(edited).toMatchObject({ notes: 'Dobry dzień', wellbeingRating: 4 });

    const cleared = await sessions.updateFinishedSession(done.session.id, { notes: undefined });
    expect(cleared.notes).toBeUndefined();
    expect(cleared.wellbeingRating).toBe(4);
    db.close();
  });

  it('rejects impossible values and unknown ids without writing', async () => {
    const { db, sessions, dayId } = await setup();
    const done = await finishedWorkout(sessions, dayId, 2, 60, 10);
    const setId = done.exercises[0]?.sets[0]?.id ?? '';

    await expect(sessions.updateFinishedSet(setId, { actualReps: -3 })).rejects.toThrow();
    expect((await sessions.get(done.session.id))?.exercises[0]?.sets[0]?.actualReps).toBe(10);
    await expect(sessions.updateFinishedSet('nope', { actualReps: 3 })).rejects.toMatchObject({
      violation: 'set-not-found',
    });
    await expect(sessions.updateFinishedSession('nope', {})).rejects.toMatchObject({
      violation: 'session-not-found',
    });
    db.close();
  });

  it('deletes a finished workout with everything that belongs to it, and nothing else', async () => {
    const { db, sessions, dayId } = await setup();
    const keep = await finishedWorkout(sessions, dayId, 2, 60, 10);
    const gone = await finishedWorkout(sessions, dayId, 9, 62.5, 10);

    await sessions.deleteFinishedSession(gone.session.id);

    expect(await db.workoutSessions.get(gone.session.id)).toBeUndefined();
    expect(await db.sessionExercises.where('sessionId').equals(gone.session.id).count()).toBe(0);
    const goneSetIds = new Set(gone.exercises.flatMap(({ sets }) => sets.map((set) => set.id)));
    expect((await db.sessionSets.toArray()).filter((set) => goneSetIds.has(set.id))).toEqual([]);
    expect(await db.workoutSessions.get(keep.session.id)).toBeDefined();
    expect(await db.sessionSets.count()).toBeGreaterThan(0);
    await sessions.deleteFinishedSession(gone.session.id); // idempotent
  });

  it('refuses to delete a workout that is still active', async () => {
    const { sessions, dayId } = await setup();
    const active = await sessions.startFromPlanDay(dayId, at(16));
    await expect(sessions.deleteFinishedSession(active.session.id)).rejects.toMatchObject({
      violation: 'not-finished',
    });
  });
});
