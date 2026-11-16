import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Compass,
  Copy,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import type { PlanOverview, PlanRepository } from '@/db';
import type { PlanDay, ScheduleMode } from '@/shared/domain';
import { moveByOne } from '@/shared/lib/reorder';
import { useObserved } from '@/shared/lib/useObserved';
import { ActionMenu } from '@/shared/ui/ActionMenu';
import { AutosaveTextField } from '@/shared/ui/autosaveFields';
import { BackLink } from '@/shared/ui/BackLink';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card, CardTitle } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { SortableList } from '@/shared/ui/SortableList';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { PLAN_PATHS } from './paths';
import { countLabel, defaultDayName, WEEKDAY_LABELS } from './planText';
import { ignoreRejection, useSaveGuard, type RunSave } from './saveErrors';

const MODE_OPTIONS: readonly { value: ScheduleMode; label: string }[] = [
  { value: 'fixed', label: 'Stałe dni' },
  { value: 'flexible', label: 'Elastyczny' },
];

type DayRow = PlanOverview['days'][number];

function DaysSection({
  overview,
  repository,
  run,
}: {
  readonly overview: PlanOverview;
  readonly repository: PlanRepository;
  readonly run: RunSave;
}) {
  const { plan, days } = overview;
  const [dayToDelete, setDayToDelete] = useState<PlanDay | null>(null);
  const [deleting, setDeleting] = useState(false);
  const ids = days.map(({ day }) => day.id);
  const rows = days.map((row) => ({ id: row.day.id, ...row }));

  const move = (dayId: string, direction: -1 | 1) => {
    const next = moveByOne(ids, dayId, direction);
    if (next !== null) {
      ignoreRejection(run(repository.reorderDays(plan.id, next)));
    }
  };

  const subtitle = ({ day, exerciseCount }: DayRow) =>
    [
      plan.scheduleMode === 'fixed' && day.weekday !== undefined
        ? WEEKDAY_LABELS[day.weekday]
        : undefined,
      countLabel.exercises(exerciseCount),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <section aria-labelledby="days-heading">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id="days-heading" className="text-base font-semibold text-foreground">
          Dni treningowe
        </h2>
        <Button
          variant="secondary"
          icon={<Plus className="size-4" aria-hidden="true" />}
          onClick={() =>
            ignoreRejection(
              run(
                repository.addDay(plan.id, (count) => defaultDayName(plan.scheduleMode, count)),
              ),
            )
          }
        >
          Dodaj dzień
        </Button>
      </div>

      {days.length === 0 ? (
        <p className="rounded-card border border-dashed border-border-strong p-5 text-center text-sm text-muted-foreground">
          Ten plan nie ma jeszcze dni treningowych. Dodaj pierwszy dzień, a potem jego ćwiczenia.
        </p>
      ) : (
        <SortableList
          aria-label="Dni treningowe"
          className="space-y-2"
          items={rows}
          itemName={(row) => row.day.name}
          onReorder={(orderedIds) => ignoreRejection(run(repository.reorderDays(plan.id, orderedIds)))}
          renderItem={(row, handle, index) => (
            <div className="flex items-center rounded-card border border-border bg-surface shadow-card">
              {handle}
              <Link
                to={PLAN_PATHS.day(plan.id, row.day.id)}
                className="flex min-h-16 min-w-0 flex-1 items-center gap-2 rounded-control py-2 pr-1 pl-1 hover:bg-surface-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">{row.day.name}</span>
                  <span className="block text-sm text-muted-foreground">{subtitle(row)}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
              <ActionMenu
                label={`Więcej działań: ${row.day.name}`}
                items={[
                  {
                    label: 'Przenieś wyżej',
                    icon: ArrowUp,
                    disabled: index === 0,
                    onSelect: () => move(row.day.id, -1),
                  },
                  {
                    label: 'Przenieś niżej',
                    icon: ArrowDown,
                    disabled: index === days.length - 1,
                    onSelect: () => move(row.day.id, 1),
                  },
                  {
                    label: 'Duplikuj dzień',
                    icon: Copy,
                    onSelect: () => ignoreRejection(run(repository.duplicateDay(row.day.id))),
                  },
                  {
                    label: 'Usuń dzień',
                    icon: Trash2,
                    destructive: true,
                    onSelect: () => setDayToDelete(row.day),
                  },
                ]}
              />
            </div>
          )}
        />
      )}

      <ConfirmDialog
        open={dayToDelete !== null}
        onOpenChange={(open) => !open && setDayToDelete(null)}
        title={`Usunąć dzień „${dayToDelete?.name ?? ''}”?`}
        description="Dzień zostanie usunięty z planu razem ze swoimi ćwiczeniami i seriami. Zapisana historia treningów pozostanie bez zmian. Tej operacji nie można cofnąć."
        confirmLabel="Usuń dzień"
        destructive
        busy={deleting}
        onConfirm={() => {
          if (dayToDelete === null) {
            return;
          }
          setDeleting(true);
          run(repository.deleteDay(dayToDelete.id))
            .catch(() => undefined)
            .finally(() => {
              setDeleting(false);
              setDayToDelete(null);
            });
        }}
      />
    </section>
  );
}

function PlanEditor({ overview }: { readonly overview: PlanOverview }) {
  const { plans: repository } = useRepositories();
  const navigate = useNavigate();
  const { error, run } = useSaveGuard();
  const { plan } = overview;
  const modeLabelId = useId();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <PageHeader
        title={plan.name}
        description={
          <span className="flex flex-wrap gap-2">
            {plan.isPrimary && <Badge tone="accent">Główny</Badge>}
            {plan.isArchived && <Badge>Zarchiwizowany</Badge>}
            <span>Zmiany zapisują się automatycznie.</span>
          </span>
        }
        action={
          <ActionMenu
            label="Działania na planie"
            items={[
              {
                label: 'Ustaw jako główny',
                icon: Star,
                disabled: plan.isPrimary || plan.isArchived,
                onSelect: () => ignoreRejection(run(repository.setPrimaryPlan(plan.id))),
              },
              {
                label: 'Duplikuj plan',
                icon: Copy,
                onSelect: () =>
                  ignoreRejection(
                    run(repository.duplicatePlan(plan.id)).then((copy) =>
                      navigate(PLAN_PATHS.plan(copy.id)),
                    ),
                  ),
              },
              plan.isArchived
                ? {
                    label: 'Przywróć z archiwum',
                    icon: ArchiveRestore,
                    onSelect: () =>
                      ignoreRejection(run(repository.setPlanArchived(plan.id, false))),
                  }
                : {
                    label: 'Archiwizuj plan',
                    icon: Archive,
                    onSelect: () => ignoreRejection(run(repository.setPlanArchived(plan.id, true))),
                  },
              {
                label: 'Usuń plan',
                icon: Trash2,
                destructive: true,
                onSelect: () => setConfirmDelete(true),
              },
            ]}
          />
        }
      />

      {error !== null && (
        <ErrorAlert title="Nie udało się zapisać zmiany" className="mb-4">
          {error}
        </ErrorAlert>
      )}

      <DaysSection overview={overview} repository={repository} run={run} />

      <Card aria-labelledby="plan-settings-heading" className="mt-6 space-y-4">
        <CardTitle id="plan-settings-heading">Ustawienia planu</CardTitle>
        <AutosaveTextField
          label="Nazwa planu"
          value={plan.name}
          maxLength={120}
          requiredMessage="Podaj nazwę planu."
          onCommit={(name) => run(repository.updatePlan(plan.id, { name }))}
        />
        <AutosaveTextField
          label="Opis (opcjonalnie)"
          value={plan.description ?? ''}
          maxLength={2000}
          multiline
          onCommit={(description) =>
            run(repository.updatePlan(plan.id, { description: description || undefined }))
          }
        />
        <div>
          <h3 id={modeLabelId} className="mb-1.5 text-sm font-semibold text-foreground">
            Organizacja treningów
          </h3>
          <SegmentedControl
            aria-labelledby={modeLabelId}
            className="max-w-sm"
            value={plan.scheduleMode}
            options={MODE_OPTIONS}
            onValueChange={(scheduleMode) =>
              ignoreRejection(run(repository.updatePlan(plan.id, { scheduleMode })))
            }
          />
          <p className="mt-2 text-sm text-muted-foreground">
            {plan.scheduleMode === 'fixed'
              ? 'Każdemu dniowi treningowemu możesz przypisać dzień tygodnia.'
              : 'Treningi wykonujesz po kolei, niezależnie od dnia tygodnia.'}
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Usunąć plan „${plan.name}”?`}
        description="Plan zostanie usunięty razem ze wszystkimi dniami, ćwiczeniami i seriami. Zapisana historia treningów pozostanie bez zmian. Tej operacji nie można cofnąć. Jeśli chcesz tylko ukryć plan, użyj archiwizacji."
        confirmLabel="Usuń plan"
        destructive
        busy={deleting}
        onConfirm={() => {
          setDeleting(true);
          run(repository.deletePlan(plan.id)).then(
            () => navigate(PLAN_PATHS.list, { replace: true }),
            () => {
              setDeleting(false);
              setConfirmDelete(false);
            },
          );
        }}
      />
    </>
  );
}

export function PlanNotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Nie znaleziono planu"
      description="Ten plan lub dzień treningowy nie istnieje albo został usunięty."
      action={
        <Link to={PLAN_PATHS.list} className={buttonStyles()}>
          Wróć do planów
        </Link>
      }
    />
  );
}

export function PlanEditorPage() {
  const { planId = '' } = useParams();
  const { plans: repository } = useRepositories();
  const subscribe = useCallback(
    (
      listener: (plan: PlanOverview | null) => void,
      onError: Parameters<PlanRepository['observePlan']>[2],
    ) => repository.observePlan(planId, listener, onError),
    [repository, planId],
  );
  const observed = useObserved(subscribe);

  return (
    <>
      <BackLink to={PLAN_PATHS.list}>Plany</BackLink>
      {observed.status === 'loading' && <LoadingState label="Wczytywanie planu…" />}
      {observed.status === 'error' && (
        <ErrorAlert title="Nie udało się wczytać planu">{observed.message}</ErrorAlert>
      )}
      {observed.status === 'ready' &&
        (observed.value === null ? (
          <PlanNotFound />
        ) : (
          <PlanEditor key={observed.value.plan.id} overview={observed.value} />
        ))}
    </>
  );
}
