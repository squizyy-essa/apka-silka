import { useEffect, useEffectEvent, useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatNumber, parseNumberInput, type NumberRules } from '@/shared/lib/numberInput';

/**
 * Fields that save on their own: the value is committed when the field loses
 * focus (or on Enter), not on every keystroke. Until the saved value comes
 * back from the database the typed text stays visible; if saving fails the
 * field falls back to the stored value.
 */

type Commit<T> = (value: T) => Promise<unknown> | undefined;

const inputClass = cn(
  'min-h-11 w-full rounded-control border border-border-strong bg-surface px-2.5 text-base text-foreground',
  'placeholder:text-muted-foreground aria-invalid:border-danger',
  'disabled:cursor-not-allowed disabled:opacity-55',
);

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') {
    event.currentTarget.blur();
  }
}

/**
 * Saves a half-typed value when the app is sent to the background or the
 * page is being left. On a phone the user may switch apps without ever
 * leaving the field, and the system may then discard the page.
 */
function useCommitWhenHidden(editing: boolean, finish: () => void) {
  const onHide = useEffectEvent(finish);
  useEffect(() => {
    if (!editing) {
      return;
    }
    const listener = () => {
      if (document.visibilityState === 'hidden') {
        onHide();
      }
    };
    document.addEventListener('visibilitychange', listener);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', listener);
      window.removeEventListener('pagehide', onHide);
    };
  }, [editing]);
}

/** Text shown while editing / while a commit is on its way to the database. */
function useDraft(stored: unknown) {
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState<{ text: string; base: unknown } | null>(null);
  const pendingText = pending !== null && Object.is(pending.base, stored) ? pending.text : null;

  const commit = (text: string, save: () => Promise<unknown> | undefined) => {
    setDraft(null);
    setPending({ text, base: stored });
    const clear = () => setPending(null);
    // Success: the new stored value arrives and replaces the pending text.
    // Failure: drop the pending text so the field shows what is really stored.
    void Promise.resolve(save()).then(undefined, clear);
  };

  return { draft, setDraft, pendingText, commit };
}

export interface NumericFieldProps {
  readonly label: string;
  readonly value: number | undefined;
  /** `undefined` = the field was cleared ("no value", not zero). */
  readonly onCommit: Commit<number | undefined>;
  readonly rules?: NumberRules;
  /** An empty field is an error instead of "no value". */
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
}

/** Compact number field accepting "62,5" and "62.5". */
export function NumericField({
  label,
  value,
  onCommit,
  rules,
  required = false,
  placeholder = '–',
  className,
}: NumericFieldProps) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  const { draft, setDraft, pendingText, commit } = useDraft(value);

  const finish = () => {
    if (draft === null) {
      return;
    }
    const parsed = parseNumberInput(draft, rules);
    if (parsed.kind === 'invalid' || (parsed.kind === 'empty' && required)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const next = parsed.kind === 'value' ? parsed.value : undefined;
    if (next === value) {
      setDraft(null);
      return;
    }
    commit(formatNumber(next), () => onCommit(next));
  };
  useCommitWhenHidden(draft !== null, finish);

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={rules?.integer === true ? 'numeric' : 'decimal'}
        autoComplete="off"
        placeholder={placeholder}
        className={inputClass}
        value={draft ?? pendingText ?? formatNumber(value)}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setInvalid(false);
        }}
        onBlur={finish}
        onKeyDown={blurOnEnter}
      />
      {invalid && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">
          Błędna wartość
        </p>
      )}
    </div>
  );
}

export interface AutosaveTextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: Commit<string>;
  /** Shown instead of saving when the trimmed text is empty. */
  readonly requiredMessage?: string;
  readonly maxLength?: number;
  readonly multiline?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
}

export function AutosaveTextField({
  label,
  value,
  onCommit,
  requiredMessage,
  maxLength,
  multiline = false,
  placeholder,
  className,
}: AutosaveTextFieldProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const { draft, setDraft, pendingText, commit } = useDraft(value);

  const finish = () => {
    if (draft === null) {
      return;
    }
    const text = draft.trim();
    if (text === '' && requiredMessage !== undefined) {
      setError(requiredMessage);
      return;
    }
    setError(null);
    if (text === value) {
      setDraft(null);
      return;
    }
    commit(text, () => onCommit(text));
  };
  useCommitWhenHidden(draft !== null, finish);

  const shared = {
    id,
    maxLength,
    placeholder,
    value: draft ?? pendingText ?? value,
    'aria-invalid': error !== null || undefined,
    'aria-describedby': error !== null ? `${id}-error` : undefined,
    onBlur: finish,
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          rows={2}
          className={cn(inputClass, 'py-2.5')}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
        />
      ) : (
        <input
          {...shared}
          type="text"
          autoComplete="off"
          className={inputClass}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={blurOnEnter}
        />
      )}
      {error !== null && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
