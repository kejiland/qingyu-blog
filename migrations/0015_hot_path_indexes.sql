-- ============================================================
-- 0015 · 补齐热点查询缺失索引
-- ------------------------------------------------------------
-- 全部使用 CREATE INDEX IF NOT EXISTS，可安全重复执行（幂等）。
-- 背景：以下三张表在写入/读取热路径上有稳定的排序或过滤条件，
-- 但此前没有任何匹配的复合索引，SQLite 只能全表扫描 + 内存排序，
-- 数据量增长后后台列表与公开列表会明显变慢。
-- 设计原则：索引列顺序 = (等值过滤列 …, 排序列 …)，让 SQLite 既能
-- 用索引定位，又能直接按索引顺序返回、免去临时排序（no temp b-tree）。
-- ============================================================

-- 1) 某篇文章的评论列表（文章详情页 / 计数 / 去重检查）
--    查询：WHERE post_id = ? ORDER BY rowid ASC        （api-core.js:436）
--          WHERE post_id = ? AND id = ?                （api-core.js:419/474/531）
--          SELECT COUNT(*) WHERE post_id = ?           （api-core.js:485）
--          WHERE post_id = ? AND author = ? AND content = ?  （api-core.js:490 去重）
--    说明：rowid 是 rowid 表的隐式主键，无需也无法显式建列；
--    复合索引 (post_id, id) 同时服务「按 post_id 取全部」与「post_id + id 精确定位」。
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id, id);

-- 2) 后台评论管理列表：按审核状态过滤 + 按时间倒序
--    查询：SELECT c.* ... ORDER BY c.rowid DESC LIMIT ?，
--          可选 WHERE c.status = ?                    （api-core.js:1052 起）
--    已有 idx_comments_status 只含单列 status（基数仅 2），
--    对「过滤后排序」帮助有限。
--    注意：不能写成 (status, rowid DESC) —— SQLite 不允许把 rowid 用作
--    索引列（只允许在表达式中引用），会直接报 "no such column: rowid"。
--    改按 (status, date) 建索引：既服务状态过滤，也让常见的按日期排序走索引。
CREATE INDEX IF NOT EXISTS idx_comments_status_date ON comments(status, date);

-- 3) 音乐播放列表：公开接口每次都按 sort, created_at 排序
--    查询：SELECT * FROM music ORDER BY sort ASC, created_at ASC  （music.js:167）
--    music 表此前无任何索引 —— 每次打开站点都会全表扫描 + 排序。
CREATE INDEX IF NOT EXISTS idx_music_sort ON music(sort, created_at);

-- 4) 媒体库列表：按创建时间倒序，id 兜底保证稳定排序
--    查询：SELECT * FROM media ORDER BY created_at DESC, id DESC  （api-core.js:1102）
--    已有 idx_media_created 仅含 created_at；补 (created_at, id) 让排序完全走索引。
CREATE INDEX IF NOT EXISTS idx_media_created_id ON media(created_at, id);

-- 5) 管理员会话清理：每次成功登录都会清理过期 token
--    查询：DELETE FROM admin_sessions WHERE exp <= ?    （api-core.js 登录成功后）
--    admin_sessions 行数少，但清理是热路径，补索引代价极低。
CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp ON admin_sessions(exp);
