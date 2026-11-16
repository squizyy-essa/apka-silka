import { ChevronRight, ClipboardList, Library, Plus } from 'lucide-react';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import type { PlanOverview } from '@/db';
import { EXERCISE_PATHS } from '@/exercises/paths';
import { useObserved } from '@/shared/lib/useObserved';
import { Badge } from '@/shared/ui/Badge';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { PageHeader } from '@/shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { PLAN_PATHS } from './paths';
import { countLabel, SCHEDULE_MODE_LABELS } from './planText';

const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });

/** Primary plan first, then by name. */
function sortPlans(plans: readonly PlanOverview[]): PlanOverview[] {
  return [...plans].sort(
    (a, b) =>
      Number(b.plan.isPrimary) - Number(a.plan.isPrimary) ||
      collator.compare(a.plan.name, b.plan.name),
  );
}

function PlanCard({ overview }: { readonly overview: PlanOverview }) {
  const { plan, days } = overview;
  const exerciseCount = days.reduce((sum, { exerciseCount: count }) => sum + count, 0);
  return (
    <li>
      <Link
        to={PLAN_PATHS.plan(plan.id)}
        className="flex min-h-16 items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors duration-150 hover:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{plan.name}</span>
            {plan.isPrimary && <Badge tone="accent">Główny</Badge>}
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground">
            {SCHEDULE_MODE_LABELS[plan.scheduleMode]} · {countLabel.days(days.length)} ·{' '}
            {countLabel.exercises(exerciseCount)}
          </span>
          {days.length > 0 && (
            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
              {days.map(({ day }) => day.name).join(', ')}
            </span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function PlansPage() {
  const { plans: repository } = useRepositories();
  const subscribe = useCallback(
    (listener: (plans: PlanOverview[]) => void, onError: Parameters<typeof repository.observePlans>[1]) =>
      repository.observePlans(listener, onError),
    [repository],
  );
  const observed = useObserved(subscribe);

  const active = observed.status === 'ready' ? sortPlans(observed.value.filter((o) => !o.plan.isArchived)) : [];
  const archived = observed.status === 'ready' ? sortPlans(observed.value.filter((o) => o.plan.isArchived)) : [];

  return (
    <>
      <PageHeader
        title="Plany"
        action={
          <Link to={PLAN_PATHS.create} className={buttonStyles()}>
            <Plus className="size-4" aria-hidden="true" />
            Nowy plan
          </Link>
        }
      />

      <div className="space-y-5">
        {observed.status === 'loading' && <LoadingState label="Wczytywanie planów…" />}
        {observed.status === 'error' && (
          <ErrorAlert title="Nie udało się wczytać planów">{observed.message}</ErrorAlert>
        )}

        {observed.status === 'ready' &&
          (active.length > 0 ? (
            <ul aria-label="Plany treningowe" className="space-y-3">
              {active.map((overview) => (
                <PlanCard key={overview.plan.id} overview={overview} />
              ))}
            </ul>
          ) : (
            <div className="rounded-card border border-border bg-surface shadow-card">
              <EmptyState
                icon={ClipboardList}
                title="Nie masz jeszcze planu treningowego"
                description="Utwórz plan, dodaj do niego dni treningowe i ćwiczenia z biblioteki."
                action={
                  <Link to={PLAN_PATHS.create} className={buttonStyles()}>
                    Utwórz pierwszy plan
                  </Link>
                }
              />
            </div>
          ))}

        {archived.length > 0 && (
          <section aria-labelledby="archived-heading">
            <h2 id="archived-heading" className="mb-2 text-sm font-semibold text-foreground">
              Zarchiwizowane
            </h2>
            <ul aria-label="Zarchiwizowane plany" className="space-y-3">
              {archived.map((overview) => (
                <PlanCard key={overview.plan.id} overview={overview} />
              ))}
            </ul>
          </section>
        )}

        <Link
          to={EXERCISE_PATHS.list}
          className="flex min-h-16 items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors duration-150 hover:bg-surface-muted"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-accent-text">
            <Library className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">Biblioteka ćwiczeń</span>
            <span className="block text-sm text-muted-foreground">
              Gotowe ćwiczenia, wyszukiwanie i własne ćwiczenia
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      </div>
    </>
  );
}
