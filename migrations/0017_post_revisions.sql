-- 文章版本历史：每篇文章最多保留 50 个快照
CREATE TABLE IF NOT EXISTS post_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  protected INTEGER NOT NULL DEFAULT 0,
  enc TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published',
  publish_at INTEGER,
  reason TEXT NOT NULL DEFAULT 'save',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_revisions_post_created ON post_revisions(post_id, created_at DESC, id DESC);
