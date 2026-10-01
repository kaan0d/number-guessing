import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import WebSocket from 'ws'
import { attachRelay } from './relay.mjs'

test('relay: create, join, forward, full room, peer left', async () => {
  const server = createServer()
  const wss = attachRelay(server)
  server.listen(0)
  await once(server, 'listening')
  const url = `ws://localhost:${server.address().port}/ws`

  const connect = async () => {
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
    ws.json = (msg) => ws.send(JSON.stringify(msg))
    return ws
  }

  const host = await connect()
  host.json({ type: 'create' })
  const { type, room } = await host.next()
  assert.equal(type, 'created')
  assert.match(room, /^\d{4}$/)

  const lost = await connect()
  lost.json({ type: 'join', room: room === '9999' ? '1000' : '9999' })
  assert.deepEqual(await lost.next(), { type: 'error', reason: 'not_found' })

  const guest = await connect()
  guest.json({ type: 'join', room })
  assert.deepEqual(await guest.next(), { type: 'joined', room })

  guest.json({ type: 'broadcast', event: 'guess_made', payload: { guessedNumber: 42 } })
  assert.deepEqual(await host.next(), { type: 'broadcast', event: 'guess_made', payload: { guessedNumber: 42 } })

  const third = await connect()
  third.json({ type: 'join', room })
  assert.deepEqual(await third.next(), { type: 'error', reason: 'full' })

  guest.close()
  assert.deepEqual(await host.next(), { type: 'peer_left' })

  // A refreshed guest gets back into the room while the host is still there.
  const back = await connect()
  back.json({ type: 'join', room })
  assert.deepEqual(await back.next(), { type: 'joined', room })
  back.json({ type: 'broadcast', event: 'rejoin', payload: {} })
  assert.deepEqual(await host.next(), { type: 'broadcast', event: 'rejoin', payload: {} })
  back.close()
  await host.next()

  for (const ws of [host, lost, third]) ws.close()
  wss.close()
  server.close()
})
