/* ============================================================
 * 截图演示数据（仅用于 scripts/screenshots/ 本地演示服务器）
 * ------------------------------------------------------------
 * 这里的内容**不进入站点产物**：只在本地起一个 mock API + 静态服务，
 * 供 capture.mjs 用无头浏览器生成 README 用的项目截图。
 * 全部为示例文案，可自由修改后重新生成截图。
 * ============================================================ */

/** 用数组拼 Markdown，避免模板字符串里的反引号转义地狱 */
const md = (...lines) => lines.join('\n');

/* ---------- 演示配图：内联 SVG（无外部依赖，离线可用） ---------- */
function cover(id, title, subtitle, c1, c2, c3) {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">',
    '<defs>',
    `<linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>`,
    '</linearGradient>',
    '</defs>',
    `<rect width="800" height="450" fill="url(#g${id})"/>`,
    `<circle cx="640" cy="120" r="180" fill="${c3}" opacity="0.18"/>`,
    `<circle cx="120" cy="380" r="140" fill="${c3}" opacity="0.12"/>`,
    '<g fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1">',
    '<path d="M-20 300 C 160 240, 320 360, 500 280 S 760 200, 840 250"/>',
    '<path d="M-20 340 C 160 280, 320 400, 500 320 S 760 240, 840 290"/>',
    '</g>',
    '<text x="64" y="214" font-family="Georgia, Songti SC, serif" font-size="46" fill="#ffffff" fill-opacity="0.96">'
      + title + '</text>',
    '<text x="66" y="258" font-family="Georgia, Songti SC, serif" font-size="20" fill="#ffffff" fill-opacity="0.72">'
      + subtitle + '</text>',
    '<rect x="64" y="290" width="56" height="3" rx="1.5" fill="#ffffff" fill-opacity="0.6"/>',
    '</svg>'
  ].join('');
  return svg;
}

function logoMark(size, bg1, bg2, glyph) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}">`,
    '<defs>',
    `<linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>`,
    '</defs>',
    '<rect width="256" height="256" rx="60" fill="url(#lg)"/>',
    `<text x="128" y="172" text-anchor="middle" font-family="Georgia, Songti SC, serif" font-size="130" fill="#ffffff" fill-opacity="0.95">${glyph}</text>`,
    '</svg>'
  ].join('');
}

/** 演示图片资源表：路径 → SVG 字符串 */
export const IMAGES = {
  '/demo/cover-1.svg': cover(1, '从零到上线', 'Cloudflare Workers + D1', '#2b4a6f', '#5b87ad', '#dfe9f2'),
  '/demo/cover-2.svg': cover(2, 'Workers + D1', '边缘计算部署实录', '#c25e3a', '#e08a63', '#fdeee6'),
  '/demo/cover-3.svg': cover(3, 'Markdown 写作', '排版即内容', '#3f6f61', '#7fb3a1', '#e6f2ee'),
  '/demo/cover-4.svg': cover(4, '音乐播放器', '不打扰人的设计', '#6a2a63', '#ad6598', '#f6e9f3'),
  '/demo/cover-5.svg': cover(5, '书卷风排版', '宋体与仿宋的秩序', '#7a5c3e', '#b79b78', '#f7f1e8'),
  '/demo/cover-6.svg': cover(6, '随笔', '碎片与片刻', '#40506b', '#8494b3', '#e9edf5'),
  '/demo/avatar.svg': logoMark('', '#c25e3a', '#e08a63', 'Q'),
  '/demo/profile.svg': logoMark('', '#2b4a6f', '#5b87ad', '语')
};
// logoMark 忽略 size 参数（SVG 由 CSS 控制尺寸），这里补一个默认值占位
IMAGES['/demo/avatar.svg'] = logoMark(256, '#c25e3a', '#e08a63', 'Q');
IMAGES['/demo/profile.svg'] = logoMark(256, '#2b4a6f', '#5b87ad', '语');

/* ---------- 文章 ---------- */
export const POSTS = [
  {
    id: 'qingyu-blog-guide',
    title: "Qingyu'Blog 使用指南：从零到上线",
    date: '2026-09-24',
    excerpt: '一份写给第一次接触这个博客的完整说明：两种运行模式怎么选、文章怎么写、评论与统计在哪里看，以及上线到 Cloudflare 需要做哪几件事。',
    cover: '/demo/cover-1.svg',
    pinned: true,
    category: '指南',
    status: 'published',
    tags: ['教程', 'Cloudflare'],
    content: md(
      "Qingyu'Blog 是一个**纯原生 JavaScript** 的个人博客系统：没有框架、没有构建步骤、没有运行时依赖。你可以双击 `public/index.html` 立刻开始写作，也可以把它部署到 Cloudflare Workers，让数据存在云端。",
      '',
      '## 两种运行模式',
      '',
      '| 模式 | 数据存哪里 | 适合谁 |',
      '| --- | --- | --- |',
      '| 静态模式 | 浏览器 localStorage | 本地写作、临时预览 |',
      '| 云端模式 | Cloudflare D1 | 正式发布、多人访问 |',
      '',
      '`config.js` 里的 `mode: \'auto\'` 会自己判断：请求 `/api/posts` 成功就走云端，失败就回退静态，**不需要你改代码**。',
      '',
      '## 写第一篇文章',
      '',
      '1. 打开 `/admin`，第一次进入会要求设置管理密码；',
      '2. 点「写新文章」，标题、标签、封面、正文依次填好；',
      '3. 左侧写 Markdown，右侧实时预览，写完点「发布」。',
      '',
      '> 小提示：编辑器支持 `**加粗**`、`*斜体*`、引用、列表、表格、代码块和任务清单，工具栏按钮可以一键插入。',
      '',
      '### 一段代码',
      '',
      '```js',
      '// 导出静态站点的文章数据',
      'window.BLOG_POSTS = [',
      '  { id: \'hello\', title: \'你好，世界\', tags: [\'随笔\'] }',
      '];',
      '```',
      '',
      '### 一个任务清单',
      '',
      '- [x] 设置管理密码',
      '- [x] 写第一篇草稿',
      '- [ ] 绑定自己的域名',
      '- [ ] 配好 R2 桶，打开图片与音乐上传',
      '',
      '## 上线到 Cloudflare',
      '',
      '只需要四件事：创建 D1 数据库、创建 KV 命名空间、把这些 ID 填进 GitHub Secrets、推送到 `main` 分支。剩下的交给 GitHub Actions —— 它会跑测试、执行数据库迁移、部署 Worker、写入运行时密钥。',
      '',
      '更细的每一步（每一项配置在控制台的哪个位置、填什么值）见文末的部署长文。',
      '',
      '---',
      '',
      '祝你写得开心。'
    )
  },
  {
    id: 'workers-d1-deploy',
    title: '把博客放到 Cloudflare 边缘：Workers + D1 部署实录',
    date: '2026-09-18',
    excerpt: '从 wrangler login 到 GitHub Actions 自动部署，记录一次完整的边缘部署过程，以及踩过的三个坑：KV id 占位符、D1 迁移幂等、边缘缓存清理。',
    cover: '/demo/cover-2.svg',
    pinned: false,
    category: '部署',
    status: 'published',
    tags: ['Cloudflare', '部署'],
    content: md(
      '把后端放到 Cloudflare 的最大好处不是「快」，而是**没有服务器要维护**。整个后端是 `worker.js` 加一组 `functions/` 函数，数据放在 D1（边缘 SQLite），文件放在 R2。',
      '',
      '## 关键配置',
      '',
      '```toml',
      'name = "kejiland"',
      'main = "worker.js"',
      '',
      '[assets]',
      'directory = "./public"',
      'binding = "ASSETS"',
      'not_found_handling = "single-page-application"',
      '',
      '[[d1_databases]]',
      'binding = "DB"',
      'database_name = "blog"',
      'database_id = "{env.BLOG_D1_ID}"',
      '```',
      '',
      '## 三个坑',
      '',
      '### 1. KV 的 id 不吃环境变量内插',
      '',
      'Wrangler 对 D1 支持 `{env.X}` 内插，但 KV 的 `id` 不支持，必须在部署前用脚本显式替换，否则会部署出空绑定。',
      '',
      '### 2. D1 迁移必须幂等',
      '',
      'SQLite 没有 `ADD COLUMN IF NOT EXISTS`，所以迁移脚本要配合一张 `schema_migrations` 记账表：跑过的跳过，加过的列记账跳过。',
      '',
      '### 3. 发布之后要清缓存',
      '',
      '静态资源带了 `?v=` 版本号可以长缓存，但 HTML 入口和 API 需要发布即失效。配置 `CF_ZONE_ID` 与一个有 Cache Purge 权限的 Token，发布后自动清边缘缓存。',
      '',
      '> 这三件事现在都已经写进 `.github/workflows/deploy.yml`，你只要推代码就行。'
    )
  },
  {
    id: 'markdown-writing',
    title: '用 Markdown 写一篇排版好看的文章',
    date: '2026-09-12',
    excerpt: '标题层级、引用、表格、代码块、图片与任务清单——把这些基础语法用对，一篇文章的观感就已经赢了八成。',
    cover: '/demo/cover-3.svg',
    pinned: false,
    category: '写作',
    status: 'published',
    tags: ['写作', 'Markdown'],
    content: md(
      '好的排版不是装饰，而是**让人读下去**的基础设施。',
      '',
      '## 层级要克制',
      '',
      '一篇文章里 `##` 出现 3 ~ 6 次通常最舒服，`###` 用来切分细节。不要用加粗代替标题。',
      '',
      '## 引用用来强调观点',
      '',
      '> 排版的第一原则是节奏：长句之后给一个短句，密集的段落之后给一段留白。',
      '',
      '## 表格用来对比',
      '',
      '| 语法 | 用途 | 什么时候别用 |',
      '| --- | --- | --- |',
      '| 表格 | 并列对比 | 超过 4 列 |',
      '| 列表 | 步骤、清单 | 需要解释因果时 |',
      '| 代码块 | 命令与示例 | 行内短词用反引号 |',
      '',
      '## 行内元素',
      '',
      '链接写作 [Cloudflare Docs](https://developers.cloudflare.com/)，行内代码写作 `npm run build`，删除线写作 ~~不要这样~~。',
      '',
      '![配图](/demo/cover-3.svg)',
      '',
      '最后：写完通读一遍，把能删的形容词都删掉。'
    )
  },
  {
    id: 'music-player-design',
    title: '给博客加一个不打扰人的音乐播放器',
    date: '2026-09-06',
    excerpt: '它平时缩在窗口外，只露出一点圆弧；你悬停或点击它才滑出来。这个设计背后是三个取舍：可见性、打扰度与加载时机。',
    cover: '/demo/cover-4.svg',
    pinned: false,
    category: '设计',
    status: 'published',
    tags: ['前端', '音乐'],
    content: md(
      '博客放音乐很容易变成「劝退设计」：自动播放、找不到关闭按钮、每次切页都重新开始。所以这个播放器只做三件事。',
      '',
      '## 一、默认不存在',
      '',
      '没有音乐时，播放器**完全不渲染**；后台路由下自动收起。平时它缩在窗口外，只露出一点圆弧。',
      '',
      '## 二、不打断阅读',
      '',
      '刷新页面后会恢复上次的曲目与进度，但**不会自动出声** —— 浏览器也不允许。音量单独持久化。',
      '',
      '## 三、按需加载',
      '',
      '播放器的样式与脚本都不在首屏关键路径上，浏览器空闲时才拉取：',
      '',
      '```js',
      'idle(function () {',
      '  loadCss(\'music-player.min.css\');',
      '  loadJs(\'music-player.min.js\');',
      '});',
      '```',
      '',
      '> 结论：能用「不出现」解决的问题，不要用「关掉」。'
    )
  },
  {
    id: 'serif-typography',
    title: '书卷风排版：把宋体用出秩序感',
    date: '2026-08-30',
    excerpt: '不加载任何 webfont，只用系统自带的宋体与仿宋，也能做出耐读的中文长文排版。这篇讲四个变量：字号、行高、字距与留白。',
    cover: '/demo/cover-5.svg',
    pinned: false,
    category: '设计',
    status: 'published',
    tags: ['设计', '字体'],
    content: md(
      '中文长文的第一需求是**耐读**，不是「好看」。而耐读几乎完全由四个变量决定。',
      '',
      '## 字号与行高',
      '',
      '正文 17 ~ 18px、行高 1.75 ~ 1.9 是比较安全的区间。字号越小，行高要越大。',
      '',
      '## 字距',
      '',
      '标题加 `0.02em` 会显得更从容；正文不要加，加了反而松散。',
      '',
      '## 留白',
      '',
      '段间距 ≈ 0.8 倍行高；标题上方留白要是下方的 1.5 倍，这样标题才会「咬住」它下面的内容。',
      '',
      '## 为什么不用 webfont',
      '',
      '一个完整的中文字体动辄 3 ~ 10MB，首屏加载代价太高。系统宋体 + 仿宋的组合在中文环境下几乎处处可用，**零下载**。',
      '',
      '> 排版是减法：先删掉所有不必要的装饰，剩下的才需要精雕。'
    )
  },
  {
    id: 'next-plan',
    title: '（草稿）下一步想做的事',
    date: '2026-09-25',
    excerpt: '待办清单：图片自动压缩、文章之间的双向链接、离线可写。',
    cover: '/demo/cover-6.svg',
    pinned: false,
    category: '随笔',
    status: 'draft',
    tags: ['随笔'],
    content: md(
      '记一下还没做的事，免得忘记。',
      '',
      '- [ ] 上传图片时自动压缩',
      '- [ ] 文章之间支持双向链接',
      '- [ ] 断网也能继续写',
      '- [ ] 给归档页加年份分组'
    )
  }
];

/* ---------- 评论 ---------- */
export const COMMENTS = [
  {
    id: 'c-1001', post_id: 'qingyu-blog-guide', post_title: "Qingyu'Blog 使用指南：从零到上线",
    author: '林间有风', content: '跟着指南一步步做下来了，第一次部署 Cloudflare 居然没踩坑。D1 的迁移自动执行这点太省心了。',
    date: '2026-09-24 21:12', status: 'approved', parent_id: null
  },
  {
    id: 'c-1002', post_id: 'qingyu-blog-guide', post_title: "Qingyu'Blog 使用指南：从零到上线",
    author: 'Qingyu', content: '谢谢反馈！迁移那块的主要坑是 SQLite 没有 ADD COLUMN IF NOT EXISTS，所以加了一层记账表。',
    date: '2026-09-24 21:40', status: 'approved', parent_id: 'c-1001'
  },
  {
    id: 'c-1003', post_id: 'workers-d1-deploy', post_title: '把博客放到 Cloudflare 边缘：Workers + D1 部署实录',
    author: '阿澈', content: 'KV 的 id 不内插这个坑我也踩过，当时排查了一晚上……建议写进 README 最显眼的地方。',
    date: '2026-09-19 09:05', status: 'approved', parent_id: null
  },
  {
    id: 'c-1004', post_id: 'workers-d1-deploy', post_title: '把博客放到 Cloudflare 边缘：Workers + D1 部署实录',
    author: '南桥', content: '想问下 R2 的自定义域名必须备案吗？',
    date: '2026-09-20 14:22', status: 'approved', parent_id: null
  },
  {
    id: 'c-1005', post_id: 'workers-d1-deploy', post_title: '把博客放到 Cloudflare 边缘：Workers + D1 部署实录',
    author: 'Qingyu', content: '如果域名在国内厂商注册并且走国内访问，建议按当地要求处理；纯海外访问一般不涉及。',
    date: '2026-09-20 18:47', status: 'approved', parent_id: 'c-1004'
  },
  {
    id: 'c-1006', post_id: 'music-player-design', post_title: '给博客加一个不打扰人的音乐播放器',
    author: '木子', content: '「能用不出现解决的问题，不要用关掉」——这句话说得真好。',
    date: '2026-09-07 11:30', status: 'approved', parent_id: null
  },
  {
    id: 'c-1007', post_id: 'serif-typography', post_title: '书卷风排版：把宋体用出秩序感',
    author: '匿名访客', content: '加了微信，代刷浏览量点赞，需要的联系 xxx，价格便宜！',
    date: '2026-09-23 03:14', status: 'pending', parent_id: null
  },
  {
    id: 'c-1008', post_id: 'markdown-writing', post_title: '用 Markdown 写一篇排版好看的文章',
    author: '小满', content: '表格那段很有用，我之前一直用列表硬凑对比，读起来很累。',
    date: '2026-09-13 20:08', status: 'pending', parent_id: null
  },
  {
    id: 'c-1009', post_id: 'qingyu-blog-guide', post_title: "Qingyu'Blog 使用指南：从零到上线",
    author: 'Echo', content: '留言板也能用同样的评论系统吗？看着是同一套前端组件。',
    date: '2026-09-24 22:55', status: 'approved', parent_id: null
  },
  /* 留言板（合成 post_id：gb-note = 留言，gb-idea = 项目优化方案） */
  {
    id: 'c-2001', post_id: 'gb-note', post_title: '留言板',
    author: '路过的人', content: '第一次来，排版很舒服，音乐也很好听。已经加进书签了。',
    date: '2026-09-22 10:18', status: 'approved', parent_id: null
  },
  {
    id: 'c-2002', post_id: 'gb-note', post_title: '留言板',
    author: '小林', content: '想问下文章里的图片是自己压缩过再上传的吗？加载很快。',
    date: '2026-09-23 19:40', status: 'approved', parent_id: null
  },
  {
    id: 'c-2003', post_id: 'gb-idea', post_title: '项目优化方案',
    author: '阿澈', content: '建议归档页按年份折叠一下，文章多了之后翻起来有点长。',
    date: '2026-09-21 15:02', status: 'approved', parent_id: null
  }
];

/* ---------- 媒体资源库 ---------- */
export const MEDIA = [
  { id: 'm-0001', name: 'cover-from-zero.svg', url: '/demo/cover-1.svg', type: 'image/svg+xml', size: 4096, created_at: '2026-09-24' },
  { id: 'm-0002', name: 'cover-workers-d1.svg', url: '/demo/cover-2.svg', type: 'image/svg+xml', size: 4096, created_at: '2026-09-18' },
  { id: 'm-0003', name: 'cover-markdown.svg', url: '/demo/cover-3.svg', type: 'image/svg+xml', size: 4096, created_at: '2026-09-12' },
  { id: 'm-0004', name: 'cover-music-player.svg', url: '/demo/cover-4.svg', type: 'image/svg+xml', size: 4096, created_at: '2026-09-06' },
  { id: 'm-0005', name: 'cover-serif.svg', url: '/demo/cover-5.svg', type: 'image/svg+xml', size: 4096, created_at: '2026-08-30' },
  { id: 'm-0006', name: 'site-avatar.svg', url: '/demo/avatar.svg', type: 'image/svg+xml', size: 2048, created_at: '2026-08-28' }
];

/* ---------- 音乐 ---------- */
export const MUSIC = [
  { id: 'mu-1', title: '山月不知心底事', artist: '青雨', url: '/demo/audio/1.wav', cover: '/demo/cover-1.svg', size: 5242880, duration: 214, sort: 1, created_at: '2026-09-20' },
  { id: 'mu-2', title: '云边小卖部', artist: '青雨', url: '/demo/audio/2.wav', cover: '/demo/cover-2.svg', size: 4194304, duration: 168, sort: 2, created_at: '2026-09-19' },
  { id: 'mu-3', title: '旧巷与晚风', artist: '林间有风', url: '/demo/audio/3.wav', cover: '/demo/cover-3.svg', size: 3670016, duration: 152, sort: 3, created_at: '2026-09-15' },
  { id: 'mu-4', title: '夜航船 - 器乐版', artist: '南桥', url: '/demo/audio/4.wav', cover: '/demo/cover-4.svg', size: 4718592, duration: 196, sort: 4, created_at: '2026-09-11' },
  { id: 'mu-5', title: '书页翻动的声音', artist: '木子', url: '/demo/audio/5.wav', cover: '/demo/cover-5.svg', size: 3145728, duration: 141, sort: 5, created_at: '2026-09-02' }
];

/* ---------- 站点设置（admin「博客设置」持久化的键） ---------- */
export const SETTINGS = {
  site_info: JSON.stringify({
    name: "Qingyu'Blog",
    desc: '零依赖轻量博客 · 原生 JS + Cloudflare Workers',
    avatar: '/demo/avatar.svg',
    copyright: "Qingyu'Blog",
    footerText: '本站部分内容转载自网络，作品版权归原作者及来源网站所有，任何内容转载、商业用途等均须联系原作者并注明来源。',
    about: md(
      '# 关于本站',
      '',
      '这里是一个安静写字的角落。用原生 HTML / CSS / JavaScript 写成，托管在 Cloudflare 的边缘网络上。',
      '',
      '## 关于我',
      '',
      '- 喜欢把复杂的东西做简单',
      '- 写一点前端，也写一点随笔',
      '- 相信好的排版是一种尊重',
      '',
      '## 关于这个博客',
      '',
      '没有框架、没有构建、没有依赖。你觉得不错的话，欢迎在留言板说点什么。'
    )
  }),
  profile: JSON.stringify({
    name: 'Qingyu', bio: '写点代码，也写点字。', avatar: '/demo/profile.svg', email: 'admin@example.com'
  }),
  nav_menu: JSON.stringify([
    { i18n: 'nav.home', text: '首页', url: '/' },
    { i18n: 'nav.tags', text: '标签', url: '/tags' },
    { i18n: 'nav.archive', text: '归档', url: '/archive' },
    { i18n: 'nav.guestbook', text: '留言板', url: '/guestbook' },
    { i18n: 'nav.about', text: '关于', url: '/about' }
  ]),
  footer_nav: JSON.stringify([
    { text: 'Docs', url: 'https://docs.example.com/' },
    { text: 'GitHub', url: 'https://github.com/kejiland/qingyu-blog' }
  ]),
  friend_links: JSON.stringify([
    { text: '语幕', url: 'https://example.com' },
    { text: 'Smoji', url: 'https://example.com/smoji' }
  ]),
  moderate_comments: '1'
};

/* ---------- 近 30 天趋势（仪表盘折线图） ---------- */
export function buildTrend(days = 30) {
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const t = days - 1 - i;
    // 造一条有起伏但不夸张的曲线：周末略高
    const weekend = [0, 6].includes(d.getDay()) ? 1.35 : 1;
    const views = Math.round((26 + 16 * Math.sin(t / 3.1) + 9 * Math.sin(t / 1.7) + (t % 5) * 2.4) * weekend);
    const likes = Math.max(0, Math.round((2.4 + 1.6 * Math.sin(t / 2.3 + 1) + (t % 4) * 0.5) * weekend));
    out.push({ date: d.toISOString().slice(0, 10), views: Math.max(3, views), likes });
  }
  return out;
}

/* ---------- 每篇文章的阅读 / 点赞数 ---------- */
export const STATS = {
  'qingyu-blog-guide': { views: 1284, likes: 96 },
  'workers-d1-deploy': { views: 873, likes: 61 },
  'markdown-writing': { views: 651, likes: 44 },
  'music-player-design': { views: 512, likes: 52 },
  'serif-typography': { views: 398, likes: 37 },
  'next-plan': { views: 12, likes: 0 }
};

/* ---------- AI 演示回复 ---------- */
export const AI = {
  summary: '这篇文章介绍了 Qingyu\'Blog 的两种运行模式与完整上线流程：静态模式把数据放在浏览器本地，云端模式把数据放到 Cloudflare D1；' +
    '并给出写第一篇文章的三个步骤，以及部署到 Cloudflare 需要准备的四项配置。',
  assist: {
    title: '1. 从零到上线：Qingyu\'Blog 完整使用指南\n2. 零依赖博客的上线手册：模式选择、写作与 Cloudflare 部署\n3. 把博客放到边缘：一份可照做的 Cloudflare 部署清单',
    polish: 'Qingyu\'Blog 是一个完全用原生 JavaScript 编写的个人博客系统：不依赖框架，也不需要构建步骤。你既可以双击 public/index.html 立刻开始写作，' +
      '也可以把它部署到 Cloudflare Workers，把数据托管在云端。',
    translate: 'Qingyu\'Blog is a personal blog system written in pure vanilla JavaScript: no framework, no build step, no runtime dependency. ' +
      'You can double-click public/index.html to start writing immediately, or deploy it to Cloudflare Workers and keep your data in the cloud.'
  },
  comments: '近期读者最关心的是 Cloudflare 的配置细节：KV id 不支持环境变量内插、D1 迁移的幂等处理，以及 R2 自定义域名与备案。' +
    '另外有两条待审评论需要处理，其中一条疑似垃圾推广。'
};

/* ---------- WAV 音频（运行时合成，避免仓库里放二进制） ---------- */
/**
 * 生成一段可播放的 WAV：简单和弦琶音 + 淡入淡出，用于播放器截图里的真实时长。
 * @param {number} seconds 时长（秒）
 * @param {number} rate 采样率
 */
export function buildWav(seconds, rate = 8000) {
  const total = Math.max(1, Math.round(seconds * rate));
  const data = Buffer.alloc(total * 2);
  const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const step = Math.floor(t * 2) % scale.length;
    const f = scale[step];
    const env = Math.min(1, t * 4) * Math.min(1, Math.max(0, (seconds - t) * 4));
    const v = (Math.sin(2 * Math.PI * f * t) * 0.35 + Math.sin(2 * Math.PI * f * 2 * t) * 0.12) * env * 0.6;
    data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);            // PCM
  head.writeUInt16LE(1, 22);            // mono
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);     // byte rate
  head.writeUInt16LE(2, 32);            // block align
  head.writeUInt16LE(16, 34);           // bits
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
