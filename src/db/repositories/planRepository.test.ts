import { describe, expect, it, vi } from 'vitest';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { PlanRuleError, ValidationError } from '../errors';
import { SYSTEM_EXERCISES } from '../seed/systemExercises';
import { syncSystemExercises } from './dexieExerciseRepository';
import { createDexiePlanRepository } from './dexiePlanRepository';
import type { DayDetail, PlanOverview } from './types';

const nextDatabaseName = isolatedDatabaseNames();
const [BENCH, INCLINE, FLY, PUSHUP] = SYSTEM_EXERCISES.map((seed) => seed.id) as [
  string,
  string,
  string,
  string,
];

async function setup(name = nextDatabaseName()) {
  const db = new TrainingDatabase(name);
  await syncSystemExercises(db);
  return { db, plans: createDexiePlanRepository(db), name };
}

async function dayOf(plans: ReturnType<typeof createDexiePlanRepository>, dayId: string) {
  const detail = await plans.getDay(dayId);
  if (detail === null) {
    throw new Error('day missing');
  }
  return detail;
}

const groupsIn = (detail: DayDetail) => detail.exercises.map((e) => e.planned.supersetGroupId);
const exerciseIdsIn = (detail: DayDetail) => detail.exercises.map((e) => e.planned.exerciseId);

describe('plans', () => {
  it('creates plans; the first one becomes primary, later ones do not', async () => {
    const { db, plans } = await setup();

    const first = await plans.createPlan({ name: ' Push Pull Legs ', scheduleMode: 'fixed' });
    const second = await plans.createPlan({
      name: 'FBW',
      description: '  ',
      scheduleMode: 'flexible',
    });

    expect(first).toMatchObject({ name: 'Push Pull Legs', isPrimary: true, isArchived: false });
    expect(second.isPrimary).toBe(false);
    expect('description' in second).toBe(false);
    await expect(
      plans.createPlan({ name: '   ', scheduleMode: 'fixed' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.trainingPlans.count()).toBe(2);
    db.close();
  });

  it('updates name, description and schedule mode; clearing the description removes it', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', description: 'Opis', scheduleMode: 'fixed' });

    const updated = await plans.updatePlan(plan.id, {
      name: 'Nowa nazwa',
      description: undefined,
      scheduleMode: 'flexible',
    });

    expect(updated).toMatchObject({ name: 'Nowa nazwa', scheduleMode: 'flexible' });
    expect('description' in updated).toBe(false);
    await expect(plans.updatePlan(plan.id, { name: ' ' })).rejects.toBeInstanceOf(ValidationError);
    expect((await db.trainingPlans.get(plan.id))?.name).toBe('Nowa nazwa');
    db.close();
  });

  it('keeps exactly one primary plan; archiving removes the primary flag', async () => {
    const { db, plans } = await setup();
    const a = await plans.createPlan({ name: 'A', scheduleMode: 'fixed' });
    const b = await plans.createPlan({ name: 'B', scheduleMode: 'fixed' });

    await plans.setPrimaryPlan(b.id);
    expect((await db.trainingPlans.toArray()).filter((p) => p.isPrimary).map((p) => p.id)).toEqual([
      b.id,
    ]);

    await plans.setPlanArchived(b.id, true);
    expect(await db.trainingPlans.get(b.id)).toMatchObject({ isArchived: true, isPrimary: false });
    await expect(plans.setPrimaryPlan(b.id)).rejects.toMatchObject({ violation: 'plan-archived' });

    await plans.setPlanArchived(b.id, false);
    expect((await db.trainingPlans.get(b.id))?.isArchived).toBe(false);
    expect((await db.trainingPlans.get(a.id))?.isPrimary).toBe(false);
    db.close();
  });

  it('archiving and deleting a plan never touch recorded workout sessions (edge case 27)', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    const planned = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
    const session = {
      id: newId(),
      sourcePlanId: plan.id,
      sourcePlanDayId: day.id,
      name: 'Push',
      status: 'completed' as const,
      startedAt: nowIso(),
      completedAt: nowIso(),
      localWorkoutDate: '2026-11-16',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await db.workoutSessions.add(session);

    await plans.setPlanArchived(plan.id, true);
    expect(await db.workoutSessions.get(session.id)).toEqual(session);

    await plans.deletePlan(plan.id);

    expect(await db.workoutSessions.get(session.id)).toEqual(session);
    expect(await db.trainingPlans.count()).toBe(0);
    expect(await db.planDays.count()).toBe(0);
    expect(await db.plannedExercises.count()).toBe(0);
    expect(await db.plannedSets.count()).toBe(0);
    expect(await db.plannedExercises.get(planned.id)).toBeUndefined();
    await expect(plans.deletePlan(plan.id)).rejects.toBeInstanceOf(PlanRuleError);
    db.close();
  });

  it('duplicates a plan deeply: days, exercises, sets and supersets, all with new ids', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'PPL', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    await plans.updateDay(day.id, { weekday: 1 });
    const bench = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
    await plans.addExercise(day.id, FLY, { restSeconds: 60 });
    await plans.linkWithNextExercise(bench.id);
    const [firstSet] = (await dayOf(plans, day.id)).exercises[0]?.sets ?? [];
    await plans.updateSet(firstSet?.id ?? '', { targetWeightKg: 62.5, targetRepsMin: 8, targetRepsMax: 12 });

    const copy = await plans.duplicatePlan(plan.id);

    expect(copy).toMatchObject({ name: 'PPL (kopia)', isPrimary: false, scheduleMode: 'fixed' });
    const copiedDays = await db.planDays.where('planId').equals(copy.id).toArray();
    expect(copiedDays).toHaveLength(1);
    expect(copiedDays[0]).toMatchObject({ name: 'Push', weekday: 1 });
    const original = await dayOf(plans, day.id);
    const duplicate = await dayOf(plans, copiedDays[0]?.id ?? '');
    expect(exerciseIdsIn(duplicate)).toEqual(exerciseIdsIn(original));
    expect(duplicate.exercises[0]?.sets[0]).toMatchObject({
      targetWeightKg: 62.5,
      targetRepsMin: 8,
      targetRepsMax: 12,
    });
    // Superset preserved, but as the copy's own group.
    expect(groupsIn(duplicate)[0]).toBeDefined();
    expect(groupsIn(duplicate)[0]).toBe(groupsIn(duplicate)[1]);
    expect(groupsIn(duplicate)[0]).not.toBe(groupsIn(original)[0]);
    expect(duplicate.supersetGroups).toHaveLength(1);
    // No shared ids between original and copy.
    const ids = (d: DayDetail) => d.exercises.flatMap((e) => [e.planned.id, ...e.sets.map((s) => s.id)]);
    expect(ids(duplicate).some((id) => ids(original).includes(id))).toBe(false);

    // Editing the copy leaves the original untouched.
    await plans.removeExercise(duplicate.exercises[0]?.planned.id ?? '');
    expect((await dayOf(plans, day.id)).exercises).toHaveLength(2);
    db.close();
  });

  it('survives closing and reopening the database (acceptance test A at data level)', async () => {
    const { db, plans, name } = await setup();
    const plan = await plans.createPlan({ name: 'Push Pull Legs', scheduleMode: 'fixed' });
    for (const [index, dayName] of ['Push', 'Pull', 'Legs'].entries()) {
      const day = await plans.addDay(plan.id, dayName);
      await plans.updateDay(day.id, { weekday: 1 + index * 2 });
      await plans.addExercise(day.id, SYSTEM_EXERCISES[index * 10]?.id ?? '', { restSeconds: 90 });
    }
    const before: PlanOverview[] = [];
    const stop = plans.observePlans((value) => before.splice(0, before.length, ...value));
    await vi.waitFor(() => expect(before[0]?.days).toHaveLength(3));
    stop();
    db.close();

    const reopened = new TrainingDatabase(name);
    const after: PlanOverview[] = [];
    const stopAgain = createDexiePlanRepository(reopened).observePlans((value) =>
      after.splice(0, after.length, ...value),
    );
    await vi.waitFor(() => expect(after).toEqual(before));
    expect(after[0]?.days.map(({ day }) => [day.name, day.weekday])).toEqual([
      ['Push', 1],
      ['Pull', 3],
      ['Legs', 5],
    ]);
    stopAgain();
    reopened.close();
  });
});

describe('days', () => {
  it('adds, renames, reorders, duplicates and deletes days, keeping order gap-free', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'flexible' });
    const a = await plans.addDay(plan.id, 'A');
    const b = await plans.addDay(plan.id, 'B');
    const c = await plans.addDay(plan.id, 'C');
    const names = async () =>
      (await db.planDays.where('planId').equals(plan.id).sortBy('order')).map((d) => `${d.order}:${d.name}`);

    await plans.updateDay(b.id, { name: 'Trening B' });
    await plans.reorderDays(plan.id, [c.id, a.id, b.id]);
    expect(await names()).toEqual(['0:C', '1:A', '2:Trening B']);

    await plans.addExercise(a.id, BENCH, { restSeconds: 90 });
    const copy = await plans.duplicateDay(a.id);
    expect(await names()).toEqual(['0:C', '1:A', '2:A (kopia)', '3:Trening B']);
    expect((await dayOf(plans, copy.id)).exercises).toHaveLength(1);

    await plans.deleteDay(c.id);
    expect(await names()).toEqual(['0:A', '1:A (kopia)', '2:Trening B']);
    expect(await db.plannedExercises.where('planDayId').equals(c.id).count()).toBe(0);
    db.close();
  });

  it('names and orders days correctly even when two are added at the same moment', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });

    await Promise.all([
      plans.addDay(plan.id, (count) => `Dzień ${count + 1}`),
      plans.addDay(plan.id, (count) => `Dzień ${count + 1}`),
    ]);

    const days = await db.planDays.where('planId').equals(plan.id).sortBy('order');
    expect(days.map((day) => [day.order, day.name])).toEqual([
      [0, 'Dzień 1'],
      [1, 'Dzień 2'],
    ]);
    db.close();
  });

  it('rejects an outdated or incomplete order instead of corrupting it', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'flexible' });
    const a = await plans.addDay(plan.id, 'A');
    const b = await plans.addDay(plan.id, 'B');

    await expect(plans.reorderDays(plan.id, [a.id])).rejects.toMatchObject({ violation: 'stale-order' });
    await expect(plans.reorderDays(plan.id, [a.id, a.id])).rejects.toBeInstanceOf(PlanRuleError);
    await expect(plans.reorderDays(plan.id, [a.id, newId()])).rejects.toBeInstanceOf(PlanRuleError);
    expect((await db.planDays.get(b.id))?.order).toBe(1);
    db.close();
  });

  it('sets and clears the weekday; rejects an impossible one', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');

    expect((await plans.updateDay(day.id, { weekday: 5 })).weekday).toBe(5);
    expect('weekday' in (await plans.updateDay(day.id, { weekday: undefined }))).toBe(false);
    await expect(plans.updateDay(day.id, { weekday: 8 })).rejects.toBeInstanceOf(ValidationError);
    db.close();
  });
});

describe('exercises and sets in a day', () => {
  it('adds an exercise with three empty working sets and default progression step 2.5 kg', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');

    const planned = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });

    expect(planned).toMatchObject({ order: 0, restSeconds: 120, progressionIncrementKg: 2.5 });
    const detail = await dayOf(plans, day.id);
    expect(detail.exercises[0]?.sets.map((s) => [s.order, s.type, s.targetWeightKg])).toEqual([
      [0, 'working', undefined],
      [1, 'working', undefined],
      [2, 'working', undefined],
    ]);
    await expect(plans.addExercise(day.id, newId(), { restSeconds: 90 })).rejects.toMatchObject({
      violation: 'exercise-not-found',
    });
    db.close();
  });

  it('gives every set its own values (spec §5.4 example) and can clear them again', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    const planned = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
    const fourth = await plans.addSet(planned.id);
    const sets = (await dayOf(plans, day.id)).exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(4);

    await plans.updateSet(sets[0]?.id ?? '', { type: 'warmup', targetWeightKg: 20, targetRepsMin: 15, targetRepsMax: 15 });
    await plans.updateSet(sets[1]?.id ?? '', { type: 'warmup', targetWeightKg: 40, targetRepsMin: 10, targetRepsMax: 10 });
    await plans.updateSet(sets[2]?.id ?? '', { targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetRIR: 2 });
    await plans.updateSet(fourth.id, { targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetRIR: 2 });

    const stored = (await dayOf(plans, day.id)).exercises[0]?.sets ?? [];
    expect(stored.map((s) => [s.type, s.targetWeightKg, s.targetRepsMin, s.targetRepsMax, s.targetRIR])).toEqual([
      ['warmup', 20, 15, 15, undefined],
      ['warmup', 40, 10, 10, undefined],
      ['working', 60, 8, 12, 2],
      ['working', 60, 8, 12, 2],
    ]);

    const cleared = await plans.updateSet(fourth.id, { targetWeightKg: undefined, targetRIR: undefined });
    expect('targetWeightKg' in cleared).toBe(false);
    expect('targetRIR' in cleared).toBe(false);
    // 0 kg is a value, not "empty".
    expect((await plans.updateSet(fourth.id, { targetWeightKg: 0 })).targetWeightKg).toBe(0);
    db.close();
  });

  it('keeps the rep range valid when one end is edited past the other', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
    const [set] = (await dayOf(plans, day.id)).exercises[0]?.sets ?? [];
    const id = set?.id ?? '';
    const range = async () => {
      const stored = await db.plannedSets.get(id);
      return [stored?.targetRepsMin, stored?.targetRepsMax];
    };

    // Each field saves only itself, so two quick edits cannot erase each other.
    await Promise.all([
      plans.updateSet(id, { targetRepsMin: 8 }),
      plans.updateSet(id, { targetRepsMax: 12 }),
      plans.updateSet(id, { targetWeightKg: 60 }),
    ]);
    expect(await range()).toEqual([8, 12]);
    expect((await db.plannedSets.get(id))?.targetWeightKg).toBe(60);

    await plans.updateSet(id, { targetRepsMin: 15 });
    expect(await range()).toEqual([15, 15]);
    await plans.updateSet(id, { targetRepsMax: 6 });
    expect(await range()).toEqual([6, 6]);
    await plans.updateSet(id, { targetRepsMax: undefined });
    expect(await range()).toEqual([6, undefined]);
    // An explicitly inconsistent pair is still refused.
    await expect(
      plans.updateSet(id, { targetRepsMin: 12, targetRepsMax: 8 }),
    ).rejects.toBeInstanceOf(ValidationError);
    db.close();
  });

  it('rejects invalid set values and keeps the stored set unchanged', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    const planned = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
    const [set] = (await dayOf(plans, day.id)).exercises[0]?.sets ?? [];
    await plans.updateSet(set?.id ?? '', { targetRepsMin: 8, targetRepsMax: 12 });
    const before = await db.plannedSets.get(set?.id ?? '');

    for (const patch of [
      { targetWeightKg: -5 },
      { targetWeightKg: Number.NaN },
      { targetRepsMin: 13, targetRepsMax: 12 },
      { targetRepsMax: 2.5 },
      { targetRIR: 11 },
    ]) {
      await expect(plans.updateSet(set?.id ?? '', patch)).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(plans.updateExercise(planned.id, { progressionIncrementKg: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(plans.updateExercise(planned.id, { restSeconds: -1 })).rejects.toBeInstanceOf(ValidationError);

    expect(await db.plannedSets.get(set?.id ?? '')).toEqual(before);
    db.close();
  });

  it('a new set copies the previous one; removing a set renumbers the rest', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    const planned = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
    const sets = (await dayOf(plans, day.id)).exercises[0]?.sets ?? [];
    await plans.updateSet(sets[2]?.id ?? '', { targetWeightKg: 62.5, targetRepsMin: 8, targetRepsMax: 12, targetRIR: 2 });

    const added = await plans.addSet(planned.id);
    expect(added).toMatchObject({ order: 3, type: 'working', targetWeightKg: 62.5, targetRepsMax: 12 });
    expect(added.id).not.toBe(sets[2]?.id);

    await plans.removeSet(sets[0]?.id ?? '');
    const remaining = (await dayOf(plans, day.id)).exercises[0]?.sets ?? [];
    expect(remaining.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(remaining.at(-1)?.id).toBe(added.id);
    db.close();
  });

  it('stores rest, progression step, notes, tempo and alternatives', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    const planned = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });

    const updated = await plans.updateExercise(planned.id, {
      restSeconds: 180,
      progressionIncrementKg: 1,
      notes: '  Łopatki ściągnięte  ',
      alternativeExerciseIds: [INCLINE, INCLINE, BENCH, PUSHUP],
    });
    await plans.setTempoForAllSets(planned.id, ' 3-1-1-0 ');

    expect(updated).toMatchObject({
      restSeconds: 180,
      progressionIncrementKg: 1,
      notes: 'Łopatki ściągnięte',
      // no duplicates and never the exercise itself
      alternativeExerciseIds: [INCLINE, PUSHUP],
    });
    const detail = await dayOf(plans, day.id);
    expect(detail.exercises[0]?.sets.every((s) => s.tempo === '3-1-1-0')).toBe(true);

    await plans.setTempoForAllSets(planned.id, '');
    expect((await dayOf(plans, day.id)).exercises[0]?.sets.some((s) => 'tempo' in s)).toBe(false);
    expect('notes' in (await plans.updateExercise(planned.id, { notes: ' ' }))).toBe(false);
    db.close();
  });

  it('reorders and removes exercises with a gap-free order', async () => {
    const { db, plans } = await setup();
    const plan = await plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await plans.addDay(plan.id, 'Push');
    const a = await plans.addExercise(day.id, BENCH, { restSeconds: 90 });
    const b = await plans.addExercise(day.id, INCLINE, { restSeconds: 90 });
    const c = await plans.addExercise(day.id, FLY, { restSeconds: 90 });

    await plans.reorderExercises(day.id, [c.id, a.id, b.id], c.id);
    expect(exerciseIdsIn(await dayOf(plans, day.id))).toEqual([FLY, BENCH, INCLINE]);

    await plans.removeExercise(a.id);
    const detail = await dayOf(plans, day.id);
    expect(detail.exercises.map((e) => e.planned.order)).toEqual([0, 1]);
    expect(await db.plannedSets.where('plannedExerciseId').equals(a.id).count()).toBe(0);
    await expect(plans.reorderExercises(day.id, [c.id], c.id)).rejects.toMatchObject({ violation: 'stale-order' });
    db.close();
  });
});

describe('supersets', () => {
  async function dayWithFour() {
    const context = await setup();
    const plan = await context.plans.createPlan({ name: 'Plan', scheduleMode: 'fixed' });
    const day = await context.plans.addDay(plan.id, 'Push');
    const ids: string[] = [];
    for (const [exerciseId, rest] of [[BENCH, 120], [INCLINE, 90], [FLY, 60], [PUSHUP, 45]] as const) {
      ids.push((await context.plans.addExercise(day.id, exerciseId, { restSeconds: rest })).id);
    }
    return { ...context, day, ids: ids as [string, string, string, string] };
  }

  it('links two exercises; the round rest starts as the longer of their rests', async () => {
    const { db, plans, day, ids } = await dayWithFour();

    await plans.linkWithNextExercise(ids[0]);

    const detail = await dayOf(plans, day.id);
    const [g0, g1, g2] = groupsIn(detail);
    expect(g0).toBeDefined();
    expect(g1).toBe(g0);
    expect(g2).toBeUndefined();
    expect(detail.supersetGroups).toEqual([
      { id: g0, planDayId: day.id, restAfterRoundSeconds: 120 },
    ]);
    // Individual sets stay individual.
    expect(detail.exercises[0]?.sets).toHaveLength(3);
    db.close();
  });

  it('extends a superset to three exercises and merges two neighbouring supersets', async () => {
    const { db, plans, day, ids } = await dayWithFour();
    await plans.linkWithNextExercise(ids[0]);
    await plans.linkWithNextExercise(ids[1]);
    let groups = groupsIn(await dayOf(plans, day.id));
    expect(new Set(groups.slice(0, 3)).size).toBe(1);
    expect(groups[3]).toBeUndefined();

    await plans.dissolveSuperset(groups[0] ?? '');
    await plans.linkWithNextExercise(ids[0]);
    await plans.linkWithNextExercise(ids[2]);
    expect(new Set(groupsIn(await dayOf(plans, day.id))).size).toBe(2);

    await plans.linkWithNextExercise(ids[1]); // joins A+B with C+D
    const detail = await dayOf(plans, day.id);
    groups = groupsIn(detail);
    expect(new Set(groups).size).toBe(1);
    expect(detail.supersetGroups).toHaveLength(1);
    db.close();
  });

  it('removing a member keeps a superset of two, and dissolves it below two', async () => {
    const { db, plans, day, ids } = await dayWithFour();
    await plans.linkWithNextExercise(ids[0]);
    await plans.linkWithNextExercise(ids[1]);

    await plans.removeFromSuperset(ids[2]);
    expect(groupsIn(await dayOf(plans, day.id)).map((g) => g !== undefined)).toEqual([true, true, false, false]);

    await plans.removeFromSuperset(ids[0]);
    const detail = await dayOf(plans, day.id);
    expect(groupsIn(detail)).toEqual([undefined, undefined, undefined, undefined]);
    expect(detail.supersetGroups).toEqual([]);
    expect(await db.supersetGroups.count()).toBe(0);
    db.close();
  });

  it('deleting an exercise or moving one away keeps the superset rule intact', async () => {
    const { db, plans, day, ids } = await dayWithFour();
    await plans.linkWithNextExercise(ids[0]);

    // Move the second member to the end → the superset has one member left → dissolved.
    await plans.reorderExercises(day.id, [ids[0], ids[2], ids[3], ids[1]], ids[1]);
    expect(groupsIn(await dayOf(plans, day.id))).toEqual([undefined, undefined, undefined, undefined]);

    await plans.linkWithNextExercise(ids[0]);
    await plans.removeExercise(ids[2]);
    expect((await dayOf(plans, day.id)).supersetGroups).toEqual([]);
    db.close();
  });

  it('an exercise dragged between two members joins the superset; order inside is kept', async () => {
    const { db, plans, day, ids } = await dayWithFour();
    await plans.linkWithNextExercise(ids[0]);

    await plans.reorderExercises(day.id, [ids[0], ids[3], ids[1], ids[2]], ids[3]);

    const detail = await dayOf(plans, day.id);
    expect(exerciseIdsIn(detail)).toEqual([BENCH, PUSHUP, INCLINE, FLY]);
    expect(groupsIn(detail).map((g) => g !== undefined)).toEqual([true, true, true, false]);
    db.close();
  });

  it('changes the rest after a round and dissolves on request', async () => {
    const { db, plans, day, ids } = await dayWithFour();
    await plans.linkWithNextExercise(ids[0]);
    const groupId = groupsIn(await dayOf(plans, day.id))[0] ?? '';

    await plans.updateSupersetRest(groupId, 150);
    expect((await db.supersetGroups.get(groupId))?.restAfterRoundSeconds).toBe(150);
    await expect(plans.updateSupersetRest(groupId, -1)).rejects.toBeInstanceOf(ValidationError);

    await plans.dissolveSuperset(groupId);
    expect(await db.supersetGroups.count()).toBe(0);
    // The exercises keep their own rest times for use outside a superset.
    expect((await dayOf(plans, day.id)).exercises.map((e) => e.planned.restSeconds)).toEqual([120, 90, 60, 45]);
    await expect(plans.linkWithNextExercise(ids[3])).rejects.toMatchObject({ violation: 'no-next-exercise' });
    db.close();
  });
});
