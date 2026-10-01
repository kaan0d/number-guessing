'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { GameSettings, GameState, applyResponse, computeResponse, BOT_ID, botGuess, isSolo, newPlayer, readyBot, resetRound } from './rules';

export type { GameSettings, GameState } from './rules';

export type ConnectionError = 'not_found' | 'full' | 'server_full' | 'connection';

interface GameContextType {
  gameState: GameState | null;
  opponentAway: boolean;
  // Local time when the current online turn runs out; null for solo or no limit.
  turnEndsAt: number | null;
  connectionError: ConnectionError | null;
  playerId: string;
  createGame: (name: string, settings: GameSettings) => void;
  startSolo: (name: string, settings: GameSettings) => void;
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
const TOKEN_KEY = 'token';
const BOT_DELAY_MS = 1500;

// Session storage survives a refresh but not closing the tab. Missing during
// server rendering and in some private modes, hence the try/catch.
function loadSaved(): GameState | null {
  try { return JSON.parse(sessionStorage.getItem(SAVE_KEY) ?? 'null'); } catch { return null; }
}

function sessionValue(key: string, fresh: string) {
  try {
    const value = sessionStorage.getItem(key) ?? fresh;
    sessionStorage.setItem(key, value);
    return value;
  } catch { return fresh; }
}

const randomString = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(36)).join('');

// A static build (GitHub Pages) points at a relay elsewhere; 'none' means
// there is no relay and only solo play is offered.
const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL;
export const ONLINE = RELAY_URL !== 'none';

function relayUrl() {
  return RELAY_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

// Online games run on the server, which holds both secret numbers, answers
// guesses and owns the turn timer; this side sends moves and shows the state
// it gets back. Solo games run here, against the computer.
export function GameProvider({ children }: { children: ReactNode }) {
  // Kept in session storage so a refreshed tab can rejoin as the same player.
  // The token proves the seat is ours; the opponent sees our id but not it.
  const [playerId] = useState(() => sessionValue(PLAYER_KEY, `player_${randomString()}`));
  const [token] = useState(() => sessionValue(TOKEN_KEY, randomString()));
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connectionError, setConnectionError] = useState<ConnectionError | null>(null);
  const [opponentAway, setOpponentAway] = useState(false);
  const [turnEndsAt, setTurnEndsAt] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Mirrors gameState synchronously for the solo handlers.
  const stateRef = useRef<GameState | null>(null);

  const commit = useCallback((next: GameState | null) => {
    stateRef.current = next;
    setGameState(next);
    try {
      if (next?.player2 && !isSolo(next) && next.gamePhase !== 'cancelled') sessionStorage.setItem(SAVE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(SAVE_KEY);
    } catch {}
  }, []);

  const send = (msg: Payload) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  // Opens a server connection, sends `hello` (create or join) and shows every
  // state the server sends back.
  const connect = useCallback((hello: Payload) => {
    wsRef.current?.close();
    setConnectionError(null);
    const ws = new WebSocket(relayUrl());
    wsRef.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ ...hello, playerId, token }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') {
        commit(msg.state);
        setOpponentAway(msg.away);
        setTurnEndsAt(msg.turnEndsIn === null ? null : Date.now() + msg.turnEndsIn);
      } else if (msg.type === 'error') {
        wsRef.current = null;
        ws.close();
        commit(null);
        setConnectionError(msg.reason);
      }
    };
    ws.onclose = () => {
      // Closed by leaveGame or a newer connection: nothing to report.
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setOpponentAway(false);
      if (stateRef.current?.gamePhase !== 'cancelled') {
        commit(null);
        setConnectionError('connection');
      }
    };
  }, [commit, playerId, token]);

  // A refreshed tab rejoins its game. Until the server answers nobody may
  // guess, so the turn is cleared.
  useEffect(() => {
    const saved = loadSaved();
    if (!saved) return;
    commit({ ...saved, currentTurnPlayerId: null });
    connect({ type: 'join', room: saved.roomCode });
  }, [commit, connect]);

  const createGame = (name: string, settings: GameSettings) => connect({ type: 'create', name, settings });

  const joinGame = (roomCode: string, name: string) => connect({ type: 'join', room: roomCode.trim(), name });

  // Solo games never touch the server: the computer is player 2.
  const startSolo = (name: string, settings: GameSettings) => {
    commit(readyBot({
      roomCode: '',
      settings,
      gamePhase: 'number_selection',
      player1: newPlayer(playerId, name, '🎮', settings),
      player2: newPlayer(BOT_ID, 'Bot', '🤖', settings),
      currentTurnPlayerId: null,
      guesses: [],
      winner: null,
      createdAt: Date.now(),
    }));
  };

  const selectNumber = (number: number) => {
    const prev = stateRef.current;
    if (!prev) return;
    if (!isSolo(prev)) return send({ type: 'select', number });
    commit({ ...prev, gamePhase: 'guessing', currentTurnPlayerId: playerId, player1: { ...prev.player1, selectedNumber: number, isReady: true } });
  };

  // The computer's turn in solo mode: it answers itself and hands the turn back.
  const playBot = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.currentTurnPlayerId !== BOT_ID) return;
    const guess = botGuess(s);
    commit(applyResponse(s, BOT_ID, guess, computeResponse(guess, s.player1.selectedNumber!), s.player1.id));
  }, [commit]);

  const makeGuess = useCallback((number: number) => {
    const prev = stateRef.current;
    if (!prev || prev.currentTurnPlayerId !== playerId) return;
    if (!isSolo(prev)) return send({ type: 'guess', number });
    const next = applyResponse(prev, playerId, number, computeResponse(number, prev.player2!.selectedNumber!), BOT_ID);
    commit(next);
    if (next.gamePhase === 'guessing') setTimeout(playBot, BOT_DELAY_MS);
  }, [playerId, commit, playBot]);

  const rematch = () => {
    const prev = stateRef.current;
    if (!prev) return;
    if (isSolo(prev)) commit(readyBot(resetRound(prev)));
    else send({ type: 'rematch' });
  };

  // An explicit leave ends the game for the opponent right away.
  const leaveGame = () => {
    send({ type: 'leave' });
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    setOpponentAway(false);
    setTurnEndsAt(null);
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
      gameState, opponentAway, turnEndsAt, connectionError, playerId,
      createGame, startSolo, joinGame, selectNumber, makeGuess, rematch, leaveGame,
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
