'use client';

import { useState, useEffect, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';

const DEADLINE_KEY = 'turnDeadline';

export default function GuessingPhase() {
  const { gameState, opponentAway, playerId, makeGuess } = useGame();
  const { t } = useLanguage();
  const [confirmGuess, setConfirmGuess] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(10);
  const [lastResult, setLastResult] = useState<{ number: number; response: string } | null>(null);
  const prevGuessCountRef = useRef(0);

  const isPlayer1 = gameState?.player1.id === playerId;
  const opponent = isPlayer1 ? gameState?.player2 : gameState?.player1;
  const myPlayer = isPlayer1 ? gameState?.player1 : gameState?.player2;
  const mySecretNumber = myPlayer?.selectedNumber;

  const myMinRange = myPlayer?.minRange ?? gameState?.settings.minNumber ?? 1;
  const myMaxRange = myPlayer?.maxRange ?? gameState?.settings.maxNumber ?? 100;
  const timeLimit = gameState?.settings.turnTimeLimit ?? 10;

  const isMyTurn = gameState?.currentTurnPlayerId === playerId;
  // Identifies the turn: a pending guess is taken back on rejoin, so only answered ones count.
  const turn = gameState?.guesses.filter(g => g.response !== 'pending').length ?? 0;

  // Detect new resolved guesses and show result briefly
  useEffect(() => {
    const resolved = gameState?.guesses.filter(g => g.response !== 'pending') ?? [];
    if (resolved.length > prevGuessCountRef.current) {
      const newest = resolved[resolved.length - 1];
      prevGuessCountRef.current = resolved.length;
      setLastResult({ number: newest.number, response: newest.response });
      const timer = setTimeout(() => setLastResult(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [gameState?.guesses]);

  // Timer: counts down only on my turn, and only if there's a time limit.
  // Starts over when a disconnected opponent comes back. The deadline sits in
  // session storage, so refreshing the page does not restart my turn.
  useEffect(() => {
    setTimeLeft(timeLimit);
    if (!isMyTurn || timeLimit === 0 || opponentAway) return;
    let deadline = Date.now() + timeLimit * 1000;
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEADLINE_KEY) ?? 'null');
      if (saved?.turn === turn) deadline = saved.deadline;
      else sessionStorage.setItem(DEADLINE_KEY, JSON.stringify({ turn, deadline }));
    } catch {}
    const tick = () => setTimeLeft(Math.max(Math.ceil((deadline - Date.now()) / 1000), 0));
    tick();
    const timer = setInterval(tick, 250);
    // Runs when the turn ends, not on a page refresh.
    return () => {
      clearInterval(timer);
      try { sessionStorage.removeItem(DEADLINE_KEY); } catch {}
    };
  }, [isMyTurn, timeLimit, opponentAway, turn]);

  // Time's up: guess a random number from my valid range
  useEffect(() => {
    if (!isMyTurn || timeLimit === 0 || timeLeft > 0 || opponentAway) return;
    setConfirmGuess(null);
    makeGuess(Math.floor(Math.random() * (myMaxRange - myMinRange + 1)) + myMinRange);
  }, [isMyTurn, timeLimit, timeLeft, myMinRange, myMaxRange, makeGuess]);

  const handleGuess = () => {
    if (confirmGuess !== null && isMyTurn) {
      makeGuess(confirmGuess);
      setConfirmGuess(null);
    }
  };

  const validNumbers = Array.from({ length: myMaxRange - myMinRange + 1 }, (_, i) => myMinRange + i);
  const resolvedGuesses = gameState?.guesses.filter(g => g.response !== 'pending') ?? [];

  const resultColors: Record<string, string> = {
    correct: 'bg-green-600 text-white',
    higher: 'bg-blue-600 text-white',
    lower: 'bg-orange-500 text-white',
  };

  const resultLabel = (r: string) => {
    if (r === 'higher') return t('higher');
    if (r === 'lower') return t('lower');
    return t('correct');
  };

  const GuessHistory = () => (
    resolvedGuesses.length > 0 ? (
      <div className="bg-secondary rounded-xl p-4">
        <p className="text-sm font-semibold mb-3">{t('recentGuesses')}</p>
        <div className="space-y-2">
          {resolvedGuesses.slice(-5).reverse().map((g, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground w-1/3 truncate">
                {g.guesser === playerId ? t('you') : opponent?.name}
              </span>
              <span className="font-mono font-bold">{g.number}</span>
              <span className={`font-semibold w-1/3 text-right ${
                g.response === 'higher' ? 'text-blue-500'
                : g.response === 'lower' ? 'text-orange-500'
                : 'text-green-500'
              }`}>
                {resultLabel(g.response)}
              </span>
            </div>
          ))}
        </div>
      </div>
    ) : null
  );

  // Result overlay
  const ResultOverlay = lastResult ? (
    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
      <div className={`text-center px-12 py-8 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200 ${resultColors[lastResult.response] ?? 'bg-secondary'}`}>
        <p className="text-sm font-medium opacity-80 mb-1">{lastResult.number}</p>
        <p className="text-5xl font-bold">{resultLabel(lastResult.response)}</p>
      </div>
    </div>
  ) : null;

  // Waiting for opponent's guess
  if (!isMyTurn) {
    return (
      <>
        {ResultOverlay}
      <div className="w-full max-w-2xl mx-auto space-y-6 fade-in">
        <div className="text-center space-y-1">
          <h2 className="text-4xl font-bold mb-2">🤔</h2>
          <h2 className="text-2xl font-bold">{opponent?.name}{t('opponentTurn')}</h2>
          <p className="text-muted-foreground">{t('waitingForGuess')}</p>
        </div>

          <div className="bg-secondary rounded-xl p-8 text-center">
            <p className="text-5xl animate-pulse text-muted-foreground">...</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('validRange')}</p>
              <p className="text-2xl font-bold">{myMinRange} – {myMaxRange}</p>
            </div>
            <div className="bg-secondary rounded-xl p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{t('totalGuesses')}</p>
              <p className="text-2xl font-bold">{resolvedGuesses.length}</p>
            </div>
          </div>

          <div className="bg-secondary rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{t('yourSecretNumber')}</p>
            <p className="text-3xl font-bold text-primary">{mySecretNumber}</p>
          </div>

          <GuessHistory />
        </div>
      </>
    );
  }

  // My turn to guess
  return (
    <>
      {ResultOverlay}
      <div className="w-full max-w-2xl mx-auto space-y-6 fade-in">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold mb-1">🎲</h2>
            <h2 className="text-2xl font-bold">{t('yourTurn')}</h2>
            <p className="text-muted-foreground text-sm">{t('guessNumber')} {opponent?.name}</p>
          </div>
          {timeLimit > 0 && (
            <div className="text-center bg-secondary rounded-xl px-4 py-2">
              <p className="text-xs text-muted-foreground">{t('turnTimeLimit')}</p>
              <p className={`text-3xl font-bold tabular-nums ${timeLeft <= 3 ? 'text-destructive animate-pulse' : 'text-primary'}`}>
                {timeLeft}s
              </p>
            </div>
          )}
        </div>

        <div className="bg-secondary rounded-xl p-5">
          <p className="text-xs text-muted-foreground mb-1 text-center">{t('validRange')}</p>
          <p className="text-3xl font-bold text-center mb-5">{myMinRange} – {myMaxRange}</p>
          <div className="number-grid">
            {validNumbers.map((num) => (
              <button
                key={num}
                onClick={() => setConfirmGuess(num)}
                className="number-box number-box-active"
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-secondary rounded-xl p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">{t('yourSecretNumber')}</p>
          <p className="text-3xl font-bold text-primary">{mySecretNumber}</p>
        </div>

        <GuessHistory />
      </div>

      {/* Confirm guess popup */}
      {confirmGuess !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-background border border-border rounded-2xl p-8 w-full max-w-xs mx-4 text-center space-y-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <p className="text-muted-foreground text-sm">{t('confirmNumber')}</p>
            <p className="text-7xl font-bold text-primary">{confirmGuess}</p>
            <p className="text-sm text-muted-foreground">{t('areYouSure')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmGuess(null)}
                className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:opacity-80 transition-opacity"
              >
                {t('back')}
              </button>
              <button
                onClick={handleGuess}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                {t('guess')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
