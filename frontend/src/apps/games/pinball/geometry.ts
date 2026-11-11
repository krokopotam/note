/**
 * Wektory i najbliższe punkty — podstawa fizyki pinballa.
 *
 * Wszystko tu jest czyste i tanie: fizyka liczy w pikselach bufora (256 × 512),
 * na klatkę przypada kilkaset takich operacji, a każda z nich musi dać się
 * sprawdzić długopisem. Zwroty są „y w dół ekranu”, dokładnie jak w canvasie i w
 * fizyce bilarda z tego projektu — jedno pojęcie mniej do pilnowania.
 */

export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });

export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;

/** Długość — pierwiastek z iloczynu skalarnego. */
export const len = (a: Vec): number => Math.hypot(a.x, a.y);

export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Wersor; wektor zerowy zwraca zero, bo wołający i tak musi to przewidzieć. */
export function norm(a: Vec): Vec {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Prostopadły po prawej stronie kierunku — z niego robię normalne do ścian. */
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });

/** Prędkość punktu obracającego się wokół `pivot`: ω × r, w 2D jedno mnożenie. */
export function surfaceVelocity(omega: number, radius: Vec): Vec {
  return { x: -omega * radius.y, y: omega * radius.x };
}

export interface Closest {
  /** Najbliższy punkt odcinka. */
  point: Vec;
  /** Udział w odcinku: 0 = początek, 1 = koniec. */
  t: number;
  distance: number;
}

/**
 * Najbliższy punkt odcinka `a`–`b` dla punktu `p`.
 *
 * Rzut z odciętym parametrem — to serce kolizji kuli ze ścianą: `distance` mówi,
 * czy kula weszła w ścianę, a `t` gdzie na niej siedzi (końce odcinka zachowują
 * się jak wałki, więc kula nie prześlizguje się przez róg łamanej).
 */
export function closestOnSegment(p: Vec, a: Vec, b: Vec): Closest {
  const ab = sub(b, a);
  const squared = dot(ab, ab);
  if (squared <= 1e-12) {
    const d = dist(p, a);
    return { point: a, t: 0, distance: d };
  }
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / squared));
  const point = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return { point, t, distance: dist(p, point) };
}

/** Punkt łamanej po długości — z niego rysuję bandy i tory. */
export function pointAlongPath(points: readonly Vec[], distance: number): Vec {
  if (points.length === 0) return vec(0, 0);
  let left = distance;
  for (let i = 0; i < points.length - 1; i += 1) {
    const seg = sub(points[i + 1], points[i]);
    const length = len(seg);
    if (left <= length) return add(points[i], scale(norm(seg), Math.max(0, left)));
    left -= length;
  }
  return points[points.length - 1];
}

export function pathLength(points: readonly Vec[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) total += dist(points[i], points[i + 1]);
  return total;
}

/** Odbicie z restytucją i tarcim stycznym. `n` musi być jednostkowa. */
export function bounce(velocity: Vec, n: Vec, restitution: number, friction: number): Vec {
  const vn = dot(velocity, n);
  if (vn > 0) return velocity; // odjeżdża — nie ma czego odbijać
  const normal = scale(n, -vn * restitution);
  const tangent = { x: velocity.x - n.x * vn, y: velocity.y - n.y * vn };
  return add(normal, scale(tangent, 1 - friction));
}

export const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** Kąt między 0 a 2π — przy porównywaniu położeń klapki wygodne. */
export function wrapAngle(radians: number): number {
  const full = Math.PI * 2;
  return ((radians % full) + full) % full;
}

/** Kąt wektora w „y w dół ekranu”: 0 = w prawo, π/2 = w dół. */
export const angleOf = (a: Vec): number => Math.atan2(a.y, a.x);
