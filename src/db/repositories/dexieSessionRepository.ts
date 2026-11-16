import { liveQuery } from 'dexie';
import {
  sessionExerciseSchema,
  sessionSetSchema,
  workoutSessionSchema,
  type SessionExercise,
  type SessionSet,
  type WorkoutSession,
} from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { localDateOf } from '@/shared/lib/localDate';
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
  const sessionTables = [db.workoutSessions, db.sessionExercises, db.sessionSets];
  const planTables = [
    db.trainingPlans,
    db.planDays,
    db.plannedExercises,
    db.plannedSets,
    db.supersetGroups,
    db.exercises,
  ];

  const detailOf = async (session: WorkoutSession): Promise<SessionDetail> => {
    const exercises = (
      await db.sessionExercises.where('sessionId').equals(session.id).toArray()
    ).sort(byOrder);
    return {
      session,
      exercises: await Promise.all(
        exercises.map(async (exercise) => ({
          exercise,
          sets: (
            await db.sessionSets.where('sessionExerciseId').equals(exercise.id).toArray()
          ).sort(byOrder),
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
          const session = newSession(day.name, now, { planId: day.planId, dayId });
          await db.workoutSessions.add(session);

          const groups = new Map(
            (await db.supersetGroups.where('planDayId').equals(dayId).toArray()).map((group) => [
              group.id,
              group,
            ]),
          );
          const planned = (
            await db.plannedExercises.where('planDayId').equals(dayId).toArray()
          ).sort(byOrder);

          for (const [order, item] of planned.entries()) {
            const libraryExercise = await db.exercises.get(item.exerciseId);
            if (libraryExercise === undefined) {
              continue; // cannot be performed; the plan keeps the entry untouched
            }
            const group =
              item.supersetGroupId === undefined ? undefined : groups.get(item.supersetGroupId);
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
              plannedSets.map(
                (set, setOrder): SessionSet =>
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
        });
      } catch (error) {
        rethrow(error);
      }
    },
  };
}
