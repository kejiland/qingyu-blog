-- 订阅者分组：单列存 JSON 数组字符串（例如 ["newsletter","vip"]），用于后台分组筛选与群发
-- SQLite 无 ADD COLUMN IF NOT EXISTS；deploy.yml 对 duplicate column 已有兜底记账。
ALTER TABLE subscribers ADD COLUMN groups TEXT DEFAULT '[]';
