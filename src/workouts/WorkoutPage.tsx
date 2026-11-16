import { PageHeader } from '@/shared/ui/PageHeader';
import { PlannedModuleNotice } from '@/shared/ui/PlannedModuleNotice';

export function WorkoutPage() {
  return (
    <>
      <PageHeader title="Trening" />
      <PlannedModuleNotice
        phase={4}
        scope={[
          'start treningu z planu lub pustego treningu',
          'zapisywanie każdej serii od razu po jej zakończeniu',
          'timer odpoczynku i wznawianie przerwanej sesji',
          'sugestie progresji ciężaru i powtórzeń (faza 5)',
        ]}
      />
    </>
  );
}
