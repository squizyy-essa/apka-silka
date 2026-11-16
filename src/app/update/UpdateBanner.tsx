import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/Button';
import { applyUpdate } from './updateCheck';
import { useUpdateCheck } from './useUpdateCheck';

/**
 * Tells the user that a newer version is published and lets them load it
 * when it suits them. It never reloads on its own, so it cannot interrupt
 * something in progress; saved data is not affected by the reload.
 */
export function UpdateBanner() {
  const available = useUpdateCheck(__BUILD_ID__);
  const [dismissedBuildId, setDismissedBuildId] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  if (available === null || available.buildId === dismissedBuildId) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-primary bg-primary-soft p-3"
    >
      <p className="min-w-0 flex-1 basis-48 text-sm text-foreground">
        <span className="font-semibold">Dostępna jest nowsza wersja aplikacji</span> (
        {available.version}). Twoje dane zostaną zachowane.
      </p>
      <div className="flex gap-2">
        <Button
          icon={<RefreshCw className="size-4" aria-hidden="true" />}
          loading={updating}
          onClick={() => {
            setUpdating(true);
            void applyUpdate((input, init) => fetch(input, init));
          }}
        >
          Odśwież
        </Button>
        <Button
          variant="ghost"
          disabled={updating}
          onClick={() => setDismissedBuildId(available.buildId)}
        >
          Później
        </Button>
      </div>
    </div>
  );
}
