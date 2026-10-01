// Pure game rules, shared by the game server (relay.mjs), solo mode and rules.test.mjs.

export interface GameSettings {
  minNumber: number;
  maxNumber: number;
  turnTimeLimit: number; // seconds, 0 = no limit
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  selectedNumber?: number;
  isReady: boolean;
  minRange: number;
  maxRange: number;
  wins: number; // kept across rematches
}

export type Response = 'higher' | 'lower' | 'correct';

export interface GameState {
  roomCode: string;
  settings: GameSettings;
  gamePhase: 'lobby' | 'waiting' | 'number_selection' | 'guessing' | 'ended' | 'cancelled';
  player1: Player;
  player2: Player | null;
  currentTurnPlayerId: string | null;
  guesses: Array<{
    guesser: string;
    number: number;
    response: Response | 'pending';
  }>;
  winner: string | null;
  createdAt: number;
}

export const BOT_ID = 'bot';

export function isSolo(state: GameState) {
  return state.player2?.id === BOT_ID;
}

// The computer locks a fresh random number, so it is always ready.
export function readyBot(state: GameState): GameState {
  const { minNumber, maxNumber } = state.settings;
  return { ...state, player2: { ...state.player2!, isReady: true, selectedNumber: randomIn(minNumber, maxNumber) } };
}

// ponytail: the computer guesses at random inside its narrowed range; guess the midpoint for a harder bot
export function botGuess(state: GameState): number {
  return randomIn(state.player2!.minRange, state.player2!.maxRange);
}

export function newPlayer(id: string, name: string, avatar: string, settings: GameSettings): Player {
  return { id, name, avatar, isReady: false, minRange: settings.minNumber, maxRange: settings.maxNumber, wins: 0 };
}

export function playerOf(state: GameState, id: string): Player {
  return state.player1.id === id ? state.player1 : state.player2!;
}

export function randomIn(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function computeResponse(guess: number, secretNumber: number): Response {
  if (guess === secretNumber) return 'correct';
  if (guess < secretNumber) return 'higher';
  return 'lower';
}

// Records an answered guess: narrows the guesser's range, ends the game on a
// correct guess, otherwise hands the turn to nextTurn. Drops the guesser's
// own pending placeholder.
export function applyResponse(state: GameState, guesserId: string, guess: number, response: Response, nextTurn: string): GameState {
  const key = state.player1.id === guesserId ? 'player1' : 'player2';
  const guesser = state[key]!;
  const ended = response === 'correct';
  return {
    ...state,
    guesses: [...state.guesses.filter(g => g.response !== 'pending'), { guesser: guesserId, number: guess, response }],
    [key]: {
      ...guesser,
      minRange: response === 'higher' ? Math.max(guesser.minRange, guess + 1) : guesser.minRange,
      maxRange: response === 'lower' ? Math.min(guesser.maxRange, guess - 1) : guesser.maxRange,
      wins: guesser.wins + (ended ? 1 : 0),
    },
    gamePhase: ended ? 'ended' : 'guessing',
    winner: ended ? guesserId : null,
    currentTurnPlayerId: ended ? null : nextTurn,
  };
}

// What the server sends myId's opponent: everything but myId's secret number.
export function hideSecret(state: GameState, myId: string): GameState {
  return state.player1.id === myId
    ? { ...state, player1: { ...state.player1, selectedNumber: undefined } }
    : { ...state, player2: { ...state.player2!, selectedNumber: undefined } };
}

export function resetRound(state: GameState): GameState {
  const reset = (p: Player): Player => ({
    ...p, selectedNumber: undefined, isReady: false, minRange: state.settings.minNumber, maxRange: state.settings.maxNumber,
  });
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
