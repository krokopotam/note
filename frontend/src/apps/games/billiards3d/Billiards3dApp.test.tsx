import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Billiards3dApp } from './Billiards3dApp';

/** jsdom nie ma ResizeObserver; scena potrzebuje go tylko przy rozmiarze. */
class ResizeObserverStub {
  observe(): void {}

  disconnect(): void {}
}

afterEach(() => {
  vi.restoreAllMocks();
  // Wybrane sterowanie mieszka w localStorage — nie może przeciekać między testami.
  window.localStorage.clear();
});

describe('bilard 3D na ekranie', () => {
  it('pokazuje tablicę wyników i sterowanie kamerą', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    render(<Billiards3dApp />);

    expect(screen.getByText(/Punkty/)).toHaveTextContent('0');
    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
    expect(screen.getByText(/Do wbicia/)).toHaveTextContent('10');
    expect(screen.getByRole('button', { name: 'Za kulą' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Z góry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Z boku' })).toBeInTheDocument();
    expect(screen.getByTestId('billiard3d-power')).toBeInTheDocument();
    expect(screen.getByTestId('billiard3d-strike')).toBeInTheDocument();
  });

  it('wybór kamery zostaje na jednym guziku', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    render(<Billiards3dApp />);

    expect(screen.getByRole('button', { name: 'Za kulą' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Z góry' }));

    expect(screen.getByRole('button', { name: 'Za kulą' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Z góry' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('bez WebGL mówi co nie działa, zamiast wywracać okno', () => {
    // jsdom nie oddaje kontekstu WebGL — to ta sama ścieżka co stary sterownik.
    render(<Billiards3dApp />);

    expect(screen.getByTestId('billiard3d-nogl')).toBeInTheDocument();
    expect(screen.getByTestId('billiard3d-stage')).toBeInTheDocument();
  });

  it('ma wybór sterowania i pamięta go', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    const first = render(<Billiards3dApp />);

    expect(screen.getByTestId('billiard3d-aim-cue')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('billiard3d-aim-table'));
    fireEvent.click(screen.getByTestId('billiard3d-trigger-button'));
    expect(screen.getByTestId('billiard3d-hint')).toHaveTextContent('uderza tylko');
    first.unmount();

    render(<Billiards3dApp />);

    expect(screen.getByTestId('billiard3d-aim-table')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('billiard3d-trigger-button')).toHaveAttribute('aria-pressed', 'true');
    // Widok to nie ustawienie gry: zaczyna się od automatu.
    expect(screen.getByTestId('billiard3d-camera-auto')).toHaveAttribute('aria-pressed', 'true');
  });

  it('swobodna kamera przejmuje ekran i usypia celowanie', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    render(<Billiards3dApp />);

    fireEvent.click(screen.getByTestId('billiard3d-camera-free'));

    expect(screen.getByTestId('billiard3d-hint')).toHaveTextContent('celowanie śpi');
    expect(screen.getByTestId('billiard3d-strike')).toBeDisabled();
    expect(screen.getByTestId('billiard3d-distance')).toBeInTheDocument();
    // Presety kamery znikają razem z celowaniem: kadr jest teraz własność palca.
    expect(screen.queryByTestId('billiard3d-preset-top')).toBeNull();
  });

  it('celowanie bierze zamrożony kadr i budzi kij', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    render(<Billiards3dApp />);
    fireEvent.click(screen.getByTestId('billiard3d-camera-free'));

    fireEvent.click(screen.getByTestId('billiard3d-aim-cue'));

    expect(screen.getByTestId('billiard3d-camera-placed')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('billiard3d-strike')).toBeEnabled();
    // Presety wracają i są czynne: można skoczyć z powrotem na auto.
    expect(screen.getByTestId('billiard3d-preset-top')).toBeEnabled();
  });

  it('preset kamery wraca do automatu', () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    render(<Billiards3dApp />);
    fireEvent.click(screen.getByTestId('billiard3d-camera-free'));
    fireEvent.click(screen.getByTestId('billiard3d-camera-auto'));
    fireEvent.click(screen.getByTestId('billiard3d-preset-top'));

    expect(screen.getByTestId('billiard3d-camera-auto')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('billiard3d-preset-top')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('billiard3d-distance')).toBeNull();
  });

  it('uderzenie i nowy bilard bez sceny niczego nie rozbijają', () => {
    render(<Billiards3dApp />);

    fireEvent.change(screen.getByTestId('billiard3d-power'), { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('billiard3d-strike'));
    fireEvent.click(screen.getByRole('button', { name: 'Nowy bilard' }));

    expect(screen.getByText(/Do wbicia/)).toHaveTextContent('10');
    expect(screen.getByText(/Punkty/)).toHaveTextContent('0');
  });
});
