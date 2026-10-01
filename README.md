# number-guessing

Two-player online number guessing game. Next.js 16, React 19, Tailwind 4, Supabase Realtime broadcast channels. No database, no accounts.

## Features

- **Rooms**: host creates a room with a 4-digit code, one friend joins with it.
- **Rules**: each player locks a secret number, then players take turns guessing the other's number. Answers (higher/lower/correct) are computed automatically, and each player's valid range narrows.
- **Settings**: custom range (1–9999) and turn time limit (off, 5–60 s). When time runs out, a random guess from the valid range is made.
- **UI**: English and Turkish, light and dark theme, rematch.

## Setup

Create a Supabase project, then copy `.env.example` to `.env.local` and fill in the project URL and anon key. Realtime broadcast must be enabled (it is by default).

```sh
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # type-checked production build
```

## Limits

- Game state lives only in the two browsers. Refreshing the page leaves the game.
- Room codes are random 4-digit numbers with no collision check.

## Layout

```
app/
  page.tsx            header and phase switch
  context/            game state + realtime sync, translations
  components/         menu, waiting room, number selection, guessing, end screen
lib/supabase/client.ts
```
