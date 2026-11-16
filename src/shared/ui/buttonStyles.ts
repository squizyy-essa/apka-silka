import { cva } from 'class-variance-authority';

/** Shared look of buttons and of links that act as buttons. */
export const buttonStyles = cva(
  [
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4',
    'text-sm font-semibold select-none',
    'transition-colors duration-150',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55',
    'aria-busy:cursor-progress',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover',
        secondary:
          'border border-border-strong bg-surface text-foreground hover:bg-surface-muted active:bg-surface-muted',
        ghost: 'text-foreground hover:bg-surface-muted active:bg-surface-muted',
        danger: 'bg-danger text-surface hover:opacity-90 active:opacity-90',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: { variant: 'primary', fullWidth: false },
  },
);
