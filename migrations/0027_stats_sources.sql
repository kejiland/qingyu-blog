-- 访问来源 / 设备统计：按天聚合
CREATE TABLE IF NOT EXISTS stats_sources (
  post_id TEXT NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  PRIMARY KEY (post_id, date, kind, name)
);
CREATE INDEX IF NOT EXISTS idx_stats_sources_date ON stats_sources(date);
