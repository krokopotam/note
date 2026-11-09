import { useRef, useState } from 'react';
import type { DesktopItem } from '../api/types';
import { useDesktop } from './desktopStore';
import { CELL, cellFromPoint, findFreeCell, nextFreeCell } from './grid';
import { AppGlyph } from './registry';
import { useContextMenu } from './contextMenuStore';
import { usePointerDrag } from './usePointerDrag';
import styles from './IconGrid.module.css';

/**
 * Icons laid out on a grid, used both for the desktop and for a folder window —
 * one implementation, so drag/drop behaves identically everywhere.
 *
 * The container is identified by `parentId` (null for the desktop). Dropping an
 * icon onto a folder puts it inside that folder.
 */

interface IconGridProps {
  parentId: number | null;
  items: DesktopItem[];
  onOpen: (item: DesktopItem) => void;
  /** Empty space to keep below the icons, in rows. */
  minRows?: number;
}

export function IconGrid({ parentId, items, onOpen, minRows = 5 }: IconGridProps) {
  const moveItem = useDesktop((state) => state.moveItem);
  const rename = useDesktop((state) => state.rename);
  const remove = useDesktop((state) => state.remove);
  const openMenu = useContextMenu((state) => state.open);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const siblings = items.filter((item) => item.parent_id === parentId);

  const drop = (dragged: DesktopItem, clientX: number, clientY: number) => {
    const rect = gridRef.current?.getBoundingClientRect();
    const cell = cellFromPoint(clientX - (rect?.left ?? 0), clientY - (rect?.top ?? 0));

    const landing = siblings.find(
      (item) =>
        item.id !== dragged.id && item.kind === 'folder' && item.x === cell.x && item.y === cell.y,
    );

    if (landing) {
      void moveItem(dragged.id, nextFreeCell(items, landing.id), landing.id);
      return;
    }

    // Dropping outside this container (e.g. out of a folder window) is ignored:
    // the desktop is the only other container and it is not under the pointer.
    if (dragged.parent_id !== parentId) return;
    void moveItem(dragged.id, findFreeCell(items, parentId, cell, dragged.id), parentId);
  };

  const menuFor = (item: DesktopItem) => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    openMenu(event.clientX, event.clientY, [
      { id: 'open', label: 'Otwórz', run: () => onOpen(item) },
      { id: 'rename', label: 'Zmień nazwę', run: () => setRenamingId(item.id) },
      { id: 'delete', label: 'Usuń', danger: true, run: () => void remove(item.id) },
    ]);
  };

  return (
    <div
      ref={gridRef}
      className={styles.grid}
      style={{ minHeight: minRows * CELL.height, minWidth: 6 * CELL.width }}
      data-testid={`icon-grid-${parentId ?? 'desktop'}`}
    >
      {siblings.map((item) => (
        <Icon
          key={item.id}
          item={item}
          renaming={renamingId === item.id}
          onOpen={() => onOpen(item)}
          onRename={(name) => {
            setRenamingId(null);
            const trimmed = name.trim();
            if (trimmed && trimmed !== item.name) void rename(item.id, trimmed);
          }}
          onDrop={(clientX, clientY) => drop(item, clientX, clientY)}
          onMenu={menuFor(item)}
        />
      ))}
    </div>
  );
}

interface IconProps {
  item: DesktopItem;
  renaming: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDrop: (clientX: number, clientY: number) => void;
  onMenu: (event: React.MouseEvent) => void;
}

function Icon({ item, renaming, onOpen, onRename, onDrop, onMenu }: IconProps) {
  const { delta, dragging, onPointerDown } = usePointerDrag({
    enabled: () => !renaming,
    onEnd: (move) => onDrop(move.clientX, move.clientY),
  });

  const appId = item.kind === 'folder' ? 'folder' : (item.app_id ?? 'folder');

  return (
    <button
      type="button"
      className={dragging ? `${styles.icon} ${styles.dragging}` : styles.icon}
      style={{
        left: item.x * CELL.width,
        top: item.y * CELL.height,
        transform: delta ? `translate(${delta.dx}px, ${delta.dy}px)` : undefined,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onOpen}
      onContextMenu={onMenu}
      data-testid={`icon-${item.id}`}
      data-kind={item.kind}
      aria-label={item.name}
    >
      <span className={styles.glyph}>
        <AppGlyph appId={appId} />
      </span>
      {renaming ? (
        <RenameField initial={item.name} onDone={onRename} />
      ) : (
        <span className={styles.label}>{item.name}</span>
      )}
    </button>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(initial);

  return (
    <input
      className={styles.rename}
      value={value}
      autoFocus
      aria-label="Nowa nazwa"
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onDone(value);
        if (event.key === 'Escape') onDone(initial);
      }}
      onBlur={() => onDone(value)}
    />
  );
}
