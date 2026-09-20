/* ============================================================================
 * Qingyu'Blog · 前端逻辑（app.js）
 * ----------------------------------------------------------------------------
 * 包含：列表 / 详情 / 写作 / 搜索 / 标签 / 归档 / 评论 / TOC / 代码高亮 / 统计
 * 版本 v2.1.0 ｜ 侧边导航已集成 ｜ 2026-08-22
 * ============================================================================ */
'use strict';

var BLOG_VERSION = '2.7.0';

/* ---------- 全局缓存 ---------- */
var _searchOpen = false;   // 顶部导航搜索是否展开
var _searchDocBound = false;   // document 级外部点击监听是否已绑定
var _commentsCache = {};
var _statsCache = {};

/* ---------- Smoji 表情库 ---------- */
var _smojiPicker = null;
var _smojiTrigger = null;
var _smojiCssLoaded = false;
var _smojiLibReady = null;

function destroySmojiPicker() {
  if (_smojiPicker && typeof _smojiPicker.destroy === 'function') { try { _smojiPicker.destroy(); } catch (e) {} }
  _smojiPicker = null;
  _smojiTrigger = null;
}

function _loadSmojiCss() {
  if (_smojiCssLoaded) return Promise.resolve();
  return new Promise(function (resolve) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = appRoot() + 'libs/smoji/style.css';
    link.onload = function () { _smojiCssLoaded = true; resolve(); };
    link.onerror = function () { _smojiCssLoaded = true; resolve(); };
    document.head.appendChild(link);
  });
}

function _loadSmojiScript(src) {
  return new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = src;
    script.onload = function () { resolve(); };
    script.onerror = function () { reject(new Error('Smoji load failed: ' + src)); };
    document.head.appendChild(script);
  });
}

function _loadSmojiLib() {
  if (_smojiLibReady) return _smojiLibReady;
  var libP = window.SmojiLib ? Promise.resolve() : _loadSmojiScript(appRoot() + 'libs/smoji/smoji.global.js');
  var dataP = window.SmojiManifestData ? Promise.resolve() : _loadSmojiScript(appRoot() + 'libs/smoji/smoji.data.js');
  _smojiLibReady = Promise.all([libP, dataP]).then(function () {
    if (!window.SmojiLib) throw new Error('Smoji not loaded');
  }, function (e) { _smojiLibReady = null; throw e; });
  return _smojiLibReady;
}

function _ensureCryptoRandomUUID() {
  try {
    if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
      crypto.randomUUID = function () {
        return 'smoji-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      };
    }
  } catch (e) {}
}

function ensureSmojiPicker(trigger, textarea) {
  if (_smojiPicker && _smojiTrigger === trigger) return Promise.resolve();
  if (_smojiPicker) destroySmojiPicker();
  return _loadSmojiCss()
    .then(function () { return _loadSmojiLib(); })
    .then(function () {
      if (!window.SmojiLib) throw new Error('Smoji not loaded');
      var smoj = window.SmojiLib.ui;
      var man = window.SmojiLib.manifest;
      var mark = window.SmojiLib.marker;
      function getManifest() {
        var localP = null;
        if (window.SmojiManifestData) {
          // 本地内置更丰富表情清单：file:// 直开也能弹出选择器。
          try { localP = Promise.resolve(man.parseSmojiManifest(window.SmojiManifestData, 'https://s3-cdn.zsh.moe/smoji/smoji.json')); } catch (e) {}
        }
        // 在线官方表情清单：能联网时优先展示并合并到选择器里。
        var remoteP = man.loadSmojiManifest('https://s3-cdn.zsh.moe/smoji/smoji.json').catch(function () { return null; });
        return Promise.all([Promise.resolve(localP), remoteP]).then(function (res) {
          var packs = [];
          var seen = {};
          function addPacks(m) {
            if (!m || !Array.isArray(m.packs)) return;
            m.packs.forEach(function (p) {
              if (!seen[p.id]) { seen[p.id] = 1; packs.push(p); }
            });
          }
          // 在线官方表情显示在前面，本地清单补齐后面，避免重复。
          addPacks(res[1]);
          addPacks(res[0]);
          return packs.length ? { version: 1, packs: packs } : null;
        });
      }
      return getManifest().then(function (manifest) {
        if (!manifest || !manifest.packs || !manifest.packs.length) return;
        _ensureCryptoRandomUUID();
        _smojiPicker = smoj.createSmoji({
          trigger: trigger,
          target: smoj.textTarget(textarea, { serialize: mark.smojiMarker }),
          packs: manifest.packs,
          closeOnSelect: true
        });
        _smojiTrigger = trigger;
      });
    });
}

function initSmojiPicker(trigger, textarea) {
  if (!trigger || !textarea || trigger.__smojiBound) return;
  trigger.__smojiBound = true;
  function onClick(e) {
    e.preventDefault();
    if (trigger.__smojiLoading) return;
    trigger.__smojiLoading = true;
    ensureSmojiPicker(trigger, textarea).then(function () {
      if (_smojiPicker && _smojiTrigger === trigger) _smojiPicker.open();
      trigger.removeEventListener('click', onClick);
    }).catch(function () { trigger.__smojiLoading = false; });
  }
  trigger.addEventListener('click', onClick);
}

/* ---------- 基础工具 ---------- */
/* ---------- main theme (dark / light) ---------- */
function themeKey() { return 'qingyu.theme'; }
function getTheme() {
  try { var v = localStorage.getItem(themeKey()); if (v === 'light' || v === 'dark') return v; } catch (e) {}
  try { if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'; } catch (e) {}
  return 'light';
}
function applyTheme(t) {
  if (t !== 'dark') t = 'light';
  try { document.documentElement.setAttribute('data-theme', t); } catch (e) {}
}
function setTheme(t) { applyTheme(t); try { localStorage.setItem(themeKey(), t); } catch (e) {} }
function toggleTheme() { var n = getTheme() === 'dark' ? 'light' : 'dark'; setTheme(n); refreshThemeIcon(); renderAccentSwatches(); renderAccentNativeSelect(); return n; }
/* 统一 SVG 图标：currentColor 描边，自动继承文字色、hover 变主题色 */
function svgIcon(name, size) {
  size = size || 18;
  var s = 'width="' + size + '" height="' + size + '"';
  var c = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
  var I = {
    sun: '<svg ' + s + ' ' + c + '><circle cx="12" cy="12" r="4"/><path d="M12 2.4v2.4M12 19.2v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.4 12h2.4M19.2 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/></svg>',
    moon: '<svg ' + s + ' ' + c + '><path d="M20.5 13.2A8.5 8.5 0 1 1 11 3.5a6.6 6.6 0 0 0 9.5 9.7z"/></svg>',
    pin: '<svg ' + s + ' ' + c + '><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/></svg>',
    lock: '<svg ' + s + ' ' + c + '><rect x="5" y="11" width="14" height="9" rx="1.6"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    eye: '<svg ' + s + ' ' + c + '><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    heart: '<svg ' + s + ' ' + c + '><path d="M12 20s-7-4.6-7-9.3A3.7 3.7 0 0 1 12 7a3.7 3.7 0 0 1 7 3.7C19 15.4 12 20 12 20z"/></svg>',
    cloud: '<svg ' + s + ' ' + c + '><path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.3A3.5 3.5 0 0 1 17.5 18z"/><path d="M12 13v5M9.5 15.5 12 13l2.5 2.5"/></svg>',
    save: '<svg ' + s + ' ' + c + '><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg>',
    external: '<svg ' + s + ' ' + c + '><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    download: '<svg ' + s + ' ' + c + '><path d="M12 4v10M8 11l4 4 4-4M5 19h14"/></svg>',
    upload: '<svg ' + s + ' ' + c + '><path d="M12 20V10M8 13l4-4 4 4M5 5h14"/></svg>',
    file: '<svg ' + s + ' ' + c + '><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
    rss: '<svg ' + s + ' ' + c + '><circle cx="5" cy="18" r="1"/><path d="M4 11a9 9 0 0 1 9 9M4 5a15 15 0 0 1 15 15"/></svg>',
    sitemap: '<svg ' + s + ' ' + c + '><rect x="3" y="4" width="7" height="5" rx="1"/><rect x="14" y="4" width="7" height="5" rx="1"/><rect x="9" y="15" width="7" height="5" rx="1"/><path d="M6.5 9v3h11V9M12.5 12v3"/></svg>',
    spinner: '<svg class="spin-icon" ' + s + ' ' + c + '><path d="M12 3a9 9 0 1 0 9 9" /></svg>',
    question: '<svg ' + s + ' ' + c + '><circle cx="12" cy="12" r="9"/><path d="M9.2 9.6a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 2-2.6 3.6M12 17h.01"/></svg>',
    doc: '<svg ' + s + ' ' + c + '><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 15h5"/></svg>',
    top: '<svg ' + s + ' ' + c + '><path d="M12 20V6"/><path d="M6 11.5 12 5.5l6 6"/></svg>',
    pen: '<svg ' + s + ' ' + c + '><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    logout: '<svg ' + s + ' ' + c + '><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    trash: '<svg ' + s + ' ' + c + '><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6"/></svg>',
    link: '<svg ' + s + ' ' + c + '><path d="M10 14a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 10a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    image: '<svg ' + s + ' ' + c + '><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 18l4.5-4.5 3 3L16 13l4 4"/></svg>',
    quote: '<svg ' + s + ' ' + c + '><path d="M10 7H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v-4H6"/><path d="M20 7h-4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2v-4h-2"/></svg>',
    tag: '<svg ' + s + ' ' + c + '><path d="M3 3h7l11 11-7 7L3 10V3z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    list: '<svg ' + s + ' ' + c + '><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
    check: '<svg ' + s + ' ' + c + '><path d="M4 12.5l5 5L20 6.5"/></svg>',
    send: '<svg ' + s + ' ' + c + '><path d="M3 11l18-8-8 18-2-8-8-2z"/><path d="M21 3 11 13"/></svg>',
    palette: '<svg ' + s + ' ' + c + '><path d="M12 3a9 9 0 1 0 5.4 16.2A2.4 2.4 0 0 0 15.6 17h-.9a2.6 2.6 0 0 1-2.6-2.6c0-1.4 1.1-2.6 2.6-2.6h1.4A3.9 3.9 0 0 0 20.2 8 9 9 0 0 0 12 3z"/><circle cx="7.4" cy="11.3" r="1"/><circle cx="10.6" cy="7.2" r="1"/><circle cx="15.4" cy="8.6" r="1"/></svg>',
    globe: '<svg ' + s + ' ' + c + '><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15.5 15.5 0 0 1 0 18M12 3a15.5 15.5 0 0 0 0 18"/></svg>',
    spark: '<svg ' + s + ' ' + c + '><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
    copy: '<svg ' + s + ' ' + c + '><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    music: '<svg ' + s + ' ' + c + '><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    play: '<svg ' + s + ' ' + c + '><path d="M7 4.5v15l13-7.5z"/></svg>',
    pause: '<svg ' + s + ' ' + c + '><path d="M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z"/></svg>',
    prev: '<svg ' + s + ' ' + c + '><path d="M6 5v14M19 5l-9 7 9 7z"/></svg>',
    next: '<svg ' + s + ' ' + c + '><path d="M18 5v14M5 5l9 7-9 7z"/></svg>',
    volume: '<svg ' + s + ' ' + c + '><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    gauge: '<svg ' + s + ' ' + c + '><path d="M4.5 17.5A8.5 8.5 0 1 1 19.5 17.5"/><path d="M12 14.2 16.8 9.4M3 17.5h18"/></svg>',
    sliders: '<svg ' + s + ' ' + c + '><path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5"/></svg>',
    clock: '<svg ' + s + ' ' + c + '><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2.2"/></svg>',
    refresh: '<svg ' + s + ' ' + c + '><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v4.5h-4.5"/></svg>'
  };
  return I[name] || '';
}
function themeIcon() { return getTheme() === 'dark' ? svgIcon('sun', 18) : svgIcon('moon', 18); }
function refreshThemeIcon() {
  var b = document.querySelector('#themeToggle'); if (b) b.innerHTML = themeIcon();
}

/* ---------- 主题色（accent palette）切换 ----------
 * 与明暗主题正交的第二个维度：localStorage qingyu.accent（缺省 terra = 现有赭橙配色）。
 * 色板定义在 style.css 的 [data-accent=...] 变量块；此处只负责
 * data-accent 属性、持久化、以及取色面板（顶栏弹层 + 移动端侧栏）的渲染与交互。 */
var ACCENT_PALETTES = [
  { id: 'terra',  zh: '赭橙',   en: 'Terra',   light: '#c25e3a', dark: '#e08a63' },
  { id: 'indigo', zh: '黛蓝',   en: 'Indigo',  light: '#2b73af', dark: '#619ac3' },
  { id: 'bamboo', zh: '竹青',   en: 'Bamboo',  light: '#497568', dark: '#1ba784' },
  { id: 'dusk',   zh: '凝夜紫', en: 'Dusk',    light: '#8b2671', dark: '#ad6598' }
];
function accentKey() { return 'qingyu.accent'; }
/* 面板标题内置多语言：不依赖 locales JSON（避免旧 JSON 缓存导致显示成 key 原文） */
var ACCENT_TITLES = {
  'zh-CN': '主题色',
  'en': 'Theme color',
  'ja': 'テーマカラー',
  'ko': '테마 색상',
  'hi': 'थीम रंग'
};
function accentTitle() {
  var loc = (window.__i18n && window.__i18n.getLocale) ? window.__i18n.getLocale() : 'zh-CN';
  return ACCENT_TITLES[loc] || ACCENT_TITLES['zh-CN'];
}
function getAccent() {
  try {
    var v = localStorage.getItem(accentKey());
    for (var i = 0; i < ACCENT_PALETTES.length; i++) if (ACCENT_PALETTES[i].id === v) return v;
  } catch (e) {}
  return 'terra';
}
function applyAccent(a) {
  try { document.documentElement.setAttribute('data-accent', a); } catch (e) {}
}
function setAccent(a) {
  applyAccent(a);
  try { localStorage.setItem(accentKey(), a); } catch (e) {}
  renderAccentSwatches();
  renderAccentNativeSelect();
}
function accentSwatchColor(id) {
  for (var i = 0; i < ACCENT_PALETTES.length; i++) {
    if (ACCENT_PALETTES[i].id === id) return getTheme() === 'dark' ? ACCENT_PALETTES[i].dark : ACCENT_PALETTES[i].light;
  }
  return '#999';
}
/* 桌面弹出面板：2×2 色块（手机端走原生下拉） */
function accentSwatchesHTML() {
  var cur = getAccent();
  var lang = (window.__i18n && window.__i18n.getLocale) ? window.__i18n.getLocale() : '';
  return ACCENT_PALETTES.map(function (p) {
    var active = p.id === cur;
    var label = (lang && lang.indexOf('en') === 0) ? p.en : p.zh;
    return '<button type="button" class="accent-swatch' + (active ? ' active' : '') + '" data-accent="' + p.id + '"'
      + ' title="' + esc(p.en + ' · ' + p.zh) + '" aria-label="' + esc(p.zh) + '" aria-pressed="' + active + '">'
      + '<span class="accent-dot" style="background:' + accentSwatchColor(p.id) + '"></span>'
      + '<span class="accent-name">' + esc(label) + '</span></button>';
  }).join('');
}
function renderAccentSwatches() {
  var boxes = document.querySelectorAll('.accent-pop-swatches');
  for (var i = 0; i < boxes.length; i++) boxes[i].innerHTML = accentSwatchesHTML();
}
function toggleAccentPop() {
  var pop = document.getElementById('accentPop');
  if (!pop) return;
  var open = pop.classList.toggle('open');
  var btn = document.getElementById('accentToggle');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeAccentPop() {
  var pop = document.getElementById('accentPop');
  if (pop) pop.classList.remove('open');
  var btn = document.getElementById('accentToggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
/* 手机侧栏：与语言选择完全一致的原生下拉（样式 .lang-switch 复用，效果 = 系统原生弹出） */
function accentLabelOf(id) {
  for (var i = 0; i < ACCENT_PALETTES.length; i++) {
    if (ACCENT_PALETTES[i].id === id) {
      var lang = (window.__i18n && window.__i18n.getLocale) ? window.__i18n.getLocale() : '';
      return (lang && lang.indexOf('en') === 0) ? ACCENT_PALETTES[i].en : ACCENT_PALETTES[i].zh;
    }
  }
  return '';
}
function renderAccentNativeSelect() {
  var sel = document.getElementById('accentNativeSide');
  if (!sel) return;
  var cur = getAccent();
  var dot = document.getElementById('accentNativeDot');
  if (dot) dot.style.background = accentSwatchColor(cur);
  var opts = ACCENT_PALETTES.map(function (p) {
    return '<option value="' + p.id + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(accentLabelOf(p.id)) + '</option>';
  }).join('');
  if (sel.innerHTML !== opts) sel.innerHTML = opts;
  if (sel.value !== cur) sel.value = cur;
  if (!sel.dataset.bound) {
    sel.dataset.bound = '1';
    sel.addEventListener('change', function () { setAccent(this.value); });
  }
}
/* 桌面语言：🌐 图标按钮 + 弹出面板（与主题色弹层同风格） */
var LANG_TITLES = {
  'zh-CN': '语言', 'en': 'Language', 'ja': '言語', 'ko': '언어', 'hi': 'भाषा'
};
function langTitle() {
  var loc = (window.__i18n && window.__i18n.getLocale) ? window.__i18n.getLocale() : 'zh-CN';
  return LANG_TITLES[loc] || '语言';
}
function langOptionsHTML() {
  var langs = (window.__i18n && window.__i18n.getLanguages) ? window.__i18n.getLanguages() : [];
  var cur = (window.__i18n && window.__i18n.getLocale) ? window.__i18n.getLocale() : 'zh-CN';
  return langs.map(function (l, i) {
    var active = l.code === cur;
    return '<button type="button" class="lang-option' + (active ? ' active' : '') + '" data-lang="' + l.code + '" role="option" aria-selected="' + active + '" aria-posinset="' + (i + 1) + '" aria-setsize="' + langs.length + '">'
      + '<span class="lang-flag">' + flagImg(l.code) + '</span><span class="lang-name">' + esc(l.name) + '</span></button>';
  }).join('');
}
/* 桌面语言面板的旗帜：使用本地 SVG，避免 Windows 上旗帜 emoji 渲染为字母（手机端原生 select 按平台显示表情或字母标识）。
   本地 file:// 直开时用相对路径，其余场景用站点根路径。 */
function flagImg(code) {
  var c = { 'zh-CN': 'cn', 'en': 'gb', 'ja': 'jp', 'ko': 'kr', 'hi': 'in' }[code] || 'cn';
  var src = useHashMode() ? 'flags/' + c + '.svg' : appRoot() + '/flags/' + c + '.svg';
  return '<img class="lang-flag-img" src="' + src + '" alt="' + c.toUpperCase() + '" width="20" height="14" loading="lazy">';
}
/* Windows 下原生 select 无法渲染旗帜 emoji（会退化成字母），改用具象的字母标识；
   其他平台（手机/非 Windows 桌面）仍保留真实旗帜 emoji。 */
function compactLangFlag(l) {
  if (!l || typeof navigator === 'undefined') return l && l.flag ? l.flag : '';
  if (!/win/i.test(String(navigator.platform || navigator.userAgent || ''))) return l.flag || '';
  return ({ 'zh-CN': 'CN', 'en': 'EN', 'ja': 'JA', 'ko': 'KO', 'hi': 'HI' })[l.code] || '';
}
function renderLangPop() {
  var inner = document.getElementById('langPopInner');
  if (inner) inner.innerHTML = langOptionsHTML();
}
function toggleLangPop() {
  var pop = document.getElementById('langPop');
  if (!pop) return;
  var open = pop.classList.toggle('open');
  var btn = document.getElementById('langToggle');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) renderLangPop();
}
function closeLangPop() {
  var pop = document.getElementById('langPop');
  if (pop && pop.classList.contains('open')) pop.classList.remove('open');
  var btn = document.getElementById('langToggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripMd(md) {
  var s = String(md || '');
  s = s.replace(/```[\s\S]*?```/g, ' ');
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/^#{1,6}\s*/gm, '');
  s = s.replace(/^\s*[-*+]\s+/gm, '');
  s = s.replace(/^\s*\d+\.\s+/gm, '');
  s = s.replace(/^>\s*/gm, '');
  s = s.replace(/[*_~`]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function htmlToText(html) {
  return String(html || '').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function sortPosts(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  if (a.date === b.date) return (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
}

function normalizeTags(p) {
  if (Array.isArray(p && p.tags)) return p.tags.map(function (t) { return String(t).trim(); }).filter(Boolean);
  return String((p && p.tags) || '').split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
}

function parseMdFile(text, filename) {
  var src = String(text || '');
  var meta = {};
  var body = src;
  if (/^---\r?\n/.test(src)) {
    var end = src.indexOf('\n---', 3);
    if (end > 0) {
      var block = src.slice(3, end);
      body = src.slice(end + 4).replace(/^\r?\n/, '');
      block.split(/\r?\n/).forEach(function (line) {
        var m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
        if (m) meta[m[1].toLowerCase()] = m[2].trim();
      });
    }
  }
  var base = String(filename || '').replace(/\.md$/i, '').replace(/^.*[\\\/]/, '');
  var id = slugify(meta.id || base || 'post-' + Date.now());
  return {
    id: id,
    title: meta.title || base || t('post.defaultTitle'),
    date: meta.date || new Date().toISOString().slice(0, 10),
    tags: meta.tags || '',
    excerpt: meta.excerpt || '',
    password: meta.password || '',
    content: body.trim()
  };
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'post';
}

/* ---------- Markdown 渲染器 ---------- */
function tokenizeCode(lang, code) {
  if (!lang || !/^(js|javascript|ts|typescript|python|py|bash|sh|css|html|json)$/i.test(lang)) {
    return esc(code);
  }
  lang = lang.toLowerCase();
  var out = '';
  var kw = '';
  if (lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript') {
    kw = '\\b(?:const|let|var|function|return|if|else|for|while|class|new|import|export|from|async|await|try|catch|throw|switch|case|break|continue|typeof|instanceof|in|of|this|do|yield|delete|void|null|undefined|true|false)\\b';
  } else if (lang === 'python' || lang === 'py') {
    kw = '\\b(?:def|return|if|else|elif|for|while|import|from|class|try|except|finally|with|as|pass|break|continue|lambda|global|nonlocal|yield|True|False|None|not|and|or|in|is|raise|assert|del)\\b';
  } else if (lang === 'bash' || lang === 'sh') {
    kw = '\\b(?:if|then|else|fi|for|while|do|done|case|esac|function|echo|export|cd|exit|return|local|sudo|grep|sed|awk|curl|wget|npm|node|npx|git)\\b';
  } else if (lang === 'css') {
    kw = '\\b(?:display|position|color|background|margin|padding|border|width|height|font|opacity|flex|grid|z-index|top|right|bottom|left|transform|transition|@media|@keyframes)\\b';
  } else if (lang === 'html') {
    return esc(code);
  } else if (lang === 'json') {
    return esc(code);
  }
  var re = new RegExp('(' + kw + ')|(\\d+(?:\\.\\d+)?)|(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/|#.*|<!--[\\s\\S]*?-->)|("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')', 'g');
  var last = 0, m;
  while ((m = re.exec(code)) !== null) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += '<span class="tok-kw">' + esc(m[1]) + '</span>';
    else if (m[2]) out += '<span class="tok-num">' + esc(m[2]) + '</span>';
    else if (m[3]) out += '<span class="tok-com">' + esc(m[3]) + '</span>';
    else if (m[4]) out += '<span class="tok-str">' + esc(m[4]) + '</span>';
    last = m.index + m[0].length;
  }
  out += esc(code.slice(last));
  return out;
}

function renderMarkdown(md) {
  var src = String(md || '');
  var tocCount = 0;
  var lines = src.split(/\r?\n/);
  var html = '';
  var i = 0;

  // 逐块解析
  while (i < lines.length) {
    var line = lines[i];

    // 代码块
    if (/^```/.test(line)) {
      var lang = line.replace(/^```/, '').trim();
      var codeLines = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // 跳过 ```
      html += '<pre class="code-block"><code class="lang-' + esc(lang) + '">' + tokenizeCode(lang, codeLines.join('\n')) + '</code></pre>\n';
      continue;
    }

    // 标题
    var hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      var lvl = hm[1].length;
      var txt = hm[2].trim();
      tocCount++;
      html += '<h' + lvl + ' id="toc-' + tocCount + '">' + inlineMd(txt) + '</h' + lvl + '>\n';
      i++;
      continue;
    }

    // 空行
    if (/^\s*$/.test(line)) { i++; continue; }

    // 表格
    if (i + 1 < lines.length && /\|/.test(line) && /^\s*\|?[\s:-]+\|[\s|:-]+\|?\s*$/.test(lines[i+1])) {
      var headerRow = line;
      var sepRow = lines[i+1];
      var headerCells = headerRow.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
      i += 2;
      var rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== '') {
        var cells = lines[i].replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
        rows.push(cells);
        i++;
      }
      html += '<table><thead><tr>' + headerCells.map(function (c) { return '<th>' + inlineMd(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr>' + r.map(function (c) { return '<td>' + inlineMd(c) + '</td>'; }).join('') + '</tr>';
      });
      html += '</tbody></table>\n';
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      var quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html += '<blockquote><p>' + inlineMd(quoteLines.join(' ')) + '</p></blockquote>\n';
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      html += '<ul>\n';
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        html += '<li>' + inlineMd(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>\n';
        i++;
      }
      html += '</ul>\n';
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      html += '<ol>\n';
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        html += '<li>' + inlineMd(lines[i].replace(/^\s*\d+\.\s+/, '')) + '</li>\n';
        i++;
      }
      html += '</ol>\n';
      continue;
    }

    // 分割线
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      html += '<hr>\n';
      i++;
      continue;
    }

    // 普通段落（聚合到空行）
    var para = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^```/.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^>\s?/.test(lines[i]) && !/^\s*(---+|\*\*\*+|___+)\s*$/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    html += '<p>' + inlineMd(para.join(' ')) + '</p>\n';
  }

  return html;
}

function escSmoji(safeHtml) {
  return String(safeHtml == null ? '' : safeHtml).replace(/!\[smoji:([^\]]{1,40})\]\((https?:\/\/s3-cdn\.zsh\.moe\/smoji\/[^()\s]+)\)/g, function (m, label, src) {
    return '<img class="smoji-inline" src="' + src + '" alt="[表情：' + label + ']" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  });
}

function inlineMd(s) {
  var t = esc(String(s || ""));
  t = t.replace(/\\\\([*_`~\\[\\]])/g, '\u0001$1');
  // 行内代码
  t = t.replace(/`([^`]*)`/g, '<code class="inline-code">$1</code>');
  // 斜体
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  // 加粗
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // 删除线
  t = t.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  // Smoji 表情（先于普通图片；仅匹配 smoji: 标记 + Smoji 官方 CDN 的 http(s) 图片 URL 后才渲染）
  t = t.replace(/!\[smoji:([^\]]{1,40})\]\((https?:\/\/s3-cdn\.zsh\.moe\/smoji\/[^()\s]+)\)/g, function (m, label, src) {
    return '<img class="smoji-inline" src="' + src + '" alt="[表情：' + label + ']" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  });
  // 图片（过滤 javascript:/data: 等危险协议）
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (m, alt, src) {
    if (/^\s*(javascript|data|vbscript):/i.test(String(src).trim())) return m;
    return '<img src="' + src + '" alt="' + alt + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
  });
  // 链接（过滤 javascript:/data: 等危险协议）
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (m, txt, url) {
    if (/^\s*(javascript|data|vbscript):/i.test(String(url).trim())) return m;
    return '<a href="' + url + '">' + txt + '</a>';
  });
  // 恢复遮罩
  t = t.replace(/\u0001([*_`~\[\]])/g, '$1');
  return t;
}

function buildToc(html) {
  var sections = [];
  var re = /<h([1-6]) id="(toc-(\d+))">([\s\S]*?)<\/h[1-6]>/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    sections.push({ lvl: Number(m[1]), id: m[2], order: Number(m[3]), text: htmlToText(m[4]) });
  }
  if (sections.length < 2) return { html: '', headings: sections };
  // 多级有序编号：1 / 1.1 / 1.2 / 2 / 2.1 …
  var counts = [0, 0, 0, 0, 0, 0, 0]; // 索引 1..6 对应层
  sections.forEach(function (s) {
    counts[s.lvl]++;
    for (var k = s.lvl + 1; k <= 6; k++) counts[k] = 0;
    var parts = [];
    for (var j = 1; j <= s.lvl; j++) if (counts[j]) parts.push(counts[j]);
    s.num = parts.join('.');
  });
  var hs = sections.map(function (s) {
    return '<a href="#' + s.id + '" data-toc="' + s.id + '" style="padding-left:' + ((s.lvl - 1) * 14) + 'px"><span class="toc-num">' + esc(s.num) + '</span>' + esc(s.text) + '</a>';
  }).join('');
  return {
    headings: sections,
    html: '<details class="toc"><summary>' + svgIcon('list', 14) + ' ' + t('toc.title') + '</summary><div class="toc-list">' + hs + '</div></details>'
  };
}

/** 给正文标题前插入编号（与目录一致），便于「标题为有序」 */
function stampHeadingNumbers(headings) {
  if (!headings || !document) return;
  headings.forEach(function (s) {
    try {
      var el = (typeof document.getElementById === 'function') ? document.getElementById(s.id) : document.querySelector('#' + s.id);
      if (!el || typeof el.insertBefore !== 'function' || typeof el.firstChild === 'undefined') return;
      var span = document.createElement('span');
      if (!span) return;
      span.className = 'toc-num';
      span.textContent = s.num;
      el.insertBefore(span, el.firstChild);
    } catch (e) { /* 编号标注失败不应影响正文渲染 */ }
  });
}

/* ---------- 配置与数据 ---------- */
// 云端模式下从 D1 加载的运行时站点设置（由 bootstrap 拉取并合并进 getConfig）
var _siteSettings = null;
function parseJsonSafe(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}
function parseArrSafe(v) {
  if (Array.isArray(v) && v.length) return v;
  if (typeof v === 'string' && v.trim()) {
    try { var a = JSON.parse(v); if (Array.isArray(a) && a.length) return a; } catch (e) {}
  }
  return [];
}

function getConfig() {
  var cfg = (typeof window !== 'undefined' && window.BLOG_CONFIG) || {};
  var s = _siteSettings;
  var siteInfo = (s && s.site_info != null) ? parseJsonSafe(s.site_info) : {};
  var prof = (s && s.profile != null) ? parseJsonSafe(s.profile) : {};
  // 站点信息覆盖静态页脚：版权署名 / 站点声明
  var footer = cfg.footer || {};
  if (siteInfo.copyright) footer = Object.assign({}, footer, { copyrightName: siteInfo.copyright });
  if (siteInfo.footerText) footer = Object.assign({}, footer, { decl: siteInfo.footerText });
  return {
    mode: cfg.mode || 'auto',
    apiBase: cfg.apiBase || '',
    siteUrl: cfg.siteUrl || (typeof location !== 'undefined' ? location.origin : ''),
    writeToken: cfg.writeToken || '',
    adminPwd: cfg.adminPwd || '',
    pageSize: (typeof cfg.pageSize === 'number' && cfg.pageSize >= 0) ? cfg.pageSize : 8,
    nav: parseArrSafe(s && s.nav_menu),
    footerNav: parseArrSafe(s && s.footer_nav),
    friendLinks: parseArrSafe(s && s.friend_links),
    footer: footer,
    site: siteInfo,        // 站点信息（头像/名称/简介）供关于页等使用
    profile: prof,         // 个人信息（头像/昵称/简介/邮箱）供关于页等使用
    ads: cfg.ads || {}
  };
}

// 站点名称：优先使用云端「站点基础信息 → 站点名称」，其次页脚版权署名，
// 最后回退到 i18n 默认（site.title）。改完站点名称后，左上角品牌、
// 浏览器标签页标题、页脚署名、OG/结构化数据都会实时跟随变化。
function getSiteName() {
  var cfg = getConfig();
  var name = cfg.site && cfg.site.name ? String(cfg.site.name).trim() : '';
  if (!name && cfg.footer && cfg.footer.copyrightName) name = String(cfg.footer.copyrightName).trim();
  if (!name) name = t('site.title');
  return name || '';
}
// 站点作者名（用于 meta author / JSON-LD author）：沿用个人昵称，回退站点名
function getSiteAuthor() {
  var cfg = getConfig();
  var prof = cfg.profile || {};
  return (prof.name || '').trim() || getSiteName();
}

function getStaticPosts() {
  return (typeof window !== 'undefined' && Array.isArray(window.BLOG_POSTS)) ? window.BLOG_POSTS : [];
}

/** 仅返回已发布文章（过滤草稿），用于前台公开页面（首页/归档/标签/关于/搜索等） */
function getPublishedPosts() {
  return getStaticPosts().filter(function (p) { return (p.status || 'published') !== 'draft'; });
}

function slug(s) { return String(s || '').toLowerCase().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64); }

function apiBase() {
  var cfg = getConfig();
  if (cfg.apiBase) return cfg.apiBase.replace(/\/+$/, '');
  return '';
}

async function apiFetch(url, opts) {
  var cfg = getConfig();
  var base = apiBase();
  // 统一拼绝对地址：避免在子路径页面（如 /posts/<别名>/）下，
  // 相对路径 api/... 被浏览器解析成 /posts/<别名>/api/... 而打错。
  var path = String(url).replace(/^\/+/, '');
  var originOk = typeof location !== 'undefined' && /^https?:$/.test(String(location.protocol || ''));
  var full = /^https?:/i.test(path)
    ? path
    : (base ? base.replace(/\/+$/, '') + '/' : (originOk ? location.origin + '/' : '')) + path;
  var headers = (opts && opts.headers) || {};
  // 云端会话 token（登录后由 /api/admin/login 签发并存入 localStorage）
  var session = _sessionToken();
  if (session) headers['Authorization'] = 'Bearer ' + session;
  else if (cfg.writeToken) headers['Authorization'] = 'Bearer ' + cfg.writeToken;
  // 仅写请求（或显式带 body）才设置 Content-Type：GET 设置它会在跨域时多一次 OPTIONS 预检
  var method = String((opts && opts.method) || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' || (opts && opts.body)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  // 超时兜底：网络慢/挂起时（如 Workers 冷启动、弱网）8s 后 abort，
  // 避免页面无限等待（boot 探测失败会回退静态模式）
  var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = ac ? setTimeout(function () { ac.abort(); }, 8000) : null;
  var merged = Object.assign({}, opts, { headers: headers });
  if (ac) merged.signal = ac.signal;
  var res;
  try {
    res = await fetch(full, merged);
  } catch (e) {
    if (timer) clearTimeout(timer);
    throw e;
  }
  if (timer) clearTimeout(timer);
  if (!res.ok) {
    // 优先透传后端返回的 error 文案（如「请勿重复发送相同内容」「评论太频繁」），
    // 便于用户直接理解失败原因；解析失败再退回 HTTP 状态码。
    var msg = 'HTTP ' + res.status;
    try {
      var j = await res.json();
      if (j && j.error) msg = String(j.error);
    } catch (e) { /* 非 JSON 响应体，保留状态码提示 */ }
    var e401 = new Error(msg);
    e401.status = res.status;
    // 全局会话失效处理：401 且非登录/首次设密端点 → 自动退出登录状态。
    // 抛给调用方的同时派发事件，让当前 SPA（后台/前台编辑器）主动跳转或提示。
    if (res.status === 401 && !/api\/admin\/(login|setup)/.test(String(url))) {
      handleSessionExpired(e401);
    }
    throw e401;
  }
  return res.json();
}

/* 会话失效（401）：清除本地会话并广播，由各界面自行跳转/提示。
 * 仅当本地确实持有会话时才处理，避免「未登录访问公开接口被 401」误触发。 */
function handleSessionExpired(err) {
  var had = !!_sessionToken();
  _setSessionToken('');
  _setAdminSession(false);
  if (!had) return;
  try {
    window.dispatchEvent(new CustomEvent('qy:session-expired', { detail: (err && err.status) || 401 }));
  } catch (e) { /* 无 CustomEvent 环境忽略 */ }
}

function sortPagePosts(posts) {
  return (posts || []).slice().sort(sortPosts);
}

/* ---------- 搜索 ---------- */
function globalSearch(query, limit) {
  var q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  var posts = sortPagePosts(getPublishedPosts());
  var hits = [];
  posts.forEach(function (p) {
    var hay = ((p.search || '') + ' ' + (p.title || '') + ' ' + (p.excerpt || '') + ' ' + (p.content || '') + ' ' + (p.tags || []).join(' ')).toLowerCase();
    if (hay.indexOf(q) >= 0) hits.push(p);
  });
  return hits.slice(0, limit || 8);
}

var _snipCache = {};
function searchSnippet(post, query) {
  var q = String(query || '').trim();
  if (!q) return '';
  var cacheKey = (post.id || '') + '|' + q.toLowerCase();
  if (_snipCache[cacheKey] !== undefined) return _snipCache[cacheKey];
  var qLow = q.toLowerCase();
  var src = stripMd(post.content || '');
  var idx = src.toLowerCase().indexOf(qLow);
  if (idx < 0) { src = post.excerpt || ''; idx = src.toLowerCase().indexOf(qLow); }
  if (idx < 0) { src = post.title || ''; idx = src.toLowerCase().indexOf(qLow); }
  if (idx < 0) { _snipCache[cacheKey] = ''; return ''; }
  var result = sentenceContext(src, idx, q.length);
  _snipCache[cacheKey] = result;
  return result;
}

/* 以“关键字所在句子”为核心截取上下文：返回包含关键字的完整句子（过短则并入相邻句）。
   句子过长时以关键字为中心裁剪，并在被截断的一侧加省略号。 */
function sentenceContext(text, idx, qLen) {
  if (!text) return '';
  var END = '。！？!?；;';
  var MAX = 90;
  var s = idx;
  while (s > 0 && END.indexOf(text.charAt(s - 1)) < 0) s--;
  var e = idx + qLen;
  while (e < text.length && END.indexOf(text.charAt(e)) < 0) e++;
  if (e < text.length) e++;   // 包含句末标点
  if (e - s < 30) {           // 句子过短，向前/后各并入一句提供更多上下文
    if (s > 0) { var ps = s - 1; while (ps > 0 && END.indexOf(text.charAt(ps - 1)) < 0) ps--; s = ps; }
    if (e < text.length) { var ne = e; while (ne < text.length && END.indexOf(text.charAt(ne)) < 0) ne++; if (ne < text.length) ne++; e = ne; }
  }
  while (s < e && /\s/.test(text.charAt(s))) s++;
  while (e > s && /\s/.test(text.charAt(e - 1))) e--;
  if (e - s <= MAX) {
    return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
  }
  // 超长：以关键字为中心裁剪
  var pad = Math.max(0, Math.floor((MAX - qLen) / 2));
  var ns = Math.max(0, idx - pad);
  var ne = Math.min(text.length, idx + qLen + pad);
  var leftover = MAX - (ne - ns);
  if (ns === 0 && leftover > 0) ne = Math.min(text.length, ne + leftover);
  if (ne === text.length && leftover > 0) ns = Math.max(0, ns - leftover);
  while (ns < idx && /\s/.test(text.charAt(ns))) ns++;
  while (ne > idx + qLen && /\s/.test(text.charAt(ne - 1))) ne--;
  return (ns > 0 ? '…' : '') + text.slice(ns, ne).trim() + (ne < text.length ? '…' : '');
}

/* 转义后用 <mark> 高亮查询词（用于搜索结果，先转义再替换，避免 XSS） */
function highlightQuery(text, query) {
  var q = String(query || '').trim();
  var safe = esc(text);
  if (!q) return safe;
  var term = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp('(' + term + ')', 'gi'), '<mark class="sh-hl">$1</mark>');
}



/* ---------- 评论 ----------
 * 云端模式：走 D1 后端（/api/posts/:id/comments，跨用户共享）；
 * 静态模式：本地 localStorage。
 */
function commentKey(id) { return 'qingyu.comments.' + id; }
function commentApi(id) { return 'api/posts/' + encodeURIComponent(String(id || '')) + '/comments'; }

async function loadComments(postId) {
  var id = String(postId || '');
  if (_cloudOn()) {
    // 云端评论实时共享，不命中本地缓存
    try {
      var data = await apiFetch(commentApi(id));
      var arr = (data && Array.isArray(data.comments)) ? data.comments : [];
      _commentsCache[id] = arr;
      return arr;
    } catch (e) { return []; }
  }
  if (_commentsCache[id]) return _commentsCache[id];
  var raw = '';
  try { raw = localStorage.getItem(commentKey(id)) || ''; } catch (e) {}
  var arr = [];
  try { arr = raw ? JSON.parse(raw) : []; } catch (e) { arr = []; }
  _commentsCache[id] = arr;
  return arr;
}

async function saveComment(postId, author, content, parentId) {
  var id = String(postId || '');
  author = String(author || '').trim().slice(0, 30);
  content = String(content || '').trim().slice(0, 1000);
  parentId = parentId || null;
  if (!author || !content) return null;
  if (_cloudOn()) {
    // 失败不再静默吞掉：抛出后端透传的具体原因（重复内容 409 / 频率限制 429 / 来源校验 403 等），
    // 由调用方（文章评论 / 留言板）在状态行展示，用户能明确知道为何未发表成功。
    var data = await apiFetch(commentApi(id), {
      method: 'POST',
      body: JSON.stringify({ author: author, content: content, parent_id: parentId })
    });
    var c = (data && data.comment) || null;
    if (c) { try { delete _commentsCache[id]; } catch (e) {} }
    return c;
  }
  var list = await loadComments(id);
  var comment = {
    id: 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    author: author,
    content: content,
    date: new Date().toISOString().slice(0, 10),
    parent_id: parentId
  };
  if (list.length >= 300) list.shift();
  list.push(comment);
  _commentsCache[id] = list;
  try { localStorage.setItem(commentKey(id), JSON.stringify(list)); } catch (e) {}
  return comment;
}

async function deleteComment(postId, cid) {
  var id = String(postId || '');
  if (_cloudOn()) {
    // 云端删除需管理员会话（apiFetch 自动携带 Bearer token）
    try {
      await apiFetch(commentApi(id) + '/' + encodeURIComponent(String(cid || '')), { method: 'DELETE', body: '{}' });
      try { delete _commentsCache[id]; } catch (e) {}
      return await loadComments(id);
    } catch (e) { return _commentsCache[id] || []; }
  }
  var list = await loadComments(id);
  var next = list.filter(function (c) { return c.id !== cid; });
  _commentsCache[id] = next;
  try { localStorage.setItem(commentKey(id), JSON.stringify(next)); } catch (e) {}
  return next;
}

/* ---------- 统计 ----------
 * 云端模式：走 D1 后端（/api/posts/:id/stats，跨用户共享）；
 * 静态模式：本地 localStorage。
 */
function statKey(id) { return 'qingyu.stats.' + id; }
function statApi(id) { return 'api/posts/' + encodeURIComponent(String(id || '')) + '/stats'; }

async function loadStats(postId) {
  var id = String(postId || '');
  if (_cloudOn()) {
    try {
      var data = await apiFetch(statApi(id));
      var s = (data && data.stats) || { views: 0, likes: 0 };
      _statsCache[id] = s;
      return s;
    } catch (e) { return { views: 0, likes: 0 }; }
  }
  if (_statsCache[id]) return _statsCache[id];
  var s = { views: 0, likes: 0 };
  try {
    var raw = localStorage.getItem(statKey(id));
    if (raw) { var parsed = JSON.parse(raw); s = { views: Number(parsed.views) || 0, likes: Number(parsed.likes) || 0 }; }
  } catch (e) {}
  _statsCache[id] = s;
  return s;
}

async function incView(postId) {
  // 同会话去重：避免刷新 / 后退 / SWR 重渲染把同一篇阅读数反复 +1
  try {
    if (sessionStorage.getItem('qingyu.viewed.' + postId) === '1') {
      return _statsCache[postId] || await loadStats(postId);
    }
    sessionStorage.setItem('qingyu.viewed.' + postId, '1');
  } catch (e) {}
  if (_cloudOn()) {
    try {
      var data = await apiFetch(statApi(postId), { method: 'POST', body: JSON.stringify({ action: 'views' }) });
      var s = (data && data.stats) || { views: 0, likes: 0 };
      _statsCache[postId] = s;
      return s;
    } catch (e) { return _statsCache[postId] || { views: 0, likes: 0 }; }
  }
  var s = await loadStats(postId);
  s.views = Math.min(s.views + 1, 9999999);
  _statsCache[postId] = s;
  try { localStorage.setItem(statKey(postId), JSON.stringify(s)); } catch (e) {}
  return s;
}

/** 是否已点过赞（本地记录，防刷） */
function likedKey(id) { return 'qingyu.liked.' + String(id || ''); }
function wasLiked(postId) {
  try { return localStorage.getItem(likedKey(postId)) === '1'; } catch (e) { return false; }
}
function markLiked(postId) {
  try { localStorage.setItem(likedKey(postId), '1'); } catch (e) {}
}

async function likePost(postId) {
  if (wasLiked(postId)) return null;   // 已赞，防重复
  if (_cloudOn()) {
    try {
      var data = await apiFetch(statApi(postId), { method: 'POST', body: JSON.stringify({ action: 'like' }) });
      markLiked(postId);
      var s = (data && data.stats) || { views: 0, likes: 0 };
      _statsCache[postId] = s;
      return s;
    } catch (e) { return null; }
  }
  var s = await loadStats(postId);
  s.likes = Math.min(s.likes + 1, 9999999);
  markLiked(postId);
  _statsCache[postId] = s;
  try { localStorage.setItem(statKey(postId), JSON.stringify(s)); } catch (e) {}
  return s;
}

/* ---------- 精选文章 ----------
 * 按 点赞×3 + 浏览×1 + 评论×5 综合得分排序，取前 2 篇。
 * 云端模式：从 API 批量拉取；静态模式：从本地数据计算。
 */
var _featuredCache = null;
async function getFeaturedPosts(excludeId, count) {
  if (_featuredCache) return _featuredCache.filter(function (p) { return p.id !== excludeId; }).slice(0, count || 2);
  var posts = (typeof getStaticPosts === 'function') ? getStaticPosts() : [];
  if (_cloudOn()) {
    try {
      var d = await apiFetch('api/posts');
      if (d && d.posts && d.posts.length) posts = d.posts;
    } catch (e) {}
  }
  // 过滤：排除当前文章
  posts = posts.filter(function (p) { return p.id !== excludeId && (p.status || 'published') !== 'draft'; });
  // 并行拉取每篇文章的统计和评论数
  var scored = await Promise.all(posts.map(async function (p) {
    var views = 0, likes = 0, comments = 0;
    try {
      if (_cloudOn()) {
        var sd = await apiFetch('api/posts/' + encodeURIComponent(p.id) + '/stats');
        if (sd && sd.stats) { views = sd.stats.views || 0; likes = sd.stats.likes || 0; }
      } else {
        var raw = localStorage.getItem('qingyu.stats.' + p.id);
        if (raw) { var ps = JSON.parse(raw); views = ps.views || 0; likes = ps.likes || 0; }
      }
    } catch (e) {}
    try {
      if (_cloudOn()) {
        var cd = await apiFetch('api/posts/' + encodeURIComponent(p.id) + '/comments');
        if (cd && cd.comments) comments = cd.comments.length;
      } else {
        var cl = localStorage.getItem('qingyu.comments.' + p.id);
        if (cl) comments = JSON.parse(cl).length;
      }
    } catch (e) {}
    return { id: p.id, title: p.title || t('post.untitled'), score: likes * 3 + views + comments * 5, views: views, likes: likes, comments: comments };
  }));
  scored.sort(function (a, b) { return b.score - a.score; });
  _featuredCache = scored;
  return scored.filter(function (p) { return p.id !== excludeId; }).slice(0, count || 2);
}
function renderFeaturedHtml(excludeId) {
  return '<div class="featured-posts" id="featuredPosts"><div class="featured-title">' + svgIcon('pin', 16) + ' ' + t('featured.title') + '</div><div class="featured-grid" id="featuredGrid"><div class="featured-loading">' + t('site.loading') + '…</div></div></div>';
}
function loadFeaturedPosts(excludeId) {
  _featuredCache = null; // 每次进入新文章清缓存，确保过滤当前文章
  getFeaturedPosts(excludeId, 2).then(function (items) {
    var wrap = document.querySelector('#featuredPosts');
    var grid = document.querySelector('#featuredGrid');
    if (!grid) return;
    if (!items.length) { if (wrap) wrap.style.display = 'none'; return; }
    grid.innerHTML = items.map(function (p, idx) {
      return '<div class="featured-card" data-idx="' + idx + '">'
        + '<div class="featured-card-title">' + esc(p.title) + '</div>'
        + '<div class="featured-card-meta">' + svgIcon('eye', 12) + ' ' + p.views + ' · ' + svgIcon('heart', 12) + ' ' + p.likes + ' · ' + svgIcon('quote', 12) + ' ' + p.comments
        + '</div></div>';
    }).join('');
    // 用 div + click 直接跳转
    grid.querySelectorAll('.featured-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var idx = parseInt(card.getAttribute('data-idx'), 10);
        if (!items[idx]) return;
        var targetId = items[idx].id;
        // 相同文章直接滚动到顶部
        if (targetId === excludeId) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        // SPA 路由跳转（兼容 file:// hash 模式和 http history 模式）
        navigate(postUrl(targetId));
      });
    });
  }).catch(function () {
    var wrap = document.querySelector('#featuredPosts');
    if (wrap) wrap.style.display = 'none';
  });
}

/* ---------- 管理员门禁 ----------
 * 云端模式（API 可用）：密码存 Cloudflare KV，前端只持有会话 token。
 *   登录 POST /api/admin/login → token 存 localStorage('qingyu.token')。
 * 静态模式（file:// 或纯静态托管）：保留本地密码门禁（防君子）。
 */
function _cfgPwd() { return getConfig().adminPwd; }
function _localPwd() { try { return localStorage.getItem('qingyu.admin.pwd') || ''; } catch (e) { return ''; } }
function _setLocalPwd(v) { try { localStorage.setItem('qingyu.admin.pwd', String(v)); } catch (e) {} }
function _adminSession() { try { return localStorage.getItem('qingyu.admin.ok') === '1'; } catch (e) { return false; } }
function _setAdminSession(v) { try { localStorage.setItem('qingyu.admin.ok', v ? '1' : '0'); } catch (e) {} }
/** 简单 SHA-256 哈希（前端 PBKDF2 不需要，用轻量版即可） */
async function _hashLocalPwd(pwd) {
  var enc = new TextEncoder();
  var buf = await crypto.subtle.digest('SHA-256', enc.encode(String(pwd)));
  return 'sha256:' + Array.from(new Uint8Array(buf), function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}
/* 云端会话 token */
function _sessionToken() { try { return localStorage.getItem('qingyu.token') || ''; } catch (e) { return ''; } }
function _setSessionToken(t) {
  try { if (t) localStorage.setItem('qingyu.token', t); else localStorage.removeItem('qingyu.token'); } catch (e) {}
}
/* 云模式判定：配置为 api，或 boot 已成功拉到云端文章 */
function _cloudOn() {
  var cfg = getConfig();
  return cfg.mode === 'api' || (cfg.mode === 'auto' && _cloudDetected);
}

var _cloudDetected = false;   // boot 时置位：/api/posts 拉取成功 = 云端在线
var _cloudReady = false;      // 云端探测是否已完成（成功或失败都置位，避免首页永远显示加载动画）

function needAdminSetup() {
  return !_cfgPwd() && !_localPwd();
}
function adminOk() {
  // 云端：有会话 token 即视为已登录（有效性由服务端鉴权兜底）
  if (_cloudOn()) return !!_sessionToken();
  return _adminSession();
}
async function setupAdmin(pwd) {
  pwd = String(pwd || '');
  if (pwd.length < 4) return false;
  var hashed = await _hashLocalPwd(pwd);
  _setLocalPwd(hashed);
  _setAdminSession(true);
  return true;
}
async function tryAdmin(pwd) {
  var target = _cfgPwd() || _localPwd();
  if (!target) return false;
  // 兼容旧版明文密码（无 sha256: 前缀）
  if (target.indexOf('sha256:') !== 0) {
    if (String(pwd || '') === target) {
      // 升级为哈希存储
      var hashed = await _hashLocalPwd(pwd);
      _setLocalPwd(hashed);
      _setAdminSession(true);
      return true;
    }
    return false;
  }
  var hashed = await _hashLocalPwd(pwd);
  if (hashed === target) { _setAdminSession(true); return true; }
  return false;
}
/** 云端登录：POST /api/admin/login，成功存 token；返回 { ok, message, mustChange, defaultPassword } */
async function cloudLogin(pwd) {
  try {
    var data = await apiFetch('api/admin/login', { method: 'POST', body: JSON.stringify({ password: String(pwd || '') }) });
    if (!data || !data.token) return { ok: false, message: (data && data.error) || t('admin.loginFail') };
    _setSessionToken(data.token);
    _setAdminSession(true);
    return { ok: true, mustChange: !!data.mustChange, defaultPassword: data.defaultPassword || '' };
  } catch (e) {
    return { ok: false, message: t('admin.loginFail') + '（HTTP ' + (e && e.message ? e.message.replace('HTTP ', '') : '') + '）' };
  }
}
/** 云端登出：调用 /api/admin/logout 并清除本地 token */
async function cloudLogout() {
  var t = _sessionToken();
  _setSessionToken('');
  _setAdminSession(false);
  if (_cloudOn() && t) {
    try { await apiFetch('api/admin/logout', { method: 'POST', body: '{}' }); } catch (e) {}
  }
}
/** 云端初始化：使用安装密钥设置管理员密码（POST /api/admin/setup，携带 X-Setup-Key），
 * 成功后自动登录拿 token。后端 BLOG_ADMIN_SETUP_KEY 未配置时返回 409 并透传提示。 */
async function cloudSetupAdmin(pwd, setupKey) {
  try {
    var data = await apiFetch('api/admin/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Setup-Key': String(setupKey || '') },
      body: JSON.stringify({ password: String(pwd || '') })
    });
    if (!data || !data.ok) return { ok: false, message: (data && data.error) || t('admin.loginFail') };
    // 设置成功 → 自动登录
    return await cloudLogin(pwd);
  } catch (e) {
    return { ok: false, message: t('admin.loginFail') + '（HTTP ' + (e && e.message ? e.message.replace('HTTP ', '') : '') + '）' };
  }
}
function adminLogout() {
  if (_cloudOn()) { cloudLogout(); }
  else { _setAdminSession(false); }
}

/**
 * 首次登录默认密码提示：模态框化、不会自动消失，确保随机默认密码清晰可读、可复制，
 * 避免以前“闪现一下看不清”的问题。用户可选择立刻改密或暂不改密进入后台。
 */
function showFirstLoginPwd(defaultPassword) {
  var pwd = String(defaultPassword || '');
  // 已有打开的提示框则避免重复叠加
  var existing = document.querySelector('.flp-mask');
  if (existing) existing.remove();
  var mask = document.createElement('div');
  mask.className = 'flp-mask';
  mask.innerHTML =
    '<div class="flp-modal">'
    + '<button class="flp-close" data-act="close" aria-label="关闭">✕</button>'
    + '<div class="flp-icon">' + svgIcon('lock', 26) + '</div>'
    + '<h3 class="flp-title">' + t('admin.firstLoginTitle') + '</h3>'
    + '<p class="flp-desc">' + t('admin.firstLoginDesc') + '</p>'
    + (pwd
      ? '<div class="flp-pwd-row"><span class="flp-pwd" id="flpPwd" title="' + t('admin.copyPwd') + '">' + esc(pwd) + '</span>'
        + '<button class="flp-copy" id="flpCopyBtn">' + t('admin.copyPwd') + '</button></div>'
      : '')
    + '<p class="flp-warn">' + t('admin.firstLoginWarn') + '</p>'
    + '<div class="flp-actions">'
    + '<button class="flp-btn ghost" data-act="later">' + t('admin.firstLoginLater') + '</button>'
    + '<button class="flp-btn primary" data-act="change">' + t('admin.firstLoginChange') + '</button>'
    + '</div></div>';
  document.body.appendChild(mask);

  // 复制密码
  var copyBtn = mask.querySelector('#flpCopyBtn');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    try {
      var ta = document.createElement('textarea');
      ta.value = pwd;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      copyBtn.textContent = t('admin.copied');
      setTimeout(function () { copyBtn.textContent = t('admin.copyPwd'); }, 1500);
    } catch (e) {}
  });

  function close() {
    mask.classList.add('flp-leave');
    setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 200);
  }

  // 点击遮罩空白处、关闭按钮、暂不修改 → 关闭（保持登录态，进入后台）
  function goAdmin() {
    if (typeof navigate === 'function') navigate('/admin'); else { try { location.href = href('/admin'); } catch (e) {} }
  }
  mask.addEventListener('click', function (e) {
    var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
    if (e.target === mask || act === 'close' || act === 'later') { close(); goAdmin(); }
    else if (act === 'change') { close(); goAdmin(); ensureAdminBundle().then(function () { setTimeout(function () { if (window.QingyuAdmin && window.QingyuAdmin.openPwdModal) window.QingyuAdmin.openPwdModal(); }, 350); }); }
  });
}

window.showFirstLoginPwd = showFirstLoginPwd;

/* ---------- 后台资源按需加载 ---------- */
var _adminBundlePromise = null;
function ensureAdminBundle() {
  if (window.QingyuAdmin && window.QingyuAdmin.mount) return Promise.resolve(true);
  if (!_adminBundlePromise) {
    _adminBundlePromise = new Promise(function (resolve) {
      function done() { resolve(!!(window.QingyuAdmin && window.QingyuAdmin.mount)); }
      if (!document.querySelector('link[data-admin-css]')) {
        var l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = 'admin.min.css?v=' + BLOG_VERSION; l.setAttribute('data-admin-css', '1');
        document.head.appendChild(l);
      }
      var s = document.createElement('script');
      s.src = 'admin.min.js?v=' + BLOG_VERSION;
      s.onload = done;
      s.onerror = done;
      document.head.appendChild(s);
    });
  }
  return _adminBundlePromise;
}

/* ---------- 导出 ---------- */
function buildPostsJs() {
  var drafts = [];
  try { drafts = JSON.parse(localStorage.getItem('qingyu.drafts') || '[]'); } catch (e) { drafts = []; }
  var all = getStaticPosts().slice();
  drafts.forEach(function (d) {
    if (!d || !d.id) return;
    var idx = all.findIndex(function (p) { return p.id === d.id; });
    var item = {
      id: d.id,
      title: d.title || '',
      date: d.date || new Date().toISOString().slice(0, 10),
      tags: normalizeTags(d),
      excerpt: d.excerpt || '',
      pinned: !!d.pinned,
      content: d.content || ''
    };
    if (idx >= 0) all[idx] = item; else all.push(item);
  });
  all.sort(sortPosts);
  var out = '/* ============================================================\n * Qingyu\'Blog · 文章数据（由「导出 posts.js」生成）\n * 下载本文件后覆盖博客目录下的 posts.js 即可发布。\n * ============================================================ */\nwindow.BLOG_POSTS = ' + JSON.stringify(all, null, 2) + ';\n';
  return out;
}

function saveDraftToStore(key, val) {
  try {
    var keyS = String(key || '');
    var existing = [];
    try { existing = JSON.parse(localStorage.getItem('qingyu.drafts') || '[]'); } catch (e) { existing = []; }
    if (keyS === '__new') {
      existing = existing.filter(function (d) { return d && d.id !== (val && val.id); });
      if (val && val.id) existing.push(val);
    } else {
      var idx = existing.findIndex(function (d) { return d && d.id === keyS; });
      if (idx >= 0) existing[idx] = Object.assign({}, existing[idx], val || {});
      else if (val) existing.push(Object.assign({ id: keyS }, val));
    }
    localStorage.setItem('qingyu.drafts', JSON.stringify(existing));
  } catch (e) {}
}

function buildFeedXmlClient(posts, maxItems) {
  var cfg = getConfig();
  var base = cfg.siteUrl || (typeof location !== 'undefined' ? location.origin : '');
  base = String(base || '').replace(/\/+$/, '');
  // 与云端 buildFeedXml 对齐：排除加密文章与草稿（公开产物不外泄）
  var list = (posts || []).filter(function (p) { return !(p && p.protected) && (p.status || 'published') !== 'draft'; })
    .slice().sort(sortPosts).slice(0, maxItems || 20);
  var items = list.map(function (p) {
    var link = base + postUrl(p.id);
    // description 输出渲染后的 HTML（而非 Markdown 源码），阅读器直接显示富文本
    var content = renderMarkdown(p.content || '').replace(/\]\]>/g, ']]&gt;');
    return '<item>\n      <title>' + esc(p.title) + '</title>\n      <link>' + esc(link) + '</link>\n      <guid isPermaLink="false">' + esc(p.id) + '</guid>\n      <pubDate>' + rfc822(p.date) + '</pubDate>\n      <description><![CDATA[' + content + ']]></description>\n    </item>';
  }).join('\n    ');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>' + esc(cfg.title || getSiteName()) + '</title>\n    <link>' + esc(base || 'https://blog.example') + '</link>\n    <description>' + esc((cfg.site && cfg.site.desc) || t('site.desc')) + '</description>\n    <language>zh-CN</language>\n    <lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n    ' + items + '\n  </channel>\n</rss>\n';
}
function rfc822(dateStr) {
  try {
    var s = String(dateStr || '').trim();
    var d;
    if (s.length <= 10) {
      // 纯日期 "YYYY-MM-DD"：按 UTC 解析，pubDate 日期不跨天（避免 +8 时区显示前一天）
      d = new Date(s.slice(0, 10) + 'T00:00:00Z');
    } else {
      // "YYYY-MM-DD HH:mm"：按本地时区解析为 UTC 输出
      d = new Date(s.slice(0, 10) + 'T' + (s.slice(11, 16) || '00:00') + ':00');
    }
    return isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
  } catch (e) { return new Date().toUTCString(); }
}

/* ---------- 保存文件 ---------- */
async function saveFileFriendly(name, content, doneText, failText) {
  var b = new Blob([content], { type: 'application/octet-stream' });
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      var handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: '', accept: {} }] });
      var writable = await handle.createWritable();
      await writable.write(b);
      await writable.close();
      return true;
    } catch (e) { return false; }
  }
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
  return false;
}

/* ============================================================
 * 页面渲染
 * ============================================================ */
function app() { return document.querySelector('#app'); }

  // 站点主导航：单一数据源。新增导航只需在此数组追加一项（可选 children 子菜单）。
  // 文本用 i18n key，渲染时经 t() 解析，切换语言即时生效。
  var NAV = [
    { i18n: 'nav.home',     url: '/',          path: '/' },
    { i18n: 'nav.tags',     url: '/tags',      path: '/tags' },
    { i18n: 'nav.archive',  url: '/archive',   path: '/archive' },
    { i18n: 'nav.guestbook',url: '/guestbook', path: '/guestbook' },
    { i18n: 'nav.about',    url: '/about',     path: '/about' }
  ];

  // 前台导航项：优先使用后台「博客设置 → 顶部导航」保存的配置，
  // 未配置时回退到内置 NAV 默认值，保证样式与原有行为一致。
  function navItems() {
    var c = getConfig();
    if (Array.isArray(c.nav) && c.nav.length) return c.nav;
    return NAV;
  }

  // 旧后台保存数据里的默认中文文案：路径命中内置项时，仅当文本为空或等于当初的
  // 默认中文才自动翻译；自定义导航文字（如“主页”）保持用户原样。
  var NAV_DEFAULT_ZH = {
    '/': '首页',
    '/tags': '标签',
    '/archive': '归档',
    '/guestbook': '留言板',
    '/about': '关于'
  };
  // 旧版后台可能保存过「留言」作为留言板入口文案，同样视为内置默认文案。
  var NAV_DEFAULT_ZH_ALIAS = {
    '/guestbook': ['留言']
  };
  function isDefaultZhText(norm, text) {
    if (!text) return true;
    if (NAV_DEFAULT_ZH[norm] === text) return true;
    var al = NAV_DEFAULT_ZH_ALIAS[norm];
    return al ? al.indexOf(text) >= 0 : false;
  }
  // 渲染导航前先合并一次默认导航，用于识别“首页/标签/归档/留言/关于”等内置路径。
  var _navDefMap = null;
  function defaultNavMap() {
    if (_navDefMap) return _navDefMap;
    var map = {};
    NAV.forEach(function (it) {
      var key = it.path || String(it.url || '').replace(/^#?\//, '/');
      map[key] = it.i18n;
      if (it.children) it.children.forEach(function (c) {
        map[String(c.url || '').replace(/^#?\//, '/')] = c.i18n || '';
      });
    });
    _navDefMap = map;
    return map;
  }
  // 将 NAV 配置解析为带翻译文本的导航项（含可选子菜单）。
  // 兼容旧的后台保存数据：旧导航没有 i18n key 而只有“首页/标签…”等文字，
  // 这里会按路径识别内置项并自动套用当前语言，外部自定义链接仍保留原文。
  function resolveNav(items) {
    var defMap = defaultNavMap();
    return items.map(function (it) {
      var norm = String(it.url || '/').replace(/^#?\//, '/');
      var i18n = it.i18n || (isDefaultZhText(norm, it.text) ? (defMap[norm] || '') : '');
      var text = (i18n ? t(i18n) : '') || it.text || '';
      var n = { text: text, url: it.url, path: it.path };
      if (it.children && it.children.length) {
        n.children = it.children.map(function (c) {
          var cNorm = String(c.url || '/').replace(/^#?\//, '/');
          var cI18n = c.i18n || (isDefaultZhText(cNorm, c.text) ? (defMap[cNorm] || '') : '');
          return { text: (cI18n ? t(cI18n) : '') || c.text || '', url: c.url };
        });
      }
      return n;
    });
  }

  function renderNav(active) {
  var navs = resolveNav(navItems());
  var links = navs.map(function (n) {
    var raw = n.url || '/';
    var pathKey = n.path || (/^#\//.test(raw) ? raw.slice(1) : (/^\//.test(raw) ? raw : null));
    var url = (/^#\//.test(raw)) ? href(raw.slice(1)) : (/^\//.test(raw) ? href(raw) : raw);
    var cls = (pathKey && pathKey === active) ? 'nav-link active' : 'nav-link';
    var isChildPath = n.children && n.children.length;
    if (isChildPath) {
      var kids = n.children.map(function (c) {
        var cRaw = c.url || '/';
        var cUrl = (/^#\//.test(cRaw)) ? href(cRaw.slice(1)) : (/^\//.test(cRaw) ? href(cRaw) : cRaw);
        var tgt = cUrl && /^https?:|^\/\//.test(cUrl) ? ' target="_blank" rel="noopener"' : '';
        return '<a href="' + esc(cUrl) + '" class="nav-link"' + tgt + '>' + esc(c.text || '') + '</a>';
      }).join('');
      return '<div class="nav-item has-sub"><a href="' + esc(url) + '" class="' + cls + '">' + esc(n.text || '') + '</a><div class="sub-menu">' + kids + '</div></div>';
    }
    var ext = url && /^https?:|^\/\//.test(url) ? ' target="_blank" rel="noopener"' : '';
    return '<div class="nav-item"><a href="' + esc(url) + '" class="' + cls + '"' + ext + '>' + esc(n.text || '') + '</a></div>';
  }).join('');

  var langSwitch = '<div class="lang-wrap" id="langWrap" role="group" aria-label="' + langTitle() + '">'
    + '<button class="icon-btn" id="langToggle" aria-label="' + langTitle() + '" title="' + langTitle() + '" aria-haspopup="listbox" aria-controls="langPop" aria-expanded="false">' + svgIcon('globe', 18) + '</button>'
    + '<div class="lang-pop" id="langPop" role="listbox" aria-label="' + langTitle() + '">'
    + '<div class="accent-pop-title">' + langTitle() + '</div>'
    + '<div class="lang-pop-options" id="langPopInner"></div>'
    + '</div></div>';
  var themeBtn = '<button class="icon-btn" id="themeToggle" aria-label="' + t('theme.toggle') + '" title="' + t('theme.toggle') + '">' + themeIcon() + '</button>';
  var searchBtn = '<button class="icon-btn search-toggle" id="searchToggle" aria-label="' + t('search.toggle') + '" title="' + t('search.toggle') + '">' + searchIconSvg() + '</button>';
  var accentSwitch = '<div class="accent-wrap" id="accentWrap" role="group" aria-label="' + accentTitle() + '">'
    + '<button class="icon-btn" id="accentToggle" aria-label="' + accentTitle() + '" title="' + accentTitle() + '" aria-haspopup="true" aria-expanded="false" aria-controls="accentPop">' + svgIcon('palette', 18) + '</button>'
    + '<div class="accent-pop" id="accentPop" role="group" aria-label="' + accentTitle() + '">'
    + '<div class="accent-pop-title">' + accentTitle() + '</div>'
    + '<div class="accent-pop-swatches"></div>'
    + '</div></div>';
  // 背景素描动画开关（春夏秋冬 · 自动切换 · 可一键关闭）
  var bgAnimOn = !!(window.bgAnim && window.bgAnim.isOn());
  var bgAnimBtn = '<button class="icon-btn" id="bgAnimToggle" aria-pressed="' + (bgAnimOn ? 'true' : 'false') + '" aria-label="' + t('bgAnim.title') + '" title="' + (bgAnimOn ? t('bgAnim.on') : t('bgAnim.off')) + '">' + svgIcon('spark', 18) + '</button>';
  var hamburger = '<button class="hamburger-btn" id="hamburgerBtn" aria-label="' + t('nav.toggle') + '"><span></span><span></span><span></span></button>';

  // 侧边栏导航项（移动端用）
  var sidebarLinks = navs.map(function (n) {
    var raw = n.url || '/';
    var pathKey = n.path || (/^#\//.test(raw) ? raw.slice(1) : (/^\//.test(raw) ? raw : null));
    var url = (/^#\//.test(raw)) ? href(raw.slice(1)) : (/^\//.test(raw) ? href(raw) : raw);
    var cls = (pathKey && pathKey === active) ? 'sidebar-link active' : 'sidebar-link';
    var ext = url && /^https?:|^\/\//.test(url) ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + esc(url) + '" class="' + cls + '"' + ext + '>' + esc(n.text || '') + '</a>';
  }).join('');

  // 侧栏：品牌名 + 主题切换 + 导航链接 + 语言切换
  var sidebar = '<div class="sidebar-overlay" id="sidebarOverlay"></div>'
    + '<aside class="mobile-sidebar" id="mobileSidebar">'
    + '<div class="sidebar-header"><span class="sidebar-brand">' + getSiteName() + '</span>'
    + '<button class="icon-btn sidebar-theme" id="themeToggleSide" aria-label="' + t('theme.toggle') + '" title="' + t('theme.toggle') + '">' + themeIcon() + '</button>'
    + '<button class="sidebar-close" id="sidebarClose" aria-label="' + t('search.close') + '">✕</button></div>'
    + '<nav class="sidebar-nav">' + sidebarLinks + '</nav>'
    + '<div class="sidebar-footer">'
    + '<div class="sidebar-picks">'
    + '<select id="langSwitchSide" class="lang-switch" aria-label="' + langTitle() + '"></select>'
    + '<div class="accent-native-wrap">'
    + '<span class="accent-dot" id="accentNativeDot" aria-hidden="true"></span>'
    + '<select id="accentNativeSide" class="lang-switch accent-native" aria-label="' + accentTitle() + '"></select>'
    + '</div>'
    + '</div>'
    + '</div>'
    + '</aside>';

  var searchForm = '<form class="topbar-search" id="topbarSearch" role="search" onsubmit="return false">'
    + '<span class="ts-icon">' + searchIconSvg() + '</span>'
    + '<input id="globalSearchInput" type="search" placeholder="' + t('search.placeholder') + '" autocomplete="off" aria-label="' + t('search.toggle') + '">'
    + '<button type="button" class="ts-close" id="searchClose" aria-label="' + t('search.close') + '">✕</button>'
    + '</form>';
  // 汉堡在 topbar-left 前面，与品牌/搜索同行
  return sidebar
    + '<header class="topbar' + (active && _searchOpen ? ' searching' : '') + '">'
    + '<div class="container topbar-inner">'
    + '<div class="topbar-left">' + hamburger + '<a class="brand" href="' + esc(href('/')) + '">' + getSiteName() + '</a></div>'
    + '<nav class="main-nav">' + links + '</nav>'
    + '<div class="topbar-actions">' + searchBtn + langSwitch + accentSwitch + bgAnimBtn + themeBtn + '</div>'
    + searchForm
    + '</div>'
    + '<div class="search-panel" id="searchPanel"></div>'
    + '</header>';
}

function renderFooter() {
  var cfg = getConfig();
  var f = cfg.footer || {};
  var year = new Date().getFullYear();
  var startYear = Number(f.startYear) || 2019;
  var copyRange = (startYear && startYear < year) ? (startYear + '-' + year) : ('' + year);
  var site = getSiteName();
  // 页脚导航行：优先使用后台「底部导航」保存的配置，其次沿用 config.js footer.contact；
  // 都未配置时回退到站点主导航 NAV。写作后台仅管理员显示；
  // RSS 仅普通用户显示（互斥，避免导航过长）。
  var custom = (cfg.footerNav && cfg.footerNav.length) ? cfg.footerNav : ((f.contact && f.contact.length) ? f.contact : null);
  var nav = custom ? custom.map(function (it) {
    return { text: it.text || '', url: it.url || '/' };
  }) : resolveNav(navItems());
  if (adminOk()) nav.push({ text: t('nav.admin'), url: '/admin' });
  function l(x) {
    var u = x.url || '/';
    var ext = /^https?:|^\/\//.test(u) ? ' target="_blank" rel="noopener"' : '';
    if (/^#\//.test(u)) u = href(u.slice(1));
    else if (/^\//.test(u)) u = href(u);
    return '<a href="' + esc(u) + '"' + ext + '>' + esc(x.text || '') + '</a>';
  }
  var navHtml = nav.map(l).join('<span class="footer-dot">·</span>');
  // RSS：仅非管理员显示（管理员有写作后台入口）。云端模式指向动态
  // /api/feed.xml（含全部云端文章、自动取站点域名）；file:// 直开时同目录；
  // 其余静态托管用根路径 feed.xml
  if (!adminOk()) {
    var rssHref = _cloudOn() ? '/api/feed.xml' : (useHashMode() ? 'feed.xml' : '/feed.xml');
    navHtml += '<span class="footer-dot footer-rss">·</span><a class="footer-rss" href="' + esc(rssHref) + '">RSS</a>';
  }
  // 电脑端专属区块：自定义文字 / 站点声明 / 联系方式 / 友情链接
  var extra = '';
  if (f.text) extra += '<p class="footer-text">' + esc(f.text) + '</p>';
  if (f.decl) extra += '<p class="footer-decl"><span class="footer-lbl">' + t('footer.declPrefix') + '</span>' + esc(f.decl) + '</p>';
  // 联系邮箱：云端「个人资料 → 联系邮箱」优先，回退静态 config.js footer.email
  var contactEmail = (cfg.profile && cfg.profile.email) || f.email || '';
  if (contactEmail) extra += '<p class="footer-contact"><span class="footer-lbl">' + t('footer.contactPrefix') + '</span><a href="mailto:' + esc(contactEmail) + '">' + esc(contactEmail) + '</a></p>';
  var friendsArr = (cfg.friendLinks && cfg.friendLinks.length) ? cfg.friendLinks : (f.links || []);
  var friends = friendsArr.map(l).join('');
  if (friends) extra += '<p class="footer-friends"><span class="footer-lbl">' + t('footer.friends') + '</span><span class="footer-friend-links">' + friends + '</span></p>';
  // 版权行（移动端仅显示此行，备案号在移动端隐藏）
  // 版权署名：云端「页脚版权署名」优先显示；若未设置则使用站点名称
  var copyName = (cfg.site && cfg.site.copyright) || site;
  var copy = 'Copyright ©' + copyRange + ' ' + esc(copyName);
  var icp = f.icp ? ' <span class="footer-icp">' + esc(f.icp) + '</span>' : '';
  return '<footer><div class="container footer-inner">'
    + '<div class="footer-nav">' + navHtml + '</div>'
    + (extra ? '<div class="footer-extra">' + extra + '</div>' : '')
    + '<div class="footer-copy">' + copy + icp + '</div>'
    + '</div>'
    // 返回顶部：固定悬浮右下角，所有页面共用（点击仅滚回当前页顶部）
    + '<button class="btn-top" id="backTop" aria-label="' + t('footer.backTop') + '" title="' + t('footer.backTop') + '">' + svgIcon('top', 18) + '</button>'
    + '</footer>';
}

function homePageSize() {
  var n = Number(getConfig().pageSize);
  return (n && n > 0) ? n : 0;   // 0 = 不分页，全部显示
}

/* 计算当前分页并渲染「卡片列表 + 翻页器」 */
function homeListHtml(filtered, ads, adsEnabled, page, pageSize, emptyMsg, emptyExtra) {
  var total = filtered.length;
  var totalPages = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  var pageItems = pageSize > 0 ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;
  var list = renderCardList(pageItems, ads, adsEnabled);
  if (!pageItems.length) {
    list = '<div class="empty"><div class="big">' + svgIcon('doc', 36) + '</div><p>' + (emptyMsg || t('home.noPosts')) + '</p>'
      + (emptyExtra || '') + '</div>';
  }
  var pager = pagerHtml(page, totalPages);
  // 不分页时翻页器不渲染，其 32px 下边距随之消失，末尾文章会贴住底部导航 ——
  // 此时给列表容器加 list-nopager 类，由 CSS 补齐同等间距
  return { html: '<div id="listContainer"' + (pager ? '' : ' class="list-nopager"') + '>' + list + '</div>' + pager, page: page, totalPages: totalPages };
}

/* 翻页器：上一页 / 下一页，保留当前标签与页码（query 形式，链接可前进/后退）。
 * 仅在第 1 页时显示「下一页」，末页时显示「上一页」，单页则不显示翻页器。 */
function pagerHtml(page, totalPages) {
  if (totalPages <= 1) return '';
  var tag = (currentRoute().query.tag) || '';
  var prevHref = href('/', tag ? { tag: tag, page: page - 1 } : { page: page - 1 });
  var nextHref = href('/', tag ? { tag: tag, page: page + 1 } : { page: page + 1 });
  var parts = [];
  if (page > 1) parts.push('<a class="pager-btn" href="' + esc(prevHref) + '">' + t('pagination.prev') + '</a>');
  parts.push('<span class="pager-info">' + t('pagination.page', { current: page, total: totalPages }) + '</span>');
  if (page < totalPages) parts.push('<a class="pager-btn" href="' + esc(nextHref) + '">' + t('pagination.next') + '</a>');
  return '<div class="pager">' + parts.join('') + '</div>';
}

function renderHome() {
  var cfg = getConfig();
  var posts = sortPagePosts(getPublishedPosts());
  var cur = currentRoute();
  var tag = cur.query.tag || '';
  var ads = cfg.ads || {};
  var adsEnabled = !!ads.enabled;
  var pageSize = homePageSize();
  var page = parseInt(cur.query.page, 10) || 1;
  var html = renderNav(cur.path);
  html += '<main class="container page-fade"><div class="list-head"><h2 class="page-title">' + t('home.latest') + '</h2></div>';
  if (tag) {
    html += '<div class="current-tag"><span class="tag-chip">' + esc(tag) + ' <a class="tag-clear" href="' + esc(href('/')) + '">✕</a></span></div>';
  }
  html += renderHomeTagRow(posts, tag);
  if (adsEnabled && ads.belowSearch) html += '<div class="ad-slot"><span class="ad-label">' + t('ad.label') + '</span>' + ads.belowSearch + '</div>';
  var filtered = tag ? posts.filter(function (p) { return (p.tags || []).indexOf(tag) >= 0; }) : posts;
  var body;
  // 云端探测中且尚无数据 → 显示加载动画（避免先渲染「还没有文章」空态，等数据到了才变列表）
  var cloudProbing = !_cloudReady && (cfg.mode === 'api' || cfg.mode === 'auto');
  if (cloudProbing && !filtered.length) {
    body = { html: '<div id="listContainer" class="list-nopager">' + homeLoadingHtml() + '</div>', page: 1, totalPages: 1 };
  } else {
    // 云端已确认在线且列表为空 → 「你还未发布文章」+ 写文章引导；静态空（或探测失败）→ 原「还没有文章」
    var cloudEmpty = _cloudReady && _cloudOn() && !filtered.length;
    var emptyMsg = cloudEmpty ? t('home.noPostsCloud') : t('home.noPosts');
    var emptyExtra = cloudEmpty
      ? '<a class="btn btn-sm btn-primary" style="margin-top:14px" href="' + esc(href('/admin/posts/new')) + '" data-no-hijack="1">' + svgIcon('pen', 14) + ' ' + t('admin.dashboard.goWrite') + '</a>'
      : '';
    body = homeListHtml(filtered, ads, adsEnabled, page, pageSize, emptyMsg, emptyExtra);
  }
  html += '<div id="homeBody">' + body.html + '</div>';
  html += '</main>';
  html += renderFooter();
  return html;
}

/* 云端文章加载动画：与首页卡片同构的骨架屏（shimmer），顶部一行「正在拉取文章…」 */
function homeLoadingHtml() {
  var card = function () {
    return '<div class="sk-card">'
      + '<div class="sk-card-main">'
      + '<div class="sk-line sk-meta"></div>'
      + '<div class="sk-line sk-title"></div>'
      + '<div class="sk-line" style="width:90%"></div>'
      + '<div class="sk-line" style="width:65%;height:12px"></div>'
      + '<div class="sk-row">'
      + '<span class="sk-chip"></span><span class="sk-chip"></span><span class="sk-chip"></span>'
      + '</div>'
      + '</div>'
      + '<div class="sk-thumb"></div>'
      + '</div>';
  };
  return '<div class="home-loading" role="status" aria-label="' + esc(t('home.loadingCloud')) + '">'
    + '<div class="home-loading-head">' + svgIcon('spinner', 15) + '<span>' + esc(t('home.loadingCloud')) + '</span></div>'
    + '<div class="home-loading-grid">' + card() + card() + card() + '</div>'
    + '</div>';
}

function searchIconSvg() {
  return '<svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"></circle><circle class="search-dot" cx="15.2" cy="15.2" r="1.6"></circle></svg>';
}

/* 首页标签分类行：位于「最新发布」标题下方、卡片列表上方 */
function renderHomeTagRow(posts, activeTag) {
  var counts = {};
  var order = [];
  posts.forEach(function (p) {
    normalizeTags(p).forEach(function (t) {
      if (!counts[t]) { counts[t] = 0; order.push(t); }
      counts[t]++;
    });
  });
  if (!order.length) return '';
  var html = '<div class="home-tags">';
  html += '<span class="home-tags-label">' + t('home.categoryLabel') + '</span>';
  html += '<div class="home-tags-track">';
  order.forEach(function (t) {
    var on = t === activeTag;
    html += '<a class="home-tag' + (on ? ' active' : '') + '" href="' + esc(href('/', { tag: t })) + '" data-home-tag>' + '<span class="home-tag-text">' + esc(t) + '</span>' + '<span class="home-tag-count">' + counts[t] + '</span></a>';
  });
  html += '</div>';
  html += '</div>';
  return html;
}

/* 渲染卡片（可含广告位），供首页初始及搜索实时过滤复用 */
function renderCardList(plist, ads, adsEnabled) {
  var every = Number(ads.betweenEvery) || 3;
  var out = '';
  plist.forEach(function (p, idx) {
    if (adsEnabled && ads.between && idx > 0 && idx % every === 0) out += '<div class="ad-slot"><span class="ad-label">' + t('ad.label') + '</span>' + ads.between + '</div>';
    out += renderCard(p, idx);
  });
  return out;
}

function renderCard(p, idx) {
  var badges = '';
  if (p.pinned) badges += '<span class="pin">' + svgIcon('pin', 13) + ' ' + t('post.pin') + '</span>';
  var tags = normalizeTags(p).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
  var excerpt = p.excerpt || stripMd(p.content || '').slice(0, 100);
  // 云端可 AI 摘要的文章：摘要位标记 data-ai-excerpt，aiFillSlots 异步拉取 AI 摘要后替换；
  // 没有 AI 摘要（未生成/未启用/拉取失败）时保持默认摘要兜底
  var aiExcerpt = (_cloudOn() && !p.enc && !(Number(p.protected || 0) === 1))
    ? ' data-ai-excerpt="' + esc(p.id) + '"'
    : '';
  return '<a class="post-card" href="' + esc(href(postUrl(p.id))) + '">'
    + '<div class="post-card-main">'
    + '<div class="meta"><span class="date">' + esc(p.date || '') + '</span>' + badges + '</div>'
    + '<h2>' + esc(p.title || '') + '</h2>'
    + '<div class="excerpt"' + aiExcerpt + '>' + esc(excerpt) + '</div>'
    // 标签区恒渲染（无标签时为空容器）：固定高度占位，保证每张卡片等高、布局协调
    + '<div class="mini-tags">' + (tags || '') + '</div>'
    + '</div>'
    + renderPostThumb(p, idx)
    + '</a>';
}

/** 文章缩略图：优先 cover 字段，其次正文第一张图；有图仅显示图，无图显示主题渐变占位（中性图片图标）。
 *  加载速度优化：
 *   · 前 2 张（首屏可视区）给 fetchpriority="high"，其余 "low" —— 浏览器优先拉取首屏图，
 *     避免首屏外大图抢占带宽导致首屏缩略图"慢慢加载"；
 *   · decoding="async"：图片解码不阻塞主线程渲染；
 *   · onload 加 .thumb-in 类 → CSS 淡入（见 style.css），替代"啪地弹出"；
 *   · loading="lazy" + referrerpolicy 保留既有行为。 */
function renderPostThumb(p, idx) {
  var url = String((p && p.cover) || '').trim() || firstImageFrom(p && p.content);
  var title = (p && p.title) || '';
  if (url) {
    var pri = (idx !== undefined && idx < 2) ? 'high' : 'low';
    var lazy = (idx !== undefined && idx < 2) ? 'eager' : 'lazy';
    return '<span class="post-thumb has-img"><img src="' + esc(url) + '" alt="' + esc(title || t('post.thumbnailAlt')) + '" loading="' + lazy + '" decoding="async" fetchpriority="' + pri + '" referrerpolicy="no-referrer" onload="this.classList.add(\'thumb-in\')" onerror="this.remove()"></span>';
  }
  return '<span class="post-thumb ph"><span class="post-thumb-ph">' + svgIcon('image', 26) + '</span></span>';
}

/** 从正文 Markdown 提取第一张图片 URL（![alt](url) 或 <img src="url">） */
function firstImageFrom(content) {
  var s = String(content || '');
  var m = s.match(/!\[[^\]]*\]\(\s*(https?:[^)\s]+)\s*\)/i);
  if (m) return m[1];
  var m2 = s.match(/<img[^>]+src=["'](https?:[^"']+)["']/i);
  return m2 ? m2[1] : '';
}

/* ---------- 手机卡片摘要行数自适应 ----------
 * 手机端（≤768px）：标题实际渲染行数决定摘要可显示行数，把标签上方留白让给摘要：
 *   · 标题 1 行 → 摘要最多 4 行（加 .clamp-4）
 *   · 标题 2 行 → 摘要最多 3 行（默认）
 * iOS Safari（iPhone）特化：禁止系统字号放大（-webkit-text-size-adjust 见 CSS），
 * 行数与字号在横竖屏旋转后保持一致；这里用 Range.getClientRects 数行，
 * 该 API 在 iOS/安卓 Safari/Chrome/Firefox 均稳定，且在 -webkit-line-clamp 约束下返回
 * 实际可见的行盒，不会受摘要是否 clamp 影响。
 * 桌面/平板（>768px）不执行 —— 摘要固定 3 行由 CSS 负责。 */
function countRenderedLines(el) {
  if (!el || !el.firstChild) return 1;
  try {
    var range = document.createRange();
    range.setStart(el.firstChild, 0);
    var last = el.lastChild;
    // 结束于最后一个文本节点（标题是纯文本，lastChild 即为文本节点）
    range.setEnd(last, last.nodeType === 3 ? last.data.length : (last.childNodes && last.childNodes.length) || 1);
    var rects = range.getClientRects();
    var top = null;
    var lines = 0;
    for (var i = 0; i < rects.length; i++) {
      var r = rects[i];
      if (!r || r.height <= 0) continue;   // 跳过零高行盒（换行产生的空行）
      if (top === null || Math.abs(r.top - top) > 1) { lines++; top = r.top; }   // 按行顶坐标去重
    }
    return Math.max(1, lines);
  } catch (e) { return 1; }
}
function fitCardLineClamps() {
  // 仅手机尺寸（≤768px）执行
  var mq = null;
  try { mq = window.matchMedia('(max-width: 768px)'); } catch (e) {}
  if (!mq || !mq.matches) return;
  var cards = document.querySelectorAll('.post-card');
  Array.prototype.forEach.call(cards, function (card) {
    var h2 = card.querySelector('h2');
    var ex = card.querySelector('.excerpt');
    if (!h2 || !ex || !ex.classList) return;
    var lines = countRenderedLines(h2);
    if (lines <= 1) ex.classList.add('clamp-4');
    else ex.classList.remove('clamp-4');
  });
}
function bindFitCardLineClamps() {
  if (window.__fitCardBound) return;
  window.__fitCardBound = true;
  // 旋转/横竖屏切换后重测（iPhone 从竖屏 393px 转到横屏 852px，行数变化）
  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(fitCardLineClamps, 120);
  });
  // 字体加载完成后再测一次（iOS 首屏字体 swapping 会使标题行数变化）
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { fitCardLineClamps(); }).catch(function () {});
  }
}

/* ---------- 文章详情本地缓存 ----------
 * 云端正文（content）缓存到 localStorage：首次点击拉取后存入；
 * 再次点击先显示缓存（秒开），同时后台重新拉取最新数据（SWR），
 * 内容有更新则刷新缓存并自动重渲染为最新正文。 */
function postCacheKey(id) { return 'qingyu.postCache.' + id; }
/* 删除文章后清理其本地痕迹：正文缓存 + 点赞/浏览计数缓存，避免残留脏数据 */
function purgePostLocal(id) {
  try { localStorage.removeItem(postCacheKey(id)); } catch (e) {}
  try { localStorage.removeItem('qingyu.comments.' + id); } catch (e) {}
}
/* 前台即时同步删除：管理后台删除文章后调用，内存/缓存/正文页三处同步，
 * 无需刷新网页 —— 列表与详情立即反映删除结果 */
function syncDeletedPost(id) {
  var pid = String(id || '');
  if (!pid) return false;
  var removed = false;
  if (Array.isArray(window.BLOG_POSTS)) {
    var before = window.BLOG_POSTS.length;
    window.BLOG_POSTS = window.BLOG_POSTS.filter(function (p) { return p && p.id !== pid; });
    removed = window.BLOG_POSTS.length !== before;
  }
  purgePostLocal(pid);
  try { delete _commentsCache[pid]; } catch (e) {}
  try { delete _statsCache[pid]; } catch (e) {}
  // 若当前正停在该文章详情页，跳回首页（避免停留在已删除内容上）
  var cur = currentRoute();
  if (cur && cur.path && cur.path.indexOf('/posts/') === 0) {
    var curId = '';
    try { curId = decodeURIComponent(cur.path.replace('/posts/', '').replace(/\/.*$/, '')); } catch (e) {}
    if (curId === pid) { navigate('/'); }
  }
  return removed;
}
function readPostCache(id) {
  try {
    var raw = localStorage.getItem(postCacheKey(id));
    if (!raw) return null;
    var o = JSON.parse(raw);
    return (o && o.post && typeof o.post.content === 'string') ? o.post : null;
  } catch (e) { return null; }
}
function writePostCache(id, post) {
  try {
    localStorage.setItem(postCacheKey(id), JSON.stringify({ post: { content: post.content || '' }, ts: Date.now() }));
  } catch (e) { /* 容量满/不可用：忽略，下次重新拉取 */ }
}
function clearPostCache(id) {
  try { localStorage.removeItem(postCacheKey(id)); } catch (e) {}
}

/**
 * 将评论列表渲染为「评论树」（顶层 + 多级嵌套回复）。
 * 统一供首次加载与发表/删除后的刷新使用，保证嵌套结构、缩进与“回复”按钮一致。
 * 注意：若父评论被删除或不在列表内，其子孙评论会归并到顶层，避免丢失。
 */
function renderCommentTree(list, canDel) {
  if (!Array.isArray(list) || !list.length) return '<li class="comment-empty">' + t('comment.noComments') + '</li>';
  var roots = [];
  var childMap = {};
  var byId = {};
  list.forEach(function (c) { byId[c.id] = c; childMap[c.id] = []; });
  list.forEach(function (c) {
    // 只有父评论存在且在同一列表内才作为子评论挂靠，否则归到顶层
    if (c.parent_id && byId[c.parent_id]) childMap[c.parent_id].push(c);
    else roots.push(c);
  });

  // 递归渲染单个评论及其子评论
  function renderOne(c, depth) {
    var replies = childMap[c.id] || [];
    var replyBtn = (depth < 3)
      ? '<button class="comment-reply-btn" data-reply-id="' + esc(c.id) + '" data-reply-author="' + esc(c.author) + '">' + t('comment.reply') + '</button>'
      : '';
    var delBtn = canDel
      ? '<button class="comment-del" data-cid="' + esc(c.id) + '">' + t('comment.delete') + '</button>'
      : '';
    // 在内容下方标注“回复了某人”（若该评论是回复）
    // 安全：t() 的插值不做转义，作者名可能含 HTML（服务端只清控制字符），
    // 必须对整个结果 esc 再进 innerHTML（同 admin.js 的 comment.replyTo 用法），
    // 否则父评论作者名可构造存储型 XSS（他人回复时对所有访客触发）。
    var replyToLabel = '';
    if (c.parent_id && byId[c.parent_id]) {
      replyToLabel = '<div class="comment-reply-to">' + esc(t('comment.replyTo', { author: byId[c.parent_id].author })) + '</div>';
    }
    var childrenHtml = replies.length
      ? '<ul class="comment-children">' + replies.map(function (r) { return renderOne(r, depth + 1); }).join('') + '</ul>'
      : '';
    var initial = String(c.author || '?').trim().slice(0, 1) || '?';
    return '<li class="comment" data-id="' + esc(c.id) + '"><div class="comment-head">'
      + '<span class="comment-avatar" aria-hidden="true">' + esc(initial) + '</span>'
      + '<span class="comment-author">' + esc(c.author) + '</span>'
      + '<span class="comment-date">' + esc(c.date || '') + '</span>'
      + '<span class="comment-actions">' + replyBtn + delBtn + '</span>'
      + '</div>'
      + '<div class="comment-main">'
      + replyToLabel
      + '<div class="comment-content">' + escSmoji(esc(c.content)) + '</div>'
      + childrenHtml
      + '</div></li>';
  }

  return roots.map(function (c) { return renderOne(c, 0); }).join('');
}

async function renderPost(id) {
  var cur = currentRoute();
  var html = renderNav(cur.path);
  var posts = getPublishedPosts();
  var post = posts.find(function (p) { return p.id === id; });
  html += '<main class="container page-fade"><div class="post-body">';
  if (!post) {
    // 云端列表尚未拉取完成（boot 探测中）时不能急于下结论：刷新文章页会出现
    // 「内容不存在」一闪而过（内容刚加载出来前先闪红字再变正常）。
    // 此时先显示加载态，等 boot 完成后 route() 重渲染再给出定论（存在→正文 / 不存在→404）。
    var cfgNow = getConfig();
    var cloudPending = (cfgNow.mode === 'api' || cfgNow.mode === 'auto') && !_cloudReady;
    if (cloudPending) {
      html += '<div class="empty"><div class="big">' + svgIcon('spinner', 26) + '</div><p>' + t('site.loading') + '…</p></div></div></main>';
      html += renderFooter();
      app().innerHTML = html;
      return;
    }
    html += '<div class="empty"><div class="big">' + svgIcon('question', 36) + '</div><p>' + t('post.notFound') + '</p><p><a href="' + esc(href('/')) + '">' + t('post.backHome') + '</a></p></div></div></main>';
    html += renderFooter();
    app().innerHTML = html;
    return;
  }

  if (_cloudOn()) {
    // 正文加载：优先本地缓存（首次拉取后存入，再次进入秒开）；
    // 每次进入都后台重新拉取最新正文（SWR），有更新则刷新缓存并重渲染
    var hasContent = !!post.content;
    var fromCache = false;
    if (!hasContent) {
      var cachedPost = readPostCache(post.id);
      if (cachedPost && cachedPost.content) {
        post.content = cachedPost.content;
        post._fullLoaded = true;
        fromCache = true;
      }
    }
    if (!hasContent && !post.content) {
      html += '<div class="empty"><div class="big">' + svgIcon('spinner', 26) + '</div><p>' + t('site.loading') + '…</p></div>';
      html += '</div></main>' + renderFooter();
      app().innerHTML = html;
    }
    // 超时保护：10 秒拿不到正文就放弃加载态，避免“一直加载中”
    var settled = false;
    function finish(data, err) {
      if (settled) return;
      settled = true;
      var full = (data && data.post) || null;
      if (!full) {
        post._fullLoaded = true;
        if (!hasContent && !fromCache) {
          // 文章已被删除（404/不存在）：从本地列表移除并重渲染 → 显示「内容不存在」，终止无限拉取
          if (err && /404|410|not.?found|不存在|未找到|找不到/i.test(String((err && err.message) || err))) {
            if (Array.isArray(window.BLOG_POSTS)) {
              window.BLOG_POSTS = window.BLOG_POSTS.filter(function (p) { return p && p.id !== post.id; });
            }
            route();
            return;
          }
          // 网络/超时类失败：渲染静态失败页（可手动重试），不再自动循环拉取
          renderPostFail(post);
        }
        return;
      }
      var changed = full.content !== undefined && full.content !== post.content;
      if (full.content !== undefined) post.content = full.content;
      if (full.content) writePostCache(post.id, full);
      post._fullLoaded = true;
      if (changed || (!hasContent && !fromCache)) route();
    }
    apiFetch('api/posts/' + encodeURIComponent(post.id))
      .then(function (data) { finish(data); })
      .catch(function (err) { finish(null, err); });
    setTimeout(function () { finish(null); }, 10000);
    if (!post.content) return;   // 无内容（含无缓存）：等待拉取后重渲染或显示失败页
    // 有内容（缓存或已加载）：继续渲染正文，后台拉取完成后若有更新会重渲染
  }
  var content = post.content || '';
  var bodyHtml = renderMarkdown(content || '');
  var tocRes = buildToc(bodyHtml);
  var toc = tocRes.html;
  var tocHeadings = tocRes.headings;
  var tags = normalizeTags(post).map(function (t) { return '<a href="' + esc(href('/', { tag: t })) + '" data-tag-link>' + esc(t) + '</a>'; }).join('');
  var minutes = Math.max(1, Math.ceil((stripMd(content || '').length / 400)));
  html += '<div class="post-header"><h1>' + esc(post.title || '') + '</h1><div class="meta"><span class="meta-date">' + esc(post.date || '') + '</span><span class="meta-dot">·</span><span>' + minutes + ' ' + t('post.minRead') + '</span><span class="meta-dot">·</span><span class="meta-views">' + svgIcon('eye', 14) + ' <span id="viewCount">0</span> ' + t('post.views') + '</span>' + (post.pinned ? '<span class="pin">' + svgIcon('pin', 13) + ' ' + t('post.pin') + '</span>' : '') + '</div></div>';
  html += aiPostSlot(post);
  html += toc;
  html += '<article class="article">' + bodyHtml + '</article>';
  // 点赞：正文尾部，水平居中
  html += '<div class="like-bar"><button class="btn like-btn" id="likeBtn">' + svgIcon('heart', 15) + ' <span id="likeCount">0</span></button></div>';
  // 底部：左标签、右复制链接(+编辑)
  var afEdit = adminOk()
    ? '<a class="btn" href="' + esc(href(postUrl(post.id) + 'edit')) + '">' + svgIcon('pen', 13) + ' ' + t('post.edit') + '</a>'
    : '';
  html += '<div class="article-footer"><div class="af-tags">' + (tags || '') + '</div><div class="af-actions">' + afEdit + '<button class="btn" id="btnCopyLink">' + svgIcon('link', 14) + ' ' + t('post.copyLink') + '</button></div></div>';

  // prev / next
  var sorted = posts.slice().sort(sortPosts);
  var idx = sorted.findIndex(function (p) { return p.id === id; });
  var prev = idx < sorted.length - 1 ? sorted[idx + 1] : null;
  var next = idx > 0 ? sorted[idx - 1] : null;
  html += '<div class="pn-nav">';
  if (prev && next) {
    // 两个都有：左右排列
    html += '<a class="pn-item" href="' + esc(href(postUrl(prev.id))) + '"><span class="pn-dir">' + t('post.prev') + '</span><span class="pn-title">' + esc(prev.title || '') + '</span></a>';
    html += '<a class="pn-item" href="' + esc(href(postUrl(next.id))) + '"><span class="pn-dir">' + t('post.next') + '</span><span class="pn-title">' + esc(next.title || '') + '</span></a>';
  } else if (prev) {
    // 只有上一篇：独占一行左对齐
    html += '<a class="pn-item pn-single" href="' + esc(href(postUrl(prev.id))) + '"><span class="pn-dir">' + t('post.prev') + '</span><span class="pn-title">' + esc(prev.title || '') + '</span></a>';
  } else if (next) {
    // 只有下一篇：独占一行右对齐
    html += '<a class="pn-item pn-single" href="' + esc(href(postUrl(next.id))) + '"><span class="pn-dir">' + t('post.next') + '</span><span class="pn-title">' + esc(next.title || '') + '</span></a>';
  }
  html += '</div>';

  // comments
  html += '<div class="comments"><h3>' + t('comment.title') + ' <span class="comment-count" id="commentCount">' + '0' + '</span></h3>';
  html += '<p class="comment-hint">' + t('comment.hint') + '</p>';
  html += '<div class="reply-indicator" id="replyIndicator" style="display:none"><span id="replyTo"></span><button class="reply-cancel" id="replyCancel">✕</button></div>';
  html += '<div class="comment-form"><input type="text" id="commentAuthor" maxlength="30" placeholder="' + t('comment.authorPlaceholder') + '"><div class="comment-editor-row"><textarea id="commentContent" rows="2" maxlength="1000" placeholder="' + t('comment.contentPlaceholder') + '"></textarea><button type="button" class="comment-emoji-btn" id="commentEmoji" title="' + t('comment.emoji') + '" aria-label="' + t('comment.emoji') + '">😊</button></div><div class="comment-submit-row"><button class="btn btn-primary" id="commentSubmit">' + t('comment.submit') + '</button><span class="c-status" id="commentStatus"></span></div></div>';
  html += '<ul class="comment-list" id="commentList"></ul></div>';

  // 精选文章（评论区下方）
  html += renderFeaturedHtml(post.id);

  var adCfg = getConfig().ads || {};
  if (adCfg.enabled && adCfg.content) html += '<div class="ad-slot"><span class="ad-label">' + t('ad.label') + '</span>' + adCfg.content + '</div>';

  html += '</div></main>' + renderFooter();
  app().innerHTML = html;
  stampHeadingNumbers(tocHeadings);

  // stats load
  loadStats(post.id).then(function (s) {
    var v = document.querySelector('#viewCount'); if (v) v.textContent = String(s.views);
    var l = document.querySelector('#likeCount'); if (l) l.textContent = String(s.likes);
  });
  // 精选文章异步加载
  loadFeaturedPosts(post.id);
  incView(post.id).then(function (s) {
    var v = document.querySelector('#viewCount'); if (v && s) v.textContent = String(s.views);
  });
  var likeBtn = document.querySelector('#likeBtn');
  if (likeBtn) {
    if (wasLiked(post.id)) { likeBtn.classList.add('liked'); likeBtn.disabled = true; }
    likeBtn.addEventListener('click', function () {
      likePost(post.id).then(function (s) {
        var l = document.querySelector('#likeCount');
        if (s && l) l.textContent = String(s.likes);
        likeBtn.classList.add('liked');
        likeBtn.disabled = true;
      });
    });
  }

  var copyBtn = document.querySelector('#btnCopyLink');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var url = location.origin + appRoot() + postUrl(post.id);
    navigator.clipboard && navigator.clipboard.writeText(url) && (copyBtn.textContent = t('post.copied'));
  });

  // load comments（构建评论树：顶层 + 嵌套回复统一渲染）
  function refreshComments(list) {
    var ul = document.querySelector('#commentList');
    var cnt = document.querySelector('#commentCount');
    if (!ul) return;
    if (cnt) cnt.textContent = String(list ? list.length : 0);
    var canDel = !_cloudOn() || adminOk();
    if (!list || !list.length) { ul.innerHTML = '<li class="comment-empty">' + t('comment.noComments') + '</li>'; return; }
    ul.innerHTML = renderCommentTree(list, canDel);
    // 删除按钮
    ul.querySelectorAll('.comment-del').forEach(function (b) {
      b.addEventListener('click', function () {
        deleteComment(post.id, b.getAttribute('data-cid')).then(refreshComments);
      });
    });
    // 回复按钮（含二级/三级回复，均可继续回复）
    ul.querySelectorAll('.comment-reply-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var indicator = document.querySelector('#replyIndicator');
        var replyTo = document.querySelector('#replyTo');
        var contentInput = document.querySelector('#commentContent');
        if (indicator && replyTo) {
          indicator.style.display = 'flex';
          replyTo.textContent = t('comment.replyTo', { author: b.getAttribute('data-reply-author') });
          indicator.setAttribute('data-reply-id', b.getAttribute('data-reply-id'));
          if (contentInput) contentInput.focus();
        }
      });
    });
  }
  loadComments(post.id).then(refreshComments);

  // 取消回复
  var replyCancel = document.querySelector('#replyCancel');
  if (replyCancel) replyCancel.addEventListener('click', function () {
    var indicator = document.querySelector('#replyIndicator');
    if (indicator) { indicator.style.display = 'none'; indicator.removeAttribute('data-reply-id'); }
  });

  // 评论框表情选择器
  var commentEmoji = document.querySelector('#commentEmoji');
  var commentContent = document.querySelector('#commentContent');
  if (commentEmoji && commentContent && window.initSmojiPicker) window.initSmojiPicker(commentEmoji, commentContent);

  var submit = document.querySelector('#commentSubmit');
  if (submit) submit.addEventListener('click', async function () {
    var a = document.querySelector('#commentAuthor');
    var c = document.querySelector('#commentContent');
    var st = document.querySelector('#commentStatus');
    var indicator = document.querySelector('#replyIndicator');
    if (!a || !c) return;
    if (!a.value.trim() || !c.value.trim()) { if (st) st.textContent = t('comment.fillBoth'); return; }
    var parentId = (indicator && indicator.getAttribute('data-reply-id')) || null;
    submit.disabled = true;
    try {
      await saveComment(post.id, a.value, c.value, parentId);
      if (st) st.textContent = t('comment.posted');
      if (c) c.value = '';
      if (indicator) { indicator.style.display = 'none'; indicator.removeAttribute('data-reply-id'); }
      loadComments(post.id).then(refreshComments);
    } catch (e) {
      // 失败时保留已输入内容，并显示具体原因（重复内容 / 频率限制 / 网络错误等）
      if (st) st.textContent = (e && e.message) || t('comment.fail');
    } finally {
      submit.disabled = false;
    }
  });
}

/* 正文加载失败（网络/超时）时渲染的静态失败页：保留标题，提供手动重试，不再自动循环拉取 */
function renderPostFail(post) {
  var html = renderNav(currentRoute().path);
  html += '<main class="container page-fade"><div class="post-body"><div class="post-header"><h1>' + esc(post.title || t('post.untitled')) + '</h1><div class="meta"><span class="meta-date">' + esc(post.date || '') + '</span></div></div>';
  html += '<div class="empty" style="padding:44px 0"><div class="big">' + svgIcon('cloud', 32) + '</div><p>' + t('post.loadFail') + '</p><p style="margin-top:14px"><button class="btn btn-primary" id="retryPostBtn">' + svgIcon('refresh', 14) + ' ' + t('post.retry') + '</button> <a class="btn" href="' + esc(href('/')) + '">' + t('post.backHome') + '</a></p></div>';
  html += '</div></main>' + renderFooter();
  app().innerHTML = html;
  var retry = document.querySelector('#retryPostBtn');
  if (retry) retry.addEventListener('click', function () { route(); });
}

function renderArchive() {
  var posts = sortPagePosts(getPublishedPosts());
  var byYear = {};
  posts.forEach(function (p) {
    var yr = (p.date || '').slice(0, 4) || t('archive.unknown');
    var mo = Number((p.date || '').slice(5, 7) || 0);
    if (!byYear[yr]) byYear[yr] = {};
    if (!byYear[yr][mo]) byYear[yr][mo] = [];
    byYear[yr][mo].push(p);
  });
  var html = renderNav(currentRoute().path);
  html += '<main class="container page-fade"><h2 class="page-title">' + t('archive.title') + '</h2>';
  Object.keys(byYear).sort().reverse().forEach(function (yr) {
    html += '<div class="archive-year"><h2>' + esc(yr) + ' ' + t('archive.year') + '</h2>';
    Object.keys(byYear[yr]).sort(function (a, b) { return Number(b) - Number(a); }).forEach(function (mo) {
      var list = byYear[yr][mo];
      html += '<div class="archive-month"><h3>' + esc(mo) + ' ' + t('archive.month') + ' <span class="count">' + list.length + ' ' + t('archive.count') + '</span></h3><ul>';
      list.forEach(function (p) {
        html += '<li><a href="' + esc(href(postUrl(p.id))) + '">' + esc(p.title || '') + '</a></li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';
  });
  html += '</main>' + renderFooter();
  return html;
}

function renderAbout() {
  var posts = getPublishedPosts();
  var tags = {};
  var totalWords = 0;
  var latest = '';
  posts.forEach(function (p) {
    normalizeTags(p).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
    totalWords += stripMd(p.content || '').length;
    if (!latest || p.date > latest) latest = p.date;
  });
  var cfg = getConfig();
  var html = renderNav(currentRoute().path);
  html += '<main class="container page-fade"><h2 class="page-title">' + t('about.title') + '</h2><div class="about-card card">';
  // 关于页面正文优先级：
  //   1) 云端「站点基础信息 → 关于页面内容（Markdown）」  ← 用户可在 /admin/settings 编辑
  //   2) 静态收藏的「qingyu-blog-intro」文章正文
  //   3) 回退为「站点名称 + 简介」
  var aboutMd = (cfg.site && cfg.site.about) ? String(cfg.site.about).trim() : '';
  var intro = (posts || []).find(function (p) { return p.id === 'qingyu-blog-intro'; });
  if (aboutMd) {
    html += '<div class="article about-intro">' + renderMarkdown(aboutMd) + '</div>';
  } else if (intro && intro.content) {
    html += '<div class="article about-intro">' + renderMarkdown(intro.content) + '</div>';
  } else {
    html += '<h3>' + getSiteName() + '</h3><p>' + t('about.desc') + '</p>';
  }
  // 作者资料卡：展示后台「博客设置 → 个人资料」中保存的头像/昵称/简介（来自 D1 设置）
  var prof = cfg.profile || {};
  var siteName = cfg.site && cfg.site.name ? cfg.site.name : '';
  var profName = prof.name || siteName || '';
  var profAvatar = prof.avatar || (cfg.site && cfg.site.avatar) || '';
  var profBio = prof.bio || '';
  if (profName || profAvatar || profBio) {
    html += '<div class="about-author card">';
    if (profAvatar) html += '<img class="about-author-avatar" src="' + esc(profAvatar) + '" alt="' + esc(profName || 'avatar') + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
    html += '<div class="about-author-info">';
    if (profName) html += '<div class="about-author-name">' + esc(profName) + '</div>';
    if (profBio) html += '<div class="about-author-bio">' + esc(profBio) + '</div>';
    html += '</div></div>';
  }
  html += '<hr class="about-sep">';
  html += '<div class="stat-grid"><div class="stat"><b>' + posts.length + '</b><span>' + t('about.posts') + '</span></div><div class="stat"><b>' + Object.keys(tags).length + '</b><span>' + t('about.tags') + '</span></div><div class="stat"><b>' + totalWords + '</b><span>' + t('about.totalWords') + '</span></div><div class="stat"><b>' + esc(latest || '-') + '</b><span>' + t('about.latestUpdate') + '</span></div></div>';
  html += '<h3>' + t('about.version') + '</h3><p>v' + esc(BLOG_VERSION) + '</p><h3>' + t('about.dataMode') + '</h3><p>' + (_cloudOn() ? t('about.cloudMode') : t('about.staticMode')) + '</p><h3>' + t('about.firstUse') + '</h3><p>' + t('about.firstUseHint') + '</p>';
  html += '</div></main>' + renderFooter();
  return html;
}

function renderTags() {
  var posts = getPublishedPosts();
  var counts = {};
  posts.forEach(function (p) {
    normalizeTags(p).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
  });
  var html = renderNav(currentRoute().path);
  html += '<main class="container page-fade"><h2 class="page-title">' + svgIcon('tag', 20) + ' ' + t('tags.title') + '</h2><div class="tag-cloud">';
  Object.keys(counts).sort().forEach(function (t) {
    html += '<a class="cloud-chip" href="' + esc(href('/', { tag: t })) + '">' + esc(t) + '<span class="cloud-count">' + counts[t] + '</span></a>';
  });
  html += '</div></main>' + renderFooter();
  return html;
}

/* ============================================================
 * 留言板（云端，复用评论域的安全管道）
 * ------------------------------------------------------------
 * 访客可在「留言」或「项目优化方案」两个分区发表内容。
 * 数据模型：直接复用 cloud 评论接口（/api/posts/:id/comments），
 * 用两个固定的合成 post_id 区分分区（gb-note / gb-idea），
 * 从而自动获得评论域的整套安全能力：
 *   · 跨源 Origin 校验（403）
 *   · 按 IP 频率限制（每分钟 5 条 / 429）
 *   · ASCII 控制字符清洗 + 长度上限（昵称 30 / 内容 1000）
 *   · 可选审核（moderate_comments）
 * 不新增后端接口与数据表，避免重复实现安全逻辑。
 * ============================================================ */
var GUESTBOOK_IDS = { note: 'gb-note', idea: 'gb-idea' };
function guestbookId(kind) { return GUESTBOOK_IDS[kind] || GUESTBOOK_IDS.note; }

function renderGuestbook() {
  var html = renderNav(currentRoute().path);
  html += '<main class="container page-fade">'
    + '<div class="guestbook">'
    + '<header class="guestbook-head">'
    + '<div class="guestbook-head-icon">' + svgIcon('quote', 22) + '</div>'
    + '<div><h2 class="page-title">' + t('guestbook.title') + '</h2>'
    + '<p class="guestbook-sub">' + t('guestbook.desc') + '</p></div>'
    + '</header>'
    // 分区切换：留言 / 项目优化方案
    + '<div class="guestbook-tabs" id="gbTabs">'
    + '<button class="gb-tab active" data-kind="note">' + svgIcon('quote', 14) + ' ' + t('guestbook.noteTab') + '</button>'
    + '<button class="gb-tab" data-kind="idea">' + svgIcon('pen', 14) + ' ' + t('guestbook.ideaTab') + '</button>'
    + '</div>'
    // 发表表单
    + '<div class="guestbook-form card">'
    + '<div class="gb-form-row">'
    + '<input type="text" id="gbAuthor" maxlength="30" placeholder="' + t('guestbook.authorPlaceholder') + '" autocomplete="name">'
    + '<button class="gb-submit" id="gbSubmit" type="button" aria-label="' + t('guestbook.postAnon') + '">' + svgIcon('send', 15) + '</button>'
    + '</div>'
    + '<div class="gb-kind-hint" id="gbKindHint">' + svgIcon('pen', 13) + ' <span></span></div>'
    + '<textarea id="gbContent" rows="3" maxlength="1000" placeholder="' + t('guestbook.contentPlaceholder') + '"></textarea>'
    + '<div class="gb-form-foot">'
    + '<button type="button" class="gb-emoji-btn" id="gbEmoji" title="' + t('guestbook.emoji') + '" aria-label="' + t('guestbook.emoji') + '">😊</button>'
    + '<span class="gb-status" id="gbStatus"></span>'
    + '<span class="gb-count" id="gbCount"></span></div>'
    + '</div>'
    // 留言列表
    + '<div class="guestbook-list" id="gbList" aria-live="polite"></div>'
    + '</div></main>' + renderFooter();
  return html;
}

/* 绑定留言板交互：分区切换、发表、列表加载 */
async function bindGuestbook() {
  var kind = 'note';
  var tabs = Array.prototype.slice.call(document.querySelectorAll('#gbTabs .gb-tab'));
  var list = document.querySelector('#gbList');
  var author = document.querySelector('#gbAuthor');
  var content = document.querySelector('#gbContent');
  var submit = document.querySelector('#gbSubmit');
  var status = document.querySelector('#gbStatus');
  var count = document.querySelector('#gbCount');
  var hint = document.querySelector('#gbKindHint');
  if (hint) hint.setAttribute('data-kind', 'note');

  function refreshUI() {
    tabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-kind') === kind); });
    var label = t(kind === 'idea' ? 'guestbook.ideaKind' : 'guestbook.noteKind');
    if (hint) { hint.setAttribute('data-kind', kind); var sp = hint.querySelector('span'); if (sp) sp.textContent = label; }
  }

  function setList(entries) {
    if (!list) return;
    if (!entries || !entries.length) {
      list.innerHTML = '<div class="gb-empty"><div class="gb-empty-icon">' + svgIcon('quote', 26) + '</div><p>' + t('guestbook.empty') + '</p></div>';
      if (count) count.textContent = '0';
      return;
    }
    // 最新在前：云端按写入序（rowid ASC）返回，直接倒序即可
    // （SELECT * 不含隐式 rowid 列，故不能用 rowid 字段排序）
    var sorted = entries.slice().reverse();
    var kindClass = kind === 'idea' ? 'idea' : 'note';
    var kindLabel = t(kind === 'idea' ? 'guestbook.ideaTag' : 'guestbook.noteTag');
    list.innerHTML = sorted.map(function (c) {
      return '<div class="gb-entry card">'
        + '<div class="gb-entry-head">'
        + '<span class="gb-avatar">' + esc((c.author || '?').slice(0, 1)) + '</span>'
        + '<span class="gb-author">' + esc(c.author || '') + '</span>'
        + '<span class="gb-kind-badge ' + kindClass + '">' + kindLabel + '</span>'
        + '<span class="gb-date">' + esc(c.date || '') + '</span>'
        + '</div>'
        + '<div class="gb-entry-content">' + escSmoji(esc(c.content || '')) + '</div>'
        + '</div>';
    }).join('');
    if (count) count.textContent = String(entries.length);
  }

  function load() {
    loadComments(guestbookId(kind)).then(setList);
  }

  if (tabs) tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      kind = b.getAttribute('data-kind') || 'note';
      refreshUI();
      load();
    });
  });

  if (submit && author && content) {
    submit.addEventListener('click', onPost);
    content.addEventListener('keydown', function (e) {
      // Ctrl/Cmd + Enter 快捷提交
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); onPost(); }
    });
  }
  async function onPost() {
    if (!author || !content || !status) return;
    if (!author.value.trim() || !content.value.trim()) { status.textContent = t('guestbook.fillBoth'); return; }
    submit.disabled = true;
    status.textContent = t('guestbook.posting');
    try {
      var c = await saveComment(guestbookId(kind), author.value, content.value);
      status.textContent = t('guestbook.posted');
      content.value = '';
      load();
    } catch (e) {
      // 失败时保留已输入内容，并显示具体原因（重复内容 / 频率限制 / 网络错误等）
      status.textContent = (e && e.message) || t('guestbook.fail');
    } finally { submit.disabled = false; }
  }

  var gbEmoji = document.querySelector('#gbEmoji');
  if (gbEmoji && content && window.initSmojiPicker) window.initSmojiPicker(gbEmoji, content);

  refreshUI();
  load();
}

/* ---------- 管理后台辅助函数 ---------- */
function adminRoute() {
  var path = currentRoute().path;
  if (path === '/write' || path === '/admin' || path === '/admin/write') return 'write';
  if (path === '/admin/posts') return 'posts';
  if (/^\/admin\/posts\/[^\/]+\/edit$/.test(path)) return 'edit';
  return 'write';
}

function getEditIdFromRoute() {
  var path = currentRoute().path;
  var match = path.match(/^\/admin\/posts\/([^\/]+)\/edit$/);
  if (!match) return null;
  // location.pathname 对中文/特殊字符 id 是百分号编码形式，必须解码后
  // 才能与 window.BLOG_POSTS 里的原始 id 匹配、并避免 apiFetch 二次编码 404
  try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
}

function renderAdminSidebar(active) {
  var postCount = (getStaticPosts() || []).length;
  var isEdit = active === 'edit';
  return '<aside class="admin-sidebar">'
    + '<div class="admin-sidebar-brand">'
    + '<span class="admin-brand-badge">' + svgIcon('pen', 15) + '</span>'
    + '<span class="admin-brand-text">' + t('admin.brand') + '<span class="admin-sidebar-ver">v' + esc(BLOG_VERSION) + '</span></span>'
    + '</div>'
    + '<nav class="admin-sidebar-nav">'
    + '<div class="admin-nav-group">' + svgIcon('doc', 12) + ' ' + t('admin.nav.content') + '</div>'
    + '<a href="' + esc(href('/admin/posts')) + '" class="admin-nav-item' + (active === 'posts' || isEdit ? ' active' : '') + '">' + svgIcon('doc', 15) + '<span>' + t('admin.sidebar.allPosts') + '</span><span class="admin-nav-count">' + postCount + '</span></a>'
    + '<div class="admin-nav-group">' + svgIcon('pen', 12) + ' ' + t('admin.nav.write') + '</div>'
    + '<a href="' + esc(href('/admin/write')) + '" class="admin-nav-item' + (active === 'write' ? ' active' : '') + '">' + svgIcon('pen', 15) + '<span>' + t('editor.title') + '</span></a>'
    + '</nav>'
    + '<div class="admin-sidebar-footer">'
    + '<div class="admin-sidebar-mode">' + (_cloudOn() ? svgIcon('cloud', 12) + ' ' + t('editor.cloudMode') : svgIcon('file', 12) + ' ' + t('editor.localMode')) + '</div>'
    + '<button class="btn btn-ghost btn-logout" id="btnLogoutSidebar">' + svgIcon('logout', 14) + ' ' + t('admin.sidebar.logout') + '</button>'
    + '</div>'
    + '</aside>';
}

function renderPostList() {
  var posts = getStaticPosts();
  if (!posts || !posts.length) {
    return '<div class="admin-posts-header">'
      + '<div class="admin-head-titles"><h2>' + svgIcon('doc', 20) + ' ' + t('admin.postList.title') + '</h2><p class="admin-head-sub">' + t('admin.postList.emptyHint') + ' <a href="' + esc(href('/admin/write')) + '">' + t('editor.newPost') + '</a></p></div>'
      + '</div>';
  }
  var pinnedCount = posts.filter(function (p) { return p.pinned; }).length;
  var html = '<div class="admin-posts-header">'
    + '<div class="admin-head-titles"><h2>' + svgIcon('doc', 20) + ' ' + t('admin.postList.title') + '</h2><p class="admin-head-sub">' + t('admin.postList.desc') + '</p></div>'
    + '<a class="btn btn-primary btn-new-post" href="' + esc(href('/admin/write')) + '">' + svgIcon('pen', 14) + ' ' + t('editor.newPost') + '</a>'
    + '</div>';
  html += aiCommentsSlotHTML();
  html += '<div class="admin-stats">'
    + '<div class="admin-stat"><span class="admin-stat-num">' + posts.length + '</span><span class="admin-stat-label">' + t('admin.postList.allStatus') + '</span></div>'
    + '<div class="admin-stat"><span class="admin-stat-num">' + pinnedCount + '</span><span class="admin-stat-label">' + t('admin.postList.pin') + '</span></div>'
    + '</div>';
  html += '<table class="admin-posts-table"><thead><tr><th>' + t('admin.postList.colTitle') + '</th><th>' + t('admin.postList.colDate') + '</th><th>' + t('admin.postList.colStatus') + '</th><th>' + t('admin.postList.colActions') + '</th></tr></thead><tbody>';
  posts.forEach(function (p) {
    var status = p.pinned ? svgIcon('pin', 12) + ' ' + t('admin.postList.pin') : t('post.published');
    var title = p.title || t('admin.postList.noTitle');
    html += '<tr>'
      + '<td class="post-title-cell"><a class="post-title-link" href="' + esc(href('/admin/posts/' + encodeURIComponent(p.id) + '/edit')) + '">' + esc(title) + svgIcon('external', 12) + '</a></td>'
      + '<td class="post-date-cell">' + esc(p.date || '') + '</td>'
      + '<td><span class="status-badge' + (p.pinned ? ' pinned' : '') + '">' + status + '</span></td>'
      + '<td><div class="post-actions">'
      + '<a href="' + esc(href('/admin/posts/' + encodeURIComponent(p.id) + '/edit')) + '" class="btn btn-sm">' + svgIcon('pen', 13) + ' ' + t('admin.postList.edit') + '</a>'
      + '<button class="btn btn-sm' + (p.pinned ? ' btn-on' : '') + '" data-pin-id="' + esc(p.id) + '" title="' + (p.pinned ? t('admin.postList.unpin') : t('admin.postList.pin')) + '">' + svgIcon('pin', 13) + ' ' + (p.pinned ? t('admin.postList.unpin') : t('admin.postList.pin')) + '</button>'
      + '<button class="btn btn-sm btn-danger" data-post-id="' + esc(p.id) + '" data-post-title="' + esc(title) + '">' + svgIcon('trash', 13) + ' ' + t('post.delete') + '</button>'
      + '</div></td>'
      + '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

/* ---------- 文章列表：置顶 ---------- */

/** 从本地列表取文章对象（含完整数据） */
function findPostForUpdate(id) {
  var arr = Array.isArray(window.BLOG_POSTS) ? window.BLOG_POSTS : [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && arr[i].id === id) return arr[i];
  }
  return null;
}

/** 云端：拉取文章详情（列表摘要不含 content/enc） */
async function fetchPostDetail(id) {
  var data = await apiFetch('api/posts/' + encodeURIComponent(id));
  return (data && data.post) ? data.post : null;
}

/** 云端：PUT 更新单篇。必须带全字段，否则 PUT 会以缺省值覆盖内容/密文/标签 */
async function savePostToCloud(post) {
  var body = {
    id: post.id,
    title: post.title || '',
    date: post.date || '',
    excerpt: post.excerpt || '',
    cover: post.cover || '',
    tags: Array.isArray(post.tags) ? post.tags : [],
    pinned: !!post.pinned,
    content: post.content || ''
  };
  await apiFetch('api/posts/' + encodeURIComponent(post.id), { method: 'PUT', body: JSON.stringify(body) });
}

/** 更新本地列表项；静态模式导出新 posts.js 供覆盖发布 */
function upsertLocalPost(post, exportStatic) {
  var arr = (Array.isArray(window.BLOG_POSTS) ? window.BLOG_POSTS : []).slice();
  var idx = arr.findIndex(function (p) { return p && p.id === post.id; });
  if (idx >= 0) arr[idx] = post; else arr.push(post);
  window.BLOG_POSTS = arr;
  if (exportStatic) {
    var blob = new Blob(['window.BLOG_POSTS=' + JSON.stringify(arr, null, 2) + ';'], { type: 'application/javascript' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'posts.js';
    a.click();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 3000);
  }
}

/** 列表页：切换置顶（云端 PUT / 静态改本地并导出） */
async function togglePinFromList(id) {
  var post = findPostForUpdate(id);
  if (!post) { alert(t('toast.notFound')); return; }
  var target = !post.pinned;
  try {
    if (_cloudOn()) {
      var full = await fetchPostDetail(id);   // 以云端详情为准（含最新内容/密文）
      if (full) post = full;
    }
  } catch (e) {
    alert(t('toast.networkError'));
    return;
  }
  post.pinned = target;
  if (_cloudOn()) {
    try {
      await savePostToCloud(post);
      upsertLocalPost(post, false);
      alert(target ? t('toast.pinnedCloud') : t('toast.unpinnedCloud'));
    } catch (e) {
      alert(t('toast.networkError'));
      return;
    }
  } else {
    upsertLocalPost(post, true);
    alert(target ? t('toast.pinnedLocal') : t('toast.unpinnedLocal'));
  }
  route();
}




function renderEditorBody() {
  var _editId = currentEditId();
  var _editPost = _editId ? getStaticPosts().find(function (p) { return p.id === _editId; }) : null;
  // 如果路由是编辑模式，使用路由中的 ID 覆盖
  if (adminRoute() === 'edit') {
    var routeId = getEditIdFromRoute();
    if (routeId) {
      _editId = routeId;
      _editPost = getStaticPosts().find(function (p) { return p.id === _editId; });
    }
  }
  var body = '';
  body += '<div class="write-head">'
    + '<h2 class="page-title wh-title">' + svgIcon('pen', 20) + ' ' + t('editor.title') + '</h2>'
    + (_cloudOn()
        ? '<span class="mode-chip cloud">' + svgIcon('cloud', 12) + ' ' + t('editor.cloudMode') + '</span>'
        : '<span class="mode-chip local">' + svgIcon('file', 12) + ' ' + t('editor.localMode') + '</span>')
    + (_editId ? '<span class="mode-chip editing" id="writeTitleHint">' + (_editPost ? esc(t('editor.editing') + '：' + (_editPost.title || '')) : t('editor.newPost')) + '</span>' : '')
    + '</div>';
  body += '<div class="card editor-meta"><div class="editor-grid">'
    + '<div class="field field-full"><label>' + t('editor.titlePlaceholder') + '</label><input type="text" id="titleInput" placeholder="' + t('editor.titlePlaceholder') + '"></div>'
    + '<div class="field"><label>' + t('editor.datePlaceholder') + '</label><div style="display:flex;gap:8px;align-items:center;"><input type="datetime-local" id="dateInput" style="flex:1;"><button class="btn btn-sm btn-ghost" id="btnToday" title="' + t('editor.setNow') + '" style="flex-shrink:0;padding:5px 10px;font-size:12px;">' + t('editor.today') + '</button></div></div>'
    + '<div class="field"><label>' + t('editor.tagsPlaceholder') + '</label><input type="text" id="tagInput" placeholder="' + t('editor.tagsExample') + '"></div>'
    + '<div class="field field-full"><label>' + t('editor.excerptPlaceholder') + '</label><input type="text" id="excerptInput" placeholder="' + t('editor.excerptHint') + '"></div>'
    + '<div class="field field-full"><label>' + t('editor.coverPlaceholder') + '</label><input type="text" id="coverInput" placeholder="' + t('editor.coverHint') + '"></div>'
    + '<div class="field check-label"><label><input type="checkbox" id="pinnedInput"> ' + svgIcon('pin', 13) + ' ' + t('editor.pin') + '</label></div>'
    + '</div></div>';
  body += aiAssistSlotHTML();
  body += '<div class="editor-wrap">'
    + '<section class="editor-pane"><div class="pane-head">' + svgIcon('pen', 13) + ' ' + t('editor.editing') + '<span class="pane-note">Markdown</span></div><div id="toolbar" class="toolbar">' + toolbarHtml() + '</div><textarea id="mdInput" class="md-input" rows="18" placeholder="' + t('editor.writeHint') + '"></textarea></section>'
    + '<section class="editor-pane preview-pane"><div class="pane-head">' + svgIcon('eye', 13) + ' ' + t('editor.preview') + '<span class="pane-note">' + t('editor.realtimeRender') + '</span></div><div class="write-preview article preview-body" id="previewPane"></div></section>'
    + '</div>';
  body += '<div class="editor-actions actions-bar">'
    + (_cloudOn() ? '<button class="btn btn-primary" id="btnCloud">' + svgIcon('cloud', 15) + ' ' + t('editor.cloudPublish') + '</button>' : '')
    + '<button class="btn btn-primary" id="btnSave">' + svgIcon('save', 15) + ' ' + t('editor.savePost') + '</button>'
    + '<span class="action-sep"></span>'
    + '<button class="btn" id="btnSaveDraft">' + svgIcon('upload', 15) + ' ' + t('editor.saveDraft') + '</button>'
    + '<button class="btn" id="btnImport">' + svgIcon('file', 15) + ' ' + t('editor.importMd') + '</button>'
    + '<input type="file" id="mdFileInput" accept=".md,.markdown" hidden>'
    + '<button class="btn" id="btnOpenMdEditor">' + svgIcon('external', 15) + ' ' + t('editor.officialEditor') + '</button>'
    + '<span class="action-sep"></span>'
    + '<button class="btn" id="btnExport">' + svgIcon('download', 15) + ' ' + t('editor.exportPosts') + '</button>'
    + '<button class="btn" id="btnExportAll" title="' + t('editor.exportAllTitle') + '">' + svgIcon('save', 15) + ' ' + t('editor.exportAll') + '</button>'
    + '<button class="btn" id="btnRss">' + svgIcon('rss', 15) + ' RSS</button>'
    + '<button class="btn" id="btnSitemap">' + svgIcon('sitemap', 15) + ' Sitemap</button>'
    + '<span class="actions-right"><span class="word-count" id="wordCount"></span><span class="save-status" id="saveStatus"></span>'
    + '<button class="btn btn-outline-danger btn-logout" id="btnClearData" title="' + t('editor.clearDataTitle') + '">' + svgIcon('trash', 14) + ' ' + t('editor.cleanData') + '</button>'
    + '<button class="btn btn-ghost btn-logout" id="btnLogout">' + svgIcon('logout', 15) + ' ' + t('editor.exitLogin') + '</button></span>'
    + '</div>';
  body += '<p class="keys-hint"><kbd>Ctrl</kbd>+<kbd>S</kbd> ' + t('editor.saveDraft') + ' · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> ' + t('editor.savePost') + '</p>';
  body += '<h3 class="draft-hint"><b>' + t('editor.exportAll') + ':</b> ' + t('editor.exportHint') + '</h3>';
  return body;
}

function renderWrite() {
  var html = renderNav(currentRoute().path);
  html += '<main class="container page-fade write-page">';
  if (!adminOk()) {
    if (_cloudOn()) {
      // 云端模式：密码校验于 Cloudflare D1 后端，此页只做登录（token 已存则直接进入编辑）。
      // 首次部署：登录框下方提供「安装密钥初始化」入口（后端 BLOG_ADMIN_SETUP_KEY 必填）。
      html += '<div class="card gate-card">'
        + '<div class="gate-badge">' + svgIcon('lock', 26) + '</div>'
        + '<h3 class="gate-title">' + t('admin.login') + '</h3>'
        + '<p class="gate-sub">' + t('admin.loginHint') + '</p>'
        + '<div class="gate-form"><input type="password" id="gatePwd" placeholder="' + t('admin.pwdLabel') + '" autocomplete="current-password"><button class="btn btn-primary" id="btnGate">' + svgIcon('logout', 15) + ' ' + t('admin.loginBtn') + '</button></div>'
        + '<div class="gate-msg alert-strip" id="gateMsg"></div>'
        + '<button type="button" class="gate-link" id="btnCloudSetup">' + t('admin.gotoCloudSetup') + '</button>'
        + '<div class="gate-form" id="gateSetupForm" style="display:none">'
        + '<input type="password" id="setupKey" placeholder="' + t('admin.setupKeyLabel') + '" autocomplete="off">'
        + '<input type="password" id="setupPwd2" placeholder="' + t('admin.pwdLabel') + '" autocomplete="new-password">'
        + '<button class="btn btn-primary" id="btnCloudSetupGo">' + t('admin.setupBtn') + '</button>'
        + '<button type="button" class="gate-link" id="btnCloudSetupBack">' + t('admin.backToLogin') + '</button>'
        + '</div>'
        + '<div class="gate-foot"><a href="' + esc(href('/')) + '">' + t('admin.backHome') + '</a></div>'
        + '</div>';
    } else if (needAdminSetup()) {
      html += '<div class="card gate-card">'
        + '<div class="gate-badge">' + svgIcon('lock', 26) + '</div>'
        + '<h3 class="gate-title">' + t('admin.setupPwd') + '</h3>'
        + '<p class="gate-sub">' + t('admin.setupHint') + '</p>'
        + '<div class="gate-form"><input type="password" id="setupPwd" placeholder="' + t('admin.pwdLabel') + '" autocomplete="new-password"><button class="btn btn-primary" id="btnSetup">' + t('admin.setupBtn') + '</button></div>'
        + '<div class="gate-msg alert-strip" id="gateMsg"></div>'
        + '</div>';
    } else {
      html += '<div class="card gate-card">'
        + '<div class="gate-badge">' + svgIcon('lock', 26) + '</div>'
        + '<h3 class="gate-title">' + t('admin.loginTitle') + '</h3>'
        + '<p class="gate-sub">' + t('admin.loginDesc') + '</p>'
        + '<div class="gate-form"><input type="password" id="gatePwd" placeholder="' + t('admin.pwdLabel') + '" autocomplete="current-password"><button class="btn btn-primary" id="btnGate">' + t('admin.enterBtn') + '</button></div>'
        + '<div class="gate-msg alert-strip" id="gateMsg"></div>'
        + '<div class="gate-foot"><a href="' + esc(href('/')) + '">' + t('admin.backHome') + '</a></div>'
        + '<p class="gate-hint">' + t('admin.hint') + '</p>'
        + '</div>';
    }
    html += '</main>' + renderFooter();
    app().innerHTML = html;
    var btnSetup = document.querySelector('#btnSetup');
    if (btnSetup) btnSetup.addEventListener('click', async function () {
      var inp = document.querySelector('#setupPwd');
      var msg = document.querySelector('#gateMsg');
      if (!inp) return;
      if (await setupAdmin(inp.value)) { route(); }
      else if (msg) msg.textContent = t('admin.pwdTooShort');
    });
    var btnGate = document.querySelector('#btnGate');
    if (btnGate) btnGate.addEventListener('click', async function () {
      var inp = document.querySelector('#gatePwd');
      var msg = document.querySelector('#gateMsg');
      if (!inp || !inp.value) { if (msg) msg.textContent = t('admin.pwdRequired'); return; }
      if (_cloudOn()) {
        // 加载态：防重复提交，spinner 反馈
        var orig = btnGate.innerHTML;
        btnGate.disabled = true;
        btnGate.innerHTML = svgIcon('spinner', 14) + ' ' + t('admin.logging');
        cloudLogin(inp.value).then(function (r) {
          btnGate.disabled = false;
          btnGate.innerHTML = orig;
          if (r.ok) {
            if (r.mustChange) {
              // 首次部署自动初始化：弹出清晰的默认密码提示框，供查看/复制后改密（不再一闪而过）
              window.showFirstLoginPwd(r.defaultPassword || '');
            } else {
              route();
            }
          }
          else {
            if (msg) msg.textContent = r.message || t('admin.wrongPwd');
            try { inp.focus(); inp.select(); } catch (e2) {}
          }
        });
      } else if (await tryAdmin(inp.value)) { route(); }
      else if (msg) msg.textContent = t('admin.wrongPwd');
    });
    // 回车即提交 + 自动聚焦密码框
    [['#setupPwd', '#btnSetup'], ['#gatePwd', '#btnGate'], ['#setupPwd2', '#btnCloudSetupGo'], ['#setupKey', '#btnCloudSetupGo']].forEach(function (pair) {
      var inp = document.querySelector(pair[0]);
      var btn = document.querySelector(pair[1]);
      if (inp && btn) {
        inp.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); btn.click(); }
        });
        try { inp.focus(); } catch (e) {}
      }
    });
    // 云端首次部署：登录 ↔ 安装密钥初始化 切换
    var cloudSetupBtn = document.querySelector('#btnCloudSetup');
    var cloudSetupForm = document.querySelector('#gateSetupForm');
    var cloudSetupBack = document.querySelector('#btnCloudSetupBack');
    var gateMsg = document.querySelector('#gateMsg');
    function cloudToggleSetup(show) {
      if (!cloudSetupForm) return;
      cloudSetupForm.style.display = show ? 'block' : 'none';
      var loginForm = cloudSetupForm.parentNode && cloudSetupForm.parentNode.querySelector('#gatePwd');
      if (show) {
        if (cloudSetupBtn) cloudSetupBtn.style.display = 'none';
        var k = document.querySelector('#setupKey');
        if (k) { try { k.focus(); } catch (e) {} }
      } else {
        if (cloudSetupBtn) cloudSetupBtn.style.display = '';
        if (loginForm) { try { loginForm.focus(); } catch (e) {} }
      }
      if (gateMsg) gateMsg.textContent = '';
    }
    if (cloudSetupBtn) cloudSetupBtn.addEventListener('click', function () { cloudToggleSetup(true); });
    if (cloudSetupBack) cloudSetupBack.addEventListener('click', function () { cloudToggleSetup(false); });
    var cloudSetupGo = document.querySelector('#btnCloudSetupGo');
    if (cloudSetupGo) cloudSetupGo.addEventListener('click', async function () {
      var k = document.querySelector('#setupKey');
      var p = document.querySelector('#setupPwd2');
      var m = document.querySelector('#gateMsg');
      var pwd = p ? p.value : '';
      var key = k ? k.value : '';
      if (!pwd) { if (m) m.textContent = t('admin.pwdRequired'); return; }
      if (!key) { if (m) m.textContent = t('admin.pwdRequired'); return; }  // 复用：提示必填
      var orig = cloudSetupGo.innerHTML;
      cloudSetupGo.disabled = true;
      cloudSetupGo.innerHTML = svgIcon('spinner', 14) + ' ' + t('admin.logging');
      var r = await cloudSetupAdmin(pwd, key);
      cloudSetupGo.disabled = false;
      cloudSetupGo.innerHTML = orig;
      if (r && r.ok) { route(); }
      else if (m) m.textContent = (r && r.message) || t('admin.wrongPwd');
    });
    return;
  }
  var _editId = currentEditId();
  var _editPost = _editId ? getStaticPosts().find(function (p) { return p.id === _editId; }) : null;
  // 顶栏：页面标题 + 模式徽章 + 编辑状态，层次一目了然
  // 复用 renderEditorBody（与 /admin 后台编辑器同源，避免两份模板漂移）
  html += renderEditorBody();
  html += '</main>' + renderFooter();
  app().innerHTML = html;

  var editId = currentEditId();
  if (editId) {
    var post = getStaticPosts().find(function (p) { return p.id === editId; });
    if (post) {
      var title = document.querySelector('#titleInput'); if (title) title.value = post.title || '';
      var date = document.querySelector('#dateInput'); if (date) date.value = toDateTimeLocal(post.date || '');
      var tags = document.querySelector('#tagInput'); if (tags) tags.value = (post.tags || []).join(', ');
      var excerpt = document.querySelector('#excerptInput'); if (excerpt) excerpt.value = post.excerpt || '';
      var cover = document.querySelector('#coverInput'); if (cover) cover.value = post.cover || '';
      var pin = document.querySelector('#pinnedInput'); if (pin) pin.checked = !!post.pinned;
      var md = document.querySelector('#mdInput');
      if (md) {
        if (_cloudOn()) {
          // 云端模式：始终以云端最新正文为准（本地静态旧正文不算数），先占位再由 loadEditContent 拉取覆盖
          md.value = '';
          md.placeholder = t('editor.loadingCloud');
        } else {
          md.value = post.content || '';
        }
      }
      var st = document.querySelector('#saveStatus'); if (st) st.textContent = t('editor.editingStatus') + (post.title || '');
      // also update page title for tests
      var hTitle = document.querySelector('#writeTitleHint'); if (hTitle) hTitle.textContent = t('editor.editingStatus') + (post.title || '');
      // 云端正文拉取由 loadEditContent 内部触发预览；本地内容由下方统一 updatePreview() 渲染
      loadEditContent(post, editId);
    }
  }
  // else：新建文章 —— 保持干净的空白页，不自动恢复历史草稿/上次发布内容
  updatePreview();
  bindWriteEvents();
}
function toolbarHtml() {
  var html = ['bold', 'italic', 'code', 'h2', 'link', 'img', 'quote', 'ul', 'ol', 'fence'].map(function (cmd) {
    var icons = { bold: 'B', italic: 'I', code: '<>', h2: 'H2', link: svgIcon('link', 13), img: svgIcon('image', 13), quote: svgIcon('quote', 13), ul: '•', ol: '1.', fence: '```' };
    return '<button type="button" class="tb-btn" data-cmd="' + cmd + '" title="' + cmd + '">' + (icons[cmd] || cmd) + '</button>';
  }).join('');
  return html + '<button type="button" class="tb-btn" id="tbSmoji" title="' + t('admin.editor.emoji') + '" aria-label="' + t('admin.editor.emoji') + '">😊</button>';
}

/** 当前编辑的文章别名：来自路由 /posts/<别名>/edit 或 ?edit= */
function currentEditId() {
  var r = currentRoute();
  if (r.path.indexOf('/posts/') === 0) {
    var seg = r.path.slice('/posts/'.length).split('/');
    if (seg[1] === 'edit' && seg[0]) {
      try { return decodeURIComponent(seg[0]); } catch (e) { return seg[0]; }
    }
  }
  var q = r.query;
  return (q && q.edit) || '';
}

function autoGrowMd() {
  var md = document.querySelector('#mdInput');
  if (!md) return;
  try {
    md.style.height = 'auto';
    var max = Math.max(window.innerHeight ? Math.floor(window.innerHeight * 0.7) : 600, 360);
    md.style.height = Math.min(md.scrollHeight, max) + 'px';
  } catch (e) {}
}

function updatePreview() {
  var md = document.querySelector('#mdInput');
  var pv = document.querySelector('#previewPane');
  if (!md || !pv) return;
  pv.innerHTML = renderMarkdown(md.value || '');
  var wc = document.querySelector('#wordCount');
  if (wc) wc.textContent = stripMd(md.value || '').length + ' ' + t('editor.wordUnit');
  autoGrowMd();
}

/** 云端模式编辑：/api/posts 列表只返回摘要（无 content），编辑时须按 id 拉取云端全文。
 *  云端是权威数据源：即使本地静态 posts.js 有旧正文，也一律用云端最新内容覆盖（拉取失败才保留本地）。 */
function loadEditContent(post, editId) {
  if (!post || !_cloudOn()) return;
  var st = document.querySelector('#saveStatus');
  if (st) st.textContent = t('editor.loadingCloud');
  apiFetch('api/posts/' + encodeURIComponent(editId))
    .then(function (data) {
      var full = (data && data.post) || null;
      if (full) {
        if (full.content !== undefined) post.content = full.content;
      }
      var md = document.querySelector('#mdInput');
      if (md) { md.value = post.content || ''; md.placeholder = ''; }
      updatePreview();
      if (st) st.textContent = t('editor.editingStatus') + (post.title || '');
    })
    .catch(function () {
      // 拉取失败：回退到本地静态内容（如有），避免编辑器空白
      var md = document.querySelector('#mdInput');
      if (md && !md.value) { md.value = post.content || ''; md.placeholder = ''; }
      updatePreview();
      if (st) st.textContent = t('editor.loadFailLocal');
    });
}

function bindWriteEvents() {
  var md = document.querySelector('#mdInput');
  if (md) md.addEventListener('input', function () {
    updatePreview();
    autoGrowMd();
    var st = document.querySelector('#saveStatus');
    if (st) st.textContent = t('editor.unsaved');
  });

  // “用官方编辑器”辅助按钮：新标签打开 markdown.com.cn 编辑器（跨域无法内嵌同步）
  var btnMd = document.querySelector('#btnOpenMdEditor');
  if (btnMd) btnMd.addEventListener('click', function () {
    try {
      var mdInput = document.querySelector('#mdInput');
      var u = 'https://markdown.com.cn/editor/';
      var q = encodeURIComponent((mdInput && mdInput.value) || '');
      if (q) u += '?md=' + q;
      window.open(u, '_blank');
    } catch (e) {}
  });

  var tbSmoji = document.querySelector('#tbSmoji');
  var tbSmojiArea = document.querySelector('#mdInput');
  if (tbSmoji && tbSmojiArea && window.initSmojiPicker) window.initSmojiPicker(tbSmoji, tbSmojiArea);

  document.querySelectorAll('#toolbar [data-cmd]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cmd = btn.getAttribute('data-cmd');
      var ta = document.querySelector('#mdInput');
      if (!ta) return;
      var selStart = ta.selectionStart || 0;
      var selEnd = ta.selectionEnd || 0;
      var val = ta.value;
      var selected = val.slice(selStart, selEnd) || t('editor.textBtn');
      var insert = '';
      var offset = 0;
      switch (cmd) {
        case 'bold': insert = '**' + selected + '**'; offset = 2; break;
        case 'italic': insert = '*' + selected + '*'; offset = 1; break;
        case 'code': insert = '`' + selected + '`'; offset = 1; break;
        case 'h2': insert = '## ' + selected; offset = 3; break;
        case 'link': insert = '[' + selected + '](https://)'; offset = selected.length + 1; break;
        case 'img': insert = '![' + selected + '](https://)'; offset = selected.length + 2; break;
        case 'quote': insert = '> ' + selected; offset = 2; break;
        case 'ul': insert = '- ' + selected; offset = 2; break;
        case 'ol': insert = '1. ' + selected; offset = 3; break;
        case 'fence': insert = '\n```\n' + selected + '\n```\n'; offset = 4; break;
        default: insert = selected;
      }
      var newVal = val.slice(0, selStart) + insert + val.slice(selEnd);
      ta.value = newVal;
      ta.focus();
      var pos = selStart + offset;
      ta.setSelectionRange(pos, pos + selected.length);
      updatePreview();
      var st = document.querySelector('#saveStatus');
      if (st) st.textContent = t('editor.unsaved');
    });
  });

  var btnSave = document.querySelector('#btnSave');
  if (btnSave) btnSave.addEventListener('click', function () { saveStaticArticle(); });

  var btnCloud = document.querySelector('#btnCloud');
  if (btnCloud) btnCloud.addEventListener('click', function () { cloudPublish(); });

  var btnExport = document.querySelector('#btnExport');
  if (btnExport) btnExport.addEventListener('click', function () {
    saveFileFriendly('posts.js', buildPostsJs(), t('export.exported') + ' posts.js', t('export.downloaded') + ' posts.js');
  });

  var btnRss = document.querySelector('#btnRss');
  if (btnRss) btnRss.addEventListener('click', function () {
    saveFileFriendly('feed.xml', buildFeedXmlClient(getPublishedPosts(), 20), t('export.exported') + ' feed.xml', t('export.downloaded') + ' feed.xml');
  });

  var btnSitemap = document.querySelector('#btnSitemap');
  if (btnSitemap) btnSitemap.addEventListener('click', function () {
    saveFileFriendly('sitemap.xml', buildSitemapClient(), t('export.exported') + ' sitemap.xml', t('export.downloaded') + ' sitemap.xml');
  });

  // 一键导出全部：posts.js + feed.xml + sitemap.xml 三件套一次导出（静态发布只需覆盖这三个文件）
  var btnExportAll = document.querySelector('#btnExportAll');
  if (btnExportAll) btnExportAll.addEventListener('click', function () {
    saveFileFriendly('posts.js', buildPostsJs(), t('export.exported') + ' posts.js', t('export.downloaded') + ' posts.js');
    saveFileFriendly('feed.xml', buildFeedXmlClient(getPublishedPosts(), 20), t('export.exported') + ' feed.xml', t('export.downloaded') + ' feed.xml');
    saveFileFriendly('sitemap.xml', buildSitemapClient(), t('export.exported') + ' sitemap.xml', t('export.downloaded') + ' sitemap.xml');
  });

  // 退出登录：清除本地会话（云端同时撤销服务端 token），回到登录门
  var btnLogout = document.querySelector('#btnLogout');
  if (btnLogout) btnLogout.addEventListener('click', async function () {
    await adminLogout();
    route();
  });

  var btnClearData = document.querySelector('#btnClearData');
  if (btnClearData) btnClearData.addEventListener('click', function () {
    if (!confirm(t('editor.clearConfirm'))) return;
    // 仅清空编辑器表单，保留登录态和所有存储数据
    var title = document.querySelector('#titleInput');
    var date = document.querySelector('#dateInput');
    var tags = document.querySelector('#tagInput');
    var excerpt = document.querySelector('#excerptInput');
    var md = document.querySelector('#mdInput');
    var preview = document.querySelector('#previewPane');
    var wordCount = document.querySelector('#wordCount');
    var hint = document.querySelector('#writeTitleHint');
    if (title) title.value = '';
    if (date) date.value = '';
    if (tags) tags.value = '';
    if (excerpt) excerpt.value = '';
    if (md) { md.value = ''; md.dispatchEvent(new Event('input')); }
    if (preview) preview.innerHTML = '';
    if (wordCount) wordCount.textContent = '0 ' + t('editor.wordUnit');
    if (hint) hint.textContent = t('editor.newPost');
    // 清除当前编辑 id（如有），重置为新文章状态
    localStorage.removeItem('qingyu.edit.id');
  });

  var btnToday = document.querySelector('#btnToday');
  if (btnToday) {
    btnToday.addEventListener('click', function () {
      var input = document.querySelector('#dateInput');
      if (!input) return;
      var now = new Date();
      var year = now.getFullYear();
      var month = String(now.getMonth() + 1).padStart(2, '0');
      var day = String(now.getDate()).padStart(2, '0');
      var hours = String(now.getHours()).padStart(2, '0');
      var minutes = String(now.getMinutes()).padStart(2, '0');
      input.value = year + '-' + month + '-' + day + 'T' + hours + ':' + minutes;
      // 同步触发预览更新（如果有）
      if (typeof previewContent === 'function') previewContent();
    });
  }

  var btnDraft = document.querySelector('#btnSaveDraft');
  if (btnDraft) btnDraft.addEventListener('click', function () { saveDraft(); });

  var btnImport = document.querySelector('#btnImport');
  var fileInput = document.querySelector('#mdFileInput');
  if (btnImport && fileInput) {
    btnImport.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (e) {
        var parsed = parseMdFile(String(e.target.result || ''), file.name);
        var title = document.querySelector('#titleInput'); if (title) title.value = parsed.title;
        var date = document.querySelector('#dateInput'); if (date) date.value = parsed.date;
        var tags = document.querySelector('#tagInput'); if (tags) tags.value = parsed.tags.join(', ');
        var excerpt = document.querySelector('#excerptInput'); if (excerpt) excerpt.value = parsed.excerpt || '';
        var md2 = document.querySelector('#mdInput'); if (md2) md2.value = parsed.content;
        updatePreview();
      };
      reader.readAsText(file);
    });
  }

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDraft(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); saveStaticArticle(); }
  });
}

/* ---------- 管理后台：侧边栏 + 文章列表 ---------- */
function renderAdmin() {
  var html = renderNav(currentRoute().path);
  html += '<main class="container page-fade write-page">';
  
  if (!adminOk()) {
    // 未登录：复用 renderWrite 的登录逻辑
    renderWrite();
    return;
  }
  
  var route = adminRoute();
  var sidebar = renderAdminSidebar(route);
  html += '<div class="admin-layout">' + sidebar + '<div class="admin-content">';
  
  if (route === 'posts') {
    html += renderPostList();
  } else {
    html += renderEditorBody();
  }
  
  html += '</div></div>';
  html += '</main>' + renderFooter();
  app().innerHTML = html;

  // 侧边栏退出按钮（唯一后台独有；其余编辑器按钮与快捷键统一由下方 bindWriteEvents() 绑定，
  // 避免与 renderWrite 重复 ~100 行绑定逻辑，也杜绝同一按钮被绑定两次导致点击触发双次）
  var btnLogoutSidebar = document.querySelector('#btnLogoutSidebar');
  if (btnLogoutSidebar) btnLogoutSidebar.addEventListener('click', async function () {
    await adminLogout();
    route();
  });

  // 文章列表操作按钮（事件委托）：置顶、删除
  var content = document.querySelector('.admin-content');
  if (content) {
    content.addEventListener('click', function (e) {
      var pinBtn = e.target.closest('[data-pin-id]');
      if (pinBtn) { togglePinFromList(pinBtn.dataset.pinId); return; }
      var btn = e.target.closest('.btn-danger[data-post-id]');
      if (!btn) return;
      var id = btn.dataset.postId;
      var title = btn.dataset.postTitle || t('admin.postList.noTitle');
      if (!confirm(t('admin.postList.deleteConfirm', { title: title }))) return;
      if (_cloudOn()) {
        // 删除走 /api/posts/:id 的 DELETE（携带会话 token；旧代码误用 /api/admin/posts/:id 返回 404）
        apiFetch('api/posts/' + encodeURIComponent(id), { method: 'DELETE', body: '{}' }).then(function (res) {
          if (res && res.ok) {
            // 同步移除本地列表项，删除后列表立即生效（无需刷新）
            clearPostCache(id);   // 已删除：清除详情缓存
            var arr = window.BLOG_POSTS;
            if (Array.isArray(arr)) {
              window.BLOG_POSTS = arr.filter(function (p) { return p && p.id !== id; });
            }
            alert(t('admin.postList.deletedOk'));
            route();
          } else {
            alert(t('admin.postList.deleteFailRetry'));
          }
        }).catch(function () {
          alert(t('admin.postList.deleteFailNetwork'));
        });
      } else {
        var posts = getStaticPosts();
        var idx = posts.findIndex(function (p) { return p.id === id; });
        if (idx >= 0) {
          posts.splice(idx, 1);
          clearPostCache(id);   // 已删除：清除详情缓存
          var blob = new Blob(['window.BLOG_POSTS=' + JSON.stringify(posts, null, 2) + ';'], { type: 'application/javascript' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'posts.js';
          a.click();
          // 延迟释放 URL：立即 revoke 会让部分浏览器（尤其 file://）取消下载，导致「删了却导出不了」
          setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 3000);
          alert(t('admin.postList.deleteSuccessLocal'));
          route();
        } else {
          alert(t('toast.notFound'));
        }
      }
    });
  }

  // 加载编辑数据（/admin/posts/:id/edit 路由下 currentEditId() 解析不到，需用 getEditIdFromRoute 兜底）
  var editId = currentEditId() || getEditIdFromRoute();
  if (editId) {
    var post = getStaticPosts().find(function (p) { return p.id === editId; });
    if (post) {
      var title = document.querySelector('#titleInput'); if (title) title.value = post.title || '';
      var date = document.querySelector('#dateInput'); if (date) date.value = toDateTimeLocal(post.date || '');
      var tags = document.querySelector('#tagInput'); if (tags) tags.value = (post.tags || []).join(', ');
      var excerpt = document.querySelector('#excerptInput'); if (excerpt) excerpt.value = post.excerpt || '';
      var cover = document.querySelector('#coverInput'); if (cover) cover.value = post.cover || '';
      var pin = document.querySelector('#pinnedInput'); if (pin) pin.checked = !!post.pinned;
      var md = document.querySelector('#mdInput');
      if (md) {
        if (_cloudOn()) {
          // 云端模式：始终以云端最新正文为准，先占位再由 loadEditContent 拉取覆盖
          md.value = '';
          md.placeholder = t('editor.loadingCloud');
        } else {
          md.value = post.content || '';
        }
      }
      var st = document.querySelector('#saveStatus'); if (st) st.textContent = t('editor.editingStatus') + (post.title || '');
      var hTitle = document.querySelector('#writeTitleHint'); if (hTitle) hTitle.textContent = t('editor.editingStatus') + (post.title || '');
      updatePreview();
      loadEditContent(post, editId);
    }
  }
  // else：新建文章 —— 保持干净的空白页，不自动恢复历史草稿/上次发布内容
  // 绑定编辑器交互：正文实时预览、工具栏插入语法、官方编辑器按钮
  // （renderWrite 在内部调用，这里必须补上，否则后台编辑器无响应）
  bindWriteEvents();
}

/** 把库内日期（YYYY-MM-DD 或 YYYY-MM-DD HH:mm）转为 datetime-local 值（YYYY-MM-DDTHH:mm） */
function toDateTimeLocal(v) {
  var s = String(v || '').trim();
  var m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) return m[1] + 'T' + (m[2] ? (m[2].length === 1 ? '0' + m[2] : m[2]) + ':' + m[3] : '00:00');
  return s;
}

function collectEditor() {
  var title = document.querySelector('#titleInput'); if (!title) return null;
  var date = document.querySelector('#dateInput');
  var tags = document.querySelector('#tagInput');
  var excerpt = document.querySelector('#excerptInput');
  var cover = document.querySelector('#coverInput');
  var pin = document.querySelector('#pinnedInput');
  var md = document.querySelector('#mdInput');
  // 日期：datetime-local 值形如 "2025-01-01T08:30"；存库统一 "YYYY-MM-DD HH:mm"
  var dv = String((date && date.value) || '').replace('T', ' ');
  if (!dv) {
    // 未填写时用本地时间（toISOString 是 UTC，东八区凌晨会错到前一天）
    var now = new Date();
    var pad2 = function (n) { return String(n).padStart(2, '0'); };
    dv = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + ' '
      + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  }
  return {
    title: title.value || t('admin.postList.noTitle'),
    date: dv,
    tags: String((tags && tags.value) || '').split(/[,，]/).map(function (t) { return t.trim(); }).filter(Boolean),
    excerpt: (excerpt && excerpt.value) || '',
    cover: String((cover && cover.value) || '').trim(),
    pinned: !!(pin && pin.checked),
    content: md ? md.value : ''
  };
}




function saveDraft() {
  var d = collectEditor();
  if (!d) return;
  var editId = currentEditId();
  var id = editId || (d.title ? slugify(d.title) : 'draft');
  saveDraftToStore(id, d);
  var st = document.querySelector('#saveStatus');
  if (st) st.textContent = t('editor.savedDraft');
}

function saveStaticArticle() {
  var d = collectEditor();
  if (!d) return;
  var editId = currentEditId();
  var id = editId || (d.title ? slugify(d.title) : 'draft');
  d.id = id;
  saveDraftToStore('__new', d);
  var st2 = document.querySelector('#saveStatus');
  if (st2) st2.textContent = t('editor.savedLocal');
}

/** 云端发布（新建 POST / 编辑 PUT），成功后同步本地列表（首页无需刷新即可见）。
 *  /write、/posts/:id/edit、/admin、/admin/posts/:id/edit 共用。 */
async function cloudPublish() {
  var d = collectEditor();
  if (!d) return;
  // /admin/posts/:id/edit 下 currentEditId() 解析不到，需 getEditIdFromRoute 兜底，否则误用 POST 报 409
  var editId = currentEditId() || getEditIdFromRoute();
  var id = editId || (d.title ? slugify(d.title) : 'draft');
  d.id = id;
  var st = document.querySelector('#saveStatus');
  if (st) st.textContent = t('editor.publishing');
  try {
    // 新建用 POST，编辑用 PUT（幂等）
    var method = editId ? 'PUT' : 'POST';
    await apiFetch('api/posts' + (editId ? '/' + encodeURIComponent(editId) : ''), {
      method: method,
      body: JSON.stringify(d)
    });
    // 发布成功后回填文章并同步本地列表（首页立即可见）
    clearPostCache(d.id);   // 内容已更新：清掉旧缓存，下次进入直接拉新
    saveDraftToStore('__new', d);
    var arr = (Array.isArray(window.BLOG_POSTS) ? window.BLOG_POSTS : []).slice();
    var idx = arr.findIndex(function (p) { return p && p.id === d.id; });
    if (idx >= 0) arr[idx] = d; else arr.push(d);
    window.BLOG_POSTS = arr;
    if (st) st.innerHTML = svgIcon('check', 14) + ' ' + t('editor.publishedCloud');
  } catch (e) {
    var em = (e && e.message) || t('editor.unknownError');
    // 会话过期/无效：清掉本地旧 token，跳回登录页重新拿新令牌
    if (/401/.test(em)) {
      _setSessionToken('');
      _setAdminSession(false);
      if (st) st.textContent = t('editor.loginExpired');
      setTimeout(function () { route(); }, 900);
      return;
    }
    if (st) st.textContent = t('editor.saveFail') + '：' + em;
  }
}

/* 注：云端 feed.xml / sitemap.xml 由 /api/feed.xml、/api/sitemap.xml 实时从 D1 生成，
 * 前端不再需要回传产物到 site_files（原 syncSiteFilesToCloud 已移除，避免无用的 D1 写入）。 */

function buildSitemapClient() {
  var cfg = getConfig();
  var base = cfg.siteUrl || (typeof location !== 'undefined' ? location.origin : '');
  base = String(base || '').replace(/\/+$/, '');
  var posts = sortPagePosts(getPublishedPosts());
  var lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  lines.push('  <url><loc>' + esc(base + '/') + '</loc></url>');
  lines.push('  <url><loc>' + esc(base + '/about') + '</loc></url>');
  lines.push('  <url><loc>' + esc(base + '/archive') + '</loc></url>');
  lines.push('  <url><loc>' + esc(base + '/guestbook') + '</loc></url>');
  posts.forEach(function (p) {
    lines.push('  <url><loc>' + esc(base + postUrl(p.id)) + '</loc><lastmod>' + esc(p.date || '') + '</lastmod></url>');
  });
  lines.push('</urlset>', '');
  return lines.join('\n');
}

/* ---------- 路由 ----------
 * 干净路径路由（history 模式，无 hash）：
 *   /                首页
 *   /archive         归档
 *   /about           关于
 *   /tags            标签
 *   /admin / /write  写作后台
 *   /posts/<别名>/    文章详情（带尾斜杠）
 *   /posts/<别名>/edit  编辑该文章（写作后台）
 * 本地 file:// 打开时退化为 hash 模式（#/…），双击 index.html 仍可用。
 */
function appRoot() {
  // 历史（干净路径）模式一律部署在站点根，返回 ''。
  // 若确实要挂在子路径（如 /blog ），请在此返回 '/blog' 并确保服务器相应回退。
  return '';
}
function useHashMode() {
  // 本地 file:// 直开 index.html 时走 hash 路由（无服务器回退干净路径）
  return typeof location !== 'undefined' && location.protocol === 'file:';
}
/** 解析当前路由：history 模式读 pathname+search，hash 模式读 location.hash */
function currentRoute() {
  var raw = '';
  if (useHashMode()) {
    var h = String(location.hash || '#/').replace(/^#/, '');
    raw = h || '/';
  } else {
    raw = ((location.pathname || '/') + (location.search || '')).slice((appRoot() || '').length) || '/';
  }
  var parts = String(raw).split('?');
  var path = parts[0] || '/';
  if (path.length > 1 && path.charAt(path.length - 1) === '/') path = path.slice(0, -1); // 去尾斜杠
  if (!path) path = '/';
  var query = {};
  if (parts[1]) {
    parts[1].split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) { try { query[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) {} }
    });
  }
  return { path: path, query: query };
}
/** 生成可放入 <a href> 的站内地址 */
function href(path, query) {
  var q = '';
  if (query) {
    var kv = Object.keys(query).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); });
    if (kv.length) q = '?' + kv.join('&');
  }
  if (useHashMode()) return '#/' + String(path).replace(/^\//, '') + q;
  return appRoot() + String(path) + q;
}
/** 文章地址：统一 /posts/<别名>/ 形式（带尾斜杠） */
function postUrl(id) {
  return '/posts/' + encodeURIComponent(id) + '/';
}
/** 跳转：history 模式用 pushState，hash 模式用 hash 赋值 */
function navigate(path, query) {
  // 去掉任何残留的 ?查询 / #片段，避免路径出现双重 ?（如 #/?page=2?）
  path = String(path || '/').replace(/[?#].*$/, '');
  if (useHashMode()) {
    location.hash = '#/' + path.replace(/^\//, '') + (query ? serializeQuery(query) : '');
  } else {
    try {
      history.pushState({}, '', appRoot() + path + (query ? serializeQuery(query) : ''));
    } catch (e) {}
  }
  route();
}
function serializeQuery(query) {
  var kv = Object.keys(query || {}).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); });
  return kv.length ? '?' + kv.join('&') : '';
}

var _i18nReady = false;
async function route() {
  _searchOpen = false;   // 进入新页面时收起顶部搜索
  _featuredCache = null; // 清除精选缓存，确保每页重新计算
  destroySmojiPicker(); // 清理 Smoji 表情选择器
  // 重置 body overflow，防止侧边栏打开时切换语言导致页面无法滚动
  document.body.style.overflow = '';
  // 首次路由时加载语言文件（同步读 localStorage，异步加载 JSON）
  if (!_i18nReady && window.__i18n && window.__i18n.loadLocale) {
    await window.__i18n.loadLocale(window.__i18n.getLocale());
    _i18nReady = true;
  }
  var r = currentRoute();
  var path = r.path;
  var q = r.query;

  if (path === '/') { app().innerHTML = renderHome(); fitCardLineClamps(); }
  else if (path.indexOf('/posts/') === 0) {
    // /posts/<别名>/  或  /posts/<别名>/edit
    var rest = path.slice('/posts/'.length); // 已去尾斜杠
    var seg = rest.split('/');
    var id = '';
    var editing = false;
    if (seg[0] === 'edit') { id = ''; editing = true; }
    else if (seg.length >= 1) {
      try { id = decodeURIComponent(seg[0] || ''); } catch (e) { id = seg[0] || ''; }
      editing = seg[1] === 'edit';
    }
    if (editing) {
      // 编辑文章：交给新版后台管理 UI（存在时）；否则回退旧编辑器
      await ensureAdminBundle();
      if (window.QingyuAdmin && window.QingyuAdmin.mount) {
        window.QingyuAdmin.mount(app(), id ? '/posts/' + encodeURIComponent(id) + '/edit' : '/admin/posts/new');
      } else {
        renderWrite(id);
      }
    } else {
      await renderPost(id);
    }
  }
  else if (path === '/write' || path === '/admin' || path.indexOf('/admin/') === 0) {
    // 后台管理 UI：交给新版模块（存在时）；否则回退旧 admin 渲染，保证逻辑不变
    await ensureAdminBundle();
    if (window.QingyuAdmin && window.QingyuAdmin.mount) {
      window.QingyuAdmin.mount(app(), path);
    } else {
      renderAdmin();
    }
  }
  else if (path === '/archive') { app().innerHTML = renderArchive(); }
  else if (path === '/about') { app().innerHTML = renderAbout(); }
  else if (path === '/tags') { app().innerHTML = renderTags(); }
  else if (path === '/guestbook') { app().innerHTML = renderGuestbook(); bindGuestbook(); }
  else {
    app().innerHTML = renderNav(path) + '<main class="container page-fade"><div class="empty"><div class="big">' + svgIcon('question', 36) + '</div><p>' + t('post.notFound') + '</p><p><a href="' + esc(href('/')) + '">' + t('post.backHome') + '</a></p></div></main>' + renderFooter();
  }
  updateSEO(path);
  bindGlobal();
  /* 播放器等全站组件监听路由变化（如后台页隐藏播放器） */
  try { window.dispatchEvent(new CustomEvent('qy:route')); } catch (e) {}
}

/* ---------- SEO：动态更新 meta 标签 ---------- */
function updateSEO(path) {
  var cfg = getConfig();
  var base = cfg.siteUrl || location.origin || '';
  var n = getSiteName();   // 随「站点基础信息 → 站点名称」变化，实时驱动标题/品牌/页脚
  var siteDesc = (cfg.site && cfg.site.desc) || t('site.desc');  // 云端站点简介优先，回退 i18n 默认
  var pageTitle = n;
  var pageDesc = siteDesc;
  var pageUrl = base + (path === '/' ? '' : path);
  var pageImage = '';
  var pageType = 'website';

  if (path === '/') {
    pageTitle = n + ' · ' + t('site.subtitle');
  } else if (path === '/archive') {
    pageTitle = t('archive.title') + ' · ' + n;
    pageDesc = t('archive.title') + ' - ' + siteDesc;
  } else if (path === '/tags') {
    pageTitle = t('tags.title') + ' · ' + n;
    pageDesc = t('tags.title') + ' - ' + siteDesc;
  } else if (path === '/about') {
    pageTitle = t('about.title') + ' · ' + n;
    pageDesc = t('about.desc');
  } else if (path === '/guestbook') {
    pageTitle = t('guestbook.title') + ' · ' + n;
    pageDesc = t('guestbook.desc');
  } else if (path.indexOf('/posts/') === 0) {
    var id = '';
    try { id = decodeURIComponent(path.replace('/posts/', '').replace(/\/.*$/, '')); } catch (e) {}
    var posts = getStaticPosts();
    var post = posts.find(function (p) { return p.id === id; });
    if (post) {
      pageType = 'article';
      pageTitle = (post.title || t('post.untitled')) + ' · ' + n;
      pageDesc = post.excerpt || stripMd(post.content || '').slice(0, 200);
      if (post.cover) pageImage = post.cover;
      pageUrl = base + '/posts/' + encodeURIComponent(post.id) + '/';
    }
  } else if (path.indexOf('/admin') === 0 || path === '/write') {
    // 后台页面不索引
    document.title = '管理后台 · ' + n;
    _setMeta('robots', 'noindex, nofollow');
    // favicon 仍需更新（后台也可能设置站点头像）
    var _fv = cfg.site && cfg.site.avatar;
    if (_fv) { var _fl = document.querySelector('link[rel="icon"]'); if (_fl) _fl.setAttribute('href', _fv); }
    return;
  }

  document.title = pageTitle;
  _setMeta('description', pageDesc);
  _setMeta('author', getSiteAuthor());
  _setMeta('robots', 'index, follow, max-image-preview:large, max-snippet:-1');

  // Open Graph
  _setOG('og:type', pageType);
  _setOG('og:title', pageTitle);
  _setOG('og:description', pageDesc);
  _setOG('og:url', pageUrl);
  _setOG('og:site_name', n);
  if (pageImage) _setOG('og:image', pageImage);

  // Twitter Card
  _setMeta('twitter:card', pageImage ? 'summary_large_image' : 'summary');
  _setMeta('twitter:title', pageTitle);
  _setMeta('twitter:description', pageDesc);
  if (pageImage) _setMeta('twitter:image', pageImage);

  // Canonical
  var canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) canonical.setAttribute('href', pageUrl);

  // Favicon：云端「站点头像 / Logo URL」优先，回退 index.html 中的默认橙色圆
  var siteAvatar = cfg.site && cfg.site.avatar;
  if (siteAvatar) {
    var faviconLink = document.querySelector('link[rel="icon"]');
    if (faviconLink) faviconLink.setAttribute('href', siteAvatar);
  }

  // JSON-LD structured data
  if (pageType === 'article' && path.indexOf('/posts/') === 0) {
    var postId = '';
    try { postId = decodeURIComponent(path.replace('/posts/', '').replace(/\/.*$/, '')); } catch (e) {}
    var allPosts = getStaticPosts();
    var p = allPosts.find(function (x) { return x.id === postId; });
    if (p) {
      var jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        'headline': p.title || t('post.untitled'),
        'description': p.excerpt || '',
        'datePublished': p.date || '',
        'dateModified': p.date || '',
        'author': { '@type': 'Person', 'name': getSiteAuthor() },
        'publisher': { '@type': 'Organization', 'name': n },
        'mainEntityOfPage': pageUrl
      };
      if (p.cover) jsonLd.image = p.cover;
      if (p.tags) jsonLd.keywords = p.tags;
      _setJsonLd(jsonLd);
    }
  } else {
    _setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': n,
      'url': base + '/',
      'description': siteDesc
    });
  }
}

function _setMeta(name, content) {
  var el = document.querySelector('meta[name="' + name + '"]')
    || document.querySelector('meta[property="' + name + '"]');
  if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function _setOG(property, content) {
  var el = document.querySelector('meta[property="' + property + '"]');
  if (!el) { el = document.createElement('meta'); el.setAttribute('property', property); document.head.appendChild(el); }
  el.setAttribute('content', content);
}
function _setJsonLd(obj) {
  var old = document.querySelector('script[type="application/ld+json"]');
  if (old) old.remove();
  var s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(obj);
  document.head.appendChild(s);
}


/* ============================================================
 * AI 功能（渐进增强，零侵入降级）
 * · 后端 /api/ai/* 仅在 Cloudflare 绑定 Workers AI 时可用；
 *   前端探测失败 → 相关 slot 保持为空，不渲染任何 AI 元素。
 * · 任何 AI 请求失败只影响该元素自身，绝不阻塞博客核心功能。
 * ============================================================ */
var _aiOk = null;
var _aiProbing = false;
function aiProbe() {
  if (_aiOk !== null) return Promise.resolve(_aiOk === true);
  if (_aiProbing) {
    return new Promise(function (resolve) {
      var iv = setInterval(function () {
        if (_aiOk !== null) { clearInterval(iv); resolve(_aiOk === true); }
      }, 60);
    });
  }
  _aiProbing = true;
  // sessionStorage 短记忆：可用缓存 10 分钟；不可用只缓存 30 秒
  // （AI 上线/修复后，用户刷新页面即可恢复，不会被旧「不可用」状态卡住）
  var saved = null;
  try { saved = sessionStorage.getItem('qingyu.ai.ok'); } catch (e) {}
  if (saved) {
    var parts = String(saved).split('|');
    var ttl = parts[0] === '1' ? 600000 : 30000;
    if (parts[1] && (Date.now() - Number(parts[1])) < ttl) {
      _aiOk = parts[0] === '1';
      return Promise.resolve(_aiOk === true);
    }
  }
  return apiFetch('api/ai/ping')
    .then(function () { _aiOk = true; })
    .catch(function () { _aiOk = false; })
    .then(function () {
      try { sessionStorage.setItem('qingyu.ai.ok', (_aiOk ? '1' : '0') + '|' + Date.now()); } catch (e) {}
      return _aiOk === true;
    });
}
function aiLang() {
  var loc = (window.__i18n && window.__i18n.getLocale) ? window.__i18n.getLocale() : 'zh-CN';
  return /^(zh-CN|en|ja|ko|hi)$/.test(loc) ? loc : 'zh-CN';
}
function aiErrText(e) {
  var m = (e && e.message) || '';
  return /^HTTP \d{3}$/.test(m) ? t('ai.fail') : (m || t('ai.fail'));
}
/* —— 渲染时的占位 slot（探测失败保持为空） —— */
function aiPostSlot(post) {
  if (!post || post.enc || Number(post.protected || 0) === 1) return '';
  return '<div class="ai-post-slot" id="aiSummarySlot" data-slug="' + esc(post.id) + '"></div>';
}
function aiAssistSlotHTML() {
  return '<div class="ai-assist-slot" id="aiAssistSlot"></div>';
}
function aiCommentsSlotHTML() {
  return '<div class="ai-comments-slot" id="aiCommentsSlot"></div>';
}
/* —— 探测完成后填充 slot —— */
function aiFillSlots() {
  aiProbe().then(function (ok) {
    var s = document.getElementById('aiSummarySlot');
    if (s) {
      var slug = s.getAttribute('data-slug') || '';
      if (ok && slug) {
        // 优先拉取已有缓存摘要：命中直接展示（刷新不丢），未命中显示生成按钮
        apiFetch('api/ai/summary?slug=' + encodeURIComponent(slug) + '&lang=' + encodeURIComponent(aiLang()), { method: 'GET' })
          .then(function (d) {
            var el = document.getElementById('aiSummarySlot');
            if (!el) return;
            if (d && d.summary) {
              el.innerHTML = aiSummaryCardHTML(d.summary, slug, !!d.cached || adminOk(), !!d.cached);
            } else {
              el.innerHTML = aiSummaryBtnHTML(slug);
            }
          })
          .catch(function () {
            var el = document.getElementById('aiSummarySlot');
            if (el) el.innerHTML = aiSummaryBtnHTML(slug);
          });
      } else {
        s.innerHTML = '';
      }
    }
    var as = document.getElementById('aiAssistSlot');
    if (as) as.innerHTML = ok ? aiAssistBarHTML() : '';
    var cs = document.getElementById('aiCommentsSlot');
    if (cs) cs.innerHTML = ok ? aiCommentsBarHTML() : '';
    // 文章卡片摘要：有 AI 摘要（已生成缓存）→ 替换默认摘要在摘要位展示；无 → 保持默认兜底
    if (ok) aiFillCardExcerpts();
  });
}
/** 卡片摘要 AI 化：遍历带 data-ai-excerpt 的摘要元素，异步拉取该文 AI 摘要并替换；
 *  没有缓存摘要 / AI 未启用 / 拉取失败 → 保持默认摘要兜底不动。 */
function aiFillCardExcerpts() {
  var els = document.querySelectorAll('.post-card .excerpt[data-ai-excerpt]');
  if (!els.length) return;
  Array.prototype.forEach.call(els, function (el) {
    var slug = el.getAttribute('data-ai-excerpt');
    if (!slug) return;
    apiFetch('api/ai/summary?slug=' + encodeURIComponent(slug) + '&lang=' + encodeURIComponent(aiLang()), { method: 'GET' })
      .then(function (d) {
        if (d && d.summary && el.isConnected) el.textContent = d.summary;
      })
      .catch(function () { /* 拉取失败：保留默认摘要 */ });
  });
}
function aiSummaryBtnHTML(slug) {
  return '<button type="button" class="btn btn-sm btn-ghost ai-btn" data-ai-action="summary" data-slug="' + esc(slug) + '">' + svgIcon('spark', 13) + ' ' + esc(t('ai.title')) + '</button>';
}
function aiSummaryCardHTML(summary, slug, isAdmin, cached) {
  return '<div class="ai-card">'
    + '<div class="ai-card-head">' + svgIcon('spark', 13) + ' ' + esc(t('ai.title')) + '<span class="ai-badge">' + esc(t(cached ? 'ai.cached' : 'ai.generated')) + '</span></div>'
    + '<div class="ai-card-body">' + esc(summary) + '</div>'
    + (isAdmin ? '<div class="ai-card-foot"><button type="button" class="btn btn-sm btn-ghost" data-ai-action="summary" data-slug="' + esc(slug) + '" data-force="1">' + svgIcon('pen', 12) + ' ' + esc(t('ai.regenerate')) + '</button></div>' : '')
    + '</div>';
}
function aiDoSummary(btn) {
  var slug = btn.getAttribute('data-slug') || '';
  var force = !!btn.getAttribute('data-force');
  var slot = document.getElementById('aiSummarySlot');
  var orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = svgIcon('spinner', 13) + ' ' + esc(t('site.loading'));
  apiFetch('api/ai/summary', { method: 'POST', body: JSON.stringify({ slug: slug, lang: aiLang(), force: force }) })
    .then(function (d) {
      if (slot) slot.innerHTML = aiSummaryCardHTML(d.summary || '', slug, adminOk());
    })
    .catch(function (e) {
      btn.disabled = false;
      btn.innerHTML = orig;
      if (slot) {
        var msg = document.createElement('div');
        msg.className = 'ai-fail';
        msg.textContent = aiErrText(e);
        slot.appendChild(msg);
        setTimeout(function () { if (msg.parentNode) msg.parentNode.removeChild(msg); }, 6000);
      }
    });
}
/* —— 后台写作助手 —— */
function aiAssistBarHTML() {
  var opts = ['zh-CN', 'en', 'ja', 'ko', 'hi'].map(function (c) {
    return '<option value="' + c + '"' + (c === aiLang() ? ' selected' : '') + '>' + c + '</option>';
  }).join('');
  return '<div class="ai-assist">'
    + '<span class="ai-assist-title">' + svgIcon('spark', 13) + ' ' + esc(t('ai.assist.title')) + '</span>'
    + '<select class="ai-assist-lang" id="aiAssistLang" aria-label="' + esc(t('ai.assist.targetLang')) + '">' + opts + '</select>'
    + '<button type="button" class="btn btn-sm" data-ai-action="title">' + esc(t('ai.assist.titles')) + '</button>'
    + '<button type="button" class="btn btn-sm" data-ai-action="polish">' + esc(t('ai.assist.polish')) + '</button>'
    + '<button type="button" class="btn btn-sm" data-ai-action="translate">' + esc(t('ai.assist.translate')) + '</button>'
    + '<span class="ai-assist-msg" id="aiAssistMsg"></span>'
    + '<div class="ai-assist-out" id="aiAssistOut"></div>'
    + '</div>';
}
function aiAssistMsg(text) {
  var el = document.getElementById('aiAssistMsg');
  if (el) el.textContent = text;
}
function aiDoAssist(action, btn) {
  var md = document.getElementById('mdInput');
  var text = md ? md.value : '';
  if (!text || !text.trim()) { aiAssistMsg(t('ai.assist.empty')); return; }
  var sel = document.getElementById('aiAssistLang');
  var lang = sel ? sel.value : aiLang();
  var orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = svgIcon('spinner', 13);
  apiFetch('api/ai/assist', { method: 'POST', body: JSON.stringify({ action: action, text: text, lang: lang }) })
    .then(function (d) {
      btn.disabled = false;
      btn.innerHTML = orig;
      aiAssistMsg('');
      var out = document.getElementById('aiAssistOut');
      if (out) out.innerHTML = aiAssistResultHTML(action, (d && d.result) || '');
    })
    .catch(function (e) {
      btn.disabled = false;
      btn.innerHTML = orig;
      aiAssistMsg(aiErrText(e));
    });
}
function aiAssistResultHTML(action, result) {
  var apply;
  if (action === 'title') apply = '<button type="button" class="btn btn-sm btn-primary" data-ai-use="title">' + esc(t('ai.assist.applyTitle')) + '</button>';
  else if (action === 'tags') apply = '<button type="button" class="btn btn-sm btn-primary" data-ai-use="tags">' + esc(t('ai.assist.applyTags')) + '</button>';
  else apply = '<button type="button" class="btn btn-sm btn-primary" data-ai-use="paste">' + esc(t('ai.assist.pasteEnd')) + '</button>';
  return '<div class="ai-result"><pre>' + esc(result) + '</pre><div class="ai-result-actions">'
    + apply
    + '<button type="button" class="btn btn-sm btn-ghost" data-ai-use="copy">' + svgIcon('copy', 12) + ' ' + esc(t('ai.assist.copy')) + '</button>'
    + '<button type="button" class="btn btn-sm btn-ghost" data-ai-use="hide">' + esc(t('ai.assist.hide')) + '</button>'
    + '</div></div>';
}
function aiApplyUse(use) {
  var out = document.getElementById('aiAssistOut');
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
    var ti = document.getElementById('titleInput');
    if (ti && first) { ti.value = first; out.innerHTML = ''; }
  } else if (use === 'tags') {
    var tg = document.getElementById('tagInput');
    if (tg) {
      tg.value = String(text).split(/[\n，,、]/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8).join(', ');
      out.innerHTML = '';
    }
  } else if (use === 'paste') {
    var md = document.getElementById('mdInput');
    if (md) {
      md.value = md.value ? md.value.replace(/\s*$/, '') + '\n\n' + text : text;
      md.dispatchEvent(new Event('input'));
      out.innerHTML = '';
    }
  }
}
/* —— 后台评论 AI —— */
function aiCommentsBarHTML() {
  return '<button type="button" class="btn btn-sm" data-ai-action="csummary">' + svgIcon('spark', 14) + ' ' + esc(t('ai.comments.summarize')) + '</button>';
}
function aiDoCommentSummary(btn) {
  var slot = document.getElementById('aiCommentsSlot');
  var orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = svgIcon('spinner', 13) + ' ' + esc(t('site.loading'));
  apiFetch('api/ai/comments', { method: 'POST', body: JSON.stringify({ action: 'summarize' }) })
    .then(function (d) {
      if (!slot) return;
      if (d && d.empty) { slot.innerHTML = '<div class="ai-fail info">' + esc(t('ai.comments.empty')) + '</div>'; return; }
      slot.innerHTML = aiCommentsPanelHTML((d && d.summary) || '', !!(d && d.cached));
    })
    .catch(function (e) {
      btn.disabled = false;
      btn.innerHTML = orig;
      if (slot) {
        var msg = document.createElement('div');
        msg.className = 'ai-fail';
        msg.textContent = aiErrText(e);
        slot.appendChild(msg);
        setTimeout(function () { if (msg.parentNode) msg.parentNode.removeChild(msg); }, 6000);
      }
    });
}
function aiCommentsPanelHTML(summary, cached) {
  return '<div class="ai-card">'
    + '<div class="ai-card-head">' + svgIcon('spark', 13) + ' ' + esc(t('ai.comments.summary')) + '<span class="ai-badge">' + esc(cached ? t('ai.cached') : t('ai.generated')) + '</span></div>'
    + '<div class="ai-card-body">' + esc(summary) + '</div>'
    + '<div class="ai-screen">'
    + '<textarea id="aiScreenText" rows="2" maxlength="1000" placeholder="' + esc(t('ai.comments.screenHint')) + '"></textarea>'
    + '<div class="ai-screen-row"><button type="button" class="btn btn-sm" data-ai-action="screen">' + esc(t('ai.comments.screen')) + '</button><span class="ai-screen-out" id="aiScreenOut"></span></div>'
    + '</div></div>';
}
function aiDoScreen() {
  var ta = document.getElementById('aiScreenText');
  var text = ta ? ta.value : '';
  if (!text.trim()) return;
  var out = document.getElementById('aiScreenOut');
  if (out) out.innerHTML = '<span class="ai-pending">' + esc(t('site.loading')) + '…</span>';
  apiFetch('api/ai/comments', { method: 'POST', body: JSON.stringify({ action: 'screen', text: text }) })
    .then(function (d) {
      if (out) {
        out.innerHTML = d && d.spam
          ? '<span class="ai-screen-spam">' + esc(t('ai.comments.spam')) + (d.reason ? '：' + esc(d.reason) : '') + '</span>'
          : '<span class="ai-screen-ok">' + esc(t('ai.comments.notSpam')) + (d && d.reason ? '：' + esc(d.reason) : '') + '</span>';
      }
    })
    .catch(function (e) { if (out) out.textContent = aiErrText(e); });
}
var _aiBound = false;
function bindAiEvents() {
  if (_aiBound) return;
  _aiBound = true;
  document.addEventListener('click', function (e) {
    var t = (e && e.target) || null;
    if (!t || !t.closest) return;
    var act = t.closest('[data-ai-action]');
    if (act) {
      var action = act.getAttribute('data-ai-action');
      if (action === 'summary') aiDoSummary(act);
      else if (action === 'title' || action === 'polish' || action === 'tags' || action === 'translate') aiDoAssist(action, act);
      else if (action === 'csummary') aiDoCommentSummary(act);
      else if (action === 'screen') aiDoScreen();
      return;
    }
    var use = t.closest('[data-ai-use]');
    if (use) { aiApplyUse(use.getAttribute('data-ai-use')); }
  });
}
function aiInit() {
  bindAiEvents();
  aiFillSlots();
}

function bindGlobal() {
  // 主题切换：顶栏
  var tb = document.querySelector('#themeToggle');
  if (tb) tb.addEventListener('click', function () { toggleTheme(); });
  bindAccentPicker();
  bindTocScroll();
  bindSearch();
  bindBackTop();
  populateLangSwitch();
  bindMobileSidebar();
  aiInit();
  bindFitCardLineClamps();   // 手机卡片摘要行数自适应：旋转/字体加载后重测
  // 广告占位符：有广告（静态内容或 AdSense 已填充）才显示，无广告保持隐藏
  initAdSlots(app());
}

/* ---------- 广告占位符显隐 ----------
 * .ad-slot 框（虚线占位）默认隐藏，避免 AdSense 未返回广告时在文章/列表里留下空虚线框：
 *  · 内容是静态 HTML（非广告联盟 ins）→ 直接显示
 *  · 内容是 <ins class="adsbygoogle"> → 轮询等待 AdSense 填充（ins 内出现 iframe/子节点）后显示；
 *    约 12s 仍未填充（无广告可展示）→ 保持隐藏
 * 每次路由渲染后（bindGlobal）调用；DOM 被替换时轮询自动终止（isConnected 检查）。 */
function initAdSlots(scope) {
  if (!scope || !scope.querySelectorAll) return;
  Array.prototype.forEach.call(scope.querySelectorAll('.ad-slot'), function (slot) {
    var ins = slot.querySelector('ins.adsbygoogle');
    if (!ins) { slot.classList.add('has-ad'); return; }  // 静态广告内容：直接显示
    ensureAdSenseScheduled(slot);
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var filled = !!(ins.querySelector('iframe') || (ins.children && ins.children.length > 0));
      if (filled) {
        clearInterval(timer);
        slot.classList.add('has-ad');
      } else if (!slot.isConnected || tries >= 24) {
        // DOM 已被替换，或 ~12s 未填充（无广告返回）→ 终止，保持隐藏
        clearInterval(timer);
      }
    }, 500);
  });
}

/* 主题色「颜色下拉」：桌面顶栏 + 手机侧栏统一形态。
 * 全部走 document 级事件委托：与顶栏/侧栏的渲染时序解耦——
 * 若首个进入的页面不含顶栏（后台等），之后回到前台时点击依然有效。 */
/* 主题色 & 语言（桌面弹层）+ 手机原生下拉的切换。
 * 全部走 document 级事件委托：与顶栏/侧栏的渲染时序解耦——
 * 若首个进入的页面不含顶栏（后台等），之后回到前台时点击依然有效。 */
function ensureBgAnimLoaded(cb) {
  if (window.bgAnim) { if (cb) cb(); return; }
  if (document.getElementById('bgAnimLazyLoader')) return;
  var s = document.createElement('script');
  s.id = 'bgAnimLazyLoader';
  s.src = appRoot() + 'bg-anim.min.js?v=' + BLOG_VERSION;
  s.async = true;
  s.onload = function () { if (cb) cb(); };
  s.onerror = function () { try { s.parentNode.removeChild(s); } catch (e) {} };
  document.head.appendChild(s);
}

var _accentBound = false;
function bindAccentPicker() {
  if (_accentBound) { renderAccentSwatches(); renderAccentNativeSelect(); renderLangPop(); return; }
  _accentBound = true;
  document.addEventListener('click', function (e) {
    var t = (e && e.target) || null;
    if (!t || !t.closest) return;
    if (t.closest('#accentToggle')) { toggleAccentPop(); return; }
    if (t.closest('#langToggle')) { toggleLangPop(); return; }
    if (t.closest('#bgAnimToggle')) { if (window.bgAnim) { window.bgAnim.toggle(); return; } ensureBgAnimLoaded(function () { if (window.bgAnim) window.bgAnim.toggle(); }); return; }
    var sw = t.closest('.accent-pop [data-accent]');
    if (sw) { setAccent(sw.getAttribute('data-accent')); closeAccentPop(); closeLangPop(); return; }
    var lo = t.closest('.lang-pop [data-lang]');
    if (lo) {
      closeLangPop();
      if (window.__i18n && window.__i18n.loadLocale) {
        window.__i18n.loadLocale(lo.getAttribute('data-lang')).then(function () { route(); });
      }
      return;
    }
    // 点击任意弹层外部：关闭
    var wrap = document.getElementById('accentWrap');
    if (wrap && wrap.contains && !wrap.contains(t)) closeAccentPop();
    var lwrap = document.getElementById('langWrap');
    if (lwrap && lwrap.contains && !lwrap.contains(t)) closeLangPop();
  });
  document.addEventListener('keydown', function (e) {
    if (!e || e.key !== 'Escape') return;
    closeAccentPop();
    closeLangPop();
  });
  // 背景动画开关状态变化：即时刷新顶栏按钮（无需整页重渲染）
  document.addEventListener('qingyu:bgAnim', function () {
    var on = !!(window.bgAnim && window.bgAnim.isOn());
    var b = document.getElementById('bgAnimToggle');
    if (b) {
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? t('bgAnim.on') : t('bgAnim.off');
      b.setAttribute('aria-label', t('bgAnim.title'));
    }
  });
  renderAccentSwatches();
  renderAccentNativeSelect();
  renderLangPop();
}

function bindMobileSidebar() {
  var overlay = document.querySelector('#sidebarOverlay');
  var sidebar = document.querySelector('#mobileSidebar');
  var hamburger = document.querySelector('#hamburgerBtn');
  var closeBtn = document.querySelector('#sidebarClose');
  if (!sidebar) return;
  function openSidebar() {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    if (hamburger) hamburger.classList.add('open');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
    if (hamburger) hamburger.classList.remove('open');
  }
  if (hamburger) hamburger.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);
  // 点击侧边栏链接后自动关闭
  sidebar.querySelectorAll('.sidebar-link').forEach(function (a) {
    a.addEventListener('click', closeSidebar);
  });
  // 侧边栏内的主题切换（独立 ID，与顶栏不冲突）
  var sideTheme = document.querySelector('#themeToggleSide');
  if (sideTheme) sideTheme.addEventListener('click', function () { toggleTheme(); });
  // 侧栏内语言切换
  var sideLang = sidebar.querySelector('.lang-switch');
  if (sideLang && !sideLang.dataset.bound) {
    sideLang.dataset.bound = '1';
    sideLang.addEventListener('change', function () {
      window.__i18n.loadLocale(sideLang.value).then(function () { route(); });
    });
  }
}

function populateLangSwitch() {
  var sels = document.querySelectorAll('.lang-switch:not(.accent-native)');
  if (!sels.length || !window.__i18n || typeof window.__i18n.getLanguages !== 'function') return;
  var langs = window.__i18n.getLanguages();
  var current = window.__i18n.getLocale ? window.__i18n.getLocale() : 'zh-CN';
  sels.forEach(function (sel) {
    sel.innerHTML = '';
    langs.forEach(function (lang) {
      var opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = compactLangFlag(lang) ? compactLangFlag(lang) + ' ' + lang.name : lang.name;
      if (lang.code === current) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

/* 返回顶部悬浮按钮：滚动超过一屏出现，点击平滑滚回当前页顶部（不跳转页面）
   缓存按钮元素 + rAF 合帧，减少滚动时的查询与强制布局 */
var _backTopScrollBound = false;
var _backTopEl = null;
var _backTopRafPending = false;
function bindBackTop() {
  if (!_backTopScrollBound && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    _backTopScrollBound = true;
    if (!_backTopEl) _backTopEl = document.querySelector('#backTop');
    window.addEventListener('scroll', function () {
      if (_backTopRafPending) return;
      _backTopRafPending = true;
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(function () { _backTopRafPending = false; updateBackTop(); });
      } else {
        _backTopRafPending = false;
        updateBackTop();
      }
    }, { passive: true });
  }
  if (!_backTopEl) _backTopEl = document.querySelector('#backTop');
  var bt = _backTopEl;
  if (bt && bt.addEventListener) bt.addEventListener('click', function () {
    if (typeof window.scrollTo === 'function') {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (e) { window.scrollTo(0, 0); }
    }
  });
  updateBackTop();
}
function updateBackTop() {
  var bt = _backTopEl || document.querySelector('#backTop');
  var y = (typeof window !== 'undefined' && typeof window.scrollY === 'number')
    ? window.scrollY
    : ((typeof window !== 'undefined' && typeof window.pageYOffset === 'number') ? window.pageYOffset : 0);
  // 顶栏滚动阴影：页面下滚后给 body 打 .scrolled（style.css 据此加强顶栏投影）。
  // 与回到顶部按钮共用同一个 rAF 节流的 scroll 处理器，不额外增加监听。
  try {
    var b = document.body;
    if (b && b.classList) {
      if (y > 8) b.classList.add('scrolled'); else b.classList.remove('scrolled');
    }
  } catch (e) { /* ignore */ }
  if (!bt || !bt.classList || !bt.classList.add) return;
  if (y > 300) bt.classList.add('show'); else bt.classList.remove('show');
}

/* 站内链接点击拦截：history 模式用 pushState，避免整页刷新 */
var _navClickBound = false;
function bindNavClicks() {
  if (_navClickBound) return;
  _navClickBound = true;
  if (typeof document === 'undefined') return;
  document.addEventListener('click', function (e) {
    try {
      var a = e.target;
      while (a && a.tagName !== 'A') a = a.parentNode;
      if (!a || !a.getAttribute) return;
      var hrefAttr = a.getAttribute('href') || '';
      if (!hrefAttr) return;
      // 外链 / 带 target / 静态资源（feed.xml 等）不拦截
      if (a.target || /^https?:|^\/\//i.test(hrefAttr)) return;
      if (/^(feed\.xml|sitemap\.xml|posts\.js|config\.js|app\.js|style\.css|favicon)/.test(hrefAttr)) return;
      // API 路径（/api/feed.xml、/api/sitemap.xml、/api/...）与带文件扩展名的路径
      // （/feed.xml、/robots.txt、图片等）不拦截：交给浏览器直接请求，SPA 路由不接管
      var hrefNoQuery = String(hrefAttr).split('?')[0];
      if (/^\/api\//.test(hrefNoQuery) || /\.[a-zA-Z0-9]{1,8}$/.test(hrefNoQuery)) return;
      // 纯 '#' 或站内锚点（#toc-1）不拦截，留给默认滚动
      if (hrefAttr.charAt(0) === '#' && hrefAttr.charAt(1) !== '/') return;
      e.preventDefault();
      var raw = hrefAttr;
      var qobj = {};
      var path = raw;
      if (raw.charAt(0) === '#') {            // hash 模式（file:// 直开）：#/posts/x → 去掉 '#'
        path = raw.slice(1);
      } else if (!useHashMode()) {            // 干净路径模式：去掉 appRoot 前缀
        var root = appRoot(); // ''（根）或 '/public'
        if (root && raw.indexOf(root) === 0) path = raw.slice(root.length);
      }
      // 注意：必须在去掉 '#' 之后的 path 上取 '?' 下标，否则与 raw 错位一位
      var qi = path.indexOf('?');
      if (qi >= 0) {
        (path.slice(qi + 1)).split('&').forEach(function (kv) {
          var p = kv.split('=');
          if (p[0]) { try { qobj[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } catch (e) {} }
        });
        path = path.slice(0, qi);
      }
      navigate(path, qobj);
      }
      catch (err) {}
  }, true);
}

/* 目录点击：平滑滚动到正文对应标题，避免改变 location.hash 触发 hash 路由 */
function bindTocScroll() {
  var links = document.querySelectorAll('a[data-toc]');
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var el = (typeof document.getElementById === 'function') ? document.getElementById(id.slice(1)) : document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // 若找不到目标，则恢复 router innerHTML 的行为：不阻止默认（可能跳到 404），故此处无默认跳转
    });
  });
}

/* 顶部导航搜索：点击搜索图标 → 隐藏导航、显示搜索框；输入实时出结果下拉面板 */
function bindSearch() {
  var toggle = document.querySelector('#searchToggle');
  var close = document.querySelector('#searchClose');
  var form = document.querySelector('#topbarSearch');
  var input = document.querySelector('#globalSearchInput');
  var panel = document.querySelector('#searchPanel');

  if (toggle) toggle.addEventListener('click', function () {
    var bar = document.querySelector('.topbar');
    if (bar && bar.classList.contains('searching')) {   // 再次点击 = 收起
      if (close) close.click();
      return;
    }
    _searchOpen = true;
    if (bar) bar.classList.add('searching');
    if (input) { input.focus(); input.select && input.select(); }
  });
  if (close) close.addEventListener('click', function () {
    _searchOpen = false;
    var bar = document.querySelector('.topbar');
    if (bar) bar.classList.remove('searching');
    if (input) input.value = '';
    if (panel) { panel.innerHTML = ''; panel.classList.remove('open'); }
    _snipCache = {};
  });
  if (input) {
    var _searchTimer = null;
    input.addEventListener('input', function () {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(function () { renderSearchPanel(input.value); }, 200);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (close) close.click(); }
    });
  }
  // 点击面板内部不冒泡；点击面板外部则收起整个搜索框
  if (panel) panel.addEventListener('click', function (e) { e.stopPropagation(); });
  if (!_searchDocBound && typeof document !== 'undefined' && document.addEventListener) {
    _searchDocBound = true;
    document.addEventListener('click', function (e) {
      var bar = document.querySelector('.topbar');
      if (!bar || !bar.classList.contains('searching')) return;
      var t = e.target;
      while (t && t !== document) {
        if (t.id === 'topbarSearch' || t.id === 'searchPanel' || t.id === 'searchToggle') return;
        t = t.parentNode;
      }
      var c = document.querySelector('#searchClose');   // 每次重新查询，避免路由重渲染后引用失效
      if (c) c.click();
    });
  }
}

/* 渲染搜索结果下拉面板（跨全部文章，非当前页过滤） */
function renderSearchPanel(query) {
  var panel = document.querySelector('#searchPanel');
  if (!panel) return;
  var q = String(query || '').trim();
  if (!q) { panel.innerHTML = ''; panel.classList.remove('open'); return; }
  var hits = globalSearch(q, 20);
  if (!hits.length) {
    panel.innerHTML = '<div class="search-empty">' + t('search.noMatch') + '</div>';
  } else {
    panel.innerHTML = hits.map(function (p) {
      var snip = searchSnippet(p, q);
      return '<a class="search-hit" href="' + esc(href(postUrl(p.id))) + '">'
        + '<div class="sh-title">' + highlightQuery(p.title || '', q) + '</div>'
        + (snip ? '<div class="sh-snip">' + highlightQuery(snip, q) + '</div>' : '')
        + '</a>';
    }).join('');
  }
  panel.classList.add('open');
}

/* AdSense 延迟加载：仅在广告位进入视口后才注入广告库，不与首屏渲染/API 抢带宽。
 * 策略：广告位进入视口（提前 150px 预判）后，最早 2.5s、空闲时 3.5s、兜底 5s 才开始加载广告；
 * 用户没有滚动到广告位时，不加载任何第三方广告脚本。
 * 广告位已有显隐控制，晚加载不影响布局 */
var _adSenseScheduled = false;
var _adSenseObserver = null;
// 仅当页面中真实出现 AdSense 广告位时才安排加载，首页/无广告页完全不引入第三方脚本。
function ensureAdSenseScheduled(slot) {
  if (_adSenseScheduled) return;
  if (!slot || !('IntersectionObserver' in window)) {
    // 不支持 IntersectionObserver：退回原有延迟加载
    _adSenseScheduled = true;
    scheduleAdSense();
    return;
  }
  if (!_adSenseObserver) {
    _adSenseObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        _adSenseScheduled = true;
        _adSenseObserver.disconnect();
        _adSenseObserver = null;
        scheduleAdSense();
      });
    }, { rootMargin: '150px 0px' });
  }
  _adSenseObserver.observe(slot);
}
function scheduleAdSense() {
  var start = Date.now();
  var fired = false;
  var fire = function () { if (fired) return; fired = true; loadAdSense(); };
  var after = function (ms) { return function () { if (Date.now() - start >= ms) fire(); }; };
  // 空闲即触发，但最短等待 2.5s（保证首屏/API 优先）
  if (window.requestIdleCallback) {
    window.requestIdleCallback(after(2500), { timeout: 3500 });
  } else {
    setTimeout(after(2500), 3500);
  }
  // 兜底：最多 5s 一定开始加载广告
  setTimeout(fire, 5000);
}

/* ---------- 广告（AdSense）----------
 * 仅在 ads.enabled && ads.client 时加载官方库脚本（adsbygoogle.js），
 * 注入到 <head>，等价于在 <head> 中放置 AdSense 提供的脚本。
 * 广告单元 HTML 由 config.js 的 ads.belowSearch / between / content 提供（含 <ins class="adsbygoogle"> 与 push 脚本）。
 * 未启用广告时不引入任何第三方脚本（零依赖原则）。 */
function loadAdSense() {
  try {
    var ads = (getConfig().ads) || {};
    var client = String(ads.client || '').trim();
    if (!ads.enabled || !client) return;
    if (document.getElementById('adsbygoogle-loader')) return;
    var s = document.createElement('script');
    s.id = 'adsbygoogle-loader';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    document.head.appendChild(s);
  } catch (e) { /* 忽略：广告加载失败不影响站点 */ }
}

/* 等待全局样式表加载完成：style.min.css 已由 render-blocking 改为非阻塞加载，
 * 但首次渲染的 DOM 仍需要它，因此 route() 前先等待，避免未样式闪烁（FOUC）。
 * 如果样式迟迟未完成（弱网/异常），最多 4s 后继续渲染，避免永久停在加载态。 */
function _waitGlobalStyle() {
  var link = document.getElementById('global-style');
  if (!link) return Promise.resolve();
  // 非浏览器环境（测试桩/无 HTMLLinkElement 语义）直接放行，避免无谓等待
  if (typeof link.media === 'undefined' || typeof link.sheet === 'undefined') return Promise.resolve();
  try {
    if (link.media === 'all' && link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) return Promise.resolve();
  } catch (e) {}
  return new Promise(function (resolve) {
    var done = false;
    var finish = function () { if (done) return; done = true; if (timer) clearInterval(timer); if (fallback) clearTimeout(fallback); resolve(); };
    var timer = setInterval(function () {
      try { if (link.media === 'all' && link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) finish(); } catch (e) {}
    }, 50);
    var fallback = setTimeout(finish, 4000);
    link.addEventListener('load', finish);
    link.addEventListener('error', finish);
  });
}

/* ---------- 启动引导 ----------
 * 首屏渲染不等待网络：先用静态/本地数据立即渲染，云端探测（/api/posts）
 * 异步完成后再合并数据并重渲染一次，切换为云端模式 UI。
 * 避免 API 慢（Workers 冷启动 / 弱网）时整页白屏等待。 */
window.__bootPromise = (async function () {
  var cfg = getConfig();
  applyTheme(getTheme());
  applyAccent(getAccent());
  bindNavClicks();
  // 全局样式非阻塞加载后，首帧渲染前需等它就绪（与 i18n 并行），避免 FOUC
  var _cssReady = _waitGlobalStyle();
  // 确保 i18n 翻译数据在首次渲染前加载完成
  if (window.__i18n && window.__i18n.loadLocale && !window.__i18n.isReady()) {
    await window.__i18n.loadLocale(window.__i18n.getLocale());
    _i18nReady = true;
  }

  await _cssReady;
  route();
  window.addEventListener('hashchange', function () { route(); });
  window.addEventListener('popstate', function () { route(); });

  if (cfg.mode === 'api' || cfg.mode === 'auto') {
    // 首次渲染（上方 route()）会显示加载动画；探测完成（成功或失败）后置位并重渲染，
    // 否则首页会一直停在「正在拉取文章…」
    // posts 与 settings 并行拉取：串行叠加等待（各约 0.5~1.5s 冷启动）会拖慢首屏。
    var results = await Promise.all([
      apiFetch('api/posts').then(function (r) { return { ok: true, data: r }; }, function () { return { ok: false, data: null }; }),
      apiFetch('api/settings').then(function (r) { return { ok: true, data: r }; }, function () { return { ok: false, data: null }; })
    ]);
    var resp = results[0].ok ? results[0].data : null;
    var sResp = results[1].ok ? results[1].data : null;

    try {
      var data = resp || {};
      if (data && Array.isArray(data.posts)) {
        var wasCloud = _cloudDetected;
        _cloudDetected = true;   // 云端在线：后续登录用 /api/admin/*
        _cloudReady = true;
        // 合并云端列表与本地静态列表：云端摘要覆盖已返回字段，保留静态正文与摘要
        // （content/enc 等）；未在云端列表中的静态文章仍保留作兜底。
        // 已删除文章的兜底隐患由 renderPost 的 404 处理兜底：访问时即移除并显示不存在。
        var existing = (Array.isArray(window.BLOG_POSTS) ? window.BLOG_POSTS : []);
        var byId = {};
        existing.forEach(function (p) { byId[p.id] = p; });
        data.posts.forEach(function (p) {
          var old = byId[p.id];
          if (old) {
            // 云端列表是摘要（不含 content/enc）：仅覆盖已返回字段，保留静态正文与摘要，
            // 避免首页卡片摘要被清空、全文搜索失效
            var merged = {};
            Object.keys(p).forEach(function (k) { if (p[k] !== undefined) merged[k] = p[k]; });
            byId[p.id] = Object.assign({}, old, merged);
          } else {
            byId[p.id] = p;
          }
        });
        window.BLOG_POSTS = Object.keys(byId).map(function (k) { return byId[k]; });
        // 探测成功：模式或数据有变化则重渲染一次（切换云端 UI、刷新列表数据；
        // 0 篇也用 !wasCloud 重渲染 → 从加载动画变为「你还未发布文章」空态）
        if (!wasCloud || data.posts.length) route();
      } else {
        _cloudReady = true;
      }
    } catch (e) {
      // 超时/失败 → 保持静态模式；置位 ready 并重渲染，避免首页卡在加载动画
      _cloudReady = true;
      route();
    }

    // 拉取站点设置（导航菜单 / 站点信息 / 个人资料），合并进运行时配置并重渲染一次。
    // GET /api/settings 为公开接口；已与 posts 并行拉取（sResp），失败时保持静态配置。
    try {
      if (sResp && sResp.settings) {
        var firstLoad = !_siteSettings;
        _siteSettings = sResp.settings;
        if (firstLoad) route();   // 首次加载设置后重渲染：导航/页脚/关于页生效
      }
    } catch (e) { /* 设置获取失败 → 使用静态配置 */ }
  }
})();
