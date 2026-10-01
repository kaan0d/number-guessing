'use client';

import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';

export default function NumberSelection() {
  const { gameState, playerId, selectNumber } = useGame();
  const { t } = useLanguage();
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmNum, setConfirmNum] = useState<number | null>(null);

  const isPlayer1 = gameState?.player1.id === playerId;
  const myNumber = isPlayer1 ? gameState?.player1.selectedNumber : gameState?.player2?.selectedNumber;
  const minNum = gameState?.settings.minNumber ?? 1;
  const maxNum = gameState?.settings.maxNumber ?? 100;
  const numbers = Array.from({ length: maxNum - minNum + 1 }, (_, i) => minNum + i);

  useEffect(() => {
    if (myNumber !== undefined) {
      setSelected(myNumber);
      setSubmitted(true);
    }
  }, [myNumber]);

  const handleNumberClick = (num: number) => {
    if (!submitted) setConfirmNum(num);
  };

  const handleConfirm = () => {
    if (confirmNum !== null) {
      setSelected(confirmNum);
      selectNumber(confirmNum);
      setSubmitted(true);
      setConfirmNum(null);
    }
  };

  const bothReady = gameState?.player1.isReady && gameState?.player2?.isReady;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 fade-in">
      <div className="text-center space-y-1">
        <h2 className="text-4xl font-bold mb-3">🎯</h2>
        <h2 className="text-2xl font-bold">{t('selectYourNumber')}</h2>
        <p className="text-muted-foreground text-sm">{t('pickNumber')} ({minNum} – {maxNum})</p>
      </div>

      {submitted && (
        <div className="border border-border rounded-xl p-5 text-center">
          <p className="text-sm text-muted-foreground mb-2">{t('yourSecretNumber')}</p>
          <p className="text-6xl font-bold text-primary">{selected}</p>
        </div>
      )}

      <div className="bg-secondary rounded-xl p-4">
        {submitted ? (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <p className="text-muted-foreground text-sm">{t('waitingForOpponent')}</p>
            <p className="text-5xl animate-pulse text-muted-foreground">...</p>
          </div>
        ) : (
          <div className="number-grid">
            {numbers.map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num)}
                className="number-box number-box-active"
              >
                {num}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-secondary rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">{t('you')}</p>
          <p className="text-2xl mb-1">{gameState?.player1.avatar}</p>
          <p className="text-sm font-semibold">{gameState?.player1.name}</p>
          {gameState?.player1.isReady && <p className="text-xs text-green-500 mt-2">✅ {t('ready')}</p>}
        </div>

        <div className="bg-secondary rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">{t('opponent')}</p>
          <p className="text-2xl mb-1">{gameState?.player2?.avatar ?? '?'}</p>
          <p className="text-sm font-semibold">{gameState?.player2?.name ?? '?'}</p>
          {gameState?.player2?.isReady ? (
            <p className="text-xs text-green-500 mt-2">✅ {t('ready')}</p>
          ) : (
            <p className="text-xs text-muted-foreground animate-pulse mt-2">{t('waiting')}</p>
          )}
        </div>
      </div>

      {bothReady && (
        <div className="border border-green-500 rounded-xl p-4 text-center animate-pulse">
          <p className="text-sm font-semibold text-green-500">{t('bothReady')}</p>
        </div>
      )}

      {/* Confirm popup */}
      {confirmNum !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-background border border-border rounded-2xl p-8 w-full max-w-xs mx-4 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <p className="text-muted-foreground text-sm">{t('confirmNumber')}</p>
            <p className="text-7xl font-bold text-primary">{confirmNum}</p>
            <p className="text-sm text-muted-foreground">{t('areYouSure')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmNum(null)}
                className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:opacity-80 transition-opacity"
              >
                {t('back')}
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                {t('lockIn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
