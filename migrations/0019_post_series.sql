-- 文章系列 / 专栏：一篇文章归属一个系列，series_order 控制系列内顺序
ALTER TABLE posts ADD COLUMN series TEXT DEFAULT '';
ALTER TABLE posts ADD COLUMN series_order INTEGER DEFAULT 0;
ALTER TABLE post_revisions ADD COLUMN series TEXT DEFAULT '';
ALTER TABLE post_revisions ADD COLUMN series_order INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_posts_series ON posts(series, series_order);
