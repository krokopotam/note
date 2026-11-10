import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TABLE } from '../billiards/billiards';
import { Billiards2dApp } from './Billiards2dApp';

const table = () => screen.getByTestId('billiard-table');
/** Nastawy mieszkają w panelu za kropkami — najpierw stuknij w nie. */
const openPanel = () => fireEvent.click(screen.getByTestId('billiard2d-menu'));

/** jsdom gives every element a zero-size box; the app needs a real one to aim. */
const stubTableBox = (width = 660, height = 348) => {
  const box = {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
  vi.spyOn(table(), 'getBoundingClientRect').mockReturnValue(box);
};

/** How much the frame is turned, read out of the group's transform. */
const frameAngle = () =>
  Number(/rotate\(([-\d.]+)\)/.exec(screen.getByTestId('billiard-view').getAttribute('transform') ?? '')?.[1] ?? 0);

/** Table units to client pixels. */
const px = (x: number, y: number) => ({
  clientX: ((x + 9) / (TABLE.width + 18)) * 660,
  clientY: ((y + 9) / (TABLE.height + 18)) * 348,
});

const roll = (ms: number) => {
  act(() => void vi.advanceTimersByTime(ms));
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // Wybrane sterowanie mieszka w localStorage — nie może przeciekać między testami.
  window.localStorage.clear();
});

describe('bilard 2D na ekranie', () => {
  it('kładzie stół: jedenaście kul, liczniki na zero', () => {
    render(<Billiards2dApp />);

    expect(screen.getAllByTestId(/^ball-\d+$/)).toHaveLength(11);
    expect(screen.getByText(/Do wbicia/)).toHaveTextContent('10');
    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
    expect(screen.getByTestId('cue-stick')).toBeInTheDocument();
  });

  it('rysuje przymiar z kulą-duchem, póki kule stoją', () => {
    render(<Billiards2dApp />);
    stubTableBox();

    fireEvent.pointerMove(table(), px(TABLE.width * 0.6, TABLE.height / 2));

    expect(screen.getByTestId('aim-guide')).toBeInTheDocument();
    expect(screen.getByTestId('ghost-ball')).toBeInTheDocument();
  });

  it('samo kliknięcie nie jest strzałem', () => {
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();

    fireEvent.pointerDown(node, px(100, 55));
    fireEvent.pointerUp(node, px(100, 55));

    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
  });

  it('pociągnięcie do siebie nabija kij, a puszczenie uderza', () => {
    vi.useFakeTimers();
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();

    fireEvent.pointerDown(node, { clientX: 200, clientY: 240 });
    fireEvent.pointerMove(node, { clientX: 200, clientY: 352 });
    expect(screen.getByTestId('power-fill')).toHaveStyle({ width: '50%' });

    fireEvent.pointerUp(node, { clientX: 200, clientY: 352 });

    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');
    // Kij znika, bo kula jest w ruchu.
    expect(screen.queryByTestId('cue-stick')).toBeNull();

    roll(6000);

    expect(screen.getByTestId('cue-stick')).toBeInTheDocument();
  });

  it('przy trybie „guzik” pociągnięcie leje siłę, ale nie uderza', () => {
    vi.useFakeTimers();
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();
    openPanel();
    fireEvent.click(screen.getByTestId('billiard2d-trigger-button'));

    fireEvent.pointerDown(node, { clientX: 200, clientY: 240 });
    fireEvent.pointerMove(node, { clientX: 200, clientY: 368 });
    fireEvent.pointerUp(node, { clientX: 200, clientY: 368 });

    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
    expect(screen.getByTestId('power-fill')).toHaveStyle({ width: '58%' });

    fireEvent.click(screen.getByTestId('billiard2d-strike'));

    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');
  });

  it('tryb „stół” obraca planszą, a palec nie celuje', () => {
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();

    // Kadr prosto: zero skręta, stół wyśrodkowany.
    expect(frameAngle()).toBe(0);
    expect(screen.getByTestId('billiard-view').getAttribute('transform')).toContain('translate(');

    fireEvent.click(screen.getByTestId('billiard2d-aim-table'));
    // Sam wybór „stół” kładzie uderzenie pionowo: kadr już jest skręcony.
    const start = frameAngle();
    expect(start).not.toBe(0);

    fireEvent.pointerDown(node, { clientX: 300, clientY: 240 });
    fireEvent.pointerMove(node, { clientX: 350, clientY: 240 });
    fireEvent.pointerUp(node, { clientX: 350, clientY: 240 });

    const before = frameAngle();
    expect(before).not.toBe(start);

    fireEvent.pointerDown(node, { clientX: 300, clientY: 240 });
    fireEvent.pointerMove(node, { clientX: 250, clientY: 240 });
    fireEvent.pointerUp(node, { clientX: 250, clientY: 240 });

    // Tak samo w drugą stronę: kadr wraca tam, skąd wystartował.
    expect(frameAngle()).toBeCloseTo(start, 6);
  });

  it('sterowanie strzału jest pod ręką, reszta pod kropkami', () => {
    render(<Billiards2dApp />);

    // Bez otwierania czegokolwiek: w co kręcę i czym uderzam.
    expect(screen.getByTestId('billiard2d-aim-cue')).toBeInTheDocument();
    expect(screen.getByTestId('billiard2d-strike')).toBeInTheDocument();
    // A to, co ustawia się raz na wizytę, czeka w panelu.
    expect(screen.queryByTestId('billiard2d-panel')).toBeNull();
    expect(screen.queryByTestId('billiard2d-camera-free')).toBeNull();

    openPanel();

    expect(screen.getByTestId('billiard2d-panel')).toBeInTheDocument();
    expect(screen.getByTestId('billiard2d-hint')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('billiard2d-menu-backdrop'));

    expect(screen.queryByTestId('billiard2d-panel')).toBeNull();
  });

  it('wybrane sterowanie zostaje na następne wejście', () => {
    const first = render(<Billiards2dApp />);
    fireEvent.click(screen.getByTestId('billiard2d-aim-table'));
    openPanel();
    fireEvent.click(screen.getByTestId('billiard2d-trigger-button'));
    first.unmount();

    render(<Billiards2dApp />);
    openPanel();

    expect(screen.getByTestId('billiard2d-aim-table')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('billiard2d-trigger-button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('billiard2d-hint')).toHaveTextContent('uderza tylko');
    // Widoku nie pamiętamy: to kadr na jedną chwilę, nie ustawienie gry.
    expect(screen.getByTestId('billiard2d-camera-auto')).toHaveAttribute('aria-pressed', 'true');
  });

  it('kij słucha palca: w bok kręci się wokół kuli', () => {
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();
    const guide = () => screen.getByTestId('aim-guide').getAttribute('points') ?? '';

    fireEvent.pointerMove(node, { clientX: 300, clientY: 120 });
    const before = guide();

    fireEvent.pointerDown(node, { clientX: 300, clientY: 200 });
    fireEvent.pointerMove(node, { clientX: 380, clientY: 200 });
    fireEvent.pointerUp(node, { clientX: 380, clientY: 200 });

    expect(guide()).not.toBe(before);
  });

  it('swobodny widok oddaje ekran palcu i usypia celowanie', () => {
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();

    openPanel();
    fireEvent.click(screen.getByTestId('billiard2d-camera-free'));

    expect(screen.queryByTestId('cue-stick')).toBeNull();
    expect(screen.queryByTestId('aim-guide')).toBeNull();
    expect(screen.getByTestId('billiard2d-strike')).toBeDisabled();
    expect(screen.getByTestId('billiard2d-hint')).toHaveTextContent('celowanie śpi');

    fireEvent.pointerDown(node, { clientX: 300, clientY: 300 });
    fireEvent.pointerMove(node, { clientX: 420, clientY: 240 });
    fireEvent.pointerUp(node, { clientX: 420, clientY: 240 });

    const placed = screen.getByTestId('billiard-view').getAttribute('transform') ?? '';
    expect(placed).toContain('rotate(');
    expect(placed).toContain('scale(');
    // Uderzenie? Żadne: palec ruszał kadr, nie kij.
    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
  });

  it('wybór celowania zostawia ustawiony kadr i oddaje kij', () => {
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();
    openPanel();
    fireEvent.click(screen.getByTestId('billiard2d-camera-free'));
    fireEvent.pointerDown(node, { clientX: 300, clientY: 300 });
    fireEvent.pointerMove(node, { clientX: 420, clientY: 260 });
    fireEvent.pointerUp(node, { clientX: 420, clientY: 260 });

    const placed = screen.getByTestId('billiard-view').getAttribute('transform') ?? '';

    fireEvent.click(screen.getByTestId('billiard2d-aim-cue'));

    // Kadr ten sam, co został po ustawianiu — kamera nie skoczyła na auto.
    expect(screen.getByTestId('billiard-view').getAttribute('transform')).toBe(placed);
    expect(screen.getByTestId('billiard2d-camera-placed')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('billiard2d-strike')).toBeEnabled();
    expect(screen.getByTestId('cue-stick')).toBeInTheDocument();
  });

  it('Auto oddaje kadr kamerze, Własny trzyma ustawiony', () => {
    render(<Billiards2dApp />);
    stubTableBox();
    const node = table();
    openPanel();
    fireEvent.click(screen.getByTestId('billiard2d-camera-free'));
    fireEvent.pointerDown(node, { clientX: 300, clientY: 300 });
    fireEvent.pointerMove(node, { clientX: 400, clientY: 300 });
    fireEvent.pointerUp(node, { clientX: 400, clientY: 300 });
    fireEvent.click(screen.getByTestId('billiard2d-aim-cue'));

    fireEvent.click(screen.getByTestId('billiard2d-camera-auto'));

    // Auto kasuje skręt i zoom, zostaje samo wyśrodkowanie.
    const auto = screen.getByTestId('billiard-view').getAttribute('transform') ?? '';
    expect(frameAngle()).toBe(0);
    expect(auto).toContain('scale(1)');
  });

  it('klawiatura obraca kij, dobiera siłę i uderza', () => {
    render(<Billiards2dApp />);
    const node = table();

    fireEvent.keyDown(node, { key: 'ArrowUp' });
    expect(screen.getByTestId('power-fill')).toHaveStyle({ width: '68%' });

    fireEvent.keyDown(node, { key: ' ' });

    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');
  });

  it('po uderzeniu kule się zatrzymują same, bez restartu', () => {
    vi.useFakeTimers();
    render(<Billiards2dApp />);

    fireEvent.keyDown(table(), { key: ' ' });
    roll(8000);

    // Ruch minął: licznik zostaje na jednym, a kij wraca na stół.
    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');
    expect(screen.getByTestId('cue-stick')).toBeInTheDocument();
  });

  it('nowy bilard kładzie kule od początku', () => {
    render(<Billiards2dApp />);
    fireEvent.keyDown(table(), { key: ' ' });
    expect(screen.getByText(/Strzały/)).toHaveTextContent('1');

    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Nowy bilard' }));

    expect(screen.getByText(/Strzały/)).toHaveTextContent('0');
    expect(screen.getByText(/Do wbicia/)).toHaveTextContent('10');
  });
});
