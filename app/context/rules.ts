// Pure game rules, shared by the multiplayer and solo paths and by rules.test.mjs.

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

export function newPlayer(id: string, name: string, avatar: string, settings: GameSettings): Player {
  return { id, name, avatar, isReady: false, minRange: settings.minNumber, maxRange: settings.maxNumber };
}

export function playerOf(state: GameState, id: string): Player {
  return state.player1.id === id ? state.player1 : state.player2!;
}

// Sets the opponent's secret number, which only arrives once the game ends.
export function revealOpponent(state: GameState, myId: string, secret: number): GameState {
  return state.player1.id === myId
    ? { ...state, player2: { ...state.player2!, selectedNumber: secret } }
    : { ...state, player1: { ...state.player1, selectedNumber: secret } };
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
    },
    gamePhase: ended ? 'ended' : 'guessing',
    winner: ended ? guesserId : null,
    currentTurnPlayerId: ended ? null : nextTurn,
  };
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
