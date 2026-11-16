import { PageHeader } from '@/shared/ui/PageHeader';
import { PlannedModuleNotice } from '@/shared/ui/PlannedModuleNotice';

export function PlansPage() {
  return (
    <>
      <PageHeader title="Plany" />
      <PlannedModuleNotice
        phase={3}
        scope={[
          'biblioteka ćwiczeń z wyszukiwaniem i własnymi ćwiczeniami (faza 2)',
          'tworzenie, edycja, duplikowanie i archiwizacja planów',
          'dni treningowe w trybie stałym lub elastycznym',
          'serie rozgrzewkowe i robocze, superserie, zamienniki',
        ]}
      />
    </>
  );
}
