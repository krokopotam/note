import { useEffect, useMemo, useState } from 'react';
import shell from '../gameShell.module.css';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import { createGame, pick, settle } from './memory';
import type { MemoryGame } from './memory';
import styles from './MemoryApp.module.css';

/** Pamięć: dwie karty naraz, pary zostają odkryte. */
export function MemoryApp() {
  const [game, setGame] = useState<MemoryGame>(() => createGame(8, randomRng()));

  // A wrong pair has to be seen before it turns back over.
  useEffect(() => {
    if (game.showing.length < 2) return undefined;
    const id = window.setTimeout(() => setGame((current) => settle(current)), 750);
    return () => window.clearTimeout(id);
  }, [game.showing]);

  const restart = () => setGame(createGame(8, randomRng()));
  const found = useMemo(() => game.cards.filter((card) => card.matched).length / 2, [game.cards]);

  return (
    <div className={shell.shell} data-testid="memory">
      <div className={shell.hud}>
        <span>
          Ruchy <strong>{game.moves}</strong>
        </span>
        <span>
          Pary <strong>{found}</strong> / 8
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
          data-testid="memory-board"
        >
          <div className={styles.grid} style={{ gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)' }}>
            {game.cards.map((card, index) => (
              <button
                key={index}
                type="button"
                className={`${styles.card} ${card.up || card.matched ? styles.up : ''} ${card.matched ? styles.matched : ''}`}
                onClick={() => setGame((current) => pick(current, index))}
                aria-label={card.up || card.matched ? card.picture : `zakryta karta ${index + 1}`}
                data-testid={`memory-card-${index}`}
              >
                <span className={styles.face}>{card.up || card.matched ? card.picture : ''}</span>
              </button>
            ))}
          </div>
          {game.won && (
            <div className={shell.overlay}>
              <h3>Wszystkie pary znalezione</h3>
              <p>{game.moves} ruchów.</p>
              <button type="button" className={`${shell.action} ${shell.actionPrimary}`} onClick={restart}>
                Jeszcze raz
              </button>
            </div>
          )}
        </div>
      </div>

      <p className={shell.hint}>Odkryj dwie karty — niepasujące znikną po chwili.</p>
    </div>
  );
}
