import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';

export interface BackLinkProps {
  readonly to: string;
  readonly children: string;
}

/** Explicit way up one level – needed in full-screen mode, where there is no browser Back button. */
export function BackLink({ to, children }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-medium text-accent-text hover:bg-surface-muted"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
