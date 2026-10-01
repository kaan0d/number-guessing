-- Create the games table for real-time multiplayer
CREATE TABLE IF NOT EXISTS public.games (
  room_code TEXT PRIMARY KEY,
  game_phase TEXT NOT NULL DEFAULT 'waiting',
  player1_id TEXT NOT NULL,
  player1_name TEXT NOT NULL,
  player1_selected_number INT,
  player1_is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  player2_id TEXT,
  player2_name TEXT,
  player2_selected_number INT,
  player2_is_ready BOOLEAN NOT NULL DEFAULT FALSE,
  current_turn_player_id TEXT,
  min_range INT NOT NULL DEFAULT 1,
  max_range INT NOT NULL DEFAULT 100,
  guesses JSONB NOT NULL DEFAULT '[]',
  winner TEXT,
  created_at BIGINT NOT NULL
);

-- Disable RLS so anyone with a room code can join (no auth required)
ALTER TABLE public.games DISABLE ROW LEVEL SECURITY;

-- Grant access to anon role
GRANT ALL ON public.games TO anon;
GRANT ALL ON public.games TO authenticated;
