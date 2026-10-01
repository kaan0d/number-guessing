'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface GameSettings {
  minNumber: number;
  maxNumber: number;
  turnTimeLimit: number; // seconds, 0 = no limit
}

export interface GameState {
  roomCode: string;
  settings: GameSettings;
  gamePhase: 'lobby' | 'waiting' | 'number_selection' | 'guessing' | 'ended' | 'cancelled';
  player1: {
    id: string;
    name: string;
    avatar: string;
    selectedNumber?: number;
    isReady: boolean;
    minRange: number;
    maxRange: number;
  };
  player2: {
    id: string;
    name: string;
    avatar: string;
    selectedNumber?: number;
    isReady: boolean;
    minRange: number;
    maxRange: number;
  } | null;
  currentTurnPlayerId: string | null;
  guesses: Array<{
    guesser: string;
    number: number;
    response: 'higher' | 'lower' | 'correct' | 'pending';
  }>;
  winner: string | null;
  createdAt: number;
}

interface GameContextType {
  gameState: GameState | null;
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  createGame: (name: string, settings: GameSettings) => void;
  joinGame: (roomCode: string, name: string) => void;
  selectNumber: (number: number) => void;
  makeGuess: (number: number) => void;
  rematch: () => void;
  leaveGame: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [playerId] = useState(() => `player_${Math.random().toString(36).substr(2, 9)}`);
  const [playerName, setPlayerNameState] = useState(() => `Player${Math.floor(1000 + Math.random() * 9000)}`);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isHostRef = useRef<boolean>(false);
  // Keep a ref to gameState for use in beforeunload
  const gameStateRef = useRef<GameState | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    setGameState((prev) => {
      if (!prev) return null;
      const isPlayer1 = prev.player1.id === playerId;
      if (isPlayer1) return { ...prev, player1: { ...prev.player1, name } };
      if (prev.player2) return { ...prev, player2: { ...prev.player2, name } };
      return prev;
    });
  };

  const broadcast = useCallback((event: string, payload: any) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event,
        payload: { ...payload, senderId: playerId },
      });
    }
  }, [playerId]);

  // Compute the automatic response for a guess against a secret number
  const computeResponse = (guess: number, secretNumber: number): 'higher' | 'lower' | 'correct' => {
    if (guess === secretNumber) return 'correct';
    if (guess < secretNumber) return 'higher';
    return 'lower';
  };

  const setupChannel = useCallback((roomCode: string, isHost: boolean) => {
    const supabase = createClient();

    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }

    isHostRef.current = isHost;

    const channel = supabase.channel(`room:${roomCode}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
        if (payload.senderId === playerId) return;
        if (!isHostRef.current) return;

        setGameState((prev) => {
          if (!prev) return null;
          const updated: GameState = {
            ...prev,
            gamePhase: 'number_selection',
            player2: {
              id: payload.playerId,
              name: payload.playerName,
              avatar: '🎯',
              isReady: false,
              minRange: prev.settings.minNumber,
              maxRange: prev.settings.maxNumber,
            },
          };
          setTimeout(() => broadcast('state_sync', { state: updated }), 100);
          return updated;
        });
      })
      .on('broadcast', { event: 'state_sync' }, ({ payload }) => {
        if (payload.senderId === playerId) return;
        const incoming = payload.state as GameState;
        setGameState((prev) => {
          if (!prev) return incoming;
          const isPlayer1 = prev.player1.id === playerId;
          if (isPlayer1) {
            return {
              ...incoming,
              player1: {
                ...incoming.player1,
                selectedNumber: prev.player1.selectedNumber ?? incoming.player1.selectedNumber,
                isReady: prev.player1.isReady || incoming.player1.isReady,
              },
            };
          }
          return {
            ...incoming,
            player2: incoming.player2 ? {
              ...incoming.player2,
              selectedNumber: prev.player2?.selectedNumber ?? incoming.player2.selectedNumber,
              isReady: prev.player2?.isReady || incoming.player2.isReady,
            } : null,
          };
        });
      })
      .on('broadcast', { event: 'number_selected' }, ({ payload }) => {
        if (payload.senderId === playerId) return;
        setGameState((prev) => {
          if (!prev) return null;
          const isOpponentPlayer1 = payload.opponentId === prev.player1.id;
          const myIsReady = isOpponentPlayer1 ? prev.player2?.isReady : prev.player1.isReady;
          const bothReady = myIsReady && payload.isReady;
          return {
            ...prev,
            gamePhase: bothReady ? 'guessing' : 'number_selection',
            currentTurnPlayerId: bothReady ? prev.player1.id : null,
            [isOpponentPlayer1 ? 'player1' : 'player2']: {
              ...(isOpponentPlayer1 ? prev.player1 : prev.player2),
              selectedNumber: payload.selectedNumber,
              isReady: payload.isReady,
            },
          };
        });
      })
      .on('broadcast', { event: 'guess_made' }, ({ payload }) => {
        // The opponent has guessed — we are the one whose number is being guessed.
        // Automatically compute response and reply.
        if (payload.senderId === playerId) return;

        setGameState((prev) => {
          if (!prev) return null;

          // Find our secret number
          const isPlayer1 = prev.player1.id === playerId;
          const mySecretNumber = isPlayer1 ? prev.player1.selectedNumber : prev.player2?.selectedNumber;

          if (mySecretNumber === undefined) return prev;

          const guessedNumber = payload.guessedNumber as number;
          const guesserId = payload.guesserId as string;
          const response = computeResponse(guessedNumber, mySecretNumber);

          const newGuess = { guesser: guesserId, number: guessedNumber, response };
          const newGuesses = [...(prev.guesses || []), newGuess];

          // Update the GUESSER'S range
          const isGuesserPlayer1 = guesserId === prev.player1.id;
          const guesserCurrent = isGuesserPlayer1 ? prev.player1 : prev.player2;
          const newMin = response === 'higher'
            ? Math.max(guesserCurrent?.minRange || 1, guessedNumber + 1)
            : (guesserCurrent?.minRange || 1);
          const newMax = response === 'lower'
            ? Math.min(guesserCurrent?.maxRange || 100, guessedNumber - 1)
            : (guesserCurrent?.maxRange || 100);

          const newPhase = response === 'correct' ? 'ended' : 'guessing';
          const newWinner = response === 'correct' ? guesserId : null;
          // After responding, it's now the guesser's turn again (they keep guessing until correct)
          // Actually the turns alternate: after we respond, it's now the OTHER player's turn
          const nextTurn = response === 'correct' ? null : playerId;

          // Broadcast the result back so both players see it
          setTimeout(() => {
            broadcast('guess_result', {
              guesses: newGuesses,
              guesserId,
              newMin,
              newMax,
              response,
              gamePhase: newPhase,
              winner: newWinner,
              currentTurnPlayerId: nextTurn,
            });
          }, 50);

          return {
            ...prev,
            guesses: newGuesses,
            player1: isGuesserPlayer1 ? { ...prev.player1, minRange: newMin, maxRange: newMax } : prev.player1,
            player2: prev.player2 && !isGuesserPlayer1 ? { ...prev.player2, minRange: newMin, maxRange: newMax } : prev.player2,
            gamePhase: newPhase as GameState['gamePhase'],
            winner: newWinner,
            currentTurnPlayerId: nextTurn,
          };
        });
      })
      .on('broadcast', { event: 'guess_result' }, ({ payload }) => {
        if (payload.senderId === playerId) return;
        setGameState((prev) => {
          if (!prev) return null;
          const isGuesserPlayer1 = payload.guesserId === prev.player1.id;
          return {
            ...prev,
            guesses: payload.guesses,
            player1: isGuesserPlayer1
              ? { ...prev.player1, minRange: payload.newMin, maxRange: payload.newMax }
              : prev.player1,
            player2: prev.player2 && !isGuesserPlayer1
              ? { ...prev.player2, minRange: payload.newMin, maxRange: payload.newMax }
              : prev.player2,
            gamePhase: payload.gamePhase,
            winner: payload.winner,
            currentTurnPlayerId: payload.currentTurnPlayerId,
          };
        });
      })
      .on('broadcast', { event: 'rematch' }, ({ payload }) => {
        if (payload.senderId === playerId) return;
        setGameState((prev) => {
          if (!prev) return null;
          const { minNumber, maxNumber } = prev.settings;
          return {
            ...prev,
            gamePhase: 'number_selection',
            player1: { ...prev.player1, selectedNumber: undefined, isReady: false, minRange: minNumber, maxRange: maxNumber },
            player2: prev.player2 ? { ...prev.player2, selectedNumber: undefined, isReady: false, minRange: minNumber, maxRange: maxNumber } : null,
            guesses: [],
            winner: null,
            currentTurnPlayerId: null,
          };
        });
      })
      .on('broadcast', { event: 'player_left' }, ({ payload }) => {
        if (payload.senderId === playerId) return;
        setGameState((prev) => {
          if (!prev) return null;
          return { ...prev, gamePhase: 'cancelled' };
        });
      })
      .subscribe();

    channelRef.current = channel;
  }, [playerId, broadcast]);

  // Broadcast player_left when tab closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (gameStateRef.current && gameStateRef.current.gamePhase !== 'lobby') {
        broadcast('player_left', {});
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [broadcast]);

  const createGame = (name: string, settings: GameSettings) => {
    setPlayerNameState(name);
    const roomCode = String(Math.floor(1000 + Math.random() * 9000));
    const newGame: GameState = {
      roomCode,
      settings,
      gamePhase: 'waiting',
      player1: { id: playerId, name, avatar: '🎮', isReady: false, minRange: settings.minNumber, maxRange: settings.maxNumber },
      player2: null,
      currentTurnPlayerId: null,
      guesses: [],
      winner: null,
      createdAt: Date.now(),
    };
    setGameState(newGame);
    setupChannel(roomCode, true);
  };

  const joinGame = (roomCode: string, name: string) => {
    setPlayerNameState(name);
    const trimmedCode = roomCode.trim();
    const defaultSettings: GameSettings = { minNumber: 1, maxNumber: 100, turnTimeLimit: 10 };
    const joiningGame: GameState = {
      roomCode: trimmedCode,
      settings: defaultSettings,
      gamePhase: 'number_selection',
      player1: { id: 'pending_host', name: 'Waiting...', avatar: '🎮', isReady: false, minRange: 1, maxRange: 100 },
      player2: { id: playerId, name, avatar: '🎯', isReady: false, minRange: 1, maxRange: 100 },
      currentTurnPlayerId: null,
      guesses: [],
      winner: null,
      createdAt: Date.now(),
    };
    setGameState(joiningGame);
    setupChannel(trimmedCode, false);
    setTimeout(() => {
      broadcast('player_joined', { playerId, playerName: name, roomCode: trimmedCode });
    }, 500);
  };

  const selectNumber = (number: number) => {
    setGameState((prev) => {
      if (!prev) return null;
      const isPlayer1 = prev.player1.id === playerId;
      const opponentReady = isPlayer1 ? prev.player2?.isReady : prev.player1.isReady;
      const updated: GameState = {
        ...prev,
        gamePhase: opponentReady ? 'guessing' : 'number_selection',
        currentTurnPlayerId: opponentReady ? prev.player1.id : null,
        [isPlayer1 ? 'player1' : 'player2']: {
          ...(isPlayer1 ? prev.player1 : prev.player2),
          selectedNumber: number,
          isReady: true,
        },
      };
      broadcast('number_selected', { opponentId: playerId, selectedNumber: number, isReady: true });
      return updated;
    });
  };

  const makeGuess = (number: number) => {
    setGameState((prev) => {
      if (!prev) return null;
      // Broadcast guess to opponent — they will auto-compute the response
      broadcast('guess_made', { guesserId: playerId, guessedNumber: number });
      // Optimistically add as pending locally while we wait for guess_result
      const newGuess = { guesser: playerId, number, response: 'pending' as const };
      return { ...prev, guesses: [...prev.guesses, newGuess], currentTurnPlayerId: null };
    });
  };

  const rematch = () => {
    broadcast('rematch', {});
    setGameState((prev) => {
      if (!prev) return null;
      const { minNumber, maxNumber } = prev.settings;
      return {
        ...prev,
        gamePhase: 'number_selection',
        player1: { ...prev.player1, selectedNumber: undefined, isReady: false, minRange: minNumber, maxRange: maxNumber },
        player2: prev.player2 ? { ...prev.player2, selectedNumber: undefined, isReady: false, minRange: minNumber, maxRange: maxNumber } : null,
        guesses: [],
        winner: null,
        currentTurnPlayerId: null,
      };
    });
  };

  const leaveGame = () => {
    broadcast('player_left', {});
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    setGameState(null);
  };

  useEffect(() => {
    return () => {
      if (channelRef.current) channelRef.current.unsubscribe();
    };
  }, []);

  return (
    <GameContext.Provider value={{
      gameState, playerId, playerName, setPlayerName,
      createGame, joinGame, selectNumber, makeGuess, rematch, leaveGame,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within a GameProvider');
  return context;
}
