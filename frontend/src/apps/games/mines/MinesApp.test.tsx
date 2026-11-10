import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MinesApp } from './MinesApp';

let root: HTMLElement;

const field = () => screen.getByTestId('mines-board');
const cell = (index: number) => root.querySelector(`[data-cell="${index}"]`) as HTMLElement;
const openCount = () => root.querySelectorAll('[data-cell]').length;

describe('saper na ekranie', () => {
  it('pierwsze kliknięcie nigdy nie wybucha i otwiera kawał pola', () => {
    root = render(<MinesApp />).container;

    fireEvent.click(cell(40));

    expect(field().textContent).not.toContain('💣');
    expect(field().textContent).not.toContain('Boom');
    // Otwarte pola mówią, ile min mają wokoło — zamknięte nie.
    expect(root.querySelectorAll('[data-cell][aria-label*=":"]').length).toBeGreaterThan(1);
  });

  it('flaga zostawia pole ukryte i da się ją zdjąć', () => {
    root = render(<MinesApp />).container;
    fireEvent.click(cell(40));

    fireEvent.click(screen.getByRole('button', { name: 'Flaga: wyłączona' }));
    const hidden = [...Array(81).keys()].find(
      (index) => !cell(index).getAttribute('aria-label')?.includes(': '),
    );
    expect(hidden).toBeDefined();

    fireEvent.click(cell(hidden as number));
    expect(cell(hidden as number).textContent).toBe('🚩');
    expect(cell(hidden as number).getAttribute('aria-label')).toContain('flaga');

    fireEvent.click(cell(hidden as number));
    expect(cell(hidden as number).textContent).toBe('');
  });

  it('prawy przycisk stawia flagę bez przełączania trybu', () => {
    root = render(<MinesApp />).container;
    fireEvent.click(cell(0));

    fireEvent.contextMenu(cell(80));

    expect(cell(80).textContent).toBe('🚩');
  });

  it('zmiana trudności zmienia liczbę pól', () => {
    root = render(<MinesApp />).container;
    expect(openCount()).toBe(81);

    fireEvent.change(screen.getByLabelText('Trudność'), { target: { value: 'średni' } });

    expect(openCount()).toBe(144);
  });
});
