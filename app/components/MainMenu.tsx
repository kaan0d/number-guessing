'use client';

import { useState } from 'react';
import { useGame, GameSettings } from '../context/GameContext';
import { useLanguage } from '../context/LanguageContext';

const DEFAULT_SETTINGS: GameSettings = { minNumber: 1, maxNumber: 100, turnTimeLimit: 10 };

const RANDOM_NAMES = [
  'ShadowFox', 'IronWolf', 'CryptoKing', 'NightOwl', 'StormBird',
  'BlazeFist', 'FrostByte', 'DarkMatter', 'PixelHero', 'ZeroPoint',
  'AceViper', 'LunarEdge', 'VoidWalker', 'ThunderCat', 'CosmicRay',
];

function randomName() {
  return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

export default function MainMenu() {
  const { createGame, startSolo, joinGame } = useGame();
  const { t, language, setLanguage } = useLanguage();
  const [name, setName] = useState(() => randomName());
  const [view, setView] = useState<'main' | 'settings' | 'join'>('main');
  const [solo, setSolo] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState('');

  const validateSettings = (): boolean => {
    if (settings.minNumber < 1 || settings.maxNumber > 9999) {
      setSettingsError(language === 'tr' ? 'Aralık 1-9999 arasında olmalı.' : 'Range must be between 1 and 9999.');
      return false;
    }
    if (settings.minNumber >= settings.maxNumber) {
      setSettingsError(language === 'tr' ? 'Minimum, maksimumdan küçük olmalı.' : 'Min must be less than max.');
      return false;
    }
    if (settings.maxNumber - settings.minNumber < 9) {
      setSettingsError(language === 'tr' ? 'Aralık en az 10 sayı içermeli.' : 'Range must span at least 10 numbers.');
      return false;
    }
    setSettingsError('');
    return true;
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    if (!validateSettings()) return;
    (solo ? startSolo : createGame)(name.trim(), settings);
  };

  const handleJoin = () => {
    if (name.trim() && roomCode.trim().length === 4) {
      joinGame(roomCode.trim(), name.trim());
    }
  };

  // --- JOIN VIEW ---
  if (view === 'join') {
    return (
      <div className="w-full max-w-md mx-auto space-y-6 slide-in p-4">
        <div className="text-center space-y-1">
          <h1 className="text-4xl font-bold mb-2">🔓</h1>
          <h1 className="text-3xl font-bold">{t('joinGame')}</h1>
          <p className="text-muted-foreground text-sm">{t('enterRoomCode')}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">{t('yourName')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="flex-1 px-4 py-2 rounded-lg bg-secondary text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={() => setName(randomName())}
                title={language === 'tr' ? 'Rastgele isim' : 'Random name'}
                className="px-3 py-2 rounded-lg bg-secondary border border-border hover:bg-border transition-colors text-lg"
              >
                🎲
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('roomCode')}</label>
            <input
              type="text"
              inputMode="numeric"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              maxLength={4}
              className="w-full px-4 py-2 rounded-lg bg-secondary text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary text-center text-2xl font-mono tracking-widest"
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={!name.trim() || roomCode.trim().length !== 4}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {t('joinGame')}
          </button>

          <button onClick={() => setView('main')} className="w-full py-2 rounded-lg bg-secondary text-secondary-foreground hover:opacity-80 transition-opacity">
            {t('back')}
          </button>
        </div>
      </div>
    );
  }

  // --- SETTINGS VIEW ---
  if (view === 'settings') {
    return (
      <div className="w-full max-w-md mx-auto space-y-6 slide-in p-4">
        <div className="text-center space-y-1">
          <h1 className="text-4xl font-bold mb-2">⚙️</h1>
          <h1 className="text-3xl font-bold">{t(solo ? 'playComputer' : 'createGame')}</h1>
          <p className="text-muted-foreground text-sm">{t('configureSettings')}</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">{t('yourName')}</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="flex-1 px-4 py-2 rounded-lg bg-secondary text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={() => setName(randomName())}
                title={language === 'tr' ? 'Rastgele isim' : 'Random name'}
                className="px-3 py-2 rounded-lg bg-secondary border border-border hover:bg-border transition-colors text-lg"
              >
                🎲
              </button>
            </div>
          </div>

          <div className="bg-secondary rounded-xl p-5 space-y-5">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('gameSettings')}</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">{t('minNumber')}</label>
                <input
                  type="number"
                  min={1}
                  max={settings.maxNumber - 1}
                  value={settings.minNumber}
                  onChange={(e) => setSettings(s => ({ ...s, minNumber: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg bg-background text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary text-center font-mono text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">{t('maxNumber')}</label>
                <input
                  type="number"
                  min={settings.minNumber + 1}
                  max={9999}
                  value={settings.maxNumber}
                  onChange={(e) => setSettings(s => ({ ...s, maxNumber: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-lg bg-background text-foreground border border-border focus:outline-none focus:ring-2 focus:ring-primary text-center font-mono text-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-3">
                {t('turnTimeLimit')}: {settings.turnTimeLimit === 0 ? t('noLimit') : `${settings.turnTimeLimit}s`}
              </label>
              <div className="flex gap-2 flex-wrap">
                {[0, 5, 10, 15, 30, 60].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setSettings(s => ({ ...s, turnTimeLimit: sec }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      settings.turnTimeLimit === sec
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-primary/20'
                    }`}
                  >
                    {sec === 0 ? t('noLimit') : `${sec}s`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {settingsError && (
            <p className="text-sm text-destructive font-medium">{settingsError}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {t(solo ? 'startGame' : 'createGame')}
          </button>

          <button onClick={() => setView('main')} className="w-full py-2 rounded-lg bg-secondary text-secondary-foreground hover:opacity-80 transition-opacity">
            {t('back')}
          </button>
        </div>
      </div>
    );
  }

  // --- MAIN VIEW ---
  return (
    <div className="w-full max-w-md mx-auto space-y-8 fade-in p-4">
      <div className="text-center space-y-3 pt-4">
        <h1 className="text-5xl font-bold tracking-tight mb-2">🎮</h1>
        <h1 className="text-4xl font-bold tracking-tight">{t('appTitle')}</h1>
        <p className="text-muted-foreground text-sm text-balance">
          {t('appDescription')}
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => { setSolo(false); setView('settings'); }}
          className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <span>➕</span>
          {t('createGame')}
        </button>

        <button
          onClick={() => setView('join')}
          className="w-full py-4 rounded-xl bg-secondary text-secondary-foreground text-lg font-semibold hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
        >
          <span>🔓</span>
          {t('joinGame')}
        </button>

        <button
          onClick={() => { setSolo(true); setView('settings'); }}
          className="w-full py-4 rounded-xl bg-secondary text-secondary-foreground text-lg font-semibold hover:opacity-80 transition-opacity flex items-center justify-center gap-2"
        >
          <span>🤖</span>
          {t('playComputer')}
        </button>
      </div>

      <div className="space-y-2 text-center text-xs text-muted-foreground border-t border-border pt-4">
        <p>{t('tipShare')}</p>
        <p>{t('tipTimer')}</p>
        <p>{t('tipWin')}</p>
      </div>
    </div>
  );
}
