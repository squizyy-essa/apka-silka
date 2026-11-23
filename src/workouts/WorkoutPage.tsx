import { ErrorAlert, LoadingState } from '@/shared/ui/states';
import { ActiveWorkout } from './ActiveWorkout';
import { StartWorkout } from './StartWorkout';
import { useActiveSession } from './useActiveSession';

/** "Trening": the workout in progress if there is one, otherwise the start chooser. */
export function WorkoutPage() {
  const active = useActiveSession();

  if (active.status === 'loading') {
    return <LoadingState label="Wczytywanie treningu…" />;
  }
  if (active.status === 'error') {
    return <ErrorAlert title="Nie udało się wczytać treningu">{active.message}</ErrorAlert>;
  }
  return active.value === null ? (
    <StartWorkout />
  ) : (
    <ActiveWorkout key={active.value.session.id} detail={active.value} />
  );
}
