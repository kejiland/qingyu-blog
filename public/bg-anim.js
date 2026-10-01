/* ============================================================
 * Qingyu'Blog · 背景素描动画（春夏秋冬 · 随时间自动切换 · 可一键关闭）
 * ------------------------------------------------------------
 * 零依赖 Canvas 2D：细线条手绘风（素描感）的季节粒子——
 *   春  花瓣     夏  流云 + 日光微尘
 *   秋  落叶     冬  飘雪
 * 特性：
 *   · 季节按月自动切换（3-5春 / 6-8夏 / 9-11秋 / 12-2冬），平滑换季
 *   · 桌面默认开启；触屏/手机默认关闭（省电、提升 PageSpeed）；localStorage(qingyu.bgAnim) 持久化用户开关
 *   · 尊重 prefers-reduced-motion（系统"减少动态"自动关闭）
 *   · 标签页隐藏自动暂停（省电）；只首页运行；iOS/小屏自动减半粒子数
 *   · 暴露 window.bgAnim：{ on, off, toggle, isOn, sync, seasonName, setSeason, clearSeason }
 *   · 预览指定季节：/?season=spring|summer|autumn|winter&bg=1
 * 与 app.js 协作：app.js 顶栏加开关按钮，点击调 bgAnim.toggle()；
 * 路由变化由全局 'qy:route' 事件驱动 bgAnim.sync()。
 * ============================================================ */
(function () {
  'use strict';
  var KEY = 'qingyu.bgAnim';
  var canvas = null, ctx = null, raf = 0;
  var W = 0, H = 0, dpr = 1;
  var particles = [];
  var running = false;   // rAF 循环是否在跑（首页可见 + 开关开 + 无 reduced-motion）
  var enabled = true;    // 用户开关状态（默认开）
  var season = -1;       // 0春 1夏 2秋 3冬
  var seasonNames = ['spring', 'summer', 'autumn', 'winter'];
  var seasonMap = { spring: 0, summer: 1, autumn: 2, winter: 3 };
  var seasonOverride = null; // 预览 / 调试时可强制指定季节
  var isIOS = false;
  var reduced = false;
  var MAX = 48;

  // ---------- 开关持久化 ----------
  function isTouchDevice() {
    try {
      if (typeof window !== 'undefined' && 'ontouchstart' in window) return true;
      return (typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0);
    } catch (e) { return false; }
  }
  function readSetting() {
    try {
      if (new URLSearchParams(location.search).get('bg') === '1') return true;
    } catch (e) {}
    try {
      var v = localStorage.getItem(KEY);
      if (v === '0') return false;
      if (v === '1') return true;
    } catch (e) {}
    return !isTouchDevice(); // 桌面默认开；触屏/手机默认关（省电 + 提升 PageSpeed）
  }
  function persist() { try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch (e) {} }
  function notify() {
    try { window.dispatchEvent(new CustomEvent('qingyu:bgAnim', { detail: { on: enabled } })); } catch (e) {}
  }

  // ---------- 季节判定（按月分季） ----------
  function currentSeason() {
    if (seasonOverride !== null) return seasonOverride;
    try {
      var key = String(new URLSearchParams(location.search).get('season') || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(seasonMap, key)) return seasonMap[key];
    } catch (e) {}
    return Math.floor(((new Date()).getMonth() % 12) / 3);  // 0春 1夏 2秋 3冬
  }

  // ---------- 粒子系统 ----------
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function reseed() {
    particles = [];
    var count = Math.floor(MAX * (isIOS || W < 768 ? 0.5 : 1));
    for (var i = 0; i < count; i++) particles.push(makeParticle(true));
  }
  function makeParticle(anywhere) {
    var kind;
    switch (season) {
      case 0: {
        var springRoll = Math.random();
        kind = springRoll < 0.18 ? 'blossom' : (springRoll < 0.88 ? 'petal' : 'dust');
        break;  // 春：小簇樱花 + 花瓣 + 花粉微尘
      }
      case 1: {
        var summerRoll = Math.random();
        kind = summerRoll < 0.52 ? 'cloud' : (summerRoll < 0.9 ? 'mote' : 'ray');
        break;  // 夏：暖金流云 + 日光微尘 + 细阳光带
      }
      case 2: kind = Math.random() < 0.85 ? 'leaf' : 'dust'; break;    // 秋：落叶为主
      default: kind = 'snow';                                          // 冬：飘雪
    }
    var p = {
      kind: kind,
      x: rnd(0, W),
      y: anywhere ? rnd(-H, H) : -rnd(10, 90),
      size: rnd(5, 11) * (kind === 'mote' ? 0.55 : 1),
      vy: rnd(16, 46),        // 下落速度 px/s
      phase: rnd(0, Math.PI * 2),
      swayAmp: rnd(12, 34),   // 横摆幅度
      swayFreq: rnd(0.4, 1.1),
      rot: rnd(0, Math.PI * 2),
      rotSpeed: rnd(-1.2, 1.2),
      alpha: rnd(0.5, 1),
      seed: Math.floor(rnd(0, 1e9)) % 997   // 画"手绘抖动"的伪随机种子
    };
    if (p.kind === 'cloud') { p.size = rnd(40, 88); p.vy = rnd(4, 9); p.swayAmp = rnd(4, 12); p.alpha = rnd(0.34, 0.54); }
    if (p.kind === 'ray') { p.size = rnd(28, 72); p.vy = rnd(5, 10); p.swayAmp = rnd(8, 20); p.alpha = rnd(0.12, 0.22); }
    if (p.kind === 'blossom') { p.size = rnd(6, 10); p.vy = rnd(14, 28); p.swayAmp = rnd(18, 38); p.rotSpeed = rnd(-0.7, 0.7); p.alpha = rnd(0.62, 0.95); }
    if (p.kind === 'petal') { p.size = rnd(7, 13); p.vy = rnd(20, 40); p.swayAmp = rnd(26, 48); p.alpha = rnd(0.58, 0.9); }
    if (p.kind === 'leaf') { p.vy = rnd(24, 50); p.swayAmp = rnd(40, 70); }
    if (p.kind === 'snow') { p.size = rnd(6, 12); p.vy = rnd(14, 34); p.swayAmp = rnd(18, 42); p.alpha = rnd(0.72, 1); }
    return p;
  }
  function update(p, dt) {
    p.phase += dt * p.swayFreq;
    p.x += Math.sin(p.phase) * p.swayAmp * dt * 0.6;
    p.y += p.vy * dt;
    p.rot += p.rotSpeed * dt;
    // 飘出视野后回到顶部（保持粒子总数恒定）
    if (p.y > H + 40) {
      var np = makeParticle(false);
      np.x = p.x; // 从当前 x 继续（若为边界则回绕）
      np.x = (p.x < 0 || p.x > W) ? rnd(0, W) : p.x;
      return np;
    }
    if (p.x > W + 60) p.x = -30;
    if (p.x < -60) p.x = W + 30;
    return p;
  }

  // ---------- 素描风格绘制（细线条 + 轻抖动） ----------
  function sketchJitter(ctx, p) {
    // 用粒子 seed 做稳定伪随机：每帧视觉一致的轻微抖动，营造手绘感
    var t = (p.seed % 5) - 2;
    return (t / 10) * 1.2;
  }
  function drawPetal(ctx, p) {
    var s = p.size, jx = sketchJitter(ctx, p);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.beginPath();
    // 樱花花瓣：下方圆润、顶端有缺刻，比单纯椭圆更接近真实花瓣
    ctx.moveTo(jx, s);
    ctx.quadraticCurveTo(-s - jx, -s * 0.2, -s * 0.34, -s * 0.6);
    ctx.quadraticCurveTo(-s * 0.12, -s * 0.78, jx, -s * 0.42);
    ctx.quadraticCurveTo(s * 0.12, -s * 0.78, s * 0.34, -s * 0.6);
    ctx.quadraticCurveTo(s + jx, -s * 0.2, jx, s);
    ctx.fillStyle = 'rgba(201, 143, 160, 0.12)';
    ctx.fill();
    // 中脉 + 两条侧脉
    ctx.moveTo(jx, s - s * 0.12);
    ctx.lineTo(jx, -s * 0.25);
    ctx.moveTo(jx, s * 0.3);
    ctx.lineTo(-s * 0.35, s * 0.15);
    ctx.moveTo(jx, s * 0.3);
    ctx.lineTo(s * 0.35, s * 0.15);
    ctx.stroke();
    ctx.restore();
  }
  function drawBlossom(ctx, p) {
    var s = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.beginPath();
    // 五瓣小花：春动画里再加入少量完整花簇，让季节特征更明确
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      var c = Math.cos(a), sn = Math.sin(a);
      var px = -sn, py = c;
      var tx = c * s, ty = sn * s;
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(c * s * 0.42 + px * s * 0.45, sn * s * 0.42 + py * s * 0.45, tx, ty);
      ctx.quadraticCurveTo(c * s * 0.42 - px * s * 0.45, sn * s * 0.42 - py * s * 0.45, 0, 0);
    }
    ctx.fillStyle = 'rgba(201, 143, 160, 0.16)';
    ctx.fill();
    ctx.stroke();
    // 花心
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(217, 179, 87, 0.42)';
    ctx.fill();
    ctx.restore();
  }
  function drawLeaf(ctx, p) {
    var s = p.size, jx = sketchJitter(ctx, p);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.beginPath();
    // 秋叶：有叶柄、叶尖与侧脉，更接近真实落叶
    ctx.moveTo(jx, s);
    ctx.quadraticCurveTo(s + jx, s * 0.15, jx, -s);
    ctx.quadraticCurveTo(-s + jx, s * 0.15, jx, s);
    // 中脉
    ctx.moveTo(jx, s * 0.8);
    ctx.lineTo(jx, -s * 0.7);
    // 侧脉
    ctx.moveTo(jx, -s * 0.05); ctx.lineTo(-s * 0.45, -s * 0.4);
    ctx.moveTo(jx, -s * 0.05); ctx.lineTo(s * 0.45, -s * 0.4);
    ctx.moveTo(jx, s * 0.35); ctx.lineTo(-s * 0.4, s * 0.1);
    ctx.moveTo(jx, s * 0.35); ctx.lineTo(s * 0.4, s * 0.1);
    ctx.stroke();
    ctx.restore();
  }
  function drawSnow(ctx, p) {
    var s = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.lineWidth = Math.max(0.9, Math.min(1.6, s * 0.11));
    ctx.beginPath();
    // 经典六角雪花：六向主枝 + 每枝两侧多级分叉 + 中心六边形。
    var branch = [0.38, 0.64, 0.84];
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      var c = Math.cos(a), sn = Math.sin(a);
      ctx.moveTo(0, 0);
      ctx.lineTo(c * s, sn * s);
      for (var j = 0; j < branch.length; j++) {
        var t = branch[j], len = s * (0.30 - j * 0.055);
        var bx = c * s * t, by = sn * s * t;
        var spread = 0.72;
        var a1 = a + spread, a2 = a - spread;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a1) * len, by + Math.sin(a1) * len);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(a2) * len, by + Math.sin(a2) * len);
      }
    }
    // 中心六边形，让雪花不是单纯放射线
    var r = s * 0.14;
    for (var k = 0; k < 6; k++) {
      var ha = k * Math.PI / 3;
      var hx = Math.cos(ha) * r, hy = Math.sin(ha) * r;
      if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  function drawMote(ctx, p) {
    var s = p.size, jx = sketchJitter(ctx, p);
    ctx.save();
    ctx.translate(p.x, p.y);
    // 日光微尘：柔亮圆点 + 细十字高光
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.2, s * 0.32), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(217, 179, 87, 0.38)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-s + jx, 0);
    ctx.lineTo(s + jx, 0);
    ctx.moveTo(0, -s + jx * 0.4);
    ctx.lineTo(0, s + jx * 0.4);
    ctx.stroke();
    ctx.restore();
  }
  function drawRay(ctx, p) {
    var s = p.size;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    // 细阳光带：一条弯曲的暖色光痕，和云、微尘组合成夏日空气感
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, -s * 0.14, s, 0);
    ctx.stroke();
    ctx.globalAlpha *= 0.55;
    ctx.beginPath();
    ctx.moveTo(-s * 0.72, s * 0.16);
    ctx.quadraticCurveTo(0, s * 0.04, s * 0.72, s * 0.16);
    ctx.stroke();
    ctx.restore();
  }
  function drawCloud(ctx, p) {
    var s = p.size, jx = sketchJitter(ctx, p);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    // 流云：蓬松圆弧轮廓 + 暖色半透明填充，让夏季云层更可辨识
    ctx.moveTo(-s + jx, p.size * 0.28);
    ctx.quadraticCurveTo(-s - p.size * 0.2, -p.size * 0.18, -s * 0.5, -p.size * 0.22);
    ctx.quadraticCurveTo(-s * 0.55, -p.size * 0.72, -s * 0.12, -p.size * 0.62);
    ctx.quadraticCurveTo(-s * 0.2, -p.size * 1.05, s * 0.18, -p.size * 0.78);
    ctx.quadraticCurveTo(s * 0.25, -p.size * 1.1, s * 0.6, -p.size * 0.55);
    ctx.quadraticCurveTo(s * 1.02, -p.size * 0.5, s * 0.85, -p.size * 0.08);
    ctx.quadraticCurveTo(s * 1.15, p.size * 0.2, s * 0.4, p.size * 0.28);
    ctx.quadraticCurveTo(s * 0.25, p.size * 0.42, -s * 0.35, p.size * 0.42);
    ctx.quadraticCurveTo(-s * 0.85, p.size * 0.5, -s + jx, p.size * 0.28);
    ctx.fillStyle = 'rgba(217, 179, 87, 0.075)';
    ctx.fill();
    ctx.stroke();
    // 内部云脊线，增强层次
    ctx.beginPath();
    ctx.moveTo(-s * 0.65, p.size * 0.05);
    ctx.quadraticCurveTo(-s * 0.28, -p.size * 0.5, s * 0.05, -p.size * 0.2);
    ctx.quadraticCurveTo(s * 0.32, -p.size * 0.55, s * 0.68, -p.size * 0.05);
    ctx.stroke();
    ctx.restore();
  }
  function drawSummerSun() {
    var x = W - Math.min(150, W * 0.12), y = Math.min(130, H * 0.15);
    var r = Math.max(54, Math.min(92, W * 0.055));
    ctx.save();
    var glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.65);
    glow.addColorStop(0, 'rgba(217, 179, 87, 0.14)');
    glow.addColorStop(0.45, 'rgba(217, 179, 87, 0.065)');
    glow.addColorStop(1, 'rgba(217, 179, 87, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.65, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha *= 0.38;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4 + 0.22;
      ctx.moveTo(x + Math.cos(a) * r * 1.18, y + Math.sin(a) * r * 1.18);
      ctx.lineTo(x + Math.cos(a) * r * 1.42, y + Math.sin(a) * r * 1.42);
    }
    ctx.stroke();
    ctx.restore();
  }
  function drawParticle(ctx, p) {
    switch (p.kind) {
      case 'petal': drawPetal(ctx, p); break;
      case 'blossom': drawBlossom(ctx, p); break;
      case 'leaf': drawLeaf(ctx, p); break;
      case 'snow': drawSnow(ctx, p); break;
      case 'mote': drawMote(ctx, p); break;
      case 'cloud': drawCloud(ctx, p); break;
      case 'ray': drawRay(ctx, p); break;
      case 'dust': drawMote(ctx, p); break;
    }
  }

  // 每季一组低饱和配色（素描眼感：细线条 + 轻透明）
  var PALETTE = [
    '#c98fa0', // 春 · 樱粉
    '#d9b357', // 夏 · 暖金
    '#c08a4d', // 秋 · 桐褐
    '#9db4c8'  // 冬 · 冰蓝
  ];

  // ---------- 渲染循环 ----------
  function tick(ts) {
    if (!running) return;
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE[season];
    if (season === 1) drawSummerSun();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = p.alpha * (p.kind === 'snow' ? 0.78 : 0.5);   // 整体低透明，雪花略清晰，不抢正文
      var np = update(p, dt);
      if (np !== p) particles[i] = np;
      drawParticle(ctx, particles[i]);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  }
  var lastTs = 0;

  // ---------- 生命周期 ----------
  function start() { if (running || !canvas) return; running = true; lastTs = 0; raf = requestAnimationFrame(tick); }
  function stop()  { if (!running) return; running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function shouldRun() {
    // 仅首页 + 开关开 + 系统未关闭动态效果
    return enabled && !reduced && (location.pathname === '/' || location.pathname === '');
  }
  function sync() {
    if (!canvas) return;
    var ok = shouldRun();
    if (ok && !running) { start(); }
    else if (!ok && running) { stop(); ctx.clearRect(0, 0, W, H); }
    // 季节变化 → 换季重播种（平滑过渡）
    var s = currentSeason();
    if (s !== season) { season = s; if (running) reseed(); }
  }
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    reseed();
  }

  // ---------- 对外 API ----------
  function setOn(v) {
    enabled = !!v;
    persist();
    notify();
    if (enabled) { season = -1; sync(); }  // 重新评估（换季重播 + 若首页则启动）
    else { stop(); if (ctx && canvas) ctx.clearRect(0, 0, W, H); }
  }
  function on()   { setOn(true); }
  function off()  { setOn(false); }
  function toggle() { setOn(!enabled); }
  function isOn() { return enabled; }
  function seasonName() { return seasonNames[season < 0 ? currentSeason() : season]; }
  function setSeason(value) {
    var n = typeof value === 'string' ? seasonMap[value.toLowerCase()] : Number(value);
    if (n == null || !isFinite(n) || n < 0 || n > 3) return false;
    seasonOverride = n;
    season = -1;
    sync();
    return true;
  }
  function clearSeason() {
    seasonOverride = null;
    season = -1;
    sync();
  }

  // ---------- 初始化 ----------
  function boot() {
    isIOS = /iP(hone|ad|od)/i.test(navigator.platform || '') ||
      (/MacIntel/i.test(navigator.platform || '') && (navigator.maxTouchPoints || 0) > 1) ||
      /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
    reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    enabled = readSetting();
    // 若系统要求减少动态 → 默认关闭（用户可手动开启）
    if (reduced) enabled = false;

    canvas = document.createElement('canvas');
    canvas.id = 'bgSketch';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    if (!ctx) { canvas.parentNode.removeChild(canvas); canvas = null; return; }

    resize();
    window.addEventListener('resize', function () { resize(); if (running) sync(); });
    // 标签页隐藏/可见：暂停/恢复（省电）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else sync();
    });
    // 路由变化（app.js 全局派发）：进首页启动，离开停止
    window.addEventListener('qy:route', sync);
    // 系统"减少动态"偏好变化
    if (typeof window.matchMedia === 'function') {
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
        reduced = e.matches;
        if (reduced) { enabled = false; persist(); }
        sync();
      });
    }
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.bgAnim = { on: on, off: off, toggle: toggle, isOn: isOn, sync: sync, seasonName: seasonName, setSeason: setSeason, clearSeason: clearSeason };
})();