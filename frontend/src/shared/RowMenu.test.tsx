/**
 * The shared three-dot menu. Its contract is what every list in the apps relies on:
 * a button that says what row it belongs to, a menu that opens and closes predictably.
 */
import { fireEvent, screen, within } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RowMenu } from './RowMenu';

function renderMenu(items?: { label: string; onSelect: () => void; danger?: boolean }[]) {
  const fallback = [{ label: 'Zmień nazwę', onSelect: vi.fn() }];
  return render(<RowMenu label="Czynności pliku a.txt" items={items ?? fallback} />);
}

describe('the dots', () => {
  it('are a button named after the row they belong to', () => {
    renderMenu();

    const button = screen.getByRole('button', { name: 'Czynności pliku a.txt' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('open a menu with the items and close themselves afterwards', async () => {
    const onSelect = vi.fn();
    renderMenu([{ label: 'Usuń', onSelect, danger: true }]);

    await userEvent.click(screen.getByRole('button', { name: 'Czynności pliku a.txt' }));
    expect(screen.getByRole('button', { name: 'Czynności pliku a.txt' })).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Usuń' }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('close on Escape', async () => {
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Czynności pliku a.txt' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('close on a click anywhere else', async () => {
    renderMenu();

    await userEvent.click(screen.getByRole('button', { name: 'Czynności pliku a.txt' }));
    // The pane behind the menu is covered by a backdrop; a click there ends the menu.
    fireEvent.pointerDown(screen.getByTestId('row-menu-backdrop'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggle: clicking the dots again hides the menu', async () => {
    renderMenu();
    const button = screen.getByRole('button', { name: 'Czynności pliku a.txt' });

    await userEvent.click(button);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await userEvent.click(button);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders nothing when the row has no actions', () => {
    renderMenu([]);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
