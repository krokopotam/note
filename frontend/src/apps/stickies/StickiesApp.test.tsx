import { screen, within } from '@testing-library/dom';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stickiesApi } from './stickiesApi';
import { StickiesApp } from './StickiesApp';
import { stickiesDefaults, useStickies } from './stickiesStore';
import type { Sticky } from '../../api/types';

vi.mock('./stickiesApi', () => ({
  stickiesApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const api = vi.mocked(stickiesApi);

const sticky = (id: number, overrides: Partial<Sticky> = {}): Sticky => ({
  id,
  body: `karteczka ${id}`,
  color: 'yellow',
  pinned: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  ...overrides,
});

/** The board is a window view, so it always gets window props. */
function renderBoard(payload: Record<string, unknown> = {}) {
  return render(<StickiesApp windowKey="stickies" appId="stickies" payload={payload} />);
}

beforeEach(() => {
  useStickies.setState(stickiesDefaults);
  vi.resetAllMocks();
  api.list.mockResolvedValue({ items: [sticky(1), sticky(2, { color: 'blue', pinned: true })], total: 2 });
  api.update.mockImplementation(async (id, patch) => ({ ...sticky(id), ...patch }));
  api.remove.mockResolvedValue(undefined);
  api.create.mockResolvedValue(sticky(3, { body: '' }));
});

describe('stickies board', () => {
  it('renders a card per sticky', async () => {
    renderBoard();

    expect(await screen.findByTestId('sticky-1')).toHaveTextContent('karteczka 1');
    expect(screen.getByTestId('sticky-2')).toBeInTheDocument();
    expect(screen.getByText('2 karteczek')).toBeInTheDocument();
  });

  it('commits the text when the card loses focus', async () => {
    renderBoard();
    const card = await screen.findByRole('textbox', { name: 'Treść karteczki 1' });

    await userEvent.clear(card);
    await userEvent.type(card, 'kupić baterie');
    expect(api.update).not.toHaveBeenCalled();

    await userEvent.click(document.body);
    expect(api.update).toHaveBeenCalledWith(1, { body: 'kupić baterie' });
  });

  it('does not send an update when the text was not changed', async () => {
    renderBoard();
    const card = await screen.findByRole('textbox', { name: 'Treść karteczki 1' });

    await userEvent.click(card);
    await userEvent.click(document.body);

    expect(api.update).not.toHaveBeenCalled();
  });

  it('searches through the API', async () => {
    renderBoard();
    await screen.findByTestId('sticky-1');

    await userEvent.type(screen.getByRole('searchbox', { name: 'Szukaj na karteczkach' }), 'baterie');

    expect(api.list).toHaveBeenLastCalledWith({ q: 'baterie', sort: 'updated_desc', pinned: false });
  });

  it('filters to pinned cards', async () => {
    renderBoard();
    await screen.findByTestId('sticky-1');

    await userEvent.click(screen.getByRole('checkbox', { name: 'Tylko przypięte' }));

    expect(api.list).toHaveBeenLastCalledWith({ q: '', sort: 'updated_desc', pinned: true });
  });

  it('sorts on request', async () => {
    renderBoard();
    await screen.findByTestId('sticky-1');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sortuj karteczki' }), 'created_asc');

    expect(api.list).toHaveBeenLastCalledWith({ q: '', sort: 'created_asc', pinned: false });
  });

  it('creates an empty card and shows it immediately', async () => {
    renderBoard();
    await screen.findByTestId('sticky-1');

    await userEvent.click(screen.getByRole('button', { name: 'Nowa karteczka' }));

    expect(await screen.findByTestId('sticky-3')).toBeInTheDocument();
  });

  it('repaints a card in another colour', async () => {
    renderBoard();
    await screen.findByTestId('sticky-1');

    const card = await screen.findByTestId('sticky-1');
    await userEvent.click(within(card).getByRole('button', { name: 'Kolor pink' }));

    expect(api.update).toHaveBeenCalledWith(1, { color: 'pink' });
  });

  it('pins a card and re-reads the board so it moves to the front', async () => {
    renderBoard();
    const pin = await screen.findByTestId('pin-1');

    await userEvent.click(pin);

    expect(api.update).toHaveBeenCalledWith(1, { pinned: true });
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('deletes a card', async () => {
    renderBoard();
    await screen.findByTestId('sticky-1');

    await userEvent.click(screen.getByRole('button', { name: 'Usuń karteczkę 1' }));

    await vi.waitFor(() => expect(api.remove).toHaveBeenCalledWith(1));
    expect(screen.queryByTestId('sticky-1')).not.toBeInTheDocument();
  });

  it('re-reads the board when a card is pushed into the payload', async () => {
    api.list.mockResolvedValue({ items: [sticky(1)], total: 1 });
    const { rerender } = render(<StickiesApp windowKey="stickies" appId="stickies" payload={{}} />);
    await screen.findByTestId('sticky-1');
    expect(api.list).toHaveBeenCalledTimes(1);

    api.list.mockResolvedValue({ items: [sticky(9, { body: 'z pulpitu' }), sticky(1)], total: 2 });
    rerender(<StickiesApp windowKey="stickies" appId="stickies" payload={{ stickyId: 9 }} />);

    expect(await screen.findByTestId('sticky-9')).toHaveTextContent('z pulpitu');
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('says so when nothing matches', async () => {
    api.list.mockResolvedValue({ items: [], total: 0 });

    renderBoard();

    expect(await screen.findByText('Brak karteczek. Zapisz pierwszą myśl.')).toBeInTheDocument();
  });
});
