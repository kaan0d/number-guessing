# number-guessing

Two-player online number guessing game. Next.js 16, React 19, Tailwind 4, and a small WebSocket relay in the same Node process. No database, no accounts, no outside services.

## Features

- **Rooms**: the host creates a room and the server hands out an unused 4-digit code. One friend joins with it; full or unknown rooms are rejected.
- **Rules**: each player locks a secret number, then players take turns guessing the other's number. Answers (higher/lower/correct) are computed automatically, and each player's valid range narrows.
- **Settings**: custom range (1–9999) and turn time limit (off, 5–60 s). When time runs out, a random guess from the valid range is made.
- **UI**: English and Turkish, light and dark theme, rematch.

## How it works

`server.mjs` serves the Next app and attaches `relay.mjs` on `/ws`. The relay only tracks room membership and forwards messages between the two players. All game state lives in the browsers. When a player disconnects, the relay tells the other one.

## Commands

```sh
pnpm install
pnpm dev      # http://localhost:3000 with hot reload
pnpm build    # type-checked production build
pnpm start    # production server, PORT and HOST env vars (default 3000, 0.0.0.0)
pnpm test     # relay test: create, join, forward, full room, disconnect
```

## Deploy on a VPS

Run `pnpm build`, then keep `pnpm start` alive with systemd or pm2. Put nginx in front for TLS. WebSocket upgrades must pass through:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

The relay pings clients every 30 s, so idle sockets stay under nginx's default 60 s timeout.

## Limits

- Game state lives only in the two browsers. Refreshing the page leaves the game.
- One server process holds all rooms; at most 9000 rooms at once.
- The relay does not rate-limit clients.

## Layout

```
server.mjs            Next + relay entry point
relay.mjs             room membership and message forwarding
relay.test.mjs
app/
  page.tsx            header and phase switch
  context/            game state + relay client, translations
  components/         menu, waiting room, number selection, guessing, end screen
```
