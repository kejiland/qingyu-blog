-- 文章级 SEO 覆盖（JSON：{title,desc,canonical,noindex}），空对象表示沿用自动生成
ALTER TABLE posts ADD COLUMN seo TEXT DEFAULT '';
