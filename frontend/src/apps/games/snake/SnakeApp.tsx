import { useCallback, useMemo, useState } from 'react';
import shell from '../gameShell.module.css';
import { DirectionPad, useSwipe } from '../shared/Pad';
import type { Direction } from '../shared/Pad';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import { useLoop } from '../shared/useLoop';
import { createGame, step, turn } from './snake';
import type { SnakeGame } from './snake';
import styles from './SnakeApp.module.css';

const COLS = 15;
const ROWS = 15;

/** Wężyk: jedz jabłko, nie dotknij ściany ani siebie. */
export function SnakeApp() {
  const [game, setGame] = useState<SnakeGame>(() => createGame(COLS, ROWS, randomRng()));
  const [running, setRunning] = useState(false);
  const [best, setBest] = useState(0);

  const tick = useCallback(() => {
    setGame((current) => {
      if (current.over) return current;
      const next = step(current, randomRng());
      if (next.score > best) setBest(next.score);
      return next;
    });
  }, [best]);

  useLoop(tick, running && !game.over ? Math.max(80, 170 - game.score * 4) : null);

  const steer = useCallback(
    (direction: Direction) => {
      setGame((current) => turn(current, direction));
      setRunning(true);
    },
    [],
  );

  const restart = () => {
    setGame(createGame(COLS, ROWS, randomRng()));
    setRunning(false);
  };

  const swipe = useSwipe(steer);
  const cells = useMemo(() => {
    const body = new Map(game.body.map((cell, index) => [`${cell.x},${cell.y}`, index]));
    return Array.from({ length: ROWS * COLS }, (_, position) => {
      const x = position % COLS;
      const y = Math.floor(position / COLS);
      const segment = body.get(`${x},${y}`);
      const cell = { key: position, 'data-cell': position };
      if (segment === 0) return <span {...cell} data-head={position} className={styles.head} />;
      if (segment !== undefined) return <span {...cell} className={styles.body} />;
      if (game.food.x === x && game.food.y === y) return <span {...cell} className={styles.food} />;
      return <span {...cell} className={styles.empty} />;
    });
  }, [game]);

  return (
    <div className={shell.shell} data-testid="snake">
      <div className={shell.hud}>
        <span>
          Wynik <strong>{game.score}</strong>
        </span>
        <span>
          Rekord <strong>{best}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <button type="button" className={shell.action} onClick={() => setRunning((value) => !value)}>
          {running ? 'Pauza' : 'Start'}
        </button>
        <button type="button" className={shell.action} onClick={restart}>
          Od nowa
        </button>
      </div>

      <div className={shell.stage}>
        <div
          className={shell.board}
          style={boardStyle(1)}
          tabIndex={0}
          onKeyDown={(event) => {
            const map: Record<string, Direction> = {
              ArrowUp: 'up',
              ArrowDown: 'down',
              ArrowLeft: 'left',
              ArrowRight: 'right',
            };
            const direction = map[event.key];
            if (!direction) return;
            event.preventDefault();
            steer(direction);
          }}
          {...swipe}
          data-testid="snake-board"
        >
          <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
            {cells}
          </div>
          {game.over && (
            <div className={shell.overlay}>
              <h3>{game.score >= best && game.score > 0 ? 'Nowy rekord!' : 'Koniec!'}</h3>
              <p>Wężyk miał {game.body.length} części.</p>
              <button type="button" className={`${shell.action} ${shell.actionPrimary}`} onClick={restart}>
                Jeszcze raz
              </button>
            </div>
          )}
        </div>
      </div>

      <DirectionPad onDirection={steer} />
      <p className={shell.hint}>Strzałki lub swipe — węża nie da się obrócić o sto osiemdziesiąt stopni.</p>
    </div>
  );
}
