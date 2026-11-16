import { ChevronRight, Library } from 'lucide-react';
import { Link } from 'react-router';
import { EXERCISE_PATHS } from '@/exercises/paths';
import { PageHeader } from '@/shared/ui/PageHeader';
import { PlannedModuleNotice } from '@/shared/ui/PlannedModuleNotice';

export function PlansPage() {
  return (
    <>
      <PageHeader title="Plany" />
      <div className="space-y-4">
        <Link
          to={EXERCISE_PATHS.list}
          className="flex min-h-16 items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-colors duration-150 hover:bg-surface-muted"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-accent-text">
            <Library className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-foreground">Biblioteka ćwiczeń</span>
            <span className="block text-sm text-muted-foreground">
              Gotowe ćwiczenia, wyszukiwanie i własne ćwiczenia
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>

        <PlannedModuleNotice
          phase={3}
          title="Plany treningowe nie są jeszcze wdrożone"
          scope={[
            'tworzenie, edycja, duplikowanie i archiwizacja planów',
            'dni treningowe w trybie stałym lub elastycznym',
            'serie rozgrzewkowe i robocze, superserie, zamienniki',
          ]}
        />
      </div>
    </>
  );
}
