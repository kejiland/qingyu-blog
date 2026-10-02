-- R2 备份元数据：备份文件本体存私有 R2_BACKUP_BUCKET
CREATE TABLE IF NOT EXISTS backups (
  id          TEXT PRIMARY KEY,
  object_key  TEXT NOT NULL,
  size        INTEGER DEFAULT 0,
  reason      TEXT DEFAULT 'manual',
  created_at  INTEGER NOT NULL,
  counts      TEXT DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at DESC, id DESC);
