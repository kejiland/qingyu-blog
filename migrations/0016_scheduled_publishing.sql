-- 定时发布：在 status='scheduled' 时保存预计发布时间（UTC 毫秒时间戳）
ALTER TABLE posts ADD COLUMN publish_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON posts(publish_at) WHERE status = 'scheduled';
