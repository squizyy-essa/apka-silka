import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumber } from '@/shared/lib/numberInput';

export interface ChartPoint {
  readonly label: string;
  readonly value: number;
}

export interface ProgressChartProps {
  readonly points: readonly ChartPoint[];
  readonly unit: string;
  readonly kind: 'line' | 'bar';
  /** Name shown in the tooltip, e.g. "Największy ciężar". */
  readonly seriesName: string;
}

const AXIS = { fontSize: 12, fill: 'var(--tp-text-muted)' } as const;

/**
 * One series in one unit. Loaded on demand (the charting library is large),
 * decorative for screen readers: every chart has the same numbers as a table.
 */
export default function ProgressChart({ points, unit, kind, seriesName }: ProgressChartProps) {
  const data = points.map((point) => ({ ...point }));
  const common = {
    data,
    margin: { top: 8, right: 8, bottom: 0, left: -8 },
    // The chart is hidden from assistive technology (the table has the data), so it must not be focusable either.
    accessibilityLayer: false,
  } as const;
  const axes = (
    <>
      <CartesianGrid stroke="var(--tp-border)" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={AXIS} stroke="var(--tp-border-strong)" />
      <YAxis tick={AXIS} stroke="var(--tp-border-strong)" width={48} domain={[0, 'auto']} />
      <Tooltip
        formatter={(value) => [`${formatNumber(Number(value))} ${unit}`, seriesName]}
        contentStyle={{
          background: 'var(--tp-surface)',
          border: '1px solid var(--tp-border)',
          borderRadius: 12,
          color: 'var(--tp-text)',
        }}
      />
    </>
  );
  return (
    <div className="h-56 w-full" aria-hidden="true" data-testid="progress-chart">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' ? (
          <BarChart {...common}>
            {axes}
            <Bar dataKey="value" fill="var(--tp-primary)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <LineChart {...common}>
            {axes}
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--tp-primary)"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: 'var(--tp-primary)' }}
              isAnimationActive={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
