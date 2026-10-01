import { WebSocketServer } from 'ws'
import { applyResponse, computeResponse, hideSecret, newPlayer, playerOf, randomIn, resetRound } from './app/context/rules.ts'

const PING_INTERVAL_MS = 30_000
// How long a disconnected player has to come back before the game is called off.
const REJOIN_GRACE_SECONDS = 30
// Extra time on top of the turn limit, so a guess sent at the last moment still counts.
const TURN_SLACK_SECONDS = 1
const TIME_LIMITS = [0, 5, 10, 15, 30, 60]

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64

function validSettings(s) {
  return !!s && Number.isInteger(s.minNumber) && Number.isInteger(s.maxNumber)
    && s.minNumber >= 1 && s.maxNumber <= 9999 && s.maxNumber - s.minNumber >= 9
    && TIME_LIMITS.includes(s.turnTimeLimit)
}

function withPlayer(state, id, patch) {
  const key = state.player1.id === id ? 'player1' : 'player2'
  return { ...state, [key]: { ...state[key], ...patch } }
}

// Runs the games. The server holds both secret numbers, answers guesses and
// enforces the turn timer; browsers only send moves and show the state they
// get back. A player rejoins their seat with the token they created it with.
// `second` is shortened by the tests.
export function attachRelay(server, { path = '/ws', second = 1000 } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })
  // room code -> { state, sockets: Map<playerId, ws>, tokens: Map<playerId, token>, deadline, turnTimer, graceTimer }
  const rooms = new Map()

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== path) return
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
  })

  const send = (ws, msg) => ws.send(JSON.stringify(msg))

  // Each player sees everything but the opponent's secret, until the game ends.
  const sendState = (room) => {
    const { state } = room
    for (const [id, ws] of room.sockets) {
      const opponent = state.player1.id === id ? state.player2 : state.player1
      send(ws, {
        type: 'state',
        state: !opponent || state.gamePhase === 'ended' ? state : hideSecret(state, opponent.id),
        away: !!opponent && state.gamePhase !== 'cancelled' && !room.sockets.has(opponent.id),
        turnEndsIn: room.deadline ? Math.max(room.deadline - TURN_SLACK_SECONDS * second - Date.now(), 0) : null,
      })
    }
  }

  const guess = (room, id, number) => {
    const { state } = room
    if (state.gamePhase !== 'guessing' || state.currentTurnPlayerId !== id) return
    const me = playerOf(state, id)
    if (!Number.isInteger(number) || number < me.minRange || number > me.maxRange) return
    const opponent = state.player1.id === id ? state.player2 : state.player1
    room.state = applyResponse(state, id, number, computeResponse(number, opponent.selectedNumber), opponent.id)
    startTurn(room)
    sendState(room)
  }

  // Keeps running while the player is disconnected, so a refresh buys no time.
  const startTurn = (room) => {
    clearTimeout(room.turnTimer)
    room.deadline = null
    const { state } = room
    const limit = state.settings.turnTimeLimit
    if (state.gamePhase !== 'guessing' || limit === 0) return
    const ms = (limit + TURN_SLACK_SECONDS) * second
    room.deadline = Date.now() + ms
    room.turnTimer = setTimeout(() => {
      const me = playerOf(room.state, room.state.currentTurnPlayerId)
      guess(room, me.id, randomIn(me.minRange, me.maxRange))
    }, ms)
  }

  const closeRoom = (room) => {
    clearTimeout(room.turnTimer)
    clearTimeout(room.graceTimer)
    room.deadline = null
    room.state = { ...room.state, gamePhase: 'cancelled', currentTurnPlayerId: null }
    sendState(room)
    for (const ws of room.sockets.values()) ws.room = null
    rooms.delete(room.state.roomCode)
  }

  const newRoomCode = () => {
    // ponytail: 9000 codes; more concurrent rooms than that gets a "server full" error
    for (let i = 0; i < 100; i++) {
      const code = String(1000 + Math.floor(Math.random() * 9000))
      if (!rooms.has(code)) return code
    }
    return null
  }

  const enter = (ws, room, id) => {
    room.sockets.get(id)?.close()
    room.sockets.set(id, ws)
    ws.room = room
    ws.playerId = id
  }

  const create = (ws, msg) => {
    if (!validSettings(msg.settings)) return
    const code = newRoomCode()
    if (!code) return send(ws, { type: 'error', reason: 'server_full' })
    const settings = {
      minNumber: msg.settings.minNumber, maxNumber: msg.settings.maxNumber, turnTimeLimit: msg.settings.turnTimeLimit,
    }
    const room = {
      state: {
        roomCode: code,
        settings,
        gamePhase: 'waiting',
        player1: newPlayer(msg.playerId, msg.name, '🎮', settings),
        player2: null,
        currentTurnPlayerId: null,
        guesses: [],
        winner: null,
        createdAt: Date.now(),
      },
      sockets: new Map(),
      tokens: new Map([[msg.playerId, msg.token]]),
    }
    rooms.set(code, room)
    enter(ws, room, msg.playerId)
    sendState(room)
  }

  const join = (ws, msg) => {
    const room = rooms.get(String(msg.room))
    if (!room) return send(ws, { type: 'error', reason: 'not_found' })
    const { state } = room
    if (room.tokens.has(msg.playerId)) {
      // Rejoin after a refresh: same seat, same game, same turn deadline.
      if (room.tokens.get(msg.playerId) !== msg.token) return send(ws, { type: 'error', reason: 'full' })
    } else {
      if (state.player2) return send(ws, { type: 'error', reason: 'full' })
      room.tokens.set(msg.playerId, msg.token)
      room.state = { ...state, gamePhase: 'number_selection', player2: newPlayer(msg.playerId, msg.name, '🎯', state.settings) }
    }
    enter(ws, room, msg.playerId)
    if (room.sockets.size === 2) clearTimeout(room.graceTimer)
    sendState(room)
  }

  const select = (room, id, number) => {
    const { state } = room
    if (state.gamePhase !== 'number_selection' || playerOf(state, id).isReady) return
    if (!Number.isInteger(number) || number < state.settings.minNumber || number > state.settings.maxNumber) return
    const next = withPlayer(state, id, { selectedNumber: number, isReady: true })
    const bothReady = next.player1.isReady && next.player2.isReady
    room.state = bothReady ? { ...next, gamePhase: 'guessing', currentTurnPlayerId: next.player1.id } : next
    startTurn(room)
    sendState(room)
  }

  // A closed socket may be a refresh: the opponent waits, and the turn timer
  // keeps running. An explicit leave, or a host alone in the room, ends it.
  const drop = (ws, left) => {
    const room = ws.room
    ws.room = null
    if (!room || room.sockets.get(ws.playerId) !== ws) return
    room.sockets.delete(ws.playerId)
    if (left || !room.state.player2) return closeRoom(room)
    clearTimeout(room.graceTimer)
    room.graceTimer = setTimeout(() => closeRoom(room), REJOIN_GRACE_SECONDS * second)
    sendState(room)
  }

  wss.on('connection', (ws) => {
    ws.alive = true
    ws.on('pong', () => { ws.alive = true })

    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data) } catch { return }
      if (!msg || typeof msg !== 'object') return
      const room = ws.room

      if (!room && (msg.type === 'create' || msg.type === 'join')) {
        if (!isId(msg.playerId) || !isId(msg.token)) return
        msg.name = String(msg.name ?? '').trim().slice(0, 20) || 'Player'
        if (msg.type === 'create') create(ws, msg)
        else join(ws, msg)
      } else if (!room) {
        return
      } else if (msg.type === 'select') {
        select(room, ws.playerId, msg.number)
      } else if (msg.type === 'guess') {
        guess(room, ws.playerId, msg.number)
      } else if (msg.type === 'rematch' && room.state.gamePhase === 'ended') {
        room.state = resetRound(room.state)
        sendState(room)
      } else if (msg.type === 'leave') {
        drop(ws, true)
      }
    })

    ws.on('close', () => drop(ws, false))
  })

  // Drop dead connections and keep proxies from closing idle sockets.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue }
      ws.alive = false
      ws.ping()
    }
  }, PING_INTERVAL_MS)
  wss.on('close', () => {
    clearInterval(timer)
    for (const room of rooms.values()) {
      clearTimeout(room.turnTimer)
      clearTimeout(room.graceTimer)
    }
  })

  return wss
}
