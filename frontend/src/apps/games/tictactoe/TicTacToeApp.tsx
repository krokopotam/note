import { useEffect, useState } from 'react';
import shell from '../gameShell.module.css';
import { boardStyle } from '../shared/board';
import { randomRng } from '../shared/random';
import { bestMove, emptyField, isFull, play, winner, winningMove } from './tictactoe';
import type { Field, Mark } from './tictactoe';
import styles from './TicTacToeApp.module.css';

const HUMAN: Mark = 'X';
const CPU: Mark = 'O';

/** Kółko i krzyżyk: słaby przeciwnik liczy do trzech, mocny liczy wszystko. */
export function TicTacToeApp() {
  const [field, setField] = useState<Field>(emptyField);
  const [hard, setHard] = useState(true);
  const [tally, setTally] = useState({ wins: 0, losses: 0, draws: 0 });
  const [thinking, setThinking] = useState(false);

  const result = winner(field);
  const draw = !result && isFull(field);

  const put = (index: number) => {
    if (field[index] || result || thinking) return;
    setField(play(field, index, HUMAN));
  };

  useEffect(() => {
    if (result || draw) {
      setTally((current) => ({
        wins: current.wins + (result?.mark === HUMAN ? 1 : 0),
        losses: current.losses + (result?.mark === CPU ? 1 : 0),
        draws: current.draws + (draw ? 1 : 0),
      }));
      return;
    }
    if (isFull(field)) return undefined;
    // It is the opponent's turn only when one X is on the board more than O —
    // which also stops it from opening the game on an empty board.
    if (count(field, HUMAN) === count(field, CPU)) return undefined;

    // The opponent answers on the next beat, so the move is visible as a move.
    setThinking(true);
    const id = window.setTimeout(() => {
      setField((current) => {
        if (winner(current) || isFull(current)) return current;
        const rng = randomRng();
        const smart = hard ? bestMove(current, CPU) : takeSomethingEasy(current, rng());
        const index = smart >= 0 ? smart : current.findIndex((square) => !square);
        return index >= 0 ? play(current, index, CPU) : current;
      });
      setThinking(false);
    }, 260);
    return () => window.clearTimeout(id);
    // Only the board decides when the opponent has to answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field, hard]);

  const restart = () => setField(emptyField());

  return (
    <div className={shell.shell} data-testid="tictactoe">
      <div className={shell.hud}>
        <span>
          Ty <strong>{tally.wins}</strong>
        </span>
        <span>
          Komputer <strong>{tally.losses}</strong>
        </span>
        <span>
          Remisy <strong>{tally.draws}</strong>
        </span>
        <span className={shell.hudSpacer} />
        <button
          type="button"
          className={`${shell.action} ${hard ? shell.actionPrimary : ''}`}
          onClick={() => setHard(!hard)}
          aria-pressed={hard}
        >
          {hard ? 'Trudny przeciwnik' : 'Łatwy przeciwnik'}
        </button>
        <button type="button" className={shell.action} onClick={restart}>
          Nowa runda
        </button>
      </div>

      <div className={shell.stage}>
        <div className={shell.board} style={boardStyle(1)} data-testid="tictactoe-board">
          <div className={styles.grid}>
            {field.map((square, index) => (
              <button
                key={index}
                type="button"
                className={`${styles.square} ${result?.line.includes(index) ? styles.winning : ''}`}
                onClick={() => put(index)}
                disabled={Boolean(square) || Boolean(result) || thinking}
                aria-label={`Pole ${index + 1}${square ? `: ${square}` : ''}`}
                data-testid={`square-${index}`}
              >
                <span className={square === 'X' ? styles.x : styles.o}>{square ?? ''}</span>
              </button>
            ))}
          </div>
          {(result || draw) && (
            <div className={shell.overlay}>
              <h3>{result ? (result.mark === HUMAN ? 'Twoja linia!' : 'Komputer wygrał') : 'Remis'}</h3>
              <p>{hard ? 'Przy trudnym przeciwniku nie da się wygrać — można tylko zremisować.' : 'Łatwy przeciwnik liczy do trzech.'}</p>
              <button type="button" className={`${shell.action} ${shell.actionPrimary}`} onClick={restart}>
                Nowa runda
              </button>
            </div>
          )}
        </div>
      </div>

      <p className={shell.hint}>Zaczynasz Ty. Trudny przeciwnik sprawdzi każde rozgałęzienie.</p>
    </div>
  );
}

const count = (field: Field, mark: Mark) => field.filter((square) => square === mark).length;

/** The easy opponent: win if it can, otherwise take any free square. */
function takeSomethingEasy(field: Field, roll: number): number {
  const winning = winningMove(field, CPU);
  if (winning >= 0) return winning;
  const free = field.map((square, index) => (square ? -1 : index)).filter((index) => index >= 0);
  return free[Math.floor(roll * free.length)] ?? -1;
}
