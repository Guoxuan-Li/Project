CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  ip_hash TEXT,
  country TEXT,
  city TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'approved',
  contact TEXT,
  public_contact INTEGER NOT NULL DEFAULT 0,
  parent_id INTEGER REFERENCES comments(id),
  likes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_comments_status_created ON comments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id);

CREATE TABLE IF NOT EXISTS site_stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO site_stats (key, value) VALUES ('homepage_likes', 34), ('total_visits', 128);

CREATE TABLE IF NOT EXISTS stories (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS story_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_slug TEXT NOT NULL REFERENCES stories(slug) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES story_nodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_story_nodes_story ON story_nodes(story_slug, parent_id);
CREATE TABLE IF NOT EXISTS story_action_limits (
  action_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
