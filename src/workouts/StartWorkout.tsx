import { ClipboardList, Play } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { useRepositories } from "@/app/repositoriesContext";
import type { PlanOverview, PlanRepository } from "@/db";
import { PLAN_PATHS } from "@/plans/paths";
import { countLabel, WEEKDAY_LABELS } from "@/plans/planText";
import { useObserved } from "@/shared/lib/useObserved";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { buttonStyles } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { EmptyState, ErrorAlert, LoadingState } from "@/shared/ui/states";
import { sessionErrorMessage } from "./workoutText";

/** Chooser shown when no workout is in progress: a day of a plan, or an empty workout. */
export function StartWorkout() {
  const { plans, sessions } = useRepositories();
  const subscribe = useCallback(
    (
      listener: (value: PlanOverview[]) => void,
      onError: Parameters<PlanRepository["observePlans"]>[1],
    ) => plans.observePlans(listener, onError),
    [plans],
  );
  const observed = useObserved(subscribe);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = (key: string, begin: () => Promise<unknown>) => {
    setStarting(key);
    setError(null);
    // On success the page switches to the workout by itself (live data).
    begin().then(
      () => setStarting(null),
      (cause: unknown) => {
        setStarting(null);
        setError(sessionErrorMessage(cause));
      },
    );
  };

  const available =
    observed.status === "ready"
      ? observed.value
          .filter(({ plan }) => !plan.isArchived)
          .sort(
            (a, b) =>
              Number(b.plan.isPrimary) - Number(a.plan.isPrimary) ||
              a.plan.name.localeCompare(b.plan.name, "pl"),
          )
      : [];

  return (
    <>
      <PageHeader
        title="Trening"
        description="Wybierz dzień z planu albo zacznij pusty trening."
      />

      {error !== null && (
        <ErrorAlert title="Nie udało się rozpocząć treningu" className="mb-4">
          {error}
        </ErrorAlert>
      )}

      <div className="space-y-5">
        {observed.status === "loading" && (
          <LoadingState label="Wczytywanie planów…" />
        )}
        {observed.status === "error" && (
          <ErrorAlert title="Nie udało się wczytać planów">
            {observed.message}
          </ErrorAlert>
        )}

        {observed.status === "ready" && available.length === 0 && (
          <div className="rounded-card border border-border bg-surface shadow-card">
            <EmptyState
              icon={ClipboardList}
              title="Nie masz jeszcze planu treningowego"
              description="Utwórz plan, żeby zaczynać treningi jednym dotknięciem – albo zacznij pusty trening poniżej."
              action={
                <Link
                  to={PLAN_PATHS.create}
                  className={buttonStyles({ variant: "secondary" })}
                >
                  Utwórz plan
                </Link>
              }
            />
          </div>
        )}

        {available.map(({ plan, days }) => (
          <section key={plan.id} aria-label={`Plan: ${plan.name}`}>
            <h2 className="mb-2 flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
              {plan.name}
              {plan.isPrimary && <Badge tone="accent">Główny</Badge>}
            </h2>
            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Ten plan nie ma jeszcze dni treningowych.{" "}
                <Link
                  to={PLAN_PATHS.plan(plan.id)}
                  className="font-medium text-accent-text underline"
                >
                  Dodaj dzień
                </Link>
              </p>
            ) : (
              <ul className="space-y-2">
                {days.map(({ day, exerciseCount }) => (
                  <li
                    key={day.id}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-3 shadow-card"
                  >
                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block font-semibold text-foreground">
                        {day.name}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {[
                          plan.scheduleMode === "fixed" &&
                          day.weekday !== undefined
                            ? WEEKDAY_LABELS[day.weekday]
                            : undefined,
                          countLabel.exercises(exerciseCount),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Button
                      aria-label={`Rozpocznij: ${day.name}`}
                      icon={<Play className="size-4" aria-hidden="true" />}
                      loading={starting === day.id}
                      disabled={starting !== null}
                      onClick={() =>
                        start(day.id, () => sessions.startFromPlanDay(day.id))
                      }
                    >
                      Rozpocznij
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section aria-label="Pusty trening">
          <h2 className="mb-2 text-base font-semibold text-foreground">
            Bez planu
          </h2>
          <Button
            variant="secondary"
            loading={starting === "empty"}
            disabled={starting !== null}
            onClick={() =>
              start("empty", () => sessions.startEmpty("Trening bez planu"))
            }
          >
            Rozpocznij pusty trening
          </Button>
        </section>
      </div>
    </>
  );
}
