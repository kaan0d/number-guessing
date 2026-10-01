'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { GameSettings, GameState, applyResponse, computeResponse, newPlayer, playerOf, resetRound, revealOpponent } from './rules';

export type { GameSettings, GameState } from './rules';

export type ConnectionError = 'not_found' | 'full' | 'server_full' | 'connection';

interface GameContextType {
  gameState: GameState | null;
  connectionError: ConnectionError | null;
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

type Payload = Record<string, any>;

function relayUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const [playerId] = useState(() => `player_${Math.random().toString(36).slice(2, 11)}`);
  const [playerName, setPlayerNameState] = useState(() => `Player${Math.floor(1000 + Math.random() * 9000)}`);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
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

  const broadcast = useCallback((event: string, payload: Payload) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'broadcast', event, payload: { ...payload, senderId: playerId } }));
    }
  }, [playerId]);

  // Game events from the opponent
  const onEvent = useCallback((event: string, payload: Payload) => {
    const prev = stateRef.current;
    if (!prev) return;

    switch (event) {
      case 'player_joined': {
        // Only the host accepts the join.
        if (prev.player1.id !== playerId || prev.gamePhase !== 'waiting') return;
        const next: GameState = {
          ...prev,
          gamePhase: 'number_selection',
          player2: newPlayer(payload.playerId, payload.playerName, '🎯', prev.settings),
        };
        commit(next);
        broadcast('state_sync', { state: next });
        return;
      }
      case 'state_sync': {
        const incoming = payload.state as GameState;
        if (!incoming.player2 || incoming.player2.id !== playerId) return;
        commit({
          ...incoming,
          player2: {
            ...incoming.player2,
            selectedNumber: prev.player2?.selectedNumber ?? incoming.player2.selectedNumber,
            isReady: !!prev.player2?.isReady || incoming.player2.isReady,
          },
        });
        return;
      }
      case 'number_selected': {
        const isOpponentPlayer1 = payload.opponentId === prev.player1.id;
        const opponent = isOpponentPlayer1 ? prev.player1 : prev.player2;
        if (!opponent) return;
        const myIsReady = isOpponentPlayer1 ? prev.player2?.isReady : prev.player1.isReady;
        const bothReady = !!myIsReady && payload.isReady;
        commit({
          ...prev,
          gamePhase: bothReady ? 'guessing' : 'number_selection',
          currentTurnPlayerId: bothReady ? prev.player1.id : null,
          // The secret number itself stays with its owner until the game ends.
          [isOpponentPlayer1 ? 'player1' : 'player2']: { ...opponent, isReady: payload.isReady },
        });
        return;
      }
      case 'guess_made': {
        // The opponent guessed our number: answer automatically.
        const guesserId = payload.guesserId as string;
        if (prev.gamePhase !== 'guessing' || prev.currentTurnPlayerId !== guesserId) return;
        const mySecret = playerOf(prev, playerId).selectedNumber;
        if (mySecret === undefined) return;
        const guess = payload.guessedNumber as number;
        const response = computeResponse(guess, mySecret);
        // Turns alternate: after answering, we guess next.
        commit(applyResponse(prev, guesserId, guess, response, playerId));
        broadcast('guess_result', { guesserId, guess, response, secret: response === 'correct' ? mySecret : undefined });
        return;
      }
      case 'guess_result': {
        const next = applyResponse(prev, payload.guesserId, payload.guess, payload.response, payload.senderId);
        if (next.gamePhase !== 'ended') return commit(next);
        // We won: reveal both numbers.
        commit(revealOpponent(next, playerId, payload.secret));
        broadcast('reveal', { secret: playerOf(next, playerId).selectedNumber });
        return;
      }
      case 'reveal':
        commit(revealOpponent(prev, playerId, payload.secret));
        return;
      case 'rematch':
        commit(resetRound(prev));
        return;
    }
  }, [playerId, broadcast, commit]);

  // Opens a relay connection, sends `hello` (create or join), then routes
  // relay replies to `onReady` and game events to onEvent.
  const connect = useCallback((hello: Payload, onReady: (room: string) => void) => {
    wsRef.current?.close();
    setConnectionError(null);
    const ws = new WebSocket(relayUrl());
    wsRef.current = ws;
    let ready = false;

    ws.onopen = () => ws.send(JSON.stringify(hello));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'created' || msg.type === 'joined') {
        ready = true;
        onReady(msg.room);
      } else if (msg.type === 'error') {
        wsRef.current = null;
        ws.close();
        setConnectionError(msg.reason);
      } else if (msg.type === 'peer_left') {
        // Leave the room too, so nobody can join a finished game.
        wsRef.current = null;
        ws.close();
        const prev = stateRef.current;
        if (prev) commit({ ...prev, gamePhase: 'cancelled' });
      } else if (msg.type === 'broadcast') {
        onEvent(msg.event, msg.payload);
      }
    };
    ws.onclose = () => {
      // Closed by leaveGame or a newer connection: nothing to report.
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      if (!ready || stateRef.current?.gamePhase !== 'cancelled') {
        commit(null);
        setConnectionError('connection');
      }
    };
  }, [commit, onEvent]);

  const createGame = (name: string, settings: GameSettings) => {
    setPlayerNameState(name);
    connect({ type: 'create' }, (roomCode) => commit({
      roomCode,
      settings,
      gamePhase: 'waiting',
      player1: newPlayer(playerId, name, '🎮', settings),
      player2: null,
      currentTurnPlayerId: null,
      guesses: [],
      winner: null,
      createdAt: Date.now(),
    }));
  };

  const joinGame = (roomCode: string, name: string) => {
    setPlayerNameState(name);
    connect({ type: 'join', room: roomCode.trim() }, (room) => {
      // Placeholder until the host answers with state_sync
      commit({
        roomCode: room,
        settings: { minNumber: 1, maxNumber: 100, turnTimeLimit: 10 },
        gamePhase: 'number_selection',
        player1: { id: 'pending_host', name: '...', avatar: '🎮', isReady: false, minRange: 1, maxRange: 100 },
        player2: { id: playerId, name, avatar: '🎯', isReady: false, minRange: 1, maxRange: 100 },
        currentTurnPlayerId: null,
        guesses: [],
        winner: null,
        createdAt: Date.now(),
      });
      broadcast('player_joined', { playerId, playerName: name });
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
    broadcast('number_selected', { opponentId: playerId, isReady: true });
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

  // Closing the socket tells the relay, which notifies the opponent.
  const leaveGame = () => {
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    setConnectionError(null);
    commit(null);
  };

  useEffect(() => () => {
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
  }, []);

  return (
    <GameContext.Provider value={{
      gameState, connectionError, playerId, playerName, setPlayerName,
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
