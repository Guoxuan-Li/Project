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

CREATE TABLE IF NOT EXISTS guestbook_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'approved'
);
CREATE INDEX IF NOT EXISTS guestbook_status_created ON guestbook_comments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS guestbook_ip_created ON guestbook_comments(ip_hash, created_at DESC);
