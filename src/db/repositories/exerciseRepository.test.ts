// @vitest-environment node
// (Node's Blob survives IndexedDB's structured clone in tests; jsdom's does not.)
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { exerciseSchema, type Exercise } from '@/shared/domain';
import { newId } from '@/shared/lib/id';
import { nowIso } from '@/shared/lib/time';
import { isolatedDatabaseNames } from '@/test/testDatabase';
import { TrainingDatabase } from '../database';
import { ExerciseRuleError, ValidationError } from '../errors';
import { SYSTEM_EXERCISES, SYSTEM_EXERCISES_REVISION } from '../seed/systemExercises';
import { createDexieExerciseRepository, syncSystemExercises } from './dexieExerciseRepository';
import type { ExerciseDraft } from './types';

const nextDatabaseName = isolatedDatabaseNames();

const draft: ExerciseDraft = {
  name: 'Wiosłowanie TRX',
  description: 'Podciąganie tułowia na taśmach.',
  category: 'compound',
  primaryMuscle: 'back',
  secondaryMuscles: ['biceps'],
  equipment: 'other',
  measurementType: 'bodyweight_reps',
};

function image(text = 'fake image bytes'): Blob {
  return new Blob([text], { type: 'image/jpeg' });
}

describe('built-in exercise library', () => {
  it('contains only valid exercises with unique ids and names', () => {
    const ids = new Set(SYSTEM_EXERCISES.map((seed) => seed.id));
    const names = new Set(SYSTEM_EXERCISES.map((seed) => seed.name.toLowerCase()));
    expect(ids.size).toBe(SYSTEM_EXERCISES.length);
    expect(names.size).toBe(SYSTEM_EXERCISES.length);
    expect(SYSTEM_EXERCISES.length).toBeGreaterThanOrEqual(60);

    for (const seed of SYSTEM_EXERCISES) {
      const result = exerciseSchema.safeParse({
        ...seed,
        isCustom: false,
        createdAt: SYSTEM_EXERCISES_REVISION,
        updatedAt: SYSTEM_EXERCISES_REVISION,
      });
      expect(result.success, seed.name).toBe(true);
      expect(seed.secondaryMuscles, seed.name).not.toContain(seed.primaryMuscle);
      expect(seed.description.length, seed.name).toBeGreaterThan(20);
    }
  });

  it('covers every muscle group and the main equipment types from the spec', () => {
    const muscles = new Set(SYSTEM_EXERCISES.map((seed) => seed.primaryMuscle));
    const equipment = new Set(SYSTEM_EXERCISES.map((seed) => seed.equipment));
    expect([...muscles].sort()).toEqual(
      [
        'abs',
        'back',
        'biceps',
        'calves',
        'chest',
        'forearms',
        'glutes',
        'hamstrings',
        'quadriceps',
        'shoulders',
        'triceps',
      ].sort(),
    );
    for (const type of ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight']) {
      expect(equipment, type).toContain(type);
    }
  });

  it('is installed on first start and not rewritten on later starts', async () => {
    const db = new TrainingDatabase(nextDatabaseName());

    expect(await syncSystemExercises(db)).toBe(SYSTEM_EXERCISES.length);
    expect(await db.exercises.count()).toBe(SYSTEM_EXERCISES.length);
    expect(await syncSystemExercises(db)).toBe(0);
    expect((await db.exercises.toArray()).every((exercise) => !exercise.isCustom)).toBe(true);
    db.close();
  });

  it('refreshes outdated built-in entries without touching custom exercises', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    await syncSystemExercises(db);
    const repository = createDexieExerciseRepository(db);
    const custom = await repository.createCustom(draft);
    const [first] = SYSTEM_EXERCISES;
    if (!first) {
      throw new Error('empty library');
    }
    await db.exercises.update(first.id, {
      name: 'Stara nazwa',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    await db.exercises.delete(SYSTEM_EXERCISES[1]?.id ?? '');

    expect(await syncSystemExercises(db)).toBe(2);

    expect((await db.exercises.get(first.id))?.name).toBe(first.name);
    expect(await db.exercises.count()).toBe(SYSTEM_EXERCISES.length + 1);
    expect(await repository.get(custom.id)).toEqual(custom);
    db.close();
  });
});

describe('exercise repository', () => {
  it('creates a custom exercise that is still there after reopening the database', async () => {
    const name = nextDatabaseName();
    const first = new TrainingDatabase(name);
    const created = await createDexieExerciseRepository(first).createCustom(draft);
    first.close();

    expect(created).toMatchObject({ ...draft, isCustom: true });
    expect(created.imageId).toBeUndefined();

    const second = new TrainingDatabase(name);
    expect(await createDexieExerciseRepository(second).get(created.id)).toEqual(created);
    second.close();
  });

  it('trims the name, drops an empty description and de-duplicates secondary muscles', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const created = await createDexieExerciseRepository(db).createCustom({
      ...draft,
      name: '  Wiosłowanie TRX  ',
      description: '   ',
      secondaryMuscles: ['biceps', 'back', 'biceps'],
    });

    expect(created.name).toBe('Wiosłowanie TRX');
    expect('description' in created).toBe(false);
    expect(created.secondaryMuscles).toEqual(['biceps']);
    db.close();
  });

  it('rejects an invalid exercise and stores neither it nor its image', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieExerciseRepository(db);

    await expect(
      repository.createCustom({ ...draft, name: '   ' }, { kind: 'replace', blob: image() }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await db.exercises.count()).toBe(0);
    expect(await db.exerciseMedia.count()).toBe(0);
    db.close();
  });

  it('updates a custom exercise, keeping its id and creation date', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieExerciseRepository(db);
    const created = await repository.createCustom(draft);

    const updated = await repository.updateCustom(created.id, {
      ...draft,
      name: 'Wiosłowanie na taśmach',
      equipment: 'bodyweight',
    });

    expect(updated).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      name: 'Wiosłowanie na taśmach',
      equipment: 'bodyweight',
    });
    expect(await repository.get(created.id)).toEqual(updated);
    expect(await db.exercises.count()).toBe(1);
    db.close();
  });

  it('stores, replaces and removes the image together with the exercise', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieExerciseRepository(db);

    const created = await repository.createCustom(draft, { kind: 'replace', blob: image('one') });
    expect(created.imageId).toBeDefined();
    const stored = await repository.getImage(created.imageId ?? '');
    expect(await stored?.text()).toBe('one');
    expect(stored?.type).toBe('image/jpeg');

    const kept = await repository.updateCustom(created.id, { ...draft, name: 'Inna nazwa' });
    expect(kept.imageId).toBe(created.imageId);

    const replaced = await repository.updateCustom(created.id, draft, {
      kind: 'replace',
      blob: image('two'),
    });
    expect(replaced.imageId).not.toBe(created.imageId);
    expect(await (await repository.getImage(replaced.imageId ?? ''))?.text()).toBe('two');
    expect(await db.exerciseMedia.count()).toBe(1); // the old image is gone

    const removed = await repository.updateCustom(created.id, draft, { kind: 'remove' });
    expect(removed.imageId).toBeUndefined();
    expect(await db.exerciseMedia.count()).toBe(0);
    db.close();
  });

  it('deletes a custom exercise with its image but keeps workout history (edge case 5)', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieExerciseRepository(db);
    const created = await repository.createCustom(draft, { kind: 'replace', blob: image() });
    const sessionId = newId();
    const sessionExercise = {
      id: newId(),
      sessionId,
      exerciseId: created.id,
      exerciseNameSnapshot: created.name,
      measurementTypeSnapshot: created.measurementType,
      order: 0,
      restSecondsSnapshot: 90,
      progressionIncrementKgSnapshot: 2.5,
      alternativeExerciseIdsSnapshot: [],
      isSkipped: false,
    };
    await db.sessionExercises.add(sessionExercise);

    await repository.deleteCustom(created.id);

    expect(await repository.get(created.id)).toBeUndefined();
    expect(await db.exerciseMedia.count()).toBe(0);
    expect(await db.sessionExercises.get(sessionExercise.id)).toEqual(sessionExercise);
    db.close();
  });

  it('refuses to edit or delete built-in and missing exercises', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    await syncSystemExercises(db);
    const repository = createDexieExerciseRepository(db);
    const builtInId = SYSTEM_EXERCISES[0]?.id ?? '';

    await expect(repository.updateCustom(builtInId, draft)).rejects.toMatchObject({
      violation: 'system-exercise',
    });
    await expect(repository.deleteCustom(builtInId)).rejects.toBeInstanceOf(ExerciseRuleError);
    await expect(repository.deleteCustom(newId())).rejects.toMatchObject({
      violation: 'not-found',
    });
    expect(await db.exercises.count()).toBe(SYSTEM_EXERCISES.length);
    expect((await repository.get(builtInId))?.name).toBe(SYSTEM_EXERCISES[0]?.name);
    db.close();
  });

  it('refuses to delete an exercise that a plan uses, directly or as an alternative', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieExerciseRepository(db);
    const main = await repository.createCustom(draft);
    const alternative = await repository.createCustom({ ...draft, name: 'Zamiennik' });
    await db.plannedExercises.add({
      id: newId(),
      planDayId: newId(),
      exerciseId: main.id,
      order: 0,
      restSeconds: 90,
      progressionIncrementKg: 2.5,
      alternativeExerciseIds: [alternative.id],
    });

    await expect(repository.deleteCustom(main.id)).rejects.toMatchObject({
      violation: 'used-in-plan',
    });
    await expect(repository.deleteCustom(alternative.id)).rejects.toMatchObject({
      violation: 'used-in-plan',
    });
    expect(await db.exercises.count()).toBe(2);
    db.close();
  });

  it('emits the library to subscribers after every change', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieExerciseRepository(db);
    const seen: Exercise[][] = [];
    const unsubscribe = repository.observeAll((exercises) => seen.push(exercises));

    const created = await repository.createCustom(draft);
    await vi.waitFor(() => {
      expect(seen.at(-1)?.map((exercise) => exercise.id)).toEqual([created.id]);
    });

    await repository.deleteCustom(created.id);
    await vi.waitFor(() => {
      expect(seen.at(-1)).toEqual([]);
    });
    unsubscribe();
    db.close();
  });

  it('lists recently used exercises: newest workout first, no duplicates, no skipped or abandoned', async () => {
    const db = new TrainingDatabase(nextDatabaseName());
    const repository = createDexieExerciseRepository(db);
    const [squat, bench, row, curl] = [newId(), newId(), newId(), newId()];

    const addSession = async (
      startedAt: string,
      status: 'completed' | 'abandoned' | 'active',
      exercises: { exerciseId: string; isSkipped?: boolean }[],
    ) => {
      const sessionId = newId();
      await db.workoutSessions.add({
        id: sessionId,
        name: 'Trening',
        status,
        startedAt,
        localWorkoutDate: startedAt.slice(0, 10),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      await db.sessionExercises.bulkAdd(
        exercises.map(({ exerciseId, isSkipped = false }, order) => ({
          id: newId(),
          sessionId,
          exerciseId,
          exerciseNameSnapshot: 'x',
          measurementTypeSnapshot: 'weight_reps' as const,
          order,
          restSecondsSnapshot: 90,
          progressionIncrementKgSnapshot: 2.5,
          alternativeExerciseIdsSnapshot: [],
          isSkipped,
        })),
      );
    };

    expect(await repository.listRecentlyUsedIds(5)).toEqual([]);

    await addSession('2026-11-10T17:00:00.000Z', 'completed', [
      { exerciseId: squat },
      { exerciseId: bench },
    ]);
    await addSession('2026-11-12T17:00:00.000Z', 'abandoned', [{ exerciseId: curl }]);
    await addSession('2026-11-14T17:00:00.000Z', 'completed', [
      { exerciseId: row },
      { exerciseId: curl, isSkipped: true },
      { exerciseId: squat },
    ]);

    expect(await repository.listRecentlyUsedIds(5)).toEqual([row, squat, bench]);
    expect(await repository.listRecentlyUsedIds(2)).toEqual([row, squat]);
    db.close();
  });
});
