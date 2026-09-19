CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('travels', 'food', 'animals', 'crafts')),
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL,
  story TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS gallery_items_kind_created ON gallery_items(kind, created_at DESC);
