# number-guessing

Two-player online number guessing game, plus a solo mode against the computer. Next.js 16, React 19, Tailwind 4, and a WebSocket game server in the same Node process. No database, no accounts, no outside services.

## Features

- **Rooms**: the host creates a room and the server hands out an unused 4-digit code. One friend joins with it; full or unknown rooms are rejected.
- **Rules**: each player locks a secret number, then players take turns guessing the other's number. Answers (higher/lower/correct) are computed automatically, and each player's valid range narrows.
- **Fair play**: the server holds both secret numbers, answers every guess and runs the turn timer. Each browser sees only its own number until the game ends.
- **Rejoin**: a refreshed tab reconnects to its seat and gets the current state back. The other player waits up to 30 s. The turn timer keeps running, so a refresh buys no time.
- **Solo**: play against a bot that guesses at random inside its narrowed range. No server traffic.
- **Settings**: custom range (1–9999) and turn time limit (off, 5–60 s). When time runs out, the server makes a random guess from the valid range.
- **UI**: English and Turkish, light and dark theme, rematch with a running score, binary search bound on the end screen.

## How it works

`server.mjs` serves the Next app and attaches `relay.mjs` on `/ws`. Browsers send moves (create, join, select, guess, rematch, leave); the server applies the rules from `app/context/rules.ts` and sends each player the state with the opponent's secret removed. A seat is claimed with a random token kept in session storage, so only the same tab can rejoin it. Solo games run entirely in the browser.

## Commands

```sh
pnpm install
pnpm dev      # http://localhost:3000 with hot reload
pnpm build    # type-checked production build
pnpm start    # production server, PORT and HOST env vars (default 3000, 0.0.0.0)
pnpm test     # game server test (rooms, hidden secrets, answers, timer across a refresh) and game rules test
```

## GitHub Pages

Every push to `main` runs `.github/workflows/pages.yml`: tests, then a static export served at https://kaandinc.com/number-guessing/. Pages cannot run the relay, so the export connects to the one on the VPS below through the `RELAY_URL` repository variable (`wss://<host>/ws`). Without that variable the Pages site offers solo play only.

One-time setup: Settings → Pages → Source: GitHub Actions, and Settings → Secrets and variables → Actions → Variables → `RELAY_URL`.

## Deploy on a VPS

Needs Node 22.18 or newer: the server imports `rules.ts` directly. Run `pnpm build`, then keep `pnpm start` alive with systemd or pm2. Put nginx in front for TLS. WebSocket upgrades must pass through:

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

- Games live in server memory: a server restart ends them. Closing the tab for more than 30 s ends the game.
- One server process holds all rooms; at most 9000 rooms at once.
- The relay does not rate-limit clients.

## Layout

```
server.mjs            Next + relay entry point
relay.mjs             game server: rooms, rules, turn timer
relay.test.mjs
rules.test.mjs
app/
  page.tsx            header and phase switch
  context/            game state + relay client, pure game rules, translations
  components/         menu, waiting room, number selection, guessing, end screen
```
