import { CircleHelp } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

/**
 * Collapsed explanation of the RIR abbreviation, shown next to RIR fields.
 * A native <details> element: works with keyboard and screen readers.
 */
export function RirHelp({ className }: { readonly className?: string }) {
  return (
    <details className={cn('group text-sm', className)}>
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control pr-2 font-medium text-accent-text hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        Co to jest RIR?
      </summary>
      <div className="rounded-control bg-surface-muted p-3 text-foreground">
        <p>
          <span className="font-semibold">RIR</span> (ang. <span lang="en">Reps In Reserve</span>)
          to <span className="font-semibold">powtórzenia w zapasie</span>: ile powtórzeń dałbyś
          jeszcze radę zrobić po zakończeniu serii, z zachowaniem dobrej techniki.
        </p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          <li>RIR 0 – seria do upadku, żadnego powtórzenia więcej.</li>
          <li>RIR 2 – kończysz, mając w zapasie dwa powtórzenia.</li>
          <li>RIR 4 i więcej – seria lekka.</li>
        </ul>
        <p className="mt-2">
          W planie wpisujesz RIR docelowy, w treningu – rzeczywisty. Pole jest opcjonalne: puste
          oznacza „nie podano”, a nie zero.
        </p>
      </div>
    </details>
  );
}
