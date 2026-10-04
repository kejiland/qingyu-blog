-- 前端错误日志（浏览器运行时异常上报，按 fingerprint 聚合去重）
CREATE TABLE IF NOT EXISTS error_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'error',
  message     TEXT NOT NULL DEFAULT '',
  source      TEXT DEFAULT '',
  stack       TEXT DEFAULT '',
  url         TEXT DEFAULT '',
  ua          TEXT DEFAULT '',
  hits        INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  last_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_error_logs_fp ON error_logs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_logs_last ON error_logs(last_at DESC);
