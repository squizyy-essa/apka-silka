import { z } from 'zod';
import {
  equipmentTypeSchema,
  exerciseCategorySchema,
  measurementTypeSchema,
  muscleGroupSchema,
  type Exercise,
} from '@/shared/domain';

/** Validation of the "own exercise" form, with messages for the user. */
export const exerciseFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Podaj nazwę ćwiczenia.')
    .max(120, 'Nazwa może mieć najwyżej 120 znaków.'),
  description: z.string().max(4000, 'Opis może mieć najwyżej 4000 znaków.'),
  category: z.enum(exerciseCategorySchema.options, { error: 'Wybierz kategorię.' }),
  primaryMuscle: z.enum(muscleGroupSchema.options, { error: 'Wybierz główną partię mięśniową.' }),
  secondaryMuscles: z.array(muscleGroupSchema),
  equipment: z.enum(equipmentTypeSchema.options, { error: 'Wybierz rodzaj sprzętu.' }),
  measurementType: z.enum(measurementTypeSchema.options, { error: 'Wybierz rodzaj pomiaru.' }),
});

export type ExerciseFormInput = z.input<typeof exerciseFormSchema>;
export type ExerciseFormValues = z.output<typeof exerciseFormSchema>;

/**
 * Starting values. A new exercise has no muscle/equipment preselected, so a
 * wrong default cannot be saved by accident.
 */
export function formDefaults(exercise?: Exercise): Partial<ExerciseFormInput> {
  if (exercise === undefined) {
    return {
      name: '',
      description: '',
      secondaryMuscles: [],
      measurementType: 'weight_reps',
    };
  }
  return {
    name: exercise.name,
    description: exercise.description ?? '',
    category: exercise.category,
    primaryMuscle: exercise.primaryMuscle,
    secondaryMuscles: exercise.secondaryMuscles,
    equipment: exercise.equipment,
    measurementType: exercise.measurementType,
  };
}
