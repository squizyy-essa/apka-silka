import { PageHeader } from '@/shared/ui/PageHeader';
import { PlannedModuleNotice } from '@/shared/ui/PlannedModuleNotice';

export function HistoryPage() {
  return (
    <>
      <PageHeader title="Historia i statystyki" />
      <PlannedModuleNotice
        phase={6}
        scope={[
          'lista zakończonych treningów ze szczegółami każdej serii',
          'wykresy postępów i rekordy osobiste',
          'kalendarz treningów',
          'pomiary ciała',
        ]}
      />
    </>
  );
}
