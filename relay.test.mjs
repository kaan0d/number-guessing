import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { attachRelay } from './relay.mjs'

// One "second" is 50 ms here: a 5 s turn lasts 300 ms with the slack, the rejoin grace 1.5 s.
test('relay: rooms, hidden secrets, server answers, turn timer survives a refresh', async () => {
  const server = createServer()
  const wss = attachRelay(server, { second: 50 })
  server.listen(0)
  await once(server, 'listening')
  const url = `ws://localhost:${server.address().port}/ws`

  const connect = async (playerId, token = `${playerId}-token`) => {
    const ws = new WebSocket(url)
    const inbox = []
    const waiters = []
    ws.on('message', (d) => {
      const msg = JSON.parse(d)
      const w = waiters.shift()
      w ? w(msg) : inbox.push(msg)
    })
    await once(ws, 'open')
    ws.next = () => (inbox.length ? Promise.resolve(inbox.shift()) : new Promise((r) => waiters.push(r)))
    // Skips messages until one matches.
    ws.until = async (match) => { for (;;) { const msg = await ws.next(); if (match(msg)) return msg } }
    ws.json = (msg) => ws.send(JSON.stringify({ playerId, token, ...msg }))
    return ws
  }

  const host = await connect('a')
  host.json({ type: 'create', name: 'Host', settings: { minNumber: 1, maxNumber: 100, turnTimeLimit: 5 } })
  const { state: created } = await host.next()
  assert.equal(created.gamePhase, 'waiting')
  const room = created.roomCode
  assert.match(room, /^\d{4}$/)

  const lost = await connect('x')
  lost.json({ type: 'join', room: room === '9999' ? '1000' : '9999', name: 'Lost' })
  assert.deepEqual(await lost.next(), { type: 'error', reason: 'not_found' })

  let guest = await connect('b')
  guest.json({ type: 'join', room, name: 'Guest' })
  assert.equal((await guest.next()).state.gamePhase, 'number_selection')
  assert.equal((await host.next()).state.player2.name, 'Guest')

  const third = await connect('c')
  third.json({ type: 'join', room, name: 'Third' })
  assert.deepEqual(await third.next(), { type: 'error', reason: 'full' })
  // Knowing the guest's id is not enough to take their seat.
  const thief = await connect('b', 'wrong')
  thief.json({ type: 'join', room })
  assert.deepEqual(await thief.next(), { type: 'error', reason: 'full' })

  host.json({ type: 'select', number: 30 })
  guest.json({ type: 'select', number: 70 })
  const seen = await guest.until((m) => m.state.gamePhase === 'guessing')
  assert.equal(seen.state.player1.selectedNumber, undefined)
  assert.equal(seen.state.player2.selectedNumber, 70)
  assert.equal(seen.state.currentTurnPlayerId, 'a')
  assert.ok(seen.turnEndsIn > 0 && seen.turnEndsIn <= 250)

  // The server answers against the guest's secret.
  guest.json({ type: 'guess', number: 50 }) // not the guest's turn: ignored
  host.json({ type: 'guess', number: 50 })
  let msg = await host.until((m) => m.state.guesses.length === 1)
  assert.deepEqual(msg.state.guesses, [{ guesser: 'a', number: 50, response: 'higher' }])
  assert.equal(msg.state.player1.minRange, 51)
  assert.equal(msg.state.currentTurnPlayerId, 'b')

  // The guest refreshes on their turn: the clock keeps running and the
  // server guesses for them when it runs out.
  guest.close()
  msg = await host.until((m) => m.away)
  msg = await host.until((m) => m.state.guesses.length === 2)
  assert.equal(msg.state.guesses[1].guesser, 'b')
  assert.equal(msg.state.currentTurnPlayerId, 'a')

  guest = await connect('b')
  guest.json({ type: 'join', room })
  msg = await guest.next()
  assert.equal(msg.state.guesses.length, 2)
  assert.equal(msg.state.player2.selectedNumber, 70)
  assert.equal(msg.away, false)
  assert.equal((await host.until((m) => !m.away)).away, false)

  host.json({ type: 'guess', number: 70 })
  msg = await guest.until((m) => m.state.gamePhase === 'ended')
  assert.equal(msg.state.winner, 'a')
  assert.equal(msg.state.player1.selectedNumber, 30)
  assert.equal(msg.turnEndsIn, null)

  guest.json({ type: 'rematch' })
  assert.equal((await host.until((m) => m.state.gamePhase !== 'ended')).state.gamePhase, 'number_selection')

  host.json({ type: 'leave' })
  msg = await guest.until((m) => m.state.gamePhase === 'cancelled')
  assert.equal(msg.away, false)

  for (const ws of [host, guest, lost, third, thief]) ws.close()
  wss.close()
  server.close()
})
