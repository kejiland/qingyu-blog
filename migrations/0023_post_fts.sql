-- ============================================================
-- 文章全文搜索（D1 FTS5）
-- ------------------------------------------------------------
-- 使用 trigram 分词器，支持中文/英文的子串搜索（>=3 个字符）。
-- 短关键词由 /api/search 自动回退到 LIKE，避免 1~2 字中文无法命中。
-- posts_fts 为 external-content 表，只保存索引，正文仍只存 posts。
-- ============================================================

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  id UNINDEXED,
  title,
  excerpt,
  content,
  tags,
  content='posts',
  content_rowid='rowid',
  tokenize='trigram'
);

-- 新增文章：同步写入 FTS 索引
CREATE TRIGGER IF NOT EXISTS posts_fts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, id, title, excerpt, content, tags)
  VALUES (new.rowid, new.id, new.title, new.excerpt, new.content, new.tags);
END;

-- 删除文章：从 FTS 索引移除
CREATE TRIGGER IF NOT EXISTS posts_fts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, id, title, excerpt, content, tags)
  VALUES ('delete', old.rowid, old.id, old.title, old.excerpt, old.content, old.tags);
END;

-- 更新文章：先删旧索引，再写新索引
CREATE TRIGGER IF NOT EXISTS posts_fts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, id, title, excerpt, content, tags)
  VALUES ('delete', old.rowid, old.id, old.title, old.excerpt, old.content, old.tags);
  INSERT INTO posts_fts(rowid, id, title, excerpt, content, tags)
  VALUES (new.rowid, new.id, new.title, new.excerpt, new.content, new.tags);
END;

-- 回填已有文章（重复执行只会重建索引，不会重复插入）
INSERT INTO posts_fts(posts_fts) VALUES ('rebuild');