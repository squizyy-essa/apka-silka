import { CalendarClock, ClipboardList, Dumbbell, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ROUTE_PATHS } from '@/app/navigation';
import { useRepositories } from '@/app/repositoriesContext';
import type { PlanOverview, PlanRepository } from '@/db';
import { PLAN_PATHS } from '@/plans/paths';
import { countLabel, WEEKDAY_LABELS } from '@/plans/planText';
import type { PlanDay } from '@/shared/domain';
import { useObserved } from '@/shared/lib/useObserved';
import { suggestNextDay } from '@/shared/logic/workout';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card, CardDescription, CardTitle } from '@/shared/ui/Card';
import { PageHeader } from '@/shared/ui/PageHeader';
import { PlannedModuleNotice } from '@/shared/ui/PlannedModuleNotice';
import { ErrorAlert } from '@/shared/ui/states';
import { useActiveSession } from '@/workouts/useActiveSession';
import { sessionErrorMessage } from '@/workouts/workoutText';

/** ISO weekday (1 = Monday … 7 = Sunday) of the device's current date. */
function todayIsoWeekday(now: Date = new Date()): number {
  return now.getDay() === 0 ? 7 : now.getDay();
}

function NextWorkoutCard({ primary }: { readonly primary: PlanOverview | undefined }) {
  const { sessions } = useRepositories();
  const navigate = useNavigate();
  const [lastDay, setLastDay] = useState<{ planId: string; dayId: string | undefined } | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const planId = primary?.plan.id;

  useEffect(() => {
    if (planId === undefined) {
      return;
    }
    let cancelled = false;
    sessions.getLastCompletedDayId(planId).then(
      (dayId) => !cancelled && setLastDay({ planId, dayId }),
      () => !cancelled && setLastDay({ planId, dayId: undefined }),
    );
    return () => {
      cancelled = true;
    };
  }, [sessions, planId]);

  if (primary === undefined || primary.days.length === 0) {
    return (
      <Card aria-labelledby="next-heading">
        <CardTitle id="next-heading">Najbliższy trening</CardTitle>
        <CardDescription>
          {primary === undefined
            ? 'Nie masz jeszcze planu głównego. Utwórz plan, a tutaj pojawi się Twój następny trening.'
            : `Plan „${primary.plan.name}” nie ma jeszcze dni treningowych.`}
        </CardDescription>
        <Link
          to={primary === undefined ? PLAN_PATHS.create : PLAN_PATHS.plan(primary.plan.id)}
          className={`${buttonStyles({ variant: 'secondary' })} mt-4`}
        >
          <ClipboardList className="size-4" aria-hidden="true" />
          {primary === undefined ? 'Utwórz plan' : 'Dodaj dni do planu'}
        </Link>
      </Card>
    );
  }

  const { plan, days } = primary;
  // Until the history lookup answers we do not guess which day is next.
  const ready = lastDay !== null && lastDay.planId === plan.id;
  const next: PlanDay | undefined = ready
    ? suggestNextDay(plan.scheduleMode, days.map(({ day }) => day), lastDay.dayId, todayIsoWeekday())
    : undefined;
  const exerciseCount = days.find(({ day }) => day.id === next?.id)?.exerciseCount ?? 0;

  return (
    <Card aria-labelledby="next-heading">
      <CardTitle id="next-heading">Najbliższy trening</CardTitle>
      {next === undefined ? (
        <CardDescription>Wczytywanie…</CardDescription>
      ) : (
        <>
          <p className="mt-2 text-xl font-bold text-foreground">{next.name}</p>
          <p className="text-sm text-muted-foreground">
            {[
              plan.name,
              plan.scheduleMode === 'fixed' && next.weekday !== undefined
                ? WEEKDAY_LABELS[next.weekday]
                : undefined,
              countLabel.exercises(exerciseCount),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {error !== null && (
            <ErrorAlert title="Nie udało się rozpocząć treningu" className="mt-3">
              {error}
            </ErrorAlert>
          )}
          <Button
            className="mt-4"
            icon={<Play className="size-4" aria-hidden="true" />}
            loading={starting}
            onClick={() => {
              setStarting(true);
              setError(null);
              sessions.startFromPlanDay(next.id).then(
                () => navigate(ROUTE_PATHS.workout),
                (cause: unknown) => {
                  setStarting(false);
                  setError(sessionErrorMessage(cause));
                },
              );
            }}
          >
            Rozpocznij trening
          </Button>
        </>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { plans } = useRepositories();
  const active = useActiveSession();
  const subscribe = useCallback(
    (listener: (value: PlanOverview[]) => void, onError: Parameters<PlanRepository['observePlans']>[1]) =>
      plans.observePlans(listener, onError),
    [plans],
  );
  const observed = useObserved(subscribe);
  const primary =
    observed.status === 'ready'
      ? observed.value.find(({ plan }) => plan.isPrimary && !plan.isArchived)
      : undefined;
  const session = active.status === 'ready' ? active.value?.session : undefined;

  return (
    <>
      <PageHeader title="Pulpit" />
      <div className="space-y-4">
        {session !== undefined ? (
          <Card aria-labelledby="resume-heading">
            <CardTitle id="resume-heading">Trening w toku</CardTitle>
            <CardDescription>
              „{session.name}” czeka na dokończenie. Wszystkie zapisane serie są zachowane.
            </CardDescription>
            <Link to={ROUTE_PATHS.workout} className={`${buttonStyles()} mt-4`}>
              <Dumbbell className="size-4" aria-hidden="true" />
              Wznów trening
            </Link>
          </Card>
        ) : (
          <>
            {observed.status === 'error' && (
              <ErrorAlert title="Nie udało się wczytać planów">{observed.message}</ErrorAlert>
            )}
            {observed.status === 'ready' && <NextWorkoutCard primary={primary} />}
            <Card aria-labelledby="quick-heading">
              <CardTitle id="quick-heading">Szybki start</CardTitle>
              <CardDescription>
                Wybierz dowolny dzień z planu albo zacznij pusty trening.
              </CardDescription>
              <Link to={ROUTE_PATHS.workout} className={`${buttonStyles({ variant: 'secondary' })} mt-4`}>
                <CalendarClock className="size-4" aria-hidden="true" />
                Wybierz trening
              </Link>
            </Card>
          </>
        )}

        <PlannedModuleNotice
          phase={6}
          title="Podsumowanie aktywności nie jest jeszcze wdrożone"
          scope={[
            'liczba treningów w tygodniu i ostatni trening',
            'ostatnie rekordy osobiste i postęp',
            'mini kalendarz i ostatni pomiar masy ciała',
          ]}
        />
      </div>
    </>
  );
}
