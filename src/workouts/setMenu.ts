import { CircleSlash, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import type { SessionRepository } from '@/db';
import type { SessionSet } from '@/shared/domain';
import { ignoreRejection, type RunSave } from '@/shared/lib/useSaveGuard';
import type { ActionMenuItem } from '@/shared/ui/ActionMenu';

/** Menu entries for the less common things one can do with a set. */
export function setMenuItems(
  set: SessionSet,
  canRemove: boolean,
  repository: SessionRepository,
  run: RunSave,
): ActionMenuItem[] {
  const status = (next: SessionSet['status']) => () =>
    ignoreRejection(run(repository.setSetStatus(set.id, next)));
  return [
    {
      label: 'Oznacz jako nieudaną',
      icon: CircleSlash,
      disabled: set.status === 'failed',
      onSelect: status('failed'),
    },
    {
      label: 'Pomiń serię',
      icon: SkipForward,
      disabled: set.status === 'skipped',
      onSelect: status('skipped'),
    },
    {
      label: 'Cofnij do oczekującej',
      icon: RotateCcw,
      disabled: set.status === 'pending',
      onSelect: status('pending'),
    },
    {
      label: 'Usuń serię',
      icon: Trash2,
      destructive: true,
      disabled: !canRemove,
      onSelect: () => ignoreRejection(run(repository.removeSet(set.id))),
    },
  ];
}
