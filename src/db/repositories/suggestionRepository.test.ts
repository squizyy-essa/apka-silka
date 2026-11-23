import { describe, expect, it } from 'vitest';
import { planChangesOf, recommendNextSession, type ExerciseResult } from '@/progression';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { PlanRuleError, SessionRuleError } from '../errors';
import { SYSTEM_EXERCISES } from '../seed/systemExercises';
import { syncSystemExercises } from './dexieExerciseRepository';
import { createDexiePlanRepository } from './dexiePlanRepository';
import { createDexieSessionRepository } from './dexieSessionRepository';
import { createDexieSuggestionRepository } from './dexieSuggestionRepository';
import type { ExerciseOccurrence, PlanSuggestionInput } from './types';

const nextDatabaseName = isolatedDatabaseNames();
const BENCH = SYSTEM_EXERCISES[0]?.id ?? '';
const at = (day: number, minutes = 0) => new Date(2026, 10, day, 18, minutes, 0);

interface Target {
  readonly weight: number;
  readonly repsMin: number;
  readonly repsMax: number;
  readonly rir?: number;
}

/** One bench exercise with three working sets of the given target; a workout is started from it. */
async function setup(target: Target = { weight: 60, repsMin: 12, repsMax: 12 }) {
  const db = new TrainingDatabase(nextDatabaseName());
  await syncSystemExercises(db);
  const plans = createDexiePlanRepository(db);
  const sessions = createDexieSessionRepository(db);
  const suggestions = createDexieSuggestionRepository(db);
  const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'flexible' });
  const day = await plans.addDay(plan.id, 'Push');
  const planned = await plans.addExercise(day.id, BENCH, { restSeconds: 90 });
  const planSets = (await plans.getDay(day.id))?.exercises[0]?.sets ?? [];
  for (const set of planSets) {
    await plans.updateSet(set.id, {
      targetWeightKg: target.weight,
      targetRepsMin: target.repsMin,
      targetRepsMax: target.repsMax,
      ...(target.rir === undefined ? {} : { targetRIR: target.rir }),
    });
  }
  await plans.updateExercise(planned.id, { progressionIncrementKg: 2.5 });
  const start = async (now: Date) => {
    const detail = await sessions.startFromPlanDay(day.id, now);
    return {
      detail,
      sessionId: detail.session.id,
      exerciseId: detail.exercises[0]?.exercise.id ?? '',
      setIds: detail.exercises[0]?.sets.map((set) => set.id) ?? [],
    };
  };
  const setOf = async (id: string) => {
    const set = await db.sessionSets.get(id);
    if (set === undefined) throw new Error('set missing');
    return set;
  };
  return { db, plans, sessions, suggestions, plan, day, planSets, start, setOf };
}

async function failFirstSet(
  env: Awaited<ReturnType<typeof setup>>,
  setIds: readonly string[],
  reps = 9,
) {
  const [first = ''] = setIds;
  await env.sessions.updateSet(first, { actualWeightKg: 60, actualReps: reps });
  await env.sessions.setSetStatus(first, 'failed', at(16, 5));
  return first;
}

describe('acceptance test E – failed set (storage level)', () => {
  it('applying "lower weight" changes only the next pending set', async () => {
    const env = await setup();
    const { setIds } = await env.start(at(16));
    const [, second = '', third = ''] = setIds;
    const failed = await failFirstSet(env, setIds);

    const result = await env.suggestions.applyFailedSetOption(failed, 'lower_weight', at(16, 6));

    expect(await env.setOf(second)).toMatchObject({
      plannedWeightKg: 57.5,
      plannedRepsMin: 12,
      plannedRepsMax: 12,
      status: 'pending',
    });
    expect(await env.setOf(third)).toMatchObject({ plannedWeightKg: 60 });
    expect(await env.setOf(failed)).toMatchObject({
      status: 'failed',
      plannedWeightKg: 60,
      actualWeightKg: 60,
      actualReps: 9,
    });
    expect(result).toMatchObject({
      source: 'failed_set',
      decision: 'applied',
      chosenOptionIndex: 0,
      sourceSetId: failed,
      appliedToSessionSetId: second,
    });
    expect(result.options.map((option) => option.kind)).toEqual(['lower_weight', 'adjust_reps']);
    expect(result.explanation).toContain('Plan: 60 kg × 12. Wykonano: 60 kg × 9');
    env.db.close();
  });

  it('applying "adjust reps" keeps the weight and sets the target to the reps done', async () => {
    const env = await setup();
    const { setIds } = await env.start(at(16));
    const [, second = ''] = setIds;
    const failed = await failFirstSet(env, setIds);

    const result = await env.suggestions.applyFailedSetOption(failed, 'adjust_reps', at(16, 6));

    expect(await env.setOf(second)).toMatchObject({
      plannedWeightKg: 60,
      plannedRepsMin: 9,
      plannedRepsMax: 9,
    });
    expect(result).toMatchObject({ chosenOptionIndex: 1 });
    env.db.close();
  });

  it('changes nothing until the user decides, and ignoring changes no set', async () => {
    const env = await setup();
    const { setIds, sessionId } = await env.start(at(16));
    const before = await Promise.all(setIds.map(env.setOf));
    const failed = await failFirstSet(env, setIds);
    const afterFail = await Promise.all(setIds.map(env.setOf));
    // Marking the set as failed alone proposes nothing and writes no suggestion.
    expect(afterFail.slice(1)).toEqual(before.slice(1));
    expect(await env.db.progressionSuggestions.count()).toBe(0);

    const ignored = await env.suggestions.ignoreFailedSetSuggestion(failed, at(16, 6));

    expect(ignored).toMatchObject({ decision: 'ignored' });
    expect(ignored.chosenOptionIndex).toBeUndefined();
    expect((await Promise.all(setIds.map(env.setOf))).slice(1)).toEqual(before.slice(1));
    const observed: number[] = [];
    const stop = env.suggestions.observeForSession(sessionId, (list) => observed.push(list.length));
    await new Promise((resolve) => setTimeout(resolve, 50));
    stop();
    expect(observed.at(-1)).toBe(1);
    env.db.close();
  });

  it('refuses a second decision about the same set', async () => {
    const env = await setup();
    const { setIds } = await env.start(at(16));
    const failed = await failFirstSet(env, setIds);
    await env.suggestions.applyFailedSetOption(failed, 'lower_weight');

    await expect(env.suggestions.applyFailedSetOption(failed, 'adjust_reps')).rejects.toMatchObject({
      violation: 'suggestion-decided',
    });
    await expect(env.suggestions.ignoreFailedSetSuggestion(failed)).rejects.toBeInstanceOf(
      SessionRuleError,
    );
    expect(await env.db.progressionSuggestions.count()).toBe(1);
    env.db.close();
  });

  it('never touches a set that is already done: with none pending left it refuses', async () => {
    const env = await setup();
    const { setIds } = await env.start(at(16));
    const [, second = '', third = ''] = setIds;
    const failed = await failFirstSet(env, setIds);
    await env.sessions.updateSet(second, { actualWeightKg: 60, actualReps: 12 });
    await env.sessions.setSetStatus(second, 'completed', at(16, 8));
    await env.sessions.setSetStatus(third, 'skipped', at(16, 9));
    const before = await Promise.all(setIds.map(env.setOf));

    await expect(env.suggestions.applyFailedSetOption(failed, 'lower_weight')).rejects.toMatchObject({
      violation: 'no-target-set',
    });

    expect(await Promise.all(setIds.map(env.setOf))).toEqual(before);
    expect(await env.db.progressionSuggestions.count()).toBe(0);
    env.db.close();
  });

  it('refuses when the set is no longer failed (stale screen)', async () => {
    const env = await setup();
    const { setIds } = await env.start(at(16));
    const failed = await failFirstSet(env, setIds);
    await env.sessions.setSetStatus(failed, 'pending');

    await expect(env.suggestions.applyFailedSetOption(failed, 'lower_weight')).rejects.toMatchObject({
      violation: 'suggestion-outdated',
    });
    env.db.close();
  });

  it('refuses an option that the stored result no longer offers', async () => {
    const env = await setup();
    const { setIds } = await env.start(at(16));
    // 12 reps is not below the target of 12, so there is only the weight option.
    const failed = await failFirstSet(env, setIds, 12);

    await expect(env.suggestions.applyFailedSetOption(failed, 'adjust_reps')).rejects.toMatchObject({
      violation: 'suggestion-outdated',
    });
    env.db.close();
  });

  it('drops a typed value that only repeated the old plan, but keeps a deliberate one', async () => {
    const env = await setup();
    const { setIds } = await env.start(at(16));
    const [, second = '', third = ''] = setIds;
    await env.sessions.updateSet(second, { actualWeightKg: 60 });
    await env.sessions.updateSet(third, { actualWeightKg: 55 });
    const failed = await failFirstSet(env, setIds);

    await env.suggestions.applyFailedSetOption(failed, 'lower_weight');

    const target = await env.setOf(second);
    expect(target.plannedWeightKg).toBe(57.5);
    expect(target.actualWeightKg).toBeUndefined();
    expect(await env.setOf(third)).toMatchObject({ plannedWeightKg: 60, actualWeightKg: 55 });
    env.db.close();
  });

  it('does not decide anything for a workout that is finished', async () => {
    const env = await setup();
    const { setIds, sessionId } = await env.start(at(16));
    const failed = await failFirstSet(env, setIds);
    await env.sessions.finish(sessionId, {}, at(16, 30));

    await expect(env.suggestions.applyFailedSetOption(failed, 'lower_weight')).rejects.toMatchObject({
      violation: 'not-active',
    });
    env.db.close();
  });
});

describe('exercise history', () => {
  it('lists finished workouts of this exact exercise, newest first, before a point in time', async () => {
    const env = await setup();
    const days = [10, 12, 14];
    for (const day of days) {
      const { sessionId } = await env.start(at(day));
      await env.sessions.finish(sessionId, {}, at(day, 50));
    }
    const abandoned = await env.start(at(15));
    await env.sessions.abandon(abandoned.sessionId, at(15, 5));

    const all = await env.sessions.getExerciseHistory(BENCH, at(20).toISOString(), 10);
    expect(all.map((entry) => entry.session.startedAt)).toEqual(
      [at(14), at(12), at(10)].map((date) => date.toISOString()),
    );
    expect(all[0]?.sets).toHaveLength(3);

    const earlier = await env.sessions.getExerciseHistory(BENCH, at(14).toISOString(), 1);
    expect(earlier.map((entry) => entry.session.startedAt)).toEqual([at(12).toISOString()]);
    expect(await env.sessions.getExerciseHistory('00000000-0000-4000-8000-000000000001', at(20).toISOString(), 5)).toEqual([]);
    env.db.close();
  });
});

const toResult = (entry: ExerciseOccurrence): ExerciseResult => ({
  measurementType: entry.exercise.measurementTypeSnapshot,
  incrementKg: entry.exercise.progressionIncrementKgSnapshot,
  isSkipped: entry.exercise.isSkipped,
  sets: entry.sets,
});

/** Finished bench workout: 3 × 12 reps at 60 kg, RIR 2. */
async function finishedTopWorkout(env: Awaited<ReturnType<typeof setup>>) {
  const { sessionId, setIds, exerciseId } = await env.start(at(16));
  for (const id of setIds) {
    await env.sessions.updateSet(id, { actualWeightKg: 60, actualReps: 12, actualRIR: 2 });
    await env.sessions.setSetStatus(id, 'completed', at(16, 10));
  }
  const detail = await env.sessions.finish(sessionId, {}, at(16, 40));
  const current = detail.exercises[0];
  if (current === undefined) throw new Error('exercise missing');
  const recommendation = recommendNextSession(
    toResult({ session: detail.session, exercise: current.exercise, sets: current.sets }),
  );
  const proposal = planChangesOf(recommendation);
  if (proposal === undefined) throw new Error('expected a proposal');
  const input: PlanSuggestionInput = {
    sessionExerciseId: exerciseId,
    kind: 'increase_weight',
    title: 'Zwiększ ciężar',
    explanation: 'W 3 seriach osiągnąłeś 12 powtórzeń przy RIR 2.',
    changes: proposal.changes,
  };
  return { input, proposal, sessionId };
}

describe('acceptance test C – applying a between-workouts suggestion to the plan', () => {
  it('writes 62.5 kg to the planned sets only when the user applies it', async () => {
    const env = await setup({ weight: 60, repsMin: 8, repsMax: 12, rir: 2 });
    const { input, sessionId } = await finishedTopWorkout(env);
    const planWeights = async () =>
      (await env.db.plannedSets.toArray()).map((set) => set.targetWeightKg);
    expect(await planWeights()).toEqual([60, 60, 60]);
    expect(input.changes.map((change) => change.toKg)).toEqual([62.5, 62.5, 62.5]);

    const result = await env.suggestions.applyToPlan(input, at(16, 45));

    expect(await planWeights()).toEqual([62.5, 62.5, 62.5]);
    expect(result).toMatchObject({
      source: 'between_sessions',
      sessionId,
      decision: 'applied',
      chosenOptionIndex: 0,
    });
    expect(result.appliedToPlannedSetIds).toHaveLength(3);
    // The finished workout itself is a record of what happened and does not change.
    expect(
      (await env.db.sessionSets.toArray()).map((set) => [set.plannedWeightKg, set.actualWeightKg]),
    ).toEqual([
      [60, 60],
      [60, 60],
      [60, 60],
    ]);
    env.db.close();
  });

  it('records an ignored recommendation and leaves the plan as it is', async () => {
    const env = await setup({ weight: 60, repsMin: 8, repsMax: 12, rir: 2 });
    const { input } = await finishedTopWorkout(env);

    const result = await env.suggestions.ignoreForPlan(input, at(16, 45));

    expect(result).toMatchObject({ decision: 'ignored' });
    expect((await env.db.plannedSets.toArray()).map((set) => set.targetWeightKg)).toEqual([60, 60, 60]);
    await expect(env.suggestions.applyToPlan(input)).rejects.toMatchObject({
      violation: 'suggestion-decided',
    });
    env.db.close();
  });

  it('refuses when the plan was changed in the meantime and writes nothing', async () => {
    const env = await setup({ weight: 60, repsMin: 8, repsMax: 12, rir: 2 });
    const { input } = await finishedTopWorkout(env);
    // Another set of the same exercise was already raised past the suggestion.
    await env.plans.updateSet(env.planSets[2]?.id ?? '', { targetWeightKg: 70 });

    await expect(env.suggestions.applyToPlan(input)).rejects.toBeInstanceOf(PlanRuleError);

    expect((await env.db.plannedSets.toArray()).map((set) => set.targetWeightKg).sort()).toEqual([
      60, 60, 70,
    ]);
    expect(await env.db.progressionSuggestions.count()).toBe(0);
    env.db.close();
  });

  it('refuses when a planned set was deleted and writes nothing', async () => {
    const env = await setup({ weight: 60, repsMin: 8, repsMax: 12, rir: 2 });
    const { input } = await finishedTopWorkout(env);
    await env.plans.removeSet(env.planSets[2]?.id ?? '');

    await expect(env.suggestions.applyToPlan(input)).rejects.toMatchObject({
      violation: 'set-not-found',
    });

    expect((await env.db.plannedSets.toArray()).map((set) => set.targetWeightKg)).toEqual([60, 60]);
    expect(await env.db.progressionSuggestions.count()).toBe(0);
    env.db.close();
  });

  it('applies a proposed decrease only downwards', async () => {
    const env = await setup({ weight: 60, repsMin: 8, repsMax: 12, rir: 2 });
    const { input } = await finishedTopWorkout(env);
    const decrease: PlanSuggestionInput = {
      ...input,
      kind: 'consider_decrease',
      changes: input.changes.map((change) => ({ ...change, fromKg: 60, toKg: 57.5 })),
    };

    await env.suggestions.applyToPlan(decrease);

    expect((await env.db.plannedSets.toArray()).map((set) => set.targetWeightKg)).toEqual([
      57.5, 57.5, 57.5,
    ]);
    env.db.close();
  });
});
