import { useCallback, useMemo, useState } from 'react';
import shell from '../gameShell.module.css';
import { DirectionPad } from '../shared/Pad';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import { useLoop } from '../shared/useLoop';
import { COLS, PIECE_COLORS, ROWS, createGame, ghostY, hardDrop, move, rotate, tick } from './tetris';
import type { TetrisGame } from './tetris';
import styles from './TetrisApp.module.css';

/** Tetris: klocek po klocku, aż zniknie cały wiersz. */
export function TetrisApp() {
  const [game, setGame] = useState<TetrisGame>(() => createGame(randomRng()));
  const [running, setRunning] = useState(false);

  const drop = useCallback(() => {
    setGame((current) => tick(current, randomRng()));
  }, []);

  useLoop(drop, running && !game.over ? Math.max(120, 620 - game.lines * 25) : null);

  const act = (what: 'left' | 'right' | 'rotate' | 'drop') => {
    setRunning(true);
    setGame((current) => {
      if (current.over) return current;
      if (what === 'left') return move(current, -1);
      if (what === 'right') return move(current, 1);
      if (what === 'rotate') return rotate(current);
      return hardDrop(current, randomRng());
    });
  };

  const cells = useMemo(() => {
    const ghost = ghostY(game);
    const shapeAt = (row: number, col: number) => {
      const local = { y: row - game.piece.y, x: col - game.piece.x };
      return Boolean(game.piece.shape[local.y]?.[local.x]);
    };
    const ghostAt = (row: number, col: number) => {
      const local = { y: row - ghost, x: col - game.piece.x };
      return row >= game.piece.y && Boolean(game.piece.shape[local.y]?.[local.x]);
    };

    return Array.from({ length: ROWS * COLS }, (_, position) => {
      const x = position % COLS;
      const y = Math.floor(position / COLS);
      const fixed = game.board[y][x];
      const cell = { key: position, 'data-cell': position };
      if (shapeAt(y, x)) {
        return (
          <span
            {...cell}
            data-piece={position}
            className={styles.cell}
            style={{ background: PIECE_COLORS[game.piece.kind] }}
          />
        );
      }
      if (fixed) {
        return <span {...cell} className={styles.cell} style={{ background: PIECE_COLORS[fixed] }} />;
      }
      if (ghostAt(y, x)) {
        return <span {...cell} className={`${styles.cell} ${styles.ghost}`} />;
      }
      return <span {...cell} className={styles.cell} />;
    });
  }, [game]);

  const restart = () => {
    setGame(createGame(randomRng()));
    setRunning(false);
  };

  return (
    <div className={shell.shell} data-testid="tetris">
      <div className={shell.hud}>
        <span>
          Punkty <strong>{game.score}</strong>
        </span>
        <span>
          Wiersze <strong>{game.lines}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <span className={styles.nextLabel}>
          Następny
          <span
            className={styles.next}
            style={{ background: PIECE_COLORS[game.next] }}
            aria-label={`Następny klocek ${game.next}`}
          />
        </span>
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
          style={boardStyle(COLS / ROWS)}
          tabIndex={0}
          onKeyDown={(event) => {
            const actions: Record<string, 'left' | 'right' | 'rotate' | 'drop'> = {
              ArrowLeft: 'left',
              ArrowRight: 'right',
              ArrowUp: 'rotate',
              ArrowDown: 'drop',
            };
            const action = actions[event.key];
            if (!action) return;
            event.preventDefault();
            act(action);
          }}
          data-testid="tetris-board"
        >
          <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gridTemplateRows: `repeat(${ROWS}, 1fr)` }}>
            {cells}
          </div>
          {game.over && (
            <div className={shell.overlay}>
              <h3>Kolumna urosła do sufitu</h3>
              <p>
                {game.score} punktów, {game.lines} wierszy.
              </p>
              <button type="button" className={`${shell.action} ${shell.actionPrimary}`} onClick={restart}>
                Od nowa
              </button>
            </div>
          )}
        </div>
      </div>

      <DirectionPad
        onDirection={(direction) =>
          act(direction === 'up' ? 'rotate' : direction === 'down' ? 'drop' : direction)
        }
      />
      <p className={shell.hint}>Strzałki: w lewo, w prawo, w górę obrót, w dół szybki spadek.</p>
    </div>
  );
}
