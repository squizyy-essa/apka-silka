import { describe, expect, it, vi } from "vitest";
import type { RestTimerState } from "@/shared/domain";
import { sessionTotals, startRestTimer } from "@/shared/logic/workout";
import { isolatedDatabaseNames } from "@/test/testDatabase";
import { TrainingDatabase } from "../database";
import { SessionRuleError, ValidationError } from "../errors";
import { SYSTEM_EXERCISES } from "../seed/systemExercises";
import { syncSystemExercises } from "./dexieExerciseRepository";
import { createDexiePlanRepository } from "./dexiePlanRepository";
import { createDexieSessionRepository } from "./dexieSessionRepository";
import type { SessionDetail } from "./types";

const nextDatabaseName = isolatedDatabaseNames();
const [BENCH, INCLINE, FLY] = SYSTEM_EXERCISES.map((seed) => seed.id) as [
  string,
  string,
  string,
];
const PLANK =
  SYSTEM_EXERCISES.find((seed) => seed.measurementType === "duration")?.id ??
  "";
const at = (minutes: number) => new Date(2026, 10, 16, 18, minutes, 0);

/** A "Push" day: bench 3 × 8–12 @ 60 kg RIR 2, then incline with empty targets. */
async function startedWorkout(name = nextDatabaseName()) {
  const db = new TrainingDatabase(name);
  await syncSystemExercises(db);
  const plans = createDexiePlanRepository(db);
  const sessions = createDexieSessionRepository(db);
  const plan = await plans.createPlan({
    name: "PPL",
    scheduleMode: "flexible",
  });
  const day = await plans.addDay(plan.id, "Push");
  const bench = await plans.addExercise(day.id, BENCH, { restSeconds: 120 });
  await plans.addExercise(day.id, INCLINE, { restSeconds: 90 });
  for (const set of (await plans.getDay(day.id))?.exercises[0]?.sets ?? []) {
    await plans.updateSet(set.id, {
      targetWeightKg: 60,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetRIR: 2,
    });
  }
  await plans.updateExercise(bench.id, { alternativeExerciseIds: [FLY] });
  const detail = await sessions.startFromPlanDay(day.id, at(0));
  return { db, plans, sessions, plan, day, detail, name };
}

const active = async (
  sessions: ReturnType<typeof createDexieSessionRepository>,
) => {
  const detail = await sessions.getActive();
  if (detail === null) {
    throw new Error("no active session");
  }
  return detail;
};
const setIds = (detail: SessionDetail, exerciseIndex: number) =>
  detail.exercises[exerciseIndex]?.sets.map((set) => set.id) ?? [];

describe("recording sets", () => {
  it("saves each value at once – before the set, let alone the workout, is finished", async () => {
    const { db, sessions, detail, name } = await startedWorkout();
    const [first] = setIds(detail, 0);

    await sessions.updateSet(first ?? "", { actualWeightKg: 62.5 });
    await sessions.updateSet(first ?? "", { actualReps: 9 });
    await sessions.updateSet(first ?? "", { actualRIR: 2 });
    db.close();

    // "The app was closed": a fresh connection still has everything.
    const reopened = new TrainingDatabase(name);
    const restored = await active(createDexieSessionRepository(reopened));
    expect(restored.exercises[0]?.sets[0]).toMatchObject({
      status: "pending",
      plannedWeightKg: 60,
      actualWeightKg: 62.5,
      actualReps: 9,
      actualRIR: 2,
    });
    reopened.close();
  });

  it("completes a set with the typed result and a timestamp; planned values stay untouched", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [first] = setIds(detail, 0);
    await sessions.updateSet(first ?? "", {
      actualWeightKg: 62.5,
      actualReps: 9,
      actualRIR: 1,
    });

    const completed = await sessions.setSetStatus(
      first ?? "",
      "completed",
      at(5),
    );

    expect(completed).toMatchObject({
      status: "completed",
      completedAt: at(5).toISOString(),
      actualWeightKg: 62.5,
      actualReps: 9,
      actualRIR: 1,
      plannedWeightKg: 60,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      plannedRIR: 2,
    });
    db.close();
  });

  it("lets the next set be confirmed without retyping: it repeats the previous completed set", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [first, second] = setIds(detail, 0);
    await sessions.updateSet(first ?? "", {
      actualWeightKg: 62.5,
      actualReps: 9,
      actualRIR: 1,
    });
    await sessions.setSetStatus(first ?? "", "completed", at(5));

    const completed = await sessions.setSetStatus(
      second ?? "",
      "completed",
      at(8),
    );

    expect(completed).toMatchObject({
      status: "completed",
      actualWeightKg: 62.5,
      actualReps: 9,
      actualRIR: 1,
    });
    db.close();
  });

  it("uses the planned weight when none was typed, but demands reps for a rep range", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [first] = setIds(detail, 0);

    const refused = await sessions
      .setSetStatus(first ?? "", "completed", at(5))
      .catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(SessionRuleError);
    expect(refused).toMatchObject({
      violation: "missing-result",
      missing: "reps",
    });
    expect((await db.sessionSets.get(first ?? ""))?.status).toBe("pending");

    await sessions.updateSet(first ?? "", { actualReps: 12 });
    expect(
      await sessions.setSetStatus(first ?? "", "completed", at(5)),
    ).toMatchObject({
      actualWeightKg: 60,
      actualReps: 12,
    });
    // RIR was not given: it stays "no data", it is not turned into 0 or the target.
    expect("actualRIR" in ((await db.sessionSets.get(first ?? "")) ?? {})).toBe(
      false,
    );
    db.close();
  });

  it("records a failed set with the real result next to the plan (spec §7.5, edge case 15)", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [first] = setIds(detail, 0);
    await sessions.updateSet(first ?? "", { actualReps: 9 });

    const failed = await sessions.setSetStatus(first ?? "", "failed", at(5));

    expect(failed).toMatchObject({
      status: "failed",
      actualWeightKg: 60,
      actualReps: 9,
      plannedRepsMin: 8,
      plannedRepsMax: 12,
      completedAt: at(5).toISOString(),
    });
    db.close();
  });

  it("skips and un-does: pending again has no completion time; typed values are kept", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [first, second] = setIds(detail, 0);
    await sessions.updateSet(first ?? "", { actualReps: 10 });
    await sessions.setSetStatus(first ?? "", "completed", at(5));

    const undone = await sessions.setSetStatus(first ?? "", "pending");
    expect(undone).toMatchObject({ status: "pending", actualReps: 10 });
    expect("completedAt" in undone).toBe(false);

    expect((await sessions.setSetStatus(second ?? "", "skipped")).status).toBe(
      "skipped",
    );
    db.close();
  });

  it("rejects invalid results and clears values on request", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [first] = setIds(detail, 0);
    await sessions.updateSet(first ?? "", {
      actualWeightKg: 60,
      actualReps: 10,
    });

    for (const patch of [
      { actualWeightKg: -1 },
      { actualReps: 9.5 },
      { actualRIR: 11 },
      { actualWeightKg: Number.NaN },
    ]) {
      await expect(
        sessions.updateSet(first ?? "", patch),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(await db.sessionSets.get(first ?? "")).toMatchObject({
      actualWeightKg: 60,
      actualReps: 10,
    });

    const cleared = await sessions.updateSet(first ?? "", {
      actualWeightKg: undefined,
    });
    expect("actualWeightKg" in cleared).toBe(false);
    expect(
      (await sessions.updateSet(first ?? "", { actualWeightKg: 0 }))
        .actualWeightKg,
    ).toBe(0);
    db.close();
  });

  it("adds a set (copying the plan of the last one) and removes one, renumbering (edge case 7)", async () => {
    const { db, plans, sessions, detail, day } = await startedWorkout();
    const exerciseId = detail.exercises[0]?.exercise.id ?? "";

    const added = await sessions.addSet(exerciseId);
    expect(added).toMatchObject({
      order: 3,
      status: "pending",
      plannedWeightKg: 60,
      plannedRepsMax: 12,
    });
    expect("plannedSetId" in added).toBe(false);

    await sessions.removeSet(setIds(detail, 0)[0] ?? "");
    const sets = (await active(sessions)).exercises[0]?.sets ?? [];
    expect(sets.map((set) => set.order)).toEqual([0, 1, 2]);
    expect(sets.at(-1)?.id).toBe(added.id);
    // The plan template is not changed by what happens in a workout.
    expect((await plans.getDay(day.id))?.exercises[0]?.sets).toHaveLength(3);
    db.close();
  });

  it("handles a time-based exercise", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const plank = await sessions.addExercise(detail.session.id, PLANK, {
      restSeconds: 60,
    });
    const [first] =
      (await active(sessions)).exercises.find((e) => e.exercise.id === plank.id)
        ?.sets ?? [];

    await expect(
      sessions.setSetStatus(first?.id ?? "", "completed"),
    ).rejects.toMatchObject({ missing: "duration" });
    await sessions.updateSet(first?.id ?? "", { durationSeconds: 75 });
    expect(
      await sessions.setSetStatus(first?.id ?? "", "completed", at(9)),
    ).toMatchObject({ status: "completed", durationSeconds: 75 });
    db.close();
  });
});

describe("changing exercises during the workout", () => {
  it("skips a whole exercise and restores it (edge case 9)", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const exerciseId = detail.exercises[0]?.exercise.id ?? "";
    const [first] = setIds(detail, 0);
    await sessions.updateSet(first ?? "", { actualReps: 10 });
    await sessions.setSetStatus(first ?? "", "completed", at(3));

    await sessions.setExerciseSkipped(exerciseId, true);
    let exercise = (await active(sessions)).exercises[0];
    expect(exercise?.exercise.isSkipped).toBe(true);
    expect(exercise?.sets.map((set) => set.status)).toEqual([
      "completed",
      "skipped",
      "skipped",
    ]);
    expect(sessionTotals((await active(sessions)).exercises).setsDone).toBe(0);

    await sessions.setExerciseSkipped(exerciseId, false);
    exercise = (await active(sessions)).exercises[0];
    expect(exercise?.sets.map((set) => set.status)).toEqual([
      "completed",
      "pending",
      "pending",
    ]);
    db.close();
  });

  it("swaps an exercise for an alternative before any set is done; not after", async () => {
    const { db, plans, sessions, detail, day } = await startedWorkout();
    const exerciseId = detail.exercises[0]?.exercise.id ?? "";

    const swapped = await sessions.swapExercise(exerciseId, FLY);
    expect(swapped).toMatchObject({
      exerciseId: FLY,
      exerciseNameSnapshot: "Wyciskanie hantli na ławce poziomej",
      alternativeExerciseIdsSnapshot: [BENCH], // the planned exercise is the way back
    });
    const sets = (await active(sessions)).exercises[0]?.sets ?? [];
    // Rep targets stay, the weight of the other exercise does not.
    expect(
      sets.map((set) => [
        set.plannedWeightKg,
        set.plannedRepsMin,
        set.plannedRepsMax,
      ]),
    ).toEqual([
      [undefined, 8, 12],
      [undefined, 8, 12],
      [undefined, 8, 12],
    ]);
    expect((await plans.getDay(day.id))?.exercises[0]?.planned.exerciseId).toBe(
      BENCH,
    );

    await sessions.updateSet(sets[0]?.id ?? "", {
      actualWeightKg: 20,
      actualReps: 10,
    });
    await sessions.setSetStatus(sets[0]?.id ?? "", "completed", at(4));
    await expect(
      sessions.swapExercise(exerciseId, BENCH),
    ).rejects.toMatchObject({ violation: "has-results" });
    await expect(sessions.removeExercise(exerciseId)).rejects.toMatchObject({
      violation: "has-results",
    });
    db.close();
  });

  it("adds, reorders and removes exercises; adds notes (edge case 8)", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [a, b] = detail.exercises.map((e) => e.exercise.id) as [
      string,
      string,
    ];
    const c = (
      await sessions.addExercise(detail.session.id, FLY, { restSeconds: 75 })
    ).id;
    expect((await active(sessions)).exercises.at(-1)).toMatchObject({
      exercise: {
        order: 2,
        restSecondsSnapshot: 75,
        progressionIncrementKgSnapshot: 2.5,
      },
    });
    expect((await active(sessions)).exercises.at(-1)?.sets).toHaveLength(3);

    await sessions.reorderExercises(detail.session.id, [c, a, b]);
    expect(
      (await active(sessions)).exercises.map((e) => e.exercise.id),
    ).toEqual([c, a, b]);
    await expect(
      sessions.reorderExercises(detail.session.id, [a, b]),
    ).rejects.toMatchObject({ violation: "stale-order" });

    await sessions.removeExercise(a);
    expect(
      (await active(sessions)).exercises.map((e) => [
        e.exercise.id,
        e.exercise.order,
      ]),
    ).toEqual([
      [c, 0],
      [b, 1],
    ]);
    expect(
      await db.sessionSets.where("sessionExerciseId").equals(a).count(),
    ).toBe(0);

    await sessions.updateExerciseNotes(b, "  Ból barku przy 3. serii ");
    expect((await active(sessions)).exercises[1]?.exercise.notes).toBe(
      "Ból barku przy 3. serii",
    );
    await sessions.updateExerciseNotes(b, " ");
    expect(
      "notes" in ((await active(sessions)).exercises[1]?.exercise ?? {}),
    ).toBe(false);
    db.close();
  });
});

describe("finishing", () => {
  it("acceptance test B at data level: history holds exactly what was really done", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const [s1, s2, s3] = setIds(detail, 0);
    await sessions.updateSet(s1 ?? "", {
      actualWeightKg: 62.5,
      actualReps: 10,
      actualRIR: 2,
    });
    await sessions.setSetStatus(s1 ?? "", "completed", at(4));
    await sessions.updateSet(s2 ?? "", { actualReps: 7 });
    await sessions.setSetStatus(s2 ?? "", "failed", at(8));

    const finished = await sessions.finish(
      detail.session.id,
      { wellbeingRating: 4, notes: " Dobry trening " },
      at(50),
    );

    expect(finished.session).toMatchObject({
      status: "completed",
      startedAt: at(0).toISOString(),
      completedAt: at(50).toISOString(),
      localWorkoutDate: "2026-11-16",
      wellbeingRating: 4,
      notes: "Dobry trening",
    });
    expect(
      finished.exercises[0]?.sets.map((s) => [
        s.status,
        s.actualWeightKg,
        s.actualReps,
        s.actualRIR,
      ]),
    ).toEqual([
      ["completed", 62.5, 10, 2],
      ["failed", 60, 7, undefined],
      ["skipped", undefined, undefined, undefined], // not done → skipped, never "completed" (edge case 16)
    ]);
    expect(
      finished.exercises[1]?.sets.every((s) => s.status === "skipped"),
    ).toBe(true);
    expect(sessionTotals(finished.exercises)).toMatchObject({
      exercisesDone: 1,
      setsDone: 2,
      setsPending: 0,
      workingVolumeKg: 62.5 * 10 + 60 * 7,
    });
    expect(await sessions.getActive()).toBeNull();
    expect(await sessions.get(detail.session.id)).toEqual(finished);

    // A finished workout is closed for these operations.
    await expect(
      sessions.updateSet(s3 ?? "", { actualReps: 5 }),
    ).rejects.toMatchObject({ violation: "not-active" });
    await expect(
      sessions.finish(detail.session.id, {}, at(51)),
    ).rejects.toMatchObject({ violation: "not-active" });
    await expect(
      sessions.finish(detail.session.id, { wellbeingRating: 9 }),
    ).rejects.toBeInstanceOf(SessionRuleError);
    db.close();
  });

  it("allows finishing without any done set and rejects an impossible rating (edge case 10)", async () => {
    const { db, sessions, detail } = await startedWorkout();

    await expect(
      sessions.finish(detail.session.id, { wellbeingRating: 6 }, at(1)),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await active(sessions)).session.status).toBe("active");
    // The refused finish changed nothing: sets are still pending.
    expect((await active(sessions)).exercises[0]?.sets[0]?.status).toBe(
      "pending",
    );

    const finished = await sessions.finish(detail.session.id, {}, at(1));
    expect(sessionTotals(finished.exercises).setsDone).toBe(0);
    expect("wellbeingRating" in finished.session).toBe(false);
    db.close();
  });

  it("two workouts on one day are separate sessions with the same local date (edge case 17)", async () => {
    const { db, sessions, detail, day } = await startedWorkout();
    await sessions.finish(detail.session.id, {}, at(30));
    const second = await sessions.startFromPlanDay(day.id, at(45));
    await sessions.finish(second.session.id, {}, at(59));

    const completed = await db.workoutSessions
      .where("localWorkoutDate")
      .equals("2026-11-16")
      .toArray();
    expect(completed.map((s) => s.status)).toEqual(["completed", "completed"]);
    expect(new Set(completed.map((s) => s.id)).size).toBe(2);
    db.close();
  });
});

describe("previous result and next workout", () => {
  it("finds the latest completed workout with the same exercise id; ignores abandoned and current ones", async () => {
    const { db, sessions, detail, day } = await startedWorkout();
    expect(
      await sessions.getPreviousResult(BENCH, detail.session.id),
    ).toBeNull();

    const [s1] = setIds(detail, 0);
    await sessions.updateSet(s1 ?? "", { actualReps: 10, actualRIR: 2 });
    await sessions.setSetStatus(s1 ?? "", "completed", at(5));
    expect(await sessions.getPreviousResult(BENCH, "other")).toBeNull(); // still in progress
    await sessions.finish(detail.session.id, {}, at(40));

    const abandoned = await sessions.startFromPlanDay(
      day.id,
      new Date(2026, 10, 17, 18, 0),
    );
    const [a1] = setIds(abandoned, 0);
    await sessions.updateSet(a1 ?? "", { actualReps: 3 });
    await sessions.setSetStatus(a1 ?? "", "completed");
    await sessions.abandon(abandoned.session.id);

    const current = await sessions.startFromPlanDay(
      day.id,
      new Date(2026, 10, 18, 18, 0),
    );
    const previous = await sessions.getPreviousResult(
      BENCH,
      current.session.id,
    );

    expect(previous?.session.id).toBe(detail.session.id);
    expect(
      previous?.sets.map((s) => [s.actualWeightKg, s.actualReps, s.actualRIR]),
    ).toEqual([[60, 10, 2]]);
    // A different exercise (even a similar variant) is never used for comparison.
    expect(
      await sessions.getPreviousResult(INCLINE, current.session.id),
    ).toBeNull();
    db.close();
  });

  it("reports the last completed day of a plan; an unfinished workout does not count", async () => {
    const { db, plans, sessions, detail, plan, day } = await startedWorkout();
    expect(await sessions.getLastCompletedDayId(plan.id)).toBeUndefined();

    await sessions.finish(detail.session.id, {}, at(30));
    expect(await sessions.getLastCompletedDayId(plan.id)).toBe(day.id);

    const dayB = await plans.addDay(plan.id, "Pull");
    await sessions.startFromPlanDay(dayB.id, new Date(2026, 10, 17, 18, 0));
    expect(await sessions.getLastCompletedDayId(plan.id)).toBe(day.id);
    db.close();
  });
});

describe("rest timer state", () => {
  it("is stored, observable, and removed when the workout ends", async () => {
    const { db, sessions, detail } = await startedWorkout();
    const seen: (RestTimerState | null)[] = [];
    const stop = sessions.observeRestTimer(detail.session.id, (timer) =>
      seen.push(timer),
    );
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull());

    const timer = startRestTimer(detail.session.id, 120, at(5));
    await sessions.saveRestTimer(timer);
    await vi.waitFor(() => expect(seen.at(-1)).toEqual(timer));

    await sessions.clearRestTimer(detail.session.id);
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull());

    await sessions.saveRestTimer(timer);
    await sessions.finish(detail.session.id, {}, at(30));
    expect(await db.restTimerState.count()).toBe(0);
    stop();
    db.close();
  });
});
