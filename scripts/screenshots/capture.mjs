/* ============================================================
 * README 截图生成器（仅开发工具，不参与站点运行）
 * ------------------------------------------------------------
 * 用无头 Chrome 打开「本地演示服务器」（demo-server.mjs，内置示例文章 /
 * 评论 / 音乐 / 媒体数据），把当前 public/ 代码真实渲染出的界面截图到
 * screenshots/ 目录。
 *
 * 前置条件：
 *   1. 本机已安装 Chrome 或 Edge（或用 CHROME_PATH 指定可执行文件）
 *   2. 安装 puppeteer-core（开发依赖，本仓库运行时不依赖它）：
 *        npm i -D puppeteer-core        # 或在任意目录安装后设置 NODE_PATH
 *
 * 用法：
 *   node scripts/screenshots/capture.mjs                 # 生成全部截图
 *   node scripts/screenshots/capture.mjs --only home,admin
 *   node scripts/screenshots/capture.mjs --out screenshots --scale 1
 *   CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" \
 *     node scripts/screenshots/capture.mjs
 *
 * 说明：截图里的文案与数据来自 demo-content.mjs 的示例内容，
 *       与线上站点数据无关；界面本身是 public/ 的真实代码。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createDemoServer } from './demo-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i > -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
const OUT_DIR = path.resolve(ROOT, argOf('out', 'screenshots'));
const ONLY = argOf('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const SCALE = Number(argOf('scale', '1')) || 1;
const PORT = Number(argOf('port', '8791'));

/* ---------- puppeteer-core 解析（允许装在仓库外，用 NODE_PATH 指过来） ---------- */
function loadPuppeteer() {
  const require = createRequire(import.meta.url);
  const candidates = ['puppeteer-core', 'puppeteer'];
  for (const c of candidates) {
    try { return require(c); } catch (e) { /* 继续尝试 */ }
  }
  console.error([
    '找不到 puppeteer-core。截图工具是可选的开发依赖，请先安装：',
    '  npm i -D puppeteer-core',
    '或在任意目录安装后用 NODE_PATH 指过来：',
    '  set NODE_PATH=C:\\path\\to\\node_modules && node scripts/screenshots/capture.mjs'
  ].join('\n'));
  process.exit(1);
}

function resolveChrome() {
  const env = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && fs.existsSync(env)) return env;
  const list = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/microsoft-edge'
  ];
  for (const p of list) { if (p && fs.existsSync(p)) return p; }
  return undefined; // 交给 puppeteer 自行查找（安装了完整 puppeteer 时可用）
}

/* ---------- 视口预设 ---------- */
const VP = {
  desktop: { width: 1600, height: 1000 },
  wide: { width: 1440, height: 900 },
  reading: { width: 1100, height: 950 },
  mobile: { width: 390, height: 844 }
};

/* ---------- 截图清单 ---------- */
/* theme: light | dark；admin: 是否注入登录态；action: 交互函数名 */
const SHOTS = [
  /* 前台 · 首页 */
  { file: 'home.png', path: '/', theme: 'light', vp: 'desktop', wait: '.post-card' },

  /* 前台 · 文章详情 */
  { file: 'detail.png', path: '/posts/qingyu-blog-guide/', theme: 'light', vp: 'desktop', wait: '.post-body' },

  /* 前台 · 归档 / 标签 / 留言板 */
  { file: 'archive.png', path: '/archive', theme: 'light', vp: 'wide', wait: '.archive-year, .archive-list, .post-card' },
  { file: 'tags.png', path: '/tags', theme: 'light', vp: 'wide', wait: '.tag-cloud, .tag-item, .tag-card' },
  { file: 'guestbook.png', path: '/guestbook', theme: 'light', vp: 'wide', wait: '#gbTabs' },

  /* 前台 · 搜索 */
  { file: 'search.png', path: '/', theme: 'light', vp: 'desktop', wait: '.post-card', action: 'search' },

  /* 前台 · 深色主题 */
  { file: 'home-dark.png', path: '/', theme: 'dark', vp: 'desktop', wait: '.post-card' },
  { file: 'detail-dark.png', path: '/posts/serif-typography/', theme: 'dark', vp: 'desktop', wait: '.post-body' },

  /* 前台 · 移动端 */
  { file: 'mobile.png', path: '/', theme: 'light', vp: 'mobile', wait: '.post-card' },

  /* 前台 · 音乐播放器（点击悬浮按钮展开面板） */
  { file: 'music-player.png', path: '/', theme: 'light', vp: 'desktop', wait: '#mpFab', action: 'player' },

  /* 后台 */
  { file: 'write.png', path: '/admin/posts/new', theme: 'light', vp: 'desktop', admin: true, wait: '#abBody', action: 'editor' },
  { file: 'admin.png', path: '/admin', theme: 'light', vp: 'desktop', admin: true, wait: '#abStats, .ab-grid' },
  { file: 'admin-posts.png', path: '/admin/posts', theme: 'light', vp: 'desktop', admin: true, wait: '#abPostBody tr' },
  { file: 'admin-list.png', path: '/admin/comments', theme: 'light', vp: 'desktop', admin: true, wait: '#abCmtBody tr' },
  { file: 'admin-media.png', path: '/admin/media', theme: 'light', vp: 'desktop', admin: true, wait: '#abMediaGrid > *' },
  { file: 'music-admin.png', path: '/admin/music', theme: 'light', vp: 'desktop', admin: true, wait: '.ab-music-list tbody tr' },
  { file: 'admin-settings.png', path: '/admin/settings', theme: 'light', vp: 'desktop', admin: true, wait: '#abSiteName' },
  { file: 'admin-tags.png', path: '/admin/tags', theme: 'light', vp: 'wide', admin: true, wait: '#abTagBody tr' },
  { file: 'admin-dark.png', path: '/admin', theme: 'dark', vp: 'desktop', admin: true, wait: '#abStats, .ab-grid' },

  /* 后台 · 登录 / 首次部署门禁（未登录状态） */
  { file: 'admin-gate.png', path: '/admin', theme: 'light', vp: 'wide', admin: false, wait: '#abGatePwd' },

  /* 衬线字体预览（窄版阅读栏，突出排版） */
  { file: 'font-preview/home-light.png', path: '/', theme: 'light', vp: 'reading', wait: '.post-card' },
  { file: 'font-preview/article-light.png', path: '/posts/markdown-writing/', theme: 'light', vp: 'reading', wait: '.post-body' },
  { file: 'font-preview/article-dark.png', path: '/posts/markdown-writing/', theme: 'dark', vp: 'reading', wait: '.post-body' }
];

/* ---------- 交互：站内搜索 ---------- */
async function actionSearch(page) {
  await page.click('#searchToggle');
  await page.waitForSelector('#globalSearchInput', { visible: true });
  await page.type('#globalSearchInput', 'Cloudflare', { delay: 40 });
  await page.waitForSelector('.search-hit', { timeout: 8000 }).catch(() => {});
  await sleep(500);
}

/* ---------- 交互：编辑器填示例内容（让实时预览可见） ---------- */
async function actionEditor(page) {
  const title = '书卷风排版：把宋体用出秩序感';
  const tags = '设计, 字体, 排版';
  const body = [
    '中文长文的第一需求是**耐读**，不是「好看」。而耐读几乎完全由四个变量决定。',
    '',
    '## 字号与行高',
    '',
    '正文 17 ~ 18px、行高 1.75 ~ 1.9 是比较安全的区间。字号越小，行高要越大。',
    '',
    '> 排版是减法：先删掉所有不必要的装饰，剩下的才需要精雕。',
    '',
    '## 一段代码',
    '',
    '```js',
    "const cfg = { mode: 'auto', pageSize: 5 };",
    '```',
    '',
    '- [x] 正文走系统宋体',
    '- [x] 引用装饰走系统仿宋',
    '- [ ] 归档页加年份分组'
  ].join('\n');
  await page.click('#abTitle');
  await page.type('#abTitle', title, { delay: 12 });
  await page.click('#abTags');
  await page.type('#abTags', tags, { delay: 12 });
  await page.click('#abBody');
  await page.type('#abBody', body, { delay: 2 });
  await page.evaluate(() => {
    const t = document.getElementById('abBody');
    if (t) t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const p = document.getElementById('abPreviewPane');
    return p && p.querySelector('h2, pre, blockquote');
  }, { timeout: 8000 }).catch(() => {});
  await sleep(600);
}

/* ---------- 交互：展开音乐播放器 ---------- */async function actionPlayer(page) {
  await page.hover('#mpFabWrap').catch(() => {});
  await page.click('#mpFab');
  await page.waitForFunction(() => {
    const p = document.getElementById('mpPanel');
    return p && p.getAttribute('aria-hidden') === 'false';
  }, { timeout: 8000 }).catch(() => {});
  // 先单击曲目让面板显示曲目信息（脚本点击后需重开面板：见下方说明），
  // 再确保面板处于展开状态——脚本触发的 play() 被浏览器自动播放策略拒绝时
  // 播放器会重置 UI 并收起面板，所以这里最后再点一次悬浮按钮兜底。
  await page.evaluate(() => {
    const first = document.querySelector('#mpList .mp-item');
    if (first) first.click();
  }).catch(() => {});
  await sleep(600);
  await page.evaluate(() => {
    const panel = document.getElementById('mpPanel');
    const fab = document.getElementById('mpFab');
    if (panel && !panel.classList.contains('open') && fab) fab.click();
  }).catch(() => {});
  await page.waitForFunction(() => {
    const p = document.getElementById('mpPanel');
    return p && p.classList.contains('open');
  }, { timeout: 5000 }).catch(() => {});
  await sleep(700);
}

const ACTIONS = { search: actionSearch, player: actionPlayer, editor: actionEditor };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 主流程 ---------- */
async function main() {
  const puppeteer = loadPuppeteer();
  const executablePath = resolveChrome();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'font-preview'), { recursive: true });

  const server = createDemoServer();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + PORT;
  console.log('演示服务器：' + base);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none',
      '--force-color-profile=srgb', '--disable-lcd-text']
  });

  const shots = ONLY.length ? SHOTS.filter((s) => ONLY.includes(s.file.replace(/^font-preview\//, '').replace(/\.png$/, ''))) : SHOTS;
  const results = [];

  for (const shot of shots) {
    const target = path.join(OUT_DIR, shot.file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const vp = VP[shot.vp] || VP.desktop;
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: SCALE * (shot.vp === 'mobile' ? 2 : 1) });
      // 注入主题 / 登录态（在页面脚本执行前写入 localStorage）
      const prefs = {
        theme: shot.theme || 'light',
        admin: !!shot.admin,
        accent: 'terra'
      };
      await page.evaluateOnNewDocument((p) => {
        try {
          localStorage.setItem('qingyu.theme', p.theme);
          localStorage.setItem('qingyu.accent', p.accent);
          localStorage.setItem('blog.locale', 'zh-CN');
          if (p.admin) {
            localStorage.setItem('qingyu.admin.ok', '1');
            localStorage.setItem('qingyu.token', 'demo-session-token');
            localStorage.setItem('qingyu.admin.profile', JSON.stringify({
              name: 'Qingyu', bio: '写点代码，也写点字。', avatar: '/demo/profile.svg', email: 'admin@example.com'
            }));
          } else {
            localStorage.removeItem('qingyu.admin.ok');
            localStorage.removeItem('qingyu.token');
          }
        } catch (e) {}
      }, prefs);

      const res = await page.goto(base + shot.path, { waitUntil: 'networkidle2', timeout: 60000 });
      if (res && res.status() >= 400) console.warn('  ! HTTP ' + res.status() + ' ' + shot.path);

      if (shot.wait) {
        await page.waitForSelector(shot.wait, { timeout: 15000 })
          .catch(() => console.warn('  ! 等待选择器超时：' + shot.wait + '（' + shot.path + '）'));
      }
      await sleep(700);
      if (shot.action && ACTIONS[shot.action]) await ACTIONS[shot.action](page);
      await sleep(400);

      await page.screenshot({ path: target, type: 'png' });
      const size = fs.statSync(target).size;
      results.push({ file: shot.file, ok: true, size });
      console.log('  ✓ ' + shot.file + '  (' + Math.round(size / 1024) + ' KB)');
    } catch (e) {
      results.push({ file: shot.file, ok: false, error: String(e && e.message) });
      console.error('  ✗ ' + shot.file + '  ' + (e && e.message));
    } finally {
      await page.close();
    }
  }

  await browser.close();
  await new Promise((r) => server.close(r));

  const bad = results.filter((r) => !r.ok);
  console.log('\n完成：' + (results.length - bad.length) + '/' + results.length + ' 张 → ' + OUT_DIR);
  if (bad.length) {
    console.log('失败：' + bad.map((b) => b.file).join(', '));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
