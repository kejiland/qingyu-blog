-- 邮件发件箱：区分文章订阅通知与站长评论通知
ALTER TABLE mail_outbox ADD COLUMN kind TEXT DEFAULT 'post';
ALTER TABLE mail_outbox ADD COLUMN payload TEXT DEFAULT '';