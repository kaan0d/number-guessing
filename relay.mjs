import { WebSocketServer } from 'ws'

const MAX_PLAYERS = 2
const PING_INTERVAL_MS = 30_000

// Relays game messages between the two players of a room. The server only
// owns room membership; all game state lives in the browsers.
export function attachRelay(server, path = '/ws') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  const rooms = new Map() // room code -> Set<WebSocket>

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== path) return
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
  })

  const send = (ws, msg) => ws.send(JSON.stringify(msg))

  const enter = (ws, code) => {
    if (!rooms.has(code)) rooms.set(code, new Set())
    rooms.get(code).add(ws)
    ws.room = code
  }

  const newRoomCode = () => {
    // ponytail: 9000 codes; more concurrent rooms than that gets a "server full" error
    for (let i = 0; i < 100; i++) {
      const code = String(1000 + Math.floor(Math.random() * 9000))
      if (!rooms.has(code)) return code
    }
    return null
  }

  wss.on('connection', (ws) => {
    ws.alive = true
    ws.on('pong', () => { ws.alive = true })

    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data) } catch { return }
      if (!msg || typeof msg !== 'object') return

      if (msg.type === 'create' && !ws.room) {
        const code = newRoomCode()
        if (!code) return send(ws, { type: 'error', reason: 'server_full' })
        enter(ws, code)
        send(ws, { type: 'created', room: code })
      } else if (msg.type === 'join' && !ws.room) {
        const members = rooms.get(String(msg.room))
        if (!members) return send(ws, { type: 'error', reason: 'not_found' })
        if (members.size >= MAX_PLAYERS) return send(ws, { type: 'error', reason: 'full' })
        enter(ws, String(msg.room))
        send(ws, { type: 'joined', room: ws.room })
      } else if (msg.type === 'broadcast' && ws.room && typeof msg.event === 'string') {
        const out = JSON.stringify({ type: 'broadcast', event: msg.event, payload: msg.payload ?? {} })
        for (const peer of rooms.get(ws.room)) if (peer !== ws) peer.send(out)
      }
    })

    ws.on('close', () => {
      const members = rooms.get(ws.room)
      if (!members) return
      members.delete(ws)
      for (const peer of members) send(peer, { type: 'peer_left' })
      if (members.size === 0) rooms.delete(ws.room)
    })
  })

  // Drop dead connections and keep proxies from closing idle sockets.
  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue }
      ws.alive = false
      ws.ping()
    }
  }, PING_INTERVAL_MS)
  wss.on('close', () => clearInterval(timer))

  return wss
}
