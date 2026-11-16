import { zodResolver } from '@hookform/resolvers/zod';
import { Compass, ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { useRepositories } from '@/app/repositoriesContext';
import {
  ExerciseRuleError,
  storageErrorMessage,
  toStorageError,
  type ExerciseImageChange,
} from '@/db';
import type { Exercise } from '@/shared/domain';
import { BackLink } from '@/shared/ui/BackLink';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card } from '@/shared/ui/Card';
import { SelectField, TextAreaField, TextField } from '@/shared/ui/fields';
import { PageHeader } from '@/shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import {
  exerciseFormSchema,
  formDefaults,
  type ExerciseFormInput,
  type ExerciseFormValues,
} from './exerciseForm';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import { imageProblemMessage, ImageProcessingError, prepareExerciseImage } from './image';
import {
  CATEGORY_OPTIONS,
  EQUIPMENT_OPTIONS,
  MEASUREMENT_OPTIONS,
  MUSCLE_OPTIONS,
} from './labels';
import { EXERCISE_PATHS } from './paths';
import { useExerciseLibrary } from './useExerciseLibrary';

type PendingImage =
  | { readonly kind: 'keep' }
  | { readonly kind: 'remove' }
  | { readonly kind: 'replace'; readonly blob: Blob; readonly previewUrl: string };

function saveErrorMessage(error: unknown): string {
  if (error instanceof ExerciseRuleError) {
    return error.violation === 'not-found'
      ? 'To ćwiczenie zostało w międzyczasie usunięte.'
      : 'Ćwiczeń z gotowej biblioteki nie można edytować.';
  }
  return storageErrorMessage(toStorageError(error).kind);
}

function ImagePicker({
  storedImageId,
  pending,
  onChange,
  disabled,
}: {
  readonly storedImageId: string | undefined;
  readonly pending: PendingImage;
  readonly onChange: (next: PendingImage) => void;
  readonly disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const choose = (file: File | undefined) => {
    if (!file) {
      return;
    }
    setProblem(null);
    setProcessing(true);
    prepareExerciseImage(file)
      .then(
        (blob) => onChange({ kind: 'replace', blob, previewUrl: URL.createObjectURL(blob) }),
        (error: unknown) =>
          setProblem(
            imageProblemMessage(
              error instanceof ImageProcessingError ? error.problem : 'cannot-read',
            ),
          ),
      )
      .finally(() => {
        setProcessing(false);
        if (inputRef.current) {
          inputRef.current.value = ''; // allows choosing the same file again
        }
      });
  };

  const hasImage =
    pending.kind === 'replace' || (pending.kind === 'keep' && storedImageId !== undefined);

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-semibold text-foreground">
        Ilustracja (opcjonalnie)
      </legend>
      <div className="flex flex-wrap items-center gap-4">
        {pending.kind === 'replace' ? (
          <img
            src={pending.previewUrl}
            alt="Podgląd wybranej ilustracji"
            className="size-24 shrink-0 rounded-control object-cover"
          />
        ) : (
          <ExerciseThumbnail
            imageId={pending.kind === 'keep' ? storedImageId : undefined}
            alt={pending.kind === 'keep' && storedImageId !== undefined ? 'Obecna ilustracja' : ''}
            className="size-24"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label="Plik ilustracji"
            disabled={disabled}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <Button
            variant="secondary"
            icon={<ImagePlus className="size-4" aria-hidden="true" />}
            loading={processing}
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            {hasImage ? 'Zmień ilustrację' : 'Wybierz ilustrację'}
          </Button>
          {hasImage && (
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" aria-hidden="true" />}
              disabled={disabled || processing}
              onClick={() => {
                setProblem(null);
                onChange({ kind: 'remove' });
              }}
            >
              Usuń ilustrację
            </Button>
          )}
        </div>
      </div>
      {problem !== null ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {problem}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Obraz zostanie zmniejszony i zapisany tylko na tym urządzeniu. Używaj własnych zdjęć lub
          grafik, do których masz prawa.
        </p>
      )}
    </fieldset>
  );
}

function ExerciseForm({ exercise }: { readonly exercise?: Exercise }) {
  const { exercises: repository } = useRepositories();
  const navigate = useNavigate();
  const [image, setImage] = useState<PendingImage>({ kind: 'keep' });
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExerciseFormInput, unknown, ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: formDefaults(exercise),
  });

  // Release the preview of a picture that was replaced or abandoned.
  useEffect(() => {
    if (image.kind !== 'replace') {
      return;
    }
    const { previewUrl } = image;
    return () => URL.revokeObjectURL(previewUrl);
  }, [image]);

  const save = async (values: ExerciseFormValues) => {
    setSaveError(null);
    const imageChange: ExerciseImageChange =
      image.kind === 'replace' ? { kind: 'replace', blob: image.blob } : { kind: image.kind };
    try {
      const saved =
        exercise === undefined
          ? await repository.createCustom(values, imageChange)
          : await repository.updateCustom(exercise.id, values, imageChange);
      await navigate(EXERCISE_PATHS.detail(saved.id), { replace: true });
    } catch (error) {
      setSaveError(saveErrorMessage(error));
    }
  };

  const cancelTo = exercise === undefined ? EXERCISE_PATHS.list : EXERCISE_PATHS.detail(exercise.id);

  return (
    <form
      noValidate
      aria-label={exercise === undefined ? 'Nowe ćwiczenie' : 'Edycja ćwiczenia'}
      onSubmit={(event) => void handleSubmit(save)(event)}
    >
      <Card className="space-y-5">
        <TextField
          label="Nazwa"
          autoComplete="off"
          maxLength={120}
          error={errors.name?.message}
          {...register('name')}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Główna partia mięśniowa"
            emptyOption="Wybierz…"
            options={MUSCLE_OPTIONS}
            error={errors.primaryMuscle?.message}
            {...register('primaryMuscle')}
          />
          <SelectField
            label="Sprzęt"
            emptyOption="Wybierz…"
            options={EQUIPMENT_OPTIONS}
            error={errors.equipment?.message}
            {...register('equipment')}
          />
          <SelectField
            label="Kategoria"
            emptyOption="Wybierz…"
            options={CATEGORY_OPTIONS}
            error={errors.category?.message}
            {...register('category')}
          />
          <SelectField
            label="Rodzaj pomiaru"
            options={MEASUREMENT_OPTIONS}
            hint="Decyduje o tym, co zapisujesz w serii: ciężar, powtórzenia, czas lub dystans."
            error={errors.measurementType?.message}
            {...register('measurementType')}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold text-foreground">
            Dodatkowe partie mięśniowe (opcjonalnie)
          </legend>
          <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
            {MUSCLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-foreground"
              >
                <input
                  type="checkbox"
                  value={option.value}
                  className="size-5 shrink-0 accent-primary"
                  {...register('secondaryMuscles')}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <TextAreaField
          label="Opis wykonania (opcjonalnie)"
          maxLength={4000}
          error={errors.description?.message}
          {...register('description')}
        />

        <ImagePicker
          storedImageId={exercise?.imageId}
          pending={image}
          onChange={setImage}
          disabled={isSubmitting}
        />
      </Card>

      {saveError !== null && (
        <ErrorAlert title="Nie udało się zapisać ćwiczenia" className="mt-4">
          {saveError}
        </ErrorAlert>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" loading={isSubmitting}>
          {exercise === undefined ? 'Dodaj ćwiczenie' : 'Zapisz zmiany'}
        </Button>
        <Link to={cancelTo} className={buttonStyles({ variant: 'secondary' })}>
          Anuluj
        </Link>
      </div>
    </form>
  );
}

export function ExerciseCreatePage() {
  return (
    <>
      <BackLink to={EXERCISE_PATHS.list}>Biblioteka ćwiczeń</BackLink>
      <PageHeader title="Nowe ćwiczenie" />
      <ExerciseForm />
    </>
  );
}

export function ExerciseEditPage() {
  const { exerciseId } = useParams();
  const library = useExerciseLibrary();
  // The form starts from the exercise as it was when the screen opened.
  const [initial, setInitial] = useState<Exercise | null>(null);

  const current =
    library.status === 'ready'
      ? library.exercises.find((candidate) => candidate.id === exerciseId)
      : undefined;
  if (initial === null && current !== undefined) {
    setInitial(current);
  }

  if (library.status === 'loading') {
    return <LoadingState label="Wczytywanie ćwiczenia…" />;
  }
  if (library.status === 'error') {
    return <ErrorAlert title="Nie udało się wczytać ćwiczenia">{library.message}</ErrorAlert>;
  }

  const exercise = initial ?? current;
  const editable = exercise?.isCustom === true;

  return (
    <>
      <BackLink to={exercise ? EXERCISE_PATHS.detail(exercise.id) : EXERCISE_PATHS.list}>
        {exercise ? exercise.name : 'Biblioteka ćwiczeń'}
      </BackLink>
      {exercise !== undefined && editable ? (
        <>
          <PageHeader title="Edycja ćwiczenia" />
          <ExerciseForm key={exercise.id} exercise={exercise} />
        </>
      ) : (
        <EmptyState
          icon={Compass}
          title={exercise ? 'Tego ćwiczenia nie można edytować' : 'Nie znaleziono ćwiczenia'}
          description={
            exercise
              ? 'Ćwiczenia z gotowej biblioteki są tylko do odczytu. Możesz dodać własny wariant.'
              : 'To ćwiczenie nie istnieje albo zostało usunięte.'
          }
          action={
            <Link to={EXERCISE_PATHS.list} className={buttonStyles()}>
              Wróć do biblioteki
            </Link>
          }
        />
      )}
    </>
  );
}
