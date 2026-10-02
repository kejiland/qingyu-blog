-- 邮件订阅与通知发件箱（双重确认 + 异步发送）
CREATE TABLE IF NOT EXISTS subscribers (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending',
  token         TEXT NOT NULL UNIQUE,
  locale        TEXT DEFAULT 'zh-CN',
  created_at    INTEGER NOT NULL,
  confirmed_at  INTEGER,
  unsubscribed_at INTEGER,
  last_notified_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status, created_at DESC);

CREATE TABLE IF NOT EXISTS mail_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    TEXT NOT NULL,
  to_email   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  attempts   INTEGER NOT NULL DEFAULT 0,
  error      TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  sent_at    INTEGER,
  UNIQUE(post_id, to_email)
);
CREATE INDEX IF NOT EXISTS idx_mail_outbox_pending ON mail_outbox(status, created_at);
