import { useCallback, useState } from 'react';
import shell from '../gameShell.module.css';
import { DirectionPad, useSwipe } from '../shared/Pad';
import type { Direction } from '../shared/Pad';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import { createBoard, hasMoveLeft, highest, move, spawn } from './twentyforty';
import type { TileBoard } from './twentyforty';
import styles from './TwentyFortyApp.module.css';

/** 2048: zsuwaj płytki, łącz je w pary i nie zablokuj planszy. */
export function TwentyFortyApp() {
  const [board, setBoard] = useState<TileBoard>(() => seeded());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  const slide = useCallback((direction: Direction) => {
    setBoard((current) => {
      const result = move(current, direction);
      if (!result.moved) return current;
      setScore((value) => {
        const next = value + result.gained;
        setBest((record) => Math.max(record, next));
        return next;
      });
      const rng = randomRng();
      return spawn(result.board, rng() < 0.9 ? 2 : 4, Math.floor(rng() * 100));
    });
  }, []);

  const restart = () => {
    setBoard(seeded());
    setScore(0);
  };

  const swipe = useSwipe(slide);
  const stuck = !hasMoveLeft(board);
  const won = highest(board) >= 2048;

  return (
    <div className={shell.shell} data-testid="twentyforty">
      <div className={shell.hud}>
        <span>
          Wynik <strong>{score}</strong>
        </span>
        <span>
          Rekord <strong>{best}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <button type="button" className={shell.action} onClick={restart}>
          Nowa gra
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
            slide(direction);
          }}
          {...swipe}
          data-testid="twentyforty-board"
        >
          <div className={styles.grid}>
            {board.map((value, index) => (
              <span
                key={index}
                data-slot={value || 0}
                className={value ? `${styles.tile} ${styles[`tile${value}`] ?? styles.tileBig} ${styles.pop}` : styles.slot}
                data-testid={value ? `tile-${index}` : undefined}
              >
                {value || ''}
              </span>
            ))}
          </div>
          {(stuck || won) && (
            <div className={shell.overlay}>
              <h3>{won ? 'Jest 2048!' : 'Plansza zablokowana'}</h3>
              <p>{score} punktów.</p>
              <button type="button" className={`${shell.action} ${shell.actionPrimary}`} onClick={restart}>
                Nowa gra
              </button>
            </div>
          )}
        </div>
      </div>

      <DirectionPad onDirection={slide} />
      <p className={shell.hint}>Strzałki albo swipe — dwie takie same płytki zlewają się w jedną.</p>
    </div>
  );
}

/** Two tiles at start, on squares the swipe did not touch yet. */
function seeded(): TileBoard {
  const rng = randomRng();
  return spawn(spawn(createBoard(), 2, Math.floor(rng() * 16)), 4, Math.floor(rng() * 16));
}
