import { createServer } from 'node:http'
import { attachRelay } from './relay.mjs'

const dev = process.argv.includes('--dev')
process.env.NODE_ENV ??= dev ? 'development' : 'production'
const port = Number(process.env.PORT) || 3000
const hostname = process.env.HOST || '0.0.0.0'

// Imported after NODE_ENV is set, so Next picks the right mode.
const { default: next } = await import('next')
const app = next({ dev, hostname, port })
await app.prepare()

const handle = app.getRequestHandler()
const server = createServer((req, res) => handle(req, res))
attachRelay(server)

server.listen(port, hostname, () => {
  console.log(`Ready on http://${hostname}:${port} (${dev ? 'dev' : 'production'})`)
})
