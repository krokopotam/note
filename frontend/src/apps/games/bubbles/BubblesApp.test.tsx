import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BubblesApp } from './BubblesApp';

describe('bąbelki na ekranie', () => {
  it('pokazuje planszę pełną bąbelków i licznik strzałów', () => {
    render(<BubblesApp />);
    // Pięć wypełnionych wierszy: 11 + 10 + 11 + 10 + 11.
    expect(screen.getAllByTestId('bubble')).toHaveLength(53);
    expect(screen.getByText(/Strzały do nowego wiersza/)).toHaveTextContent('6');
  });

  it('strzał w górę zmniejsza licznik do następnego wiersza', () => {
    render(<BubblesApp />);
    const board = screen.getByTestId('bubbles-board');

    fireEvent.pointerUp(board);

    expect(screen.getByText(/Strzały do nowego wiersza/)).toHaveTextContent('5');
  });

  it('zaczyna nową grę od pełnej planszy', () => {
    render(<BubblesApp />);
    fireEvent.pointerUp(screen.getByTestId('bubbles-board'));
    expect(screen.getAllByTestId('bubble').length).toBeLessThanOrEqual(54);

    fireEvent.click(screen.getByRole('button', { name: 'Nowa gra' }));
    expect(screen.getAllByTestId('bubble')).toHaveLength(53);
  });
});
