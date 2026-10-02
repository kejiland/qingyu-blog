-- 自动分享图（OG Image）：R2 公开地址
ALTER TABLE posts ADD COLUMN og_image TEXT DEFAULT '';
ALTER TABLE post_revisions ADD COLUMN og_image TEXT DEFAULT '';
