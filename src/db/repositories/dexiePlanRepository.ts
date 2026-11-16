import { liveQuery } from 'dexie';
import {
  planDaySchema,
  plannedExerciseSchema,
  plannedSetSchema,
  supersetGroupSchema,
  trainingPlanSchema,
  type PlanDay,
  type PlannedExercise,
  type PlannedSet,
  type SupersetGroup,
  type TrainingPlan,
} from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import { normalizeSupersets } from '@/shared/logic/supersets';
import type { z } from 'zod';
import type { TrainingDatabase } from '../database';
import { PlanRuleError, toStorageError, ValidationError } from '../errors';
import type {
  DayDetail,
  PlanOverview,
  PlanRepository,
  PlannedExerciseDetail,
} from './types';

/** Sets created for an exercise that was just added to a day. */
const DEFAULT_SET_COUNT = 3;
const DEFAULT_PROGRESSION_INCREMENT_KG = 2.5;
const COPY_SUFFIX = ' (kopia)';

function rethrow(error: unknown): never {
  if (error instanceof ValidationError || error instanceof PlanRuleError) {
    throw error;
  }
  throw toStorageError(error);
}

function valid<T>(schema: z.ZodType<T>, entityName: string, candidate: unknown): T {
  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new ValidationError(entityName, result.error.issues);
  }
  return result.data;
}

/** Applies a patch where an explicit `undefined` clears an optional field. */
function merged(current: object, patch: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...current, ...patch }).filter(([, value]) => value !== undefined),
  );
}

function copyName(name: string): string {
  return `${name}${COPY_SUFFIX}`.slice(0, 120);
}

function withoutGroup(planned: PlannedExercise): PlannedExercise {
  const copy = { ...planned };
  delete copy.supersetGroupId;
  return copy;
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

export function createDexiePlanRepository(db: TrainingDatabase): PlanRepository {
  const planTables = [
    db.trainingPlans,
    db.planDays,
    db.plannedExercises,
    db.plannedSets,
    db.supersetGroups,
  ];

  /** Runs `work` in one read-write transaction over every plan table: all or nothing. */
  const write = async <R>(work: () => Promise<R>): Promise<R> => {
    try {
      return await db.transaction('rw', [...planTables, db.exercises], work);
    } catch (error) {
      rethrow(error);
    }
  };

  const requirePlan = async (planId: string): Promise<TrainingPlan> => {
    const plan = await db.trainingPlans.get(planId);
    if (plan === undefined) {
      throw new PlanRuleError('plan-not-found');
    }
    return plan;
  };

  const requireDay = async (dayId: string): Promise<PlanDay> => {
    const day = await db.planDays.get(dayId);
    if (day === undefined) {
      throw new PlanRuleError('day-not-found');
    }
    return day;
  };

  const requirePlanned = async (plannedExerciseId: string): Promise<PlannedExercise> => {
    const planned = await db.plannedExercises.get(plannedExerciseId);
    if (planned === undefined) {
      throw new PlanRuleError('exercise-not-found');
    }
    return planned;
  };

  const touchPlan = (planId: string) => db.trainingPlans.update(planId, { updatedAt: nowIso() });

  const touchPlanOfDay = async (dayId: string) => {
    const day = await db.planDays.get(dayId);
    if (day !== undefined) {
      await db.planDays.update(dayId, { updatedAt: nowIso() });
      await touchPlan(day.planId);
    }
  };

  const daysOf = async (planId: string) =>
    (await db.planDays.where('planId').equals(planId).toArray()).sort(byOrder);

  const exercisesOf = async (dayId: string) =>
    (await db.plannedExercises.where('planDayId').equals(dayId).toArray()).sort(byOrder);

  const setsOf = async (plannedExerciseId: string) =>
    (await db.plannedSets.where('plannedExerciseId').equals(plannedExerciseId).toArray()).sort(
      byOrder,
    );

  /**
   * Stores a new exercise order and re-establishes the superset invariant
   * (see `normalizeSupersets`), deleting groups that lost their members.
   */
  const saveExerciseOrder = async (
    dayId: string,
    ordered: readonly PlannedExercise[],
    movedId?: string,
  ) => {
    const groups = normalizeSupersets(ordered, movedId);
    await db.plannedExercises.bulkPut(
      ordered.map((planned, order) =>
        valid(
          plannedExerciseSchema,
          'PlannedExercise',
          merged(planned, { order, supersetGroupId: groups.get(planned.id) }),
        ),
      ),
    );
    const used = new Set([...groups.values()].filter((group) => group !== undefined));
    const stale = (await db.supersetGroups.where('planDayId').equals(dayId).toArray()).filter(
      (group) => !used.has(group.id),
    );
    await db.supersetGroups.bulkDelete(stale.map((group) => group.id));
  };

  const deleteDayContents = async (dayId: string) => {
    const exercises = await exercisesOf(dayId);
    for (const planned of exercises) {
      await db.plannedSets.where('plannedExerciseId').equals(planned.id).delete();
    }
    await db.plannedExercises.where('planDayId').equals(dayId).delete();
    await db.supersetGroups.where('planDayId').equals(dayId).delete();
  };

  /** Deep copy of a day (exercises, sets, supersets) with fresh ids. */
  const copyDayInto = async (source: PlanDay, planId: string, order: number, name: string) => {
    const now = nowIso();
    const day = valid(
      planDaySchema,
      'PlanDay',
      merged(source, { id: newId(), planId, order, name, createdAt: now, updatedAt: now }),
    );
    await db.planDays.add(day);

    const groupIds = new Map<string, string>();
    for (const group of await db.supersetGroups.where('planDayId').equals(source.id).toArray()) {
      const id = newId();
      groupIds.set(group.id, id);
      await db.supersetGroups.add({ ...group, id, planDayId: day.id });
    }
    for (const planned of await exercisesOf(source.id)) {
      const plannedId = newId();
      await db.plannedExercises.add(
        valid(
          plannedExerciseSchema,
          'PlannedExercise',
          merged(planned, {
            id: plannedId,
            planDayId: day.id,
            supersetGroupId:
              planned.supersetGroupId === undefined
                ? undefined
                : groupIds.get(planned.supersetGroupId),
          }),
        ),
      );
      await db.plannedSets.bulkAdd(
        (await setsOf(planned.id)).map((set) => ({
          ...set,
          id: newId(),
          plannedExerciseId: plannedId,
        })),
      );
    }
    return day;
  };

  const overviewOf = async (plan: TrainingPlan): Promise<PlanOverview> => {
    const days = await daysOf(plan.id);
    return {
      plan,
      days: await Promise.all(
        days.map(async (day) => ({
          day,
          exerciseCount: await db.plannedExercises.where('planDayId').equals(day.id).count(),
        })),
      ),
    };
  };

  const dayDetail = async (dayId: string): Promise<DayDetail | null> => {
    const day = await db.planDays.get(dayId);
    const plan = day === undefined ? undefined : await db.trainingPlans.get(day.planId);
    if (day === undefined || plan === undefined) {
      return null;
    }
    const exercises: PlannedExerciseDetail[] = [];
    for (const planned of await exercisesOf(dayId)) {
      exercises.push({ planned, sets: await setsOf(planned.id) });
    }
    return {
      plan,
      day,
      exercises,
      supersetGroups: await db.supersetGroups.where('planDayId').equals(dayId).toArray(),
    };
  };

  const subscribe = <T>(
    query: () => Promise<T>,
    listener: (value: T) => void,
    onError?: (error: ReturnType<typeof toStorageError>) => void,
  ) => {
    const subscription = liveQuery(query).subscribe({
      next: listener,
      error: (error: unknown) => onError?.(toStorageError(error)),
    });
    return () => subscription.unsubscribe();
  };

  return {
    observePlans: (listener, onError) =>
      subscribe(
        async () => {
          const plans = await db.trainingPlans.toArray();
          return Promise.all(plans.map(overviewOf));
        },
        listener,
        onError,
      ),

    observePlan: (planId, listener, onError) =>
      subscribe(
        async () => {
          const plan = await db.trainingPlans.get(planId);
          return plan === undefined ? null : overviewOf(plan);
        },
        listener,
        onError,
      ),

    observeDay: (dayId, listener, onError) => subscribe(() => dayDetail(dayId), listener, onError),

    getDay: async (dayId) => {
      try {
        return await db.transaction('r', planTables, () => dayDetail(dayId));
      } catch (error) {
        rethrow(error);
      }
    },

    createPlan: (draft) =>
      write(async () => {
        const now = nowIso();
        const hasPrimary = (await db.trainingPlans.toArray()).some(
          (plan) => plan.isPrimary && !plan.isArchived,
        );
        const description = draft.description?.trim();
        const plan = valid(trainingPlanSchema, 'TrainingPlan', {
          id: newId(),
          name: draft.name,
          ...(description ? { description } : {}),
          scheduleMode: draft.scheduleMode,
          // The first usable plan becomes the primary one automatically.
          isPrimary: !hasPrimary,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
        });
        await db.trainingPlans.add(plan);
        return plan;
      }),

    updatePlan: (planId, patch) =>
      write(async () => {
        const current = await requirePlan(planId);
        const cleaned =
          'description' in patch
            ? { ...patch, description: patch.description?.trim() || undefined }
            : patch;
        const plan = valid(
          trainingPlanSchema,
          'TrainingPlan',
          merged(current, { ...cleaned, updatedAt: nowIso() }),
        );
        await db.trainingPlans.put(plan);
        return plan;
      }),

    setPrimaryPlan: (planId) =>
      write(async () => {
        const target = await requirePlan(planId);
        if (target.isArchived) {
          throw new PlanRuleError('plan-archived');
        }
        for (const plan of await db.trainingPlans.toArray()) {
          const isPrimary = plan.id === planId;
          if (plan.isPrimary !== isPrimary) {
            await db.trainingPlans.update(plan.id, { isPrimary, updatedAt: nowIso() });
          }
        }
      }),

    setPlanArchived: (planId, isArchived) =>
      write(async () => {
        await requirePlan(planId);
        await db.trainingPlans.update(planId, {
          isArchived,
          // An archived plan cannot stay the primary one.
          ...(isArchived ? { isPrimary: false } : {}),
          updatedAt: nowIso(),
        });
      }),

    duplicatePlan: (planId) =>
      write(async () => {
        const source = await requirePlan(planId);
        const now = nowIso();
        const copy = valid(
          trainingPlanSchema,
          'TrainingPlan',
          merged(source, {
            id: newId(),
            name: copyName(source.name),
            isPrimary: false,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
          }),
        );
        await db.trainingPlans.add(copy);
        for (const day of await daysOf(planId)) {
          await copyDayInto(day, copy.id, day.order, day.name);
        }
        return copy;
      }),

    deletePlan: (planId) =>
      write(async () => {
        await requirePlan(planId);
        for (const day of await daysOf(planId)) {
          await deleteDayContents(day.id);
        }
        await db.planDays.where('planId').equals(planId).delete();
        await db.trainingPlans.delete(planId);
        // Workout sessions are deliberately left alone: history outlives its plan.
      }),

    addDay: (planId, nameFor) =>
      write(async () => {
        await requirePlan(planId);
        const now = nowIso();
        // Count inside the transaction: two quick taps must not get the same position or name.
        const order = (await daysOf(planId)).length;
        const day = valid(planDaySchema, 'PlanDay', {
          id: newId(),
          planId,
          name: typeof nameFor === 'string' ? nameFor : nameFor(order),
          order,
          createdAt: now,
          updatedAt: now,
        });
        await db.planDays.add(day);
        await touchPlan(planId);
        return day;
      }),

    updateDay: (dayId, patch) =>
      write(async () => {
        const current = await requireDay(dayId);
        const day = valid(
          planDaySchema,
          'PlanDay',
          merged(current, { ...patch, updatedAt: nowIso() }),
        );
        await db.planDays.put(day);
        await touchPlan(day.planId);
        return day;
      }),

    reorderDays: (planId, orderedDayIds) =>
      write(async () => {
        const days = await daysOf(planId);
        const known = new Set(days.map((day) => day.id));
        if (
          orderedDayIds.length !== days.length ||
          new Set(orderedDayIds).size !== days.length ||
          !orderedDayIds.every((id) => known.has(id))
        ) {
          throw new PlanRuleError('stale-order');
        }
        await Promise.all(
          orderedDayIds.map((id, order) => db.planDays.update(id, { order })),
        );
        await touchPlan(planId);
      }),

    duplicateDay: (dayId) =>
      write(async () => {
        const source = await requireDay(dayId);
        // Insert right after the original; shift the following days down.
        for (const day of await daysOf(source.planId)) {
          if (day.order > source.order) {
            await db.planDays.update(day.id, { order: day.order + 1 });
          }
        }
        const copy = await copyDayInto(
          source,
          source.planId,
          source.order + 1,
          copyName(source.name),
        );
        await touchPlan(source.planId);
        return copy;
      }),

    deleteDay: (dayId) =>
      write(async () => {
        const day = await requireDay(dayId);
        await deleteDayContents(dayId);
        await db.planDays.delete(dayId);
        const remaining = await daysOf(day.planId);
        await Promise.all(remaining.map(({ id }, order) => db.planDays.update(id, { order })));
        await touchPlan(day.planId);
      }),

    addExercise: (dayId, exerciseId, options) =>
      write(async () => {
        await requireDay(dayId);
        if ((await db.exercises.get(exerciseId)) === undefined) {
          throw new PlanRuleError('exercise-not-found');
        }
        const planned = valid(plannedExerciseSchema, 'PlannedExercise', {
          id: newId(),
          planDayId: dayId,
          exerciseId,
          order: (await exercisesOf(dayId)).length,
          restSeconds: options.restSeconds,
          progressionIncrementKg: DEFAULT_PROGRESSION_INCREMENT_KG,
          alternativeExerciseIds: [],
        });
        await db.plannedExercises.add(planned);
        await db.plannedSets.bulkAdd(
          Array.from({ length: DEFAULT_SET_COUNT }, (_unused, order) =>
            valid(plannedSetSchema, 'PlannedSet', {
              id: newId(),
              plannedExerciseId: planned.id,
              order,
              type: 'working',
            }),
          ),
        );
        await touchPlanOfDay(dayId);
        return planned;
      }),

    updateExercise: (plannedExerciseId, patch) =>
      write(async () => {
        const current = await requirePlanned(plannedExerciseId);
        const cleaned = {
          ...patch,
          ...('notes' in patch ? { notes: patch.notes?.trim() || undefined } : {}),
          ...(patch.alternativeExerciseIds === undefined
            ? {}
            : {
                alternativeExerciseIds: [...new Set(patch.alternativeExerciseIds)].filter(
                  (id) => id !== current.exerciseId,
                ),
              }),
        };
        const planned = valid(plannedExerciseSchema, 'PlannedExercise', merged(current, cleaned));
        await db.plannedExercises.put(planned);
        await touchPlanOfDay(planned.planDayId);
        return planned;
      }),

    removeExercise: (plannedExerciseId) =>
      write(async () => {
        const planned = await requirePlanned(plannedExerciseId);
        await db.plannedSets.where('plannedExerciseId').equals(plannedExerciseId).delete();
        await db.plannedExercises.delete(plannedExerciseId);
        await saveExerciseOrder(planned.planDayId, await exercisesOf(planned.planDayId));
        await touchPlanOfDay(planned.planDayId);
      }),

    reorderExercises: (dayId, orderedIds, movedId) =>
      write(async () => {
        const exercises = await exercisesOf(dayId);
        const byId = new Map(exercises.map((planned) => [planned.id, planned]));
        const ordered = orderedIds.flatMap((id) => byId.get(id) ?? []);
        if (ordered.length !== exercises.length || new Set(orderedIds).size !== exercises.length) {
          throw new PlanRuleError('stale-order');
        }
        await saveExerciseOrder(dayId, ordered, movedId);
        await touchPlanOfDay(dayId);
      }),

    linkWithNextExercise: (plannedExerciseId) =>
      write(async () => {
        const current = await requirePlanned(plannedExerciseId);
        const exercises = await exercisesOf(current.planDayId);
        const next = exercises[exercises.findIndex((item) => item.id === current.id) + 1];
        if (next === undefined) {
          throw new PlanRuleError('no-next-exercise');
        }
        let groupId = current.supersetGroupId ?? next.supersetGroupId;
        if (groupId === undefined) {
          const group: SupersetGroup = valid(supersetGroupSchema, 'SupersetGroup', {
            id: newId(),
            planDayId: current.planDayId,
            restAfterRoundSeconds: Math.max(current.restSeconds, next.restSeconds),
          });
          await db.supersetGroups.add(group);
          groupId = group.id;
        }
        // When both already belong to different supersets, the next one's whole group joins.
        const absorbed = next.supersetGroupId;
        const linked = exercises.map((item) =>
          item.id === current.id ||
          item.id === next.id ||
          (absorbed !== undefined && item.supersetGroupId === absorbed)
            ? { ...item, supersetGroupId: groupId }
            : item,
        );
        await saveExerciseOrder(current.planDayId, linked);
        await touchPlanOfDay(current.planDayId);
      }),

    removeFromSuperset: (plannedExerciseId) =>
      write(async () => {
        const current = await requirePlanned(plannedExerciseId);
        const exercises = (await exercisesOf(current.planDayId)).map((item) => {
          if (item.id !== current.id) {
            return item;
          }
          return withoutGroup(item);
        });
        await saveExerciseOrder(current.planDayId, exercises);
        await touchPlanOfDay(current.planDayId);
      }),

    dissolveSuperset: (groupId) =>
      write(async () => {
        const group = await db.supersetGroups.get(groupId);
        if (group === undefined) {
          return;
        }
        const exercises = (await exercisesOf(group.planDayId)).map((item) => {
          if (item.supersetGroupId !== groupId) {
            return item;
          }
          return withoutGroup(item);
        });
        await saveExerciseOrder(group.planDayId, exercises);
        await touchPlanOfDay(group.planDayId);
      }),

    updateSupersetRest: (groupId, restAfterRoundSeconds) =>
      write(async () => {
        const current = await db.supersetGroups.get(groupId);
        if (current === undefined) {
          throw new PlanRuleError('exercise-not-found');
        }
        await db.supersetGroups.put(
          valid(supersetGroupSchema, 'SupersetGroup', { ...current, restAfterRoundSeconds }),
        );
        await touchPlanOfDay(current.planDayId);
      }),

    addSet: (plannedExerciseId) =>
      write(async () => {
        const planned = await requirePlanned(plannedExerciseId);
        const sets = await setsOf(plannedExerciseId);
        const last = sets.at(-1);
        // A new set starts as a copy of the previous one – the common case.
        const set: PlannedSet = valid(
          plannedSetSchema,
          'PlannedSet',
          merged(last ?? { type: 'working' }, {
            id: newId(),
            plannedExerciseId,
            order: sets.length,
          }),
        );
        await db.plannedSets.add(set);
        await touchPlanOfDay(planned.planDayId);
        return set;
      }),

    updateSet: (setId, patch) =>
      write(async () => {
        const current = await db.plannedSets.get(setId);
        if (current === undefined) {
          throw new PlanRuleError('set-not-found');
        }
        const next = merged(current, patch);
        // Editing one end of the rep range past the other end pulls that end
        // along, so the range stays valid. Decided here, on the stored values,
        // not in the UI, whose copy may be a moment out of date.
        const { targetRepsMin: min, targetRepsMax: max } = next;
        if (typeof min === 'number' && typeof max === 'number' && min > max) {
          if ('targetRepsMin' in patch && !('targetRepsMax' in patch)) {
            next.targetRepsMax = min;
          } else if ('targetRepsMax' in patch && !('targetRepsMin' in patch)) {
            next.targetRepsMin = max;
          }
        }
        const set = valid(plannedSetSchema, 'PlannedSet', next);
        await db.plannedSets.put(set);
        const planned = await db.plannedExercises.get(set.plannedExerciseId);
        if (planned !== undefined) {
          await touchPlanOfDay(planned.planDayId);
        }
        return set;
      }),

    removeSet: (setId) =>
      write(async () => {
        const current = await db.plannedSets.get(setId);
        if (current === undefined) {
          return;
        }
        await db.plannedSets.delete(setId);
        const remaining = await setsOf(current.plannedExerciseId);
        await Promise.all(remaining.map(({ id }, order) => db.plannedSets.update(id, { order })));
        const planned = await db.plannedExercises.get(current.plannedExerciseId);
        if (planned !== undefined) {
          await touchPlanOfDay(planned.planDayId);
        }
      }),

    setTempoForAllSets: (plannedExerciseId, tempo) =>
      write(async () => {
        const planned = await requirePlanned(plannedExerciseId);
        const value = tempo?.trim() || undefined;
        for (const set of await setsOf(plannedExerciseId)) {
          await db.plannedSets.put(
            valid(plannedSetSchema, 'PlannedSet', merged(set, { tempo: value })),
          );
        }
        await touchPlanOfDay(planned.planDayId);
      }),
  };
}
