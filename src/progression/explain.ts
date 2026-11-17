import { formatNumber } from '@/shared/lib/numberInput';
import { plural } from '@/shared/lib/plural';
import type {
  AssessedSet,
  BetweenSessionsRecommendation,
  EvaluatedAssessment,
  NotEvaluatedReason,
} from './betweenSessions';
import type { FailedSetAdvice, FailedSetFacts, FailedSetOption } from './failedSet';

/**
 * Polish wording of progression suggestions. Every suggestion states the
 * numbers it is based on, so the user can judge it (spec §9: "wyjaśnialne").
 */

export interface SuggestionText {
  readonly title: string;
  readonly reason: string;
}

/** Shown with every suggestion, so simple rules are not mistaken for a guarantee. */
export const SUGGESTION_DISCLAIMER =
  'To proste reguły oparte na zapisanych wynikach, a nie model zmęczenia. Sugestia nie ' +
  'gwarantuje wyniku i nic nie zmieni się bez Twojej decyzji.';

const kg = (value: number) => `${formatNumber(value)} kg`;
const reps = (count: number) => `${count} ${plural(count, 'powtórzenie', 'powtórzenia', 'powtórzeń')}`;
/** "w 1 serii", "w 3 seriach". */
const inSets = (count: number) => `w ${count} ${count === 1 ? 'serii' : 'seriach'}`;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The value shared by every item, or undefined when they differ. */
function common<T>(values: readonly T[]): T | undefined {
  const [first] = values;
  return values.every((value) => value === first) ? first : undefined;
}

const NOT_EVALUATED: Readonly<Record<NotEvaluatedReason, string>> = {
  skipped: 'Ćwiczenie zostało pominięte, więc nie ma czego ocenić.',
  unsupported_measurement:
    'Sugestie progresji dotyczą ćwiczeń na ciężar i powtórzenia. Ćwiczeń na czas i dystans ' +
    'aplikacja nie ocenia.',
  no_working_sets: 'Brak serii roboczych – serie rozgrzewkowe nie są brane pod uwagę.',
  no_rep_target:
    'Nie wszystkie serie robocze mają cel powtórzeń, więc nie da się ocenić, czy cel został ' +
    'osiągnięty.',
  no_results: 'Żadna seria robocza nie została wykonana.',
  missing_results: 'Brakuje zapisanego wyniku (ciężaru lub powtórzeń) w wykonanej serii.',
};

/** "osiągnąłeś 12 powtórzeń" / "osiągnąłeś górną granicę zakresu powtórzeń". */
function repsAchieved(sets: readonly AssessedSet[]): string {
  const done = common(sets.map((set) => set.reps));
  if (done !== undefined) {
    return `osiągnąłeś ${reps(done)}`;
  }
  const top = common(sets.map((set) => set.repsTop));
  return top === undefined
    ? 'osiągnąłeś górną granicę zakresu powtórzeń'
    : `osiągnąłeś co najmniej ${reps(top)}`;
}

/** " przy RIR 2" / " przy RIR co najmniej 2" / "" when no set has a RIR target. */
function rirAchieved(sets: readonly AssessedSet[]): string {
  const withTarget = sets.filter((set) => set.targetRIR !== undefined);
  const recorded = withTarget.flatMap((set) => (set.actualRIR === undefined ? [] : [set.actualRIR]));
  if (withTarget.length === 0 || recorded.length === 0) {
    return '';
  }
  const same = common(recorded);
  return same === undefined
    ? ` przy RIR co najmniej ${formatNumber(Math.min(...recorded))}`
    : ` przy RIR ${formatNumber(same)}`;
}

function repsList(assessment: EvaluatedAssessment): string {
  return assessment.doneSets.map((set) => String(set.reps ?? '–')).join(', ');
}

/** " przy 60 kg" when every performed working set used the same load. */
function atWeight(assessment: EvaluatedAssessment): string {
  if (assessment.bodyweightOnly) {
    return '';
  }
  const weight = common(assessment.doneSets.map((set) => set.weightKg));
  return weight === undefined ? '' : ` przy ${kg(weight)}`;
}

export function describeRecommendation(
  recommendation: BetweenSessionsRecommendation,
): SuggestionText {
  if (recommendation.kind === 'not_evaluated') {
    return { title: 'Brak sugestii', reason: NOT_EVALUATED[recommendation.reason] };
  }
  const { assessment } = recommendation;
  const done = assessment.doneSets;
  const working = assessment.workingSets;

  switch (recommendation.kind) {
    case 'increase_weight': {
      const achieved = `${capitalize(inSets(done.length))} ${repsAchieved(done)}${rirAchieved(done)}.`;
      if (assessment.bodyweightOnly) {
        return {
          title: 'Zwiększ trudność',
          reason:
            `${achieved} Możesz dodać obciążenie ${kg(recommendation.incrementKg)} ` +
            'albo podnieść cel powtórzeń.',
        };
      }
      const from = common(recommendation.changes.map((change) => change.fromKg));
      const to = common(recommendation.changes.map((change) => change.toKg));
      return {
        title: 'Zwiększ ciężar',
        reason:
          from !== undefined && to !== undefined
            ? `${achieved} Możesz spróbować zwiększyć ciężar z ${formatNumber(from)} do ${kg(to)}.`
            : `${achieved} Możesz spróbować zwiększyć ciężar w każdej serii o ` +
              `${kg(recommendation.incrementKg)}.`,
      };
    }
    case 'increase_reps': {
      const top = common(working.map((set) => set.repsTop));
      const goal =
        top === undefined ? 'górną granicę zakresu' : reps(top);
      return {
        title: 'Spróbuj zwiększyć powtórzenia',
        reason:
          `Wykonane powtórzenia${atWeight(assessment)}: ${repsList(assessment)}. Ciężar ` +
          `zwiększysz, gdy osiągniesz ${goal} we wszystkich seriach roboczych` +
          `${rirTargetNote(working)}.`,
      };
    }
    case 'hold':
      return { title: 'Utrzymaj obecne parametry', reason: holdReason(recommendation.reason, assessment) };
    case 'consider_decrease':
      return {
        title: 'Rozważ zmniejszenie ciężaru',
        reason:
          `W ${recommendation.missedSessions} ostatnich treningach z rzędu przy ` +
          `${kg(recommendation.fromKg)} nie osiągnąłeś celu powtórzeń. Możesz rozważyć ` +
          `zmniejszenie ciężaru do ${kg(recommendation.toKg)}. Plan nie zmieni się bez Twojej zgody.`,
      };
  }
}

function rirTargetNote(sets: readonly AssessedSet[]): string {
  const target = common(sets.map((set) => set.targetRIR));
  return target === undefined ? '' : ` przy RIR co najmniej ${formatNumber(target)}`;
}

function holdReason(
  reason: 'incomplete' | 'rir_missing' | 'rir_below_target' | 'missed',
  assessment: EvaluatedAssessment,
): string {
  const done = assessment.doneSets;
  switch (reason) {
    case 'incomplete':
      return (
        `Wykonano ${done.length} z ${assessment.workingSets.length} serii roboczych. Seria ` +
        'pominięta lub niewykonana nie liczy się jako udana, więc ciężar zostaje bez zmian.'
      );
    case 'rir_missing':
      return (
        `${capitalize(inSets(done.length))} ${repsAchieved(done)}, ale nie we wszystkich ` +
        'seriach z docelowym RIR wpisano RIR, więc nie da się potwierdzić celu. Następnym ' +
        'razem wpisz RIR – wtedy aplikacja oceni, czy można zwiększyć ciężar.'
      );
    case 'rir_below_target': {
      const below = done.filter(
        (set) =>
          set.targetRIR !== undefined && set.actualRIR !== undefined && set.actualRIR < set.targetRIR,
      );
      const target = common(below.map((set) => set.targetRIR));
      const actual = common(below.map((set) => set.actualRIR));
      const detail =
        target !== undefined && actual !== undefined
          ? ` (RIR ${formatNumber(actual)} zamiast ${formatNumber(target)})`
          : '';
      return (
        `${capitalize(repsAchieved(done))}, ale z mniejszym zapasem niż zakładany${detail}. ` +
        'Utrzymaj ciężar, aż osiągniesz cel przy docelowym RIR.'
      );
    }
    case 'missed': {
      const failed = done.filter((set) => set.status === 'failed').length;
      const short = done.filter(
        (set) => set.status !== 'failed' && set.reps !== undefined && set.reps < set.repsBottom,
      ).length;
      const parts = [
        failed > 0 ? `${failed} ${plural(failed, 'seria nieudana', 'serie nieudane', 'serii nieudanych')}` : '',
        short > 0 ? `${short} ${plural(short, 'seria', 'serie', 'serii')} poniżej dolnej granicy zakresu` : '',
      ].filter((part) => part !== '');
      return (
        `W tym treningu: ${parts.join(', ')} (powtórzenia${atWeight(assessment)}: ` +
        `${repsList(assessment)}). Utrzymaj parametry i spróbuj ponownie w kolejnym treningu.`
      );
    }
  }
}

// ------------------------------------------------------------ failed set

/** "Plan: 60 kg × 12. Wykonano: 60 kg × 9 (3 powtórzenia mniej)." */
export function describeFailedSet(facts: FailedSetFacts): string {
  const weight = facts.weightKg === undefined || facts.weightKg === 0 ? '' : `${kg(facts.weightKg)} × `;
  const planned =
    facts.plannedRepsMin === undefined && facts.plannedRepsMax === undefined
      ? undefined
      : facts.plannedRepsMin === facts.plannedRepsMax || facts.plannedRepsMax === undefined
        ? String(facts.plannedRepsMin)
        : facts.plannedRepsMin === undefined
          ? String(facts.plannedRepsMax)
          : `${facts.plannedRepsMin}–${facts.plannedRepsMax}`;
  const parts: string[] = [];
  if (planned !== undefined) {
    parts.push(`Plan: ${weight}${planned}.`);
  }
  if (facts.actualReps === undefined) {
    parts.push('Nie wpisano liczby wykonanych powtórzeń.');
  } else {
    const short = facts.repsShort === undefined ? '' : ` (${reps(facts.repsShort)} mniej)`;
    parts.push(`Wykonano: ${weight}${facts.actualReps}${short}.`);
  }
  if (facts.actualRIR !== undefined && facts.actualRIR > 0) {
    parts.push(
      `Zapas: RIR ${formatNumber(facts.actualRIR)} – możliwe, że seria nie skończyła się na ` +
        'granicy możliwości.',
    );
  }
  if (facts.repeatedInSession) {
    parts.push('To kolejna nieudana seria przy tym ciężarze w tym treningu.');
  }
  return parts.join(' ');
}

export function describeFailedSetOption(
  option: FailedSetOption,
  facts: FailedSetFacts,
): SuggestionText {
  if (option.kind === 'lower_weight') {
    const target =
      option.repsMax === undefined && option.repsMin === undefined
        ? 'Cel powtórzeń bez zmian.'
        : `Cel powtórzeń bez zmian (${
            option.repsMin === option.repsMax || option.repsMax === undefined
              ? String(option.repsMin)
              : option.repsMin === undefined
                ? String(option.repsMax)
                : `${option.repsMin}–${option.repsMax}`
          }).`;
    return {
      title: `Zmniejsz ciężar do ${kg(option.weightKg)}`,
      reason: `${target} Obniżka o jeden skok progresji (${kg(facts.incrementKg)}).`,
    };
  }
  return {
    title:
      option.weightKg === undefined
        ? `Cel ${reps(option.reps)}`
        : `Zostań przy ${kg(option.weightKg)}, cel ${reps(option.reps)}`,
    reason: `Punktem odniesienia jest wynik tej serii (${reps(option.reps)}).`,
  };
}

export function describeFailedSetAdvice(advice: FailedSetAdvice): string {
  switch (advice.kind) {
    case 'not_applicable':
      return '';
    case 'insufficient_data':
      return (
        `${describeFailedSet(advice.facts)} Za mało danych na sugestię – wpisz ciężar i ` +
        'liczbę wykonanych powtórzeń.'
      );
    case 'options': {
      const cautious = advice.cautious
        ? ' Bez liczby wykonanych powtórzeń możliwa jest tylko ostrożna sugestia ciężaru.'
        : '';
      const target =
        advice.targetSetId === undefined
          ? ' Nie ma już kolejnej serii roboczej tego ćwiczenia, do której można ją zastosować.'
          : '';
      return `${describeFailedSet(advice.facts)}${cautious}${target}`;
    }
  }
}
