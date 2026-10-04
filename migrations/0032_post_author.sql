-- 文章作者（可留空，前台回退到站点署名 / 个人昵称）
ALTER TABLE posts ADD COLUMN author TEXT DEFAULT '';
