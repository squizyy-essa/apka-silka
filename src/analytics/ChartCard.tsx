import { lazy, Suspense } from 'react';
import { formatNumber } from '@/shared/lib/numberInput';
import { Card, CardTitle } from '@/shared/ui/Card';
import type { ChartPoint } from './ProgressChart';

const ProgressChart = lazy(() => import('./ProgressChart'));

export interface ChartCardProps {
  readonly title: string;
  readonly unit: string;
  readonly kind?: 'line' | 'bar';
  readonly points: readonly ChartPoint[];
  /** Extra line under the title, e.g. "szacunek, nie podniesiony ciężar". */
  readonly note?: string;
  readonly emptyText?: string;
}

/** A single-unit chart with its data as a table (also for screen readers). */
export function ChartCard({
  title,
  unit,
  kind = 'line',
  points,
  note,
  emptyText = 'Brak danych w tym zakresie.',
}: ChartCardProps) {
  return (
    <Card aria-label={title} className="mt-4">
      <CardTitle>
        {title} <span className="font-normal text-muted-foreground">({unit})</span>
      </CardTitle>
      {note !== undefined && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      {points.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <>
          <div className="mt-3">
            <Suspense fallback={<div className="h-56 animate-pulse rounded-control bg-surface-muted" />}>
              <ProgressChart points={points} unit={unit} kind={kind} seriesName={title} />
            </Suspense>
          </div>
          <details className="mt-2 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent-text">
              Pokaż dane jako tabelę
            </summary>
            <table className="mt-1 w-full text-left">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="py-1 font-medium">
                    Data
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {unit}
                  </th>
                </tr>
              </thead>
              <tbody>
                {points.map((point, index) => (
                  <tr key={`${point.label}-${index}`} className="border-t border-border">
                    <td className="py-1">{point.label}</td>
                    <td className="py-1 text-right">{formatNumber(point.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}
