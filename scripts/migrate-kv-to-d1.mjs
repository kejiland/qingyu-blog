#!/usr/bin/env node
/* ============================================================
 * 轻语博客 · 一次性迁移：KV 数据 → D1
 * ------------------------------------------------------------
 * 适用场景：从「KV 单 key 存储」升级到「D1 主存储」后，把线上已有数据搬过去。
 * 原理：直接读取 Cloudflare KV 命名空间（REST API），生成 INSERT SQL 并写入 D1。
 *
 * 前置条件：
 *   · 已按 README 创建名为 blog 的 D1 数据库，并拿到其 database_id（= Secret BLOG_D1_ID）
 *   · 已部署（或准备部署）D1 版后端，且已执行 migrations/0001_init.sql 建表
 *   · 环境变量：
 *       CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_API_TOKEN（需 KV 读取 + D1 写入权限）
 *       BLOG_KV_ID（原 KV 命名空间 id）
 *       BLOG_D1_ID（D1 database_id，仅用于提示校验）
 *
 * 用法：
 *   node scripts/migrate-kv-to-d1.mjs
 *   node scripts/migrate-kv-to-d1.mjs --dry-run        # 只打印 SQL，不写入 D1
 *
 * 幂等：全部使用 INSERT OR REPLACE，可重复执行。
 * ============================================================ */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const KV_ID = process.env.BLOG_KV_ID;
const D1_ID = process.env.BLOG_D1_ID;
const DRY_RUN = process.argv.includes('--dry-run');

if (!ACCOUNT || !TOKEN || !KV_ID) {
  console.error('缺少环境变量：需要 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / BLOG_KV_ID');
  process.exit(1);
}
if (!DRY_RUN && !D1_ID) {
  console.error('缺少环境变量 BLOG_D1_ID（用于确认目标 D1 数据库）；非 dry-run 必须提供');
  process.exit(1);
}

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces/${KV_ID}/values`;

async function kvGet(key) {
  const res = await fetch(`${KV_BASE}/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`KV 读取 ${key} 失败：${res.status} ${await res.text()}`);
  }
  return res.text();
}

// SQL 字符串转义（单引号翻倍即可）
// 注意：SQLite 不识别反斜杠转义（与 MySQL 不同）。此前把换行替换成字面量 \n、
// 把反斜杠翻倍，会让多行正文与评论在库里存成 "\n" 两个字符而非真实换行，导致
// 迁移后文章排版全部串行。SQLite 字符串字面量本身允许跨行，直接原样保留即可。
function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}
function sqlInt(v) {
  const n = Number(v) || 0;
  return String(n);
}

async function main() {
  console.log('▶ 读取 KV: posts:v1 ...');
  const raw = await kvGet('posts:v1');
  const posts = raw ? JSON.parse(raw) : [];
  console.log(`  文章 ${posts.length} 篇`);

  const lines = [];
  for (const p of posts) {
    const protectedPost = !!p.protected && p.enc && typeof p.enc === 'object';
    const tags = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(/[,，]/);
    const tagsJson = JSON.stringify(tags.filter(Boolean));
    const encJson = protectedPost ? JSON.stringify(p.enc) : null;
    lines.push(
      `INSERT OR REPLACE INTO posts (id,title,date,excerpt,content,pinned,protected,enc,tags) VALUES (`
      + `${sqlStr(p.id)},${sqlStr(p.title)},${sqlStr(p.date)},${sqlStr(p.excerpt)},`
      + `${sqlStr(protectedPost ? '' : (p.content || ''))},${p.pinned ? 1 : 0},${protectedPost ? 1 : 0},`
      + `${sqlStr(encJson)},${sqlStr(tagsJson)});`
    );
  }

  console.log('▶ 读取 KV: 评论 / 统计 ...');
  for (const p of posts) {
    const cid = p.id;
    const [cRaw, sRaw] = await Promise.all([kvGet('comments:' + cid), kvGet('stats:' + cid)]);
    const comments = cRaw ? JSON.parse(cRaw) : [];
    const stats = sRaw ? JSON.parse(sRaw) : null;
    for (const c of comments) {
      lines.push(
        `INSERT OR REPLACE INTO comments (id,post_id,author,content,date) VALUES (`
        + `${sqlStr(c.id)},${sqlStr(cid)},${sqlStr(c.author)},${sqlStr(c.content)},${sqlStr(c.date)});`
      );
    }
    if (stats) {
      lines.push(
        `INSERT OR REPLACE INTO stats (post_id,likes,views) VALUES (${sqlStr(cid)},${sqlInt(stats.likes)},${sqlInt(stats.views)});`
      );
    }
  }

  console.log('▶ 读取 KV: 管理员认证 ...');
  const authRaw = await kvGet('admin:auth');
  if (authRaw) {
    const a = JSON.parse(authRaw);
    lines.push(
      `INSERT OR REPLACE INTO admin_auth (k,salt,hash,iter) VALUES ('auth',${sqlStr(a.salt)},${sqlStr(a.hash)},${sqlInt(a.iter || 100000)});`
    );
  }

  const sql = lines.join('\n');
  if (DRY_RUN) {
    console.log('── dry-run：生成的 SQL 如下 ──');
    console.log(sql);
    return;
  }

  // 写入临时 SQL 文件并通过 wrangler 执行到远程 D1。
  // 注意：① Windows 下 spawn 必须用 npx.cmd；② 在临时目录里执行，
  // 避免加载项目内含 {env.*} 占位符的 wrangler 配置导致报错。认证走环境变量。
  const dir = mkdtempSync(join(tmpdir(), 'qy-migrate-'));
  const file = join(dir, 'migrate.sql');
  writeFileSync(file, sql, 'utf8');
  console.log('▶ 写入 D1（blog）...');
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(npxCmd,
    ['--yes', 'wrangler@3.90.0', 'd1', 'execute', 'blog', '--remote', '--file=' + file],
    { stdio: 'inherit', cwd: dir });
  console.log('✅ 迁移完成：' + posts.length + ' 篇文章及其评论/统计' + (authRaw ? ' + 管理员认证' : ''));
}

main().catch((e) => {
  console.error('迁移失败：', e && e.message);
  process.exit(1);
});
