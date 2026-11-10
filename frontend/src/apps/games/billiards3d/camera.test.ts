import { describe, expect, it } from 'vitest';
import { TABLE } from '../billiards/billiards';
import { BALL_LIFT, SCALE, cameraFor, tableToScene } from './camera';

describe('mostek stół → scena', () => {
  it('środek stołu jest środkiem sceny', () => {
    expect(tableToScene({ x: TABLE.width / 2, y: TABLE.height / 2 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('przenosi na oś XZ i liczy w skali sceny', () => {
    const corner = tableToScene({ x: 0, y: 0 });

    expect(corner).toEqual({
      x: (-TABLE.width / 2) * SCALE,
      y: 0,
      z: (-TABLE.height / 2) * SCALE,
    });
    // Niżej niż kula, ale na płótnie — kamera patrzy w y = 0.
    expect(corner.y).toBe(0);
  });
});

describe('kamera', () => {
  const cue = tableToScene({ x: TABLE.width * 0.22, y: TABLE.height / 2 });

  it('kamera gracza siada za kulą w wybranym kierunku', () => {
    const pose = cameraFor('behind', cue, { yaw: Math.PI / 2, tilt: 0.34, distance: 7.6 });

    // Orbit π/2 to +z w scenie: cel leży w tę stronę, a oko po przeciwnej.
    expect(pose.target.z - cue.z).toBeGreaterThan(4);
    expect(pose.position.z).toBeLessThan(cue.z);
    // Spojrzenie przechyla się ku środkowi sukna, więc stół nie ucieka z kadru.
    expect(Math.abs(pose.target.x)).toBeLessThan(Math.abs(cue.x));
    // Wzrok zostaje nad sukном, nie w suficie.
    expect(pose.position.y).toBeGreaterThan(0);
    // Brak kamera gracza to dokładnie dawny, automatyczny kadr.
    expect(cameraFor('behind', cue)).toEqual(cameraFor('behind', cue, null));
  });

  it('góra i bok nie dają się przestawiać', () => {
    const own = { yaw: 1.2, tilt: 0.5, distance: 9 };

    expect(cameraFor('top', cue, own)).toEqual(cameraFor('top', cue));
    expect(cameraFor('side', cue, own)).toEqual(cameraFor('side', cue));
  });

  it('pochylenie i dystans naprawdę ruszają okiem', () => {
    const low = cameraFor('free', cue, { yaw: Math.PI / 2, tilt: 0.16, distance: 7.6 });
    const high = cameraFor('free', cue, { yaw: Math.PI / 2, tilt: 1.2, distance: 7.6 });

    expect(high.position.y).toBeGreaterThan(low.position.y);
    // Nad stołem oko jest prawie nad kulą, nisko — daleko za nią.
    expect(Math.abs(high.position.z - cue.z)).toBeLessThan(Math.abs(low.position.z - cue.z));

    const far = cameraFor('free', cue, { yaw: Math.PI / 2, tilt: 0.34, distance: 14 });
    const near = cameraFor('free', cue, { yaw: Math.PI / 2, tilt: 0.34, distance: 5 });
    expect(Math.abs(far.position.z - cue.z)).toBeGreaterThan(Math.abs(near.position.z - cue.z));
  });

  it('swobodny bez ustawionej kamery ma sensowny kadr', () => {
    const pose = cameraFor('free', cue);

    expect(pose.position.y).toBeGreaterThan(BALL_LIFT);
    expect(pose.up).toEqual({ x: 0, y: 1, z: 0 });
    // Twarde lądowanie: oko nigdy nie siada pod sukno.
    expect(cameraFor('free', cue, { yaw: 0, tilt: -2, distance: 3 }).position.y).toBeGreaterThan(0);
  });

  it('siedzi za białą i patrzy w głąb stołu', () => {
    const pose = cameraFor('behind', cue);

    // Biała jest na lewej ćwiartce stołu, więc kamera jest na jej lewo i patrzy
    // w stronę rozpinki.
    expect(pose.position.x).toBeLessThan(cue.x);
    expect(pose.target.x).toBeGreaterThan(cue.x);
  });

  it('nie ma w ogóle kierunku celowania — kamera nie może pogonić myszy', () => {
    // Jedyny sposób, żeby się obróciła, to przesunąć białą.
    const a = cameraFor('behind', cue);
    const b = cameraFor('behind', cue);

    expect(b.position).toEqual(a.position);
    expect(b.target).toEqual(a.target);
  });

  it('gdy biała stoi po drugiej stronie, kamera patrzy z powrotem', () => {
    const pose = cameraFor('behind', { x: 4, y: 0, z: 0 });

    expect(pose.position.x).toBeGreaterThan(4);
    expect(pose.target.x).toBeLessThan(4);
  });

  it('nigdy nie schodzi pod płótno', () => {
    for (const mode of ['behind', 'top', 'side'] as const) {
      expect(cameraFor(mode, cue).position.y).toBeGreaterThan(BALL_LIFT);
    }
  });

  it('widok z góry patrzy na środek stołu i trzyma długą krawędź w poziomie', () => {
    const pose = cameraFor('top', cue);

    expect(pose.position.y).toBeGreaterThan(10);
    expect(pose.target).toEqual({ x: 0, y: 0, z: 0 });
    // Bez tego stół staje na krótszej krawędzi.
    expect(pose.up).toEqual({ x: 0, y: 0, z: -1 });
  });

  it('widok z boku jest po stronie publiczności', () => {
    const pose = cameraFor('side', cue);

    expect(pose.position.z).toBeGreaterThan(0);
    expect(pose.position.y).toBeLessThan(cameraFor('top', cue).position.y);
  });
});
