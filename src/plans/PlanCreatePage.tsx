import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { useRepositories } from '@/app/repositoriesContext';
import { scheduleModeSchema } from '@/shared/domain';
import { BackLink } from '@/shared/ui/BackLink';
import { Button } from '@/shared/ui/Button';
import { buttonStyles } from '@/shared/ui/buttonStyles';
import { Card } from '@/shared/ui/Card';
import { TextAreaField, TextField } from '@/shared/ui/fields';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ErrorAlert } from '@/shared/ui/states';
import { PLAN_PATHS } from './paths';
import { planErrorMessage } from './saveErrors';

const planFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Podaj nazwę planu.')
    .max(120, 'Nazwa może mieć najwyżej 120 znaków.'),
  description: z.string().max(2000, 'Opis może mieć najwyżej 2000 znaków.'),
  scheduleMode: scheduleModeSchema,
});
type PlanFormValues = z.infer<typeof planFormSchema>;

const MODE_CHOICES = [
  {
    value: 'fixed',
    label: 'Stałe dni tygodnia',
    description: 'Każdy trening ma swój dzień, np. poniedziałek: Push, środa: Pull.',
  },
  {
    value: 'flexible',
    label: 'Elastyczny',
    description: 'Treningi A, B, C wykonujesz po kolei, niezależnie od dnia tygodnia.',
  },
] as const;

export function PlanCreatePage() {
  const { plans: repository } = useRepositories();
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues: { name: '', description: '', scheduleMode: 'fixed' },
  });

  const create = async (values: PlanFormValues) => {
    setSaveError(null);
    try {
      const plan = await repository.createPlan(values);
      await navigate(PLAN_PATHS.plan(plan.id), { replace: true });
    } catch (error) {
      setSaveError(planErrorMessage(error));
    }
  };

  return (
    <>
      <BackLink to={PLAN_PATHS.list}>Plany</BackLink>
      <PageHeader title="Nowy plan" />
      <form noValidate aria-label="Nowy plan" onSubmit={(event) => void handleSubmit(create)(event)}>
        <Card className="space-y-5">
          <TextField
            label="Nazwa planu"
            autoComplete="off"
            maxLength={120}
            placeholder="np. Push Pull Legs"
            error={errors.name?.message}
            {...register('name')}
          />
          <TextAreaField
            label="Opis (opcjonalnie)"
            maxLength={2000}
            error={errors.description?.message}
            {...register('description')}
          />
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-foreground">
              Organizacja treningów
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODE_CHOICES.map((choice) => (
                <label
                  key={choice.value}
                  className="flex min-h-16 cursor-pointer items-start gap-3 rounded-control border border-border-strong bg-surface p-3 has-checked:border-primary has-checked:bg-primary-soft"
                >
                  <input
                    type="radio"
                    value={choice.value}
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                    {...register('scheduleMode')}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">
                      {choice.label}
                    </span>
                    <span className="block text-sm text-muted-foreground">{choice.description}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Możesz to później zmienić.</p>
          </fieldset>
        </Card>

        {saveError !== null && (
          <ErrorAlert title="Nie udało się utworzyć planu" className="mt-4">
            {saveError}
          </ErrorAlert>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="submit" loading={isSubmitting}>
            Utwórz plan
          </Button>
          <Link to={PLAN_PATHS.list} className={buttonStyles({ variant: 'secondary' })}>
            Anuluj
          </Link>
        </div>
      </form>
    </>
  );
}
