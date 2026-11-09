/**
 * Desktop grid maths, kept pure so the drag/drop rules are unit-testable without
 * rendering anything.
 *
 * Icons are stored in grid cells (not pixels) so the same layout works on any
 * screen size; this module is the only place that knows the cell size.
 */

export const CELL = { width: 96, height: 104 } as const;

export interface Cell {
  x: number;
  y: number;
}

export interface Positioned {
  id: number;
  x: number;
  y: number;
  parent_id: number | null;
}

export function cellFromPoint(clientX: number, clientY: number): Cell {
  return {
    x: Math.max(0, Math.floor(clientX / CELL.width)),
    y: Math.max(0, Math.floor(clientY / CELL.height)),
  };
}

export function cellOffset(cell: Cell): { left: number; top: number } {
  return { left: cell.x * CELL.width, top: cell.y * CELL.height };
}

const keyOf = (cell: Cell) => `${cell.x},${cell.y}`;

/** Cells taken by siblings of the given container (the desktop or one folder). */
export function occupiedCells(items: Positioned[], parentId: number | null): Set<string> {
  return new Set(
    items.filter((item) => item.parent_id === parentId).map((item) => keyOf(item)),
  );
}

/**
 * Cell to actually drop an icon into: the preferred one when free, otherwise the
 * first free cell in reading order, so two icons can never stack on each other.
 */
export function findFreeCell(
  items: Positioned[],
  parentId: number | null,
  preferred: Cell,
  movedId: number,
): Cell {
  const taken = new Set(
    items
      .filter((item) => item.parent_id === parentId && item.id !== movedId)
      .map((item) => keyOf(item)),
  );

  if (!taken.has(keyOf(preferred))) return preferred;

  for (let y = 0; y < 1000; y += 1) {
    for (let x = 0; x < 1000; x += 1) {
      if (!taken.has(`${x},${y}`)) return { x, y };
    }
  }
  return preferred;
}

/** First free cell on the desktop, used when creating a new folder or shortcut. */
export function nextFreeCell(items: Positioned[], parentId: number | null): Cell {
  return findFreeCell(items, parentId, { x: 0, y: 0 }, -1);
}
