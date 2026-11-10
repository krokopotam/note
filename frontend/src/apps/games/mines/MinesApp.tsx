import { useState } from 'react';
import shell from '../gameShell.module.css';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import { adjacent, createGame, flagsUsed, reveal, toggleFlag } from './mines';
import type { MinesGame } from './mines';
import styles from './MinesApp.module.css';

const LEVELS = {
  łatwy: { cols: 9, rows: 9, mines: 10 },
  średni: { cols: 12, rows: 12, mines: 22 },
  trudny: { cols: 14, rows: 14, mines: 40 },
} as const;

type Level = keyof typeof LEVELS;

const DIGIT_COLORS = ['', '#5c9dff', '#4ec97f', '#ff8a5c', '#c07bff', '#ffd83d', '#4cc3ff', '#ff5d5d', '#e9effa'];

/** Saper: pierwsze kliknięcie nigdy nie jest miną, flaga zostawia pole ukryte. */
export function MinesApp() {
  const [level, setLevel] = useState<Level>('łatwy');
  const [mode, setMode] = useState<'open' | 'flag'>('open');
  const [game, setGame] = useState<MinesGame>(() => start('łatwy'));

  const startLevel = (next: Level) => {
    setLevel(next);
    setGame(start(next));
  };

  const click = (index: number) => {
    setGame((current) =>
      mode === 'flag' ? toggleFlag(current, index) : reveal(current, index, randomRng()),
    );
  };

  const left = game.mines - flagsUsed(game);
  const finished = game.state === 'won' || game.state === 'lost';

  return (
    <div className={shell.shell} data-testid="mines">
      <div className={shell.hud}>
        <label className={styles.picker}>
          Trudność
          <select
            value={level}
            onChange={(event) => startLevel(event.target.value as Level)}
            aria-label="Trudność"
          >
            {Object.keys(LEVELS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span>
          Mina do znalezienia <strong>{Math.max(left, 0)}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <button
          type="button"
          className={`${shell.action} ${mode === 'flag' ? shell.actionPrimary : ''}`}
          onClick={() => setMode(mode === 'flag' ? 'open' : 'flag')}
          aria-pressed={mode === 'flag'}
        >
          {mode === 'flag' ? 'Flaga: włączona' : 'Flaga: wyłączona'}
        </button>
        <button type="button" className={shell.action} onClick={() => setGame(start(level))}>
          Nowa gra
        </button>
      </div>

      <div className={shell.stage}>
        <div
          className={shell.board}
          style={boardStyle(game.cols / game.rows)}
          data-testid="mines-board"
        >
          <div
            className={styles.grid}
            style={{ gridTemplateColumns: `repeat(${game.cols}, 1fr)`, gridTemplateRows: `repeat(${game.rows}, 1fr)` }}
          >
          {game.bombs.map((bomb, index) => {
            const open = game.open[index];
            const count = adjacent(game, index);
            return (
              <button
                key={index}
                data-cell={index}
                type="button"
                className={[
                  styles.cell,
                  open ? (bomb ? styles.boom : styles.open) : '',
                  open && !bomb && count ? styles.number : '',
                ].join(' ')}
                style={open && !bomb && count ? { color: DIGIT_COLORS[count] } : undefined}
                onClick={() => click(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setGame((current) => toggleFlag(current, index));
                }}
                aria-label={
                  open ? `pole ${index + 1}: ${count}` : `pole ${index + 1}${game.flag[index] ? ', flaga' : ''}`
                }
              >
                {open ? (bomb ? '💣' : count || '') : game.flag[index] ? '🚩' : ''}
              </button>
            );
          })}
          </div>
          {finished && (
            <div className={shell.overlay}>
              <h3>{game.state === 'won' ? 'Wszystkie miny znalezione' : 'Boom'}</h3>
              <p>
                Odsłoniętych pól: {game.opened} z {game.cols * game.rows - game.mines}.
              </p>
              <button
                type="button"
                className={`${shell.action} ${shell.actionPrimary}`}
                onClick={() => setGame(start(level))}
              >
                Jeszcze raz
              </button>
            </div>
          )}
        </div>
      </div>

      <p className={shell.hint}>
        Przytrzymanie prawego przycisku stawia flagę; na telefonie przełącz „Flaga".
      </p>
    </div>
  );
}

function start(level: Level): MinesGame {
  const { cols, rows, mines } = LEVELS[level];
  return createGame(cols, rows, mines);
}
