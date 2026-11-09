import { describe, expect, it } from 'vitest';
import { CELL, cellFromPoint, findFreeCell, nextFreeCell, occupiedCells, type Positioned } from './grid';

const item = (id: number, x: number, y: number, parent_id: number | null = null): Positioned => ({
  id,
  x,
  y,
  parent_id,
});

describe('cellFromPoint', () => {
  it('maps pixels to the grid cell that contains them', () => {
    expect(cellFromPoint(0, 0)).toEqual({ x: 0, y: 0 });
    expect(cellFromPoint(CELL.width, 0)).toEqual({ x: 1, y: 0 });
    expect(cellFromPoint(CELL.width - 1, CELL.height + 5)).toEqual({ x: 0, y: 1 });
  });

  it('never returns a negative cell', () => {
    expect(cellFromPoint(-500, -500)).toEqual({ x: 0, y: 0 });
  });
});

describe('occupiedCells', () => {
  it('looks only at siblings of the given container', () => {
    const items = [item(1, 0, 0, null), item(2, 1, 0, null), item(3, 0, 0, 7)];
    expect([...occupiedCells(items, null)]).toEqual(['0,0', '1,0']);
    expect([...occupiedCells(items, 7)]).toEqual(['0,0']);
  });
});

describe('findFreeCell', () => {
  it('keeps the requested cell when nothing sits there', () => {
    expect(findFreeCell([item(1, 3, 3)], null, { x: 1, y: 1 }, 1)).toEqual({ x: 1, y: 1 });
  });

  it('ignores the dragged item itself, so dropping in place is legal', () => {
    expect(findFreeCell([item(1, 2, 2)], null, { x: 2, y: 2 }, 1)).toEqual({ x: 2, y: 2 });
  });

  it('moves to the first free cell in reading order when the target is taken', () => {
    const items = [item(1, 0, 0), item(2, 1, 0)];
    expect(findFreeCell(items, null, { x: 1, y: 0 }, 3)).toEqual({ x: 2, y: 0 });
  });

  it('considers only siblings, so a folder may reuse desktop coordinates', () => {
    const items = [item(1, 0, 0, null), item(2, 1, 0, null)];
    expect(findFreeCell(items, 9, { x: 0, y: 0 }, 3)).toEqual({ x: 0, y: 0 });
  });
});

describe('nextFreeCell', () => {
  it('fills the first gap of the container', () => {
    const items = [item(1, 0, 0), item(2, 1, 0), item(4, 0, 1)];
    expect(nextFreeCell(items, null)).toEqual({ x: 2, y: 0 });
  });
});
