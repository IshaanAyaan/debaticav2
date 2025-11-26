-- Supabase database schema

-- Users table (handled by Supabase Auth)

-- Cards table
CREATE TABLE cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  citation TEXT NOT NULL,
  content TEXT NOT NULL,
  url TEXT,
  font TEXT DEFAULT 'calibri',
  tag_size TEXT DEFAULT '12pt',
  highlight_color TEXT DEFAULT '#fdff00',
  highlights JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Collections table for organizing cards
CREATE TABLE collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  topic TEXT,
  argument_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Junction table for cards in collections
CREATE TABLE card_collections (
  card_id UUID REFERENCES cards(id) ON DELETE CASCADE,
  collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
  position INTEGER,
  PRIMARY KEY (card_id, collection_id)
);

-- Search history
CREATE TABLE search_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  results JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can CRUD their own cards" ON cards
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD their own collections" ON collections
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can CRUD their own card_collections" ON card_collections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE collections.id = card_collections.collection_id
      AND collections.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view their own search history" ON search_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own search history" ON search_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_cards_user_id ON cards(user_id);
CREATE INDEX idx_collections_user_id ON collections(user_id);
CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_cards_created_at ON cards(created_at DESC);
