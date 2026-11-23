import { Check } from "lucide-react";
import type { SessionRepository } from "@/db";
import type { MeasurementType, SessionSet } from "@/shared/domain";
import { cn } from "@/shared/lib/cn";
import { formatNumber } from "@/shared/lib/numberInput";
import type { RunSave } from "@/shared/lib/useSaveGuard";
import { NumericField } from "@/shared/ui/autosaveFields";

const WEIGHT_RULES = { min: 0, max: 2000 } as const;
const REPS_RULES = { integer: true, min: 0, max: 1000 } as const;
const RIR_RULES = { min: 0, max: 10 } as const;
const SECONDS_RULES = { integer: true, min: 0, max: 86_400 } as const;
const METERS_RULES = { min: 0, max: 1_000_000 } as const;

function repsHint(set: SessionSet): string | undefined {
  const { plannedRepsMin: min, plannedRepsMax: max } = set;
  if (min === undefined && max === undefined) {
    return undefined;
  }
  return min === undefined || max === undefined || min === max
    ? String(max ?? min)
    : `${min}–${max}`;
}

export interface SetFieldsProps {
  readonly set: SessionSet;
  readonly measurementType: MeasurementType;
  readonly repository: SessionRepository;
  readonly run: RunSave;
  /** Earlier completed set whose values are shown as hints and used on completion. */
  readonly previous?: SessionSet | undefined;
  readonly className?: string;
}

/**
 * Inputs for what was really done in a set. The planned value is shown as a
 * grey hint inside an empty field; every field saves on its own.
 */
export function SetFields({
  set,
  measurementType,
  repository,
  run,
  previous,
  className,
}: SetFieldsProps) {
  const update = (patch: Parameters<SessionRepository["updateSet"]>[1]) =>
    run(repository.updateSet(set.id, patch));
  const weight = (
    <NumericField
      label={measurementType === "bodyweight_reps" ? "+ kg" : "kg"}
      value={set.actualWeightKg}
      placeholder={
        formatNumber(previous?.actualWeightKg ?? set.plannedWeightKg) || "–"
      }
      rules={WEIGHT_RULES}
      onCommit={(actualWeightKg) => update({ actualWeightKg })}
    />
  );

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {measurementType === "duration" && (
        <NumericField
          label="Czas (s)"
          className="col-span-2"
          value={set.durationSeconds}
          placeholder={formatNumber(set.plannedDurationSeconds) || "–"}
          rules={SECONDS_RULES}
          onCommit={(durationSeconds) => update({ durationSeconds })}
        />
      )}
      {measurementType === "distance" && (
        <>
          <NumericField
            label="Dystans (m)"
            value={set.distanceMeters}
            placeholder={formatNumber(set.plannedDistanceMeters) || "–"}
            rules={METERS_RULES}
            onCommit={(distanceMeters) => update({ distanceMeters })}
          />
          {weight}
        </>
      )}
      {(measurementType === "weight_reps" ||
        measurementType === "bodyweight_reps") && (
        <>
          {weight}
          <NumericField
            label="Powt."
            value={set.actualReps}
            placeholder={
              previous?.actualReps === undefined
                ? (repsHint(set) ?? "–")
                : String(previous.actualReps)
            }
            rules={REPS_RULES}
            onCommit={(actualReps) => update({ actualReps })}
          />
          <NumericField
            label="RIR"
            value={set.actualRIR}
            placeholder={
              formatNumber(previous?.actualRIR ?? set.plannedRIR) || "–"
            }
            rules={RIR_RULES}
            onCommit={(actualRIR) => update({ actualRIR })}
          />
        </>
      )}
    </div>
  );
}

export interface DoneButtonProps {
  readonly set: SessionSet;
  readonly number: number;
  readonly onComplete: () => void;
  readonly onUndo: () => void;
}

/** Square "done" toggle of a set row. */
export function DoneButton({
  set,
  number,
  onComplete,
  onUndo,
}: DoneButtonProps) {
  const done = set.status === "completed";
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={
        done
          ? `Seria ${number} wykonana – cofnij`
          : `Oznacz serię ${number} jako wykonaną`
      }
      title={done ? "Cofnij" : "Wykonana"}
      onClick={done ? onUndo : onComplete}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-control border transition-colors duration-150",
        done
          ? "border-success bg-success text-surface"
          : "border-border-strong bg-surface text-muted-foreground hover:bg-surface-muted hover:text-foreground",
      )}
    >
      <Check className="size-5" aria-hidden="true" />
    </button>
  );
}
