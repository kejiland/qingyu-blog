-- 媒体缩略图：浏览器端压缩上传时同时生成 WebP 缩略图
ALTER TABLE media ADD COLUMN thumb_url TEXT DEFAULT '';
