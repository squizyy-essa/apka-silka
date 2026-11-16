import type { ReactNode } from 'react';

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  /** Primary action of the screen, shown next to the title. */
  readonly action?: ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description !== undefined && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action !== undefined && <div className="shrink-0">{action}</div>}
    </header>
  );
}
