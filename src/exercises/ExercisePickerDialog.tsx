import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { muscleGroupSchema, type Exercise } from '@/shared/domain';
import { IconButton } from '@/shared/ui/IconButton';
import { SelectField, TextField } from '@/shared/ui/fields';
import { ErrorAlert, LoadingState } from '@/shared/ui/states';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { EQUIPMENT_LABELS, MUSCLE_LABELS, MUSCLE_OPTIONS } from './labels';
import { filterExercises } from './search';
import { useExerciseLibrary } from './useExerciseLibrary';

export interface ExercisePickerDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** Exercises that cannot be chosen (e.g. already used as alternatives). */
  readonly excludedIds?: readonly string[] | undefined;
  readonly onPick: (exercise: Exercise) => void;
}

function PickerBody({
  excludedIds,
  onPick,
}: Pick<ExercisePickerDialogProps, 'excludedIds' | 'onPick'>) {
  const library = useExerciseLibrary();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState('');

  const results = useMemo(() => {
    if (library.status !== 'ready') {
      return [];
    }
    const parsedMuscle = muscleGroupSchema.safeParse(muscle);
    const excluded = new Set(excludedIds);
    return filterExercises(library.exercises, {
      query,
      muscle: parsedMuscle.success ? parsedMuscle.data : undefined,
    }).filter((exercise) => !excluded.has(exercise.id));
  }, [library, query, muscle, excludedIds]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 border-b border-border p-4">
        <TextField
          label="Szukaj po nazwie"
          type="search"
          autoComplete="off"
          className="col-span-2 sm:col-span-1"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label="Partia mięśniowa"
          emptyOption="Wszystkie"
          options={MUSCLE_OPTIONS}
          className="col-span-2 sm:col-span-1"
          value={muscle}
          onChange={(event) => setMuscle(event.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {library.status === 'loading' && <LoadingState label="Wczytywanie ćwiczeń…" />}
        {library.status === 'error' && (
          <ErrorAlert title="Nie udało się wczytać ćwiczeń" className="m-4">
            {library.message}
          </ErrorAlert>
        )}
        {library.status === 'ready' &&
          (results.length > 0 ? (
            <ul aria-label="Ćwiczenia do wyboru" className="divide-y divide-border">
              {results.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => onPick(exercise)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left transition-colors duration-150 hover:bg-surface-muted"
                  >
                    <ExerciseThumbnail imageId={exercise.imageId} className="size-10" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{exercise.name}</span>
                      <span className="block text-sm text-muted-foreground">
                        {MUSCLE_LABELS[exercise.primaryMuscle]} ·{' '}
                        {EQUIPMENT_LABELS[exercise.equipment]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Brak ćwiczeń spełniających kryteria. Własne ćwiczenia dodasz w bibliotece ćwiczeń.
            </p>
          ))}
      </div>
    </>
  );
}

/** Full-screen (phone) / centred (desktop) chooser of one exercise from the library. */
export function ExercisePickerDialog({
  open,
  onOpenChange,
  title,
  excludedIds,
  onPick,
}: ExercisePickerDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(42rem,90dvh)] sm:w-[min(36rem,92vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card sm:border sm:border-border sm:shadow-raised"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border py-2 pr-2 pl-4">
            <Dialog.Title className="text-lg font-semibold text-foreground">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Zamknij">
                <X className="size-5" aria-hidden="true" />
              </IconButton>
            </Dialog.Close>
          </div>
          {/* Mounted only while open, so search text resets between uses. */}
          {open && <PickerBody excludedIds={excludedIds} onPick={onPick} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
