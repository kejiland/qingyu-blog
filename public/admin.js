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
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtPostDate(s) {
    var raw = String(s || '').trim();
    var m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (!m) return raw;
    return m[1] + (m[2] ? ' ' + (m[2].length === 1 ? '0' + m[2] : m[2]) + ':' + m[3] : '');
  }
  function localDateTimeValue(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T'
      + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function toDateTimeLocal(v) {
    var s = String(v || '').trim();
    if (/^\d{12,}$/.test(s)) {
      var d = new Date(Number(s));
      if (!isNaN(d.getTime())) return localDateTimeValue(d);
    }
    var m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
    if (m) return m[1] + 'T' + (m[2] ? (m[2].length === 1 ? '0' + m[2] : m[2]) + ':' + m[3] : '00:00');
    return s;
  }
  function dateTimeLocalToMs(v) {
    var s = String(v || '').trim();
    if (!s) return null;
    var ms = Date.parse(s);
    return isNaN(ms) ? null : ms;
  }
  function fmtTimestamp(ms) {
    var n = Number(ms) || 0;
    if (!n) return '';
    return localDateTimeValue(new Date(n)).replace('T', ' ');
  }
  function normalizeEditorDate(v) {
    var s = String(v || '').trim().replace('T', ' ');
    return s || localDateTimeValue(new Date()).replace('T', ' ');
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
      // all=1 需管理员会话：附带草稿；公开的 api/posts 仍只返回已发布文章。
      try {
        var d = await api('api/posts?all=1&_=' + Date.now());
        return mergeOfflinePosts((d && d.posts) || []);
      } catch (e) {
        if (isNetworkFailure(e)) return readOfflineQueue().map(function (item) { return item.post; });
        throw e;
      }
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
  async function listFullPosts() {
    if (cloudOn()) {
      // full=1 仅管理员可用：一次返回草稿 + 正文，避免批量导出逐篇请求。
      try {
        var d = await api('api/posts?full=1&_=' + Date.now());
        return mergeOfflinePosts((d && d.posts) || []);
      } catch (e) {
        if (isNetworkFailure(e)) return readOfflineQueue().map(function (item) { return item.post; });
        throw e;
      }
    }
    return await listPosts();
  }
  async function getPost(id) {
    if (cloudOn()) {
      try {
        var d = await api('api/posts/' + encodeURIComponent(id) + '?_=' + Date.now());
        if (d && d.post) return d.post;
      } catch (e) {}
      var queued = readOfflineQueue().find(function (item) { return String(item.post.id) === String(id); });
      return queued ? queued.post : null;
    }
    var all = await listPosts();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function saveStaticPost(post, reason) {
    var drafts = [];
    try { drafts = JSON.parse(localStorage.getItem('qingyu.drafts') || '[]'); } catch (e) {}
    var idx = -1;
    for (var i = 0; i < drafts.length; i++) if (drafts[i] && drafts[i].id === post.id) idx = i;
    var item = { id: post.id, title: post.title, date: post.date, tags: post.tags || [], excerpt: post.excerpt || '',
      cover: post.cover || '', ogImage: post.ogImage || '', category: post.category || '', series: post.series || '', seriesOrder: Number(post.seriesOrder) || 0, status: post.status || 'published',
      pinned: !!post.pinned, protected: !!post.protected, enc: post.protected ? (post.enc || null) : null,
      publishAt: post.publishAt || null, content: post.content || '' };
    if (idx >= 0) drafts[idx] = item; else drafts.push(item);
    localStorage.setItem('qingyu.drafts', JSON.stringify(drafts));
    saveStaticRevision(item, reason || 'save');
  }
  var OFFLINE_POSTS_KEY = 'qingyu.offlinePosts';
  function readOfflineQueue() {
    try {
      var list = JSON.parse(localStorage.getItem(OFFLINE_POSTS_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (item) { return item && item.post && item.post.id; }) : [];
    } catch (e) { return []; }
  }
  function writeOfflineQueue(list) {
    try {
      var safe = (Array.isArray(list) ? list : []).slice(-30);
      if (safe.length) localStorage.setItem(OFFLINE_POSTS_KEY, JSON.stringify(safe));
      else localStorage.removeItem(OFFLINE_POSTS_KEY);
    } catch (e) {}
  }
  function isNetworkFailure(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    var status = Number(err && err.status) || 0;
    if (status === 0 || status >= 500) return true;
    return /Failed to fetch|NetworkError|Load failed|network|abort|timed out|HTTP 0/i.test(String((err && err.message) || err || ''));
  }
  function queueOfflinePost(post, isNew) {
    var list = readOfflineQueue().filter(function (item) { return String(item.post.id) !== String(post.id); });
    list.push({ post: post, isNew: !!isNew, queuedAt: Date.now() });
    writeOfflineQueue(list);
    saveStaticPost(post, 'offline');
    try { window.dispatchEvent(new CustomEvent('qy:offline-queue', { detail: { count: list.length } })); } catch (e) {}
    return list.length;
  }
  function mergeOfflinePosts(serverPosts) {
    var map = {};
    (Array.isArray(serverPosts) ? serverPosts : []).forEach(function (post) {
      if (post && post.id) map[String(post.id)] = post;
    });
    readOfflineQueue().forEach(function (item) {
      if (item && item.post && item.post.id) map[String(item.post.id)] = item.post;
    });
    return Object.keys(map).map(function (key) { return map[key]; });
  }
  async function flushOfflineQueue(silent) {
    if (!cloudOn() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { synced: 0, remaining: readOfflineQueue().length };
    var queue = readOfflineQueue();
    if (!queue.length) return { synced: 0, remaining: 0 };
    var remaining = [];
    var synced = 0;
    for (var i = 0; i < queue.length; i++) {
      var item = queue[i];
      try {
        var r = await savePost(item.post, item.isNew);
        if (!r || (!r.ok && !r.post)) throw new Error(t('admin.editor.saveFail'));
        synced++;
      } catch (e) {
        if (item.isNew && Number(e && e.status) === 409) {
          synced++;
          continue;
        }
        remaining.push(item);
        if (isNetworkFailure(e)) {
          remaining = remaining.concat(queue.slice(i + 1));
          break;
        }
      }
    }
    writeOfflineQueue(remaining);
    if (synced && !silent) toast(t('admin.editor.syncedOffline'), 'ok');
    return { synced: synced, remaining: remaining.length };
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
  function staticRevisionKey(id) { return 'qingyu.revisions.' + String(id || ''); }
  function readStaticRevisions(id) {
    try {
      var arr = JSON.parse(localStorage.getItem(staticRevisionKey(id)) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveStaticRevision(post, reason) {
    if (!post || !post.id) return;
    var list = readStaticRevisions(post.id);
    var snapshot = Object.assign({}, post, {
      revisionId: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      reason: reason || 'save',
      createdAt: Date.now()
    });
    var fingerprint = JSON.stringify([post.title, post.date, post.excerpt, post.content, post.cover, post.pinned, post.tags, post.status, post.publishAt]);
    var last = list[0];
    var lastFingerprint = last ? JSON.stringify([last.title, last.date, last.excerpt, last.content, last.cover, last.pinned, last.tags, last.status, last.publishAt]) : '';
    if (lastFingerprint !== fingerprint) list.unshift(snapshot);
    localStorage.setItem(staticRevisionKey(post.id), JSON.stringify(list.slice(0, 50)));
  }
  function revisionPostId(rev) { return rev && (rev.postId || rev.post_id || rev.id || ''); }
  async function listPostRevisions(id) {
    if (cloudOn()) {
      var d = await api('api/posts/' + enc(id) + '/revisions');
      return (d && d.revisions) || [];
    }
    return readStaticRevisions(id);
  }
  async function getPostRevision(id, revisionId) {
    if (cloudOn()) {
      var d = await api('api/posts/' + enc(id) + '/revisions/' + enc(revisionId));
      return d && d.revision;
    }
    var list = readStaticRevisions(id);
    return list.filter(function (r) { return String(r.revisionId) === String(revisionId); })[0] || null;
  }
  async function restorePostRevision(id, revisionId) {
    if (cloudOn()) {
      return await api('api/posts/' + enc(id) + '/revisions/' + enc(revisionId) + '/restore', { method: 'POST', body: '{}' });
    }
    var rev = await getPostRevision(id, revisionId);
    if (!rev) return null;
    var post = Object.assign({}, rev, { id: id });
    delete post.revisionId;
    delete post.createdAt;
    delete post.reason;
    saveStaticPost(post, 'restore');
    if (Array.isArray(window.BLOG_POSTS)) {
      var idx = -1;
      for (var i = 0; i < window.BLOG_POSTS.length; i++) if (window.BLOG_POSTS[i] && window.BLOG_POSTS[i].id === id) { idx = i; break; }
      if (idx >= 0) window.BLOG_POSTS[idx] = Object.assign({}, window.BLOG_POSTS[idx], post);
      else window.BLOG_POSTS.push(post);
    }
    return { ok: true, post: post };
  }
  function revisionReasonLabel(reason) {
    if (reason === 'create') return t('admin.revisions.reasonCreate');
    if (reason === 'restore') return t('admin.revisions.reasonRestore');
    return t('admin.revisions.reasonUpdate');
  }
  function lineDiff(oldText, newText) {
    var oldLines = String(oldText || '').split(/\r?\n/);
    var newLines = String(newText || '').split(/\r?\n/);
    var n = oldLines.length, m = newLines.length;
    if (n * m > 300000) {
      return newLines.map(function (line) { return '+ ' + line; }).join('\n');
    }
    var dp = Array(n + 1);
    for (var i = 0; i <= n; i++) { dp[i] = new Uint16Array(m + 1); }
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    var out = [], x = 0, y = 0;
    while (x < n && y < m) {
      if (oldLines[x] === newLines[y]) { out.push('  ' + newLines[y]); x++; y++; }
      else if (dp[x + 1][y] >= dp[x][y + 1]) { out.push('- ' + oldLines[x]); x++; }
      else { out.push('+ ' + newLines[y]); y++; }
    }
    while (x < n) out.push('- ' + oldLines[x++]);
    while (y < m) out.push('+ ' + newLines[y++]);
    return out.join('\n');
  }
  async function openRevisionHistory(content, route) {
    if (!route.id) { toast(t('admin.revisions.newHint'), 'err'); return; }
    var mask = document.createElement('div');
    mask.className = 'ab-modal-mask';
    mask.innerHTML = '<div class="ab-modal" style="max-width:980px;width:min(96vw,980px)"><h3>' + t('admin.revisions.title') + '</h3>' +
      '<div style="display:grid;grid-template-columns:240px minmax(0,1fr);gap:12px;min-height:420px;max-height:70vh">' +
      '<div id="abRevList" style="overflow:auto;border-right:1px solid var(--ab-border);padding-right:10px"><span class="ab-spin"></span></div>' +
      '<div id="abRevDetail" style="overflow:auto"><p class="ab-muted">' + t('admin.revisions.pick') + '</p></div></div>' +
      '<div class="ab-modal-actions"><button class="ab-btn ghost" data-act="cancel">' + t('confirm.cancel') + '</button></div></div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask || e.target.getAttribute('data-act') === 'cancel') mask.remove(); });
    var listEl = mask.querySelector('#abRevList');
    var detailEl = mask.querySelector('#abRevDetail');
    try {
      var revisions = await listPostRevisions(route.id);
      if (!revisions.length) {
        listEl.innerHTML = '<p class="ab-muted">' + t('admin.revisions.empty') + '</p>';
        return;
      }
      listEl.innerHTML = revisions.map(function (r) {
        return '<button type="button" class="ab-nav-item" data-rev="' + esc(String(r.id || r.revisionId)) + '" style="width:100%;text-align:left;margin-bottom:6px"><b>' + esc(fmtTimestamp(r.createdAt)) + '</b><br><span class="ab-muted">' + esc(revisionReasonLabel(r.reason)) + '</span></button>';
      }).join('');
      async function showRevision(revId) {
        detailEl.innerHTML = '<span class="ab-spin"></span> ' + t('admin.revisions.loading');
        try {
          var rev = await getPostRevision(route.id, revId);
          if (!rev) { detailEl.innerHTML = '<p class="ab-muted">' + t('admin.revisions.notFound') + '</p>'; return; }
          var current = { title: content.querySelector('#abTitle').value, content: content.querySelector('#abBody').value };
          var diff = lineDiff(rev.content || '', current.content || '');
          detailEl.innerHTML = '<div class="ab-card" style="padding:12px;margin:0 0 12px"><b>' + esc(rev.title || t('admin.postList.noTitle')) + '</b><div class="ab-muted" style="font-size:12px;margin-top:6px">' + esc(fmtTimestamp(rev.createdAt)) + ' · ' + esc(revisionReasonLabel(rev.reason)) + '</div><div style="margin-top:12px"><button class="ab-btn primary sm" id="abRevRestore">' + icon('refresh', 13) + ' ' + t('admin.revisions.restore') + '</button></div></div>' +
            '<div style="font-size:12px;margin-bottom:6px" class="ab-muted">' + t('admin.revisions.diff') + '</div><pre style="white-space:pre-wrap;word-break:break-word;background:var(--ab-hover);padding:12px;border-radius:8px;max-height:46vh;overflow:auto">' + esc(diff) + '</pre>';
          detailEl.querySelector('#abRevRestore').addEventListener('click', function () {
            confirmModal(t('admin.revisions.restore'), '<p class="ab-muted">' + t('admin.revisions.restoreConfirm') + '</p>', async function () {
              try {
                var result = await restorePostRevision(route.id, revId);
                if (!result || !result.ok) throw new Error(t('admin.revisions.restoreFail'));
                toast(t('admin.revisions.restored'), 'ok');
                mask.remove();
                await loadEditor(content, route.id);
              } catch (e) { toast(t('admin.revisions.restoreFail') + (e.message || e), 'err'); }
            }, t('admin.revisions.restore'));
          });
        } catch (e) { detailEl.innerHTML = '<p class="ab-muted">' + t('admin.revisions.loadFail') + esc(e.message || e) + '</p>'; }
      }
      listEl.querySelectorAll('[data-rev]').forEach(function (btn) {
        btn.addEventListener('click', function () { showRevision(btn.getAttribute('data-rev')); });
      });
      showRevision(String(revisions[0].id || revisions[0].revisionId));
    } catch (e) {
      listEl.innerHTML = '<p class="ab-muted">' + t('admin.revisions.loadFail') + esc(e.message || e) + '</p>';
    }
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
        '<button type="button" class="ab-gate-link" id="abBtnBreakGlass">' + t('admin.breakGlassLink') + '</button>' +
        '<div id="abGateKeyWrap" style="display:none">' +
        '<p class="ab-hint">' + t('admin.breakGlassHint') + '</p>' +
        '<input class="ab-input" type="password" id="abGateKey" placeholder="' + t('admin.breakGlassKeyLabel') + '" autocomplete="off">' +
        '</div>' +
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
    // 应急通道（云端）：被登录限流挡住时，可填入安装密钥立即登录（服务端只跳过限流，不跳过密码校验）
    var glassToggle = root.querySelector('#abBtnBreakGlass');
    var glassWrap = root.querySelector('#abGateKeyWrap');
    var glassKey = root.querySelector('#abGateKey');
    function showGlass(show) {
      if (!glassWrap) return;
      glassWrap.style.display = show ? 'block' : 'none';
      if (glassToggle) glassToggle.style.display = show ? 'none' : '';
      if (show && glassKey) { try { glassKey.focus(); } catch (e) {} }
    }
    if (glassToggle) glassToggle.addEventListener('click', function () { showGlass(true); });
    async function submit() {
      var pwd = inp.value || '';
      if (!pwd) { toast(t('admin.pwdRequired'), 'err'); return; }
      btn.disabled = true;
      try {
        if (cloudOn()) {
          var r = await window.cloudLogin(pwd, glassKey ? glassKey.value : '');
          if (r && r.ok) {
            if (r.mustChange) {
              // 首次部署自动初始化：弹出清晰的默认密码提示框，供查看/复制后改密（不再一闪而过）
              if (window.showFirstLoginPwd) window.showFirstLoginPwd(r.defaultPassword || '');
              else { toast(t('admin.logging'), 'ok'); go('/admin'); }
            } else {
              toast(t('admin.logging'), 'ok'); go('/admin');
            }
          }
          else {
            // 429 = 触发登录限流：自动展开安装密钥入口，给出可立即进入的路径
            if (r && r.status === 429) { showGlass(true); toast(t('admin.gateThrottled'), 'err'); }
            else toast((r && r.message) || t('admin.wrongPwd'), 'err');
            btn.disabled = false;
          }
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
    if (glassKey) glassKey.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
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
        { key: 'analytics', label: t('admin.sidebar.analytics'), icon: 'gauge', href: '/admin/analytics' },
        { key: 'write', label: t('admin.sidebar.writeNew'), icon: 'pen', href: '/admin/posts/new' },
        { key: 'tags', label: t('admin.sidebar.tagManage'), icon: 'tag', href: '/admin/tags' },
        { key: 'series', label: t('admin.sidebar.seriesManage'), icon: 'list', href: '/admin/series' }
      ] },
      { group: t('admin.sidebar.commentManage'), items: [
        { key: 'comments', label: t('admin.sidebar.allComments'), icon: 'quote', href: '/admin/comments' },
        { key: 'comments-pending', label: t('admin.sidebar.pendingComments'), icon: 'clock', href: '/admin/comments/pending', badge: 'pending' }
      ] },
      { group: t('admin.sidebar.contentSettings'), items: [
        { key: 'media', label: t('admin.sidebar.media'), icon: 'image', href: '/admin/media' },
        { key: 'music', label: t('admin.sidebar.musicManage'), icon: 'music', href: '/admin/music' },
        { key: 'subscribers', label: t('admin.sidebar.subscribers'), icon: 'send', href: '/admin/subscribers' },
        { key: 'backup', label: t('admin.sidebar.backups'), icon: 'save', href: '/admin/backups' },
        { key: 'transfer', label: t('admin.sidebar.importExport'), icon: 'download', href: '/admin/import-export' },
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
    if (path === '/admin/analytics') return { key: 'analytics', page: 'analytics' };
    if (path === '/admin/tags') return { key: 'tags', page: 'tags' };
    if (path === '/admin/series') return { key: 'series', page: 'series' };
    if (path === '/admin/comments') return { key: 'comments', page: 'comments', filter: 'all' };
    if (path === '/admin/comments/pending') return { key: 'comments-pending', page: 'comments', filter: 'pending' };
    if (path === '/admin/media') return { key: 'media', page: 'media' };
    if (path === '/admin/music') return { key: 'music', page: 'music' };
    if (path === '/admin/subscribers') return { key: 'subscribers', page: 'subscribers' };
    if (path === '/admin/backups') return { key: 'backup', page: 'backup' };
    if (path === '/admin/import-export') return { key: 'transfer', page: 'transfer' };
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
    if (route.page === 'analytics') return pageAnalytics(content);
    if (route.page === 'analytics') return pageAnalytics(content);
    if (route.page === 'editor') return pageEditor(content, route);
    if (route.page === 'tags') return pageTags(content);
    if (route.page === 'series') return pageSeries(content);
    if (route.page === 'comments') return pageComments(content, route.filter);
    if (route.page === 'media') return pageMedia(content);
    if (route.page === 'music') return pageMusic(content);
    if (route.page === 'subscribers') return pageSubscribers(content);
    if (route.page === 'backup') return pageBackups(content);
    if (route.page === 'transfer') return pageImportExport(content);
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
    var published = posts.filter(function (p) { return (p.status || 'published') === 'published'; }).length;
    var drafts = posts.filter(function (p) { return (p.status || 'published') === 'draft'; }).length;
    var scheduled = posts.filter(function (p) { return (p.status || 'published') === 'scheduled'; }).length;

    var commentsAll = [], pending = 0;
    if (cloudOn()) {
      try { var cd = await api('api/comments?status=all'); commentsAll = (cd && cd.comments) || []; } catch (e) {}
      pending = commentsAll.filter(function (c) { return (c.status || 'approved') === 'pending'; }).length;
    }

    var pinnedCount = posts.filter(function (p) { return !!p.pinned; }).length;
    var stats = [
      { label: t('admin.dashboard.totalPosts'), value: total, icon: 'doc' },
      { label: t('admin.dashboard.published'), value: published, icon: 'check' },
      { label: t('admin.dashboard.scheduled'), value: scheduled, icon: 'clock' },
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

  /* ====================== 文章数据分析 ====================== */
  function localPostAnalytics(posts) {
    var items = (posts || []).map(function (p) {
      var views = 0, likes = 0, comments = 0;
      try {
        var raw = localStorage.getItem('qingyu.stats.' + p.id);
        if (raw) { var st = JSON.parse(raw); views = Number(st.views) || 0; likes = Number(st.likes) || 0; }
      } catch (e) {}
      try {
        var cr = localStorage.getItem('qingyu.comments.' + p.id);
        if (cr) { var arr = JSON.parse(cr); comments = Array.isArray(arr) ? arr.length : 0; }
      } catch (e) {}
      return Object.assign({}, p, { views: views, likes: likes, comments: comments, score: views + likes * 3 + comments * 5 });
    });
    items.sort(function (a, b) { return b.score - a.score || b.views - a.views; });
    var summary = items.reduce(function (a, p) { a.views += p.views; a.likes += p.likes; a.comments += p.comments; return a; }, { views: 0, likes: 0, comments: 0, posts: items.length });
    return { summary: summary, items: items };
  }
  function renderAnalyticsSummary(summary, items) {
    var box = document.querySelector('#abAnalyticsSummary');
    if (!box) return;
    var top = items && items[0];
    var cards = [
      { label: t('admin.analytics.totalViews'), value: Number(summary && summary.views) || 0, icon: 'eye' },
      { label: t('admin.analytics.totalLikes'), value: Number(summary && summary.likes) || 0, icon: 'heart' },
      { label: t('admin.analytics.totalComments'), value: Number(summary && summary.comments) || 0, icon: 'quote' },
      { label: t('admin.analytics.topPost'), value: top ? (top.title || t('admin.dashboard.noTitle')) : '—', icon: 'gauge', small: true }
    ];
    box.innerHTML = cards.map(function (c) {
      return '<div class="ab-stat"><span class="ab-stat-ico">' + icon(c.icon, 17) + '</span><span class="ab-stat-num' + (c.small ? ' small' : '') + '">' + esc(String(c.value)) + '</span><span class="ab-stat-label">' + esc(c.label) + '</span></div>';
    }).join('');
  }
  function analyticsSparkline(trend) {
    var points = Array.isArray(trend) ? trend : [];
    if (points.length < 2) return '<span class="ab-muted">—</span>';
    var values = points.map(function (p) { return Number(p.views) || 0; });
    var max = Math.max.apply(Math, values.concat([1]));
    var w = 96, h = 26;
    var coords = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * w;
      var y = h - (v / max) * (h - 4) - 2;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg class="ab-sparkline" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + coords + '"></polyline></svg>';
  }
  function exportAnalyticsCsv(content) {
    var items = (content && content.__analyticsItems) || [];
    if (!items.length) return;
    var header = ['id', 'title', 'status', 'date', 'views', 'likes', 'comments', 'score'];
    var lines = [header.join(',')];
    items.forEach(function (p) {
      lines.push(header.map(function (key) {
        var val = p[key] == null ? '' : String(p[key]);
        return '"' + val.replace(/"/g, '""') + '"';
      }).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'post-analytics-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.remove) a.remove(); }, 0);
    toast(t('admin.analytics.exported'), 'ok');
  }
  function renderAnalyticsTable(items) {
    var body = document.querySelector('#abAnalyticsBody');
    if (!body) return;
    if (!items || !items.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.analytics.empty') + '</td></tr>';
      return;
    }
    body.innerHTML = items.map(function (p) {
      var status = p.status === 'draft' ? t('admin.dashboard.drafts') : (p.status === 'scheduled' ? t('admin.dashboard.scheduled') : '');
      return '<tr><td><a class="ab-post-title" data-link="/admin/posts/' + enc(p.id) + '/edit">' + esc(p.title || t('admin.dashboard.noTitle')) + '</a>' + (status ? ' <span class="ab-chip">' + esc(status) + '</span>' : '') + '</td>'
        + '<td>' + (Number(p.views) || 0) + '</td><td>' + (Number(p.likes) || 0) + '</td><td>' + (Number(p.comments) || 0) + '</td><td><b class="ab-analytics-score">' + (Number(p.score) || 0) + '</b></td><td class="ab-td-trend">' + analyticsSparkline(p.trend) + '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-link]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('data-link')); });
    });
  }
  async function loadAnalytics(content, range) {
    var body = content.querySelector('#abAnalyticsBody');
    if (body) body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('admin.postList.loading') + '</td></tr>';
    var data = null;
    if (cloudOn()) {
      try { data = await api('api/admin/post-analytics?range=' + encodeURIComponent(range || 'all')); } catch (e) {}
    }
    if (!data) {
      try { data = localPostAnalytics(await listPosts()); } catch (e) { data = { summary: {}, items: [] }; }
    }
    content.__analyticsItems = data.items || [];
    renderAnalyticsSummary(data.summary || {}, data.items || []);
    renderAnalyticsTable(data.items || []);
  }
  function pageAnalytics(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.analytics.title') + '</h1><p class="ab-page-sub">' + t('admin.analytics.desc') + '</p></div></div>'
      + (cloudOn() ? '<div class="ab-analytics-tabs"><button class="ab-btn sm active" data-analytics-range="all">' + t('admin.analytics.all') + '</button><button class="ab-btn sm" data-analytics-range="30">' + t('admin.analytics.last30') + '</button><button class="ab-btn sm" data-analytics-range="7">' + t('admin.analytics.last7') + '</button></div>' : '')
      + '<div class="ab-row" style="justify-content:flex-end;margin-bottom:10px"><button class="ab-btn sm" id="abAnalyticsExport">' + icon('download', 13) + ' ' + t('admin.analytics.exportCsv') + '</button></div>'
      + '<div class="ab-grid cols-4" id="abAnalyticsSummary"></div>'
      + '<div class="ab-card"><div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>' + t('admin.analytics.colTitle') + '</th><th>' + t('admin.analytics.colViews') + '</th><th>' + t('admin.analytics.colLikes') + '</th><th>' + t('admin.analytics.colComments') + '</th><th>' + t('admin.analytics.colScore') + '</th><th>' + t('admin.analytics.colTrend') + '</th></tr></thead><tbody id="abAnalyticsBody"></tbody></table></div></div>';
    var exportBtn = content.querySelector('#abAnalyticsExport');
    if (exportBtn) exportBtn.addEventListener('click', function () { exportAnalyticsCsv(content); });
    content.querySelectorAll('[data-analytics-range]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        content.querySelectorAll('[data-analytics-range]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        loadAnalytics(content, btn.getAttribute('data-analytics-range'));
      });
    });
    loadAnalytics(content, 'all');
  }
  /* ====================== 文章列表 ====================== */
  function pagePosts(content) {
    content.innerHTML =
      '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.postList.title') + '</h1><p class="ab-page-sub">' + t('admin.postList.desc') + '</p></div>' +
        '<button class="ab-btn primary" data-link="/admin/posts/new">' + icon('pen', 15) + ' ' + t('admin.sidebar.writeNew') + '</button></div>' +
      '<div class="ab-toolbar">' +
        '<div class="ab-search"><input class="ab-input" id="abPostKw" placeholder="' + t('admin.postList.search') + '"></div>' +
        '<select class="ab-select" id="abPostStatus" style="max-width:160px"><option value="all">' + t('admin.postList.allStatus') + '</option><option value="published">' + t('admin.dashboard.published') + '</option><option value="scheduled">' + t('admin.dashboard.scheduled') + '</option><option value="draft">' + t('admin.dashboard.drafts') + '</option></select>' +
      '</div>' +
      '<div class="ab-bulk" id="abPostBulk" style="display:none"><span class="ab-muted" id="abPostSelInfo"></span>' +
        '<button class="ab-btn sm" id="abPostPinOn">' + icon('pin', 13) + ' ' + t('admin.postList.bulkPinOn') + '</button>' +
        '<button class="ab-btn sm" id="abPostPinOff">' + icon('pin', 13) + ' ' + t('admin.postList.bulkPinOff') + '</button>' +
        '<button class="ab-btn sm danger" id="abPostDel">' + icon('trash', 13) + ' ' + t('admin.postList.bulkDelete') + '</button></div>' +
      '<div class="ab-table-wrap"><table class="ab-table"><thead><tr>' +
        '<th class="col-check"><input type="checkbox" id="abPostAll" aria-label="' + t('admin.postList.selectPage') + '"></th>' +
        '<th>' + t('admin.postList.colTitle') + '</th><th>' + t('admin.postList.colTags') + '</th><th>' + t('admin.postList.colDate') + '</th><th>' + t('admin.postList.colStatus') + '</th><th class="col-actions">' + t('admin.postList.colActions') + '</th>' +
      '</tr></thead><tbody id="abPostBody"></tbody></table></div>' +
      '<div class="ab-pagination" id="abPostPage"></div>';

    content.querySelector('#abPostPinOn').addEventListener('click', function () { bulkPinPosts(content, true); });
    content.querySelector('#abPostPinOff').addEventListener('click', function () { bulkPinPosts(content, false); });
    content.querySelector('#abPostDel').addEventListener('click', function () { bulkDeletePosts(content); });
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
    var all = content.querySelector('#abPostAll');
    if (all) all.addEventListener('change', function () {
      var on = all.checked;
      content.querySelectorAll('#abPostBody [data-pick]').forEach(function (cb) {
        var id = dec(cb.getAttribute('data-pick'));
        if (on) postSel[id] = true; else delete postSel[id];
        cb.checked = on;
      });
      syncPostSelection(content);
    });
  }
  /** 文章列表多选状态（跨页保留，按 id 记录） */
  var postSel = {};
  function syncPostSelection(content) {
    var ids = Object.keys(postSel);
    var bar = content.querySelector('#abPostBulk');
    var info = content.querySelector('#abPostSelInfo');
    if (bar) bar.style.display = ids.length ? 'flex' : 'none';
    if (info) info.textContent = t('admin.postList.bulkSelected', { n: ids.length });
  }
  async function bulkPinPosts(content, pinned) {
    var ids = Object.keys(postSel);
    if (!ids.length) return;
    var ok = 0;
    for (var i = 0; i < ids.length; i++) {
      try {
        var post = await getPost(ids[i]);
        if (!post) continue;
        post.pinned = pinned;
        if (cloudOn()) await api('api/posts/' + enc(ids[i]), { method: 'PUT', body: JSON.stringify(post) });
        else saveStaticPost(post);
        ok++;
      } catch (e) {}
    }
    if (!cloudOn() && ok) downloadPostsJs();
    toast(pinned ? t('admin.postList.bulkPinned', { n: ok }) : t('admin.postList.bulkUnpinned', { n: ok }), ok ? 'ok' : 'err');
    postSel = {};
    loadPosts(content, 1);
  }
  async function bulkDeletePosts(content) {
    var ids = Object.keys(postSel);
    if (!ids.length) return;
    confirmModal(t('admin.postList.bulkDelete'), '<p class="ab-muted">' + t('admin.postList.bulkDeleteConfirm', { n: ids.length }) + '</p>', async function () {
      var ok = 0;
      for (var i = 0; i < ids.length; i++) {
        try { await deletePost(ids[i]); if (window.syncDeletedPost) window.syncDeletedPost(ids[i]); ok++; } catch (e) {}
      }
      toast(t('admin.postList.bulkDeleted', { n: ok }), ok ? 'ok' : 'err');
      postSel = {};
      loadPosts(content, 1);
    }, t('admin.comments.delete'));
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  async function loadPosts(content, page, silent) {
    var body = content.querySelector('#abPostBody');
    // silent：删除/审核后的静默校准刷新，不打断当前视图（不闪加载行）
    if (!silent) body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('admin.postList.loading') + '</td></tr>';
    var posts = [];
    try { posts = await listPosts(); } catch (e) { body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.postList.loadFail') + esc(e.message || e) + '</td></tr>'; return; }

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
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.postList.noMatch') + '</td></tr>';
      content.querySelector('#abPostPage').innerHTML = '';
      return;
    }
    var per = 10, totalPages = Math.max(1, Math.ceil(filtered.length / per));
    page = Math.min(page, totalPages);
    var slice = filtered.slice((page - 1) * per, page * per);
    body.innerHTML = slice.map(function (p) {
      var id = p.id;
      var statusBadge = '';
      var postStatus = p.status || 'published';
      if (postStatus === 'scheduled') statusBadge = '<span class="ab-status scheduled">' + icon('clock', 11) + ' ' + t('admin.dashboard.scheduled') + (p.publishAt ? ' · ' + esc(fmtTimestamp(p.publishAt)) : '') + '</span>';
      else if (p.pinned) statusBadge = '<span class="ab-status published">' + icon('pin', 11) + ' ' + t('admin.postList.pin') + '</span>';
      else statusBadge = '<span class="ab-status ' + (postStatus === 'draft' ? 'draft' : 'published') + '">' + (postStatus === 'draft' ? t('admin.dashboard.drafts') : t('admin.dashboard.published')) + '</span>';
      return '<tr' + (postSel[id] ? ' class="selected"' : '') + '>' +
        '<td class="col-check"><input type="checkbox" data-pick="' + enc(id) + '"' + (postSel[id] ? ' checked' : '') + ' aria-label="' + t('admin.postList.selectPage') + '"></td>' +
        '<td><a class="ab-post-title" data-link="/admin/posts/' + enc(id) + '/edit">' + esc(p.title || t('admin.dashboard.noTitle')) + '</a>' + (p.series ? ' <span class="ab-chip">' + icon('list', 11) + ' ' + esc(p.series) + (p.seriesOrder ? ' #' + esc(String(p.seriesOrder)) : '') + '</span>' : '') + '</td>' +
        '<td class="ab-td-tags">' + (p.tags && p.tags.length ? '<div class="ab-tag-row">' + p.tags.map(function (t) { return '<span class="ab-chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '<span class="ab-muted">—</span>') + '</td>' +
        '<td class="ab-td-date">' + esc(fmtPostDate(p.date)) + '</td>' +
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

    body.querySelectorAll('[data-pick]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = dec(cb.getAttribute('data-pick'));
        if (cb.checked) postSel[id] = true; else delete postSel[id];
        var card = cb.closest('tr');
        if (card) card.classList.toggle('selected', cb.checked);
        var allBox = content.querySelector('#abPostAll');
        var boxes = body.querySelectorAll('[data-pick]');
        if (allBox) allBox.checked = boxes.length > 0 && Array.prototype.every.call(boxes, function (x) { return x.checked; });
        syncPostSelection(content);
      });
    });
    var allBox0 = content.querySelector('#abPostAll');
    if (allBox0) allBox0.checked = false;
    syncPostSelection(content);

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

  /* ====================== 文章导入 / 导出 ====================== */
  function transferAnchorDownload(name, blob) {
    var a = document.createElement('a');
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) {}
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 1000);
  }
  function transferDownload(name, blob) {
    // 支持 File System Access API 的浏览器优先弹出“另存为”，用户能明确选择文件位置；
    // 不支持、被取消或权限受限时回退到浏览器默认下载目录。
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        window.showSaveFilePicker({ suggestedName: name }).then(function (handle) {
          return handle.createWritable().then(function (writable) {
            return writable.write(blob).then(function () { return writable.close(); });
          });
        }).catch(function (err) {
          if (!err || err.name !== 'AbortError') transferAnchorDownload(name, blob);
        });
        return;
      } catch (e) { transferAnchorDownload(name, blob); return; }
    }
    transferAnchorDownload(name, blob);
  }
  function transferDownloadText(name, text, type) {
    transferDownload(name, new Blob([String(text || '')], { type: type || 'text/plain;charset=utf-8' }));
  }
  function transferStamp() {
    var d = new Date();
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function transferSlug(value) {
    return String(value || '').toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
  function transferTags(value) {
    if (Array.isArray(value)) return value.map(function (v) { return String(v).trim(); }).filter(Boolean);
    var raw = String(value == null ? '' : value).trim();
    if (!raw) return [];
    if (raw.charAt(0) === '[') {
      try {
        var arr = JSON.parse(raw);
        if (Array.isArray(arr)) return transferTags(arr);
      } catch (e) {}
    }
    return raw.split(/[,，、]/).map(function (v) { return v.trim(); }).filter(Boolean);
  }
  function transferPostMarkdown(post) {
    var lines = ['---'];
    var stringKeys = ['id', 'title', 'date', 'excerpt', 'cover', 'og_image', 'category', 'series'];
    stringKeys.forEach(function (key) {
      var value = String(post[key] == null ? '' : post[key]);
      if (value !== '') lines.push(key + ': ' + JSON.stringify(value));
    });
    lines.push('tags: ' + JSON.stringify(post.tags || []));
    lines.push('series_order: ' + JSON.stringify(Number(post.seriesOrder) || 0));
    lines.push('pinned: ' + (post.pinned ? 'true' : 'false'));
    lines.push('status: ' + JSON.stringify(post.status === 'draft' ? 'draft' : (post.status === 'scheduled' ? 'scheduled' : 'published')));
    if (post.publishAt) lines.push('publish_at: ' + JSON.stringify(new Date(Number(post.publishAt)).toISOString()));
    if (post.protected) lines.push('protected: true');
    if (post.enc) lines.push('enc: ' + JSON.stringify(post.enc));
    lines.push('---', '');
    return lines.join('\n') + String(post.content || '').replace(/\s*$/, '') + '\n';
  }
  function transferScalar(raw) {
    var value = String(raw == null ? '' : raw).trim();
    if (!value) return '';
    var first = value.charAt(0);
    if (first === '"' || first === '[' || first === '{') {
      try { return JSON.parse(value); } catch (e) {}
    }
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return value;
  }
  function transferParseMarkdown(text, filename) {
    var src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    var meta = {};
    var body = src;
    if (src.slice(0, 3) === '---') {
      var end = src.indexOf('\n---', 3);
      if (end >= 0) {
        var block = src.slice(4, end);
        body = src.slice(end + 4).replace(/^\n/, '');
        block.split('\n').forEach(function (line) {
          var m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
          if (m) meta[m[1].toLowerCase()] = transferScalar(m[2]);
        });
      }
    }
    var base = String(filename || '').replace(/^.*[\\/]/, '').replace(/\.(md|markdown)$/i, '');
    var title = String(meta.title == null ? base : meta.title).trim();
    var id = transferSlug(meta.id || title || base || ('post-' + Date.now().toString(36)));
    var enc = meta.enc;
    if (typeof enc === 'string' && enc) {
      try { enc = JSON.parse(enc); } catch (e) { enc = null; }
    }
    var isProtected = !!(meta.protected && enc);
    return normalizeImportedPost({
      id: id,
      title: title || base || t('admin.postList.noTitle'),
      date: meta.date || new Date().toISOString().slice(0, 10),
      tags: transferTags(meta.tags),
      excerpt: meta.excerpt || '',
      cover: meta.cover || '',
      ogImage: meta.og_image || '',
      category: meta.category || '',
      series: meta.series || '',
      seriesOrder: Number(meta.series_order) || 0,
      status: meta.status,
      publishAt: meta.publish_at ? Date.parse(String(meta.publish_at)) : null,
      pinned: meta.pinned,
      protected: isProtected,
      enc: isProtected ? enc : null,
      content: body.replace(/^\n+|\n+$/g, '')
    }, base);
  }
  function transferParseJson(text) {
    var data = JSON.parse(String(text || ''));
    var raw = [];
    if (Array.isArray(data)) raw = data;
    else if (data && Array.isArray(data.posts)) raw = data.posts;
    else if (data && data.post && typeof data.post === 'object') raw = [data.post];
    else if (data && typeof data === 'object') raw = [data];
    return raw.map(function (p) { return normalizeImportedPost(p, ''); }).filter(Boolean);
  }
  function normalizeImportedPost(post, fallbackId) {
    if (!post || typeof post !== 'object') return null;
    var title = String(post.title == null ? '' : post.title).trim();
    var id = transferSlug(post.id || title || fallbackId || ('post-' + Date.now().toString(36)));
    if (!id) return null;
    if (!title) title = String(fallbackId || id).trim() || t('admin.postList.noTitle');
    var enc = post.enc;
    if (typeof enc === 'string' && enc) {
      try { enc = JSON.parse(enc); } catch (e) { enc = null; }
    }
    var isProtected = !!(post.protected && enc);
    var postStatus = post.status === 'draft' ? 'draft' : (post.status === 'scheduled' ? 'scheduled' : 'published');
    var publishAtRaw = post.publishAt != null ? post.publishAt : post.publish_at;
    var publishAt = Number(publishAtRaw) || (publishAtRaw ? Date.parse(String(publishAtRaw)) : null);
    if (!Number.isFinite(publishAt) || publishAt <= 0) publishAt = null;
    return {
      id: id,
      title: title,
      date: String(post.date || new Date().toISOString().slice(0, 10)),
      tags: transferTags(post.tags),
      excerpt: String(post.excerpt || ''),
      cover: String(post.cover || ''),
      ogImage: String(post.ogImage || post.og_image || ''),
      category: String(post.category || ''),
      series: String(post.series || ''),
      seriesOrder: Math.max(0, Math.floor(Number(post.seriesOrder || post.series_order) || 0)),
      status: postStatus,
      publishAt: postStatus === 'scheduled' ? publishAt : null,
      pinned: !!post.pinned,
      protected: isProtected,
      enc: isProtected ? enc : null,
      content: String(post.content || '')
    };
  }
  function transferBackupJson(posts) {
    return JSON.stringify({
      format: 'qingyu-blog-posts',
      version: 1,
      exportedAt: new Date().toISOString(),
      posts: posts || []
    }, null, 2);
  }
  var _zipCrcTable = null;
  function transferCrc32(bytes) {
    if (!_zipCrcTable) {
      _zipCrcTable = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        _zipCrcTable[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = _zipCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function transferU16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
  function transferU32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
  function transferBytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text || ''));
    var out = [];
    var s = unescape(encodeURIComponent(String(text || '')));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return new Uint8Array(out);
  }
  function transferConcat(parts) {
    var len = 0;
    parts.forEach(function (p) { len += p.length; });
    var out = new Uint8Array(len), offset = 0;
    parts.forEach(function (p) { out.set(p, offset); offset += p.length; });
    return out;
  }
  function transferDosTime(date) {
    var d = date || new Date();
    var year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }
  function transferZip(files) {
    var local = [], central = [], offset = 0;
    var dt = transferDosTime(new Date());
    (files || []).forEach(function (file) {
      var name = transferBytes(file.name);
      var data = transferBytes(file.text || '');
      var crc = transferCrc32(data);
      var localHead = transferConcat([
        new Uint8Array([0x50, 0x4B, 0x03, 0x04]), new Uint8Array(transferU16(20)),
        new Uint8Array(transferU16(0x0800)), new Uint8Array(transferU16(0)),
        new Uint8Array(transferU16(dt.time)), new Uint8Array(transferU16(dt.date)),
        new Uint8Array(transferU32(crc)), new Uint8Array(transferU32(data.length)),
        new Uint8Array(transferU32(data.length)), new Uint8Array(transferU16(name.length)),
        new Uint8Array(transferU16(0)), name, data
      ]);
      local.push(localHead);
      var centralHead = transferConcat([
        new Uint8Array([0x50, 0x4B, 0x01, 0x02]), new Uint8Array(transferU16(20)),
        new Uint8Array(transferU16(20)), new Uint8Array(transferU16(0x0800)),
        new Uint8Array(transferU16(0)), new Uint8Array(transferU16(dt.time)),
        new Uint8Array(transferU16(dt.date)), new Uint8Array(transferU32(crc)),
        new Uint8Array(transferU32(data.length)), new Uint8Array(transferU32(data.length)),
        new Uint8Array(transferU16(name.length)), new Uint8Array(transferU16(0)),
        new Uint8Array(transferU16(0)), new Uint8Array(transferU16(0)),
        new Uint8Array(transferU16(0)), new Uint8Array(transferU32(0)),
        new Uint8Array(transferU32(offset)), name
      ]);
      central.push(centralHead);
      offset += localHead.length;
    });
    var centralData = transferConcat(central);
    var end = transferConcat([
      new Uint8Array([0x50, 0x4B, 0x05, 0x06]), new Uint8Array(transferU16(0)),
      new Uint8Array(transferU16(0)), new Uint8Array(transferU16(files.length)),
      new Uint8Array(transferU16(files.length)), new Uint8Array(transferU32(centralData.length)),
      new Uint8Array(transferU32(offset)), new Uint8Array(transferU16(0))
    ]);
    return new Blob(local.concat(central, [end]), { type: 'application/zip' });
  }
  function transferZipForPosts(posts) {
    var used = {}, files = [];
    (posts || []).forEach(function (post) {
      var base = transferSlug(post.title || post.id || 'post') || 'post';
      var name = base + '.md', n = 2;
      while (used[name]) { name = base + '-' + n + '.md'; n++; }
      used[name] = true;
      files.push({ name: name, text: transferPostMarkdown(post) });
    });
    files.push({ name: 'posts.json', text: transferBackupJson(posts) });
    return transferZip(files);
  }
  async function transferExportOne(id, button, content) {
    var old = button ? button.innerHTML : '';
    if (button) { button.disabled = true; button.innerHTML = icon('spinner', 12) + ' ' + t('admin.transfer.exporting'); }
    try {
      // 页面加载时已经缓存全文；点击后可同步下载，避免部分浏览器拦截异步触发的下载。
      var posts = (content && content.__iePosts) || await listFullPosts();
      var post = posts.filter(function (p) { return p.id === id; })[0];
      if (!post) { toast(t('admin.postList.notFound'), 'err'); return; }
      var name = (transferSlug(post.title || post.id) || 'post') + '.md';
      transferDownloadText(name, transferPostMarkdown(post), 'text/markdown;charset=utf-8');
      toast(t('admin.transfer.exported', { count: 1 }), 'ok');
    } catch (e) {
      toast(t('admin.transfer.exportFail') + (e.message || e), 'err');
    } finally {
      if (button) { button.disabled = false; button.innerHTML = old; }
    }
  }
  async function transferExportPosts(content, ids) {
    var status = content.querySelector('#abIeStatus');
    if (status) status.textContent = t('admin.transfer.exporting');
    try {
      var all = (content && content.__iePosts) || await listFullPosts();
      var map = {};
      all.forEach(function (p) { map[p.id] = p; });
      var posts = ids && ids.length ? ids.map(function (id) { return map[id]; }).filter(Boolean) : all;
      if (!posts.length) { toast(t('admin.transfer.noSelection'), 'err'); return; }
      transferDownload('qingyu-posts-' + transferStamp() + '.zip', transferZipForPosts(posts));
      toast(t('admin.transfer.exported', { count: posts.length }), 'ok');
    } catch (e) {
      toast(t('admin.transfer.exportFail') + (e.message || e), 'err');
    } finally {
      if (status) status.textContent = '';
    }
  }
  async function transferExportBackup(content) {
    var status = content.querySelector('#abIeStatus');
    if (status) status.textContent = t('admin.transfer.exporting');
    try {
      var posts = (content && content.__iePosts) || await listFullPosts();
      transferDownloadText('qingyu-backup-' + transferStamp() + '.json', transferBackupJson(posts), 'application/json;charset=utf-8');
      toast(t('admin.transfer.exported', { count: posts.length }), 'ok');
    } catch (e) {
      toast(t('admin.transfer.exportFail') + (e.message || e), 'err');
    } finally {
      if (status) status.textContent = '';
    }
  }
  function transferReadFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('read failed')); };
      reader.readAsText(file);
    });
  }
  function transferSyncStaticImported(post) {
    if (!Array.isArray(window.BLOG_POSTS)) return;
    var idx = -1;
    for (var i = 0; i < window.BLOG_POSTS.length; i++) {
      if (window.BLOG_POSTS[i] && window.BLOG_POSTS[i].id === post.id) { idx = i; break; }
    }
    if (idx >= 0) window.BLOG_POSTS[idx] = Object.assign({}, window.BLOG_POSTS[idx], post);
    else window.BLOG_POSTS.push(post);
  }
  async function transferImportFiles(fileList, content) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var status = content.querySelector('#abIeStatus');
    if (status) status.textContent = t('admin.transfer.reading');
    var parsed = [];
    var failed = 0;
    for (var i = 0; i < files.length; i++) {
      var name = String(files[i].name || '');
      if (!/\.(md|markdown|json)$/i.test(name)) continue;
      try {
        var text = await transferReadFile(files[i]);
        var list = /\.json$/i.test(name) ? transferParseJson(text) : [transferParseMarkdown(text, name)];
        list.forEach(function (p) { if (p) parsed.push(p); });
      } catch (e) { failed++; }
    }
    if (!parsed.length) {
      if (status) status.textContent = '';
      toast(t('admin.transfer.invalidFiles'), 'err');
      return;
    }
    var used = {};
    parsed.forEach(function (post) {
      var base = post.id, n = 2;
      while (used[post.id]) { post.id = base + '-' + n; n++; }
      used[post.id] = true;
    });
    var existing = {};
    try {
      var current = await listPosts();
      current.forEach(function (p) { existing[p.id] = p; });
    } catch (e) {}
    var conflicts = parsed.filter(function (p) { return !!existing[p.id]; });
    function runImport() {
      var ok = 0;
      (async function () {
        for (var i = 0; i < parsed.length; i++) {
          var post = parsed[i];
          if (status) status.textContent = t('admin.transfer.importing', { done: i + 1, total: parsed.length });
          try {
            await savePost(post, !existing[post.id]);
            if (!cloudOn()) transferSyncStaticImported(post);
            ok++;
          } catch (e) { failed++; }
        }
        if (status) status.textContent = '';
        if (ok) {
          toast(cloudOn() ? t('admin.transfer.imported', { count: ok }) : t('admin.transfer.importedLocal', { count: ok }), 'ok');
          pageImportExport(content);
        } else {
          toast(t('admin.transfer.importFail'), 'err');
        }
      })();
    }
    if (conflicts.length) {
      confirmModal(t('admin.transfer.overwriteTitle'),
        '<p class="ab-muted">' + esc(t('admin.transfer.overwriteBody', { count: conflicts.length })) + '</p>',
        runImport, t('admin.transfer.continue'));
    } else {
      runImport();
    }
  }
  function pageImportExport(content) {
    content.innerHTML =
      '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.transfer.title') + '</h1><p class="ab-page-sub">' + t('admin.transfer.desc') + '</p></div>' +
        '<div class="ab-row" style="align-items:center;gap:8px;flex-wrap:wrap">' +
          '<button class="ab-btn" id="abIeImportFiles">' + icon('upload', 15) + ' ' + t('admin.transfer.importFiles') + '</button>' +
          '<button class="ab-btn primary" id="abIeImportFolder">' + icon('file', 15) + ' ' + t('admin.transfer.importFolder') + '</button>' +
        '</div></div>' +
      '<input type="file" id="abIeFileInput" accept=".md,.markdown,.json" multiple hidden>' +
      '<input type="file" id="abIeFolderInput" accept=".md,.markdown,.json" multiple webkitdirectory directory hidden>' +
      '<div class="ab-grid cols-2">' +
        '<div class="ab-card"><div class="ab-section-title">' + icon('download', 16) + ' ' + t('admin.transfer.exportTitle') + '</div>' +
          '<p class="ab-muted" style="line-height:1.7;margin:10px 0 14px">' + t('admin.transfer.exportHint') + '</p>' +
          '<div class="ab-row" style="gap:8px;flex-wrap:wrap"><button class="ab-btn" id="abIeExportAll" disabled>' + icon('download', 14) + ' ' + t('admin.transfer.exportAll') + '</button>' +
          '<button class="ab-btn" id="abIeExportBackup" disabled>' + icon('save', 14) + ' ' + t('admin.transfer.exportBackup') + '</button></div></div>' +
        '<div class="ab-card"><div class="ab-section-title">' + icon('upload', 16) + ' ' + t('admin.transfer.importTitle') + '</div>' +
          '<p class="ab-muted" style="line-height:1.7;margin:10px 0 14px">' + t('admin.transfer.importHint') + '</p>' +
          '<p class="ab-hint" id="abIeStatus" style="min-height:18px;margin:0"></p></div>' +
      '</div>' +
      '<div class="ab-card" style="margin-top:18px">' +
        '<div class="ab-toolbar" style="margin-bottom:12px;align-items:center">' +
          '<label class="ab-row" style="align-items:center;gap:7px;cursor:pointer"><input type="checkbox" id="abIeSelectAll"> <span>' + t('admin.transfer.selectAll') + '</span></label>' +
          '<span class="ab-muted" id="abIeSelected" style="font-size:13px">' + t('admin.transfer.selected', { count: 0 }) + '</span>' +
          '<button class="ab-btn sm" id="abIeExportSelected" style="margin-left:auto" disabled>' + icon('download', 13) + ' ' + t('admin.transfer.exportSelected') + '</button>' +
        '</div>' +
        '<div class="ab-table-wrap"><table class="ab-table"><thead><tr><th style="width:40px"></th><th>' + t('admin.transfer.colPost') + '</th><th>' + t('admin.transfer.colDate') + '</th><th>' + t('admin.transfer.colStatus') + '</th><th class="col-actions">' + t('admin.transfer.colActions') + '</th></tr></thead><tbody id="abIeTableBody"></tbody></table></div>' +
      '</div>';
    bindImportExport(content);
    loadImportExport(content);
  }
  function bindImportExport(content) {
    var fileInput = content.querySelector('#abIeFileInput');
    var folderInput = content.querySelector('#abIeFolderInput');
    content.querySelector('#abIeImportFiles').addEventListener('click', function () { fileInput.value = ''; fileInput.click(); });
    content.querySelector('#abIeImportFolder').addEventListener('click', function () { folderInput.value = ''; folderInput.click(); });
    fileInput.addEventListener('change', function () { transferImportFiles(fileInput.files, content); });
    folderInput.addEventListener('change', function () { transferImportFiles(folderInput.files, content); });
    content.querySelector('#abIeExportAll').addEventListener('click', function () { transferExportPosts(content, null); });
    content.querySelector('#abIeExportBackup').addEventListener('click', function () { transferExportBackup(content); });
    var all = content.querySelector('#abIeSelectAll');
    all.addEventListener('change', function () {
      content.querySelectorAll('.ab-ie-check').forEach(function (cb) { cb.checked = all.checked; });
      updateImportExportSelection(content);
    });
  }
  function updateImportExportSelection(content) {
    var checks = Array.prototype.slice.call(content.querySelectorAll('.ab-ie-check'));
    var selected = checks.filter(function (cb) { return cb.checked; });
    var all = content.querySelector('#abIeSelectAll');
    if (all) {
      all.checked = checks.length > 0 && selected.length === checks.length;
      all.indeterminate = selected.length > 0 && selected.length < checks.length;
    }
    var label = content.querySelector('#abIeSelected');
    if (label) label.textContent = t('admin.transfer.selected', { count: selected.length });
  }
  async function loadImportExport(content) {
    var body = content.querySelector('#abIeTableBody');
    body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('admin.transfer.loading') + '</td></tr>';
    var posts = [];
    try { posts = await listFullPosts(); content.__iePosts = posts; }
    catch (e) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.postList.loadFail') + esc(e.message || e) + '</td></tr>';
      return;
    }
    posts.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    if (!posts.length) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.transfer.empty') + '</td></tr>';
      return;
    }
    body.innerHTML = posts.map(function (p) {
      var postStatus = p.status || 'published';
      var badge = postStatus === 'scheduled'
        ? '<span class="ab-status scheduled">' + icon('clock', 11) + ' ' + t('admin.dashboard.scheduled') + (p.publishAt ? ' · ' + esc(fmtTimestamp(p.publishAt)) : '') + '</span>'
        : '<span class="ab-status ' + (postStatus === 'draft' ? 'draft' : 'published') + '">' + (postStatus === 'draft' ? t('admin.dashboard.drafts') : t('admin.dashboard.published')) + '</span>';
      return '<tr>' +
        '<td><input class="ab-ie-check" type="checkbox" data-id="' + esc(enc(p.id)) + '"></td>' +
        '<td><b>' + esc(p.title || t('admin.postList.noTitle')) + '</b>' + (p.pinned ? ' <span class="ab-chip">' + t('admin.postList.pin') + '</span>' : '') + '</td>' +
        '<td class="ab-td-date">' + esc(fmtPostDate(p.date)) + '</td>' +
        '<td class="ab-td-status">' + badge + '</td>' +
        '<td class="col-actions"><button class="ab-btn sm" data-ie-export="' + esc(enc(p.id)) + '">' + icon('download', 12) + ' ' + t('admin.transfer.exportMd') + '</button></td>' +
      '</tr>';
    }).join('');
    body.querySelectorAll('.ab-ie-check').forEach(function (cb) { cb.addEventListener('change', function () { updateImportExportSelection(content); }); });
    body.querySelectorAll('[data-ie-export]').forEach(function (btn) {
      btn.addEventListener('click', function () { transferExportOne(dec(btn.getAttribute('data-ie-export')), btn, content); });
    });
    content.querySelector('#abIeExportSelected').onclick = function () {
      var ids = Array.prototype.slice.call(content.querySelectorAll('.ab-ie-check')).filter(function (cb) { return cb.checked; }).map(function (cb) { return dec(cb.getAttribute('data-id')); });
      transferExportPosts(content, ids);
    };
    ['#abIeExportAll', '#abIeExportBackup', '#abIeExportSelected'].forEach(function (sel) {
      var btn = content.querySelector(sel);
      if (btn) btn.disabled = false;
    });
    updateImportExportSelection(content);
  }

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

  function ogSourceFingerprint(title, date, tags, series) {
    return JSON.stringify([String(title || ''), String(date || ''), (tags || []).join('\u0001'), String(series || '')]);
  }
  function wrapCanvasText(ctx, text, maxWidth, maxLines) {
    var out = [], line = '';
    Array.from(String(text || '')).forEach(function (ch) {
      var next = line + ch;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line); line = ch;
      } else line = next;
    });
    if (line) out.push(line);
    if (out.length > maxLines) {
      out = out.slice(0, maxLines);
      while (out.length && ctx.measureText(out[out.length - 1] + '…').width > maxWidth) out[out.length - 1] = out[out.length - 1].slice(0, -1);
      out[out.length - 1] += '…';
    }
    return out;
  }
  function canvasBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error('图片生成失败')); }, 'image/png', 0.94);
    });
  }
  function canvasBlobType(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(function (blob) { resolve(blob); }, type, quality); });
  }
  function loadImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片解码失败')); };
      img.src = url;
    });
  }
  async function resizeImageFile(file, maxDim, quality, forceType) {
    var img = await loadImageFile(file);
    var scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    var w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    var h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    var type = forceType || 'image/webp';
    var blob = await canvasBlobType(canvas, type, quality || 0.82);
    if (!blob && type !== 'image/jpeg') blob = await canvasBlobType(canvas, 'image/jpeg', quality || 0.82);
    return blob ? { blob: blob, width: w, height: h } : null;
  }
  async function compressImageFile(file) {
    var type = String(file.type || '').toLowerCase();
    if (!/^image\//.test(type) || /gif|svg|ico/.test(type)) return { file: file, thumb: null, compressed: false };
    try {
      var main = await resizeImageFile(file, 2200, 0.82, 'image/webp');
      if (!main || !main.blob) return { file: file, thumb: null, compressed: false };
      // 对本来就很小的图片避免“越压越大”
      if (main.blob.size >= file.size && /jpeg|jpg|png|webp/.test(type)) return { file: file, thumb: null, compressed: false };
      var ext = main.blob.type === 'image/jpeg' ? '.jpg' : '.webp';
      var base = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
      var mainFile = new File([main.blob], base + ext, { type: main.blob.type, lastModified: Date.now() });
      var thumb = await resizeImageFile(file, 640, 0.76, 'image/webp');
      var thumbFile = thumb && thumb.blob ? new File([thumb.blob], base + '-thumb.webp', { type: thumb.blob.type, lastModified: Date.now() }) : null;
      return { file: mainFile, thumb: thumbFile, compressed: true, originalSize: file.size, width: main.width, height: main.height };
    } catch (e) {
      return { file: file, thumb: null, compressed: false };
    }
  }

  async function generateShareImage(content, postId, title, date, tags, series) {
    if (!cloudOn()) throw new Error(t('admin.editor.ogCloudOnly'));
    var canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 630;
    var ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 不可用');
    var accent = getComputedStyle(document.documentElement).getPropertyValue('--ab-primary').trim() || '#c25e3a';
    var grad = ctx.createLinearGradient(0, 0, 1200, 630);
    grad.addColorStop(0, '#f8f2e9');
    grad.addColorStop(0.55, '#ffffff');
    grad.addColorStop(1, '#efe3d4');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1200, 630);
    ctx.globalAlpha = 0.12; ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(1050, 80, 260, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(80, 590, 230, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent; ctx.fillRect(92, 86, 8, 108);
    ctx.fillStyle = '#332b25'; ctx.font = '700 72px "Microsoft YaHei","PingFang SC",sans-serif';
    var lines = wrapCanvasText(ctx, title || t('admin.postList.noTitle'), 960, 3);
    lines.forEach(function (line, i) { ctx.fillText(line, 130, 150 + i * 86); });
    ctx.font = '28px "Microsoft YaHei","PingFang SC",sans-serif'; ctx.fillStyle = '#766b61';
    var meta = [date, series, (tags || []).slice(0, 3).join(' · ')].filter(Boolean).join('  ·  ');
    ctx.fillText(meta, 132, 500);
    ctx.font = '600 28px "Microsoft YaHei","PingFang SC",sans-serif'; ctx.fillStyle = accent;
    ctx.fillText(getSiteName ? getSiteName() : 'Qingyu\'Blog', 132, 555);
    ctx.fillStyle = '#c9b9a8'; ctx.fillRect(132, 580, 936, 2);
    ctx.font = '20px "Microsoft YaHei","PingFang SC",sans-serif'; ctx.fillStyle = '#9a8d80';
    ctx.fillText('1200 × 630  ·  Open Graph', 760, 602);
    var blob = await canvasBlob(canvas);
    var signed = await api('api/admin/og-upload-url', { method: 'POST', body: JSON.stringify({ postId: postId }) });
    if (!signed || !signed.uploadUrl || !signed.publicUrl) throw new Error('分享图上传地址获取失败');
    var up = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob });
    if (!up.ok) throw new Error('分享图上传失败 HTTP ' + up.status);
    return signed.publicUrl;
  }
  function updateOgPreview(content, url) {
    var preview = content.querySelector('#abOgPreview');
    if (!preview) return;
    preview.innerHTML = url ? '<img src="' + esc(url) + '" alt="" style="max-width:360px;max-height:190px;border-radius:8px;border:1px solid var(--ab-border)">' : '<span class="ab-muted">' + t('admin.editor.ogEmpty') + '</span>';
  }

  /* ====================== 编辑器 ====================== */
  function pageEditor(content, route) {
    content.innerHTML =
      '<div class="ab-page-head"><div><h1 class="ab-page-title">' + (route.isNew ? t('admin.editor.newPost') : t('admin.editor.editPost')) + '</h1><p class="ab-page-sub">' + t('editor.markdownHint') + '</p></div></div>' +
      '<div class="ab-editor-head">' +
        '<div class="ab-editor-meta">' +
          '<div class="ab-field ab-title-field" style="margin:0"><label class="ab-label" for="abTitle">' + t('admin.editor.titleLabel') + '</label><input class="ab-input" id="abTitle" placeholder="' + t('admin.editor.titlePlaceholder') + '" autocomplete="off"><label class="ab-hint">' + t('admin.editor.titleHint') + '</label></div>' +
          '<div class="ab-field" style="margin:0"><label class="ab-label">' + t('admin.editor.tagsPlaceholder') + '</label><input class="ab-input" id="abTags" placeholder="' + t('admin.editor.tagsExample') + '" autocomplete="off"></div>' +
          '<div class="ab-field" style="margin:0"><label class="ab-label">' + t('admin.editor.seriesLabel') + '</label><div class="ab-row"><input class="ab-input" id="abSeries" placeholder="' + t('admin.editor.seriesPlaceholder') + '" autocomplete="off"><input class="ab-input" id="abSeriesOrder" type="number" min="0" step="1" style="max-width:110px" placeholder="' + t('admin.editor.seriesOrder') + '"></div><label class="ab-hint">' + t('admin.editor.seriesHint') + '</label></div>' +
          '<div class="ab-field" style="margin:0"><label class="ab-label" for="abDate">' + t('admin.editor.dateLabel') + '</label><div class="ab-row"><input class="ab-input" id="abDate" type="datetime-local" step="60"><button class="ab-btn sm" id="abNow">' + t('admin.editor.setNow') + '</button></div><label class="ab-hint">' + t('admin.editor.dateHint') + '</label></div>' +
          (cloudOn() ? '<div class="ab-field" style="margin:0"><label class="ab-label" for="abSchedule">' + t('admin.editor.scheduleLabel') + '</label><input class="ab-input" id="abSchedule" type="datetime-local" step="60"><label class="ab-hint">' + t('admin.editor.scheduleHint') + '</label></div>' : '') +
        '</div>' +
        '<div class="ab-field" style="margin:0"><label class="ab-label">' + t('admin.editor.coverPlaceholder') + '</label><div class="ab-row"><input class="ab-input" id="abCover" placeholder="https://…"><button class="ab-btn sm" id="abPickCover">' + t('admin.editor.selectMedia') + '</button></div></div>' +
        '<div class="ab-field" style="margin:0"><label class="ab-label">' + t('admin.editor.ogLabel') + '</label><input type="hidden" id="abOgImage"><div class="ab-row" style="align-items:center;gap:10px;flex-wrap:wrap"><button class="ab-btn sm" id="abOgGenerate">' + icon('image', 13) + ' ' + t('admin.editor.ogGenerate') + '</button><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="abOgAuto" checked> ' + t('admin.editor.ogAuto') + '</label></div><div id="abOgPreview" style="margin-top:8px"></div><label class="ab-hint">' + t('admin.editor.ogHint') + '</label></div>' +
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
            '<button class="ab-tool" data-md="wiki" title="' + t('admin.editor.wiki') + '">[[ ]]</button>' +
            '<button class="ab-tool" data-md="table" title="' + t('admin.editor.table') + '">▦</button>' +
            '<button class="ab-tool" data-md="task" title="' + t('admin.editor.task') + '">☑</button>' +
            '<button class="ab-tool" data-md="hr" title="' + t('admin.editor.hr') + '">―</button>' +
            '<button class="ab-tool" data-md="codeblock" title="' + t('admin.editor.codeBlock') + '">{ }</button>' +
            '<select class="ab-tool-select" id="abMdLang" title="' + t('admin.editor.codeBlock') + '" aria-label="' + t('admin.editor.codeBlock') + '"><option value="">' + t('admin.editor.langPlain') + '</option><option value="js">JavaScript</option><option value="ts">TypeScript</option><option value="python">Python</option><option value="bash">Bash</option><option value="json">JSON</option><option value="html">HTML</option><option value="css">CSS</option><option value="sql">SQL</option><option value="go">Go</option><option value="java">Java</option></select>' +
            '<button class="ab-tool" id="abSmoji" title="' + t('admin.editor.emoji') + '" aria-label="' + t('admin.editor.emoji') + '">😊</button>' +
          '</div>' +
          '<textarea class="ab-editor-area" id="abBody" placeholder="' + t('admin.editor.writeHint') + '"></textarea>' +
          '<div class="ab-editor-stats" id="abEditorStats"></div>' +
        '</div>' +
        '<div class="ab-editor-pane"><div class="ab-editor-preview" id="abPreviewPane"></div></div>' +
      '</div>' +
      '<div class="ab-row ab-editor-actions">' +
        (cloudOn() ? '' : '<button class="ab-btn" id="abExport">' + t('editor.exportAll') + '</button>') +
        (route.id ? '<button class="ab-btn" id="abHistory">' + icon('refresh', 15) + ' ' + t('admin.revisions.button') + '</button>' : '') +
        (cloudOn() ? '<button class="ab-btn" id="abScheduleBtn">' + icon('clock', 15) + ' ' + t('admin.editor.scheduleButton') + '</button>' : '') +
        '<button class="ab-btn" id="abSaveDraft">' + t('admin.editor.saveDraft') + '</button>' +
        '<button class="ab-btn primary" id="abPublish">' + icon('check', 15) + ' ' + t('admin.editor.publish') + '</button>' +
      '</div>';

    bindEditor(content, route);
    if (route.id) loadEditor(content, route.id);
    else {
      var dateInput = content.querySelector('#abDate');
      if (dateInput) dateInput.value = localDateTimeValue(new Date());
      updatePreview(content);
    }
    initAbAi(content);
  }

  function bindEditor(content, route) {
    var area = content.querySelector('#abBody');
    area.addEventListener('input', function () { autosizeArea(area); updateEditorStats(content); });
    area.addEventListener('input', debounce(function () { updatePreview(content); }, 200));
    area.addEventListener('paste', function (e) {
      var items = e.clipboardData && e.clipboardData.items ? Array.prototype.slice.call(e.clipboardData.items) : [];
      var imgItem = items.filter(function (it) { return it.type && it.type.indexOf('image/') === 0; })[0];
      if (!imgItem) return;
      var file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      insertPastedImage(content, area, file);
    });
    // 常用快捷键：Ctrl/⌘ + B / I / K / S
    area.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var k = String(e.key || '').toLowerCase();
      if (k === 'b' || k === 'i' || k === 'k') {
        e.preventDefault();
        var langSel = content.querySelector('#abMdLang');
        insertMd(area, k === 'b' ? 'bold' : (k === 'i' ? 'italic' : 'link'), { lang: langSel ? langSel.value : '' });
        updatePreview(content); updateEditorStats(content);
      } else if (k === 's') {
        e.preventDefault();
        saveEditor(content, route, 'draft');
      }
    });
    content.querySelector('#abToolbar').querySelectorAll('[data-md]').forEach(function (b) {
      b.addEventListener('click', function () {
        var langSel = content.querySelector('#abMdLang');
        insertMd(area, b.getAttribute('data-md'), { lang: langSel ? langSel.value : '' });
        updatePreview(content); updateEditorStats(content); area.focus();
      });
    });
    var dateInput = content.querySelector('#abDate');
    var nowBtn = content.querySelector('#abNow');
    if (nowBtn && dateInput) nowBtn.addEventListener('click', function () { dateInput.value = localDateTimeValue(new Date()); });
    content.querySelector('#abSaveDraft').addEventListener('click', function () { saveEditor(content, route, 'draft'); });
    content.querySelector('#abPublish').addEventListener('click', function () { saveEditor(content, route, 'published'); });
    var scheduleBtn = content.querySelector('#abScheduleBtn');
    if (scheduleBtn) scheduleBtn.addEventListener('click', function () { saveEditor(content, route, 'scheduled'); });
    var historyBtn = content.querySelector('#abHistory');
    if (historyBtn) historyBtn.addEventListener('click', function () { openRevisionHistory(content, route); });
    var ogBtn = content.querySelector('#abOgGenerate');
    if (ogBtn) ogBtn.addEventListener('click', function () {
      var title = content.querySelector('#abTitle').value.trim();
      if (!title) { toast(t('admin.editor.noTitle'), 'err'); return; }
      var tags = content.querySelector('#abTags').value.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
      var date = normalizeEditorDate(content.querySelector('#abDate').value).slice(0, 10);
      var postId = route.id || slug(title);
      ogBtn.disabled = true; ogBtn.innerHTML = icon('spinner', 12) + ' ' + t('admin.editor.ogGenerating');
      generateShareImage(content, postId, title, date, tags, content.querySelector('#abSeries').value.trim()).then(function (url) {
        content.querySelector('#abOgImage').value = url;
        content.__ogSource = ogSourceFingerprint(title, date, tags, content.querySelector('#abSeries').value.trim());
        updateOgPreview(content, url); toast(t('admin.editor.ogGenerated'), 'ok');
      }).catch(function (e) { toast(t('admin.editor.ogFail') + (e.message || e), 'err'); })
        .finally(function () { ogBtn.disabled = false; ogBtn.innerHTML = icon('image', 13) + ' ' + t('admin.editor.ogGenerate'); });
    });
    var exp = content.querySelector('#abExport');
    if (exp) exp.addEventListener('click', downloadAllStatic);
    var pick = content.querySelector('#abPickCover');
    if (pick) pick.addEventListener('click', function () { openMediaPicker(content); });
    var smojiBtn = content.querySelector('#abSmoji');
    if (smojiBtn && window.initSmojiPicker) window.initSmojiPicker(smojiBtn, area);
  }
  async function insertPastedImage(content, area, file) {
    toast(t('admin.media.pasteUploading'), 'ok');
    try {
      var result = await uploadImageAsset(file);
      var url = result.media && (result.media.url || result.media.publicUrl) || '';
      var alt = t('admin.media.pastedAlt');
      var md = '![' + alt + '](' + url + ')';
      var start = area.selectionStart || 0, end = area.selectionEnd || 0;
      area.value = area.value.slice(0, start) + md + area.value.slice(end);
      area.selectionStart = area.selectionEnd = start + md.length;
      area.dispatchEvent(new Event('input'));
      toast(t('admin.media.pasteUploaded'), 'ok');
    } catch (e) {
      toast(t('admin.media.pasteUploadFail') + (e.message || e), 'err');
    }
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
  /** 正文字数与预计阅读时长（中日韩按字计，拉丁按词计） */
  function editorCounts(text) {
    var str = String(text || '');
    var cjkRe = /[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g;
    var cjk = (str.match(cjkRe) || []).length;
    var words = (str.replace(cjkRe, ' ').match(/[A-Za-z0-9_'-]+/g) || []).length;
    var total = cjk + words;
    return { chars: str.length, total: total, minutes: Math.max(1, Math.ceil(total / 400)) };
  }
  function updateEditorStats(content) {
    var box = content.querySelector('#abEditorStats');
    if (!box) return;
    var area = content.querySelector('#abBody');
    var c = editorCounts(area ? area.value : '');
    box.innerHTML = '<span>' + t('admin.editor.stats', { chars: c.chars, words: c.total, minutes: c.minutes }) + '</span>' +
      '<span class="ab-hint">' + t('admin.editor.shortcutHint') + '</span>';
  }
  function insertMd(area, type, opts) {
    opts = opts || {};
    var s = area.selectionStart, e = area.selectionEnd, v = area.value;
    var sel = v.slice(s, e), pre = '', post = '', rep = sel;
    if (type === 'bold') { pre = '**'; post = '**'; }
    else if (type === 'italic') { pre = '*'; post = '*'; }
    else if (type === 'h') { pre = '## '; }
    else if (type === 'quote') { pre = '> '; }
    else if (type === 'code') { pre = '`'; post = '`'; }
    else if (type === 'ul') { pre = '- '; }
    else if (type === 'task') { pre = '- [ ] '; }
    else if (type === 'hr') { rep = (s > 0 && v.charAt(s - 1) !== '\n' ? '\n' : '') + '---\n'; }
    else if (type === 'table') {
      var col = t('admin.editor.tableCol'), cell = t('admin.editor.tableCell');
      rep = '| ' + col + '1 | ' + col + '2 | ' + col + '3 |\n| --- | --- | --- |\n| ' + cell + ' | ' + cell + ' | ' + cell + ' |\n';
    }
    else if (type === 'codeblock') {
      var lang = String(opts.lang || '').trim();
      rep = '```' + lang + '\n' + (sel || '') + '\n```';
    }
    else if (type === 'link') { rep = '[' + (sel || t('editor.linkBtn')) + '](https://)'; }
    else if (type === 'img') { rep = '![' + (sel || t('editor.imgBtn')) + '](https://)'; }
    else if (type === 'wiki') { rep = '[[' + (sel || t('admin.editor.wiki')) + ']]'; }
    area.value = v.slice(0, s) + pre + rep + post + v.slice(e);
    area.selectionStart = area.selectionEnd = s + pre.length + rep.length;
  }
  async function loadEditor(content, id) {
    var p = await getPost(id);
    if (!p) { toast(t('admin.editor.notFound'), 'err'); return; }
    content.__editingPost = p;
    content.querySelector('#abTitle').value = p.title || '';
    content.querySelector('#abTags').value = (p.tags || []).join(', ');
    content.querySelector('#abSeries').value = p.series || '';
    content.querySelector('#abSeriesOrder').value = p.seriesOrder ? String(p.seriesOrder) : '';
    content.querySelector('#abCover').value = p.cover || '';
    content.querySelector('#abOgImage').value = p.ogImage || '';
    content.__ogSource = ogSourceFingerprint(p.title, p.date, (p.tags || []), p.series || '');
    updateOgPreview(content, p.ogImage || '');
    var dateInput = content.querySelector('#abDate');
    if (dateInput) dateInput.value = toDateTimeLocal(p.date || '');
    var scheduleInput = content.querySelector('#abSchedule');
    if (scheduleInput && p.publishAt) scheduleInput.value = toDateTimeLocal(p.publishAt);
    content.querySelector('#abBody').value = p.content || '';
    content.querySelector('#abPinned').checked = !!p.pinned;
    updatePreview(content);
    updateEditorStats(content);
  }
  async function saveEditor(content, route, status) {
    var title = content.querySelector('#abTitle').value.trim();
    var body = content.querySelector('#abBody').value;
    if (!title) { toast(t('admin.editor.noTitle'), 'err'); return; }
    var id = route.id || slug(title);
    var tags = content.querySelector('#abTags').value.split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);

    var wantPinned = !!content.querySelector('#abPinned').checked;
    var dateInput = content.querySelector('#abDate');
    var dateValue = normalizeEditorDate(dateInput ? dateInput.value : '');
    var publishAt = null;
    if (status === 'scheduled') {
      var scheduleInput = content.querySelector('#abSchedule');
      publishAt = dateTimeLocalToMs(scheduleInput ? scheduleInput.value : '');
      if (!publishAt || publishAt <= Date.now()) { toast(t('admin.editor.scheduleRequired'), 'err'); return; }
    }

    var seriesValue = content.querySelector('#abSeries').value.trim();
    var ogImage = content.querySelector('#abOgImage').value || '';
    var ogFingerprint = ogSourceFingerprint(title, dateValue, tags, seriesValue);
    var onlineNow = !(typeof navigator !== 'undefined' && navigator.onLine === false);
    if (cloudOn() && onlineNow && content.querySelector('#abOgAuto').checked && (!ogImage || content.__ogSource !== ogFingerprint)) {
      try {
        ogImage = await generateShareImage(content, id, title, dateValue.slice(0, 10), tags, seriesValue);
        content.querySelector('#abOgImage').value = ogImage;
        content.__ogSource = ogFingerprint;
        updateOgPreview(content, ogImage);
      } catch (e) { /* 分享图失败不阻塞文章保存 */ }
    }

    var post = Object.assign({}, content.__editingPost || {}, {
      id: id, title: title, date: dateValue, publishAt: publishAt,
      series: seriesValue,
      ogImage: ogImage,
      seriesOrder: Math.max(0, Math.floor(Number(content.querySelector('#abSeriesOrder').value) || 0)),
      excerpt: (body.replace(/[#>*`\-!\[\]()]/g, '').slice(0, 120).trim()),
      content: body, cover: content.querySelector('#abCover').value.trim(),
      pinned: wantPinned, tags: tags,
      status: status
    });

    var btn = status === 'published' ? content.querySelector('#abPublish') : (status === 'scheduled' ? content.querySelector('#abScheduleBtn') : content.querySelector('#abSaveDraft'));
    btn.disabled = true;
    var isNew = !route.id;
    try {
      var r = await savePost(post, isNew);
      if (r && (r.ok || r.post)) {
        toast(status === 'published' ? t('admin.editor.saved') : (status === 'scheduled' ? t('admin.editor.scheduled') : t('admin.editor.savedDraft')), 'ok');
        if (cloudOn()) go('/admin/posts'); else {
          toast(t('admin.editor.savedLocal'), 'ok');
        }
      } else {
        toast(t('admin.editor.saveFail'), 'err');
      }
    } catch (e) {
      if (!cloudOn()) { saveStaticPost(post); toast(t('admin.editor.savedDraft'), 'ok'); }
      else if (isNetworkFailure(e)) { queueOfflinePost(post, isNew); toast(t('admin.editor.savedOffline'), 'ok'); }
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
        return '<div class="ab-media-card" data-url="' + esc(m.url) + '" style="cursor:pointer"><div class="ab-media-thumb"><img src="' + esc(m.thumbUrl || m.thumb_url || m.url) + '" alt=""></div><div class="ab-media-meta"><div class="ab-media-name">' + esc(m.name || t('admin.media.colImage')) + '</div></div></div>';
      }).join('') + '</div>') : '<div class="ab-empty"><p>' + t('admin.media.empty') + '</p></div>';
      mask.querySelectorAll('[data-url]').forEach(function (c) { c.addEventListener('click', function () {
        content.querySelector('#abCover').value = c.getAttribute('data-url'); mask.remove(); toast(t('admin.editor.selectMedia'), 'ok');
      }); });
    }).catch(function (e) { mask.querySelector('#abPickerGrid').innerHTML = '<div class="ab-empty"><p>' + t('admin.media.readFail') + '</p></div>'; });
  }

  /* ====================== 文章系列 / 专栏 ====================== */
  function pageSeries(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.series.title') + '</h1><p class="ab-page-sub">' + t('admin.series.desc') + '</p></div>' +
      '<button class="ab-btn primary" data-link="/admin/posts/new">' + icon('pen', 15) + ' ' + t('admin.series.write') + '</button></div>' +
      '<div class="ab-card"><div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>' + t('admin.series.colName') + '</th><th>' + t('admin.series.colCount') + '</th><th>' + t('admin.series.colOrder') + '</th><th class="col-actions">' + t('admin.postList.colActions') + '</th></tr></thead><tbody id="abSeriesBody"></tbody></table></div></div>';
    content.querySelectorAll('[data-link]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); go(a.getAttribute('data-link')); }); });
    loadSeries(content);
  }
  async function loadSeries(content) {
    var body = content.querySelector('#abSeriesBody');
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('site.loading') + '</td></tr>';
    var posts = [];
    try { posts = await listPosts(); } catch (e) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.postList.loadFail') + esc(e.message || e) + '</td></tr>'; return; }
    var groups = {};
    posts.forEach(function (p) {
      var name = String(p.series || '').trim();
      if (!name) return;
      if (!groups[name]) groups[name] = { name: name, posts: [] };
      groups[name].posts.push(p);
    });
    var list = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.series.empty') + '</td></tr>'; return; }
    body.innerHTML = list.map(function (g) {
      var orders = g.posts.map(function (p) { return Number(p.seriesOrder) || 0; }).sort(function (a, b) { return a - b; });
      return '<tr><td><b>' + esc(g.name) + '</b></td><td>' + g.posts.length + '</td><td>' + esc(orders.join(', ')) + '</td>' +
        '<td class="col-actions"><button class="ab-btn sm" data-series-rename="' + esc(enc(g.name)) + '">' + icon('pen', 12) + ' ' + t('admin.tags.rename') + '</button> ' +
        '<button class="ab-btn sm danger" data-series-delete="' + esc(enc(g.name)) + '">' + icon('trash', 12) + ' ' + t('admin.comments.delete') + '</button></td></tr>';
    }).join('');
    body.querySelectorAll('[data-series-rename]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var oldName = dec(btn.getAttribute('data-series-rename'));
        var newName = window.prompt(t('admin.series.renamePrompt'), oldName);
        if (newName == null || !newName.trim() || newName.trim() === oldName) return;
        updateSeriesPosts(content, oldName, newName.trim());
      });
    });
    body.querySelectorAll('[data-series-delete]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = dec(btn.getAttribute('data-series-delete'));
        confirmModal(t('admin.series.delete'), '<p class="ab-muted">' + t('admin.series.deleteConfirm', { name: esc(name) }) + '</p>', function () { updateSeriesPosts(content, name, ''); }, t('admin.comments.delete'));
      });
    });
  }
  async function updateSeriesPosts(content, oldName, newName) {
    var all = [];
    try { all = await listPosts(); } catch (e) { toast(t('admin.series.updateFail') + (e.message || e), 'err'); return; }
    var targets = all.filter(function (p) { return String(p.series || '').trim() === oldName; });
    try {
      for (var i = 0; i < targets.length; i++) {
        var full = await getPost(targets[i].id);
        if (!full) continue;
        full.series = newName;
        if (!newName) full.seriesOrder = 0;
        await savePost(full, false);
      }
      toast(t('admin.series.updated'), 'ok');
      loadSeries(content);
    } catch (e) { toast(t('admin.series.updateFail') + (e.message || e), 'err'); }
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
      '</div><div id="abAiComments" class="ab-ai-comments"></div><div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>' + t('admin.comments.colAuthor') + '</th><th>' + t('admin.comments.colContent') + '</th><th>' + t('admin.comments.colPost') + '</th><th>' + t('admin.comments.colDate') + '</th><th>' + t('comment.like') + '</th><th>' + t('admin.comments.colStatus') + '</th><th class="col-actions">' + t('admin.comments.colActions') + '</th></tr></thead><tbody id="abCmtBody"></tbody></table></div>';
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
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('admin.postList.loading') + '</td></tr>';
    var d;
    try { d = await api('api/comments?status=' + (filter === 'pending' ? 'pending' : 'all')); } catch (e) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px" class="ab-muted">' + t('admin.postList.loadFail') + esc(e.message || e) + '</td></tr>'; return; }
    var list = (d && d.comments) || [];
    var kw = (content.querySelector('#abCmtKw').value || '').trim().toLowerCase();
    if (kw) list = list.filter(function (c) { return ((c.author || '') + ' ' + (c.content || '')).toLowerCase().indexOf(kw) >= 0; });
    if (!list.length) { body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.dashboard.noComments') + '</td></tr>'; return; }
    // 建立 id → 评论 映射，以便展示“回复了某人”的父子关系
    var cmtById = {};
    list.forEach(function (c) { cmtById[c.id] = c; });
    body.innerHTML = list.map(function (c) {
      var st = c.status || 'approved';
      var pinned = !!c.pinned, featured = !!c.featured;
      // 二级及以上回复：标注其父评论，便于后台追踪回复链
      var replyTag = '';
      if (c.parent_id) {
        var parent = cmtById[c.parent_id];
        if (parent) replyTag = ' <span class="ab-cmt-replyto">' + esc(t('comment.replyTo', { author: parent.author || t('admin.comments.anonymous') })) + '</span>';
        else replyTag = ' <span class="ab-cmt-replyto">#' + esc(c.parent_id) + '</span>';
      }
      var badges = '';
      if (pinned) badges += ' <span class="ab-cmt-badge pinned">' + icon('pin', 11) + t('comment.pinned') + '</span>';
      if (featured) badges += ' <span class="ab-cmt-badge featured">' + icon('star', 11) + t('comment.featured') + '</span>';
      var actions = '';
      if (st === 'pending') actions += '<button class="ab-btn sm primary" data-approve="' + enc(c.id) + '">' + icon('check', 13) + ' ' + t('admin.comments.approve') + '</button> ';
      actions += '<button class="ab-btn sm' + (pinned ? ' primary' : '') + '" data-pin="' + enc(c.id) + '" data-on="' + (pinned ? '1' : '0') + '">' + icon('pin', 13) + ' ' + (pinned ? t('comment.unpinComment') : t('comment.pinComment')) + '</button> ';
      actions += '<button class="ab-btn sm' + (featured ? ' primary' : '') + '" data-feat="' + enc(c.id) + '" data-on="' + (featured ? '1' : '0') + '">' + icon('star', 13) + ' ' + (featured ? t('comment.unfeature') : t('comment.feature')) + '</button> ';
      actions += '<button class="ab-btn sm danger" data-delcmt="' + enc(c.id) + '">' + icon('trash', 13) + ' ' + t('admin.comments.delete') + '</button>';
      return '<tr' + (pinned ? ' class="ab-cmt-pinned"' : '') + '>' +
        '<td>' + esc(c.author || t('admin.comments.anonymous')) + '</td>' +
        '<td style="max-width:320px">' + esc((c.content || '').slice(0, 120)) + replyTag + badges + '</td>' +
        '<td>' + esc(c.post_title || c.post_id || '—') + '</td>' +
        '<td>' + esc(fmtDate(c.date)) + '</td>' +
        '<td style="text-align:center;white-space:nowrap">' + icon('heart', 12) + ' ' + esc(String(Number(c.likes) || 0)) + '</td>' +
        '<td><span class="ab-status ' + st + '">' + (st === 'pending' ? t('admin.comments.pendingStatus') : t('admin.comments.approved')) + '</span></td>' +
        '<td class="col-actions">' + actions + '</td>' +
      '</tr>';
    }).join('');
    body.querySelectorAll('[data-approve]').forEach(function (b) { b.addEventListener('click', function () { approveComment(content, dec(b.getAttribute('data-approve')), filter, b.closest('tr')); }); });
    body.querySelectorAll('[data-pin]').forEach(function (b) { b.addEventListener('click', function () { toggleCommentFlag(content, b, 'pinned'); }); });
    body.querySelectorAll('[data-feat]').forEach(function (b) { b.addEventListener('click', function () { toggleCommentFlag(content, b, 'featured'); }); });
    body.querySelectorAll('[data-delcmt]').forEach(function (b) {
      b.addEventListener('click', function () {
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
      });
    });
  }
  // 切换评论置顶 / 精选（就地更新按钮与徽章，不重拉整表）
  async function toggleCommentFlag(content, btn, key) {
    var attr = key === 'pinned' ? 'data-pin' : 'data-feat';
    var cid = dec(btn.getAttribute(attr));
    var on = btn.getAttribute('data-on') === '1';
    var target = !on;
    btn.disabled = true;
    try {
      var payload = {};
      payload[key] = target;
      await api('api/comments/' + enc(cid), { method: 'PUT', body: JSON.stringify(payload) });
      btn.setAttribute('data-on', target ? '1' : '0');
      btn.classList.toggle('primary', target);
      if (key === 'pinned') {
        btn.innerHTML = icon('pin', 13) + ' ' + (target ? t('comment.unpinComment') : t('comment.pinComment'));
      } else {
        btn.innerHTML = icon('star', 13) + ' ' + (target ? t('comment.unfeature') : t('comment.feature'));
      }
      var tr = btn.closest('tr');
      if (tr) {
        if (key === 'pinned') tr.classList.toggle('ab-cmt-pinned', target);
        var cell = tr.cells && tr.cells[1];
        if (cell) {
          var badge = cell.querySelector('.ab-cmt-badge.' + key);
          if (target && !badge) {
            var span = document.createElement('span');
            span.className = 'ab-cmt-badge ' + key;
            span.innerHTML = (key === 'pinned' ? icon('pin', 11) + t('comment.pinned') : icon('star', 11) + t('comment.featured'));
            cell.appendChild(span);
          } else if (!target && badge) {
            badge.remove();
          }
        }
      }
    } catch (e) {
      toast(t('admin.postList.opFail') + (e.message || e), 'err');
    } finally {
      btn.disabled = false;
    }
  }  async function approveComment(content, cid, filter, tr) {
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
  var mediaState = { list: [], kw: '', page: 1, per: 24, selected: {} };
  function pageMedia(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.media.title') + '</h1><p class="ab-page-sub">' + t('admin.media.desc') + '</p><p class="ab-hint" style="margin:6px 0 0">' + t('admin.media.compressHint') + '</p></div>' +
      (cloudOn() ? '<label class="ab-btn primary">' + icon('upload', 15) + ' ' + t('admin.media.upload') + '<input type="file" id="abUpload" accept="image/*" multiple hidden></label>' : '<span class="ab-chip" style="background:var(--ab-primary-weak);color:var(--ab-primary)">' + t('admin.categories.staticHint') + '</span>') + '</div>' +
      (cloudOn() ? '' : '<div class="ab-card"><div class="ab-empty"><div class="ab-empty-ico">🖼</div><p>' + t('admin.media.cloudOnly') + '</p></div></div>');
    if (!cloudOn()) return;
    content.innerHTML += '<div class="ab-toolbar"><div class="ab-search"><input class="ab-input" id="abMediaKw" placeholder="' + t('admin.media.search') + '"></div>' +
      '<div class="ab-row" style="gap:10px;align-items:center;flex-wrap:wrap"><label class="ab-hint" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin:0"><input type="checkbox" id="abMediaAll"> ' + t('admin.media.selectAll') + '</label>' +
      '<span class="ab-muted" id="abMediaSelInfo"></span>' +
      '<button class="ab-btn danger" id="abMediaBatchDel" disabled>' + icon('trash', 14) + ' ' + t('admin.media.batchDelete') + '</button></div></div>' +
      '<div class="ab-media-grid" id="abMediaGrid"><span class="ab-spin"></span></div><div class="ab-pagination" id="abMediaPage"></div>';
    var up = content.querySelector('#abUpload');
    up.addEventListener('change', function () { uploadFiles(content, up.files); });
    var kw = content.querySelector('#abMediaKw');
    kw.value = mediaState.kw;
    kw.addEventListener('input', debounce(function () { mediaState.kw = (kw.value || '').trim().toLowerCase(); mediaState.page = 1; renderMediaGrid(content); }, 200));
    content.querySelector('#abMediaAll').addEventListener('change', function () { toggleSelectAll(content, this.checked); });
    content.querySelector('#abMediaBatchDel').addEventListener('click', function () { batchDeleteMedia(content); });
    mediaState.selected = {};
    loadMedia(content);
  }
  async function loadMedia(content) {
    var grid = content.querySelector('#abMediaGrid');
    if (!grid) return;
    grid.innerHTML = '<span class="ab-spin"></span> ' + t('admin.postList.loading');
    try {
      var d = await api('api/media');
      mediaState.list = ((d && d.media) || []).slice();
      mediaState.selected = {};
      renderMediaGrid(content);
    } catch (e) { grid.innerHTML = '<div class="ab-empty"><p>' + t('admin.postList.loadFail') + esc(e.message || e) + '</p></div>'; }
  }
  function mediaFiltered() {
    var kw = mediaState.kw;
    if (!kw) return mediaState.list;
    return mediaState.list.filter(function (m) { return String(m.name || '').toLowerCase().indexOf(kw) >= 0; });
  }
  function renderMediaGrid(content) {
    var grid = content.querySelector('#abMediaGrid');
    var pg = content.querySelector('#abMediaPage');
    if (!grid) return;
    var list = mediaFiltered();
    var per = mediaState.per;
    var totalPages = Math.max(1, Math.ceil(list.length / per));
    if (mediaState.page > totalPages) mediaState.page = totalPages;
    var page = mediaState.page;
    var view = list.slice((page - 1) * per, page * per);
    grid.innerHTML = view.length ? view.map(function (m) {
      var sel = !!mediaState.selected[m.id];
      return '<div class="ab-media-card' + (sel ? ' selected' : '') + '">' +
        '<label class="ab-media-check"><input type="checkbox" data-pick="' + enc(m.id) + '"' + (sel ? ' checked' : '') + '></label>' +
        '<div class="ab-media-thumb"><img src="' + esc(m.thumbUrl || m.thumb_url || m.url) + '" alt="' + esc(m.name || '') + '"></div>' +
        '<div class="ab-media-meta"><div class="ab-media-name">' + esc(m.name || t('admin.media.colImage')) + '</div><div class="ab-media-size">' + fmtSize(m.size) + '</div></div>' +
        '<div class="ab-media-actions"><button class="ab-btn sm" data-copy="' + enc(m.url) + '">' + t('admin.media.copy') + '</button><button class="ab-btn sm danger" data-delmedia="' + enc(m.id) + '">' + t('admin.media.delete') + '</button></div>' +
      '</div>';
    }).join('') : '<div class="ab-card ab-empty" style="grid-column:1/-1"><div class="ab-empty-ico">🖼</div><p>' + (mediaState.kw ? t('admin.media.noMatch') : t('admin.media.empty')) + '</p></div>';
    if (pg) {
      pg.innerHTML = list.length > per
        ? (page > 1 ? '<button class="ab-page-btn" data-p="' + (page - 1) + '">' + t('pagination.prev') + '</button>' : '') +
          '<button class="ab-page-btn active">' + page + ' / ' + totalPages + '</button>' +
          (page < totalPages ? '<button class="ab-page-btn" data-p="' + (page + 1) + '">' + t('pagination.next') + '</button>' : '')
        : '';
      pg.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { mediaState.page = parseInt(b.getAttribute('data-p'), 10) || 1; renderMediaGrid(content); }); });
    }
    grid.querySelectorAll('[data-pick]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = dec(cb.getAttribute('data-pick'));
        if (cb.checked) mediaState.selected[id] = true; else delete mediaState.selected[id];
        var card = cb.closest('.ab-media-card');
        if (card) card.classList.toggle('selected', cb.checked);
        syncMediaSelection(content);
      });
    });
    grid.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyText(dec(b.getAttribute('data-copy'))); toast(t('admin.media.copied'), 'ok'); }); });
    grid.querySelectorAll('[data-delmedia]').forEach(function (b) { b.addEventListener('click', function () {
      var mid = dec(b.getAttribute('data-delmedia'));
      confirmModal(t('admin.media.delete'), '<p class="ab-muted">' + t('admin.media.deleteConfirm') + '</p>', async function () {
        try { await api('api/media/' + enc(mid), { method: 'DELETE' }); toast(t('admin.media.deleted'), 'ok'); loadMedia(content); } catch (e) { toast(t('admin.postList.opFail') + (e.message || e), 'err'); }
      }, t('admin.comments.delete'));
    }); });
    syncMediaSelection(content);
  }
  function syncMediaSelection(content) {
    var ids = Object.keys(mediaState.selected);
    var info = content.querySelector('#abMediaSelInfo');
    var btn = content.querySelector('#abMediaBatchDel');
    var all = content.querySelector('#abMediaAll');
    if (info) info.textContent = ids.length ? t('admin.media.selectedItems', { n: ids.length }) : '';
    if (btn) btn.disabled = ids.length === 0;
    if (all) {
      var list = mediaFiltered();
      all.checked = list.length > 0 && list.every(function (m) { return !!mediaState.selected[m.id]; });
    }
  }
  function toggleSelectAll(content, on) {
    mediaFiltered().forEach(function (m) { if (on) mediaState.selected[m.id] = true; else delete mediaState.selected[m.id]; });
    renderMediaGrid(content);
  }
  async function batchDeleteMedia(content) {
    var ids = Object.keys(mediaState.selected);
    if (!ids.length) return;
    confirmModal(t('admin.media.batchDelete'), '<p class="ab-muted">' + t('admin.media.batchConfirm', { n: ids.length }) + '</p>', async function () {
      var ok = 0;
      for (var i = 0; i < ids.length; i++) {
        try { await api('api/media/' + enc(ids[i]), { method: 'DELETE' }); ok++; } catch (e) {}
      }
      toast(ok ? t('admin.media.batchDeleted', { n: ok }) : t('admin.postList.opFail'), ok ? 'ok' : 'err');
      mediaState.selected = {};
      loadMedia(content);
    }, t('admin.comments.delete'));
  }

  function copyText(t) {
    try { if (navigator.clipboard) navigator.clipboard.writeText(t); else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } } catch (e) {}
  }
  async function uploadImageAsset(file) {
    var packed = await compressImageFile(file);
    var mainFile = packed.file;
    if (mainFile.size > 10 * 1048576) throw new Error(t('admin.media.tooLarge'));
    var u = await api('api/media/upload-url', { method: 'POST', body: JSON.stringify({ filename: mainFile.name, size: mainFile.size, makeThumb: !!packed.thumb }) });
    if (!u || !u.uploadUrl) throw new Error((u && u.error) || t('admin.media.uploadFail'));
    if (!u.publicUrl) throw new Error(t('admin.media.r2Missing'));
    async function put(url, body, type) {
      await new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', type || 'application/octet-stream');
        xhr.onload = function () {
          if (xhr.status >= 200 && xhr.status < 300) { resolve(true); return; }
          reject(new Error('HTTP ' + xhr.status + r2Detail(xhr)));
        };
        xhr.onerror = function () { reject(new Error('HTTP 0：预检被拦截 / CORS 或网络中断')); };
        xhr.send(body);
      });
    }
    await put(u.uploadUrl, mainFile, u.contentType || mainFile.type);
    if (packed.thumb && u.thumbUploadUrl) await put(u.thumbUploadUrl, packed.thumb, 'image/webp');
    var registered = await api('api/media', { method: 'POST', body: JSON.stringify({ name: mainFile.name, url: u.publicUrl, thumbUrl: u.thumbPublicUrl || '', type: u.contentType || mainFile.type, size: mainFile.size }) });
    return { media: registered && registered.media, packed: packed };
  }
  async function uploadFiles(content, files) {
    if (!files || !files.length) return;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (!/^image\//.test(file.type)) { toast(file.name + ' ' + t('admin.media.notImage'), 'err'); continue; }
      if (file.size > 30 * 1048576) { toast(file.name + ' ' + t('admin.media.tooLarge'), 'err'); continue; }
      try {
        toast(t('admin.media.compressing') + ' ' + file.name, 'ok');
        var result = await uploadImageAsset(file);
        var saved = result.packed.compressed ? Math.max(0, Math.round((1 - result.packed.file.size / Math.max(1, result.packed.originalSize)) * 100)) : 0;
        toast(t('admin.media.uploaded') + ' ' + result.packed.file.name + (saved ? ' · ' + t('admin.media.compressed', { percent: saved }) : ''), 'ok');
      } catch (e) { toast(t('admin.media.uploadFail') + (e.message || e), 'err'); }
    }
    loadMedia(content);
  }

  /* ====================== 邮件订阅管理 ====================== */
  function subscriberStatusLabel(status) {
    if (status === 'active') return t('admin.subscribers.active');
    if (status === 'pending') return t('admin.subscribers.pending');
    return t('admin.subscribers.unsubscribed');
  }
  var subState = { list: [], kw: '', status: 'all', page: 1, per: 20 };
  function pageSubscribers(content) {
    content.innerHTML = '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.subscribers.title') + '</h1><p class="ab-page-sub">' + t('admin.subscribers.desc') + '</p></div>' +
      '<div class="ab-row" style="gap:8px"><button class="ab-btn" id="abSubExport">' + icon('download', 14) + ' ' + t('admin.subscribers.export') + '</button><button class="ab-btn" id="abSubRefresh">' + icon('refresh', 14) + ' ' + t('admin.backup.refresh') + '</button></div></div>' +
      '<div class="ab-grid cols-3" id="abSubStats"></div><div class="ab-card" id="abSubNotice" style="margin-bottom:16px"></div>' +
      '<div class="ab-toolbar"><div class="ab-search"><input class="ab-input" id="abSubKw" placeholder="' + t('admin.subscribers.search') + '"></div>' +
      '<select class="ab-select" id="abSubStatus" style="max-width:170px"><option value="all">' + t('admin.subscribers.filterAll') + '</option><option value="active">' + t('admin.subscribers.active') + '</option><option value="pending">' + t('admin.subscribers.pending') + '</option><option value="unsubscribed">' + t('admin.subscribers.unsubscribed') + '</option></select></div>' +
      '<div class="ab-card"><div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>' + t('admin.subscribers.colEmail') + '</th><th>' + t('admin.subscribers.colStatus') + '</th><th>' + t('admin.subscribers.colDate') + '</th><th class="col-actions">' + t('admin.postList.colActions') + '</th></tr></thead><tbody id="abSubBody"></tbody></table></div><div class="ab-pagination" id="abSubPage" style="padding:0 4px 6px"></div></div>';
    var kw = content.querySelector('#abSubKw');
    kw.value = subState.kw;
    kw.addEventListener('input', debounce(function () { subState.kw = (kw.value || '').trim().toLowerCase(); subState.page = 1; renderSubscribers(content); }, 200));
    var st = content.querySelector('#abSubStatus');
    st.value = subState.status;
    st.addEventListener('change', function () { subState.status = st.value; subState.page = 1; renderSubscribers(content); });
    content.querySelector('#abSubRefresh').addEventListener('click', function () { loadSubscribers(content); });
    content.querySelector('#abSubExport').addEventListener('click', function () { exportSubscribers(content); });
    loadSubscribers(content);
  }
  async function loadSubscribers(content) {
    var body = content.querySelector('#abSubBody');
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('site.loading') + '</td></tr>';
    try {
      var d = await api('api/admin/subscribers');
      var counts = (d && d.counts) || { total: 0, active: 0, pending: 0, unsubscribed: 0 };
      content.querySelector('#abSubStats').innerHTML = [
        { label: t('admin.subscribers.total'), value: counts.total, icon: 'send' },
        { label: t('admin.subscribers.active'), value: counts.active, icon: 'check' },
        { label: t('admin.subscribers.pending'), value: counts.pending, icon: 'clock' }
      ].map(function (x) { return '<div class="ab-card ab-stat"><div class="ab-stat-label">' + icon(x.icon, 16) + esc(x.label) + '</div><div class="ab-stat-value">' + esc(String(x.value)) + '</div></div>'; }).join('');
      content.querySelector('#abSubNotice').innerHTML = d && d.enabled ? '<div class="ab-row" style="gap:8px;align-items:center"><span class="ab-chip">' + icon('send', 13) + ' Resend</span><b>' + t('admin.subscribers.enabled') + '</b></div>' : '<div class="ab-row" style="gap:8px;align-items:center"><span class="ab-chip">' + t('admin.backup.disabledChip') + '</span><b>' + t('admin.subscribers.disabled') + '</b><span class="ab-muted">RESEND_API_KEY / BLOG_MAIL_FROM / SITE_URL</span></div>';
      subState.list = ((d && d.subscribers) || []).slice();
      renderSubscribers(content);
    } catch (e) { body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px" class="ab-muted">' + esc(e.message || e) + '</td></tr>'; }
  }
  /** 订阅者列表：关键字 + 状态过滤，分页渲染（每页 20） */
  function filteredSubscribers() {
    var list = subState.list;
    if (subState.status !== 'all') list = list.filter(function (s) { return s.status === subState.status; });
    if (subState.kw) list = list.filter(function (s) { return String(s.email || '').toLowerCase().indexOf(subState.kw) >= 0; });
    return list;
  }
  function renderSubscribers(content) {
    var body = content.querySelector('#abSubBody');
    var pg = content.querySelector('#abSubPage');
    if (!body) return;
    var list = filteredSubscribers();
    var per = subState.per;
    var totalPages = Math.max(1, Math.ceil(list.length / per));
    if (subState.page > totalPages) subState.page = totalPages;
    var page = subState.page;
    var view = list.slice((page - 1) * per, page * per);
    if (!view.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:34px" class="ab-muted">' + ((subState.kw || subState.status !== 'all') ? t('admin.subscribers.noMatch') : t('admin.subscribers.empty')) + '</td></tr>';
    } else {
      body.innerHTML = view.map(function (sub) {
        return '<tr><td>' + esc(sub.email) + '</td><td><span class="ab-status ' + (sub.status === 'active' ? 'published' : sub.status === 'pending' ? 'scheduled' : 'draft') + '">' + esc(subscriberStatusLabel(sub.status)) + '</span></td><td>' + esc(fmtTimestamp(sub.created_at)) + '</td><td class="col-actions"><button class="ab-btn sm danger" data-sub-delete="' + esc(sub.id) + '">' + icon('trash', 12) + ' ' + t('admin.comments.delete') + '</button></td></tr>';
      }).join('');
      body.querySelectorAll('[data-sub-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-sub-delete');
          confirmModal(t('admin.comments.delete'), '<p class="ab-muted">' + t('admin.subscribers.deleteConfirm') + '</p>', async function () {
            try { await api('api/admin/subscribers/' + enc(id), { method: 'DELETE' }); toast(t('admin.subscribers.deleted'), 'ok'); loadSubscribers(content); }
            catch (e) { toast(t('admin.subscribers.deleteFail') + (e.message || e), 'err'); }
          }, t('admin.comments.delete'));
        });
      });
    }
    if (pg) {
      pg.innerHTML = list.length > per
        ? (page > 1 ? '<button class="ab-page-btn" data-p="' + (page - 1) + '">' + t('pagination.prev') + '</button>' : '') +
          '<button class="ab-page-btn active">' + page + ' / ' + totalPages + '</button>' +
          (page < totalPages ? '<button class="ab-page-btn" data-p="' + (page + 1) + '">' + t('pagination.next') + '</button>' : '')
        : '';
      pg.querySelectorAll('[data-p]').forEach(function (b) { b.addEventListener('click', function () { subState.page = parseInt(b.getAttribute('data-p'), 10) || 1; renderSubscribers(content); }); });
    }
  }
  async function exportSubscribers(content) {
    try {
      // 导出遵循当前搜索 / 状态筛选；未筛选时导出全部
      var list = subState.list.length ? filteredSubscribers() : ((await api('api/admin/subscribers')).subscribers || []);
      var rows = [['email', 'status', 'created_at']];
      list.forEach(function (s) { rows.push([s.email, s.status, s.created_at ? new Date(Number(s.created_at) || 0).toISOString() : '']); });
      var csv = rows.map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
      transferDownloadText('subscribers-' + transferStamp() + '.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
    } catch (e) { toast(t('admin.subscribers.exportFail') + (e.message || e), 'err'); }
  }

  /* ====================== 备份与恢复 ====================== */
  function backupReasonLabel(reason) {
    if (reason === 'auto') return t('admin.backup.reasonAuto');
    if (reason === 'pre-restore') return t('admin.backup.reasonSafety');
    return t('admin.backup.reasonManual');
  }
  function pageBackups(content) {
    content.innerHTML =
      '<div class="ab-page-head"><div><h1 class="ab-page-title">' + t('admin.backup.title') + '</h1><p class="ab-page-sub">' + t('admin.backup.desc') + '</p></div>' +
        '<div class="ab-row" style="gap:8px"><button class="ab-btn" id="abBackupRefresh">' + icon('refresh', 14) + ' ' + t('admin.backup.refresh') + '</button>' +
        '<button class="ab-btn primary" id="abBackupCreate">' + icon('save', 14) + ' ' + t('admin.backup.create') + '</button></div></div>' +
      '<div class="ab-card" id="abBackupNotice" style="margin-bottom:16px"></div>' +
      '<div class="ab-card"><div class="ab-section-title">' + icon('save', 16) + ' ' + t('admin.backup.history') + '</div>' +
        '<div class="ab-table-wrap" style="margin-top:12px"><table class="ab-table"><thead><tr><th>' + t('admin.backup.colTime') + '</th><th>' + t('admin.backup.colReason') + '</th><th>' + t('admin.backup.colSize') + '</th><th class="col-actions">' + t('admin.postList.colActions') + '</th></tr></thead><tbody id="abBackupBody"></tbody></table></div></div>';
    content.querySelector('#abBackupRefresh').addEventListener('click', function () { loadBackups(content); });
    content.querySelector('#abBackupCreate').addEventListener('click', function () { createBackupManual(content); });
    loadBackups(content);
  }
  async function loadBackups(content) {
    var body = content.querySelector('#abBackupBody');
    var notice = content.querySelector('#abBackupNotice');
    body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px"><span class="ab-spin"></span> ' + t('site.loading') + '</td></tr>';
    try {
      var d = await api('api/admin/backups');
      var configured = !!(d && d.configured);
      var list = (d && d.backups) || [];
      notice.innerHTML = configured
        ? '<div class="ab-row" style="align-items:center;gap:8px;flex-wrap:wrap"><span class="ab-chip">' + icon('cloud', 13) + ' R2</span><b>' + t('admin.backup.enabled') + '</b><span class="ab-muted">' + t('admin.backup.schedule') + '</span></div>'
        : '<div class="ab-row" style="align-items:center;gap:8px;flex-wrap:wrap"><span class="ab-chip">' + t('admin.backup.disabledChip') + '</span><b>' + t('admin.backup.disabled') + '</b><span class="ab-muted">' + t('admin.backup.configureHint') + '</span></div>';
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:34px" class="ab-muted">' + t('admin.backup.empty') + '</td></tr>';
        return;
      }
      body.innerHTML = list.map(function (b) {
        return '<tr><td>' + esc(fmtTimestamp(b.createdAt)) + '</td><td><span class="ab-chip">' + esc(backupReasonLabel(b.reason)) + '</span></td><td>' + esc(fmtSize(b.size)) + '</td>' +
          '<td class="col-actions"><button class="ab-btn sm" data-backup-download="' + esc(b.id) + '">' + icon('download', 12) + ' ' + t('admin.backup.download') + '</button> ' +
          '<button class="ab-btn sm" data-backup-restore="' + esc(b.id) + '">' + icon('refresh', 12) + ' ' + t('admin.backup.restore') + '</button> ' +
          '<button class="ab-btn sm danger" data-backup-delete="' + esc(b.id) + '">' + icon('trash', 12) + ' ' + t('admin.comments.delete') + '</button></td></tr>';
      }).join('');
      body.querySelectorAll('[data-backup-download]').forEach(function (btn) {
        btn.addEventListener('click', function () { downloadBackup(btn.getAttribute('data-backup-download')); });
      });
      body.querySelectorAll('[data-backup-restore]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-backup-restore');
          confirmModal(t('admin.backup.restore'), '<p class="ab-muted">' + t('admin.backup.restoreConfirm') + '</p>', async function () {
            try {
              btn.disabled = true;
              await api('api/admin/backups/' + enc(id) + '/restore', { method: 'POST', body: '{}' });
              toast(t('admin.backup.restored'), 'ok');
              setTimeout(function () { location.reload(); }, 900);
            } catch (e) { btn.disabled = false; toast(t('admin.backup.restoreFail') + (e.message || e), 'err'); }
          }, t('admin.backup.restore'));
        });
      });
      body.querySelectorAll('[data-backup-delete]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-backup-delete');
          confirmModal(t('admin.comments.delete'), '<p class="ab-muted">' + t('admin.backup.deleteConfirm') + '</p>', async function () {
            try { await api('api/admin/backups/' + enc(id), { method: 'DELETE' }); toast(t('admin.backup.deleted'), 'ok'); loadBackups(content); }
            catch (e) { toast(t('admin.backup.deleteFail') + (e.message || e), 'err'); }
          }, t('admin.comments.delete'));
        });
      });
    } catch (e) {
      notice.innerHTML = '<span class="ab-muted">' + esc(t('admin.backup.loadFail') + (e.message || e)) + '</span>';
      body.innerHTML = '';
    }
  }
  async function createBackupManual(content) {
    var btn = content.querySelector('#abBackupCreate');
    var old = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = icon('spinner', 13) + ' ' + t('admin.backup.creating');
    try {
      await api('api/admin/backups', { method: 'POST', body: '{}' });
      toast(t('admin.backup.created'), 'ok');
      await loadBackups(content);
    } catch (e) { toast(t('admin.backup.createFail') + (e.message || e), 'err'); }
    finally { btn.disabled = false; btn.innerHTML = old; }
  }
  async function downloadBackup(id) {
    try {
      var data = await api('api/admin/backups/' + enc(id));
      transferDownloadText('qingyu-backup-' + id + '.json', JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    } catch (e) { toast(t('admin.backup.downloadFail') + (e.message || e), 'err'); }
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
      announceEnabled: !!site.announceEnabled,
      announceText: site.announceText || '',
      announceLink: site.announceLink || '',
      announceLinkText: site.announceLinkText || '',
      announceClosable: site.announceClosable !== false,
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
        announceEnabled: content.querySelector('#abAnnounceEnabled') ? content.querySelector('#abAnnounceEnabled').checked : settingsDraft.site.announceEnabled,
        announceText: content.querySelector('#abAnnounceText') ? val(content, '#abAnnounceText') : settingsDraft.site.announceText,
        announceLink: content.querySelector('#abAnnounceLink') ? val(content, '#abAnnounceLink') : settingsDraft.site.announceLink,
        announceLinkText: content.querySelector('#abAnnounceLinkText') ? val(content, '#abAnnounceLinkText') : settingsDraft.site.announceLinkText,
        announceClosable: content.querySelector('#abAnnounceClosable') ? content.querySelector('#abAnnounceClosable').checked : settingsDraft.site.announceClosable,
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
    if (content.querySelector('#abAnnounceEnabled')) content.querySelector('#abAnnounceEnabled').checked = !!site.announceEnabled;
    if (content.querySelector('#abAnnounceText')) content.querySelector('#abAnnounceText').value = site.announceText || '';
    if (content.querySelector('#abAnnounceLink')) content.querySelector('#abAnnounceLink').value = site.announceLink || '';
    if (content.querySelector('#abAnnounceLinkText')) content.querySelector('#abAnnounceLinkText').value = site.announceLinkText || '';
    if (content.querySelector('#abAnnounceClosable')) content.querySelector('#abAnnounceClosable').checked = site.announceClosable !== false;
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
        '<div class="ab-section-title" style="margin-top:14px">' + icon('spark', 15) + ' ' + t('admin.settings.announceTitle') + '</div>' +
        '<div class="ab-field"><label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" id="abAnnounceEnabled"> ' + t('admin.settings.announceEnable') + '</label></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.announceText') + '</label><textarea class="ab-textarea" id="abAnnounceText" style="min-height:60px"></textarea></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.announceLink') + '</label><input class="ab-input" id="abAnnounceLink" placeholder="/about"></div>' +
        '<div class="ab-field"><label class="ab-label">' + t('admin.settings.announceLinkText') + '</label><input class="ab-input" id="abAnnounceLinkText"></div>' +
        '<div class="ab-field"><label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer"><input type="checkbox" id="abAnnounceClosable"> ' + t('admin.settings.announceClosable') + '</label></div>' +
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
        copyright: site.copyright || '', footerText: site.footerText || '', about: site.about || '',
        announceEnabled: !!site.announceEnabled, announceText: site.announceText || '',
        announceLink: site.announceLink || '', announceLinkText: site.announceLinkText || '',
        announceClosable: site.announceClosable !== false
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
  if (!window.__qyOfflineSyncBound) {
    window.__qyOfflineSyncBound = true;
    window.addEventListener('online', function () { flushOfflineQueue(false); });
  }
  if (cloudOn()) flushOfflineQueue(true);

  window.QingyuAdmin = {
    mount: mount,
    openPwdModal: openPasswordModal,
    _transfer: {
      postToMarkdown: transferPostMarkdown,
      parseMarkdown: transferParseMarkdown,
      parseJson: transferParseJson,
      backup: transferBackupJson,
      zip: transferZipForPosts
    },
    _offline: { read: readOfflineQueue, queue: queueOfflinePost, flush: flushOfflineQueue, isNetworkFailure: isNetworkFailure },
    _editor: {
      toDateTimeLocal: toDateTimeLocal,
      normalizeEditorDate: normalizeEditorDate,
      fmtPostDate: fmtPostDate
    }
  };

  /* app.js 先于本脚本执行时，初次 route() 因 QingyuAdmin 尚未定义而走了旧后台渲染。
   * 本脚本加载完成后，若当前已在后台路由，重新分发一次路由以挂载新版后台 UI。 */
  try {
    var _p = (typeof window.currentRoute === 'function') ? window.currentRoute().path : (location.pathname || '/');
    if (_p === '/write' || _p === '/admin' || _p.indexOf('/admin/') === 0 || /^\/posts\/[^\/]+\/edit$/.test(_p) || _p === '/posts/edit') {
      if (typeof window.route === 'function') window.route();
    }
  } catch (e) {}
})();
