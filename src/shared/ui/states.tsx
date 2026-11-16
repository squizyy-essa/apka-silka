import { CircleAlert, LoaderCircle } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface EmptyStateProps {
  readonly icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  readonly title: string;
  readonly description?: ReactNode;
  /** Real action only – omit it when nothing can be done yet. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-10 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-accent-text">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      {description !== undefined && (
        <div className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</div>
      )}
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'Wczytywanie…' }: { readonly label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export interface ErrorAlertProps {
  readonly title: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

/** Announced immediately by screen readers; marked by an icon, not by colour alone. */
export function ErrorAlert({ title, children, className }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-control border border-danger bg-danger-soft p-3 text-sm text-foreground',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
      <div>
        <p className="font-semibold">{title}</p>
        {children !== undefined && <div className="mt-0.5">{children}</div>}
      </div>
    </div>
  );
}
