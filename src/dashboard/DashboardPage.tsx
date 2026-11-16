import { PageHeader } from '@/shared/ui/PageHeader';
import { PlannedModuleNotice } from '@/shared/ui/PlannedModuleNotice';

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Pulpit" />
      <PlannedModuleNotice
        phase={4}
        scope={[
          'najbliższy trening i szybki start (faza 4)',
          'wznawianie niedokończonego treningu (faza 4)',
          'podsumowanie tygodnia, ostatnie rekordy, mini kalendarz i ostatni pomiar masy ciała (faza 6)',
        ]}
      />
    </>
  );
}
