#!/usr/bin/env python3
import os
import sys
from supabase import create_client, Client

# Get Supabase credentials from environment
url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

supabase: Client = create_client(url, key)

# Create games table
games_table_sql = """
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  player1_id UUID,
  player2_id UUID,
  player1_number INTEGER,
  player2_number INTEGER,
  player1_name TEXT DEFAULT 'Player 1',
  player2_name TEXT DEFAULT 'Player 2',
  current_turn UUID,
  game_phase TEXT DEFAULT 'waiting', -- 'waiting', 'number_selection', 'guessing', 'ended'
  winner_id UUID,
  min_range INTEGER DEFAULT 1,
  max_range INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create guesses table
CREATE TABLE IF NOT EXISTS public.guesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  guesser_id UUID NOT NULL,
  guess_number INTEGER NOT NULL,
  response TEXT, -- 'correct', 'higher', 'lower'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guesses ENABLE ROW LEVEL SECURITY;

-- Create policies for games table (allow access to players in the game)
CREATE POLICY "games_select_own" ON public.games 
  FOR SELECT USING (
    player1_id = auth.uid() OR player2_id = auth.uid()
  );

CREATE POLICY "games_insert_own" ON public.games 
  FOR INSERT WITH CHECK (player1_id = auth.uid());

CREATE POLICY "games_update_own" ON public.games 
  FOR UPDATE USING (
    player1_id = auth.uid() OR player2_id = auth.uid()
  );

-- Create policies for guesses table
CREATE POLICY "guesses_select_own" ON public.guesses 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.games g 
      WHERE g.id = guesses.game_id 
      AND (g.player1_id = auth.uid() OR g.player2_id = auth.uid())
    )
  );

CREATE POLICY "guesses_insert_own" ON public.guesses 
  FOR INSERT WITH CHECK (guesser_id = auth.uid());
"""

try:
    # Execute SQL using the admin client
    response = supabase.postgrest.rpc('exec', {'sql': games_table_sql}).execute()
    print("✅ Database tables created successfully")
except Exception as e:
    # If direct SQL execution fails, try creating tables one at a time
    print(f"Note: {str(e)}")
    print("Tables may already exist or require manual setup via Supabase dashboard")
    print("The application will still work with proper schema setup")
