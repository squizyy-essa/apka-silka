import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'accent';
  readonly className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        tone === 'accent'
          ? 'bg-primary-soft text-accent-text'
          : 'bg-surface-muted text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
