'use client';

import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';

export default function EndGame() {
  const { gameState, playerId, rematch, leaveGame } = useGame();
  const { t } = useLanguage();

  const isWinner = gameState?.winner === playerId;
  const winner = gameState?.winner === gameState?.player1.id ? gameState?.player1 : gameState?.player2;
  const loser = gameState?.winner === gameState?.player1.id ? gameState?.player2 : gameState?.player1;
  const myNumber = gameState?.player1.id === playerId ? gameState?.player1.selectedNumber : gameState?.player2?.selectedNumber;
  const totalGuesses = gameState?.guesses.filter(g => g.response !== 'pending').length ?? 0;

  return (
    <div className="w-full max-w-md mx-auto space-y-6 fade-in">
      {isWinner ? (
        <div className="text-center space-y-3">
          <h2 className="text-5xl font-bold mb-2">🎉</h2>
          <h2 className="text-4xl font-bold text-green-500">{t('youWon')}</h2>
          <p className="text-muted-foreground">
            {t('youGuessedCorrectly')} {loser?.name}{t('numberCorrectly')}
          </p>
        </div>
      ) : (
        <div className="text-center space-y-3">
          <h2 className="text-5xl font-bold mb-2">😔</h2>
          <h2 className="text-4xl font-bold text-destructive">{t('youLost')}</h2>
          <p className="text-muted-foreground">
            {winner?.name} {t('opponentGuessedYour')} {totalGuesses} {t('tries')}
          </p>
        </div>
      )}

      <div className="bg-secondary rounded-xl p-5 text-center space-y-1">
        <p className="text-sm text-muted-foreground">{t('guessesMode')}</p>
        <p className="text-5xl font-bold">{totalGuesses}</p>
      </div>

      <div className="bg-secondary rounded-xl p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('secretNumbers')}</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">{gameState?.player1.name}</p>
            <p className="text-3xl font-bold text-primary font-mono">{gameState?.player1.selectedNumber}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">{gameState?.player2?.name}</p>
            <p className="text-3xl font-bold text-primary font-mono">{gameState?.player2?.selectedNumber}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={rematch}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
        >
          {t('playAgain')}
        </button>
        <button
          onClick={leaveGame}
          className="w-full py-2 rounded-xl bg-secondary text-secondary-foreground hover:opacity-80 transition-opacity"
        >
          {t('mainMenu')}
        </button>
      </div>
    </div>
  );
}
