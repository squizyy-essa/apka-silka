import { Lightbulb } from "lucide-react";
import { useEffect, useState } from "react";
import { useRepositories } from "@/app/repositoriesContext";
import { storageErrorMessage, toStorageError, type SessionDetail } from "@/db";
import {
  describeRecommendation,
  exerciseResultOf,
  planChangesOf,
  recommendNextSession,
  SUGGESTION_DISCLAIMER,
  type BetweenSessionsRecommendation,
  type ExerciseResult,
} from "@/progression";
import type { ProgressionSuggestion } from "@/shared/domain";
import { formatNumber } from "@/shared/lib/numberInput";
import { ignoreRejection, useSaveGuard } from "@/shared/lib/useSaveGuard";
import { Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { Card, CardTitle } from "@/shared/ui/Card";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { ErrorAlert } from "@/shared/ui/states";
import { useSessionSuggestions } from "./useSessionSuggestions";
import { sessionErrorMessage } from "./workoutText";

/** How many earlier workouts are looked at to notice repeated misses. */
const HISTORY_LENGTH = 5;

interface Entry {
  readonly sessionExerciseId: string;
  readonly name: string;
  readonly recommendation: BetweenSessionsRecommendation;
}

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly entries: readonly Entry[] }
  | { readonly status: "error"; readonly message: string };

function useRecommendations(detail: SessionDetail): Loaded {
  const { sessions } = useRepositories();
  const [state, setState] = useState<{ detail: SessionDetail; loaded: Loaded }>(
    {
      detail,
      loaded: { status: "loading" },
    },
  );

  useEffect(() => {
    let cancelled = false;
    const performed = detail.exercises.filter(
      ({ exercise, sets }) =>
        !exercise.isSkipped &&
        sets.some(
          (set) => set.status === "completed" || set.status === "failed",
        ),
    );
    Promise.all(
      performed.map(async ({ exercise, sets }): Promise<Entry> => {
        const history = await sessions.getExerciseHistory(
          exercise.exerciseId,
          detail.session.startedAt,
          HISTORY_LENGTH,
        );
        const previous: ExerciseResult[] = history.map((entry) =>
          exerciseResultOf(entry.exercise, entry.sets),
        );
        return {
          sessionExerciseId: exercise.id,
          name: exercise.exerciseNameSnapshot,
          recommendation: recommendNextSession(
            exerciseResultOf(exercise, sets),
            previous,
          ),
        };
      }),
    ).then(
      (entries) =>
        !cancelled &&
        setState({ detail, loaded: { status: "ready", entries } }),
      (error: unknown) =>
        !cancelled &&
        setState({
          detail,
          loaded: {
            status: "error",
            message: storageErrorMessage(toStorageError(error).kind),
          },
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [sessions, detail]);

  return state.detail === detail ? state.loaded : { status: "loading" };
}

function describeChanges(
  changes: readonly { fromKg: number; toKg: number }[],
): string {
  const pairs = [
    ...new Set(
      changes.map(
        (change) =>
          `${formatNumber(change.fromKg)} → ${formatNumber(change.toKg)} kg`,
      ),
    ),
  ];
  return pairs.join(", ");
}

function DecisionBadge({
  decision,
}: {
  readonly decision: ProgressionSuggestion;
}) {
  return decision.decision === "applied" ? (
    <Badge tone="accent">Zastosowano w planie</Badge>
  ) : (
    <Badge>Zignorowano</Badge>
  );
}

/**
 * Recommendations for the next workout (spec §9.4), one per performed
 * exercise, with the reason. The plan changes only when the user presses
 * "Zastosuj w planie" and confirms; each decision is remembered.
 */
export function NextSessionSuggestions({
  detail,
}: {
  readonly detail: SessionDetail;
}) {
  const { suggestions } = useRepositories();
  const loaded = useRecommendations(detail);
  const decisions = useSessionSuggestions(detail.session.id);
  const { error, run } = useSaveGuard(sessionErrorMessage);
  const [confirming, setConfirming] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);

  const decisionFor = (entry: Entry) =>
    decisions.status === "ready"
      ? decisions.value.find(
          (decision) =>
            decision.source === "between_sessions" &&
            decision.sessionExerciseId === entry.sessionExerciseId,
        )
      : undefined;

  const inputFor = (entry: Entry) => {
    const proposal = planChangesOf(entry.recommendation);
    if (
      proposal === undefined ||
      (entry.recommendation.kind !== "increase_weight" &&
        entry.recommendation.kind !== "consider_decrease")
    ) {
      return undefined;
    }
    const text = describeRecommendation(entry.recommendation);
    return {
      proposal,
      input: {
        sessionExerciseId: entry.sessionExerciseId,
        kind: entry.recommendation.kind,
        title: text.title,
        explanation: text.reason,
        changes: proposal.changes,
      },
    };
  };

  return (
    <Card aria-labelledby="next-session-heading" className="mt-4">
      <CardTitle id="next-session-heading" className="flex items-center gap-2">
        <Lightbulb className="size-4 text-accent-text" aria-hidden="true" />
        Sugestie na następny trening
      </CardTitle>

      {loaded.status === "loading" && (
        <p className="mt-2 text-sm text-muted-foreground">Analizuję wyniki…</p>
      )}
      {loaded.status === "error" && (
        <ErrorAlert title="Nie udało się przygotować sugestii" className="mt-2">
          {loaded.message}
        </ErrorAlert>
      )}
      {error !== null && (
        <ErrorAlert title="Nie udało się zapisać decyzji" className="mt-2">
          {error}
        </ErrorAlert>
      )}

      {loaded.status === "ready" &&
        (loaded.entries.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            W tym treningu nie wykonano żadnej serii, więc nie ma czego oceniać.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {loaded.entries.map((entry) => {
              const text = describeRecommendation(entry.recommendation);
              const decision = decisionFor(entry);
              const actionable = inputFor(entry);
              return (
                <li
                  key={entry.sessionExerciseId}
                  aria-label={`Sugestia: ${entry.name}`}
                  className="rounded-control border border-border bg-background p-3"
                >
                  <h3 className="font-semibold text-foreground">
                    {entry.name}
                  </h3>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    {text.title}
                    {decision !== undefined && (
                      <DecisionBadge decision={decision} />
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {text.reason}
                  </p>
                  {actionable !== undefined &&
                    decision === undefined &&
                    decisions.status === "ready" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          aria-label={`Zastosuj w planie: ${entry.name}`}
                          onClick={() => setConfirming(entry)}
                        >
                          Zastosuj w planie
                        </Button>
                        <Button
                          variant="ghost"
                          aria-label={`Zignoruj sugestię: ${entry.name}`}
                          onClick={() =>
                            ignoreRejection(
                              run(suggestions.ignoreForPlan(actionable.input)),
                            )
                          }
                        >
                          Zignoruj
                        </Button>
                      </div>
                    )}
                </li>
              );
            })}
          </ul>
        ))}

      <p className="mt-3 text-xs text-muted-foreground">
        {SUGGESTION_DISCLAIMER}
      </p>

      {confirming !== null && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          title="Zmienić plan?"
          description={
            <>
              Ciężar w planie ćwiczenia „{confirming.name}” zmieni się dla{" "}
              {inputFor(confirming)?.proposal.changes.length ?? 0} serii:{" "}
              {describeChanges(inputFor(confirming)?.proposal.changes ?? [])}.
              Ten i wcześniejsze treningi w historii pozostaną bez zmian.
            </>
          }
          confirmLabel="Zmień plan"
          busy={busy}
          onConfirm={() => {
            const actionable = inputFor(confirming);
            if (actionable === undefined) {
              setConfirming(null);
              return;
            }
            setBusy(true);
            run(suggestions.applyToPlan(actionable.input))
              .catch(() => undefined)
              .finally(() => {
                setBusy(false);
                setConfirming(null);
              });
          }}
        />
      )}
    </Card>
  );
}
