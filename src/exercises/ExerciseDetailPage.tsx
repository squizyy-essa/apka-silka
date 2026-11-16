import { Compass, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import { ExerciseRuleError, storageErrorMessage, toStorageError } from '@/db';
import type { Exercise } from '@/shared/domain';
import { BackLink } from '@/shared/ui/BackLink';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card } from '@/shared/ui/Card';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { PageHeader } from '@/shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, MEASUREMENT_LABELS, MUSCLE_LABELS } from './labels';
import { EXERCISE_PATHS } from './paths';
import { useExerciseLibrary } from './useExerciseLibrary';

function deleteErrorMessage(error: unknown): string {
  if (error instanceof ExerciseRuleError) {
    switch (error.violation) {
      case 'used-in-plan':
        return 'To ćwiczenie jest używane w planie treningowym. Usuń je najpierw z planu.';
      case 'system-exercise':
        return 'Ćwiczeń z gotowej biblioteki nie można usuwać.';
      case 'not-found':
        return 'To ćwiczenie zostało już usunięte.';
    }
  }
  return storageErrorMessage(toStorageError(error).kind);
}

function ExerciseDetails({ exercise }: { readonly exercise: Exercise }) {
  const { exercises: repository } = useRepositories();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    setDeleting(true);
    setError(null);
    repository.deleteCustom(exercise.id).then(
      () => navigate(EXERCISE_PATHS.list, { replace: true }),
      (cause: unknown) => {
        setDeleting(false);
        setConfirmOpen(false);
        setError(deleteErrorMessage(cause));
      },
    );
  };

  return (
    <>
      <PageHeader title={exercise.name} />

      {error !== null && (
        <ErrorAlert title="Nie udało się usunąć ćwiczenia" className="mb-4">
          {error}
        </ErrorAlert>
      )}

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row">
          {exercise.imageId !== undefined && (
            <ExerciseThumbnail
              imageId={exercise.imageId}
              alt={`Ilustracja: ${exercise.name}`}
              className="aspect-square w-full max-w-56 self-center sm:w-56 sm:self-start"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{exercise.isCustom ? 'Własne' : 'Gotowa biblioteka'}</Badge>
              <Badge>{CATEGORY_LABELS[exercise.category]}</Badge>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2 [&>dd]:mb-2 sm:[&>dd]:mb-0">
              <dt className="text-muted-foreground">Główna partia</dt>
              <dd className="font-medium text-foreground">
                {MUSCLE_LABELS[exercise.primaryMuscle]}
              </dd>
              <dt className="text-muted-foreground">Dodatkowe partie</dt>
              <dd className="font-medium text-foreground">
                {exercise.secondaryMuscles.length > 0
                  ? exercise.secondaryMuscles.map((muscle) => MUSCLE_LABELS[muscle]).join(', ')
                  : 'brak'}
              </dd>
              <dt className="text-muted-foreground">Sprzęt</dt>
              <dd className="font-medium text-foreground">{EQUIPMENT_LABELS[exercise.equipment]}</dd>
              <dt className="text-muted-foreground">Rodzaj pomiaru</dt>
              <dd className="font-medium text-foreground">
                {MEASUREMENT_LABELS[exercise.measurementType]}
              </dd>
            </dl>
          </div>
        </div>

        <h2 className="mt-5 text-sm font-semibold text-foreground">Wykonanie</h2>
        <p className="mt-1 text-sm whitespace-pre-line text-foreground">
          {exercise.description ?? 'Brak opisu.'}
        </p>
      </Card>

      {exercise.isCustom ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={EXERCISE_PATHS.edit(exercise.id)} className={buttonStyles()}>
            <Pencil className="size-4" aria-hidden="true" />
            Edytuj
          </Link>
          <Button
            variant="secondary"
            icon={<Trash2 className="size-4" aria-hidden="true" />}
            onClick={() => setConfirmOpen(true)}
          >
            Usuń
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          To ćwiczenie pochodzi z gotowej biblioteki, dlatego nie można go edytować ani usunąć.
          Jeśli potrzebujesz innego wariantu, dodaj własne ćwiczenie.
        </p>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Usunąć ćwiczenie „${exercise.name}”?`}
        description="Ćwiczenie zniknie z biblioteki razem z ilustracją. Zapisana historia treningów z tym ćwiczeniem pozostanie bez zmian. Tej operacji nie można cofnąć."
        confirmLabel="Usuń ćwiczenie"
        destructive
        busy={deleting}
        onConfirm={remove}
      />
    </>
  );
}

export function ExerciseDetailPage() {
  const { exerciseId } = useParams();
  const library = useExerciseLibrary();

  if (library.status === 'loading') {
    return <LoadingState label="Wczytywanie ćwiczenia…" />;
  }
  if (library.status === 'error') {
    return <ErrorAlert title="Nie udało się wczytać ćwiczenia">{library.message}</ErrorAlert>;
  }

  const exercise = library.exercises.find((candidate) => candidate.id === exerciseId);

  return (
    <>
      <BackLink to={EXERCISE_PATHS.list}>Biblioteka ćwiczeń</BackLink>
      {exercise === undefined ? (
        <EmptyState
          icon={Compass}
          title="Nie znaleziono ćwiczenia"
          description="To ćwiczenie nie istnieje albo zostało usunięte."
          action={
            <Link to={EXERCISE_PATHS.list} className={buttonStyles()}>
              Wróć do biblioteki
            </Link>
          }
        />
      ) : (
        <ExerciseDetails key={exercise.id} exercise={exercise} />
      )}
    </>
  );
}
