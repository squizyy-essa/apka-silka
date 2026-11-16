import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { ReactNode } from 'react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  readonly destructive?: boolean;
  /** While true the dialog stays open, the confirm button shows progress. */
  readonly busy?: boolean;
  readonly onConfirm: () => void;
}

/**
 * Modal question before an action that cannot be undone. Focus is trapped,
 * Escape cancels, and the safe choice (cancel) gets focus first.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Anuluj',
  destructive = false,
  busy = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-foreground/50" />
        <AlertDialog.Content className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-card border border-border bg-surface p-5 shadow-raised sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2">
          <AlertDialog.Title className="text-lg font-semibold text-foreground">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              loading={busy}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
