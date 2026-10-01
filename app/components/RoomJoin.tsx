'use client';

import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';

export default function RoomJoin() {
  const { gameState, leaveGame } = useGame();
  const { t } = useLanguage();

  if (!gameState) return null;
  const settings = gameState.settings;

  return (
      <div className="w-full max-w-md mx-auto space-y-6 fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-bold mb-2">⏳</h2>
        <h2 className="text-2xl font-bold">{t('waitingForPlayer')}</h2>
        <p className="text-muted-foreground">{t('shareCode')}</p>
      </div>

        <div className="bg-secondary rounded-xl p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">{t('roomCode')}</p>
          <p className="text-5xl font-mono font-bold tracking-widest text-primary">
            {gameState.roomCode}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(gameState.roomCode)}
            className="w-full py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm font-medium"
          >
            {t('copyCode')}
          </button>
        </div>

        {settings && (
          <div className="bg-secondary rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('gameSettings')}</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('minNumber')} / {t('maxNumber')}</span>
              <span className="font-mono font-semibold">{settings.minNumber} – {settings.maxNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('turnTimeLimit')}</span>
              <span className="font-semibold">{settings.turnTimeLimit === 0 ? t('noLimit') : `${settings.turnTimeLimit}s`}</span>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex-1 bg-secondary rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-2">{t('you')}</p>
            <p className="text-2xl mb-1">{gameState.player1.avatar}</p>
            <p className="font-semibold text-sm">{gameState.player1.name}</p>
          </div>
          <div className="flex items-center justify-center text-xl text-muted-foreground">vs</div>
          <div className="flex-1 bg-muted rounded-xl p-4 text-center animate-pulse">
            <p className="text-xs text-muted-foreground mb-2">{t('waiting')}</p>
            <p className="text-2xl mb-1">?</p>
            <p className="font-semibold text-sm text-muted-foreground">?</p>
          </div>
        </div>

        <button
          onClick={leaveGame}
          className="w-full py-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity font-medium"
        >
          {t('leaveRoom')}
        </button>
      </div>
    );
}
