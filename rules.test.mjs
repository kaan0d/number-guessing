import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyResponse, computeResponse, newPlayer, resetRound, revealOpponent } from './app/context/rules.ts'

const settings = { minNumber: 1, maxNumber: 100, turnTimeLimit: 0 }
const start = () => ({
  roomCode: '1234', settings, gamePhase: 'guessing', createdAt: 0, winner: null,
  player1: { ...newPlayer('a', 'A', '', settings), selectedNumber: 30, isReady: true },
  player2: { ...newPlayer('b', 'B', '', settings), selectedNumber: 70, isReady: true },
  currentTurnPlayerId: 'a',
  guesses: [{ guesser: 'a', number: 50, response: 'pending' }],
})

test('rules: answer narrows range, passes turn, ends on correct', () => {
  assert.equal(computeResponse(50, 70), 'higher')
  let s = applyResponse(start(), 'a', 50, 'higher', 'b')
  assert.deepEqual(s.guesses, [{ guesser: 'a', number: 50, response: 'higher' }])
  assert.equal(s.player1.minRange, 51)
  assert.equal(s.player1.maxRange, 100)
  assert.equal(s.currentTurnPlayerId, 'b')

  s = applyResponse(s, 'b', 40, 'lower', 'a')
  assert.equal(s.player2.maxRange, 39)

  s = applyResponse(s, 'a', 70, 'correct', 'b')
  assert.equal(s.gamePhase, 'ended')
  assert.equal(s.winner, 'a')
  assert.equal(s.currentTurnPlayerId, null)
  assert.equal(s.player1.wins, 1)
  assert.equal(s.player2.wins, 0)

  s = revealOpponent(s, 'b', 99)
  assert.equal(s.player1.selectedNumber, 99)

  s = resetRound(s)
  assert.equal(s.gamePhase, 'number_selection')
  assert.equal(s.player1.selectedNumber, undefined)
  assert.equal(s.player1.minRange, 1)
  assert.equal(s.guesses.length, 0)
  assert.equal(s.player1.wins, 1)
})
