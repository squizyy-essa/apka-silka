import * as RadioGroup from '@radix-ui/react-radio-group';
import { cn } from '@/shared/lib/cn';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedControlProps<T extends string> {
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onValueChange: (value: T) => void;
  /** Id of the element that labels the group. */
  readonly 'aria-labelledby': string;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * Single-choice switch for a few short options. Built on a radio group, so
 * arrow keys move between options and screen readers announce the choice.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onValueChange,
  disabled = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const select = (next: string) => {
    const option = options.find((candidate) => candidate.value === next);
    if (option) {
      onValueChange(option.value);
    }
  };

  return (
    <RadioGroup.Root
      value={value}
      onValueChange={select}
      disabled={disabled}
      orientation="horizontal"
      aria-labelledby={aria['aria-labelledby']}
      className={cn(
        'grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-surface-muted p-1',
        className,
      )}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'min-h-11 rounded-[0.5rem] px-2 text-sm font-medium text-muted-foreground',
            'transition-colors duration-150',
            'hover:text-foreground',
            'data-[state=checked]:bg-surface data-[state=checked]:font-semibold',
            'data-[state=checked]:text-foreground data-[state=checked]:shadow-card',
            'disabled:cursor-not-allowed disabled:opacity-55',
          )}
        >
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
