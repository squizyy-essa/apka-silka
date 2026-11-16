import { Plus, Unlink } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import type { DayDetail, PlanRepository } from '@/db';
import { ExercisePickerDialog } from '@/exercises/ExercisePickerDialog';
import { useExerciseLibrary } from '@/exercises/useExerciseLibrary';
import { useSettings } from '@/settings/settingsContext';
import { moveByOne } from '@/shared/lib/reorder';
import { useObserved } from '@/shared/lib/useObserved';
import { supersetLabels } from '@/shared/logic/supersets';
import { AutosaveTextField, NumericField } from '@/shared/ui/autosaveFields';
import { BackLink } from '@/shared/ui/BackLink';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { SelectField } from '@/shared/ui/fields';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SortableList } from '@/shared/ui/SortableList';
import { ErrorAlert, LoadingState } from '@/shared/ui/states';
import { PlanNotFound } from './PlanEditorPage';
import { PlannedExerciseCard } from './PlannedExerciseCard';
import { PLAN_PATHS } from './paths';
import { countLabel, WEEKDAY_OPTIONS } from './planText';
import { ignoreRejection, useSaveGuard } from './saveErrors';

const REST_RULES = { integer: true, min: 0, max: 3600 } as const;

function DayEditor({ detail }: { readonly detail: DayDetail }) {
  const { plans: repository } = useRepositories();
  const { settings } = useSettings();
  const library = useExerciseLibrary();
  const { error, run } = useSaveGuard();
  const { plan, day, exercises, supersetGroups } = detail;
  const [picking, setPicking] = useState(false);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const exerciseById = useMemo(
    () =>
      new Map(
        (library.status === 'ready' ? library.exercises : []).map((exercise) => [
          exercise.id,
          exercise,
        ]),
      ),
    [library],
  );
  const exerciseNames = useMemo(
    () => new Map([...exerciseById].map(([id, exercise]) => [id, exercise.name])),
    [exerciseById],
  );

  const rows = exercises.map((item) => ({ id: item.planned.id, ...item }));
  const ids = rows.map((row) => row.id);
  const labels = supersetLabels(exercises.map((item) => item.planned));
  const groupById = new Map(supersetGroups.map((group) => [group.id, group]));

  const toggle = (id: string) =>
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });

  const reorder = (orderedIds: string[], movedId: string) =>
    ignoreRejection(run(repository.reorderExercises(day.id, orderedIds, movedId)));

  return (
    <>
      <PageHeader
        title={day.name}
        description={`${plan.name} · zmiany zapisują się automatycznie.`}
      />

      {error !== null && (
        <ErrorAlert title="Nie udało się zapisać zmiany" className="mb-4">
          {error}
        </ErrorAlert>
      )}

      <Card aria-label="Ustawienia dnia" className="grid gap-4 sm:grid-cols-2">
        <AutosaveTextField
          label="Nazwa dnia"
          value={day.name}
          maxLength={120}
          requiredMessage="Podaj nazwę dnia."
          onCommit={(name) => run(repository.updateDay(day.id, { name }))}
        />
        {plan.scheduleMode === 'fixed' && (
          <SelectField
            label="Dzień tygodnia"
            emptyOption="Nie przypisano"
            options={WEEKDAY_OPTIONS}
            value={day.weekday === undefined ? '' : String(day.weekday)}
            onChange={(event) =>
              ignoreRejection(
                run(
                  repository.updateDay(day.id, {
                    weekday: event.target.value === '' ? undefined : Number(event.target.value),
                  }),
                ),
              )
            }
          />
        )}
      </Card>

      <section aria-labelledby="exercises-heading" className="mt-6">
        <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id="exercises-heading" className="text-base font-semibold text-foreground">
            Ćwiczenia{' '}
            <span className="font-normal text-muted-foreground">
              ({countLabel.exercises(exercises.length)})
            </span>
          </h2>
          <Button
            icon={<Plus className="size-4" aria-hidden="true" />}
            onClick={() => setPicking(true)}
          >
            Dodaj ćwiczenie
          </Button>
        </div>

        {exercises.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong p-5 text-center text-sm text-muted-foreground">
            Ten dzień nie ma jeszcze ćwiczeń. Dodaj pierwsze z biblioteki.
          </p>
        ) : (
          <SortableList
            aria-label="Ćwiczenia dnia"
            className="space-y-2"
            items={rows}
            itemName={(row) => exerciseNames.get(row.planned.exerciseId) ?? 'ćwiczenie'}
            onReorder={reorder}
            renderItem={(row, handle, index) => {
              const groupId = row.planned.supersetGroupId;
              const group = groupId === undefined ? undefined : groupById.get(groupId);
              const startsGroup =
                group !== undefined && rows[index - 1]?.planned.supersetGroupId !== groupId;
              const label = groupId === undefined ? undefined : labels.get(groupId);
              return (
                <>
                  {startsGroup && (
                    <div
                      role="group"
                      aria-label={`Superseria ${label ?? ''}`}
                      className="mb-2 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-control bg-primary-soft p-2.5"
                    >
                      <p className="min-w-0 flex-1 basis-40 text-sm text-foreground">
                        <span className="font-semibold">Superseria {label}</span> – ćwiczenia
                        wykonywane po kolei, bez przerwy między nimi.
                      </p>
                      <NumericField
                        label="Przerwa po rundzie (s)"
                        className="w-36"
                        value={group.restAfterRoundSeconds}
                        rules={REST_RULES}
                        required
                        onCommit={(seconds) =>
                          seconds === undefined
                            ? undefined
                            : run(repository.updateSupersetRest(group.id, seconds))
                        }
                      />
                      <Button
                        variant="secondary"
                        icon={<Unlink className="size-4" aria-hidden="true" />}
                        onClick={() => ignoreRejection(run(repository.dissolveSuperset(group.id)))}
                      >
                        Rozłącz
                      </Button>
                    </div>
                  )}
                  <PlannedExerciseCard
                    detail={row}
                    exercise={exerciseById.get(row.planned.exerciseId)}
                    exerciseNames={exerciseNames}
                    position={{ index, total: rows.length }}
                    supersetLabel={label}
                    expanded={expandedIds.has(row.id)}
                    onToggle={() => toggle(row.id)}
                    onMove={(direction) => {
                      const next = moveByOne(ids, row.id, direction);
                      if (next !== null) {
                        reorder(next, row.id);
                      }
                    }}
                    handle={handle}
                    repository={repository}
                    run={run}
                  />
                </>
              );
            }}
          />
        )}
      </section>

      <ExercisePickerDialog
        open={picking}
        onOpenChange={setPicking}
        title="Dodaj ćwiczenie do dnia"
        onPick={(exercise) => {
          setPicking(false);
          ignoreRejection(
            run(
              repository.addExercise(day.id, exercise.id, {
                restSeconds: settings.defaultRestSeconds,
              }),
            ).then((planned) => {
              // Open the new exercise straight away so its sets can be filled in.
              setExpandedIds((current) => new Set(current).add(planned.id));
            }),
          );
        }}
      />
    </>
  );
}

export function DayEditorPage() {
  const { planId = '', dayId = '' } = useParams();
  const { plans: repository } = useRepositories();
  const subscribe = useCallback(
    (
      listener: (day: DayDetail | null) => void,
      onError: Parameters<PlanRepository['observeDay']>[2],
    ) => repository.observeDay(dayId, listener, onError),
    [repository, dayId],
  );
  const observed = useObserved(subscribe);
  const detail = observed.status === 'ready' ? observed.value : null;
  const found = detail !== null && detail.plan.id === planId;

  return (
    <>
      <BackLink to={found ? PLAN_PATHS.plan(planId) : PLAN_PATHS.list}>
        {found ? detail.plan.name : 'Plany'}
      </BackLink>
      {observed.status === 'loading' && <LoadingState label="Wczytywanie dnia…" />}
      {observed.status === 'error' && (
        <ErrorAlert title="Nie udało się wczytać dnia">{observed.message}</ErrorAlert>
      )}
      {observed.status === 'ready' &&
        (found ? <DayEditor key={detail.day.id} detail={detail} /> : <PlanNotFound />)}
    </>
  );
}
