'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { GameSettings, GameState, applyResponse, computeResponse, hideSecret, newPlayer, playerOf, resetRound, revealOpponent, takeBackPending } from './rules';

export type { GameSettings, GameState } from './rules';

export type ConnectionError = 'not_found' | 'full' | 'server_full' | 'connection';

interface GameContextType {
  gameState: GameState | null;
  opponentAway: boolean;
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

const SAVE_KEY = 'game';
const PLAYER_KEY = 'playerId';
// How long we wait for a disconnected opponent before calling the game off.
const REJOIN_GRACE_MS = 30_000;

// Session storage survives a refresh but not closing the tab. Missing during
// server rendering and in some private modes, hence the try/catch.
function loadSaved(): GameState | null {
  try { return JSON.parse(sessionStorage.getItem(SAVE_KEY) ?? 'null'); } catch { return null; }
}

function relayUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export function GameProvider({ children }: { children: ReactNode }) {
  // Kept in session storage so a refreshed tab can rejoin as the same player.
  const [playerId] = useState(() => {
    let id = `player_${Math.random().toString(36).slice(2, 11)}`;
    try {
      id = sessionStorage.getItem(PLAYER_KEY) ?? id;
      sessionStorage.setItem(PLAYER_KEY, id);
    } catch {}
    return id;
  });
  const [playerName, setPlayerNameState] = useState(() => `Player${Math.floor(1000 + Math.random() * 9000)}`);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null);
  const [opponentAway, setOpponentAway] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  // Set while the opponent is disconnected; fires the cancel after the grace period.
  const awayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors gameState synchronously, so handlers can compute the next state
  // and broadcast it without side effects inside setState updaters.
  const stateRef = useRef<GameState | null>(null);

  const commit = useCallback((next: GameState | null) => {
    stateRef.current = next;
    setGameState(next);
    try {
      if (next?.player2 && next.gamePhase !== 'cancelled') sessionStorage.setItem(SAVE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(SAVE_KEY);
    } catch {}
  }, []);

  const clearAway = useCallback(() => {
    if (awayTimer.current) clearTimeout(awayTimer.current);
    awayTimer.current = null;
    setOpponentAway(false);
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
        // The opponent's state wins, except for our own secret number, which
        // only we know. Sent when we join and when we rejoin after a refresh.
        const incoming = payload.state as GameState;
        const key = incoming.player1.id === playerId ? 'player1' : incoming.player2?.id === playerId ? 'player2' : null;
        if (!key) return;
        const me = playerOf(prev, playerId);
        const theirs = incoming[key]!;
        // Our lock-in may not have reached them yet (same round, they still see us unready).
        const keep = me.isReady && (theirs.isReady || prev.gamePhase === incoming.gamePhase);
        commit({
          ...incoming,
          [key]: { ...theirs, selectedNumber: keep ? me.selectedNumber : theirs.selectedNumber, isReady: keep },
        });
        if (keep && !theirs.isReady) broadcast('number_selected', { opponentId: playerId, isReady: true });
        return;
      }
      case 'rejoin': {
        // ponytail: a stranger who joins during the grace period takes the free seat and blocks the rejoin
        const opponentId = prev.player1.id === playerId ? prev.player2?.id : prev.player1.id;
        if (payload.senderId !== opponentId) return;
        clearAway();
        const next = takeBackPending(prev, playerId);
        commit(next);
        broadcast('state_sync', { state: next.gamePhase === 'ended' ? next : hideSecret(next, playerId) });
        return;
      }
      case 'number_selected': {
        if (prev.gamePhase !== 'number_selection') return;
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
  }, [playerId, broadcast, commit, clearAway]);

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
        commit(null);
        setConnectionError(msg.reason);
      } else if (msg.type === 'peer_left') {
        // Give them time to come back after a refresh, then leave the room too,
        // so nobody can join a finished game.
        clearAway();
        setOpponentAway(true);
        awayTimer.current = setTimeout(() => {
          clearAway();
          wsRef.current = null;
          ws.close();
          const prev = stateRef.current;
          if (prev) commit({ ...prev, gamePhase: 'cancelled' });
        }, REJOIN_GRACE_MS);
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
  }, [commit, onEvent, clearAway]);

  // A refreshed tab rejoins its game. Until the opponent answers with
  // state_sync nobody may guess, so the turn is cleared.
  useEffect(() => {
    const saved = loadSaved();
    if (!saved) return;
    commit({ ...saved, currentTurnPlayerId: null });
    connect({ type: 'join', room: saved.roomCode }, () => broadcast('rejoin', {}));
  }, [commit, connect, broadcast]);

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
      const settings = { minNumber: 1, maxNumber: 100, turnTimeLimit: 10 };
      commit({
        roomCode: room,
        settings,
        gamePhase: 'number_selection',
        player1: newPlayer('pending_host', '...', '🎮', settings),
        player2: newPlayer(playerId, name, '🎯', settings),
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
    // No guessing while the opponent is away: nobody would answer.
    if (!prev || prev.currentTurnPlayerId !== playerId || awayTimer.current) return;
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
    clearAway();
    setConnectionError(null);
    commit(null);
  };

  useEffect(() => () => {
    clearAway();
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
  }, []);

  return (
    <GameContext.Provider value={{
      gameState, opponentAway, connectionError, playerId, playerName, setPlayerName,
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
