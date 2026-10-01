-- Create games table for the number guessing game
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,
  player1_id TEXT NOT NULL,
  player1_name TEXT NOT NULL,
  player2_id TEXT,
  player2_name TEXT,
  player1_number INTEGER,
  player2_number INTEGER,
  current_turn TEXT,
  player1_guesses INTEGER[] DEFAULT '{}',
  player2_guesses INTEGER[] DEFAULT '{}',
  game_phase TEXT NOT NULL DEFAULT 'waiting', -- waiting, selecting, guessing, finished
  winner TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on room_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_games_room_code ON public.games(room_code);

-- Enable realtime for the games table (ignore if already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read games (for joining via room code)
CREATE POLICY "Anyone can view games" ON public.games
  FOR SELECT USING (true);

-- Allow anyone to create games
CREATE POLICY "Anyone can create games" ON public.games
  FOR INSERT WITH CHECK (true);

-- Allow players to update their own games
CREATE POLICY "Players can update their games" ON public.games
  FOR UPDATE USING (true);
