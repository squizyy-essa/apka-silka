import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  EyeOff,
  History,
  Plus,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import type { SessionRepository, SuggestionRepository } from "@/db";
import { ExercisePickerDialog } from "@/exercises/ExercisePickerDialog";
import type {
  ProgressionSuggestion,
  SessionSet,
  WorkoutSession,
} from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { ignoreRejection, type RunSave } from "@/shared/lib/useSaveGuard";
import {
  previousCompletedSet,
  type SessionExerciseWithSets,
} from "@/shared/logic/workout";
import { ActionMenu } from "@/shared/ui/ActionMenu";
import { AutosaveTextField, NumericField } from "@/shared/ui/autosaveFields";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { RirHelp } from "@/shared/ui/RirHelp";
import { FailedSetSuggestions } from "./FailedSetSuggestions";
import { DoneButton, SetFields } from "./SetControls";
import { setMenuItems } from "./setMenu";
import {
  describePlan,
  describeResult,
  formatLocalDate,
  SET_STATUS_LABELS,
  SET_TYPE_LABELS,
} from "./workoutText";

const REST_RULES = { integer: true, min: 0, max: 3600 } as const;

type PreviousResult = {
  session: WorkoutSession;
  sets: readonly SessionSet[];
} | null;

/** "Poprzedni wynik": hidden by default, loaded on demand, compared by exercise id. */
function PreviousResultPanel({
  item,
  repository,
}: {
  readonly item: SessionExerciseWithSets;
  readonly repository: SessionRepository;
}) {
  const [state, setState] = useState<
    | { status: "closed" }
    | { status: "loading" }
    | { status: "open"; result: PreviousResult }
  >({ status: "closed" });
  const { exercise } = item;

  const toggle = () => {
    if (state.status !== "closed") {
      setState({ status: "closed" });
      return;
    }
    setState({ status: "loading" });
    repository.getPreviousResult(exercise.exerciseId, exercise.sessionId).then(
      (result) => setState({ status: "open", result }),
      () => setState({ status: "open", result: null }),
    );
  };

  return (
    <div>
      <Button
        variant="ghost"
        aria-expanded={state.status !== "closed"}
        icon={<History className="size-4" aria-hidden="true" />}
        onClick={toggle}
      >
        Poprzedni wynik
      </Button>
      {state.status === "open" && (
        <div className="mt-1 rounded-control bg-surface-muted p-3 text-sm text-foreground">
          {state.result === null ? (
            <p>Brak wcześniejszych wyników tego ćwiczenia.</p>
          ) : (
            <>
              <p className="font-semibold">
                Poprzednio (
                {formatLocalDate(state.result.session.localWorkoutDate)}):
              </p>
              <ol className="mt-1 space-y-0.5">
                {state.result.sets.map((set, index) => (
                  <li key={set.id}>
                    {index + 1}.{" "}
                    {describeResult(set, exercise.measurementTypeSnapshot)}
                    {set.type === "warmup" && " (rozgrzewka)"}
                    {set.status === "failed" && " (nieudana)"}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export interface SessionExerciseCardProps {
  readonly item: SessionExerciseWithSets;
  readonly position: { readonly index: number; readonly total: number };
  readonly supersetLabel: string | undefined;
  readonly repository: SessionRepository;
  readonly suggestions: SuggestionRepository;
  /** Decisions about progression suggestions already made in this workout. */
  readonly decisions: readonly ProgressionSuggestion[] | null;
  readonly run: RunSave;
  /** Marks a set as done/failed and starts the rest timer when one is due. */
  readonly onFinishSet: (setId: string, status: "completed" | "failed") => void;
  readonly onMove: (direction: -1 | 1) => void;
}

/** One exercise of the workout in the table view: every set is a row. */
export function SessionExerciseCard({
  item,
  position,
  supersetLabel,
  repository,
  suggestions,
  decisions,
  run,
  onFinishSet,
  onMove,
}: SessionExerciseCardProps) {
  const { exercise, sets } = item;
  const [swapping, setSwapping] = useState(false);
  const name = exercise.exerciseNameSnapshot;
  const measurementType = exercise.measurementTypeSnapshot;
  const done = sets.filter(
    (set) => set.status === "completed" || set.status === "failed",
  ).length;
  const inSuperset = exercise.supersetGroupId !== undefined;

  if (exercise.isSkipped) {
    return (
      <article
        aria-label={name}
        className="flex flex-wrap items-center gap-2 rounded-card border border-dashed border-border-strong p-3"
      >
        <span className="min-w-0 flex-1 basis-40">
          <span className="block font-semibold text-muted-foreground">
            {name}
          </span>
          <Badge>Pominięte</Badge>
        </span>
        <Button
          variant="secondary"
          icon={<Undo2 className="size-4" aria-hidden="true" />}
          onClick={() =>
            ignoreRejection(
              run(repository.setExerciseSkipped(exercise.id, false)),
            )
          }
        >
          Przywróć
        </Button>
      </article>
    );
  }

  return (
    <article
      aria-label={name}
      className={cn(
        "rounded-card border bg-surface shadow-card",
        inSuperset ? "border-primary" : "border-border",
      )}
    >
      <header className="flex items-start gap-2 py-2 pr-1 pl-3">
        <div className="min-w-0 flex-1 py-1">
          <h3 className="font-semibold text-foreground">{name}</h3>
          <p className="text-sm text-muted-foreground">
            {supersetLabel !== undefined && (
              <span className="font-semibold text-accent-text">
                Superseria {supersetLabel} ·{" "}
              </span>
            )}
            Zrobione serie: {done} z {sets.length}
          </p>
        </div>
        <ActionMenu
          label={`Więcej działań: ${name}`}
          items={[
            {
              label: "Zamień ćwiczenie",
              icon: ArrowLeftRight,
              disabled: done > 0,
              onSelect: () => setSwapping(true),
            },
            {
              label: "Pomiń ćwiczenie",
              icon: EyeOff,
              onSelect: () =>
                ignoreRejection(
                  run(repository.setExerciseSkipped(exercise.id, true)),
                ),
            },
            {
              label: "Przenieś wyżej",
              icon: ArrowUp,
              disabled: position.index === 0,
              onSelect: () => onMove(-1),
            },
            {
              label: "Przenieś niżej",
              icon: ArrowDown,
              disabled: position.index === position.total - 1,
              onSelect: () => onMove(1),
            },
            {
              label: "Usuń z treningu",
              icon: Trash2,
              destructive: true,
              disabled: done > 0,
              onSelect: () =>
                ignoreRejection(run(repository.removeExercise(exercise.id))),
            },
          ]}
        />
      </header>

      <div className="space-y-3 border-t border-border p-3">
        <ol aria-label={`Serie: ${name}`} className="space-y-2">
          {sets.map((set, index) => {
            const number = index + 1;
            const plan = describePlan(set, measurementType);
            return (
              <li
                key={set.id}
                aria-label={`Seria ${number}`}
                className={cn(
                  "rounded-control border p-2.5",
                  set.status === "completed" && "border-success bg-background",
                  set.status === "failed" && "border-danger bg-danger-soft",
                  set.status === "skipped" &&
                    "border-dashed border-border-strong bg-background",
                  set.status === "pending" && "border-border bg-background",
                )}
              >
                <div className="mb-1 flex items-start gap-2">
                  <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 self-center text-sm">
                    <span className="font-semibold text-foreground">
                      Seria {number}
                    </span>
                    <span className="text-muted-foreground">
                      {SET_TYPE_LABELS[set.type]}
                    </span>
                    {set.status !== "pending" && (
                      <Badge
                        tone={set.status === "completed" ? "accent" : "neutral"}
                      >
                        {SET_STATUS_LABELS[set.status]}
                      </Badge>
                    )}
                    {plan !== undefined && (
                      <span className="basis-full text-muted-foreground sm:basis-auto">
                        Plan: {plan}
                      </span>
                    )}
                  </p>
                  <ActionMenu
                    label={`Więcej działań: seria ${number}`}
                    items={setMenuItems(
                      set,
                      sets.length > 1,
                      repository,
                      run,
                    ).map((entry) =>
                      entry.label === "Oznacz jako nieudaną"
                        ? {
                            ...entry,
                            onSelect: () => onFinishSet(set.id, "failed"),
                          }
                        : entry,
                    )}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <SetFields
                    className="min-w-0 flex-1"
                    set={set}
                    measurementType={measurementType}
                    repository={repository}
                    run={run}
                    previous={previousCompletedSet(sets, set, measurementType)}
                  />
                  <DoneButton
                    set={set}
                    number={number}
                    onComplete={() => onFinishSet(set.id, "completed")}
                    onUndo={() =>
                      ignoreRejection(
                        run(repository.setSetStatus(set.id, "pending")),
                      )
                    }
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <FailedSetSuggestions
          item={item}
          decisions={decisions}
          repository={suggestions}
          run={run}
        />

        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="secondary"
            icon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => ignoreRejection(run(repository.addSet(exercise.id)))}
          >
            Dodaj serię
          </Button>
          <PreviousResultPanel
            key={exercise.exerciseId}
            item={item}
            repository={repository}
          />
        </div>
        {(measurementType === "weight_reps" ||
          measurementType === "bodyweight_reps") && <RirHelp />}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_1fr]">
          {inSuperset ? (
            <p className="col-span-2 text-sm text-muted-foreground sm:col-span-1">
              Przerwa po rundzie superserii:{" "}
              {exercise.supersetRestSecondsSnapshot ?? 0} s.
            </p>
          ) : (
            <NumericField
              label="Przerwa (s)"
              value={exercise.restSecondsSnapshot}
              rules={REST_RULES}
              required
              onCommit={(seconds) =>
                seconds === undefined
                  ? undefined
                  : run(repository.updateExerciseRest(exercise.id, seconds))
              }
            />
          )}
          <AutosaveTextField
            label="Notatka"
            className="col-span-2 sm:col-span-1"
            value={exercise.notes ?? ""}
            maxLength={2000}
            onCommit={(notes) =>
              run(
                repository.updateExerciseNotes(exercise.id, notes || undefined),
              )
            }
          />
        </div>
      </div>

      <ExercisePickerDialog
        open={swapping}
        onOpenChange={setSwapping}
        title={`Zamień: ${name}`}
        excludedIds={[exercise.exerciseId]}
        suggested={{
          heading: "Zamienniki z planu",
          ids: exercise.alternativeExerciseIdsSnapshot,
        }}
        onPick={(picked) => {
          setSwapping(false);
          ignoreRejection(run(repository.swapExercise(exercise.id, picked.id)));
        }}
      />
    </article>
  );
}
