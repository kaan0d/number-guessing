'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export const translations = {
  en: {
    appTitle: 'Number Guess Battle',
    appDescription: 'Pick a secret number, then take turns guessing your opponent\'s number. First to guess correctly wins!',
    createGame: 'Create Game',
    joinGame: 'Join Game',
    yourName: 'Your Name',
    namePlaceholder: 'Enter your name',
    roomCode: 'Room Code',
    enterRoomCode: 'Enter the 4-digit room code to join',
    back: 'Back',
    configureSettings: 'Configure game settings before creating',
    gameSettings: 'Game Settings',
    minNumber: 'Min Number',
    maxNumber: 'Max Number',
    turnTimeLimit: 'Turn Time Limit',
    noLimit: 'No Limit',
    tipShare: 'Share the room code with a friend to start playing',
    tipTimer: 'Each turn has a configurable time limit',
    tipWin: 'First to guess correctly wins',
    // Number selection
    selectYourNumber: 'Select Your Number',
    pickNumber: 'Pick a number in the range',
    lockIn: 'Lock In',
    yourSecretNumber: 'Your Secret Number',
    waitingForOpponent: 'Waiting for opponent...',
    you: 'You',
    opponent: 'Opponent',
    ready: 'Ready',
    waiting: 'Waiting...',
    bothReady: 'Both players ready! Starting game...',
    // Guessing
    yourTurn: 'Your Turn',
    opponentTurn: '\'s Turn',
    waitingForGuess: 'Waiting for their guess...',
    guessNumber: 'Guess',
    validRange: 'Your Valid Range',
    totalGuesses: 'Total Guesses',
    recentGuesses: 'Recent Guesses',
    higher: 'Higher',
    lower: 'Lower',
    correct: 'Correct!',
    pending: 'Pending...',
    // End game
    youWon: 'You Won!',
    youGuessedCorrectly: 'You guessed',
    numberCorrectly: '\'s number correctly!',
    guessesMode: 'Guesses Made',
    youLost: 'You Lost',
    opponentGuessedYour: 'guessed your number in',
    tries: 'tries',
    yourNumber: 'Your Secret Number',
    playAgain: 'Play Again',
    mainMenu: 'Main Menu',
    secretNumbers: 'Secret Numbers',
    // Cancelled
    opponentLeft: 'Opponent Left',
    playerDisconnected: 'The other player has disconnected from the game.',
    roomNotFound: 'Room not found.',
    roomFull: 'This room is already full.',
    serverFull: 'No free rooms right now. Try again soon.',
    connectionLost: 'Could not reach the game server.',
    returnToMenu: 'Return to Main Menu',
    // Header
    room: 'Room:',
    // Room join / waiting
    waitingForPlayer: 'Waiting for a player to join...',
    shareCode: 'Share this code with your opponent',
    copyCode: 'Copy Code',
    leaveRoom: 'Leave Room',
    confirmNumber: 'You are about to select',
    areYouSure: 'Are you sure?',
    guess: 'Guess',
    score: 'Score',
  },
  tr: {
    appTitle: 'Sayı Tahmin Savaşı',
    appDescription: 'Gizli bir sayı seç, ardından sırayla rakibinin sayısını tahmin et. İlk doğru tahmin eden kazanır!',
    createGame: 'Oyun Oluştur',
    joinGame: 'Oyuna Katıl',
    yourName: 'Adınız',
    namePlaceholder: 'Adınızı girin',
    roomCode: 'Oda Kodu',
    enterRoomCode: '4 haneli oda kodunu girin',
    back: 'Geri',
    configureSettings: 'Oyunu oluşturmadan önce ayarları yapılandırın',
    gameSettings: 'Oyun Ayarları',
    minNumber: 'Min Sayı',
    maxNumber: 'Maks Sayı',
    turnTimeLimit: 'Tur Süresi',
    noLimit: 'Sınırsız',
    tipShare: 'Oynamaya başlamak için oda kodunu arkadaşınla paylaş',
    tipTimer: 'Her tur için özelleştirilebilir süre sınırı vardır',
    tipWin: 'İlk doğru tahmin eden kazanır',
    // Number selection
    selectYourNumber: 'Sayınızı Seçin',
    pickNumber: 'Aralıktan bir sayı seçin',
    lockIn: 'Kilitle',
    yourSecretNumber: 'Gizli Sayınız',
    waitingForOpponent: 'Rakip bekleniyor...',
    you: 'Siz',
    opponent: 'Rakip',
    ready: 'Hazır',
    waiting: 'Bekleniyor...',
    bothReady: 'Her iki oyuncu hazır! Oyun başlıyor...',
    // Guessing
    yourTurn: 'Sizin Turunuz',
    opponentTurn: '\'nin Turu',
    waitingForGuess: 'Tahmini bekleniyor...',
    guessNumber: 'Tahmin Et',
    validRange: 'Geçerli Aralığınız',
    totalGuesses: 'Toplam Tahmin',
    recentGuesses: 'Son Tahminler',
    higher: 'Daha Yüksek',
    lower: 'Daha Düşük',
    correct: 'Doğru!',
    pending: 'Bekleniyor...',
    // End game
    youWon: 'Kazandınız!',
    youGuessedCorrectly: 'Siz',
    numberCorrectly: '\'nin sayısını doğru tahmin ettiniz!',
    guessesMode: 'Yapılan Tahmin',
    youLost: 'Kaybettiniz',
    opponentGuessedYour: 'sayınızı',
    tries: 'denemede tahmin etti',
    yourNumber: 'Gizli Sayınız',
    playAgain: 'Tekrar Oyna',
    mainMenu: 'Ana Menü',
    secretNumbers: 'Gizli Sayılar',
    // Cancelled
    opponentLeft: 'Rakip Ayrıldı',
    playerDisconnected: 'Diğer oyuncu oyundan ayrıldı.',
    roomNotFound: 'Oda bulunamadı.',
    roomFull: 'Bu oda zaten dolu.',
    serverFull: 'Şu an boş oda yok. Birazdan tekrar deneyin.',
    connectionLost: 'Oyun sunucusuna ulaşılamadı.',
    returnToMenu: 'Ana Menüye Dön',
    // Header
    room: 'Oda:',
    // Room join / waiting
    waitingForPlayer: 'Bir oyuncu katılması bekleniyor...',
    shareCode: 'Bu kodu rakibinizle paylaşın',
    copyCode: 'Kodu Kopyala',
    leaveRoom: 'Odadan Ayrıl',
    confirmNumber: 'Seçmek üzeresiniz',
    areYouSure: 'Emin misiniz?',
    guess: 'Tahmin Et',
    score: 'Skor',
  },
};

type Language = 'en' | 'tr';
type TranslationKey = keyof (typeof translations)['en'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('language') as Language | null;
    if (saved === 'en' || saved === 'tr') setLanguageState(saved);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: TranslationKey): string => {
    return (translations[language] as Record<string, string>)[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
