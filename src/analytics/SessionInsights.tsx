import { useMemo } from 'react';
import { Trophy } from 'lucide-react';
import type { SessionDetail } from '@/db';
import { formatNumber } from '@/shared/lib/numberInput';
import { formatLocalDate } from '@/workouts/workoutText';
import { Card, CardTitle } from '@/shared/ui/Card';
import { compareWithPrevious } from './compare';
import { useCompletedSessions } from './useCompletedSessions';
import { RECORD_KIND_LABELS, computeRecordEvents, describeRecord, recordsOfSession } from './records';

const signed = (value: number, unit: string) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatNumber(Math.abs(value))} ${unit}`;

/**
 * Personal records and the comparison with the previous workout, calculated
 * from the recorded sets (nothing is stored, so an edit of history is reflected).
 */
export function SessionInsights({ detail }: { readonly detail: SessionDetail }) {
  const all = useCompletedSessions();
  const insights = useMemo(() => {
    if (all.status !== 'ready') {
      return null;
    }
    return {
      records: recordsOfSession(computeRecordEvents(all.value), detail.session.id),
      comparison: compareWithPrevious(detail, all.value),
    };
  }, [all, detail]);

  if (insights === null) {
    return null;
  }
  const { records, comparison } = insights;
  return (
    <>
      <Card aria-labelledby="records-heading" className="mt-4">
        <CardTitle id="records-heading" className="flex items-center gap-2">
          <Trophy className="size-5 text-accent-text" aria-hidden="true" />
          Rekordy osobiste
        </CardTitle>
        {records.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            W tym treningu nie pobito żadnego rekordu. Pierwszy wynik w ćwiczeniu jest punktem odniesienia, a
            nie rekordem.
          </p>
        ) : (
          <>
            <ul className="mt-3 space-y-2 text-sm">
              {records.map((record) => (
                <li key={`${record.exerciseId}-${record.kind}-${record.weightKg ?? ''}`}>
                  <span className="font-semibold text-foreground">{record.exerciseName}</span>
                  <br />
                  <span className="text-foreground">
                    {RECORD_KIND_LABELS[record.kind]}: {describeRecord(record)}
                  </span>
                </li>
              ))}
            </ul>
            {records.some((record) => record.kind === 'max_e1rm') && (
              <p className="mt-3 text-xs text-muted-foreground">
                Szacowane 1RM (wzór Epleya, tylko dla 1–10 powtórzeń) to szacunek, a nie podniesiony ciężar.
              </p>
            )}
          </>
        )}
      </Card>

      <Card aria-labelledby="comparison-heading" className="mt-4">
        <CardTitle id="comparison-heading">Porównanie z poprzednim treningiem</CardTitle>
        {comparison === null ? (
          <p className="mt-2 text-sm text-muted-foreground">
            To pierwszy taki trening, więc nie ma jeszcze z czym go porównać.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {comparison.basis === 'plan_day' ? 'Ten sam dzień planu' : 'Trening o tej samej nazwie'}:{' '}
              {comparison.previous.session.name},{' '}
              {formatLocalDate(comparison.previous.session.localWorkoutDate)}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-control bg-surface-muted p-2">
                <dt className="text-xs font-medium text-muted-foreground">Objętość robocza</dt>
                <dd className="mt-0.5 font-bold text-foreground">{signed(comparison.volumeDeltaKg, 'kg')}</dd>
              </div>
              <div className="rounded-control bg-surface-muted p-2">
                <dt className="text-xs font-medium text-muted-foreground">Serie robocze</dt>
                <dd className="mt-0.5 font-bold text-foreground">
                  {signed(comparison.workingSetsDelta, '')}
                </dd>
              </div>
              <div className="rounded-control bg-surface-muted p-2">
                <dt className="text-xs font-medium text-muted-foreground">Czas</dt>
                <dd className="mt-0.5 font-bold text-foreground">
                  {signed(Math.round(comparison.durationDeltaMs / 60_000), 'min')}
                </dd>
              </div>
            </dl>
          </>
        )}
      </Card>
    </>
  );
}
