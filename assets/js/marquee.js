/* ==========================================================================
   marquee.js — 全屏跑马灯
   逐帧位移（rAF + translate3d），无缝循环，支持四方向
   ========================================================================== */
(function () {
  'use strict';

  var NS = window.WB;

  var els = {
    text: NS.byId('mqText'),
    count: NS.byId('mqCount'),
    start: NS.byId('mqStart'),
    dir: NS.byId('mqDir'),
    speed: NS.byId('mqSpeed'),
    speedOut: NS.byId('mqSpeedOut'),
    fs: NS.byId('mqFs'),
    fsOut: NS.byId('mqFsOut'),
    fg: NS.byId('mqFg'),
    bg: NS.byId('mqBg'),
    led: NS.byId('mqLed'),
    glow: NS.byId('mqGlow')
  };

  var stage = NS.byId('stage');
  var view = NS.byId('stageView');
  var track = NS.byId('stageTrack');
  var ui = NS.byId('stageUI');
  var btnPause = NS.byId('stagePause');
  var btnExit = NS.byId('stageExit');

  if (!els.text || !stage) { return; }

  var SAMPLE = '欢迎使用全屏跑马灯　·　输入文字，点击播放，即可全屏滚动展示';

  /* ------------------------------------------------------------------
     设置
     ------------------------------------------------------------------ */
  var S = NS.store.get('wb.mq', {
    dir: 'left',
    speed: 120,
    fs: 72,
    fg: '#ffffff',
    bg: '#0b0d12',
    led: false,
    glow: true,
    gap: 80
  });

  S.dir = ['left', 'right', 'up', 'down'].indexOf(S.dir) >= 0 ? S.dir : 'left';
  S.speed = NS.clamp(Number(S.speed) || 120, 20, 420);
  S.fs = NS.clamp(Number(S.fs) || 72, 24, 220);
  S.gap = NS.clamp(Number(S.gap) || 80, 0, 400);

  function save() { NS.store.set('wb.mq', S); }

  /* ------------------------------------------------------------------
     运行时
     ------------------------------------------------------------------ */
  var raf = 0;
  var lastT = 0;
  var offset = 0;
  var cycle = 0;
  var axis = 'x';
  var running = false;
  var paused = false;
  var uiTimer = 0;
  var rebuildTimer = 0;

  function isHoriz() {
    return S.dir === 'left' || S.dir === 'right';
  }

  function getText() {
    return els.text.value.replace(/\s+$/, '');
  }

  /* ------------------------------------------------------------------
     构建轨道：按视口尺寸决定复制份数，保证无空隙
     ------------------------------------------------------------------ */
  function build() {
    var text = getText();
    if (!text.trim()) { return false; }

    axis = isHoriz() ? 'x' : 'y';

    track.className = 'stage-track stage-track--' + axis;
    track.innerHTML = '';
    track.style.transform = 'translate3d(0,0,0)';

    stage.style.setProperty('--stage-fg', S.fg);
    stage.style.setProperty('--stage-bg', S.bg);
    stage.style.setProperty('--fs', S.fs + 'px');
    stage.style.setProperty('--gap', S.gap + 'px');
    stage.classList.toggle('is-led', !!S.led);
    stage.classList.toggle('is-glow', !!S.glow);

    // 横向单行：换行替换为间隔，避免文字被压成一行
    var content = isHoriz() ? text.replace(/\n+/g, '　　') : text;

    var proto = document.createElement('div');
    proto.className = 'stage-copy';
    proto.textContent = content;
    track.appendChild(proto);

    var box = proto.getBoundingClientRect();
    var size = isHoriz() ? box.width : box.height;
    if (size < 1) { return false; }

    var viewSize = isHoriz() ? view.clientWidth : view.clientHeight;
    var n = Math.max(2, Math.ceil(viewSize / size) + 1);

    for (var i = 1; i < n; i++) {
      track.appendChild(proto.cloneNode(true));
    }

    cycle = size;
    offset = 0;
    return true;
  }

  function applyTransform() {
    if (axis === 'x') {
      track.style.transform = 'translate3d(' + (-offset).toFixed(2) + 'px,0,0)';
    } else {
      track.style.transform = 'translate3d(0,' + (-offset).toFixed(2) + 'px,0)';
    }
  }

  function tick(t) {
    if (!running) { return; }

    if (!lastT) { lastT = t; }
    var dt = (t - lastT) / 1000;
    lastT = t;

    // 切页/后台返回时 dt 可能极大，钳制避免瞬移
    if (dt > 0.12) { dt = 0.12; }

    if (!paused && cycle > 0) {
      var sign = (S.dir === 'left' || S.dir === 'up') ? 1 : -1;
      offset += sign * S.speed * dt;
      offset = ((offset % cycle) + cycle) % cycle;
      applyTransform();
    }

    raf = window.requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------------
     全屏 / 打开 / 关闭
     ------------------------------------------------------------------ */
  function requestFullscreen() {
    var fn = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (!fn) { return; }
    try {
      var p = fn.call(stage);
      if (p && typeof p.catch === 'function') { p.catch(function () {}); }
    } catch (e) { /* iPhone Safari 不支持，忽略 */ }
  }

  function exitFullscreen() {
    var el = document.fullscreenElement || document.webkitFullscreenElement;
    if (!el) { return; }
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn) { return; }
    try {
      var p = fn.call(document);
      if (p && typeof p.catch === 'function') { p.catch(function () {}); }
    } catch (e) { /* 忽略 */ }
  }

  function openStage() {
    stage.hidden = false;
    stage.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('is-stage');
  }

  function closeStage() {
    running = false;
    paused = false;
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    window.clearTimeout(uiTimer);
    NS.awake.off();
    exitFullscreen();
    stage.hidden = true;
    stage.setAttribute('aria-hidden', 'true');
    stage.classList.remove('is-ui');
    document.documentElement.classList.remove('is-stage');
    btnPause.textContent = '暂停';
  }

  /* ------------------------------------------------------------------
     控制条自动隐藏
     ------------------------------------------------------------------ */
  function showUI() {
    stage.classList.add('is-ui');
    window.clearTimeout(uiTimer);
    uiTimer = window.setTimeout(function () {
      stage.classList.remove('is-ui');
    }, 3200);
  }

  function toggleUI() {
    if (stage.classList.contains('is-ui')) {
      stage.classList.remove('is-ui');
      window.clearTimeout(uiTimer);
    } else {
      showUI();
    }
  }

  /* ------------------------------------------------------------------
     启动 / 暂停
     ------------------------------------------------------------------ */
  function start() {
    if (running) { return; }

    openStage();

    if (!build()) {
      closeStage();
      NS.toast('请先输入要滚动的文字');
      els.text.focus();
      return;
    }

    requestFullscreen();

    running = true;
    paused = false;
    lastT = 0;
    offset = 0;
    applyTransform();

    NS.awake.on();
    raf = window.requestAnimationFrame(tick);

    btnPause.textContent = '暂停';
    showUI();
  }

  function togglePause() {
    if (!running) { return; }
    paused = !paused;
    btnPause.textContent = paused ? '继续' : '暂停';
    showUI();
  }

  function rebuild() {
    if (!running) { return; }
    build();
    applyTransform();
  }

  function scheduleRebuild() {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(rebuild, 180);
  }

  /* ------------------------------------------------------------------
     事件绑定
     ------------------------------------------------------------------ */
  function syncUI() {
    els.speed.value = String(S.speed);
    els.fs.value = String(S.fs);
    els.speedOut.textContent = S.speed + ' px/s';
    els.fsOut.textContent = S.fs + ' px';
    els.fg.value = S.fg;
    els.bg.value = S.bg;
    els.led.checked = !!S.led;
    els.glow.checked = !!S.glow;

    var btns = els.dir.querySelectorAll('.seg-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-on', btns[i].getAttribute('data-dir') === S.dir);
    }
  }

  function updateCount() {
    els.count.textContent = els.text.value.length + ' 字';
  }

  els.start.addEventListener('click', start);

  els.dir.addEventListener('click', function (e) {
    var btn = e.target.closest('.seg-btn');
    if (!btn) { return; }
    S.dir = btn.getAttribute('data-dir');
    save();
    syncUI();
    rebuild();
  });

  els.speed.addEventListener('input', function () {
    S.speed = NS.clamp(Number(els.speed.value) || 120, 20, 420);
    els.speedOut.textContent = S.speed + ' px/s';
    save();
  });

  els.fs.addEventListener('input', function () {
    S.fs = NS.clamp(Number(els.fs.value) || 72, 24, 220);
    els.fsOut.textContent = S.fs + ' px';
    stage.style.setProperty('--fs', S.fs + 'px');
    save();
    scheduleRebuild();
  });

  els.fg.addEventListener('input', function () {
    S.fg = els.fg.value;
    stage.style.setProperty('--stage-fg', S.fg);
    save();
  });

  els.bg.addEventListener('input', function () {
    S.bg = els.bg.value;
    stage.style.setProperty('--stage-bg', S.bg);
    save();
  });

  els.led.addEventListener('change', function () {
    S.led = els.led.checked;
    stage.classList.toggle('is-led', S.led);
    save();
  });

  els.glow.addEventListener('change', function () {
    S.glow = els.glow.checked;
    stage.classList.toggle('is-glow', S.glow);
    save();
  });

  els.text.addEventListener('input', function () {
    updateCount();
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(function () {
      NS.store.set('wb.mq.text', els.text.value);
      rebuild();
    }, 400);
  });

  // 舞台上：点击切换控制条
  stage.addEventListener('click', function (e) {
    if (e.target.closest('.stage-ui')) { return; }
    toggleUI();
  });

  btnPause.addEventListener('click', togglePause);
  btnExit.addEventListener('click', closeStage);

  document.addEventListener('keydown', function (e) {
    if (!running) { return; }
    if (e.key === 'Escape') { closeStage(); }
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      togglePause();
    }
  });

  // 尺寸变化（含全屏切换、横竖屏）后重新计算份数与循环长度
  window.addEventListener('resize', scheduleRebuild);
  window.addEventListener('orientationchange', scheduleRebuild);
  document.addEventListener('fullscreenchange', scheduleRebuild);
  document.addEventListener('webkitfullscreenchange', scheduleRebuild);

  /* ------------------------------------------------------------------
     初始化
     ------------------------------------------------------------------ */
  var savedText = NS.store.get('wb.mq.text', null);
  els.text.value = typeof savedText === 'string' && savedText.length ? savedText : SAMPLE;

  syncUI();
  updateCount();

})();
