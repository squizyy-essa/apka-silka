import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Link2,
  Plus,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { PlannedExerciseDetail, PlanRepository } from '@/db';
import { ExercisePickerDialog } from '@/exercises/ExercisePickerDialog';
import type { Exercise, MeasurementType, PlannedSet } from '@/shared/domain';
import { cn } from '@/shared/lib/cn';
import { ActionMenu, type ActionMenuItem } from '@/shared/ui/ActionMenu';
import { AutosaveTextField, NumericField } from '@/shared/ui/autosaveFields';
import { Button } from '@/shared/ui/Button';
import { IconButton } from '@/shared/ui/IconButton';
import { RirHelp } from '@/shared/ui/RirHelp';
import { describeSets } from './planText';
import { ignoreRejection, type RunSave } from './saveErrors';

const WEIGHT_RULES = { min: 0, max: 2000 } as const;
const REPS_RULES = { integer: true, min: 0, max: 1000 } as const;
const RIR_RULES = { min: 0, max: 10 } as const;
const SECONDS_RULES = { integer: true, min: 0, max: 86_400 } as const;
const REST_RULES = { integer: true, min: 0, max: 3600 } as const;
const METERS_RULES = { min: 0, max: 1_000_000 } as const;
const INCREMENT_RULES = { min: 0.01, max: 100 } as const;

const fieldGrid = 'grid grid-cols-4 gap-2';

function SetEditor({
  set,
  number,
  measurementType,
  canRemove,
  repository,
  run,
}: {
  readonly set: PlannedSet;
  readonly number: number;
  readonly measurementType: MeasurementType;
  readonly canRemove: boolean;
  readonly repository: PlanRepository;
  readonly run: RunSave;
}) {
  const update = (patch: Parameters<PlanRepository['updateSet']>[1]) =>
    run(repository.updateSet(set.id, patch));

  return (
    <li
      aria-label={`Seria ${number}`}
      className="rounded-control border border-border bg-background p-2.5"
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">Seria {number}</span>
        <select
          aria-label={`Typ serii ${number}`}
          className="min-h-11 flex-1 rounded-control border border-border-strong bg-surface px-2 text-base text-foreground"
          value={set.type}
          onChange={(event) =>
            ignoreRejection(
              update({ type: event.target.value === 'warmup' ? 'warmup' : 'working' }),
            )
          }
        >
          <option value="working">Robocza</option>
          <option value="warmup">Rozgrzewkowa</option>
        </select>
        <IconButton
          label={`Usuń serię ${number}`}
          disabled={!canRemove}
          onClick={() => ignoreRejection(run(repository.removeSet(set.id)))}
        >
          <X className="size-5" aria-hidden="true" />
        </IconButton>
      </div>

      {measurementType === 'duration' && (
        <div className={fieldGrid}>
          <NumericField
            label="Czas (s)"
            className="col-span-2"
            value={set.targetDurationSeconds}
            rules={SECONDS_RULES}
            onCommit={(targetDurationSeconds) => update({ targetDurationSeconds })}
          />
        </div>
      )}

      {measurementType === 'distance' && (
        <div className={fieldGrid}>
          <NumericField
            label="Dystans (m)"
            className="col-span-2"
            value={set.targetDistanceMeters}
            rules={METERS_RULES}
            onCommit={(targetDistanceMeters) => update({ targetDistanceMeters })}
          />
          <NumericField
            label="Ciężar (kg)"
            className="col-span-2"
            value={set.targetWeightKg}
            rules={WEIGHT_RULES}
            onCommit={(targetWeightKg) => update({ targetWeightKg })}
          />
        </div>
      )}

      {(measurementType === 'weight_reps' || measurementType === 'bodyweight_reps') && (
        <div className={fieldGrid}>
          <NumericField
            label={measurementType === 'bodyweight_reps' ? '+ kg' : 'kg'}
            value={set.targetWeightKg}
            rules={WEIGHT_RULES}
            onCommit={(targetWeightKg) => update({ targetWeightKg })}
          />
          <NumericField
            label="Powt. od"
            value={set.targetRepsMin}
            rules={REPS_RULES}
            onCommit={(targetRepsMin) => update({ targetRepsMin })}
          />
          <NumericField
            label="Powt. do"
            value={set.targetRepsMax}
            rules={REPS_RULES}
            onCommit={(targetRepsMax) => update({ targetRepsMax })}
          />
          <NumericField
            label="RIR"
            value={set.targetRIR}
            rules={RIR_RULES}
            onCommit={(targetRIR) => update({ targetRIR })}
          />
        </div>
      )}
    </li>
  );
}

export interface PlannedExerciseCardProps {
  readonly detail: PlannedExerciseDetail;
  /** `undefined` when the library entry is missing (should not happen; shown as unknown). */
  readonly exercise: Exercise | undefined;
  readonly exerciseNames: ReadonlyMap<string, string>;
  readonly position: { readonly index: number; readonly total: number };
  /** Letter of the superset this exercise belongs to, if any. */
  readonly supersetLabel: string | undefined;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly handle: ReactNode;
  readonly repository: PlanRepository;
  readonly run: RunSave;
}

export function PlannedExerciseCard({
  detail,
  exercise,
  exerciseNames,
  position,
  supersetLabel,
  expanded,
  onToggle,
  onMove,
  handle,
  repository,
  run,
}: PlannedExerciseCardProps) {
  const { planned, sets } = detail;
  const [pickingAlternative, setPickingAlternative] = useState(false);
  const name = exercise?.name ?? 'Nieznane ćwiczenie';
  const measurementType = exercise?.measurementType ?? 'weight_reps';
  const usesReps = measurementType === 'weight_reps' || measurementType === 'bodyweight_reps';
  const inSuperset = planned.supersetGroupId !== undefined;
  const isLast = position.index === position.total - 1;
  const bodyId = `planned-${planned.id}`;

  const menu: ActionMenuItem[] = [
    {
      label: 'Przenieś wyżej',
      icon: ArrowUp,
      disabled: position.index === 0,
      onSelect: () => onMove(-1),
    },
    { label: 'Przenieś niżej', icon: ArrowDown, disabled: isLast, onSelect: () => onMove(1) },
    {
      label: 'Połącz z następnym w superserię',
      icon: Link2,
      disabled: isLast,
      onSelect: () => ignoreRejection(run(repository.linkWithNextExercise(planned.id))),
    },
    ...(inSuperset
      ? [
          {
            label: 'Wyłącz z superserii',
            icon: Unlink,
            onSelect: () => ignoreRejection(run(repository.removeFromSuperset(planned.id))),
          },
        ]
      : []),
    {
      label: 'Usuń z dnia',
      icon: Trash2,
      destructive: true,
      onSelect: () => ignoreRejection(run(repository.removeExercise(planned.id))),
    },
  ];

  return (
    <article
      aria-label={name}
      className={cn(
        'rounded-card border bg-surface shadow-card',
        inSuperset ? 'border-primary' : 'border-border',
      )}
    >
      <div className="flex items-center">
        {handle}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-h-16 min-w-0 flex-1 items-center gap-2 rounded-control py-2 pr-1 pl-1 text-left hover:bg-surface-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">{name}</span>
            <span className="block text-sm text-muted-foreground">
              {supersetLabel !== undefined && (
                <span className="font-semibold text-accent-text">Superseria {supersetLabel} · </span>
              )}
              {describeSets(sets, measurementType)}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-5 shrink-0 text-muted-foreground transition-transform duration-150',
              expanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
        <ActionMenu label={`Więcej działań: ${name}`} items={menu} />
      </div>

      {expanded && (
        <div id={bodyId} className="space-y-4 border-t border-border p-3">
          <ol aria-label={`Serie: ${name}`} className="space-y-2">
            {sets.map((set, index) => (
              <SetEditor
                key={set.id}
                set={set}
                number={index + 1}
                measurementType={measurementType}
                canRemove={sets.length > 1}
                repository={repository}
                run={run}
              />
            ))}
          </ol>
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <Button
              variant="secondary"
              icon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => ignoreRejection(run(repository.addSet(planned.id)))}
            >
              Dodaj serię
            </Button>
            {usesReps && <RirHelp className="min-w-0 flex-1 basis-40" />}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {inSuperset ? (
              <p className="col-span-2 self-end text-sm text-muted-foreground sm:col-span-1">
                Przerwę po rundzie ustawiasz w nagłówku superserii.
              </p>
            ) : (
              <NumericField
                label="Przerwa (s)"
                value={planned.restSeconds}
                rules={REST_RULES}
                required
                onCommit={(restSeconds) =>
                  restSeconds === undefined
                    ? undefined
                    : run(repository.updateExercise(planned.id, { restSeconds }))
                }
              />
            )}
            <NumericField
              label="Skok progresji (kg)"
              value={planned.progressionIncrementKg}
              rules={INCREMENT_RULES}
              required
              onCommit={(progressionIncrementKg) =>
                progressionIncrementKg === undefined
                  ? undefined
                  : run(repository.updateExercise(planned.id, { progressionIncrementKg }))
              }
            />
          </div>

          <AutosaveTextField
            label="Tempo (opcjonalnie, dla wszystkich serii)"
            value={sets[0]?.tempo ?? ''}
            maxLength={20}
            placeholder="np. 3-1-1-0"
            onCommit={(tempo) => run(repository.setTempoForAllSets(planned.id, tempo || undefined))}
          />

          <AutosaveTextField
            label="Notatka (opcjonalnie)"
            value={planned.notes ?? ''}
            maxLength={2000}
            multiline
            onCommit={(notes) =>
              run(repository.updateExercise(planned.id, { notes: notes || undefined }))
            }
          />

          <section aria-label={`Zamienniki: ${name}`}>
            <h4 className="mb-1.5 text-sm font-semibold text-foreground">Zamienniki</h4>
            {planned.alternativeExerciseIds.length > 0 && (
              <ul className="mb-2 divide-y divide-border rounded-control border border-border">
                {planned.alternativeExerciseIds.map((alternativeId) => {
                  const alternativeName = exerciseNames.get(alternativeId) ?? 'Nieznane ćwiczenie';
                  return (
                    <li key={alternativeId} className="flex items-center gap-2 pl-3">
                      <span className="min-w-0 flex-1 text-sm text-foreground">
                        {alternativeName}
                      </span>
                      <IconButton
                        label={`Usuń zamiennik: ${alternativeName}`}
                        onClick={() =>
                          ignoreRejection(
                            run(
                              repository.updateExercise(planned.id, {
                                alternativeExerciseIds: planned.alternativeExerciseIds.filter(
                                  (id) => id !== alternativeId,
                                ),
                              }),
                            ),
                          )
                        }
                      >
                        <X className="size-5" aria-hidden="true" />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button
              variant="secondary"
              icon={<Plus className="size-4" aria-hidden="true" />}
              onClick={() => setPickingAlternative(true)}
            >
              Dodaj zamiennik
            </Button>
          </section>

          <ExercisePickerDialog
            open={pickingAlternative}
            onOpenChange={setPickingAlternative}
            title={`Zamiennik dla: ${name}`}
            excludedIds={[planned.exerciseId, ...planned.alternativeExerciseIds]}
            onPick={(picked) => {
              setPickingAlternative(false);
              ignoreRejection(
                run(
                  repository.updateExercise(planned.id, {
                    alternativeExerciseIds: [...planned.alternativeExerciseIds, picked.id],
                  }),
                ),
              );
            }}
          />
        </div>
      )}
    </article>
  );
}
