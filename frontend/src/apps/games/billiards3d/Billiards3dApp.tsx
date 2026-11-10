import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import shell from '../gameShell.module.css';
import {
  BALL_R,
  POCKETS,
  RAIL,
  TABLE,
  bookShot,
  createRack,
  cueBall,
  leftToPot,
  predict,
  resting,
  step,
  strike,
} from '../billiards/billiards';
import type { Point, World } from '../billiards/billiards';
import { BALL_LIFT, CAMERA_MODES, SCALE, cameraFor, tableToScene } from './camera';
import type { CameraMode } from './camera';
import styles from './Billiards3dApp.module.css';

/** What the HUD shows; the scene reports it when a shot finishes. */
interface Hud {
  score: number;
  shots: number;
  left: number;
  fouls: number;
  won: boolean;
  gained: number;
  foul: boolean;
  seq: number;
}

interface Engine {
  strike: (power: number) => void;
  reset: () => void;
  setMode: (mode: CameraMode) => void;
  dispose: () => void;
}

const hudOf = (world: World): Hud => {
  const last = world.last;
  return {
    score: world.score,
    shots: world.shots,
    left: leftToPot(world),
    fouls: world.fouls,
    won: world.won,
    gained: last?.potted.filter((entry) => entry.id !== 0).length
      ? (last?.gained ?? 0)
      : 0,
    foul: Boolean(last?.foul),
    seq: last?.seq ?? 0,
  };
};

const FLASHES = 8;

/**
 * Builds the table and runs it.
 *
 * Everything imperative lives here: three.js objects, the pointer, the frame
 * loop. React only owns the HUD and the buttons, so the scene never waits for a
 * render and a render never waits for the scene.
 */
function buildScene(host: HTMLElement, onHud: (hud: Hud) => void): Engine {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1420');
  scene.fog = new THREE.Fog('#0d1420', 26, 46);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
  camera.position.set(0, 6, 9);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // --- light ---------------------------------------------------------------
  scene.add(new THREE.HemisphereLight('#cfe4ff', '#1b2230', 0.75));
  const lamp = new THREE.DirectionalLight('#fff4dc', 1.5);
  lamp.position.set(3.5, 14, 5);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.camera.left = -11;
  lamp.shadow.camera.right = 11;
  lamp.shadow.camera.top = 8;
  lamp.shadow.camera.bottom = -8;
  lamp.shadow.bias = -0.0012;
  scene.add(lamp);
  // Doświetlenie od strony widza: bez niego biała kula jest ciemno-szara.
  const fill = new THREE.DirectionalLight('#c8dcff', 0.55);
  fill.position.set(-7, 5, -8);
  scene.add(fill);
  const glow = new THREE.PointLight('#ffd9a0', 22, 22, 2);
  glow.position.set(0, 4.6, 0);
  scene.add(glow);

  // --- table ---------------------------------------------------------------
  const wood = track(new THREE.MeshStandardMaterial({ color: '#5c3520', roughness: 0.62 }));
  const cloth = track(new THREE.MeshStandardMaterial({ color: '#157a4f', roughness: 0.95 }));
  const cushion = track(new THREE.MeshStandardMaterial({ color: '#0f5f3e', roughness: 0.9 }));
  const hole = track(new THREE.MeshStandardMaterial({ color: '#080b11', roughness: 1 }));

  const table = new THREE.Group();
  scene.add(table);

  const bedGeo = track(new THREE.BoxGeometry(TABLE.width * SCALE, 0.32, TABLE.height * SCALE));
  const bed = new THREE.Mesh(bedGeo, cloth);
  bed.position.y = -0.16;
  bed.receiveShadow = true;
  table.add(bed);

  const railLongGeo = track(
    new THREE.BoxGeometry((TABLE.width + RAIL * 2) * SCALE, 0.42, RAIL * SCALE),
  );
  const railShortGeo = track(
    new THREE.BoxGeometry(RAIL * SCALE, 0.42, (TABLE.height + RAIL * 2) * SCALE),
  );
  const halfW = (TABLE.width / 2) * SCALE;
  const halfH = (TABLE.height / 2) * SCALE;
  for (const [geo, x, z] of [
    [railLongGeo, 0, -(halfH + (RAIL / 2) * SCALE)],
    [railLongGeo, 0, halfH + (RAIL / 2) * SCALE],
    [railShortGeo, -(halfW + (RAIL / 2) * SCALE), 0],
    [railShortGeo, halfW + (RAIL / 2) * SCALE, 0],
  ] as [THREE.BufferGeometry, number, number][]) {
    const rail = new THREE.Mesh(geo, wood);
    rail.position.set(x, 0.05, z);
    rail.castShadow = true;
    rail.receiveShadow = true;
    table.add(rail);
  }

  // Cushions: the rubber the balls bounce off, just inside the wooden frame.
  const cushionLongGeo = track(
    new THREE.BoxGeometry(TABLE.width * SCALE, 0.26, RAIL * 0.42 * SCALE),
  );
  const cushionShortGeo = track(
    new THREE.BoxGeometry(RAIL * 0.42 * SCALE, 0.26, TABLE.height * SCALE),
  );
  for (const [geo, x, z] of [
    [cushionLongGeo, 0, -(halfH + (RAIL * 0.21) * SCALE)],
    [cushionLongGeo, 0, halfH + (RAIL * 0.21) * SCALE],
    [cushionShortGeo, -(halfW + (RAIL * 0.21) * SCALE), 0],
    [cushionShortGeo, halfW + (RAIL * 0.21) * SCALE, 0],
  ] as [THREE.BufferGeometry, number, number][]) {
    const strip = new THREE.Mesh(geo, cushion);
    strip.position.set(x, -0.02, z);
    strip.receiveShadow = true;
    table.add(strip);
  }

  const pocketGeo = track(new THREE.CylinderGeometry(BALL_R * 2.1 * SCALE, BALL_R * 1.75 * SCALE, 0.5, 22));
  for (const pocket of POCKETS) {
    const at = tableToScene(pocket);
    const mesh = new THREE.Mesh(pocketGeo, hole);
    mesh.position.set(at.x, -0.06, at.z);
    table.add(mesh);
  }

  // The head string: where the white ball is placed from.
  const lineGeo = track(new THREE.BoxGeometry(0.015, 0.002, TABLE.height * SCALE));
  const lineMat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16 }));
  const headLine = new THREE.Mesh(lineGeo, lineMat);
  const headAt = tableToScene({ x: TABLE.width * 0.22, y: TABLE.height / 2 });
  headLine.position.set(headAt.x, 0.002, 0);
  table.add(headLine);

  const floorGeo = track(new THREE.CircleGeometry(34, 48));
  const floorMat = track(new THREE.MeshStandardMaterial({ color: '#080d16', roughness: 1 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  table.add(floor);

  // --- balls ---------------------------------------------------------------
  const ballGeo = track(new THREE.SphereGeometry(BALL_LIFT, 26, 18));
  const beltGeo = track(new THREE.CylinderGeometry(BALL_LIFT * 1.008, BALL_LIFT * 1.008, BALL_LIFT * 1.15, 24, 1, true));
  const dotGeo = track(new THREE.SphereGeometry(BALL_LIFT * 0.2, 10, 8));
  const meshes: THREE.Mesh[] = [];
  const belts: THREE.Mesh[] = [];
  const world0 = createRack();
  for (const ball of world0.balls) {
    const material = track(
      new THREE.MeshStandardMaterial({
        color: ball.cue ? '#f7f3e8' : ball.color,
        roughness: 0.22,
        metalness: 0.04,
      }),
    );
    const mesh = new THREE.Mesh(ballGeo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    meshes[ball.id] = mesh;

    if (ball.striped) {
      const belt = new THREE.Mesh(beltGeo, track(new THREE.MeshStandardMaterial({ color: '#f7f3e8', roughness: 0.25, side: THREE.DoubleSide })));
      mesh.add(belt);
      belts[ball.id] = belt;
    }
    if (ball.cue) {
      const dot = new THREE.Mesh(dotGeo, track(new THREE.MeshStandardMaterial({ color: '#d84a4a', roughness: 0.4 })));
      dot.position.set(0, BALL_LIFT * 0.86, 0);
      mesh.add(dot);
    }
  }

  // --- cue stick -----------------------------------------------------------
  const stick = new THREE.Group();
  const shaftGeo = track(new THREE.CylinderGeometry(0.028, 0.052, 2.5, 14));
  const shaft = new THREE.Mesh(shaftGeo, track(new THREE.MeshStandardMaterial({ color: '#d8a35c', roughness: 0.5 })));
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = -1.25;
  shaft.castShadow = true;
  const tipMesh = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12)),
    track(new THREE.MeshStandardMaterial({ color: '#63b4e8', roughness: 0.4 })),
  );
  tipMesh.rotation.z = Math.PI / 2;
  tipMesh.position.x = -0.04;
  stick.add(shaft, tipMesh);
  scene.add(stick);

  // --- aim ------------------------------------------------------------------
  const guideMat = track(
    new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 0.16, gapSize: 0.14, transparent: true, opacity: 0.75 }),
  );
  const guide = new THREE.Line(new THREE.BufferGeometry(), guideMat);
  guide.visible = false;
  scene.add(guide);
  const tangentMat = track(
    new THREE.LineBasicMaterial({ color: '#ffd83d', transparent: true, opacity: 0.8 }),
  );
  const tangent = new THREE.Line(new THREE.BufferGeometry(), tangentMat);
  scene.add(tangent);
  const ghostGeo = track(new THREE.TorusGeometry(BALL_LIFT, 0.014, 8, 28));
  const ghostMat = track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
  const ghost = new THREE.Mesh(ghostGeo, ghostMat);
  ghost.rotation.x = -Math.PI / 2;
  scene.add(ghost);

  // --- pocket flashes -------------------------------------------------------
  const flashGeo = track(new THREE.RingGeometry(BALL_LIFT * 1.1, BALL_LIFT * 1.9, 26));
  const flashes = Array.from({ length: FLASHES }, () => {
    const mesh = new THREE.Mesh(
      flashGeo,
      track(new THREE.MeshBasicMaterial({ color: '#ffd83d', transparent: true, opacity: 0, side: THREE.DoubleSide })),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, started: -1 };
  });
  let flashNext = 0;

  // --- state ---------------------------------------------------------------
  let world = world0;
  let aim = 0;
  let mode: CameraMode = 'behind';
  let grabbed: { x: number; y: number } | null = null;
  let loaded = 0;
  let pull = 0; // how far the cue is pulled back, animated
  let striking = -1;
  const potted: { id: number; color: string; pocket: number; at: Point }[] = [];
  const sinking = new Map<number, number>();
  let cushions = 0;

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const easeTarget = new THREE.Vector3();

  const setGuidePoints = (line: THREE.Line, points: { x: number; y: number; z: number }[]) => {
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints(
      points.map((point) => new THREE.Vector3(point.x, BALL_LIFT, point.z)),
    );
    line.computeLineDistances();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!resting(world)) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndc = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
    if (grabbed) {
      loaded = Math.max(0, Math.min(1, Math.hypot(event.clientX - grabbed.x, event.clientY - grabbed.y) / 240));
      return;
    }
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const cue = cueBall(world);
    const at = tableToScene(cue);
    aim = Math.atan2(hit.z - at.z, hit.x - at.x);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!resting(world) || world.won || cueBall(world).potted) return;
    grabbed = { x: event.clientX, y: event.clientY };
    loaded = 0;
  };

  const onPointerUp = () => {
    if (!grabbed) return;
    const strength = loaded;
    grabbed = null;
    loaded = 0;
    if (strength < 0.06) return;
    world = strike(world, aim, strength);
    striking = performance.now();
  };

  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

  const resize = () => {
    const width = host.clientWidth || 640;
    const height = host.clientHeight || 400;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  let frame = 0;
  let last = performance.now();

  const tick = (now: number) => {
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000));
    last = now;

    if (!resting(world)) {
      const next = step(world, dt);
      world = next.world;
      cushions += next.events.cushions.length;
      for (const event of next.events.potted) {
        potted.push({ id: event.ball.id, color: event.ball.color, pocket: event.pocket, at: event.at });
        sinking.set(event.ball.id, now);
        const flash = flashes[flashNext];
        flashNext = (flashNext + 1) % FLASHES;
        flash.started = now;
        flash.mesh.visible = true;
        flash.mesh.position.set(tableToScene(event.at).x, 0.02, tableToScene(event.at).z);
      }
      if (resting(world)) {
        world = bookShot(world, potted, cushions);
        potted.length = 0;
        cushions = 0;
        onHud(hudOf(world));
      }
    }

    // Balls: position, and a sink when one drops.
    for (const ball of world.balls) {
      const mesh = meshes[ball.id];
      const at = tableToScene(ball);
      if (!ball.potted) {
        mesh.position.set(at.x, BALL_LIFT, at.z);
        mesh.visible = true;
        mesh.scale.setScalar(1);
        // Rolling look: spin the ball around the axis across its travel.
        const moved = Math.hypot(ball.vx, ball.vy) * dt;
        if (moved > 0) mesh.rotateZ(-moved / BALL_LIFT);
      } else {
        const started = sinking.get(ball.id) ?? now;
        const part = Math.min(1, (now - started) / 340);
        mesh.position.set(at.x, BALL_LIFT - part * 0.9, at.z);
        mesh.scale.setScalar(Math.max(0.05, 1 - part));
        mesh.visible = part < 1;
      }
    }

    // Cue stick: sits behind the white ball, pulls with the drag, snaps on strike.
    const cue = cueBall(world);
    const cueAt = tableToScene(cue);
    const stillQueued = resting(world) && !cue.potted && !world.won;
    const wantPull = striking < 0 ? (grabbed ? loaded * 0.55 : 0.03) : 0;
    pull += (wantPull - pull) * Math.min(1, dt * 12);
    let offset = BALL_LIFT * 1.3 + pull;
    if (striking >= 0) {
      const part = (now - striking) / 130;
      if (part >= 1) striking = -1;
      else offset = BALL_LIFT * 1.3 + 0.55 * (1 - part) * (1 - part) * -0.35;
    }
    stick.visible = stillQueued;
    stick.position.set(cueAt.x, BALL_LIFT * 1.05, cueAt.z);
    stick.rotation.y = -aim;
    stick.position.x -= Math.cos(aim) * offset;
    stick.position.z -= Math.sin(aim) * offset;

    // Aim line and ghost ball.
    if (stillQueued) {
      const plan = predict(world, aim);
      const points = plan.path.map((point) => tableToScene(point));
      setGuidePoints(guide, points);
      guide.visible = points.length > 1;
      if (plan.ghost) {
        const g = tableToScene(plan.ghost);
        ghost.position.set(g.x, 0.012, g.z);
        ghost.visible = true;
        if (plan.target) {
          const t = tableToScene(plan.target);
          setGuidePoints(tangent, [
            { x: t.x, y: 0, z: t.z },
            { x: t.x + (t.x - g.x) * 3.5, y: 0, z: t.z + (t.z - g.z) * 3.5 },
          ]);
          tangent.visible = true;
        } else {
          tangent.visible = false;
        }
      } else {
        ghost.visible = false;
        tangent.visible = false;
      }
    } else {
      guide.visible = false;
      ghost.visible = false;
      tangent.visible = false;
    }

    for (const flash of flashes) {
      if (flash.started < 0) continue;
      const part = (now - flash.started) / 520;
      if (part >= 1) {
        flash.started = -1;
        flash.mesh.visible = false;
        continue;
      }
      const material = flash.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 1 - part;
      flash.mesh.scale.setScalar(0.7 + part * 2.1);
    }

    // Camera eases towards its pose so turning the aim is smooth, not jumpy.
    const pose = cameraFor(mode, { x: cueAt.x, y: BALL_LIFT, z: cueAt.z });
    camPos.set(pose.position.x, pose.position.y, pose.position.z);
    camTarget.set(pose.target.x, pose.target.y, pose.target.z);
    camera.up.set(pose.up.x, pose.up.y, pose.up.z);
    const ease = 1 - Math.exp(-dt * 7);
    camera.position.lerp(camPos, ease);
    easeTarget.lerp(camTarget, ease);
    camera.lookAt(easeTarget);

    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  easeTarget.copy(camTarget);
  frame = requestAnimationFrame(tick);

  return {
    strike: (power: number) => {
      const before = world;
      world = strike(world, aim, power);
      if (world !== before) striking = performance.now();
    },
    reset: () => {
      world = createRack();
      potted.length = 0;
      cushions = 0;
      sinking.clear();
      for (const mesh of meshes) if (mesh) mesh.visible = true;
      onHud(hudOf(world));
    },
    setMode: (next: CameraMode) => {
      mode = next;
    },
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      for (const item of disposables) item.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Line) object.geometry.dispose();
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}

/** Bilard 3D: ten sam stół co w 2D, tylko że z trzecim wymiarem. */
export function Billiards3dApp() {
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [broken, setBroken] = useState(false);
  const [hud, setHud] = useState<Hud>(hudOf(createRack()));
  const [power, setPower] = useState(0.6);
  const [mode, setMode] = useState<CameraMode>('behind');

  useEffect(() => {
    if (!host.current) return undefined;
    let built: Engine | null = null;
    try {
      built = buildScene(host.current, setHud);
    } catch {
      // No WebGL (or a driver that refused halfway): the 2D table is the same game.
      host.current.replaceChildren();
      setBroken(true);
      return undefined;
    }
    engine.current = built;
    setReady(true);
    return () => {
      built?.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setMode(mode);
  }, [mode]);

  return (
    <div className={shell.shell} data-testid="billiard3d">
      <div className={shell.hud}>
        <span key={hud.score} className={styles.score}>
          Punkty <strong>{hud.score}</strong>
          {hud.seq > 0 && hud.gained !== 0 && (
            <span key={hud.seq} className={styles.pop} data-testid="billiard3d-pop">
              {hud.gained > 0 ? `+${hud.gained}` : hud.gained}
            </span>
          )}
        </span>
        <span>
          Strzały <strong>{hud.shots}</strong>
        </span>
        <span>
          Do wbicia <strong>{hud.left}</strong>
        </span>
        <span className={hud.fouls > 0 ? styles.fouls : undefined}>
          Faule <strong>{hud.fouls}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <span className={styles.modes}>
          {CAMERA_MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={mode === option.id}
              className={`${styles.mode} ${mode === option.id ? styles.modeOn : ''}`}
              onClick={() => setMode(option.id)}
            >
              {option.label}
            </button>
          ))}
        </span>
        <button type="button" className={shell.action} onClick={() => engine.current?.reset()}>
          Nowy bilard
        </button>
      </div>

      <div className={`${shell.stage} ${styles.stage}`} ref={host} data-testid="billiard3d-stage">
        {broken && (
          <div className={styles.fallback} data-testid="billiard3d-nogl">
            <p>Ten silnik rysowania nie ma tu czym rysować.</p>
            <p>Przeglądarka nie dała WebGL — spróbuj bilarda 2D, ten sam stół z góry.</p>
          </div>
        )}
        {ready && hud.won && (
          <div className={styles.won} data-testid="billiard3d-won">
            <p>Stół sprzątnięty!</p>
            <p>
              {hud.score} punktów w {hud.shots} strzała{hud.shots === 1 ? 'ch' : 'ch'}
            </p>
          </div>
        )}
      </div>

      <div className={shell.hud}>
        <span className={styles.powerLabel}>
          Siła
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(power * 100)}
            onChange={(event) => setPower(Number(event.target.value) / 100)}
            aria-label="Siła uderzenia"
            className={styles.slider}
            data-testid="billiard3d-power"
          />
        </span>
        <button
          type="button"
          className={`${shell.action} ${shell.actionPrimary}`}
          onClick={() => engine.current?.strike(power)}
          data-testid="billiard3d-strike"
        >
          Uderz
        </button>
        <span className={shell.hudSpacer} />
        <span className={styles.tip}>Rusz myszą nad stołem, aby celować; przeciągnij, aby dobierać siłę.</span>
      </div>
    </div>
  );
}
