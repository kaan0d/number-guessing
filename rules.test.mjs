import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOT_ID, applyResponse, botGuess, isSolo, readyBot, computeResponse, hideSecret, newPlayer, resetRound, revealOpponent, takeBackPending } from './app/context/rules.ts'

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

test('rules: rejoin sync hides our secret and takes back an unanswered guess', () => {
  const s = takeBackPending(start(), 'a')
  assert.equal(s.guesses.length, 0)
  assert.equal(s.currentTurnPlayerId, 'a')
  assert.equal(takeBackPending(start(), 'b').guesses.length, 1)

  const sent = hideSecret(s, 'a')
  assert.equal(sent.player1.selectedNumber, undefined)
  assert.equal(sent.player2.selectedNumber, 70)
})

test('rules: the computer is always ready and guesses inside its range', () => {
  const base = start()
  const s = readyBot({ ...base, player2: { ...newPlayer(BOT_ID, 'Bot', '', settings), minRange: 40, maxRange: 45 } })
  assert.ok(isSolo(s) && !isSolo(base))
  assert.equal(s.player2.isReady, true)
  assert.ok(s.player2.selectedNumber >= 1 && s.player2.selectedNumber <= 100)
  for (let i = 0; i < 50; i++) {
    const g = botGuess(s)
    assert.ok(g >= 40 && g <= 45)
  }
})
