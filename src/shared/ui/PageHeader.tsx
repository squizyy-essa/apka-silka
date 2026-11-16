import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Primary action of the screen, shown next to the title. */
  readonly action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-3">
        {/* A small action (menu) stays next to the title; a wide button wraps below it. */}
        <h1 className="min-w-0 flex-1 basis-40 text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {action !== undefined && <div className="shrink-0">{action}</div>}
      </div>
      {description !== undefined && (
        <div className="mt-1 text-sm text-muted-foreground">{description}</div>
      )}
    </header>
  );
}
