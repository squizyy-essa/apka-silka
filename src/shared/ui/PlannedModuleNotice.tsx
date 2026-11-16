import { Construction } from 'lucide-react';
import { Card } from './Card';

export interface PlannedModuleNoticeProps {
  /** Implementation phase (see docs/ARCHITECTURE.md) in which the module arrives. */
  readonly phase: number;
  /** Names what is missing when the screen also has working parts. */
  readonly title?: string;
  /** What the module will do, in user terms. */
  readonly scope: readonly string[];
}

/**
 * Honest placeholder for a section that is not implemented yet. It states
 * that plainly and offers no controls, so nothing on screen pretends to work.
 */
export function PlannedModuleNotice({
  phase,
  scope,
  title = 'Ten moduł nie jest jeszcze wdrożony',
}: PlannedModuleNoticeProps) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-accent-text">
          <Construction className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Wdrożenie zaplanowane od fazy {phase} projektu. Docelowo znajdziesz tu:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground">
            {scope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
