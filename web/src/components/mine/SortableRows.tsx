import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { moveWithin, type MineItem } from '../../lib/mine.ts';
import { GripIcon } from '../icons.tsx';

/** What a row needs to be moved: its node and style while dragged, the handle, and one-tap moves. */
export interface RowSortable {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  dragging: boolean;
  /** The ⋮⋮ button: drag it, or focus it and use Space and the arrow keys. */
  handle: ReactNode;
  /** One step up / down — the way to move without dragging. Missing at the top / bottom. */
  moveUp?: () => void;
  moveDown?: () => void;
}

/** Rows only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface Props {
  /** The rows shown, in display order (maybe filtered, maybe one page of a long group). */
  items: MineItem[];
  /** The whole list they belong to — a status group or the pinned section — unfiltered, in "הסדר שלי" order. */
  list: MineItem[];
  /** New positions to save (see moveWithin). */
  onReorder: (changes: Record<string, number>) => void;
  renderRow: (item: MineItem, sortable: RowSortable) => ReactNode;
}

/** "הסדר שלי": a list of applications that can be put in any order by dragging (or with one-tap moves). */
export function SortableRows({ items, list, onReorder, renderRow }: Props) {
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a tap on the handle stays a tap.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const shown = items.map((i) => i.id);
  const titleOf = (id: UniqueIdentifier) => items.find((i) => i.id === id)?.title ?? '';
  const place = (id: UniqueIdentifier) =>
    `מקום ${shown.indexOf(String(id)) + 1} מתוך ${shown.length}`;

  const move = (id: string, to: number) => {
    const changes = moveWithin(list, shown, id, to);
    if (Object.keys(changes).length) onReorder(changes);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) move(String(active.id), shown.indexOf(String(over.id)));
  };

  // What a screen reader says while a row is moved from the keyboard. Until the row leaves its own
  // place, the pick-up message (with its place) stays — dnd-kit reports "over itself" right away.
  const moved = useRef(false);
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      moved.current = false;
      return `הרמת את "${titleOf(active.id)}", ${place(active.id)}.`;
    },
    onDragOver: ({ active, over }) => {
      if (over && over.id !== active.id) moved.current = true;
      if (!moved.current) return undefined;
      return over
        ? `"${titleOf(active.id)}" עכשיו ב${place(over.id)}.`
        : `"${titleOf(active.id)}" מחוץ לרשימה.`;
    },
    onDragEnd: ({ active, over }) =>
      over ? `"${titleOf(active.id)}" הונח ב${place(over.id)}.` : `"${titleOf(active.id)}" הונח.`,
    onDragCancel: ({ active }) => `ההזזה בוטלה. "${titleOf(active.id)}" חזר למקומו.`,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'כדי להזיז: רווח, ואז חצים למעלה ולמטה, ורווח כדי להניח. Escape מבטל.',
        },
      }}
    >
      <SortableContext items={shown} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              moveUp={index > 0 ? () => move(item.id, index - 1) : undefined}
              moveDown={index < items.length - 1 ? () => move(item.id, index + 1) : undefined}
              renderRow={renderRow}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  item,
  moveUp,
  moveDown,
  renderRow,
}: {
  item: MineItem;
  moveUp?: () => void;
  moveDown?: () => void;
  renderRow: Props['renderRow'];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    attributes: { roleDescription: 'שורה שאפשר להזיז' },
  });
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`שינוי המקום של "${item.title}"`}
      title="גרירה לשינוי הסדר"
      // touch-none: on a phone the handle drags, and the rest of the row still scrolls the page.
      className="grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:text-slate-700 active:cursor-grabbing dark:hover:text-slate-200"
    >
      <GripIcon />
    </button>
  );
  return renderRow(item, {
    setNodeRef,
    style: {
      transform: CSS.Translate.toString(transform),
      transition,
      position: 'relative',
      zIndex: isDragging ? 10 : undefined,
    },
    dragging: isDragging,
    handle,
    moveUp,
    moveDown,
  });
}
