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

const JOIN_TIMEOUT_MS = 5000;
export const PENDING_HOST = 'pending_host';

type Player = GameState['player1'];

// Compute the automatic response for a guess against a secret number
function computeResponse(guess: number, secretNumber: number): 'higher' | 'lower' | 'correct' {
  if (guess === secretNumber) return 'correct';
  if (guess < secretNumber) return 'higher';
  return 'lower';
}

function resetRound(state: GameState): GameState {
  const { minNumber, maxNumber } = state.settings;
  const reset = (p: Player): Player => ({ ...p, selectedNumber: undefined, isReady: false, minRange: minNumber, maxRange: maxNumber });
  return {
    ...state,
    gamePhase: 'number_selection',
    player1: reset(state.player1),
    player2: state.player2 ? reset(state.player2) : null,
    guesses: [],
    winner: null,
    currentTurnPlayerId: null,
  };
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [playerId] = useState(() => `player_${Math.random().toString(36).slice(2, 11)}`);
  const [playerName, setPlayerNameState] = useState(() => `Player${Math.floor(1000 + Math.random() * 9000)}`);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Mirrors gameState synchronously, so handlers can compute the next state
  // and broadcast it without side effects inside setState updaters.
  const stateRef = useRef<GameState | null>(null);

  const commit = useCallback((next: GameState | null) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    const prev = stateRef.current;
    if (!prev) return;
    if (prev.player1.id === playerId) commit({ ...prev, player1: { ...prev.player1, name } });
    else if (prev.player2) commit({ ...prev, player2: { ...prev.player2, name } });
  };

  const broadcast = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({
      type: 'broadcast',
      event,
      payload: { ...payload, senderId: playerId },
    });
  }, [playerId]);

  const setupChannel = useCallback((roomCode: string, onSubscribed?: () => void) => {
    channelRef.current?.unsubscribe();

    const channel = createClient().channel(`room:${roomCode}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
        const prev = stateRef.current;
        // Only the host accepts joins, and only into an empty seat.
        if (!prev || prev.player1.id !== playerId || prev.gamePhase !== 'waiting') return;
        const next: GameState = {
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
        commit(next);
        broadcast('state_sync', { state: next });
      })
      .on('broadcast', { event: 'state_sync' }, ({ payload }) => {
        const prev = stateRef.current;
        const incoming = payload.state as GameState;
        // Ignore syncs meant for another joiner of the same room.
        if (!prev || !incoming.player2 || incoming.player2.id !== playerId) return;
        commit({
          ...incoming,
          player2: {
            ...incoming.player2,
            selectedNumber: prev.player2?.selectedNumber ?? incoming.player2.selectedNumber,
            isReady: !!prev.player2?.isReady || incoming.player2.isReady,
          },
        });
      })
      .on('broadcast', { event: 'number_selected' }, ({ payload }) => {
        const prev = stateRef.current;
        if (!prev) return;
        const isOpponentPlayer1 = payload.opponentId === prev.player1.id;
        const opponent = isOpponentPlayer1 ? prev.player1 : prev.player2;
        if (!opponent) return;
        const myIsReady = isOpponentPlayer1 ? prev.player2?.isReady : prev.player1.isReady;
        const bothReady = !!myIsReady && payload.isReady;
        commit({
          ...prev,
          gamePhase: bothReady ? 'guessing' : 'number_selection',
          currentTurnPlayerId: bothReady ? prev.player1.id : null,
          [isOpponentPlayer1 ? 'player1' : 'player2']: {
            ...opponent,
            selectedNumber: payload.selectedNumber,
            isReady: payload.isReady,
          },
        });
      })
      .on('broadcast', { event: 'guess_made' }, ({ payload }) => {
        // The opponent guessed our number: answer automatically.
        const prev = stateRef.current;
        if (!prev || !prev.player2 || prev.gamePhase !== 'guessing') return;
        const isPlayer1 = prev.player1.id === playerId;
        const mySecretNumber = isPlayer1 ? prev.player1.selectedNumber : prev.player2.selectedNumber;
        if (mySecretNumber === undefined) return;

        const guessedNumber = payload.guessedNumber as number;
        const guesserId = payload.guesserId as string;
        const response = computeResponse(guessedNumber, mySecretNumber);
        const guesses = [...prev.guesses, { guesser: guesserId, number: guessedNumber, response }];

        // Narrow the guesser's range
        const isGuesserPlayer1 = guesserId === prev.player1.id;
        const guesser = isGuesserPlayer1 ? prev.player1 : prev.player2;
        const newMin = response === 'higher' ? Math.max(guesser.minRange, guessedNumber + 1) : guesser.minRange;
        const newMax = response === 'lower' ? Math.min(guesser.maxRange, guessedNumber - 1) : guesser.maxRange;

        const gamePhase: GameState['gamePhase'] = response === 'correct' ? 'ended' : 'guessing';
        const winner = response === 'correct' ? guesserId : null;
        // Turns alternate: after answering, we guess next.
        const currentTurnPlayerId = response === 'correct' ? null : playerId;

        commit({
          ...prev,
          guesses,
          player1: isGuesserPlayer1 ? { ...prev.player1, minRange: newMin, maxRange: newMax } : prev.player1,
          player2: isGuesserPlayer1 ? prev.player2 : { ...prev.player2, minRange: newMin, maxRange: newMax },
          gamePhase,
          winner,
          currentTurnPlayerId,
        });
        broadcast('guess_result', { guesses, guesserId, newMin, newMax, gamePhase, winner, currentTurnPlayerId });
      })
      .on('broadcast', { event: 'guess_result' }, ({ payload }) => {
        const prev = stateRef.current;
        if (!prev) return;
        const isGuesserPlayer1 = payload.guesserId === prev.player1.id;
        commit({
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
        });
      })
      .on('broadcast', { event: 'rematch' }, () => {
        const prev = stateRef.current;
        if (prev) commit(resetRound(prev));
      })
      .on('broadcast', { event: 'player_left' }, ({ payload }) => {
        const prev = stateRef.current;
        if (!prev) return;
        // Ignore strangers (e.g. a rejected third player) leaving the room.
        if (payload.senderId !== prev.player1.id && payload.senderId !== prev.player2?.id) return;
        commit({ ...prev, gamePhase: 'cancelled' });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onSubscribed?.();
      });

    channelRef.current = channel;
  }, [playerId, broadcast, commit]);

  // Tell the opponent when the tab closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (stateRef.current) broadcast('player_left', {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [broadcast]);

  const createGame = (name: string, settings: GameSettings) => {
    setPlayerNameState(name);
    // ponytail: 4-digit codes can collide between rooms; add a presence check if traffic grows
    const roomCode = String(Math.floor(1000 + Math.random() * 9000));
    commit({
      roomCode,
      settings,
      gamePhase: 'waiting',
      player1: { id: playerId, name, avatar: '🎮', isReady: false, minRange: settings.minNumber, maxRange: settings.maxNumber },
      player2: null,
      currentTurnPlayerId: null,
      guesses: [],
      winner: null,
      createdAt: Date.now(),
    });
    setupChannel(roomCode);
  };

  const joinGame = (roomCode: string, name: string) => {
    setPlayerNameState(name);
    const trimmedCode = roomCode.trim();
    commit({
      roomCode: trimmedCode,
      settings: { minNumber: 1, maxNumber: 100, turnTimeLimit: 10 },
      gamePhase: 'number_selection',
      player1: { id: PENDING_HOST, name: '...', avatar: '🎮', isReady: false, minRange: 1, maxRange: 100 },
      player2: { id: playerId, name, avatar: '🎯', isReady: false, minRange: 1, maxRange: 100 },
      currentTurnPlayerId: null,
      guesses: [],
      winner: null,
      createdAt: Date.now(),
    });
    setupChannel(trimmedCode, () => {
      broadcast('player_joined', { playerId, playerName: name });
      // No host answered: the room does not exist or is already full.
      setTimeout(() => {
        const s = stateRef.current;
        if (s?.roomCode === trimmedCode && s.player1.id === PENDING_HOST) commit({ ...s, gamePhase: 'cancelled' });
      }, JOIN_TIMEOUT_MS);
    });
  };

  const selectNumber = (number: number) => {
    const prev = stateRef.current;
    if (!prev || !prev.player2) return;
    const isPlayer1 = prev.player1.id === playerId;
    const me = isPlayer1 ? prev.player1 : prev.player2;
    const opponentReady = isPlayer1 ? prev.player2.isReady : prev.player1.isReady;
    commit({
      ...prev,
      gamePhase: opponentReady ? 'guessing' : 'number_selection',
      currentTurnPlayerId: opponentReady ? prev.player1.id : null,
      [isPlayer1 ? 'player1' : 'player2']: { ...me, selectedNumber: number, isReady: true },
    });
    broadcast('number_selected', { opponentId: playerId, selectedNumber: number, isReady: true });
  };

  const makeGuess = useCallback((number: number) => {
    const prev = stateRef.current;
    if (!prev || prev.currentTurnPlayerId !== playerId) return;
    // The opponent computes the response; show it as pending until guess_result arrives
    commit({
      ...prev,
      guesses: [...prev.guesses, { guesser: playerId, number, response: 'pending' }],
      currentTurnPlayerId: null,
    });
    broadcast('guess_made', { guesserId: playerId, guessedNumber: number });
  }, [playerId, broadcast, commit]);

  const rematch = () => {
    const prev = stateRef.current;
    if (!prev) return;
    commit(resetRound(prev));
    broadcast('rematch', {});
  };

  const leaveGame = () => {
    broadcast('player_left', {});
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    commit(null);
  };

  useEffect(() => () => {
    channelRef.current?.unsubscribe();
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
