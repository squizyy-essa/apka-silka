import { Plus, SearchX } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ROUTE_PATHS } from '@/app/navigation';
import {
  equipmentTypeSchema,
  exerciseCategorySchema,
  muscleGroupSchema,
  type Exercise,
} from '@/shared/domain';
import { BackLink } from '@/shared/ui/BackLink';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { SelectField, TextField } from '@/shared/ui/fields';
import { PageHeader } from '@/shared/ui/PageHeader';
import { EmptyState, ErrorAlert, LoadingState } from '@/shared/ui/states';
import { ExerciseThumbnail } from './ExerciseThumbnail';
import {
  CATEGORY_OPTIONS,
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  MUSCLE_LABELS,
  MUSCLE_OPTIONS,
} from './labels';
import { EXERCISE_PATHS } from './paths';
import { filterExercises, hasActiveFilters, type ExerciseFilters } from './search';
import { useExerciseLibrary, useRecentlyUsedExerciseIds } from './useExerciseLibrary';

/** Filters live in the address, so Back, reload and shared links keep them. */
const PARAM = { query: 'q', muscle: 'partia', equipment: 'sprzet', category: 'kategoria' } as const;

function filtersFromParams(params: URLSearchParams): ExerciseFilters {
  const muscle = muscleGroupSchema.safeParse(params.get(PARAM.muscle));
  const equipment = equipmentTypeSchema.safeParse(params.get(PARAM.equipment));
  const category = exerciseCategorySchema.safeParse(params.get(PARAM.category));
  return {
    query: params.get(PARAM.query) ?? '',
    muscle: muscle.success ? muscle.data : undefined,
    equipment: equipment.success ? equipment.data : undefined,
    category: category.success ? category.data : undefined,
  };
}

function ExerciseRow({ exercise }: { readonly exercise: Exercise }) {
  return (
    <li>
      <Link
        to={EXERCISE_PATHS.detail(exercise.id)}
        className="flex min-h-16 items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-surface-muted"
      >
        <ExerciseThumbnail imageId={exercise.imageId} className="size-12" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{exercise.name}</span>
          <span className="block text-sm text-muted-foreground">
            {MUSCLE_LABELS[exercise.primaryMuscle]} · {EQUIPMENT_LABELS[exercise.equipment]}
          </span>
        </span>
        {exercise.isCustom && <Badge tone="accent">Własne</Badge>}
      </Link>
    </li>
  );
}

function ExerciseList({
  exercises,
  label,
}: {
  readonly exercises: readonly Exercise[];
  readonly label: string;
}) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface shadow-card"
    >
      {exercises.map((exercise) => (
        <ExerciseRow key={exercise.id} exercise={exercise} />
      ))}
    </ul>
  );
}

export function ExerciseListPage() {
  const library = useExerciseLibrary();
  const recentIds = useRecentlyUsedExerciseIds(5);
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const filtering = hasActiveFilters(filters);

  const setParam = (name: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === '') {
          next.delete(name);
        } else {
          next.set(name, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  const results = useMemo(
    () => (library.status === 'ready' ? filterExercises(library.exercises, filters) : []),
    [library, filters],
  );

  const recent = useMemo(() => {
    if (library.status !== 'ready') {
      return [];
    }
    const byId = new Map(library.exercises.map((exercise) => [exercise.id, exercise]));
    return recentIds.flatMap((id) => byId.get(id) ?? []);
  }, [library, recentIds]);

  return (
    <>
      <BackLink to={ROUTE_PATHS.plans}>Plany</BackLink>
      <PageHeader
        title="Biblioteka ćwiczeń"
        action={
          <Link to={EXERCISE_PATHS.create} className={buttonStyles()}>
            <Plus className="size-4" aria-hidden="true" />
            Dodaj ćwiczenie
          </Link>
        }
      />

      <form
        role="search"
        aria-label="Wyszukiwanie ćwiczeń"
        className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <TextField
          label="Szukaj po nazwie"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="np. wyciskanie"
          className="col-span-2 sm:col-span-3"
          value={filters.query}
          onChange={(event) => setParam(PARAM.query, event.target.value)}
        />
        <SelectField
          label="Partia mięśniowa"
          emptyOption="Wszystkie"
          options={MUSCLE_OPTIONS}
          value={filters.muscle ?? ''}
          onChange={(event) => setParam(PARAM.muscle, event.target.value)}
        />
        <SelectField
          label="Sprzęt"
          emptyOption="Każdy"
          options={EQUIPMENT_OPTIONS}
          value={filters.equipment ?? ''}
          onChange={(event) => setParam(PARAM.equipment, event.target.value)}
        />
        <SelectField
          label="Kategoria"
          className="col-span-2 sm:col-span-1"
          emptyOption="Wszystkie"
          options={CATEGORY_OPTIONS}
          value={filters.category ?? ''}
          onChange={(event) => setParam(PARAM.category, event.target.value)}
        />
      </form>

      {library.status === 'loading' && <LoadingState label="Wczytywanie ćwiczeń…" />}

      {library.status === 'error' && (
        <ErrorAlert title="Nie udało się wczytać biblioteki ćwiczeń">{library.message}</ErrorAlert>
      )}

      {library.status === 'ready' && (
        <>
          {!filtering && recent.length > 0 && (
            <section aria-labelledby="recent-heading" className="mb-5">
              <h2 id="recent-heading" className="mb-2 text-sm font-semibold text-foreground">
                Ostatnio używane
              </h2>
              <ExerciseList exercises={recent} label="Ostatnio używane ćwiczenia" />
            </section>
          )}

          <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted-foreground">
              {filtering ? 'Znalezione ćwiczenia' : 'Wszystkie ćwiczenia'}: {results.length}
            </p>
            {filtering && (
              <Button variant="ghost" onClick={() => setParams({}, { replace: true })}>
                Wyczyść filtry
              </Button>
            )}
          </div>

          {results.length > 0 ? (
            <ExerciseList exercises={results} label="Ćwiczenia" />
          ) : (
            <EmptyState
              icon={SearchX}
              title="Brak ćwiczeń spełniających kryteria"
              description="Zmień wyszukiwaną nazwę lub filtry albo dodaj własne ćwiczenie."
              action={
                <Link to={EXERCISE_PATHS.create} className={buttonStyles({ variant: 'secondary' })}>
                  Dodaj ćwiczenie
                </Link>
              }
            />
          )}
        </>
      )}
    </>
  );
}
