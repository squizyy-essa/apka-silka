import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SortableListProps<T extends { id: string }> {
  readonly items: readonly T[];
  /** Name of an item for screen-reader announcements. */
  readonly itemName: (item: T) => string;
  /** Called once, after the drop, with the complete new order. */
  readonly onReorder: (orderedIds: string[], movedId: string) => void;
  /** `handle` is the drag grip; place it inside the row. */
  readonly renderItem: (item: T, handle: ReactNode, index: number) => ReactNode;
  readonly 'aria-label': string;
  readonly className?: string;
}

function SortableRow({
  id,
  name,
  children,
}: {
  readonly id: string;
  readonly name: string;
  readonly children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      aria-label={`Zmień kolejność: ${name}`}
      title="Przeciągnij, aby zmienić kolejność"
      // `touch-none`: a touch on the grip drags the row instead of scrolling the page.
      className="inline-flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-muted-foreground hover:bg-surface-muted hover:text-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-5" aria-hidden="true" />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-90 shadow-raised')}
    >
      {children(handle)}
    </li>
  );
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    'Aby zmienić kolejność, naciśnij spację lub Enter, przesuń strzałkami w górę i w dół, a następnie zatwierdź spacją lub Enterem. Escape anuluje.',
};

/**
 * Vertical list reordered by dragging the grip – with mouse, touch or
 * keyboard (focus the grip, Space, arrows, Space).
 */
export function SortableList<T extends { id: string }>({
  items,
  itemName,
  onReorder,
  renderItem,
  className,
  ...aria
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((item) => item.id);
  const nameOf = (id: string | number) => {
    const item = items.find((candidate) => candidate.id === id);
    return item ? itemName(item) : '';
  };
  const positionOf = (id: string | number) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Podniesiono: ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)}: pozycja ${positionOf(over.id)} z ${ids.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Upuszczono: ${nameOf(active.id)} na pozycji ${positionOf(over.id)} z ${ids.length}.`
        : `Upuszczono: ${nameOf(active.id)}.`,
    onDragCancel: ({ active }) => `Anulowano przenoszenie: ${nameOf(active.id)}.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over === null || active.id === over.id) {
      return;
    }
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) {
      onReorder(arrayMove(ids, from, to), String(active.id));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul aria-label={aria['aria-label']} className={className}>
          {items.map((item, index) => (
            <SortableRow key={item.id} id={item.id} name={itemName(item)}>
              {(handle) => renderItem(item, handle, index)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
