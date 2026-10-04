/* ============================================================
 * Qingyu'Blog · 部署配置
 * ------------------------------------------------------------
 * mode 可选：
 *   'auto'   （推荐）自动检测：请求 /api/posts 成功 → 云端模式；
 *            失败（file:// 本地打开 / 纯静态托管）→ 静态模式。
 *   'static' 强制静态模式（只用 posts.js + 导出发布）。
 *   'api'    强制云端模式（需要后端：Cloudflare Pages Functions 或 Workers）。
 * apiBase：后端 API 基础地址。留空表示同源（Cloudflare 部署默认）；
 *          也可填如 https://www.2024921.xyz（跨域时后端已带 CORS 头）。
 * siteUrl ：站点对外地址（用于生成 RSS/Sitemap 链接），如 https://blog.example.com；
 *          留空时后端自动取请求来源、前端取页面来源。
 *
 * 管理员安全（云端模式）：
 *   · 密码只存 Cloudflare D1（PBKDF2-SHA256 加盐哈希，绝不存明文/不出前端源码）。
 *   · 首次部署：配置了 BLOG_ADMIN_SETUP_KEY 时，POST /api/admin/setup 需携带匹配的
 *     X-Setup-Key 头（防抢注，推荐）；未配置时回退旧行为——首次登录自动生成
 *     随机默认密码（xxxx-xxxx，登录后强制修改）。
 *   · 日常登录：POST /api/admin/login → 服务端校验 → 返回 7 天会话 token
 *     （存浏览器 localStorage，写操作携带；服务端内置 5 次/15 分钟失败锁定）。
 *   · 下方 adminPwd 仅用于「静态模式」的本地门禁（file:// 或纯静态托管），
 *     云端部署时请留空，真正密码在 Cloudflare 后端，前端永远拿不到。
 *
 * 路由（真实路径，无 hash）：
 *   首页 / · 归档 /archive · 关于 /about · 标签 /tags · 后台 /admin 或 /write
 *   文章  /posts/<文章别名>/   编辑  /posts/<文章别名>/edit
 * 即文章地址形如 https://blog.example.com/posts/article-title/ 。
 * 部署要求：站点根目录直接服务本 public/ 内容（不要带 /public 前缀）；
 * 本地 file:// 双击 index.html 自动退化为主页可用。
 * ------------------------------------------------------------
 * writeToken：可选。旧版静态令牌（后端 BLOG_WRITE_TOKEN 环境变量），
 *             建议改用上方的会话登录；普通用户一般无需填写。
 * ------------------------------------------------------------
 * ads：广告位（按需启用，未启用完全不输出）。
 * 云端模式：后台「设置 → 功能开关 → 广告位」可直接开关并修改各广告位代码，
 * 覆盖此处默认值（存 D1 site_settings.features，无需改代码重部署）。
 *   enabled: true      总开关
 *   belowSearch: ''    首页列表上方（搜索/标签下方）插入的代码
 *   between: ''        首页列表每隔 betweenEvery 篇插入一次的代码
 *   betweenEvery: 3    列表间隔篇数
 *   content: ''        文章详情底部插入的代码
 * 代码为原始 HTML/脚本（如 Google AdSense 的 <ins> 片段），自行保证安全；
 * 常见写法：<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-xxx" data-ad-slot="xxx"></ins>
 * ============================================================ */
window.BLOG_CONFIG = {
  mode: 'auto',
  apiBase: '',
  siteUrl: 'https://www.2024921.xyz',
  writeToken: '',
  /* 首页每页显示文章数（分页）。设为 0 = 不分页、全部显示。
   * 例：pageSize: 8 → 首页每页 8 篇，底部出现「上一页 / 下一页」。
   * 云端模式：后台「设置 → 功能开关 → 首页分页」可覆盖此值（存 D1 site_settings.features，无需改代码重部署）。 */
  pageSize: 5,
  /* 管理员门禁（静态模式本地密码；云端模式请留空）。
   * 云端部署（推荐）：密码只存 Cloudflare D1，见文件头说明——
   *   首次 /api/admin/setup 设置（配置安装密钥时需 X-Setup-Key），
   *   未配置密钥时首次登录自动生成随机默认密码；之后 /api/admin/login 登录拿会话 token。
   * 静态模式（file:// 或纯静态托管，无后端）：可在此填固定密码（如 'my-secret'），
   *   或留空让浏览器本地设置（≥4 位，仅防君子，真安全请走云端模式）。
   * 云端密码长度：服务端强制至少 8 位。
   *
   * 写文章入口（真实路径，无 hash）：
   *   https://blog.example.com/admin     （或 https://xxx.pages.dev/admin）
   *   https://blog.example.com/posts/<别名>/edit   （从文章页点「编辑」进入）
   * 本地双击 public/index.html 仍可用（file:// 自动退化为 #/ 内部路由）。 */
  adminPwd: '',

  /* 页脚（可选）：links 为友情链接（电脑端显示「友情链接：…」）；icp 为备案号。
   *   decl：站点声明（电脑端显示）；email：侵权/举报联系邮箱（电脑端显示）。
   *   startYear：版权起始年（固定）；copyrightName：版权署名。版权为「©起始年-当前年 署名」。
   *
   *   页脚导航（contact）：底部导航栏的链接列表，可自由增删并支持外部链接。
   *   · 站内路径：url 填 /tags、/archive、/about 等（自动带上部署前缀）。
   *   · 外部链接：url 填 https://... 或 //...（自动新窗口打开）。
   *   · 管理员入口「后台」始终由系统自动附加，无需在此配置。
   *   下方数组即当前页脚导航，可随意增删、替换为任意站内或外部链接。 */
  footer: {
    text: '',
    icp: '',
    contact: [
      { text: 'Docs', url: 'https://docs.2024921.xyz/' },
      { text: 'GitHub', url: 'https://github.com/kejiland/qingyu-blog' }
      // 页脚导航可自由增删，站内路径如 /tags、/archive、/about，
      // 外部链接会自动新窗口打开（无需改代码，改此数组即可）。
    ],
    links: [
     { text: '语幕', url: 'https://www.yumus.cn' }
    ],
    decl: '本站部分内容转载自网络，作品版权归原作者及来源网站所有，任何内容转载、商业用途等均须联系原作者并注明来源。',
    email: 'admin@cloumail.com',
    startYear: 2019,
    copyrightName: "Qingyu'Blog"
  },
  ads: {
    enabled: false,  // 已按需求关闭广告开关；需要时改为 true 才会显示
    // AdSense 发布商 ID（ca-pub-xxxx），启用广告时由前端自动加载 adsbygoogle.js 库。
    // 留空则即使 enabled=true 也不会加载广告脚本（无可用账号）。
    client: 'ca-pub-4096395942817870',
    // ── 广告位模板（在 AdSense 后台「广告 → 按广告单元」创建「展示广告」后复制生成的代码）──
    // 把下面三处的 YOUR_SLOT_ID 替换成你自己的广告位 ID，并把 enabled 改为 true 即可。
    // 注意：只需放 <ins> + (adsbygoogle||[]).push({}) 这两段，库脚本由 client 自动加载，勿重复粘贴。
    belowSearch: '',
    between: '',
    betweenEvery: 3,   // 首页列表每 3 篇插入一个 between 广告
    content: '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-4096395942817870" data-ad-slot="9532226266" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle = window.adsbygoogle || []).push({})</script>'
  }
};
