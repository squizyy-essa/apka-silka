import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Form fields with a visible label, optional hint and an error message that
 * is linked to the control for screen readers. Text is 16 px so iOS does not
 * zoom the page when a field gets focus.
 */

const controlClass = cn(
  'w-full rounded-control border border-border-strong bg-surface px-3 text-base text-foreground',
  'placeholder:text-muted-foreground',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'aria-invalid:border-danger',
);

interface FieldShellProps {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

function FieldShell({ id, label, hint, error, className, children }: FieldShellProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
      {hint !== undefined && error === undefined && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint: string | undefined, error: string | undefined) {
  if (error !== undefined) {
    return `${id}-error`;
  }
  return hint !== undefined ? `${id}-hint` : undefined;
}

interface CommonFieldProps {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  /** Class for the wrapper (layout); the control itself is always full width. */
  readonly className?: string | undefined;
}

export type TextFieldProps = CommonFieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'>;

export function TextField({ label, hint, error, className, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <input
        id={id}
        className={cn(controlClass, 'min-h-11 min-w-0 max-w-full appearance-none text-left')}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
    </FieldShell>
  );
}

export type TextAreaFieldProps = CommonFieldProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'>;

export function TextAreaField({ label, hint, error, className, ...textarea }: TextAreaFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        rows={4}
        className={cn(controlClass, 'py-2.5')}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...textarea}
      />
    </FieldShell>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export type SelectFieldProps = CommonFieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'id' | 'children'> & {
    readonly options: readonly SelectOption[];
    /** Shown as the first, empty choice (e.g. "Wybierz…" or "Wszystkie"). */
    readonly emptyOption?: string;
  };

/** Native select: the system picker is the most comfortable choice on phones. */
export function SelectField({
  label,
  hint,
  error,
  className,
  options,
  emptyOption,
  ...select
}: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={className}>
      <select
        id={id}
        className={cn(controlClass, 'min-h-11 pr-8')}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {emptyOption !== undefined && <option value="">{emptyOption}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
