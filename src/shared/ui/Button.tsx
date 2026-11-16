import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const buttonStyles = cva(
  [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4',
    'text-sm font-semibold select-none',
    'transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-55',
    'aria-busy:cursor-progress',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground enabled:hover:bg-primary-hover enabled:active:bg-primary-hover',
        secondary:
          'border border-border bg-surface text-foreground enabled:hover:bg-surface-muted enabled:active:bg-surface-muted',
        ghost: 'text-foreground enabled:hover:bg-surface-muted enabled:active:bg-surface-muted',
        danger: 'bg-danger text-surface enabled:hover:opacity-90 enabled:active:opacity-90',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', fullWidth: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  /** Shows a spinner and blocks clicks while an action is in progress. */
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant,
  fullWidth,
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonStyles({ variant, fullWidth }), className)}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
