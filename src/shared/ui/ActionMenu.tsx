import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { EllipsisVertical, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { IconButton } from './IconButton';

export interface ActionMenuItem {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}

export interface ActionMenuProps {
  /** Accessible name of the trigger, e.g. "Więcej działań: Push". */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
}

/** "More actions" menu; keyboard accessible (arrows, Enter, Escape). */
export function ActionMenu({ label, items }: ActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={label}>
          <EllipsisVertical className="size-5" aria-hidden="true" />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="z-50 min-w-56 rounded-control border border-border bg-surface p-1 shadow-raised"
        >
          {items.map(({ label: itemLabel, icon: Icon, onSelect, disabled, destructive }) => (
            <DropdownMenu.Item
              key={itemLabel}
              disabled={disabled ?? false}
              onSelect={onSelect}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-3 rounded-[0.5rem] px-3 text-sm font-medium outline-none select-none',
                'data-[highlighted]:bg-surface-muted',
                'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
                destructive === true ? 'text-danger' : 'text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {itemLabel}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
