import { liveQuery } from 'dexie';
import {
  exerciseMediaSchema,
  exerciseSchema,
  type Exercise,
  type ExerciseMedia,
} from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import type { TrainingDatabase } from '../database';
import { ExerciseRuleError, toStorageError, ValidationError } from '../errors';
import { SYSTEM_EXERCISES, SYSTEM_EXERCISES_REVISION } from '../seed/systemExercises';
import type { ExerciseDraft, ExerciseImageChange, ExerciseRepository } from './types';

/** How many recent sessions are scanned for "recently used" exercises. */
const RECENT_SESSIONS_SCANNED = 30;

function rethrow(error: unknown): never {
  if (error instanceof ValidationError || error instanceof ExerciseRuleError) {
    throw error;
  }
  throw toStorageError(error);
}

function validExercise(candidate: unknown): Exercise {
  const result = exerciseSchema.safeParse(candidate);
  if (!result.success) {
    throw new ValidationError('Exercise', result.error.issues);
  }
  return result.data;
}

function validMedia(candidate: ExerciseMedia): ExerciseMedia {
  const result = exerciseMediaSchema.safeParse(candidate);
  if (!result.success) {
    throw new ValidationError('ExerciseMedia', result.error.issues);
  }
  return result.data;
}

/** Draft → stored fields. An empty description is stored as "no description". */
function draftFields(draft: ExerciseDraft) {
  const description = draft.description?.trim();
  return {
    name: draft.name,
    category: draft.category,
    primaryMuscle: draft.primaryMuscle,
    // The primary muscle is never repeated among the secondary ones.
    secondaryMuscles: [...new Set(draft.secondaryMuscles)].filter(
      (muscle) => muscle !== draft.primaryMuscle,
    ),
    equipment: draft.equipment,
    measurementType: draft.measurementType,
    ...(description ? { description } : {}),
  };
}

/**
 * Adds or refreshes the built-in exercises. Runs at every start; writes only
 * when an entry is missing or comes from an older library revision, and never
 * touches custom exercises.
 */
export async function syncSystemExercises(db: TrainingDatabase): Promise<number> {
  try {
    return await db.transaction('rw', db.exercises, async () => {
      const stored = await db.exercises.bulkGet(SYSTEM_EXERCISES.map((seed) => seed.id));
      const outdated = SYSTEM_EXERCISES.filter(
        (_seed, index) => stored[index]?.updatedAt !== SYSTEM_EXERCISES_REVISION,
      ).map((seed) =>
        validExercise({
          ...seed,
          secondaryMuscles: [...seed.secondaryMuscles],
          isCustom: false,
          createdAt: SYSTEM_EXERCISES_REVISION,
          updatedAt: SYSTEM_EXERCISES_REVISION,
        }),
      );
      if (outdated.length > 0) {
        await db.exercises.bulkPut(outdated);
      }
      return outdated.length;
    });
  } catch (error) {
    rethrow(error);
  }
}

export function createDexieExerciseRepository(db: TrainingDatabase): ExerciseRepository {
  /** Must run inside a transaction covering `exerciseMedia`. Returns the new `imageId`. */
  const applyImageChange = async (
    exerciseId: string,
    currentImageId: string | undefined,
    change: ExerciseImageChange,
  ): Promise<string | undefined> => {
    if (change.kind === 'keep') {
      return currentImageId;
    }
    if (currentImageId !== undefined) {
      await db.exerciseMedia.delete(currentImageId);
    }
    if (change.kind === 'remove') {
      return undefined;
    }
    const media = validMedia({
      id: newId(),
      exerciseId,
      mimeType: change.blob.type || 'application/octet-stream',
      blob: change.blob,
      createdAt: nowIso(),
    });
    await db.exerciseMedia.add(media);
    return media.id;
  };

  const requireCustom = async (id: string): Promise<Exercise> => {
    const exercise = await db.exercises.get(id);
    if (exercise === undefined) {
      throw new ExerciseRuleError('not-found');
    }
    if (!exercise.isCustom) {
      throw new ExerciseRuleError('system-exercise');
    }
    return exercise;
  };

  return {
    observeAll(listener, onError) {
      const subscription = liveQuery(() => db.exercises.toArray()).subscribe({
        next: listener,
        error: (error: unknown) => onError?.(toStorageError(error)),
      });
      return () => subscription.unsubscribe();
    },

    async list() {
      try {
        return await db.exercises.toArray();
      } catch (error) {
        rethrow(error);
      }
    },

    async get(id) {
      try {
        return await db.exercises.get(id);
      } catch (error) {
        rethrow(error);
      }
    },

    async createCustom(draft, image = { kind: 'keep' }) {
      try {
        return await db.transaction('rw', db.exercises, db.exerciseMedia, async () => {
          const id = newId();
          const now = nowIso();
          const imageId = await applyImageChange(id, undefined, image);
          const exercise = validExercise({
            id,
            ...draftFields(draft),
            ...(imageId === undefined ? {} : { imageId }),
            isCustom: true,
            createdAt: now,
            updatedAt: now,
          });
          await db.exercises.add(exercise);
          return exercise;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async updateCustom(id, draft, image = { kind: 'keep' }) {
      try {
        return await db.transaction('rw', db.exercises, db.exerciseMedia, async () => {
          const current = await requireCustom(id);
          const imageId = await applyImageChange(id, current.imageId, image);
          const exercise = validExercise({
            id,
            ...draftFields(draft),
            ...(imageId === undefined ? {} : { imageId }),
            isCustom: true,
            createdAt: current.createdAt,
            updatedAt: nowIso(),
          });
          await db.exercises.put(exercise);
          return exercise;
        });
      } catch (error) {
        rethrow(error);
      }
    },

    async deleteCustom(id) {
      try {
        await db.transaction(
          'rw',
          db.exercises,
          db.exerciseMedia,
          db.plannedExercises,
          async () => {
            await requireCustom(id);
            const usedInPlan =
              (await db.plannedExercises.where('exerciseId').equals(id).count()) > 0 ||
              (await db.plannedExercises
                .filter((planned) => planned.alternativeExerciseIds.includes(id))
                .count()) > 0;
            if (usedInPlan) {
              throw new ExerciseRuleError('used-in-plan');
            }
            await db.exerciseMedia.where('exerciseId').equals(id).delete();
            await db.exercises.delete(id);
          },
        );
      } catch (error) {
        rethrow(error);
      }
    },

    async getImage(imageId) {
      try {
        return (await db.exerciseMedia.get(imageId))?.blob;
      } catch (error) {
        rethrow(error);
      }
    },

    async listRecentlyUsedIds(limit) {
      try {
        return await db.transaction('r', db.workoutSessions, db.sessionExercises, async () => {
          const sessions = await db.workoutSessions
            .orderBy('startedAt')
            .reverse()
            .filter((session) => session.status !== 'abandoned')
            .limit(RECENT_SESSIONS_SCANNED)
            .toArray();

          const ids: string[] = [];
          for (const session of sessions) {
            const exercises = await db.sessionExercises
              .where('sessionId')
              .equals(session.id)
              .sortBy('order');
            for (const { exerciseId, isSkipped } of exercises) {
              if (!isSkipped && !ids.includes(exerciseId)) {
                ids.push(exerciseId);
                if (ids.length >= limit) {
                  return ids;
                }
              }
            }
          }
          return ids;
        });
      } catch (error) {
        rethrow(error);
      }
    },
  };
}
