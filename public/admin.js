/* ============================================================
 * 轻语博客 · 后台管理 UI（响应式：PC 固定侧栏 / 移动端抽屉）
 * ------------------------------------------------------------
 * 纯原生 JS，无框架；复用前台 app.js 的全局能力（apiFetch / adminOk /
 * esc / svgIcon / renderMarkdown / navigate / getConfig 等）。
 * 通过 window.QingyuAdmin.mount(root, path) 由 app.js 路由挂载，
 * 前台 reader 逻辑完全不受影响（前提逻辑不变）。
 *
 * 路由（均在 /admin 命名空间下）：
 *   /admin                 仪表盘
 *   /admin/posts           全部文章
 *   /admin/posts/new       写新文章
 *   /admin/posts/:id/edit  编辑文章
 *   /admin/categories      分类管理
 *   /admin/tags            标签管理
 *   /admin/comments        全部评论
 *   /admin/comments/pending 待审核评论
 *   /admin/media           媒体资源
 *   /admin/settings        博客设置
 * （/write 与 /posts/:id/edit 也跳转至此编辑器）
 * ============================================================ */
(function () {
  'use strict';

  /* ----------------------- 工具函数 ----------------------- */
  function esc(s) { return window.esc ? window.esc(s) : String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function icon(name, size) { return window.svgIcon ? window.svgIcon(name, size) : ''; }
  function cfg() { return window.getConfig ? window.getConfig() : (window.BLOG_CONFIG || {}); }
  function cloudOn() { return typeof window._cloudOn === 'function' ? window._cloudOn() : false; }
  function isAdmin() { return typeof window.adminOk === 'function' ? window.adminOk() : false; }
  function go(path) { if (window.navigate) window.navigate(path); }
  function link(path) { return window.href ? window.href(path) : path; }

  /* 从 R2 / S3 的 XML 错误响应里提取 <Code>/<Message>，用于把上传失败原因显示给管理员。
   * 浏览器跨域直传 R2 时，只有桶的 CORS 规则允许才读得到响应体；读不到就返回空串。 */
  function r2Detail(xhr) {
    try {
      var body = String(xhr.responseText || '');
      var code = (/<Code>([^<]+)<\/Code>/.exec(body) || [])[1] || '';
      var message = (/<Message>([^<]+)<\/Message>/.exec(body) || [])[1] || '';
      var detail = [code, message].filter(Boolean).join(': ');
      return detail ? '：' + detail : '';
    } catch (e) { return ''; }
  }

  function fmtDate(s) {
    s = String(s || '');
    if (!s) return '';
    return s.slice(0, 10);
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  /* 最新评论自动滚动：内容超出容器时匀速上滚，到底后回到顶部循环；
   * 悬停暂停、离开恢复；遵循系统"减少动态效果"设置。 */
  function startFeedScroll(host) {
    if (_feedTimer) { clearInterval(_feedTimer); _feedTimer = null; }
    var sc = host.querySelector('.ab-feed-scroll');
    if (!sc) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (sc.scrollHeight <= sc.clientHeight + 2) return; // 内容不多，无需滚动
    var step = 0.6, tickMs = 40;
    function tick() {
      if (!sc.isConnected) { clearInterval(_feedTimer); _feedTimer = null; return; }
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1) sc.scrollTop = 0;
      else sc.scrollTop += step;
    }
    function stop() { if (_feedTimer) { clearInterval(_feedTimer); _feedTimer = null; } }
    function start() { if (!_feedTimer && sc.isConnected) _feedTimer = setInterval(tick, tickMs); }
    sc.addEventListener('pointerenter', stop);
    sc.addEventListener('pointerleave', start);
    start();
  }
  function slug(s) {
    if (window.slug) return window.slug(s);
    return String(s || '').toLowerCase().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || ('p' + Date.now().toString(36));
  }
  async function api(url, opts) {
    if (!window.apiFetch) throw new Error(t('admin.error.apiFetchUnavailable'));
    try {
      return await window.apiFetch(url, opts || {});
    } catch (e) {
      // 401 = 会话过期/无效，清除 token 并跳转登录页
      if ((e && e.status) === 401 || String(e.message || e).indexOf('HTTP 401') >= 0) {
        sessionExpired();
      }
      throw e;
    }
  }
  /* 会话失效：提示 + 清除会话 + 跳回登录页（供 api 包装与全局事件共用） */
  function sessionExpired() {
    toast(t('editor.loginExpired'), 'err');
    if (window.cloudLogout) window.cloudLogout(); else if (window.adminLogout) window.adminLogout();
    setTimeout(function () { if (window.navigate) window.navigate('/admin'); }, 800);
  }
  /* 全局会话失效事件（前台 apiFetch 在任意 401 时派发，后台监听后自动退出登录状态） */
  if (!window.__qySessionExpiredBound) {
    window.__qySessionExpiredBound = true;
    window.addEventListener('qy:session-expired', function () { sessionExpired(); });
  }
  function toast(msg, type) {
    var wrap = document.querySelector('.ab-toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'ab-toast-wrap'; document.body.appendChild(wrap); }
    var t = document.createElement('div');
    t.className = 'ab-toast ' + (type || '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(function () { t.remove(); }, 300); }, 2400);
  }
  /* 无感移除表格行：淡出动画后原地删除，仅当数据行清空时才显示空态。
   * 替代「整表重拉 + spinner 闪烁」，删除/审核后列表其余行、滚动位置均保持不动。 */
  function seamlessRemoveRow(body, tr, emptyMsg) {
    if (!body || !tr || !tr.parentNode) return;
    tr.style.transition = 'opacity .25s ease, transform .25s ease';
    tr.style.opacity = '0';
    tr.style.transform = 'translateX(10px)';
    setTimeout(function () {
      if (tr.parentNode) tr.remove();
      var hasData = false;
      Array.prototype.forEach.call(body.querySelectorAll('tr'), function (r) {
        if (r.cells && r.cells.length >= 6) hasData = true;   // 数据行固定 6 列，状态行仅 1 列
      });
      if (!hasData && emptyMsg) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:34px" class="ab-muted">' + emptyMsg + '</td></tr>';
      }
    }, 260);
  }
  function confirmModal(title, bodyHtml, onOk, okText) {
    var mask = document.createElement('div');
    mask.className = 'ab-modal-mask';
    mask.innerHTML =
      '<div class="ab-modal">' +
      '<h3>' + esc(title) + '</h3>' +
      (bodyHtml || '') +
      '<div class="ab-modal-actions">' +
      '<button class="ab-btn ghost" data-act="cancel">' + t('confirm.cancel') + '</button>' +
      '<button class="ab-btn danger" data-act="ok">' + esc(okText || t('confirm.yes')) + '</button>' +
      '</div></div>';
    document.body.appendChild(mask);
    function close() { mask.remove(); }
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.getAttribute('data-act') === 'cancel') close();
      else if (e.target.getAttribute('data-act') === 'ok') { close(); onOk && onOk(); }
    });
    return close;
  }

  /* ----------------------- 数据访问（兼容云端 / 静态） ----------------------- */
  async function listPosts() {
    if (cloudOn()) {
      // 时间戳穿透边缘缓存（api/posts 带 s-maxage=60）：删除/发布后管理端必须立即看到最新列表，
      // 否则命中缓存会误以为「删除没生效，要刷新网页才删掉」。查询参数变化 = 边缘缓存 key 变化。
      var d = await api('api/posts?_=' + Date.now());
      return (d && d.posts) || [];
    }
    // 静态模式：BLOG_POSTS 合并本地草稿
    var base = (window.getStaticPosts ? window.getStaticPosts() : []) || [];
    var drafts = [];
    try { drafts = JSON.parse(localStorage.getItem('qingyu.drafts') || '[]'); } catch (e) {}
    var map = {};
    base.forEach(function (p) { if (p && p.id) map[p.id] = p; });
    drafts.forEach(function (p) { if (p && p.id) map[p.id] = p; });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  async function getPost(id) {
    if (cloudOn()) {
      try { var d = await api('api/posts/' + encodeURIComponent(id) + '?_=' + Date.now()); return d && d.post; } catch (e) { return null; }
    }
    var all = await listPosts();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function saveStaticPost(post) {
    var drafts = [];
    try { drafts = JSON.parse(localStorage.getItem('qingyu.drafts') || '[]'); } catch (e) {}
    var idx = -1;
    for (var i = 0; i < drafts.length; i++) if (drafts[i] && drafts[i].id === post.id) idx = i;
    var item = { id: post.id, title: post.title, date: post.date, tags: post.tags || [], excerpt: post.excerpt || '',
      cover: post.cover || '', category: post.category || '', status: post.status || 'published',
      pinned: !!post.pinned, content: post.content || '' };
    if (idx >= 0) drafts[idx] = item; else drafts.push(item);
    localStorage.setItem('qingyu.drafts', JSON.stringify(drafts));
  }
  async function savePost(post, isNew) {
    if (cloudOn()) {
      if (isNew) return await api('api/posts', { method: 'POST', body: JSON.stringify(post) });
      return await api('api/posts/' + encodeURIComponent(post.id), { method: 'PUT', body: JSON.stringify(post) });
    }
    saveStaticPost(post);
    return { ok: true };
  }
  async function deletePost(id) {
    if (cloudOn()) return await api('api/posts/' + encodeURIComponent(id), { method: 'DELETE' });
    // 静态：从本地草稿与 BLOG_POSTS 内存中同时移除，列表立即生效（前台 SPA 无需刷新网页）
    var drafts = [];
    try { drafts = JSON.parse(localStorage.getItem('qingyu.drafts') || '[]'); } catch (e) {}
    drafts = drafts.filter(function (p) { return p.id !== id; });
    localStorage.setItem('qingyu.drafts', JSON.stringify(drafts));
    var inBundle = false;
    if (Array.isArray(window.BLOG_POSTS)) {
      var before = window.BLOG_POSTS.length;
      window.BLOG_POSTS = window.BLOG_POSTS.filter(function (p) { return p && p.id !== id; });
      inBundle = window.BLOG_POSTS.length !== before;   // 命中 posts.js 内置文章：需导出覆盖后删除才发布到站点
    }
    return { ok: true, needExport: inBundle };
  }
  function downloadPostsJs() {
    if (!window.buildPostsJs) { toast(t('admin.toast.exportNotSupported'), 'err'); return; }
    // posts.js
    var txt = window.buildPostsJs();
    var blob = new Blob([txt], { type: 'text/javascript' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'posts.js';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast(t('admin.toast.exportedPostsJs'), 'ok');
  }
  /** 一键导出全部：posts.js + feed.xml + sitemap.xml（静态模式发布三件套） */
  function downloadAllStatic() {
    downloadPostsJs();
    if (window.buildFeedXmlClient) {
      setTimeout(function () {
        var fb = new Blob([window.buildFeedXmlClient(window.getStaticPosts ? window.getStaticPosts() : [], 20)], { type: 'application/xml' });
        var fa = document.createElement('a'); fa.href = URL.createObjectURL(fb); fa.download = 'feed.xml'; fa.click();
        setTimeout(function () { URL.revokeObjectURL(fa.href); }, 1000);
      }, 200);
    }
    if (window.buildSitemapClient) {
      setTimeout(function () {
        var sb = new Blob([window.buildSitemapClient()], { type: 'application/xml' });
        var sa = document.createElement('a'); sa.href = URL.createObjectURL(sb); sa.download = 'sitemap.xml'; sa.click();
        setTimeout(function () { URL.revokeObjectURL(sa.href); }, 1000);
      }, 400);
    }
    toast(t('admin.toast.exportedAll'), 'ok');
  }

  /* ----------------------- 登录门禁 ----------------------- */
  function renderGate(root) {
    var head = '', form = '', hint = '';
    if (cloudOn()) {
      head = '<h2>' + t('admin.login') + '</h2><p>' + t('admin.loginHint') + '</p>';
      form =
        '<input class="ab-input" type="password" id="abGatePwd" placeholder="' + t('admin.pwdLabel') + '" autocomplete="current-password">' +
        '<button class="ab-btn primary" id="abGateBtn">' + t('admin.loginBtn') + '</button>' +
        '<button type="button" class="ab-gate-link" id="abBtnCloudSetup">' + t('admin.gotoCloudSetup') + '</button>' +
        '<div id="abSetupForm" style="display:none">' +
        '<p class="ab-hint">' + t('admin.cloudSetupHint') + '</p>' +
        '<input class="ab-input" type="password" id="abSetupKey" placeholder="' + t('admin.setupKeyLabel') + '" autocomplete="off">' +
        '<input class="ab-input" type="password" id="abSetupPwd" placeholder="' + t('admin.pwdLabel') + '" autocomplete="new-password">' +
        '<button class="ab-btn primary" id="abBtnCloudSetupGo">' + t('admin.setupBtn') + '</button>' +
        '<button type="button" class="ab-gate-link" id="abBtnCloudSetupBack">' + t('admin.backToLogin') + '</button>' +
        '</div>';
      hint = '<p class="ab-hint" style="margin-top:14px">' + t('admin.cloudSetupHint') + '</p>';
    } else if (window.needAdminSetup && window.needAdminSetup()) {
      head = '<h2>' + t('admin.setupPwd') + '</h2><p>' + t('admin.loginHint') + '</p>';
      form =
        '<input class="ab-input" type="password" id="abGatePwd" placeholder="' + t('admin.setupPwd') + '" autocomplete="new-password">' +
        '<button class="ab-btn primary" id="abGateBtn">' + t('admin.setupBtn') + '</button>';
    } else {
      head = '<h2>' + t('admin.login') + '</h2><p>' + t('admin.loginHint') + '</p>';
      form =
        '<input class="ab-input" type="password" id="abGatePwd" placeholder="' + t('admin.pwdLabel') + '" autocomplete="current-password">' +
        '<button class="ab-btn primary" id="abGateBtn">' + t('admin.loginBtn') + '</button>';
    }
    root.innerHTML =
      '<div class="ab-gate">' +
      '<div class="ab-gate-card">' +
      '<div class="ab-gate-logo">青</div>' + head +
      form + hint +
      '</div></div>';

    var btn = root.querySelector('#abGateBtn');
    var inp = root.querySelector('#abGatePwd');
    async function submit() {
      var pwd = inp.value || '';
      if (!pwd) { toast(t('admin.pwdRequired'), 'err'); return; }
      btn.disabled = true;
      try {
        if (cloudOn()) {
          var r = await window.cloudLogin(pwd);
          if (r && r.ok) {
            if (r.mustChange) {
              // 首次部署自动初始化：弹出清晰的默认密码提示框，供查看/复制后改密（不再一闪而过）
              if (window.showFirstLoginPwd) window.showFirstLoginPwd(r.defaultPassword || '');
              else { toast(t('admin.logging'), 'ok'); go('/admin'); }
            } else {
              toast(t('admin.logging'), 'ok'); go('/admin');
            }
          }
          else { toast((r && r.message) || t('admin.wrongPwd'), 'err'); btn.disabled = false; }
        } else if (window.needAdminSetup && window.needAdminSetup()) {
          if (await window.setupAdmin(pwd)) { toast(t('admin.logging'), 'ok'); go('/admin'); }
          else { toast(t('admin.pwdTooShort'), 'err'); btn.disabled = false; }
        } else {
          if (await window.tryAdmin(pwd)) { toast(t('admin.logging'), 'ok'); go('/admin'); }
          else { toast(t('admin.wrongPwd'), 'err'); btn.disabled = false; }
        }
      } catch (e) { toast(t('admin.wrongPwd') + (e && e.message || e), 'err'); btn.disabled = false; }
    }
    btn.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    inp.focus();

    // 云端首次部署：登录 ↔ 安装密钥初始化 切换（后端 BLOG_ADMIN_SETUP_KEY 必填）
    var setupToggle = root.querySelector('#abBtnCloudSetup');
    var setupForm = root.querySelector('#abSetupForm');
    var setupBack = root.querySelector('#abBtnCloudSetupBack');
    function toggleSetup(show) {
      if (!setupForm) return;
      setupForm.style.display = show ? 'block' : 'none';
      if (setupToggle) setupToggle.style.display = show ? 'none' : '';
      if (show) {
        var k = root.querySelector('#abSetupKey');
        if (k) { try { k.focus(); } catch (e) {} }
      } else {
        try { inp.focus(); } catch (e) {}
      }
    }
    if (setupToggle) setupToggle.addEventListener('click', function () { toggleSetup(true); });
    if (setupBack) setupBack.addEventListener('click', function () { toggleSetup(false); });
    var setupGo = root.querySelector('#abBtnCloudSetupGo');
    var setupPwd = root.querySelector('#abSetupPwd');
    var setupKey = root.querySelector('#abSetupKey');
    async function submitSetup() {
      var pwd = setupPwd ? setupPwd.value : '';
      var key = setupKey ? setupKey.value : '';
      if (!pwd || !key) { toast(t('admin.pwdRequired'), 'err'); return; }
      setupGo.disabled = true;
      try {
        var r = await window.cloudSetupAdmin(pwd, key);
        if (r && r.ok) { toast(t('admin.logging'), 'ok'); go('/admin'); }
        else { toast((r && r.message) || t('admin.wrongPwd'), 'err'); setupGo.disabled = false; }
      } catch (e) { toast(t('admin.wrongPwd') + (e && e.message || e), 'err'); setupGo.disabled = false; }
    }
    if (setupGo) setupGo.addEventListener('click', submitSetup);
    if (setupPwd) setupPwd.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitSetup(); });
    if (setupKey) setupKey.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitSetup(); });
  }

  /* ----------------------- 侧边栏菜单 ----------------------- */
  /* NAV 改为函数，每次调用时重新执行 t()，语言切换后自动更新 */
  function getNav() {
    return [
      { group: t('admin.sidebar.overview'), items: [{ key: 'dashboard', label: t('admin.sidebar.dashboard'), icon: 'gauge', href: '/admin' }] },
      { group: t('admin.sidebar.postManage'), items: [
        { key: 'posts', label: t('admin.sidebar.allPosts'), icon: 'list', href: '/admin/posts' },
        { key: 'write', label: t('admin.sidebar.writeNew'), icon: 'pen', href: '/admin/posts/new' },
        { key: 'tags', label: t('admin.sidebar.tagManage'), icon: 'tag', href: '/admin/tags' }
      ] },
      { group: t('admin.sidebar.commentManage'), items: [
        { key: 'comments', label: t('admin.sidebar.allComments'), icon: 'quote', href: '/admin/comments' },
        { key: 'comments-pending', label: t('admin.sidebar.pendingComments'), icon: 'clock', href: '/admin/comments/pending', badge: 'pending' }
      ] },
      { group: t('admin.sidebar.contentSettings'), items: [
        { key: 'media', label: t('admin.sidebar.media'), icon: 'image', href: '/admin/media' },
        { key: 'music', label: t('admin.sidebar.musicManage'), icon: 'music', href: '/admin/music' },
        { key: 'settings', label: t('admin.sidebar.settings'), icon: 'sliders', href: '/admin/settings' }
      ] }
    ];
  }

  function renderSider(activeKey, pendingCount) {
    var NAV = getNav();
    var groups = NAV.map(function (g) {
      var items = g.items.map(function (it) {
        var badge = (it.badge === 'pending') ? '<span class="ab-nav-count" style="display:none"></span>' : '';
        return '<a class="ab-nav-item ' + (it.key === activeKey ? 'active' : '') + '" data-link="' + esc(it.href) + '">' +
          '<span class="ab-nav-icon">' + icon(it.icon, 17) + '</span><span class="ab-nav-text">' + esc(it.label) + '</span>' + badge + '</a>';
      }).join('');
      return '<div class="ab-nav-group"><div class="ab-nav-group-title">' + esc(g.group) + '</div>' + items + '</div>';
    }).join('');

    var adminName = (cfg().footer && cfg().footer.copyrightName) || t('admin.sidebar.admin');
    var prof = readAdminProfile();
    var siteLogo = siteLogoURL();
    var logoLetter = esc((adminName || t('admin.sidebar.admin') || '青').slice(0, 1));
    return (
      '<aside class="ab-sider" id="abSider">' +
        '<div class="ab-sider-header">' +
          '<div class="ab-brand">' +
            '<div class="ab-logo" id="abSiderLogo"' + (siteLogo ? '' : ' data-letter="' + logoLetter + '"') + '>' + siderLogoHTML(siteLogo, logoLetter) + '</div>' +
            '<b class="ab-brand-name">' + esc(adminName) + '</b>' +
          '</div>' +
        '</div>' +
        '<nav class="ab-nav">' + groups + '</nav>' +
        '<div class="ab-sider-footer">' +
          '<div class="ab-avatar" id="abSiderAvatar" data-letter="' + siderAvatarLetter(prof) + '">' + siderAvatarHTML(prof) + '</div>' +
          '<div class="ab-sider-footer-text"><b id="abSiderName">' + esc(prof.name || adminName) + '</b><span>' + t('admin.sidebar.adminDesc') + '</span></div>' +
          '<button class="ab-btn-icon" id="abSiderLogout" title="' + t('admin.sidebar.logout') + '">' + icon('logout', 17) + '</button>' +
        '</div>' +
      '</aside>' +
      '<div class="ab-sider-mask" id="abSiderMask"></div>'
    );
  }
  /* 站点 Logo：优先取「设置 → 站点信息 → 站点头像」（同时用作 favicon），否则显示站点名首字 */
  function siteLogoURL() {
    var s = window._siteSettings || {};
    var site = safeJson(s.site_info);
    if (site.avatar) return site.avatar;
    if (cfg().site && cfg().site.avatar) return cfg().site.avatar;
    return '';
  }
  /* 品牌方块内容：有 logo 显示图片（加载失败回退首字），无 logo 显示首字（衬流动渐变背景） */
  function siderLogoHTML(logo, letter) {
    if (logo) {
      return '<img class="ab-logo-img" src="' + esc(logo) + '" alt="" onerror="var p=this.parentNode;this.remove();var s=document.createElement(\'span\');s.textContent=p.getAttribute(\'data-letter\')||\'A\';p.appendChild(s)">';
    }
    return '<span>' + letter + '</span>';
  }
  /* 左下角头像：使用个人资料中设置的头像（设置 → 个人资料 → 头像 URL），无头像或加载失败时显示首字符 */
  function siderAvatarLetter(prof) {
    return esc((prof && prof.name || t('admin.sidebar.admin') || 'A').slice(0, 1).toUpperCase());
  }
  function siderAvatarHTML(prof) {
    if (prof && prof.avatar) {
      return '<img class="ab-avatar-img" src="' + esc(prof.avatar) + '" alt="" onerror="var p=this.parentNode;this.remove();var s=document.createElement(\'span\');s.className=\'ab-avatar-letter\';s.textContent=p.getAttribute(\'data-letter\')||\'A\';p.appendChild(s)">';
    }
    return '<span class="ab-avatar-letter">' + siderAvatarLetter(prof) + '</span>';
  }
  function readAdminProfile() {
    try {
      var s = JSON.parse(localStorage.getItem('qingyu.admin.profile') || 'null');
      return (s && typeof s === 'object') ? s : {};
    } catch (e) { return {}; }
  }
  function writeAdminProfile(p) {
    try { localStorage.setItem('qingyu.admin.profile', JSON.stringify(p || {})); } catch (e) {}
  }
  /* 挂载后异步同步个人信息（设置 → 个人资料），就地更新左下角头像/名称，无需重挂载 */
  function refreshSiderProfile(root) {
    if (!cloudOn()) return;
    api('api/settings').then(function (d) {
      var s = (d && d.settings) || {};
      var prof = safeJson(s.profile);
      writeAdminProfile({ name: prof.name || '', bio: prof.bio || '', avatar: prof.avatar || '', email: prof.email || '' });
      window._siteSettings = s;
      var av = root.querySelector('#abSiderAvatar');
      if (av) {
        av.setAttribute('data-letter', siderAvatarLetter({ name: prof.name }));
        av.innerHTML = siderAvatarHTML({ name: prof.name, avatar: prof.avatar });
      }
      var site = safeJson(s.site_info);
      var logoEl = root.querySelector('#abSiderLogo');
      if (logoEl) {
        var letter = esc(((prof.name || site.name || (cfg().footer && cfg().footer.copyrightName) || t('admin.sidebar.admin')) || '青').slice(0, 1));
        logoEl.setAttribute('data-letter', letter);
        logoEl.innerHTML = siderLogoHTML(site.avatar || '', letter);
      }
      var nm = root.querySelector('#abSiderName');
      if (nm) nm.textContent = prof.name || (cfg().footer && cfg().footer.copyrightName) || t('admin.sidebar.admin');
    }).catch(function () {});
  }

  /* ----------------------- 顶栏 ----------------------- */
  function renderHeader(crumbs) {
    var crumbHtml = crumbs.map(function (c, i) {
      if (i === crumbs.length - 1) return '<b>' + esc(c) + '</b>';
      return '<span class="ab-hide-sm">' + esc(c) + '</span><span class="sep ab-hide-sm">/</span>';
    }).join(' ');
    return (
      '<header class="ab-header">' +
        '<button class="ab-btn-icon" id="abMenuBtn" title="' + t('admin.header.toggleMenu') + '">' + icon('list', 18) + '</button>' +
        '<div class="ab-breadcrumb">' + crumbHtml + '</div>' +
        '<div class="ab-header-spacer"></div>' +
        '<div class="ab-header-right">' +
          '<button class="ab-header-btn" id="abPreview" title="' + t('admin.header.preview') + '">' + icon('external', 16) + '<span class="ab-hide-sm">' + t('admin.header.preview') + '</span></button>' +
          '<div class="ab-lang-wrap">' +
            '<button class="ab-btn-icon" id="abLangToggle" title="' + esc(window.langTitle ? window.langTitle() : 'Language') + '" aria-haspopup="listbox" aria-controls="abLangPop" aria-expanded="false">' + icon('globe', 18) + '</button>' +
            '<div class="ab-lang-pop" id="abLangPop" role="listbox">' +
              '<div class="ab-lang-pop-title">' + esc(window.langTitle ? window.langTitle() : 'Language') + '</div>' +
              '<div class="ab-lang-pop-options" id="abLangPopInner"></div>' +
            '</div>' +
          '</div>' +
          '<div class="ab-dropdown">' +
            '<button class="ab-btn-icon" id="abAvatarBtn" title="' + t('admin.header.account') + '">' + icon('lock', 18) + '</button>' +
            '<div class="ab-menu" id="abAvatarMenu">' +
              '<div class="ab-menu-item" data-act="profile">' + icon('pen', 16) + t('admin.header.profile') + '</div>' +
              '<div class="ab-menu-item" data-act="password">' + icon('lock', 16) + t('admin.header.changePwd') + '</div>' +
              '<div class="ab-menu-sep"></div>' +
              '<div class="ab-menu-item danger" data-act="logout">' + icon('logout', 16) + t('admin.sidebar.logout') + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</header>'
    );
  }

  /* ----------------------- 路由解析 ----------------------- */
  function parseRoute(path) {
    path = String(path || '/');
    if (path === '/write' || path === '/admin/write' || path === '/admin/posts/new') return { key: 'write', page: 'editor', id: null, isNew: true };
    var m = path.match(/^\/admin\/posts\/([^/]+)\/edit$/);
    if (m) return { key: 'write', page: 'editor', id: decodeURIComponent(m[1]), isNew: false };
    m = path.match(/^\/posts\/([^/]+)\/edit$/);
    if (m) return { key: 'write', page: 'editor', id: decodeURIComponent(m[1]), isNew: false };
    if (path === '/admin' || path === '/admin/') return { key: 'dashboard', page: 'dashboard' };
    if (path === '/admin/posts') return { key: 'posts', page: 'posts' };
    if (path === '/admin/tags') return { key: 'tags', page: 'tags' };
    if (path === '/admin/comments') return { key: 'comments', page: 'comments', filter: 'all' };
    if (path === '/admin/comments/pending') return { key: 'comments-pending', page: 'comments', filter: 'pending' };
    if (path === '/admin/media') return { key: 'media', page: 'media' };
    if (path === '/admin/music') return { key: 'music', page: 'music' };
    if (path === '/admin/settings') return { key: 'settings', page: 'settings' };
    return { key: 'dashboard', page: 'dashboard' };
  }
  function crumbsFor(route) {
    var NAV = getNav();
    for (var i = 0; i < NAV.length; i++) {
      for (var j = 0; j < NAV[i].items.length; j++) {
        if (NAV[i].items[j].key === route.key) {
          if (NAV[i].group === t('admin.sidebar.overview')) return [NAV[i].items[j].label];
          return [NAV[i].group, NAV[i].items[j].label];
        }
      }
    }
    return [t('admin.sidebar.dashboard')];
  }

  /* ----------------------- 装载入口 ----------------------- */
  var siderCollapsed = false;

  function mount(root, path) {
    if (!isAdmin()) { renderGate(root); return; }
    // 确保 i18n 已加载
    var route = parseRoute(path);
    // 异步拉取待审核数量用于角标
    var pendingCount = 0;
    renderShell(root, route, pendingCount);
    bindShell(root, route);
    loadPendingBadge(root, route);
    renderPage(root, route);
    refreshSiderProfile(root);
  }

  function renderShell(root, route, pendingCount) {
    var crumbs = crumbsFor(route);
    root.innerHTML =
      '<div class="ab-root' + (siderCollapsed ? ' ab-collapsed' : '') + '">' +
        renderSider(route.key, pendingCount) +
        '<div class="ab-main">' +
          renderHeader(crumbs) +
          '<main class="ab-content" id="abContent"></main>' +
          '<footer class="ab-footer" style="text-align:center;padding:18px;color:var(--ab-muted);font-size:12.5px;border-top:1px solid var(--ab-border);background:var(--ab-card)">' + t('admin.footer.copyright') + '</footer>' +
        '</div>' +
      '</div>';
    if (siderCollapsed) root.querySelector('#abSider').classList.add('collapsed');
  }

  function bindShell(root, route) {
    var sider = root.querySelector('#abSider');
    var mask = root.querySelector('#abSiderMask');

    root.querySelectorAll('[data-link]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('data-link')); });
    });

    // 语言切换（右上角 🌐 弹层，复刻前台首页的样式与效果：SVG 国旗 + 选项弹层）
    var langToggle = root.querySelector('#abLangToggle');
    var langPop = root.querySelector('#abLangPop');
    if (langToggle && langPop && window.__i18n) {
      var langInner = root.querySelector('#abLangPopInner');
      if (langInner) langInner.innerHTML = (typeof window.langOptionsHTML === 'function') ? window.langOptionsHTML() : '';
      langToggle.addEventListener('click', function (e) { e.stopPropagation(); var open = langPop.classList.toggle('open'); langToggle.setAttribute('aria-expanded', open ? 'true' : 'false'); });
      langPop.addEventListener('click', function (e) {
        var b = e.target.closest('[data-lang]');
        if (!b) return;
        var val = b.getAttribute('data-lang');
        var currentPath = (typeof window.currentRoute === 'function') ? window.currentRoute().path : '/admin';
        window.__i18n.loadLocale(val).then(function () {
          mount(root, currentPath);
        });
      });
    }

    var menuBtn = root.querySelector('#abMenuBtn');
    menuBtn.addEventListener('click', function () {
      if (window.innerWidth <= 991) {
        sider.classList.toggle('open');
        mask.classList.toggle('show');
      } else {
        siderCollapsed = !siderCollapsed;
        sider.classList.toggle('collapsed', siderCollapsed);
      }
    });
    mask.addEventListener('click', function () { sider.classList.remove('open'); mask.classList.remove('show'); });

    root.querySelector('#abPreview').addEventListener('click', function () {
      var url = window.location.origin + (window.location.protocol === 'file:' ? '/index.html' : '/');
      window.open(url, '_blank');
    });

    root.querySelector('#abSiderLogout').addEventListener('click', function () {
      confirmModal(t('admin.sidebar.logout'), '<p class="ab-muted">' + t('admin.sidebar.logout') + '?</p>', function () {
        if (cloudOn()) window.cloudLogout && window.cloudLogout(); else window.adminLogout && window.adminLogout();
        go('/admin');
      }, t('confirm.yes'));
    });

    // 头像下拉
    var avBtn = root.querySelector('#abAvatarBtn');
    var avMenu = root.querySelector('#abAvatarMenu');
    avBtn.addEventListener('click', function (e) { e.stopPropagation(); avMenu.classList.toggle('open'); });
    avMenu.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (!act) return;
      avMenu.classList.remove('open');
      if (act === 'logout') {
        if (cloudOn()) window.cloudLogout && window.cloudLogout(); else window.adminLogout && window.adminLogout();
        go('/admin');
      } else if (act === 'profile') {
        go('/admin/settings');
      } else if (act === 'password') {
        openPasswordModal();
      }
    });
    if (!window.__abDocCloseBound) {
      window.__abDocCloseBound = true;
      document.addEventListener('click', function () {
        var ms = document.querySelectorAll('.ab-menu.open, .ab-lang-pop.open');
        ms.forEach(function (m) { m.classList.remove('open'); });
        var alt = document.getElementById('abLangToggle');
        if (alt && !document.querySelector('.ab-lang-pop.open')) alt.setAttribute('aria-expanded', 'false');
      });
    }
  }

  function loadPendingBadge(root, route) {
    if (!cloudOn()) return;
    api('api/comments?status=pending').then(function (d) {
      var n = ((d && d.comments) || []).length;
      if (n <= 0) return;
      var cnt = root.querySelector('#abSider [data-link="/admin/comments/pending"] .ab-nav-count');
      if (cnt) { cnt.textContent = n; cnt.style.display = ''; }
    }).catch(function () {});
  }

  /* ----------------------- 内容区分发 ----------------------- */
  function renderPage(root, route) {
    var content = root.querySelector('#abContent');
    if (window.destroySmojiPicker) window.destroySmojiPicker();
    if (_feedTimer) { clearInterval(_feedTimer); _feedTimer = null; } // 离开仪表盘时停止评论自动滚动
    if (route.page === 'dashboard') return pageDashboard(content);
    if (route.page === 'posts') return pagePosts(content);
    if (route.page === 'editor') return pageEditor(content, route);
    if (route.page === 'tags') return pageTags(content);
    if (route.page === 'comments') return pageComments(content, route.filter);
    if (route.page === 'media') return pageMedia(content);
    if (route.page === 'music') return pageMusic(content);
    if (route.page === 'settings') return pageSettings(content);
  }

  /* ====================== 仪表盘 ====================== */
  function pageDashboard(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.dashboard.title') + '</h1><p class="ab-page-sub">' + t('admin.dashboard.desc') + '</p></div></div>' +
      '<div class="ab-grid cols-5" id="abStats"></div>' +
      '<div class="ab-grid cols-2">' +
        '<div class="ab-card"><div class="ab-section-title">' + icon('eye', 16) + ' ' + t('admin.dashboard.visitTrend') + '</div><div id="abTrendViews"></div></div>' +
        '<div class="ab-card"><div class="ab-section-title">' + icon('quote', 16) + ' ' + t('admin.dashboard.commentTrend') + '</div><div id="abTrendCmt"></div></div>' +
      '</div>' +
      '<div class="ab-grid cols-2">' +
        '<div class="ab-card"><div class="ab-section-title">' + icon('doc', 16) + ' ' + t('admin.dashboard.latestPosts') + '</div><div class="ab-feed" id="abRecentPosts"></div></div>' +
        '<div class="ab-card"><div class="ab-section-title">' + icon('quote', 16) + ' ' + t('admin.dashboard.latestComments') + '</div><div class="ab-feed" id="abRecentCmt"></div></div>' +
      '</div>';

    loadDashboard(content);
  }

  async function loadDashboard(content) {
    var posts = [];
    try { posts = await listPosts(); } catch (e) {}
    var total = posts.length;
    var published = posts.filter(function (p) { return (p.status || 'published') !== 'draft'; }).length;
    var drafts = posts.filter(function (p) { return (p.status || 'published') === 'draft'; }).length;

    var commentsAll = [], pending = 0;
    if (cloudOn()) {
      try { var cd = await api('api/comments?status=all'); commentsAll = (cd && cd.comments) || []; } catch (e) {}
      pending = commentsAll.filter(function (c) { return (c.status || 'approved') === 'pending'; }).length;
    }

    var pinnedCount = posts.filter(function (p) { return !!p.pinned; }).length;
    var stats = [
      { label: t('admin.dashboard.totalPosts'), value: total, icon: 'doc' },
      { label: t('admin.dashboard.published'), value: published, icon: 'check' },
      { label: t('admin.dashboard.drafts'), value: drafts, icon: 'pen' },
      { label: t('admin.dashboard.pinned'), value: pinnedCount, icon: 'pin' },
      { label: t('admin.dashboard.totalComments'), value: cloudOn() ? commentsAll.length : '—', icon: 'quote' },
      { label: t('admin.dashboard.pendingComments'), value: cloudOn() ? pending : '—', icon: 'lock' }
    ];
    content.querySelector('#abStats').innerHTML = stats.map(function (s) {
      return '<div class="ab-card ab-stat"><div class="ab-stat-label">' + icon(s.icon, 16) + esc(s.label) + '</div><div class="ab-stat-value">' + esc(String(s.value)) + '</div></div>';
    }).join('');

    // 最新发布
    var recentPosts = posts.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }).slice(0, 5);
    content.querySelector('#abRecentPosts').innerHTML = recentPosts.length ? recentPosts.map(function (p) {
      return '<div class="ab-feed-item"><div class="ab-feed-main"><b>' + esc(p.title || t('admin.dashboard.noTitle')) + '</b><span>' + esc(fmtDate(p.date)) + '</span></div></div>';
    }).join('') : '<div class="ab-empty"><div class="ab-empty-ico">📝</div><p>' + t('admin.dashboard.noPosts') + '</p><a class="ab-btn primary sm" data-link="/admin/posts/new">' + t('admin.dashboard.goWrite') + '</a></div>';
    content.querySelectorAll('#abRecentPosts [data-link]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('data-link')); }); });

    // 最新评论（评论多时自动滚动）
    var recentCmt = commentsAll.slice(0, 10);
    content.querySelector('#abRecentCmt').innerHTML = recentCmt.length ? '<div class="ab-feed-scroll">' + recentCmt.map(function (c) {
      return '<div class="ab-feed-item"><div class="ab-feed-main"><b>' + esc(c.author || t('admin.dashboard.anonymous')) + '</b><span>' + esc((c.content || '').slice(0, 30)) + '</span></div></div>';
    }).join('') + '</div>' : '<div class="ab-empty"><div class="ab-empty-ico">💬</div><p>' + t('admin.dashboard.noComments') + '</p></div>';
    startFeedScroll(content.querySelector('#abRecentCmt'));

    // 趋势（统一时间轴：日期 + 访问数 + 评论数）
    if (cloudOn()) {
      var days = [];
      try {
        var td = await api('api/stats/trend?days=30');
        var trend = (td && td.trend) || [];
        var byDate = {};
        commentsAll.forEach(function (c) { var k = fmtDate(c.date); byDate[k] = (byDate[k] || 0) + 1; });
        days = trend.map(function (t) { return { date: t.date, views: Number(t.views) || 0, comments: byDate[t.date] || 0 }; });
      } catch (e) { /* 保持空 → 显示无数据 */ }
      if (days.length) {
        content.querySelector('#abTrendViews').innerHTML = lineChart(days, 'views') + '<div class="ab-text-sm ab-muted" style="margin-top:6px">' + icon('eye', 13) + ' ' + t('admin.dashboard.dailyViews') + '</div>';
        content.querySelector('#abTrendCmt').innerHTML = lineChart(days, 'comments') + '<div class="ab-text-sm ab-muted" style="margin-top:6px">' + icon('quote', 13) + ' ' + t('admin.dashboard.dailyComments') + '</div>';
        bindTrendCharts(content);
      } else {
        content.querySelector('#abTrendViews').innerHTML = '<div class="ab-empty"><p>' + t('admin.dashboard.noViewData') + '</p></div>';
        content.querySelector('#abTrendCmt').innerHTML = '<div class="ab-empty"><p>' + t('admin.dashboard.noCommentData') + '</p></div>';
      }
    } else {
      content.querySelector('#abTrendViews').innerHTML = '<div class="ab-empty"><p>' + t('admin.dashboard.cloudOnly') + '</p></div>';
      content.querySelector('#abTrendCmt').innerHTML = '<div class="ab-empty"><p>' + t('admin.dashboard.cloudOnly') + '</p></div>';
    }
  }

  var _chartData = {}; // metric → days[]，供交互浮层读取
  var _feedTimer = null; // 最新评论自动滚动定时器（离开页面时清理）

  /* 趋势折线图：SVG 折线/数据点 + HTML 时间轴刻度 + 点击/悬停浮层（时间·访问·评论） */
  function lineChart(days, metric) {
    var w = 520, h = 200, pad = 28;
    var n = days.length;
    if (!n) return '<div class="ab-empty"><p>' + t('admin.dashboard.noData') + '</p></div>';
    _chartData[metric] = days;
    var values = days.map(function (d) { return Number(d[metric]) || 0; });
    var max = Math.max(1, Math.max.apply(null, values));
    var step = (w - pad * 2) / Math.max(1, n - 1);
    var pts = values.map(function (v, i) {
      return [pad + i * step, h - pad - (v / max) * (h - pad * 2)];
    });
    var path = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var dots = pts.map(function (p) { return '<circle class="dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6"/>'; }).join('');
    var base = '<line class="axis" x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '"/>';
    var guide = '<line class="guide" x1="0" y1="' + pad + '" x2="0" y2="' + (h - pad) + '"/>';
    // 时间轴刻度：约 6 个（首尾必含），格式 M/D
    var tickEvery = Math.max(1, Math.ceil(n / 6));
    var ticks = [];
    for (var k = 0; k < n; k += tickEvery) ticks.push(k);
    if (ticks[ticks.length - 1] !== n - 1) ticks.push(n - 1);
    var axisHtml = ticks.map(function (i) {
      return '<span class="tick" style="left:' + (pts[i][0] / w * 100).toFixed(2) + '%">' + esc(days[i].date.slice(5).replace('-', '/')) + '</span>';
    }).join('');
    return '<div class="ab-chart-box" data-metric="' + metric + '">' +
      '<svg class="ab-chart" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + base + guide +
      '<path class="line" d="' + path + '"/>' + dots + '</svg>' +
      '<div class="ab-axis">' + axisHtml + '</div>' +
      '<div class="ab-chart-tip"></div>' +
    '</div>';
  }

  /* 趋势图交互：悬停实时预览 + 点击固定浮层（时间 · 访问 · 评论） */
  function bindTrendCharts(content) {
    var W = 520, H = 200, PAD = 28;
    var pinned = -1; // 当前固定的数据点下标；-1 = 未固定
    function hideTips(content, except) {
      content.querySelectorAll('.ab-chart-tip.show').forEach(function (tip) { if (tip !== except) tip.classList.remove('show'); });
    }
    content.querySelectorAll('.ab-chart-box').forEach(function (box) {
      var svg = box.querySelector('svg');
      var guide = box.querySelector('.guide');
      var dots = box.querySelectorAll('.dot');
      var tip = box.querySelector('.ab-chart-tip');
      var days = _chartData[box.getAttribute('data-metric')] || [];
      var n = dots.length;
      if (!n || !days.length) return;
      var step = (W - PAD * 2) / (n - 1);
      var metric = box.getAttribute('data-metric');
      var maxV = Math.max(1, Math.max.apply(null, days.map(function (d) { return Number(d[metric]) || 0; })));
      function nearest(e) {
        var r = svg.getBoundingClientRect();
        var vx = (e.clientX - r.left) / r.width * W;
        var i = Math.round((vx - PAD) / step);
        return Math.max(0, Math.min(n - 1, i));
      }
      function paint(i, isPin) {
        var px = PAD + i * step;
        var v = Number(days[i][metric]) || 0;
        var py = H - PAD - (v / maxV) * (H - PAD * 2);
        dots.forEach(function (dd, k) {
          var on = k === i;
          dd.classList.toggle('on', on);
          dd.setAttribute('r', on ? '4.4' : '2.6');
        });
        guide.setAttribute('x1', px.toFixed(1)); guide.setAttribute('x2', px.toFixed(1));
        guide.setAttribute('y1', PAD); guide.setAttribute('y2', H - PAD);
        guide.style.opacity = '.5';
        tip.innerHTML = '<b>' + esc(days[i].date.slice(5).replace('-', '/')) + '</b>' +
          '<span class="tip-v">' + t('admin.dashboard.visitCount') + ' ' + esc(String(days[i].views)) + '</span>' +
          '<span class="tip-c">' + t('admin.dashboard.commentCount') + ' ' + esc(String(days[i].comments)) + '</span>';
        var lft = Math.max(9, Math.min(91, px / W * 100));
        tip.style.left = lft.toFixed(2) + '%';
        if (py < H * 0.32) { tip.style.transform = 'translate(-50%, 6px)'; tip.style.top = (py / H * 100).toFixed(2) + '%'; }
        else { tip.style.transform = 'translate(-50%, -100%)'; tip.style.top = (py / H * 100).toFixed(2) + '%'; }
        tip.classList.add('show');
        if (isPin) pinned = i; else pinned = -1;
      }
      box.addEventListener('pointermove', function (e) {
        if (pinned !== -1) return; // 已固定时悬停不挪动浮层
        hideTips(content, tip);
        paint(nearest(e), false);
      });
      box.addEventListener('pointerleave', function () {
        if (pinned === -1) {
          tip.classList.remove('show');
          dots.forEach(function (dd) { dd.classList.remove('on'); dd.setAttribute('r', '2.6'); });
          guide.style.opacity = '0';
        }
      });
      box.addEventListener('click', function (e) {
        var i = nearest(e);
        if (pinned === i) { // 再点同一处 → 取消固定
          pinned = -1;
          tip.classList.remove('show');
          dots.forEach(function (dd) { dd.classList.remove('on'); dd.setAttribute('r', '2.6'); });
          guide.style.opacity = '0';
        } else {
          hideTips(content, tip);
          paint(i, true);
        }
      });
    });
    document.addEventListener('click', function (e) {
      var inside = e.target && e.target.closest && e.target.closest('.ab-chart-box');
      if (!inside && pinned !== -1) {
        pinned = -1;
        content.querySelectorAll('.ab-chart-tip').forEach(function (tp) { tp.classList.remove('show'); });
        content.querySelectorAll('.ab-chart-box .dot.on').forEach(function (dd) { dd.classList.remove('on'); dd.setAttribute('r', '2.6'); });
        content.querySelectorAll('.ab-chart-box .guide').forEach(function (g) { g.style.opacity = '0'; });
      }
    });
  }

  /* ====================== 文章列表 ====================== */
  function pagePosts(content) {
    content.innerHTML =
      '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.postList.title') + '</h1><p class="ab-page-sub">' + t('admin.postList.desc') + '</p></div>' +
        '<button class="ab-btn primary" data-link="/admin/posts/new">' + icon('pen', 15) + ' ' + t('admin.sidebar.writeNew') + '</button></div>' +
      '<div class="ab-toolbar">' +
        '<div class="ab-search"><input class="ab-input" id="abPostKw" placeholder="' + t('admin.postList.search') + '"></div>' +
        '<select class="ab-select" id="abPostStatus" style="max-width:140px"><option value="all">' + t('admin.postList.allStatus') + '</option><option value="published">' + t('admin.dashboard.published') + '</option><option value="draft">' + t('admin.dashboard.drafts') + '</option></select>' +
      '</div>' +
      '<div class="ab-table-wrap"><table class="ab-table"><thead><tr>' +
        '<th>' + t('admin.postList.colTitle') + '</th><th>' + t('admin.postList.colTags') + '</th><th>' + t('admin.postList.colDate') + '</th><th>' + t('admin.postList.colStatus') + '</th><th class="col-actions">' + t('admin.postList.colActions') + '</th>' +
      '</tr></thead><tbody id="abPostBody"></tbody></table></div>' +
      '<div class="ab-pagination" id="abPostPage"></div>';

    bindPosts(content);
    loadPosts(content, 1);
    // 绑定内容区内的导航链接（如「写新文章」按钮），bindShell 仅绑定挂载时已有的元素
    content.querySelectorAll('[data-link]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('data-link')); });
    });
  }

  function bindPosts(content) {
    var kw = content.querySelector('#abPostKw');
    var st = content.querySelector('#abPostStatus');
    function refilter() { loadPosts(content, 1); }
    kw.addEventListener('input', debounce(refilter, 250));
    st.addEventListener('change', refilter);
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  async function loadPosts(content, page, silent) {
    var body = content.querySelector('#abPostBody');
    // silent：删除/审核后的静默校准刷新，不打断当前视图（不闪加载行）
    if (!silent) body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('admin.postList.loading') + '</td></tr>';
    var posts = [];
    try { posts = await listPosts(); } catch (e) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.postList.loadFail') + esc(e.message || e) + '</td></tr>'; return; }

    var kw = content.querySelector('#abPostKw').value.trim().toLowerCase();
    var st = content.querySelector('#abPostStatus').value;

    var filtered = posts.filter(function (p) {
      if (st !== 'all' && (p.status || 'published') !== st) return false;
      if (kw) {
        var hay = ((p.title || '') + ' ' + (p.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });
    filtered.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.postList.noMatch') + '</td></tr>';
      content.querySelector('#abPostPage').innerHTML = '';
      return;
    }
    var per = 10, totalPages = Math.max(1, Math.ceil(filtered.length / per));
    page = Math.min(page, totalPages);
    var slice = filtered.slice((page - 1) * per, page * per);
    body.innerHTML = slice.map(function (p) {
      var id = p.id;
      var statusBadge = '';
      if (p.pinned) statusBadge = '<span class="ab-status published">' + icon('pin', 11) + ' ' + t('admin.postList.pin') + '</span>';
      else statusBadge = '<span class="ab-status ' + ((p.status || 'published') === 'draft' ? 'draft' : 'published') + '">' + ((p.status || 'published') === 'draft' ? t('admin.dashboard.drafts') : t('admin.dashboard.published')) + '</span>';
      return '<tr>' +
        '<td><a class="ab-post-title" data-link="/admin/posts/' + enc(id) + '/edit">' + esc(p.title || t('admin.dashboard.noTitle')) + '</a></td>' +
        '<td class="ab-td-tags">' + (p.tags && p.tags.length ? '<div class="ab-tag-row">' + p.tags.map(function (t) { return '<span class="ab-chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '<span class="ab-muted">—</span>') + '</td>' +
        '<td class="ab-td-date">' + esc(fmtDate(p.date)) + '</td>' +
        '<td class="ab-td-status">' + statusBadge + '</td>' +
        '<td class="col-actions">' +
          '<button class="ab-btn sm" data-edit="' + enc(id) + '">' + icon('pen', 13) + ' ' + t('admin.postList.edit') + '</button> ' +
          '<button class="ab-btn sm" data-pin="' + enc(id) + '">' + icon('pin', 13) + ' ' + (p.pinned ? t('admin.postList.unpin') : t('admin.postList.pin')) + '</button> ' +
          '<button class="ab-btn sm danger" data-del="' + enc(id) + '">' + icon('trash', 13) + ' ' + t('admin.comments.delete') + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    body.querySelectorAll('[data-link]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('data-link')); }); });
    body.querySelectorAll('[data-edit]').forEach(function (b) { b.addEventListener('click', function () { go('/admin/posts/' + dec(b.getAttribute('data-edit')) + '/edit'); }); });
    body.querySelectorAll('[data-preview]').forEach(function (b) { b.addEventListener('click', function () { window.open(link('/posts/' + dec(b.getAttribute('data-preview')) + '/'), '_blank'); }); });
    body.querySelectorAll('[data-pin]').forEach(function (b) { b.addEventListener('click', async function () {
      var pid = dec(b.getAttribute('data-pin'));
      // 立即切换按钮文字（乐观更新），让用户即时看到反馈
      var isPinned = b.innerHTML.indexOf(t('admin.postList.unpin')) >= 0;
      b.innerHTML = '<span class="ab-spin" style="width:13px;height:13px;border-width:2px"></span> ' + (isPinned ? t('admin.postList.unpinning') : t('admin.postList.pinning'));
      b.disabled = true;
      try {
        var post = await getPost(pid);
        if (!post) { toast(t('admin.postList.notFound'), 'err'); return; }
        post.pinned = !post.pinned;
        if (cloudOn()) {
          await api('api/posts/' + enc(pid), { method: 'PUT', body: JSON.stringify(post) });
        } else {
          saveStaticPost(post);
          downloadPostsJs();
        }
        toast(post.pinned ? t('admin.postList.pinnedOk') : t('admin.postList.unpinnedOk'), 'ok');
      } catch (e) { toast(t('admin.postList.opFail') + (e.message || e), 'err'); }
      b.disabled = false;
      loadPosts(content, page);
    }); });
    body.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function () {
      var pid = dec(b.getAttribute('data-del'));
      var tr = b.closest('tr');
      confirmModal(t('admin.postList.deleteTitle'), '<p class="ab-muted">' + t('admin.postList.deleteConfirm', { title: esc(pid) }) + '</p>', async function () {
        // 无感删除：请求期间行半透明即时反馈，成功后行淡出移除并静默校准整表（不闪加载态）
        if (tr) { tr.style.opacity = '0.45'; tr.style.pointerEvents = 'none'; }
        try {
          var r = await deletePost(pid);
          // 同步前台 SPA 内存数据源：前台列表/详情立即反映删除，无需刷新网页
          if (window.syncDeletedPost) window.syncDeletedPost(pid);
          toast(t('admin.postList.deleted'), 'ok');
          seamlessRemoveRow(body, tr, t('admin.postList.noMatch'));
          if (r && r.needExport) toast(t('admin.postList.deleteNeedExport'), 'err');
          loadPosts(content, page, true);
        } catch (e) {
          if (tr) { tr.style.opacity = ''; tr.style.pointerEvents = ''; }
          toast(t('admin.postList.deleteFail') + (e.message || e), 'err');
        }
      }, t('admin.comments.delete'));
    }); });

    var pg = content.querySelector('#abPostPage');
    var html = '';
    if (page > 1) html += '<button class="ab-page-btn" data-p="' + (page - 1) + '">' + t('pagination.prev') + '</button>';
    html += '<button class="ab-page-btn active">' + page + ' / ' + totalPages + '</button>';
    if (page < totalPages) html += '<button class="ab-page-btn" data-p="' + (page + 1) + '">' + t('pagination.next') + '</button>';
    pg.innerHTML = html;
    pg.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { loadPosts(content, parseInt(b.getAttribute('data-p'), 10)); }); });
  }
  function enc(s) { return encodeURIComponent(s); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  /* ====================== AI（写作助手 & 评论汇总） ======================
   * 复用 window.aiProbe 探测（app.js）；AI 不可用 → slot 留空，后台其余功能不受影响。
   * 与 app.js 的 AI 回调纯后台自包含：按钮不走 data-ai-action（避免被 app.js 全局委托拦截），
   * 请求走 admin 自己的 api()，结果应用到本模块编辑器（#abTitle/#abTags/#abBody）。 */
  function abAiProbe() {
    if (typeof window.aiProbe === 'function') return window.aiProbe();
    return Promise.resolve(false);
  }
  function abAiLang() {
    var loc = (window.__i18n && window.__i18n.getLocale) ? window.__i18n.getLocale() : 'zh-CN';
    return /^(zh-CN|en|ja|ko|hi)$/.test(loc) ? loc : 'zh-CN';
  }
  function abAiErr(e) {
    var m = (e && e.message) || '';
    return /^HTTP \d{3}$/.test(m) ? t('ai.fail') : (m || t('ai.fail'));
  }
  function abAiMsg(text) {
    var el = document.getElementById('abAiMsg');
    if (el) el.textContent = text;
  }
  function abAiBarHTML() {
    var opts = ['zh-CN', 'en', 'ja', 'ko', 'hi'].map(function (c) {
      return '<option value="' + c + '"' + (c === abAiLang() ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
    return '<div class="ab-ai">'
      + '<span class="ab-ai-title">' + icon('spark', 14) + ' ' + esc(t('ai.assist.title')) + '</span>'
      + '<select class="ab-ai-lang" id="abAiLang">' + opts + '</select>'
      + '<button type="button" class="ab-btn sm" data-abai="title">' + esc(t('ai.assist.titles')) + '</button>'
      + '<button type="button" class="ab-btn sm" data-abai="polish">' + esc(t('ai.assist.polish')) + '</button>'
      + '<button type="button" class="ab-btn sm" data-abai="translate">' + esc(t('ai.assist.translate')) + '</button>'
      + '<span class="ab-ai-msg" id="abAiMsg"></span>'
      + '<div class="ab-ai-out" id="abAiOut"></div>'
      + '</div>';
  }
  function initAbAi(content) {
    var slot = content.querySelector('#abAiAssist');
    if (!slot) return;
    abAiProbe().then(function (ok) {
      if (!ok) return;   // AI 不可用 → 保持为空
      slot.innerHTML = abAiBarHTML();
      slot.querySelectorAll('[data-abai]').forEach(function (b) {
        b.addEventListener('click', function () { abAiDo(b.getAttribute('data-abai'), b); });
      });
      // 结果区的「应用/复制/收起」按钮是动态插入的，用事件委托统一绑定
      // （此前未绑定 → 点击无反应）
      var out = slot.querySelector('#abAiOut');
      if (out) {
        out.addEventListener('click', function (e) {
          var b = e.target && e.target.closest ? e.target.closest('[data-abai-use]') : null;
          if (!b || !out.contains(b)) return;
          abAiApply(content, b.getAttribute('data-abai-use'));
        });
      }
    });
  }
  function abAiDo(action, btn) {
    var area = document.getElementById('abBody');
    var text = area ? area.value : '';
    if (!text || !text.trim()) { abAiMsg(t('ai.assist.empty')); return; }
    var sel = document.getElementById('abAiLang');
    var lang = sel ? sel.value : abAiLang();
    var orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = icon('spinner', 13);
    api('api/ai/assist', { method: 'POST', body: JSON.stringify({ action: action, text: text, lang: lang }) })
      .then(function (d) {
        btn.disabled = false;
        btn.innerHTML = orig;
        abAiMsg('');
        var out = document.getElementById('abAiOut');
        if (out) out.innerHTML = abAiResultHTML(action, (d && d.result) || '');
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.innerHTML = orig;
        abAiMsg(abAiErr(e));
      });
  }
  function abAiResultHTML(action, result) {
    // 润色/翻译：主操作是「替换原文」（直接覆盖源文本）；同时保留「插入末尾」备选
    var isReplace = action === 'polish' || action === 'translate';
    var useLabel = action === 'title' ? t('ai.assist.applyTitle')
      : action === 'tags' ? t('ai.assist.applyTags')
      : (isReplace ? t('ai.assist.replaceBody') : t('ai.assist.pasteEnd'));
    var useAct = action === 'title' ? 'title' : action === 'tags' ? 'tags' : (isReplace ? 'replace' : 'paste');
    var extraPaste = '';
    if (isReplace) {
      extraPaste = '<button type="button" class="ab-btn sm ghost" data-abai-use="paste">' + icon('download', 12) + ' ' + esc(t('ai.assist.pasteEnd')) + '</button>';
    }
    return '<div class="ab-ai-result"><pre>' + esc(result) + '</pre>'
      + '<div class="ab-row" style="gap:8px;margin-top:8px;flex-wrap:wrap">'
      + '<button type="button" class="ab-btn sm primary" data-abai-use="' + useAct + '">' + esc(useLabel) + '</button>'
      + extraPaste
      + '<button type="button" class="ab-btn sm ghost" data-abai-use="copy">' + icon('copy', 12) + ' ' + esc(t('ai.assist.copy')) + '</button>'
      + '<button type="button" class="ab-btn sm ghost" data-abai-use="hide">' + esc(t('ai.assist.hide')) + '</button>'
      + '</div></div>';
  }
  function abAiApply(content, use) {
    var out = content.querySelector('#abAiOut');
    if (!out) return;
    var pre = out.querySelector('pre');
    var text = pre ? pre.textContent : '';
    if (use === 'hide') { out.innerHTML = ''; return; }
    if (use === 'copy') {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    if (!text) return;
    if (use === 'title') {
      var first = String(text).split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
      var ti = content.querySelector('#abTitle');
      if (ti && first) { ti.value = first; out.innerHTML = ''; }
    } else if (use === 'tags') {
      var tg = content.querySelector('#abTags');
      if (tg) {
        tg.value = String(text).split(/[\n，,、]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8).join(', ');
        out.innerHTML = '';
      }
    } else if (use === 'paste') {
      var area = content.querySelector('#abBody');
      if (area) {
        area.value = area.value ? area.value.replace(/\s*$/, '') + '\n\n' + text : text;
        area.dispatchEvent(new Event('input'));
        out.innerHTML = '';
      }
    } else if (use === 'replace') {
      // 润色/翻译：直接替换原文（覆盖编辑区全文），立即刷新预览与字数
      var area2 = content.querySelector('#abBody');
      if (area2 && text) {
        area2.value = text;
        area2.dispatchEvent(new Event('input'));
        out.innerHTML = '';
      }
    }
  }
  /* —— 评论页：AI 汇总 + 单条垃圾检测 —— */
  function initAbAiComments(content) {
    var slot = content.querySelector('#abAiComments');
    if (!slot || !cloudOn()) return;
    abAiProbe().then(function (ok) {
      if (!ok) return;
      slot.innerHTML = '<button type="button" class="ab-btn sm" id="abAiCsum">' + icon('spark', 14) + ' ' + esc(t('ai.comments.summarize')) + '</button>';
      slot.querySelector('#abAiCsum').addEventListener('click', function () {
        var btn = this;
        btn.disabled = true;
        btn.innerHTML = icon('spinner', 13) + ' ' + esc(t('site.loading'));
        api('api/ai/comments', { method: 'POST', body: JSON.stringify({ action: 'summarize' }) })
          .then(function (d) {
            slot.innerHTML = abAiCommentsHTML((d && d.summary) || '', !!(d && d.empty), !!(d && d.cached));
            bindAiScreen(slot);
          })
          .catch(function (e) {
            btn.disabled = false;
            btn.innerHTML = icon('spark', 14) + ' ' + esc(t('ai.comments.summarize'));
            slot.innerHTML = '<span class="ab-muted" style="font-size:13px">' + esc(abAiErr(e)) + '</span>';
          });
      });
    });
  }
  function abAiCommentsHTML(summary, empty, cached) {
    if (empty) return '<div class="ab-ai-card"><p class="ab-muted">' + esc(t('ai.comments.empty')) + '</p></div>';
    return '<div class="ab-ai-card">'
      + '<div class="ab-row" style="align-items:center;gap:8px"><b>' + icon('spark', 13) + ' ' + esc(t('ai.comments.summary')) + '</b><span class="ab-chip" style="margin-left:auto">' + esc(cached ? t('ai.cached') : t('ai.generated')) + '</span></div>'
      + '<p style="margin:8px 0 0;white-space:pre-line;line-height:1.7">' + esc(summary) + '</p>'
      + '<div class="ab-field" style="margin-top:12px"><label class="ab-label">' + esc(t('ai.comments.screenHint')) + '</label><textarea class="ab-input" id="abAiScreenText" rows="2" maxlength="1000"></textarea></div>'
      + '<div class="ab-row" style="gap:8px;margin-top:8px"><button type="button" class="ab-btn sm" id="abAiScreen">' + esc(t('ai.comments.screen')) + '</button><span id="abAiScreenOut" style="font-size:13px"></span></div>'
      + '</div>';
  }
  function bindAiScreen(slot) {
    var btn = slot.querySelector('#abAiScreen');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var ta = slot.querySelector('#abAiScreenText');
      var text = ta ? ta.value : '';
      if (!text.trim()) return;
      var out = slot.querySelector('#abAiScreenOut');
      if (out) out.innerHTML = '<span class="ab-muted">' + esc(t('site.loading')) + '…</span>';
      api('api/ai/comments', { method: 'POST', body: JSON.stringify({ action: 'screen', text: text }) })
        .then(function (d) {
          if (out) out.innerHTML = d && d.spam
            ? '<span style="color:#d9534f;font-weight:600">' + esc(t('ai.comments.spam')) + (d.reason ? '：' + esc(d.reason) : '') + '</span>'
            : '<span style="color:#4a9d5f">' + esc(t('ai.comments.notSpam')) + (d && d.reason ? '：' + esc(d.reason) : '') + '</span>';
        })
        .catch(function (e) { if (out) out.textContent = abAiErr(e); });
    });
  }

  /* ====================== 编辑器 ====================== */
  function pageEditor(content, route) {
    content.innerHTML =
      '<div class="ab-page-head"><div><h1 class="ab-page-title">' + (route.isNew ? t('admin.editor.newPost') : t('admin.editor.editPost')) + '</h1><p class="ab-page-sub">' + t('editor.markdownHint') + '</p></div></div>' +
      '<div class="ab-editor-head">' +
        '<div class="ab-editor-meta">' +
          '<div class="ab-field ab-title-field" style="margin:0"><label class="ab-label" for="abTitle">' + t('admin.editor.titleLabel') + '</label><input class="ab-input" id="abTitle" placeholder="' + t('admin.editor.titlePlaceholder') + '" autocomplete="off"><label class="ab-hint">' + t('admin.editor.titleHint') + '</label></div>' +
          '<div class="ab-field" style="margin:0"><label class="ab-label">' + t('admin.editor.tagsPlaceholder') + '</label><input class="ab-input" id="abTags" placeholder="' + t('admin.editor.tagsExample') + '" autocomplete="off"></div>' +
        '</div>' +
        '<div class="ab-field" style="margin:0"><label class="ab-label">' + t('admin.editor.coverPlaceholder') + '</label><div class="ab-row"><input class="ab-input" id="abCover" placeholder="https://…"><button class="ab-btn sm" id="abPickCover">' + t('admin.editor.selectMedia') + '</button></div></div>' +
        '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:0">' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer"><input type="checkbox" id="abPinned"> ' + icon('pin', 14) + ' ' + t('admin.editor.pin') + '</label>' +
        '</div>' +
      '</div>' +
      '<div id="abAiAssist" class="ab-ai-slot"></div>' +
      '<div class="ab-editor-split">' +
        '<div class="ab-editor-pane">' +
          '<div class="ab-editor-toolbar" id="abToolbar">' +
            '<button class="ab-tool" data-md="bold" title="' + t('admin.editor.bold') + '"><b>B</b></button>' +
            '<button class="ab-tool" data-md="italic" title="' + t('admin.editor.italic') + '"><i>I</i></button>' +
            '<button class="ab-tool" data-md="h" title="' + t('admin.editor.heading') + '">H</button>' +
            '<button class="ab-tool" data-md="quote" title="' + t('admin.editor.quote') + '">❝</button>' +
            '<button class="ab-tool" data-md="code" title="' + t('admin.editor.code') + '">&lt;/&gt;</button>' +
            '<button class="ab-tool" data-md="ul" title="' + t('admin.editor.list') + '">≡</button>' +
            '<button class="ab-tool" data-md="link" title="' + t('admin.editor.link') + '">' + icon('link', 15) + '</button>' +
            '<button class="ab-tool" data-md="img" title="' + t('admin.editor.image') + '">' + icon('image', 15) + '</button>' +
            '<button class="ab-tool" id="abSmoji" title="' + t('admin.editor.emoji') + '" aria-label="' + t('admin.editor.emoji') + '">😊</button>' +
          '</div>' +
          '<textarea class="ab-editor-area" id="abBody" placeholder="' + t('admin.editor.writeHint') + '"></textarea>' +
        '</div>' +
        '<div class="ab-editor-pane"><div class="ab-editor-preview" id="abPreviewPane"></div></div>' +
      '</div>' +
      '<div class="ab-row ab-editor-actions">' +
        (cloudOn() ? '' : '<button class="ab-btn" id="abExport">' + t('editor.exportAll') + '</button>') +
        '<button class="ab-btn" id="abSaveDraft">' + t('admin.editor.saveDraft') + '</button>' +
        '<button class="ab-btn primary" id="abPublish">' + icon('check', 15) + ' ' + t('admin.editor.publish') + '</button>' +
      '</div>';

    bindEditor(content, route);
    if (route.id) loadEditor(content, route.id); else updatePreview(content);
    initAbAi(content);
  }

  function bindEditor(content, route) {
    var area = content.querySelector('#abBody');
    area.addEventListener('input', function () { autosizeArea(area); });
    area.addEventListener('input', debounce(function () { updatePreview(content); }, 200));
    content.querySelector('#abToolbar').querySelectorAll('[data-md]').forEach(function (b) {
      b.addEventListener('click', function () { insertMd(area, b.getAttribute('data-md')); updatePreview(content); area.focus(); });
    });
    content.querySelector('#abSaveDraft').addEventListener('click', function () { saveEditor(content, route, 'draft'); });
    content.querySelector('#abPublish').addEventListener('click', function () { saveEditor(content, route, 'published'); });
    var exp = content.querySelector('#abExport');
    if (exp) exp.addEventListener('click', downloadAllStatic);
    var pick = content.querySelector('#abPickCover');
    if (pick) pick.addEventListener('click', function () { openMediaPicker(content); });
    var smojiBtn = content.querySelector('#abSmoji');
    if (smojiBtn && window.initSmojiPicker) window.initSmojiPicker(smojiBtn, area);
  }
  function updatePreview(content) {
    var area = content.querySelector('#abBody');
    var pane = content.querySelector('#abPreviewPane');
    autosizeArea(area);
    var md = area ? (area.value || '') : '';
    if (window.renderMarkdown) pane.innerHTML = window.renderMarkdown(md);
    else pane.textContent = md;
  }
  /* 编辑器输入框自动增高：无内部滚动条，高度完全跟随内容（与右侧预览一致展开） */
  function autosizeArea(area) {
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = Math.max(area.scrollHeight, 420) + 'px';
  }
  function insertMd(area, type) {
    var s = area.selectionStart, e = area.selectionEnd, v = area.value;
    var sel = v.slice(s, e), pre = '', post = '', rep = sel;
    if (type === 'bold') { pre = '**'; post = '**'; }
    else if (type === 'italic') { pre = '*'; post = '*'; }
    else if (type === 'h') { pre = '## '; }
    else if (type === 'quote') { pre = '> '; }
    else if (type === 'code') { pre = '`'; post = '`'; }
    else if (type === 'ul') { pre = '- '; }
    else if (type === 'link') { rep = '[' + (sel || t('editor.linkBtn')) + '](https://)'; }
    else if (type === 'img') { rep = '![' + (sel || t('editor.imgBtn')) + '](https://)'; }
    area.value = v.slice(0, s) + pre + rep + post + v.slice(e);
    area.selectionStart = area.selectionEnd = s + pre.length + rep.length;
  }
  async function loadEditor(content, id) {
    var p = await getPost(id);
    if (!p) { toast(t('admin.editor.notFound'), 'err'); return; }
    content.querySelector('#abTitle').value = p.title || '';
    content.querySelector('#abTags').value = (p.tags || []).join(', ');
    content.querySelector('#abCover').value = p.cover || '';
    content.querySelector('#abBody').value = p.content || '';
    content.querySelector('#abPinned').checked = !!p.pinned;
    updatePreview(content);
  }
  async function saveEditor(content, route, status) {
    var title = content.querySelector('#abTitle').value.trim();
    var body = content.querySelector('#abBody').value;
    if (!title) { toast(t('admin.editor.noTitle'), 'err'); return; }
    var id = route.id || slug(title);
    var tags = content.querySelector('#abTags').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);

    var wantPinned = !!content.querySelector('#abPinned').checked;

    var post = {
      id: id, title: title, date: new Date().toISOString().slice(0, 10),
      excerpt: (body.replace(/[#>*`\-!\[\]()]/g, '').slice(0, 120).trim()),
      content: body, cover: content.querySelector('#abCover').value.trim(),
      pinned: wantPinned, tags: tags,
      status: status
    };

    var btn = status === 'published' ? content.querySelector('#abPublish') : content.querySelector('#abSaveDraft');
    btn.disabled = true;
    try {
      var isNew = !route.id;
      var r = await savePost(post, isNew);
      if (r && (r.ok || r.post)) {
        toast(status === 'published' ? t('admin.editor.saved') : t('admin.editor.savedDraft'), 'ok');
        if (cloudOn()) go('/admin/posts'); else {
          toast(t('admin.editor.savedLocal'), 'ok');
        }
      } else {
        toast(t('admin.editor.saveFail'), 'err');
      }
    } catch (e) {
      if (!cloudOn()) { saveStaticPost(post); toast(t('admin.editor.savedDraft'), 'ok'); }
      else toast(t('admin.editor.saveFail') + (e.message || e), 'err');
    } finally { btn.disabled = false; }
  }

  function openMediaPicker(content) {
    var mask = document.createElement('div');
    mask.className = 'ab-modal-mask';
    mask.innerHTML = '<div class="ab-modal" style="max-width:560px"><h3>' + t('admin.media.title') + '</h3><div id="abPickerGrid" style="max-height:320px;overflow:auto"><span class="ab-spin"></span></div><div class="ab-modal-actions"><button class="ab-btn ghost" data-act="cancel">' + t('confirm.cancel') + '</button></div></div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask || e.target.getAttribute('data-act') === 'cancel') mask.remove(); });
    if (!cloudOn()) { mask.querySelector('#abPickerGrid').innerHTML = '<div class="ab-empty"><p>' + t('admin.media.cloudOnly') + '</p></div>'; return; }
    api('api/media').then(function (d) {
      var list = (d && d.media) || [];
      mask.querySelector('#abPickerGrid').innerHTML = list.length ? ('<div class="ab-media-grid">' + list.map(function (m) {
        return '<div class="ab-media-card" data-url="' + esc(m.url) + '" style="cursor:pointer"><div class="ab-media-thumb"><img src="' + esc(m.url) + '" alt=""></div><div class="ab-media-meta"><div class="ab-media-name">' + esc(m.name || t('admin.media.colImage')) + '</div></div></div>';
      }).join('') + '</div>') : '<div class="ab-empty"><p>' + t('admin.media.empty') + '</p></div>';
      mask.querySelectorAll('[data-url]').forEach(function (c) { c.addEventListener('click', function () {
        content.querySelector('#abCover').value = c.getAttribute('data-url'); mask.remove(); toast(t('admin.editor.selectMedia'), 'ok');
      }); });
    }).catch(function (e) { mask.querySelector('#abPickerGrid').innerHTML = '<div class="ab-empty"><p>' + t('admin.media.readFail') + '</p></div>'; });
  }

  async function pageTags(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.tags.title') + '</h1><p class="ab-page-sub">' + t('admin.tags.desc') + '</p></div>' +
      (cloudOn() ? '' : '<span class="ab-chip" style="background:var(--ab-primary-weak);color:var(--ab-primary)">' + t('admin.categories.staticHint') + '</span>') + '</div>' +
      '<div class="ab-card"><div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>' + t('admin.tags.colTag') + '</th><th>' + t('admin.tags.colCount') + '</th><th class="col-actions">' + t('admin.postList.colActions') + '</th></tr></thead><tbody id="abTagBody"></tbody></table></div></div>';
    await loadTerms(content, '#abTagBody');
  }
  async function loadTerms(content, sel) {
    var body = content.querySelector(sel);
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:24px"><span class="ab-spin"></span> ' + t('admin.postList.loading') + '</td></tr>';
    var posts = [];
    try { posts = await listPosts(); } catch (e) {}
    var map = {};
    posts.forEach(function (p) {
      (p.tags || []).forEach(function (v) { if (v) map[v] = (map[v] || 0) + 1; });
    });
    var keys = Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
    if (!keys.length) { body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.tags.noData') + '</td></tr>'; return; }
    if (!cloudOn()) {
      body.innerHTML = keys.map(function (k) { return '<tr><td><span class="ab-chip">' + esc(k) + '</span></td><td>' + map[k] + '</td><td class="ab-muted">' + t('admin.categories.staticHint') + '</td></tr>'; }).join('');
      return;
    }
    body.innerHTML = keys.map(function (k) {
      var ek = enc(k);
      return '<tr><td><span class="ab-chip">' + esc(k) + '</span></td><td>' + map[k] + '</td>' +
        '<td class="col-actions"><button class="ab-btn sm" data-rename="' + ek + '">' + icon('pen', 13) + ' ' + t('admin.tags.rename') + '</button> ' +
        '<button class="ab-btn sm danger" data-delterm="' + ek + '">' + icon('trash', 13) + ' ' + t('admin.tags.delete') + '</button></td></tr>';
    }).join('');
    body.querySelectorAll('[data-rename]').forEach(function (b) { b.addEventListener('click', function () { renameTerm(content, dec(b.getAttribute('data-rename')), sel); }); });
    body.querySelectorAll('[data-delterm]').forEach(function (b) { b.addEventListener('click', function () {
      var old = dec(b.getAttribute('data-delterm'));
      confirmModal(t('admin.tags.delete'), '<p class="ab-muted">' + t('admin.tags.deleteConfirm', { name: esc(old) }) + '</p>', async function () {
        try { await applyTermChange(old, null); toast(t('admin.tags.renameOk'), 'ok'); loadTerms(content, sel); } catch (e) { toast(t('admin.postList.opFail') + (e.message || e), 'err'); }
      }, t('admin.comments.delete'));
    }); });
  }
  async function renameTerm(content, old, sel) {
    var nv = prompt(t('admin.tags.rename') + '「' + old + '」', old);
    if (nv == null) return; nv = nv.trim();
    if (!nv || nv === old) return;
    try { await applyTermChange(old, nv); toast(t('admin.tags.renameOk'), 'ok'); loadTerms(content, sel); } catch (e) { toast(t('admin.postList.opFail') + (e.message || e), 'err'); }
  }
  async function applyTermChange(old, neo) {
    var summary = await listPosts();
    var ids = [];
    summary.forEach(function (p) {
      if ((p.tags || []).indexOf(old) >= 0) ids.push(p.id);
    });
    for (var i = 0; i < ids.length; i++) {
      // 必须取「完整」文章（含正文）再改字段后回写，否则云端 PUT 会清空正文
      var full = await getPost(ids[i]);
      if (!full) continue;
      var tags = (full.tags || []).slice();
      var j = tags.indexOf(old);
      if (j >= 0) { if (neo) { tags[j] = neo; } else { tags.splice(j, 1); } full.tags = tags; }
      await savePost(full, false);
    }
  }

  /* ====================== 评论管理 ====================== */
  async function pageComments(content, filter) {
    var title = filter === 'pending' ? t('admin.comments.pending') : t('admin.comments.title');
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + title + '</h1><p class="ab-page-sub">' + t('admin.comments.desc') + '</p></div>' +
      (cloudOn() ? '' : '<span class="ab-chip" style="background:var(--ab-primary-weak);color:var(--ab-primary)">' + t('admin.categories.staticHint') + '</span>') + '</div>' +
      (cloudOn() ? '' : '<div class="ab-card"><div class="ab-empty"><div class="ab-empty-ico">💬</div><p>' + t('admin.comments.cloudOnly') + '</p></div></div>');
    if (!cloudOn()) return;
    content.innerHTML += '<div class="ab-toolbar">' +
      '<div class="ab-search"><input class="ab-input" id="abCmtKw" placeholder="' + t('admin.comments.search') + '"></div>' +
      '<select class="ab-select" id="abCmtFilter" style="max-width:160px"><option value="all">' + t('admin.comments.all') + '</option><option value="pending"' + (filter === 'pending' ? ' selected' : '') + '>' + t('admin.comments.pendingStatus') + '</option><option value="approved">' + t('admin.comments.approved') + '</option></select>' +
      '</div><div id="abAiComments" class="ab-ai-comments"></div><div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>' + t('admin.comments.colAuthor') + '</th><th>' + t('admin.comments.colContent') + '</th><th>' + t('admin.comments.colPost') + '</th><th>' + t('admin.comments.colDate') + '</th><th>' + t('admin.comments.colStatus') + '</th><th class="col-actions">' + t('admin.comments.colActions') + '</th></tr></thead><tbody id="abCmtBody"></tbody></table></div>';
    bindComments(content);
    loadComments(content, filter);
    initAbAiComments(content);
  }
  function bindComments(content) {
    var kw = content.querySelector('#abCmtKw');
    var f = content.querySelector('#abCmtFilter');
    kw.addEventListener('input', debounce(function () { loadComments(content, f.value); }, 250));
    f.addEventListener('change', function () { loadComments(content, f.value); });
  }
  async function loadComments(content, filter) {
    var body = content.querySelector('#abCmtBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('admin.postList.loading') + '</td></tr>';
    var d;
    try { d = await api('api/comments?status=' + (filter === 'pending' ? 'pending' : 'all')); } catch (e) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.postList.loadFail') + esc(e.message || e) + '</td></tr>'; return; }
    var list = (d && d.comments) || [];
    var kw = (content.querySelector('#abCmtKw').value || '').trim().toLowerCase();
    if (kw) list = list.filter(function (c) { return ((c.author || '') + ' ' + (c.content || '')).toLowerCase().indexOf(kw) >= 0; });
    if (!list.length) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.dashboard.noComments') + '</td></tr>'; return; }
    // 建立 id → 评论 映射，以便展示“回复了某人”的父子关系
    var cmtById = {};
    list.forEach(function (c) { cmtById[c.id] = c; });
    body.innerHTML = list.map(function (c) {
      var st = c.status || 'approved';
      // 二级及以上回复：标注其父评论，便于后台追踪回复链
      var replyTag = '';
      if (c.parent_id) {
        var parent = cmtById[c.parent_id];
        if (parent) replyTag = ' <span class="ab-cmt-replyto">' + esc(t('comment.replyTo', { author: parent.author || t('admin.comments.anonymous') })) + '</span>';
        else replyTag = ' <span class="ab-cmt-replyto">#' + esc(c.parent_id) + '</span>';
      }
      var actions = '';
      if (st === 'pending') actions += '<button class="ab-btn sm primary" data-approve="' + enc(c.id) + '">' + icon('check', 13) + ' ' + t('admin.comments.approve') + '</button> ';
      actions += '<button class="ab-btn sm danger" data-delcmt="' + enc(c.id) + '">' + icon('trash', 13) + ' ' + t('admin.comments.delete') + '</button>';
      return '<tr>' +
        '<td>' + esc(c.author || t('admin.comments.anonymous')) + '</td>' +
        '<td style="max-width:320px">' + esc((c.content || '').slice(0, 120)) + replyTag + '</td>' +
        '<td>' + esc(c.post_title || c.post_id || '—') + '</td>' +
        '<td>' + esc(fmtDate(c.date)) + '</td>' +
        '<td><span class="ab-status ' + st + '">' + (st === 'pending' ? t('admin.comments.pendingStatus') : t('admin.comments.approved')) + '</span></td>' +
        '<td class="col-actions">' + actions + '</td>' +
      '</tr>';
    }).join('');
    body.querySelectorAll('[data-approve]').forEach(function (b) { b.addEventListener('click', function () { approveComment(content, dec(b.getAttribute('data-approve')), filter, b.closest('tr')); }); });
    body.querySelectorAll('[data-delcmt]').forEach(function (b) { b.addEventListener('click', function () {
      var cid = dec(b.getAttribute('data-delcmt'));
      var tr = b.closest('tr');
      confirmModal(t('admin.comments.delete'), '<p class="ab-muted">' + t('admin.comments.deleteConfirm') + '</p>', async function () {
        // 无感刷新：请求期间先半透明即时反馈，成功后行淡出移除，不整表重拉
        if (tr) { tr.style.opacity = '0.45'; tr.style.pointerEvents = 'none'; }
        try {
          await api('api/comments/' + enc(cid), { method: 'DELETE' });
          toast(t('admin.comments.deleted'), 'ok');
          seamlessRemoveRow(body, tr, t('admin.dashboard.noComments'));
        } catch (e) {
          if (tr) { tr.style.opacity = ''; tr.style.pointerEvents = ''; }
          toast(t('admin.postList.opFail') + (e.message || e), 'err');
        }
      }, t('admin.comments.delete'));
    }); });
  }
  async function approveComment(content, cid, filter, tr) {
    // 无感刷新：审核通过后原行状态徽章就地更新为「已通过」，其余行与滚动位置不动
    try {
      await api('api/comments/' + enc(cid), { method: 'PUT', body: JSON.stringify({ status: 'approved' }) });
      toast(t('admin.comments.approvedOk'), 'ok');
      if (tr) {
        var badge = tr.querySelector('.ab-status');
        if (badge) {
          badge.className = 'ab-status approved';
          badge.textContent = t('admin.comments.approved');
        }
        var approveBtn = tr.querySelector('[data-approve]');
        if (approveBtn) approveBtn.remove();
      }
    } catch (e) { toast(t('admin.postList.opFail') + (e.message || e), 'err'); }
  }

  /* ====================== 媒体库 ====================== */
  function pageMedia(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.media.title') + '</h1><p class="ab-page-sub">' + t('admin.media.desc') + '</p></div>' +
      (cloudOn() ? '<label class="ab-btn primary">' + icon('upload', 15) + ' ' + t('admin.media.upload') + '<input type="file" id="abUpload" accept="image/*" multiple hidden></label>' : '<span class="ab-chip" style="background:var(--ab-primary-weak);color:var(--ab-primary)">' + t('admin.categories.staticHint') + '</span>') + '</div>' +
      (cloudOn() ? '' : '<div class="ab-card"><div class="ab-empty"><div class="ab-empty-ico">🖼</div><p>' + t('admin.media.cloudOnly') + '</p></div></div>');
    if (!cloudOn()) return;
    content.innerHTML += '<div class="ab-media-grid" id="abMediaGrid"><span class="ab-spin"></span></div>';
    var up = content.querySelector('#abUpload');
    up.addEventListener('change', function () { uploadFiles(content, up.files); });
    loadMedia(content);
  }
  async function loadMedia(content) {
    var grid = content.querySelector('#abMediaGrid');
    grid.innerHTML = '<span class="ab-spin"></span> ' + t('admin.postList.loading');
    try {
      var d = await api('api/media');
      var list = (d && d.media) || [];
      grid.innerHTML = list.length ? list.map(function (m) {
        return '<div class="ab-media-card">' +
          '<div class="ab-media-thumb"><img src="' + esc(m.url) + '" alt="' + esc(m.name || '') + '"></div>' +
          '<div class="ab-media-meta"><div class="ab-media-name">' + esc(m.name || t('admin.media.colImage')) + '</div><div class="ab-media-size">' + fmtSize(m.size) + '</div></div>' +
          '<div class="ab-media-actions"><button class="ab-btn sm" data-copy="' + enc(m.url) + '">' + t('admin.media.copy') + '</button><button class="ab-btn sm danger" data-delmedia="' + enc(m.id) + '">' + t('admin.media.delete') + '</button></div>' +
        '</div>';
      }).join('') : '<div class="ab-card ab-empty"><div class="ab-empty-ico">🖼</div><p>' + t('admin.media.empty') + '</p></div>';
      grid.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyText(dec(b.getAttribute('data-copy'))); toast(t('admin.media.copied'), 'ok'); }); });
      grid.querySelectorAll('[data-delmedia]').forEach(function (b) { b.addEventListener('click', function () {
        var mid = dec(b.getAttribute('data-delmedia'));
        confirmModal(t('admin.media.delete'), '<p class="ab-muted">' + t('admin.media.deleteConfirm') + '</p>', async function () {
          try { await api('api/media/' + enc(mid), { method: 'DELETE' }); toast(t('admin.media.deleted'), 'ok'); loadMedia(content); } catch (e) { toast(t('admin.postList.opFail') + (e.message || e), 'err'); }
        }, t('admin.comments.delete'));
      }); });
    } catch (e) { grid.innerHTML = '<div class="ab-empty"><p>' + t('admin.postList.loadFail') + esc(e.message || e) + '</p></div>'; }
  }
  function copyText(t) {
    try { if (navigator.clipboard) navigator.clipboard.writeText(t); else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } } catch (e) {}
  }
  async function uploadFiles(content, files) {
    if (!files || !files.length) return;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!/^image\//.test(file.type)) { toast(file.name + ' ' + t('admin.media.notImage'), 'err'); continue; }
      if (file.size > 10 * 1048576) { toast(file.name + ' ' + t('admin.media.tooLarge'), 'err'); continue; }
      try {
        // R2 直传（与音乐上传同款）：先取预签名 PUT URL → XHR 直传 R2 → 注册元数据（url 为公开地址）
        var u = await api('api/media/upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, size: file.size }) });
        if (!u || !u.uploadUrl) throw new Error((u && u.error) || t('admin.media.uploadFail'));
        if (!u.publicUrl) throw new Error(t('admin.media.r2Missing'));
        var done = await new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open('PUT', u.uploadUrl);
          xhr.setRequestHeader('Content-Type', u.contentType || file.type || 'application/octet-stream');
          xhr.onload = function () {
            if (xhr.status >= 200 && xhr.status < 300) { resolve(true); return; }
            reject(new Error('HTTP ' + xhr.status + r2Detail(xhr)));
          };
          xhr.onerror = function () { reject(new Error('HTTP 0：预检被拦截 / CORS 或网络中断')); };
          xhr.send(file);
        });
        await api('api/media', { method: 'POST', body: JSON.stringify({ name: file.name, url: u.publicUrl, type: u.contentType || file.type, size: file.size }) });
        toast(t('admin.media.uploaded') + ' ' + file.name, 'ok');
      } catch (e) { toast(t('admin.media.uploadFail') + (e.message || e), 'err'); }
    }
    loadMedia(content);
  }

  /* ====================== 博客设置 ====================== */
  /* ====================== 音乐管理（R2 直传 + D1 列表） ====================== */
  function pageMusic(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.music.title') + '</h1>' +
      '<p class="ab-page-sub">' + t('admin.music.desc') + '</p></div></div>';
    if (!cloudOn()) {
      content.insertAdjacentHTML('beforeend', '<div class="ab-card"><div class="ab-empty"><div class="ab-empty-ico">🎵</div><p>' + t('admin.music.cloudOnly') + '</p></div></div>');
      return;
    }
    content.insertAdjacentHTML('beforeend',
      '<div class="ab-uploaddrop" id="abMusicDrop"><div class="ab-card">' +
        '<div class="ab-section-title">' + icon('upload', 16) + ' ' + t('admin.music.upload') + '</div>' +
        '<div class="ab-hint" style="margin:0 0 12px">' + t('admin.music.dropHint') + '</div>' +
        '<div class="ab-row" style="gap:8px;flex-wrap:wrap;align-items:center">' +
          '<label class="ab-btn" style="cursor:pointer">' + icon('file', 15) + ' ' + t('admin.music.chooseFile') + '<input id="abMusicFile" type="file" accept="audio/*" hidden></label>' +
          '<input class="ab-input" id="abMusicTitle" placeholder="' + t('admin.music.titlePh') + '" style="max-width:220px;flex:1 1 160px" autocomplete="off">' +
          '<input class="ab-input" id="abMusicArtist" placeholder="' + t('admin.music.artistPh') + '" style="max-width:180px;flex:1 1 130px" autocomplete="off">' +
          '<button type="button" class="ab-btn primary" id="abMusicUpload">' + icon('upload', 15) + ' ' + t('admin.music.upload') + '</button>' +
        '</div>' +
        '<div class="ab-hint" id="abMusicMsg">' + t('admin.music.r2Hint') + '</div>' +
        '<div class="ab-progress" id="abMusicBar" style="display:none;height:6px;border-radius:999px;background:var(--ab-border);margin-top:10px;overflow:hidden">' +
          '<div id="abMusicBarFill" style="width:0%;height:100%;background:var(--ab-primary);transition:width .2s"></div></div>' +
      '</div></div>' +
      '<div class="ab-card"><div class="ab-table-wrap ab-music-list"><table class="ab-table"><thead><tr>' +
        '<th>' + t('admin.music.colTitle') + '</th><th>' + t('admin.music.colSize') + '</th><th class="col-actions">' + t('admin.music.colActions') + '</th>' +
      '</tr></thead><tbody id="abMusicBody"></tbody></table></div></div>');
    bindMusic(content);
    loadMusic(content);
  }
  /** 从文件名解析「歌曲名-歌手」：歌手名固定为最后一段（取最后一个 - 分割，歌名里的 - 保留） */
  function parseMusicFilename(name) {
    var base = String(name || '').replace(/\.[^.]+$/, '');
    var idx = base.lastIndexOf('-');
    if (idx > 0) {
      var title = base.slice(0, idx).trim();
      var artist = base.slice(idx + 1).trim();
      if (title && artist) return { title: title, artist: artist };
    }
    return { title: base, artist: '' };
  }
  function bindMusic(content) {
    var drop = content.querySelector('#abMusicDrop');
    var file = content.querySelector('#abMusicFile');
    var artist = content.querySelector('#abMusicArtist');
    var title = content.querySelector('#abMusicTitle');
    var upload = content.querySelector('#abMusicUpload');
    function fillFromName(name) {
      var p = parseMusicFilename(name);
      if (artist && p.artist && !artist.value.trim()) artist.value = p.artist;
      if (title && p.title && !title.value.trim()) title.value = p.title;
    }
    if (file) file.addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (f) fillFromName(f.name);
    });
    if (drop) {
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('ab-drop-over'); });
      drop.addEventListener('dragleave', function (e) { e.preventDefault(); drop.classList.remove('ab-drop-over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('ab-drop-over');
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) { fillFromName(f.name); uploadMusic(content, f); }
      });
    }
    if (upload) upload.addEventListener('click', function () { uploadMusic(content); });
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  async function loadMusic(content) {
    var body = content.querySelector('#abMusicBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('admin.postList.loading') + '</td></tr>';
    var d;
    try { d = await api('api/music?_=' + Date.now()); } catch (e) {
      body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:30px" class="ab-muted">' + esc(e.message || e) + '</td></tr>';
      return;
    }
    var list = (d && d.music) || [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.music.empty') + '</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (s) {
      return '<tr data-mid="' + enc(s.id) + '">' +
        '<td><div style="display:flex;align-items:center;gap:11px;min-width:0">' +
          (s.cover ? '<img src="' + esc(s.cover) + '" alt="" style="width:38px;height:38px;border-radius:10px;object-fit:cover;flex:0 0 auto">'
            : '<span class="ab-cover-ph">' + icon('music', 17) + '</span>') +
          '<div style="min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;font-size:15px;color:var(--ab-text)">' + esc(s.title) + '</div>' +
          '<div class="ab-muted" style="font-size:12.5px;margin-top:2px">' + esc(s.artist || '—') + '</div></div></div></td>' +
        '<td class="ab-muted">' + fmtSize(s.size) + '</td>' +
        '<td class="col-actions"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
          '<button type="button" class="ab-play" data-src="' + enc(s.url) + '" title="' + t('player.play') + '">' + icon('play', 14) + '</button>' +
          '<span class="ab-player-bar" title="' + t('player.seek') + '"><span class="ab-player-fill"></span></span>' +
          '<span class="ab-player-time ab-muted">0:00</span>' +
          '<button type="button" class="ab-btn sm" data-act="edit" title="' + t('admin.music.edit') + '">' + icon('pen', 13) + '</button>' +
          '<button type="button" class="ab-btn sm danger" data-act="del" title="' + t('admin.music.delete') + '">' + icon('trash', 13) + '</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
    body.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr');
        var id = tr && tr.getAttribute('data-mid');
        if (!id) return;
        if (btn.getAttribute('data-act') === 'del') confirmModal(t('admin.music.delete'), esc(t('admin.music.deleteConfirm')), async function () {
          try {
            await api('api/music/' + id, { method: 'DELETE' });
            loadMusic(content); // 音乐表仅 3 列，不走 seamlessRemoveRow（其按 6 列判断），直接全量刷新
            toast(t('admin.music.deleted'), 'ok');
          } catch (e) { toast(esc(e.message || e), 'err'); }
        }, t('admin.music.delete'));
        else editMusic(content, id, tr);
      });
    });
    bindRowPlayers(body);
  }
  /* 行内迷你播放器：单个共享 Audio，同一时刻只播一首；进度条可点击跳转 */
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function bindRowPlayers(container) {
    var au = new Audio();
    au.preload = 'none';
    var playingBtn = null;
    function resetAll() {
      container.querySelectorAll('.ab-play').forEach(function (b) {
        b.classList.remove('playing');
        b.innerHTML = icon('play', 14);
      });
      playingBtn = null;
    }
    container.querySelectorAll('.ab-play').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var src = dec(btn.getAttribute('data-src'));
        if (playingBtn === btn && !au.paused) { au.pause(); btn.classList.remove('playing'); btn.innerHTML = icon('play', 14); playingBtn = null; return; }
        resetAll();
        au.src = src;
        playingBtn = btn;
        btn.classList.add('playing');
        btn.innerHTML = icon('pause', 14);
        au.play().catch(function () {});
      });
    });
    container.querySelectorAll('.ab-player-bar').forEach(function (bar) {
      bar.addEventListener('click', function (e) {
        if (!au.duration) return;
        var r = bar.getBoundingClientRect();
        au.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * au.duration;
      });
    });
    function rowEls() {
      if (!playingBtn) return null;
      var tr = playingBtn.closest('tr');
      if (!tr) return null;
      return { fill: tr.querySelector('.ab-player-fill'), time: tr.querySelector('.ab-player-time') };
    }
    au.addEventListener('loadedmetadata', function () {
      var el = rowEls(); if (el && el.time) el.time.textContent = '0:00 / ' + fmtTime(au.duration);
    });
    au.addEventListener('timeupdate', function () {
      var el = rowEls();
      if (!el) return;
      if (au.duration && el.fill) el.fill.style.width = (au.currentTime / au.duration * 100) + '%';
      if (el.time) el.time.textContent = fmtTime(au.currentTime) + (au.duration ? ' / ' + fmtTime(au.duration) : '');
    });
    au.addEventListener('ended', resetAll);
  }
  function editMusic(content, id, tr) {
    var t0 = tr.querySelector('td:first-child div:nth-child(2) div:first-child');
    var title = window.prompt(t('admin.music.titlePh'), t0 ? t0.textContent.trim() : '');
    if (!title || !title.trim()) return;
    var artist = window.prompt(t('admin.music.artistPh'), '');
    api('api/music/' + id, { method: 'PUT', body: JSON.stringify({ title: title.trim(), artist: ((artist || '').trim()) }) })
      .then(function () { loadMusic(content); toast(t('admin.postSaved'), 'ok'); })
      .catch(function (e) { toast(esc(e.message || e), 'err'); });
  }
  async function uploadMusic(content, fileOverride) {
    var fileEl = content.querySelector('#abMusicFile');
    var file = fileOverride || (fileEl && fileEl.files && fileEl.files[0]);
    if (!file) { toast(t('admin.music.chooseFile'), 'err'); return; }
    var msg = content.querySelector('#abMusicMsg');
    var bar = content.querySelector('#abMusicBar');
    var fill = content.querySelector('#abMusicBarFill');
    var btn = content.querySelector('#abMusicUpload');
    var parsed = parseMusicFilename(file.name);
    // 拖拽直传：以文件名解析结果为准（输入框仅供预览/修改）；点击上传：优先保留用户已填值
    var title = fileOverride
      ? (parsed.title || file.name.replace(/\.[^.]+$/, ''))
      : ((content.querySelector('#abMusicTitle').value || '').trim() || parsed.title || file.name.replace(/\.[^.]+$/, ''));
    var artist = fileOverride ? parsed.artist : ((content.querySelector('#abMusicArtist').value || '').trim() || parsed.artist || '');
    if (btn) btn.disabled = true;
    if (bar) bar.style.display = 'block';
    if (fill) fill.style.width = '0%';
    if (msg) msg.textContent = '';
    try {
      var u = await api('api/music/upload-url', { method: 'POST', body: JSON.stringify({ filename: file.name, size: file.size }) });
      if (!u || !u.uploadUrl) throw new Error((u && u.error) || t('admin.music.uploadFail'));
      if (!u.publicUrl) throw new Error(t('admin.music.r2Missing'));
      var done = await new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', u.uploadUrl);
        xhr.setRequestHeader('Content-Type', u.contentType || 'audio/mpeg');
        xhr.upload.onprogress = function (e) { if (e.lengthComputable && fill) fill.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) { resolve(true); return; }
          reject(new Error(t('admin.music.putFail') + '（HTTP ' + xhr.status + '）' + r2Detail(xhr)));
        };
        xhr.onerror = function () {
          reject(new Error(t('admin.music.putFail') + '（HTTP 0：预检被拦截 / CORS 或网络中断）'));
        };
        xhr.send(file);
      });
      await api('api/music', { method: 'POST', body: JSON.stringify({ title: title, artist: artist, url: u.publicUrl, size: file.size }) });
      if (fill) fill.style.width = '100%';
      if (msg) { msg.textContent = t('admin.music.uploadOk'); msg.style.color = 'var(--ab-ok, #4a9d5f)'; }
      if (fileEl) fileEl.value = '';
      loadMusic(content);
    } catch (e) {
      if (msg) { msg.textContent = esc(e.message || e); msg.style.color = 'var(--ab-danger, #d9534f)'; }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function pageSettings(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.settings.title') + '</h1><p class="ab-page-sub">' + t('admin.settings.desc') + '</p></div>' +
      (cloudOn() ? '<button class="ab-btn primary" id="abSaveSettings">' + icon('save', 15) + ' ' + t('admin.settings.save') + '</button>' : '<span class="ab-chip" style="background:var(--ab-primary-weak);color:var(--ab-primary)">' + t('admin.categories.staticHint') + '</span>') + '</div>' +
      (cloudOn() ? '' : '<div class="ab-card"><div class="ab-empty"><div class="ab-empty-ico">⚙️</div><p>' + t('admin.settings.cloudOnly') + '</p></div></div>');
    if (!cloudOn()) return;
    content.innerHTML += '<div class="ab-tabs">' +
      '<div class="ab-tab active" data-tab="site">' + t('admin.settings.siteInfo') + '</div>' +
      '<div class="ab-tab" data-tab="profile">' + t('admin.settings.profile') + '</div>' +
      '<div class="ab-tab" data-tab="nav">' + t('admin.settings.navMenu') + '</div>' +
      '<div class="ab-tab" data-tab="footerNav">' + t('admin.settings.footerNav') + '</div>' +
      '<div class="ab-tab" data-tab="friends">' + t('admin.settings.friendLinks') + '</div>' +
      '</div><div id="abSettingsBody"></div>';
    content.querySelectorAll('.ab-tab').forEach(function (t) { t.addEventListener('click', function () { saveTabToDraft(content); content.querySelectorAll('.ab-tab').forEach(function (x) { x.classList.remove('active'); }); t.classList.add('active'); renderSettingsTab(content, t.getAttribute('data-tab')); }); });
    renderSettingsTab(content, 'site');
    content.querySelector('#abSaveSettings').addEventListener('click', function () { saveSettings(content); });
    loadSettings(content);
  }
  var settingsCache = {};
  // 内存草稿：各 tab 未保存的输入在此暂存，切换 tab 不丢失数据
  var settingsDraft = { site: {}, profile: {}, nav: [], footerNav: [], links: [] };
  async function loadSettings(content) {
    try { var d = await api('api/settings'); settingsCache = (d && d.settings) || {}; } catch (e) { settingsCache = {}; }
    // 同步到前台全局变量，确保前台渲染时读取到最新的站点设置
    window._siteSettings = settingsCache;
    syncDraftFromServer();
    writeAdminProfile(settingsDraft.profile);
    fillSettings(content);
  }
  /** 从服务端数据初始化草稿（仅首次或重置时调用，避免覆盖用户未保存的输入） */
  function syncDraftFromServer() {
    var s = settingsCache;
    var site = safeJson(s.site_info);
    var prof = safeJson(s.profile);
    settingsDraft.site = {
      name: site.name || (cfg().footer && cfg().footer.copyrightName) || '',
      desc: site.desc || '',
      avatar: site.avatar || '',
      copyright: site.copyright || (cfg().footer && cfg().footer.copyrightName) || '',
      footerText: site.footerText || (cfg().footer && cfg().footer.decl) || '',
      about: site.about || '',
      moderate: s.moderate_comments === '1'
    };
    settingsDraft.profile = {
      name: prof.name || '', bio: prof.bio || '', avatar: prof.avatar || '', email: prof.email || ''
    };
    settingsDraft.nav = parseArr(s.nav_menu, defaultNavItems());
    settingsDraft.footerNav = parseArr(s.footer_nav, defaultFooterNav());
    settingsDraft.links = parseArr(s.friend_links, defaultFriendLinks());
  }
  /** 默认顶部导航（与前台渲染兜底一致）：站点未自定义导航时作为基础项 */
  function defaultNavItems() {
    return [
      { i18n: 'nav.home',      text: t('nav.home'),      url: '/' },
      { i18n: 'nav.tags',      text: t('nav.tags'),      url: '/tags' },
      { i18n: 'nav.archive',   text: t('nav.archive'),   url: '/archive' },
      { i18n: 'nav.guestbook', text: t('nav.guestbook'), url: '/guestbook' },
      { i18n: 'nav.about',     text: t('nav.about'),     url: '/about' }
    ];
  }
  /** 默认底部导航：优先沿用 config.js footer.contact，方便老配置无缝衔接 */
  function defaultFooterNav() {
    var c = (cfg().footer && cfg().footer.contact) || [];
    if (Array.isArray(c)) return c.map(function (it) { return { text: it.text || '', url: it.url || '/' }; });
    return [];
  }
  /** 默认友情链接：优先沿用 config.js footer.links */
  function defaultFriendLinks() {
    var c = (cfg().footer && cfg().footer.links) || [];
    if (Array.isArray(c)) return c.map(function (it) { return { text: it.text || '', url: it.url || '/' }; });
    return [];
  }
  /** 把导航/链接字段解析为数组（兼容字符串 JSON / 对象 / 数组）；为空时回退默认项 */
  function parseArr(v, fallback) {
    if (Array.isArray(v) && v.length) return v;
    if (typeof v === 'string' && v.trim()) {
      try { var a = JSON.parse(v); if (Array.isArray(a) && a.length) return a; } catch (e) {}
    }
    return fallback;
  }
  // 从当前 DOM 把可见 tab 的输入保存进草稿（tab 切换/保存前调用，保证不丢数据）
  function saveTabToDraft(content) {
    if (content.querySelector('#abSiteName') !== null) {
      settingsDraft.site = {
        name: val(content, '#abSiteName'), desc: val(content, '#abSiteDesc'), avatar: val(content, '#abSiteAvatar'),
        copyright: val(content, '#abFooterCopyright'), footerText: val(content, '#abFooterText'),
        about: val(content, '#abSiteAbout'),
        moderate: content.querySelector('#abModerate') ? content.querySelector('#abModerate').checked : settingsDraft.site.moderate
      };
    }
    if (content.querySelector('#abProfileName') !== null) {
      settingsDraft.profile = {
        name: val(content, '#abProfileName'), bio: val(content, '#abProfileBio'),
        avatar: val(content, '#abProfileAvatar'), email: val(content, '#abProfileEmail')
      };
    }
    if (content.querySelector('#abNavVisual')) collectNavFromDom(content);
    if (content.querySelector('#abFooterNavVisual')) collectLinksFromDom(content, 'footerNav', '#abFooterNavVisual');
    if (content.querySelector('#abFriendsVisual')) collectLinksFromDom(content, 'links', '#abFriendsVisual');
  }
  /** 从顶部导航可视化 DOM 收集当前编辑结果到 settingsDraft.nav 并持久化草稿 */
  function collectNavFromDom(content) {
    var wrap = content.querySelector('#abNavVisual');
    if (!wrap) return;
    var newItems = [];
    wrap.querySelectorAll('.ab-nav-row').forEach(function (row) {
      if (row.classList.contains('child')) return; // 子项在父项中处理
      var idx = parseInt(row.querySelector('[data-idx]').getAttribute('data-idx'), 10);
      var text = (row.querySelector('.ab-nav-text') || {}).value || '';
      var url = (row.querySelector('.ab-nav-url') || {}).value || '';
      var children = [];
      wrap.querySelectorAll('.ab-nav-row.child[data-idx="' + idx + '"]').forEach(function (cr) {
        children.push({ text: (cr.querySelector('.ab-nav-text') || {}).value || '', url: (cr.querySelector('.ab-nav-url') || {}).value || '' });
      });
      var old = settingsDraft.nav[idx] || {};
      var item = { text: text, url: url };
      if (old.i18n) item.i18n = old.i18n;
      if (children.length) {
        item.children = children.map(function (c, ci) {
          var childOld = (old.children && old.children[ci]) || {};
          if (childOld.i18n) c.i18n = childOld.i18n;
          return c;
        });
      }
      newItems.push(item);
    });
    settingsDraft.nav = newItems;
    try { localStorage.setItem(navDraftKey(), JSON.stringify(settingsDraft.nav)); } catch (e) {}
  }
  /** 从底部导航/友情链接的可视化 DOM 收集当前编辑结果到草稿 */
  function collectLinksFromDom(content, key, sel) {
    var wrap = content.querySelector(sel);
    if (!wrap) return;
    var arr = [];
    wrap.querySelectorAll('.ab-link-row').forEach(function (row) {
      arr.push({
        text: (row.querySelector('.ab-link-text') || {}).value || '',
        url: (row.querySelector('.ab-link-url') || {}).value || ''
      });
    });
    settingsDraft[key] = arr;
  }
  function fillSettings(content) {
    var site = settingsDraft.site || {};
    var prof = settingsDraft.profile || {};
    if (content.querySelector('#abSiteName')) content.querySelector('#abSiteName').value = site.name || '';
    if (content.querySelector('#abSiteDesc')) content.querySelector('#abSiteDesc').value = site.desc || '';
    if (content.querySelector('#abSiteAvatar')) content.querySelector('#abSiteAvatar').value = site.avatar || '';
    if (content.querySelector('#abFooterCopyright')) content.querySelector('#abFooterCopyright').value = site.copyright || '';
    if (content.querySelector('#abFooterText')) content.querySelector('#abFooterText').value = site.footerText || '';
    if (content.querySelector('#abSiteAbout')) content.querySelector('#abSiteAbout').value = site.about || '';
    if (content.querySelector('#abModerate')) content.querySelector('#abModerate').checked = !!site.moderate;
    if (content.querySelector('#abProfileName')) content.querySelector('#abProfileName').value = prof.name || '';
    if (content.querySelector('#abProfileBio')) content.querySelector('#abProfileBio').value = prof.bio || '';
    if (content.querySelector('#abProfileAvatar')) content.querySelector('#abProfileAvatar').value = prof.avatar || '';
    if (content.querySelector('#abProfileEmail')) content.querySelector('#abProfileEmail').value = prof.email || '';
  }
  function safeJson(v) { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return {}; } }
  function renderSettingsTab(content, tab) {
    var body = content.querySelector('#abSettingsBody');
    if (tab === 'site') {
      body.innerHTML = '<div class="ab-card" style="max-width:620px">' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.siteName') + '</label><input class="ab-input" id="abSiteName"></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.siteDesc') + '</label><textarea class="ab-textarea" id="abSiteDesc" style="min-height:70px"></textarea></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.siteAvatar') + '</label><input class="ab-input" id="abSiteAvatar"></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.about') + '</label><label class="ab-hint" style="font-size:12px">' + t('admin.settings.aboutHint') + '</label><textarea class="ab-textarea" id="abSiteAbout" style="min-height:120px" placeholder="' + t('admin.settings.aboutPlaceholder') + '"></textarea></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.footerCopyright') + '</label><input class="ab-input" id="abFooterCopyright"></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.footerDecl') + '</label><textarea class="ab-textarea" id="abFooterText" style="min-height:70px"></textarea></div>' +
        '<div class="ab-field"><label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" id="abModerate"> ' + t('admin.settings.moderateComments') + '</label></div>' +
      '</div>';
    } else if (tab === 'profile') {
      body.innerHTML = '<div class="ab-card" style="max-width:620px">' +
        '<div class="ab-avatar-edit"><img class="ab-avatar-prev" id="abProfPrev" src=""><div><div class="ab-label" style="margin:0">' + t('admin.settings.profileAvatar') + '</div><div class="ab-hint">' + t('admin.settings.avatarUrl') + '</div></div></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.nickname') + '</label><input class="ab-input" id="abProfileName"></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.bio') + '</label><textarea class="ab-textarea" id="abProfileBio" style="min-height:70px"></textarea></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.avatarUrl') + '</label><input class="ab-input" id="abProfileAvatar"></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.email') + '</label><input class="ab-input" id="abProfileEmail"></div>' +
      '</div>';
      var pa = body.querySelector('#abProfileAvatar');
      var pv = body.querySelector('#abProfPrev');
      pa.addEventListener('input', function () { pv.src = pa.value; });
      setTimeout(function () { if (pa && pv) pv.src = pa.value; }, 0);
    } else if (tab === 'nav') {
      body.innerHTML = '<div class="ab-card" style="max-width:720px">' +
        '<div class="ab-section-title">' + icon('list', 15) + ' ' + t('admin.settings.visualEditor') + '</div>' +
        '<div class="ab-hint" style="margin-bottom:8px">' + t('admin.settings.navVisualHint') + '</div>' +
        '<div id="abNavVisual" class="ab-nav-editor"></div>' +
      '</div>';
      renderNavVisual(content);
    } else if (tab === 'footerNav') {
      body.innerHTML = '<div class="ab-card" style="max-width:720px">' +
        '<div class="ab-section-title">' + icon('list', 15) + ' ' + t('admin.settings.footerNav') + '</div>' +
        '<div class="ab-hint" style="margin-bottom:8px">' + t('admin.settings.footerNavHint') + '</div>' +
        '<div id="abFooterNavVisual" class="ab-nav-editor"></div>' +
      '</div>';
      renderLinkVisual(content, 'footerNav', '#abFooterNavVisual');
    } else if (tab === 'friends') {
      body.innerHTML = '<div class="ab-card" style="max-width:720px">' +
        '<div class="ab-section-title">' + icon('heart', 15) + ' ' + t('admin.settings.friendLinks') + '</div>' +
        '<div class="ab-hint" style="margin-bottom:8px">' + t('admin.settings.friendLinksHint') + '</div>' +
        '<div id="abFriendsVisual" class="ab-nav-editor"></div>' +
      '</div>';
      renderLinkVisual(content, 'links', '#abFriendsVisual');
    }
    fillSettings(content);
  }
  /** 通用链接可视化编辑器：底部导航 / 友情链接共用 */
  function renderLinkVisual(content, key, sel) {
    var wrap = content.querySelector(sel);
    if (!wrap) return;
    var items = settingsDraft[key];
    if (!Array.isArray(items)) items = [];
    settingsDraft[key] = items;
    wrap.innerHTML = (items.length ? '<div class="ab-link-list">' + items.map(function (it, i) {
      return '<div class="ab-link-row">' +
        '<input class="ab-input ab-link-text" value="' + esc(it.text || '') + '" placeholder="' + t('admin.settings.linkText') + '">' +
        '<input class="ab-input ab-link-url" value="' + esc(it.url || '') + '" placeholder="' + t('admin.settings.linkUrl') + '">' +
        '<button class="ab-btn-icon danger" data-rmlink="' + i + '" title="' + t('admin.comments.delete') + '">' + icon('trash', 14) + '</button>' +
      '</div>';
    }).join('') + '</div>' : '<div class="ab-hint">' + t('admin.settings.linkEmpty') + '</div>');
    wrap.innerHTML += '<div class="ab-nav-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="ab-btn sm" id="abLinkAdd">' + icon('plus', 13) + ' ' + t('admin.settings.linkAdd') + '</button>' +
    '</div>';
    function persist() { try { localStorage.setItem('qingyu.linksDraft.' + key, JSON.stringify(settingsDraft[key])); } catch (e) {} }
    wrap.querySelectorAll('input').forEach(function (inp) { inp.addEventListener('input', debounce(function () { collectLinksFromDom(content, key, sel); }, 250)); });
    wrap.querySelector('#abLinkAdd').addEventListener('click', function () {
      settingsDraft[key].push({ text: t('admin.settings.linkText'), url: '/' });
      persist();
      renderLinkVisual(content, key, sel);
    });
    wrap.querySelectorAll('[data-rmlink]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-rmlink'), 10);
        settingsDraft[key].splice(idx, 1);
        persist();
        renderLinkVisual(content, key, sel);
      });
    });
  }
  async function saveSettings(content) {
    // 先把当前可见 tab 的输入并入草稿，确保跨 tab 的数据都不遗漏
    saveTabToDraft(content);
    var site = settingsDraft.site || {};
    var prof = settingsDraft.profile || {};
    var payload = {
      site_info: {
        name: site.name || '', desc: site.desc || '', avatar: site.avatar || '',
        copyright: site.copyright || '', footerText: site.footerText || '', about: site.about || ''
      },
      profile: {
        name: prof.name || '', bio: prof.bio || '', avatar: prof.avatar || '', email: prof.email || ''
      },
      nav_menu: JSON.stringify(Array.isArray(settingsDraft.nav) ? settingsDraft.nav : []),
      footer_nav: JSON.stringify(Array.isArray(settingsDraft.footerNav) ? settingsDraft.footerNav : []),
      friend_links: JSON.stringify(Array.isArray(settingsDraft.links) ? settingsDraft.links : []),
      moderate_comments: site.moderate ? '1' : '0'
    };
    try {
      await api('api/settings', { method: 'PUT', body: JSON.stringify(payload) });
      try { localStorage.removeItem(navDraftKey()); } catch (e) {}
      settingsCache = Object.assign({}, settingsCache, {
        site_info: JSON.stringify(payload.site_info), profile: JSON.stringify(payload.profile),
        nav_menu: payload.nav_menu, footer_nav: payload.footer_nav, friend_links: payload.friend_links,
        moderate_comments: payload.moderate_comments
      });
      // 同步到前台全局变量，使站点名称/导航/页脚/友链等设置立即生效（无需刷新整页）
      window._siteSettings = settingsCache;
      writeAdminProfile(payload.profile);
      toast(t('admin.settings.saved'), 'ok');
    } catch (e) { toast(t('admin.settings.saveFail') + (e.message || e), 'err'); }
  }
  function val(content, sel) { var el = content.querySelector(sel); return el ? el.value : ''; }

  /* ---------- 可视化导航编辑器 ----------
   * 直接读写内存 settingsDraft.nav 数组，无需 JSON 中转，保存时由 saveSettings 统一取用。
   * 保留 localStorage 临时草稿，刷新/切页不丢失未保存的导航编辑。 */
  function navDraftKey() { return 'qingyu.settingsNavDraft'; }
  function loadNavDraft() {
    try { var v = JSON.parse(localStorage.getItem(navDraftKey()) || 'null'); if (Array.isArray(v)) return v; } catch (e) {}
    return null;
  }
  function renderNavVisual(content) {
    var wrap = content.querySelector('#abNavVisual');
    if (!wrap) return;
    var saved = loadNavDraft();
    var items = saved ? saved : settingsDraft.nav;
    if (!Array.isArray(items) || !items.length) items = defaultNavItems();
    settingsDraft.nav = items;

    wrap.innerHTML = (items.length ? '<div class="ab-nav-list">' + items.map(function (it, i) {
      var children = (it.children || []).map(function (ch, ci) {
        return '<div class="ab-nav-row child">' +
          '<span class="ab-nav-ico">└</span>' +
          '<input class="ab-input ab-nav-text" data-idx="' + i + '" data-cidx="' + ci + '" value="' + esc(ch.text || '') + '" placeholder="' + t('admin.settings.subMenu') + '">' +
          '<input class="ab-input ab-nav-url" data-idx="' + i + '" data-cidx="' + ci + '" value="' + esc(ch.url || '') + '" placeholder="/path">' +
          '<button class="ab-btn-icon danger" data-rmchild="' + i + '-' + ci + '" title="' + t('admin.comments.delete') + '">' + icon('trash', 14) + '</button>' +
        '</div>';
      }).join('');
      return '<div class="ab-nav-row">' +
        '<span class="ab-nav-ico">' + icon('list', 14) + '</span>' +
        '<input class="ab-input ab-nav-text" data-idx="' + i + '" value="' + esc(it.text || '') + '" placeholder="' + t('admin.settings.newMenu') + '">' +
        '<input class="ab-input ab-nav-url" data-idx="' + i + '" value="' + esc(it.url || '') + '" placeholder="/path">' +
        '<button class="ab-btn-icon" data-addchild="' + i + '" title="' + t('admin.settings.subMenu') + '">' + icon('plus', 14) + '</button>' +
        '<button class="ab-btn-icon danger" data-rmitem="' + i + '" title="' + t('admin.comments.delete') + '">' + icon('trash', 14) + '</button>' +
      '</div>' + children;
    }).join('') + '</div>' : '<div class="ab-hint">' + t('admin.settings.navEmpty') + '</div>');

    wrap.innerHTML += '<div class="ab-nav-actions" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="ab-btn sm" id="abNavAddItem">' + icon('plus', 13) + ' ' + t('admin.settings.addMenuItem') + '</button>' +
      '<button class="ab-btn sm ghost" id="abNavReset">' + icon('refresh', 13) + ' ' + t('admin.settings.resetDefault') + '</button>' +
    '</div>';

    function persist() { try { localStorage.setItem(navDraftKey(), JSON.stringify(settingsDraft.nav)); } catch (e) {} }

    wrap.querySelectorAll('input').forEach(function (inp) { inp.addEventListener('input', debounce(function () { collectNavFromDom(content); }, 250)); });

    wrap.querySelector('#abNavAddItem').addEventListener('click', function () {
      settingsDraft.nav.push({ text: t('admin.settings.newMenu'), url: '/' });
      persist();
      renderNavVisual(content);
    });

    var resetBtn = wrap.querySelector('#abNavReset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      settingsDraft.nav = defaultNavItems();
      persist();
      renderNavVisual(content);
    });

    wrap.querySelectorAll('[data-addchild]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-addchild'), 10);
        if (!settingsDraft.nav[idx]) return;
        if (!settingsDraft.nav[idx].children) settingsDraft.nav[idx].children = [];
        settingsDraft.nav[idx].children.push({ text: t('admin.settings.subMenu'), url: '/' });
        persist();
        renderNavVisual(content);
      });
    });

    wrap.querySelectorAll('[data-rmitem]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-rmitem'), 10);
        settingsDraft.nav.splice(idx, 1);
        persist();
        renderNavVisual(content);
      });
    });

    wrap.querySelectorAll('[data-rmchild]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var parts = btn.getAttribute('data-rmchild').split('-');
        var idx = parseInt(parts[0], 10), cidx = parseInt(parts[1], 10);
        if (settingsDraft.nav[idx] && settingsDraft.nav[idx].children) settingsDraft.nav[idx].children.splice(cidx, 1);
        persist();
        renderNavVisual(content);
      });
    });
  }


  /* ====================== 修改密码 ====================== */
  function openPasswordModal(onSuccess) {
    var mask = document.createElement('div');
    mask.className = 'ab-modal-mask';
    mask.innerHTML = '<div class="ab-modal"><h3>' + t('admin.pwdModal.title') + '</h3>' +
      '<div class="ab-field" style="margin-bottom:12px"><label class="ab-label">' + t('admin.pwdModal.confirmPwd') + '</label><input class="ab-input" id="abCurPwd" type="password"></div>' +
      '<div class="ab-field" style="margin-bottom:12px"><label class="ab-label">' + t('admin.pwdModal.newPwd') + '</label><input class="ab-input" id="abNewPwd" type="password"></div>' +
      '<div class="ab-modal-actions"><button class="ab-btn ghost" data-act="cancel">' + t('confirm.cancel') + '</button><button class="ab-btn primary" id="abDoPwd">' + t('admin.pwdModal.change') + '</button></div></div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask || e.target.getAttribute('data-act') === 'cancel') mask.remove(); });
    mask.querySelector('#abDoPwd').addEventListener('click', async function () {
      var cur = mask.querySelector('#abCurPwd').value, pwd = mask.querySelector('#abNewPwd').value;
      if (!cur || !pwd) { toast(t('admin.pwdRequired'), 'err'); return; }
      if (pwd.length < 6) { toast(t('admin.pwdModal.tooShort'), 'err'); return; }
      try {
        await api('api/admin/password', { method: 'POST', body: JSON.stringify({ current: cur, password: pwd }) });
        toast(t('admin.pwdModal.success'), 'ok');
        mask.remove();
        if (cloudOn()) window.cloudLogout && window.cloudLogout();
        if (onSuccess) onSuccess(); else go('/admin');
      } catch (e) { toast(t('admin.pwdModal.fail') + (e.message || e), 'err'); }
    });
  }

  /* ----------------------- 导出 ----------------------- */
  window.QingyuAdmin = { mount: mount, openPwdModal: openPasswordModal };

  /* app.js 先于本脚本执行时，初次 route() 因 QingyuAdmin 尚未定义而走了旧后台渲染。
   * 本脚本加载完成后，若当前已在后台路由，重新分发一次路由以挂载新版后台 UI。 */
  try {
    var _p = (typeof window.currentRoute === 'function') ? window.currentRoute().path : (location.pathname || '/');
    if (_p === '/write' || _p === '/admin' || _p.indexOf('/admin/') === 0 || /^\/posts\/[^\/]+\/edit$/.test(_p) || _p === '/posts/edit') {
      if (typeof window.route === 'function') window.route();
    }
  } catch (e) {}
})();
