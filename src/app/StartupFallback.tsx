import { LoadingState } from '@/shared/ui/states';

/** Shown while the first screen's code is being loaded. */
export function StartupFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <LoadingState label="Wczytywanie…" />
    </div>
  );
}
