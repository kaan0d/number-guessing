'use client';

import { useState, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import MainMenu from './components/MainMenu';
import RoomJoin from './components/RoomJoin';
import NumberSelection from './components/NumberSelection';
import GuessingPhase from './components/GuessingPhase';
import EndGame from './components/EndGame';

function GameContent() {
  const { gameState, leaveGame } = useGame();
  const { language, setLanguage, t } = useLanguage();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const initial = (saved as 'light' | 'dark') || 'dark';
    setTheme(initial);
    if (initial === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, []);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b border-border px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold">{t('appTitle')}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="px-3 py-2 rounded-lg hover:bg-secondary text-sm"
              title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'tr')}
              className="px-3 py-2 rounded-lg bg-secondary text-foreground border border-border text-sm"
            >
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
            </select>
          </div>
        </header>
        <MainMenu />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-4 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">{t('appTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('room')} {gameState.roomCode}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="px-3 py-2 rounded-lg hover:bg-secondary text-sm"
            title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'en' | 'tr')}
            className="px-3 py-2 rounded-lg bg-secondary text-foreground border border-border text-sm"
          >
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        {gameState.gamePhase === 'lobby' && <MainMenu />}
        {gameState.gamePhase === 'waiting' && <RoomJoin />}
        {gameState.gamePhase === 'number_selection' && <NumberSelection />}
        {gameState.gamePhase === 'guessing' && <GuessingPhase />}
        {gameState.gamePhase === 'ended' && <EndGame />}
        {gameState.gamePhase === 'cancelled' && (
          <div className="w-full max-w-md mx-auto text-center space-y-6 fade-in">
            <div className="text-6xl">👋</div>
            <h2 className="text-2xl font-bold">{t('opponentLeft')}</h2>
            <p className="text-muted-foreground">
              {t('playerDisconnected')}
            </p>
            <button
              onClick={leaveGame}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              {t('returnToMenu')}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <LanguageProvider>
      <GameProvider>
        <GameContent />
      </GameProvider>
    </LanguageProvider>
  );
}
