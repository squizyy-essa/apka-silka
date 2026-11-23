import { liveQuery } from 'dexie';
import {
  restTimerStateSchema,
  sessionExerciseSchema,
  sessionSetSchema,
  workoutSessionSchema,
  type SessionExercise,
  type SessionSet,
  type WorkoutSession,
} from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { localDateOf } from '@/shared/lib/localDate';
import { previousCompletedSet, resultForCompletion } from '@/shared/logic/workout';
import type { z } from 'zod';
import type { TrainingDatabase } from '../database';
import { SessionRuleError, toStorageError, ValidationError } from '../errors';
import type { SessionDetail, SessionRepository } from './types';

function rethrow(error: unknown): never {
  if (error instanceof ValidationError || error instanceof SessionRuleError) {
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
function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;

export function createDexieSessionRepository(db: TrainingDatabase): SessionRepository {
  const sessionTables = [db.workoutSessions, db.sessionExercises, db.sessionSets, db.restTimerState];
  const planTables = [
    db.trainingPlans,
    db.planDays,
    db.plannedExercises,
    db.plannedSets,
    db.supersetGroups,
    db.exercises,
  ];

  const detailOf = async (session: WorkoutSession): Promise<SessionDetail> => {
    const exercises = (await db.sessionExercises.where('sessionId').equals(session.id).toArray()).sort(
      byOrder,
    );
    return {
      session,
      exercises: await Promise.all(
        exercises.map(async (exercise) => ({
          exercise,
          sets: (await db.sessionSets.where('sessionExerciseId').equals(exercise.id).toArray()).sort(byOrder),
        })),
      ),
    };
  };

  const activeDetail = async (): Promise<SessionDetail | null> => {
    const session = await db.workoutSessions.where('status').equals('active').first();
    return session === undefined ? null : detailOf(session);
  };

  /** Must run inside the transaction that inserts the new session. */
  const assertNoActiveSession = async () => {
    if ((await db.workoutSessions.where('status').equals('active').count()) > 0) {
      throw new SessionRuleError('already-active');
    }
  };

  const newSession = (name: string, now: Date, source?: { planId: string; dayId: string }) =>
    valid(
      workoutSessionSchema,
      'WorkoutSession',
      compact({
        id: newId(),
        sourcePlanId: source?.planId,
        sourcePlanDayId: source?.dayId,
        name,
        status: 'active',
        startedAt: now.toISOString(),
        localWorkoutDate: localDateOf(now),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    );

  const DEFAULT_SET_COUNT = 3;
  const DEFAULT_INCREMENT_KG = 2.5;
  const isDone = (set: SessionSet) => set.status === 'completed' || set.status === 'failed';

  const write = async <R>(work: () => Promise<R>): Promise<R> => {
    try {
      return await db.transaction('rw', [...sessionTables, db.exercises], work);
    } catch (error) {
      rethrow(error);
    }
  };

  const requireActiveSession = async (sessionId: string): Promise<WorkoutSession> => {
    const session = await db.workoutSessions.get(sessionId);
    if (session === undefined) {
      throw new SessionRuleError('session-not-found');
    }
    if (session.status !== 'active') {
      throw new SessionRuleError('not-active');
    }
    return session;
  };

  /** Exercise of the active session; also bumps the session's `updatedAt`. */
  const requireExercise = async (sessionExerciseId: string): Promise<SessionExercise> => {
    const exercise = await db.sessionExercises.get(sessionExerciseId);
    if (exercise === undefined) {
      throw new SessionRuleError('exercise-not-found');
    }
    await requireActiveSession(exercise.sessionId);
    await db.workoutSessions.update(exercise.sessionId, {
      updatedAt: new Date().toISOString(),
    });
    return exercise;
  };

  const requireSet = async (setId: string) => {
    const set = await db.sessionSets.get(setId);
    if (set === undefined) {
      throw new SessionRuleError('set-not-found');
    }
    return { set, exercise: await requireExercise(set.sessionExerciseId) };
  };

  const setsOf = async (sessionExerciseId: string) =>
    (await db.sessionSets.where('sessionExerciseId').equals(sessionExerciseId).toArray()).sort(byOrder);

  const exercisesOf = async (sessionId: string) =>
    (await db.sessionExercises.where('sessionId').equals(sessionId).toArray()).sort(byOrder);

  const putSet = async (candidate: Record<string, unknown>): Promise<SessionSet> => {
    const set = valid(sessionSetSchema, 'SessionSet', compact(candidate));
    await db.sessionSets.put(set);
    return set;
  };

  const putExercise = async (candidate: Record<string, unknown>): Promise<SessionExercise> => {
    const exercise = valid(sessionExerciseSchema, 'SessionExercise', compact(candidate));
    await db.sessionExercises.put(exercise);
    return exercise;
  };

  return {
    observeActive(listener, onError) {
      const subscription = liveQuery(activeDetail).subscribe({
        next: listener,
        error: (error: unknown) => onError?.(toStorageError(error)),
      });
      return () => subscription.unsubscribe();
    },

    async getActive() {
      try {
        return await db.transaction('r', sessionTables, activeDetail);
      } catch (error) {
        rethrow(error);
      }
    },

    async startFromPlanDay(dayId, now = new Date()) {
      try {
        return await db.transaction('rw', [...sessionTables, ...planTables], async () => {
          await assertNoActiveSession();
          const day = await db.planDays.get(dayId);
          if (day === undefined) {
            throw new SessionRuleError('day-not-found');
          }
          const session = newSession(day.name, now, {
            planId: day.planId,
            dayId,
          });
          await db.workoutSessions.add(session);

          const groups = new Map(
            (await db.supersetGroups.where('planDayId').equals(dayId).toArray()).map((group) => [
              group.id,
              group,
            ]),
          );
          const planned = (await db.plannedExercises.where('planDayId').equals(dayId).toArray()).sort(
            byOrder,
          );

          for (const [order, item] of planned.entries()) {
            const libraryExercise = await db.exercises.get(item.exerciseId);
            if (libraryExercise === undefined) {
              continue; // cannot be performed; the plan keeps the entry untouched
            }
            const group = item.supersetGroupId === undefined ? undefined : groups.get(item.supersetGroupId);
            const exercise: SessionExercise = valid(
              sessionExerciseSchema,
              'SessionExercise',
              compact({
                id: newId(),
                sessionId: session.id,
                exerciseId: item.exerciseId,
                exerciseNameSnapshot: libraryExercise.name,
                measurementTypeSnapshot: libraryExercise.measurementType,
                order,
                supersetGroupId: group?.id,
                restSecondsSnapshot: item.restSeconds,
                progressionIncrementKgSnapshot: item.progressionIncrementKg,
                supersetRestSecondsSnapshot: group?.restAfterRoundSeconds,
                alternativeExerciseIdsSnapshot: item.alternativeExerciseIds,
                notes: item.notes,
                isSkipped: false,
              }),
            );
            await db.sessionExercises.add(exercise);

            const plannedSets = (
              await db.plannedSets.where('plannedExerciseId').equals(item.id).toArray()
            ).sort(byOrder);
            await db.sessionSets.bulkAdd(
              plannedSets.map((set, setOrder): SessionSet =>
                valid(
                  sessionSetSchema,
                  'SessionSet',
                  compact({
                    id: newId(),
                    sessionExerciseId: exercise.id,
                    plannedSetId: set.id,
                    order: setOrder,
                    type: set.type,
                    status: 'pending',
                    plannedWeightKg: set.targetWeightKg,
                    plannedRepsMin: set.targetRepsMin,
                    plannedRepsMax: set.targetRepsMax,
                    plannedRIR: set.targetRIR,
                    plannedDurationSeconds: set.targetDurationSeconds,
                    plannedDistanceMeters: set.targetDistanceMeters,
                    tempo: set.tempo,
                  }),
                ),
              ),
            );
          }
          return detailOf(session);
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async startEmpty(name, now = new Date()) {
      try {
        return await db.transaction('rw', sessionTables, async () => {
          await assertNoActiveSession();
          const session = newSession(name, now);
          await db.workoutSessions.add(session);
          return detailOf(session);
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async abandon(sessionId, now = new Date()) {
      try {
        await db.transaction('rw', sessionTables, async () => {
          const session = await db.workoutSessions.get(sessionId);
          if (session === undefined) {
            throw new SessionRuleError('session-not-found');
          }
          if (session.status !== 'active') {
            throw new SessionRuleError('not-active');
          }
          await db.workoutSessions.update(sessionId, {
            status: 'abandoned',
            updatedAt: now.toISOString(),
          });
          await db.restTimerState.delete(sessionId);
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async get(sessionId) {
      try {
        return await db.transaction('r', sessionTables, async () => {
          const session = await db.workoutSessions.get(sessionId);
          return session === undefined ? null : detailOf(session);
        });
      } catch (error) {
        rethrow(error);
      }
    },

    updateSet: (setId, patch) =>
      write(async () => {
        const { set } = await requireSet(setId);
        return putSet({ ...set, ...patch });
      }),

    setSetStatus: (setId, status, now = new Date()) =>
      write(async () => {
        const { set, exercise } = await requireSet(setId);
        if (status === 'completed') {
          const previous = previousCompletedSet(
            await setsOf(set.sessionExerciseId),
            set,
            exercise.measurementTypeSnapshot,
          );
          const result = resultForCompletion(set, exercise.measurementTypeSnapshot, previous);
          if (!result.ok) {
            throw new SessionRuleError('missing-result', result.missing);
          }
          return putSet({
            ...set,
            ...result.values,
            status,
            completedAt: now.toISOString(),
          });
        }
        if (status === 'failed') {
          // Keep what was really done; the weight attempted defaults to the planned one.
          return putSet({
            ...set,
            actualWeightKg: set.actualWeightKg ?? set.plannedWeightKg,
            status,
            completedAt: now.toISOString(),
          });
        }
        return putSet({ ...set, status, completedAt: undefined });
      }),

    addSet: (sessionExerciseId) =>
      write(async () => {
        await requireExercise(sessionExerciseId);
        const sets = await setsOf(sessionExerciseId);
        const last = sets.at(-1);
        return putSet({
          id: newId(),
          sessionExerciseId,
          order: sets.length,
          type: last?.type ?? 'working',
          status: 'pending',
          plannedWeightKg: last?.plannedWeightKg,
          plannedRepsMin: last?.plannedRepsMin,
          plannedRepsMax: last?.plannedRepsMax,
          plannedRIR: last?.plannedRIR,
          plannedDurationSeconds: last?.plannedDurationSeconds,
          plannedDistanceMeters: last?.plannedDistanceMeters,
          tempo: last?.tempo,
        });
      }),

    removeSet: (setId) =>
      write(async () => {
        const { set } = await requireSet(setId);
        await db.sessionSets.delete(setId);
        const remaining = await setsOf(set.sessionExerciseId);
        await Promise.all(remaining.map(({ id }, order) => db.sessionSets.update(id, { order })));
      }),

    addExercise: (sessionId, exerciseId, options) =>
      write(async () => {
        await requireActiveSession(sessionId);
        const libraryExercise = await db.exercises.get(exerciseId);
        if (libraryExercise === undefined) {
          throw new SessionRuleError('exercise-not-found');
        }
        const exercise = await putExercise({
          id: newId(),
          sessionId,
          exerciseId,
          exerciseNameSnapshot: libraryExercise.name,
          measurementTypeSnapshot: libraryExercise.measurementType,
          order: (await exercisesOf(sessionId)).length,
          restSecondsSnapshot: options.restSeconds,
          progressionIncrementKgSnapshot: DEFAULT_INCREMENT_KG,
          alternativeExerciseIdsSnapshot: [],
          isSkipped: false,
        });
        for (let order = 0; order < DEFAULT_SET_COUNT; order += 1) {
          await putSet({
            id: newId(),
            sessionExerciseId: exercise.id,
            order,
            type: 'working',
            status: 'pending',
          });
        }
        return exercise;
      }),

    setExerciseSkipped: (sessionExerciseId, isSkipped) =>
      write(async () => {
        const exercise = await requireExercise(sessionExerciseId);
        await putExercise({ ...exercise, isSkipped });
        const from = isSkipped ? 'pending' : 'skipped';
        const to = isSkipped ? 'skipped' : 'pending';
        for (const set of await setsOf(sessionExerciseId)) {
          if (set.status === from) {
            await putSet({ ...set, status: to });
          }
        }
      }),

    swapExercise: (sessionExerciseId, newExerciseId) =>
      write(async () => {
        const exercise = await requireExercise(sessionExerciseId);
        const sets = await setsOf(sessionExerciseId);
        if (sets.some(isDone)) {
          throw new SessionRuleError('has-results');
        }
        const replacement = await db.exercises.get(newExerciseId);
        if (replacement === undefined) {
          throw new SessionRuleError('exercise-not-found');
        }
        for (const set of sets) {
          await putSet({
            ...set,
            plannedWeightKg: undefined,
            actualWeightKg: undefined,
          });
        }
        return putExercise({
          ...exercise,
          exerciseId: newExerciseId,
          exerciseNameSnapshot: replacement.name,
          measurementTypeSnapshot: replacement.measurementType,
          // The exercise that was planned stays available as a way back.
          alternativeExerciseIdsSnapshot: [
            ...new Set([exercise.exerciseId, ...exercise.alternativeExerciseIdsSnapshot]),
          ].filter((id) => id !== newExerciseId),
        });
      }),

    removeExercise: (sessionExerciseId) =>
      write(async () => {
        const exercise = await requireExercise(sessionExerciseId);
        if ((await setsOf(sessionExerciseId)).some(isDone)) {
          throw new SessionRuleError('has-results');
        }
        await db.sessionSets.where('sessionExerciseId').equals(sessionExerciseId).delete();
        await db.sessionExercises.delete(sessionExerciseId);
        const remaining = await exercisesOf(exercise.sessionId);
        await Promise.all(remaining.map(({ id }, order) => db.sessionExercises.update(id, { order })));
      }),

    reorderExercises: (sessionId, orderedIds) =>
      write(async () => {
        await requireActiveSession(sessionId);
        const known = new Set((await exercisesOf(sessionId)).map((exercise) => exercise.id));
        if (
          orderedIds.length !== known.size ||
          new Set(orderedIds).size !== known.size ||
          !orderedIds.every((id) => known.has(id))
        ) {
          throw new SessionRuleError('stale-order');
        }
        await Promise.all(orderedIds.map((id, order) => db.sessionExercises.update(id, { order })));
      }),

    updateExerciseNotes: (sessionExerciseId, notes) =>
      write(async () => {
        const exercise = await requireExercise(sessionExerciseId);
        await putExercise({ ...exercise, notes: notes?.trim() || undefined });
      }),

    updateExerciseRest: (sessionExerciseId, restSeconds) =>
      write(async () => {
        const exercise = await requireExercise(sessionExerciseId);
        await putExercise({ ...exercise, restSecondsSnapshot: restSeconds });
      }),

    finish: (sessionId, result, now = new Date()) =>
      write(async () => {
        const session = await requireActiveSession(sessionId);
        for (const exercise of await exercisesOf(sessionId)) {
          for (const set of await setsOf(exercise.id)) {
            if (set.status === 'pending') {
              await putSet({ ...set, status: 'skipped' });
            }
          }
        }
        const finished = valid(
          workoutSessionSchema,
          'WorkoutSession',
          compact({
            ...session,
            status: 'completed',
            completedAt: now.toISOString(),
            updatedAt: now.toISOString(),
            wellbeingRating: result.wellbeingRating,
            notes: result.notes?.trim() || undefined,
          }),
        );
        await db.workoutSessions.put(finished);
        await db.restTimerState.delete(sessionId);
        return detailOf(finished);
      }),

    async getPreviousResult(exerciseId, excludeSessionId) {
      try {
        return await db.transaction('r', sessionTables, async () => {
          const occurrences = await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray();
          let best: { session: WorkoutSession; sets: SessionSet[] } | null = null;
          for (const occurrence of occurrences) {
            if (occurrence.sessionId === excludeSessionId || occurrence.isSkipped) {
              continue;
            }
            const session = await db.workoutSessions.get(occurrence.sessionId);
            if (
              session === undefined ||
              session.status !== 'completed' ||
              (best !== null && session.startedAt <= best.session.startedAt)
            ) {
              continue;
            }
            const sets = (await setsOf(occurrence.id)).filter(isDone);
            if (sets.length > 0) {
              best = { session, sets };
            }
          }
          return best;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async getExerciseHistory(exerciseId, startedBefore, limit) {
      try {
        return await db.transaction('r', sessionTables, async () => {
          const occurrences = await db.sessionExercises.where('exerciseId').equals(exerciseId).toArray();
          const found = [];
          for (const exercise of occurrences) {
            const session = await db.workoutSessions.get(exercise.sessionId);
            if (
              session !== undefined &&
              session.status === 'completed' &&
              session.startedAt < startedBefore
            ) {
              found.push({ session, exercise });
            }
          }
          found.sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
          return Promise.all(
            found.slice(0, Math.max(0, limit)).map(async ({ session, exercise }) => ({
              session,
              exercise,
              sets: await setsOf(exercise.id),
            })),
          );
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async getLastCompletedDayId(planId) {
      try {
        const sessions = await db.workoutSessions.where('sourcePlanId').equals(planId).toArray();
        return sessions
          .filter((session) => session.status === 'completed')
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]?.sourcePlanDayId;
      } catch (error) {
        rethrow(error);
      }
    },

    observeCompleted(listener, onError) {
      const subscription = liveQuery(async () => {
        const sessions = await db.workoutSessions.where('status').equals('completed').toArray();
        const details = await Promise.all(sessions.map(detailOf));
        return details.sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt));
      }).subscribe({
        next: listener,
        error: (error: unknown) => onError?.(toStorageError(error)),
      });
      return () => subscription.unsubscribe();
    },

    updateFinishedSet: (setId, patch, now = new Date()) =>
      write(async () => {
        const set = await db.sessionSets.get(setId);
        if (set === undefined) {
          throw new SessionRuleError('set-not-found');
        }
        const exercise = await db.sessionExercises.get(set.sessionExerciseId);
        const session = exercise === undefined ? undefined : await db.workoutSessions.get(exercise.sessionId);
        if (exercise === undefined || session === undefined) {
          throw new SessionRuleError('session-not-found');
        }
        if (session.status !== 'completed') {
          throw new SessionRuleError('not-finished');
        }
        const { status, ...values } = patch;
        let next: Record<string, unknown> = { ...set, ...values };
        if (status === 'completed') {
          const result = resultForCompletion(next as SessionSet, exercise.measurementTypeSnapshot);
          if (!result.ok) {
            throw new SessionRuleError('missing-result', result.missing);
          }
          next = { ...next, ...result.values, status };
        } else if (status === 'failed') {
          next = { ...next, status };
        }
        const saved = await putSet(next);
        await db.workoutSessions.update(session.id, { updatedAt: now.toISOString() });
        return saved;
      }),

    updateFinishedSession: (sessionId, patch, now = new Date()) =>
      write(async () => {
        const session = await db.workoutSessions.get(sessionId);
        if (session === undefined) {
          throw new SessionRuleError('session-not-found');
        }
        if (session.status !== 'completed') {
          throw new SessionRuleError('not-finished');
        }
        const next = valid(
          workoutSessionSchema,
          'WorkoutSession',
          compact({ ...session, ...patch, updatedAt: now.toISOString() }),
        );
        await db.workoutSessions.put(next);
        return next;
      }),

    observeRestTimer(sessionId, listener, onError) {
      const subscription = liveQuery(() => db.restTimerState.get(sessionId)).subscribe({
        next: (timer) => listener(timer ?? null),
        error: (error: unknown) => onError?.(toStorageError(error)),
      });
      return () => subscription.unsubscribe();
    },

    async saveRestTimer(timer) {
      try {
        await db.restTimerState.put(valid(restTimerStateSchema, 'RestTimerState', timer));
      } catch (error) {
        rethrow(error);
      }
    },

    async clearRestTimer(sessionId) {
      try {
        await db.restTimerState.delete(sessionId);
      } catch (error) {
        rethrow(error);
      }
    },
  };
}
