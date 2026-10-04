-- Webmention：外站引用你的文章时，来源页主动通知本端点，校验后展示
CREATE TABLE IF NOT EXISTS webmentions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  target      TEXT NOT NULL,
  post_id     TEXT DEFAULT '',
  author_name TEXT DEFAULT '',
  author_url  TEXT DEFAULT '',
  title       TEXT DEFAULT '',
  excerpt     TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'approved',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webmentions_src_tgt ON webmentions(source, target);
CREATE INDEX IF NOT EXISTS idx_webmentions_target ON webmentions(target, created_at DESC);
