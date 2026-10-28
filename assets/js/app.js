/* ==========================================================================
   app.js — 公共能力：本地存储、Toast、屏幕常亮、Tab 切换
   纯原生实现，无依赖；使用经典脚本（非 ESM），保证 file:// 直接打开也能运行
   ========================================================================== */
(function () {
  'use strict';

  var NS = window.WB = window.WB || {};

  /* ------------------------------------------------------------------
     本地存储（读写失败不抛错，兼容隐私模式）
     ------------------------------------------------------------------ */
  NS.store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) { /* 忽略 */ }
    }
  };

  /* ------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------ */
  var toastEl = null;
  var toastTimer = 0;

  NS.toast = function (msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('is-on');
    }, 2200);
  };

  /* ------------------------------------------------------------------
     屏幕常亮（Wake Lock API，不支持则静默降级）
     ------------------------------------------------------------------ */
  NS.awake = (function () {
    var lock = null;
    var wanted = false;
    var supported = 'wakeLock' in navigator;

    function request() {
      if (!supported || lock) { return; }
      navigator.wakeLock.request('screen').then(function (l) {
        lock = l;
        l.addEventListener('release', function () { lock = null; });
      }).catch(function () {
        lock = null;
      });
    }

    // 页面重新可见时，锁会被系统释放，需要重新申请
    document.addEventListener('visibilitychange', function () {
      if (wanted && document.visibilityState === 'visible' && !lock) {
        request();
      }
    });

    return {
      supported: supported,
      on: function () {
        wanted = true;
        request();
      },
      off: function () {
        wanted = false;
        if (lock) {
          try { lock.release(); } catch (e) { /* 忽略 */ }
          lock = null;
        }
      }
    };
  })();

  /* ------------------------------------------------------------------
     工具
     ------------------------------------------------------------------ */
  NS.clamp = function (v, min, max) {
    return Math.min(max, Math.max(min, v));
  };

  NS.byId = function (id) {
    return document.getElementById(id);
  };

  /* ------------------------------------------------------------------
     Tab 切换
     ------------------------------------------------------------------ */
  var tabs = NS.byId('tabs');
  if (tabs) {
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) { return; }
      var name = btn.getAttribute('data-tab');
      if (!name) { return; }

      var all = tabs.querySelectorAll('.seg-btn');
      for (var i = 0; i < all.length; i++) {
        var on = all[i] === btn;
        all[i].classList.toggle('is-on', on);
        all[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }

      var panes = document.querySelectorAll('.pane');
      for (var j = 0; j < panes.length; j++) {
        panes[j].classList.toggle('is-on', panes[j].id === 'pane-' + name);
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

})();
