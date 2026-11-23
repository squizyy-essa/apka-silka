import { liveQuery } from 'dexie';
import type { z } from 'zod';
import {
  describeFailedSetAdvice,
  describeFailedSetOption,
  sameKg,
  suggestAfterFailedSet,
  type FailedSetOption,
} from '@/progression';
import {
  plannedSetSchema,
  progressionSuggestionSchema,
  sessionSetSchema,
  type ProgressionSuggestion,
  type SessionSet,
  type SuggestionOption,
} from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import type { TrainingDatabase } from '../database';
import { PlanRuleError, SessionRuleError, toStorageError, ValidationError } from '../errors';
import type {
  FailedSetOptionKind,
  PlanSuggestionInput,
  SuggestionRepository,
} from './types';

function rethrow(error: unknown): never {
  if (
    error instanceof ValidationError ||
    error instanceof SessionRuleError ||
    error instanceof PlanRuleError
  ) {
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

/** Drops keys whose value is `undefined` (optional fields are stored as absent). */
function compact<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function toStoredOption(option: FailedSetOption, facts: Parameters<typeof describeFailedSetOption>[1]) {
  const { title } = describeFailedSetOption(option, facts);
  return compact<SuggestionOption>(
    option.kind === 'lower_weight'
      ? {
          kind: 'lower_weight',
          title,
          weightKg: option.weightKg,
          repsMin: option.repsMin,
          repsMax: option.repsMax,
        }
      : {
          kind: 'adjust_reps',
          title,
          weightKg: option.weightKg,
          repsMin: option.reps,
          repsMax: option.reps,
        },
  );
}

export function createDexieSuggestionRepository(db: TrainingDatabase): SuggestionRepository {
  const tables = [
    db.progressionSuggestions,
    db.workoutSessions,
    db.sessionExercises,
    db.sessionSets,
    db.trainingPlans,
    db.planDays,
    db.plannedExercises,
    db.plannedSets,
  ];

  const write = async <R>(work: () => Promise<R>): Promise<R> => {
    try {
      return await db.transaction('rw', tables, work);
    } catch (error) {
      rethrow(error);
    }
  };

  /** What the stored sets say now about the failed set – the single source for apply and ignore. */
  const failedSetContext = async (failedSetId: string) => {
    const failedSet = await db.sessionSets.get(failedSetId);
    if (failedSet === undefined) {
      throw new SessionRuleError('set-not-found');
    }
    const exercise = await db.sessionExercises.get(failedSet.sessionExerciseId);
    if (exercise === undefined) {
      throw new SessionRuleError('exercise-not-found');
    }
    const session = await db.workoutSessions.get(exercise.sessionId);
    if (session === undefined) {
      throw new SessionRuleError('session-not-found');
    }
    if (session.status !== 'active') {
      throw new SessionRuleError('not-active');
    }
    if (
      (await db.progressionSuggestions.where('sourceSetId').equals(failedSetId).count()) > 0
    ) {
      throw new SessionRuleError('suggestion-decided');
    }
    const exerciseSets = await db.sessionSets
      .where('sessionExerciseId')
      .equals(exercise.id)
      .toArray();
    const advice = suggestAfterFailedSet({
      failedSet,
      measurementType: exercise.measurementTypeSnapshot,
      incrementKg: exercise.progressionIncrementKgSnapshot,
      exerciseSets,
    });
    if (advice.kind !== 'options') {
      throw new SessionRuleError('suggestion-outdated');
    }
    return { failedSet, exercise, exerciseSets, advice };
  };

  const record = async (
    candidate: Record<string, unknown>,
  ): Promise<ProgressionSuggestion> => {
    const suggestion = valid(
      progressionSuggestionSchema,
      'ProgressionSuggestion',
      compact(candidate),
    );
    await db.progressionSuggestions.add(suggestion);
    return suggestion;
  };

  const decideFailedSet = async (
    failedSetId: string,
    choice: FailedSetOptionKind | undefined,
    now: Date,
  ): Promise<ProgressionSuggestion> => {
    const { failedSet, exercise, exerciseSets, advice } = await failedSetContext(failedSetId);
    const options = advice.options.map((option) => toStoredOption(option, advice.facts));
    const base = {
      id: newId(),
      source: 'failed_set',
      sessionId: exercise.sessionId,
      sessionExerciseId: exercise.id,
      exerciseId: exercise.exerciseId,
      sourceSetId: failedSet.id,
      options,
      explanation: describeFailedSetAdvice(advice).slice(0, 2000),
      createdAt: now.toISOString(),
    };
    if (choice === undefined) {
      return record({ ...base, decision: 'ignored', decidedAt: now.toISOString() });
    }

    const chosenIndex = advice.options.findIndex((option) => option.kind === choice);
    const chosen = advice.options[chosenIndex];
    if (chosen === undefined) {
      throw new SessionRuleError('suggestion-outdated');
    }
    const target =
      advice.targetSetId === undefined
        ? undefined
        : exerciseSets.find((set) => set.id === advice.targetSetId);
    if (target === undefined || target.status !== 'pending' || target.type !== 'working') {
      throw new SessionRuleError('no-target-set');
    }

    // Only the planned values of this one future set change. A value the user
    // already typed into it stays – unless it merely repeated the old plan,
    // in which case it would hide the new target.
    const next: Record<string, unknown> = { ...target, ...chosen.changes };
    if (
      chosen.changes.plannedWeightKg !== undefined &&
      target.actualWeightKg !== undefined &&
      target.plannedWeightKg !== undefined &&
      sameKg(target.actualWeightKg, target.plannedWeightKg)
    ) {
      delete next.actualWeightKg;
    }
    if (
      chosen.changes.plannedRepsMin !== undefined &&
      target.actualReps !== undefined &&
      target.actualReps === target.plannedRepsMin &&
      target.plannedRepsMin === target.plannedRepsMax
    ) {
      delete next.actualReps;
    }
    await db.sessionSets.put(valid<SessionSet>(sessionSetSchema, 'SessionSet', compact(next)));

    return record({
      ...base,
      decision: 'applied',
      chosenOptionIndex: chosenIndex,
      appliedToSessionSetId: target.id,
      decidedAt: now.toISOString(),
    });
  };

  const planContext = async (input: PlanSuggestionInput) => {
    const exercise = await db.sessionExercises.get(input.sessionExerciseId);
    if (exercise === undefined) {
      throw new SessionRuleError('exercise-not-found');
    }
    const session = await db.workoutSessions.get(exercise.sessionId);
    if (session === undefined) {
      throw new SessionRuleError('session-not-found');
    }
    if (
      (await db.progressionSuggestions
        .where('sessionExerciseId')
        .equals(exercise.id)
        .filter((existing) => existing.source === 'between_sessions')
        .count()) > 0
    ) {
      throw new SessionRuleError('suggestion-decided');
    }
    const [first] = input.changes;
    const option = compact<SuggestionOption>({
      kind: input.kind,
      title: input.title,
      ...(first === undefined ? {} : { weightKg: first.toKg }),
    });
    return {
      exercise,
      base: {
        id: newId(),
        source: 'between_sessions',
        sessionId: exercise.sessionId,
        sessionExerciseId: exercise.id,
        exerciseId: exercise.exerciseId,
        options: [option],
        explanation: input.explanation.slice(0, 2000),
      },
    };
  };

  return {
    observeForSession(sessionId, listener, onError) {
      const subscription = liveQuery(() =>
        db.progressionSuggestions.where('sessionId').equals(sessionId).toArray(),
      ).subscribe({
        next: listener,
        error: (error: unknown) => onError?.(toStorageError(error)),
      });
      return () => subscription.unsubscribe();
    },

    applyFailedSetOption: (failedSetId, kind, now = new Date()) =>
      write(() => decideFailedSet(failedSetId, kind, now)),

    ignoreFailedSetSuggestion: (failedSetId, now = new Date()) =>
      write(() => decideFailedSet(failedSetId, undefined, now)),

    applyToPlan: (input, now = new Date()) =>
      write(async () => {
        const { base } = await planContext(input);
        const increase = input.kind === 'increase_weight';
        const touchedDays = new Set<string>();
        for (const change of input.changes) {
          const current = await db.plannedSets.get(change.plannedSetId);
          if (current === undefined) {
            throw new PlanRuleError('set-not-found');
          }
          // The plan may have been edited since the workout. Only move the
          // weight in the proposed direction, never against a newer value.
          const currentKg = current.targetWeightKg;
          const stillFits =
            currentKg === undefined ||
            (increase ? currentKg < change.toKg : currentKg > change.toKg);
          if (!stillFits) {
            throw new PlanRuleError('plan-changed');
          }
          await db.plannedSets.put(
            valid(plannedSetSchema, 'PlannedSet', { ...current, targetWeightKg: change.toKg }),
          );
          const planned = await db.plannedExercises.get(current.plannedExerciseId);
          if (planned !== undefined) {
            touchedDays.add(planned.planDayId);
          }
        }
        for (const dayId of touchedDays) {
          const day = await db.planDays.get(dayId);
          if (day !== undefined) {
            await db.planDays.update(dayId, { updatedAt: nowIso() });
            await db.trainingPlans.update(day.planId, { updatedAt: nowIso() });
          }
        }
        return record({
          ...base,
          decision: 'applied',
          chosenOptionIndex: 0,
          appliedToPlannedSetIds: input.changes.map((change) => change.plannedSetId),
          createdAt: now.toISOString(),
          decidedAt: now.toISOString(),
        });
      }),

    ignoreForPlan: (input, now = new Date()) =>
      write(async () => {
        const { base } = await planContext(input);
        return record({
          ...base,
          decision: 'ignored',
          createdAt: now.toISOString(),
          decidedAt: now.toISOString(),
        });
      }),
  };
}
