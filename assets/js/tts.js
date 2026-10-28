/* ==========================================================================
   tts.js — 本地语音合成朗读
   依赖浏览器内置的 Web Speech API（speechSynthesis），调用系统语音引擎
   ========================================================================== */
(function () {
  'use strict';

  var NS = window.WB;
  var synth = window.speechSynthesis;
  var Utter = window.SpeechSynthesisUtterance;

  var els = {
    text: NS.byId('ttsText'),
    count: NS.byId('ttsCount'),
    play: NS.byId('ttsPlay'),
    pause: NS.byId('ttsPause'),
    stop: NS.byId('ttsStop'),
    voice: NS.byId('ttsVoice'),
    voiceHint: NS.byId('voiceHint'),
    rate: NS.byId('rate'),
    rateOut: NS.byId('rateOut'),
    pitch: NS.byId('pitch'),
    pitchOut: NS.byId('pitchOut'),
    vol: NS.byId('vol'),
    volOut: NS.byId('volOut'),
    awake: NS.byId('awake'),
    previewCard: NS.byId('ttsPreviewCard'),
    preview: NS.byId('ttsPreview'),
    prog: NS.byId('ttsProg'),
    note: NS.byId('ttsNote')
  };

  if (!els.text) { return; }

  var SAMPLE = '欢迎使用朗读工具。这是一段示例文字，点击「开始朗读」，页面就会调用手机自带的语音引擎把它读出来。你可以调整语速和音调，也可以切换成自己习惯的中文语音。';

  /* ------------------------------------------------------------------
     设置持久化
     ------------------------------------------------------------------ */
  var S = NS.store.get('wb.tts', {
    rate: 1,
    pitch: 1,
    vol: 1,
    voice: '',
    awake: true
  });
  S.rate = NS.clamp(Number(S.rate) || 1, 0.5, 2);
  S.pitch = NS.clamp(Number(S.pitch) || 1, 0.5, 1.8);
  S.vol = NS.clamp(S.vol === 0 ? 0 : Number(S.vol) || 1, 0, 1);

  function save() { NS.store.set('wb.tts', S); }

  /* ------------------------------------------------------------------
     运行时状态
     ------------------------------------------------------------------ */
  var voices = [];
  var chunks = [];
  var idx = 0;
  var playing = false;
  var paused = false;
  var currentUtt = null;
  var watchdog = 0;
  var voicesReady = false;

  /* ------------------------------------------------------------------
     文本切分：按句切分，超长句再硬切
     目的：规避部分内核长句被截断 / 首句延迟，同时提供逐句朗读进度
     ------------------------------------------------------------------ */
  var MAX_LEN = 90;

  function splitSentences(text) {
    var out = [];
    var re = /[^。！？!?；;\n…]+[。！？!?；;\n…]*/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var s = m[0].replace(/\s+/g, ' ').trim();
      if (s) { out.push(s); }
    }
    return out;
  }

  function buildChunks(text) {
    var sents = splitSentences(text);
    var out = [];

    for (var i = 0; i < sents.length; i++) {
      var s = sents[i];

      // 单句超长 → 按长度硬切，规避部分内核长句被截断
      while (s.length > MAX_LEN) {
        out.push(s.slice(0, MAX_LEN));
        s = s.slice(MAX_LEN);
      }

      if (s.trim()) { out.push(s); }
    }

    return out;
  }

  /* ------------------------------------------------------------------
     语音列表
     ------------------------------------------------------------------ */
  function isZh(v) {
    return /^(zh|cmn)/i.test(v.lang || '') ||
           /chinese|中文|普通话|國語|国语/i.test(v.name || '');
  }

  function voiceKey(v) {
    return v.voiceURI || (v.name + '|' + v.lang);
  }

  function currentVoice() {
    if (!voices.length) { return null; }
    var i;
    if (S.voice) {
      for (i = 0; i < voices.length; i++) {
        if (voiceKey(voices[i]) === S.voice) { return voices[i]; }
      }
    }
    for (i = 0; i < voices.length; i++) {
      if (/^zh[-_]?CN/i.test(voices[i].lang || '')) { return voices[i]; }
    }
    for (i = 0; i < voices.length; i++) {
      if (isZh(voices[i])) { return voices[i]; }
    }
    return null;
  }

  function renderVoices() {
    var list = synth.getVoices() || [];
    if (!list.length) { return false; }

    voices = list.slice().sort(function (a, b) {
      var az = isZh(a) ? 0 : 1;
      var bz = isZh(b) ? 0 : 1;
      if (az !== bz) { return az - bz; }
      return (a.name || '').localeCompare(b.name || '');
    });

    var sel = els.voice;
    sel.innerHTML = '';

    var gZh = document.createElement('optgroup');
    gZh.label = '中文';
    var gOther = document.createElement('optgroup');
    gOther.label = '其他语言';
    var zhCount = 0;

    voices.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = voiceKey(v);
      opt.textContent = v.name + ' · ' + v.lang + (v.localService ? '' : ' · 在线');
      if (isZh(v)) {
        gZh.appendChild(opt);
        zhCount++;
      } else {
        gOther.appendChild(opt);
      }
    });

    if (zhCount) { sel.appendChild(gZh); }
    if (gOther.children.length) { sel.appendChild(gOther); }

    var cur = currentVoice();
    if (cur) {
      sel.value = voiceKey(cur);
      S.voice = voiceKey(cur);
      save();
    } else {
      sel.selectedIndex = 0;
    }

    // 提示
    els.voiceHint.textContent = voices.length + ' 个可用';
    if (!zhCount) {
      els.note.textContent = '未检测到中文语音。iOS：设置 → 辅助功能 → 朗读内容 → 声音 → 中文；' +
                             'Android：安装「语音合成引擎」并下载中文语音包。';
    } else {
      els.note.textContent = '若无声音，请检查手机静音开关 / 勿扰模式，并调高媒体音量。';
    }

    voicesReady = true;
    return true;
  }

  function loadVoicesWithRetry() {
    if (renderVoices()) { return; }
    // Chrome / Android 上语音列表是异步加载的，voiceschanged 不一定触发，轮询兜底
    var tries = 0;
    var timer = window.setInterval(function () {
      tries++;
      if (renderVoices() || tries > 20) {
        window.clearInterval(timer);
        if (tries > 20 && !voicesReady) {
          els.voiceHint.textContent = '无';
          els.note.textContent = '未检测到可用语音引擎，请更换浏览器（Chrome / Safari / Edge）。';
        }
      }
    }, 250);
  }

  /* ------------------------------------------------------------------
     进度渲染
     ------------------------------------------------------------------ */
  function renderPreview() {
    var box = els.preview;
    box.innerHTML = '';
    var frag = document.createDocumentFragment();

    chunks.forEach(function (c, i) {
      var span = document.createElement('span');
      span.className = 'chunk';
      span.textContent = c;
      span.setAttribute('data-i', String(i));
      frag.appendChild(span);
    });

    box.appendChild(frag);
    els.previewCard.hidden = false;
  }

  function markChunk(i, done) {
    var nodes = els.preview.children;
    for (var k = 0; k < nodes.length; k++) {
      var n = nodes[k];
      var isCur = Number(n.getAttribute('data-i')) === i;
      n.classList.toggle('is-cur', isCur && !done);
      n.classList.toggle('is-done', Number(n.getAttribute('data-i')) < i);
      if (isCur) {
        if (typeof n.scrollIntoView === 'function') {
          try {
            n.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } catch (e) {
            n.scrollIntoView(false);
          }
        }
      }
    }
  }

  function clearMarks() {
    var nodes = els.preview.children;
    for (var k = 0; k < nodes.length; k++) {
      nodes[k].classList.remove('is-cur', 'is-done');
    }
  }

  function updateProg() {
    if (!chunks.length) {
      els.prog.textContent = '—';
      return;
    }
    var cur = Math.min(idx + 1, chunks.length);
    els.prog.textContent = cur + ' / ' + chunks.length;
  }

  function updateButtons() {
    els.play.disabled = false;
    els.pause.disabled = !playing;
    els.stop.disabled = !playing;
    els.pause.textContent = paused ? '继续' : '暂停';
    els.play.textContent = paused ? '继续朗读' : (playing ? '朗读中…' : '开始朗读');
    els.play.classList.toggle('is-stop', playing && !paused);
  }

  /* ------------------------------------------------------------------
     朗读主流程
     ------------------------------------------------------------------ */
  function clearWatchdog() {
    if (watchdog) {
      window.clearTimeout(watchdog);
      watchdog = 0;
    }
  }

  function finish() {
    playing = false;
    paused = false;
    idx = chunks.length;
    currentUtt = null;
    clearWatchdog();
    NS.awake.off();
    updateButtons();
    updateProg();
    markChunk(chunks.length - 1, true);
    els.prog.textContent = '完成';
  }

  function speakNext() {
    if (!playing) { return; }
    if (idx >= chunks.length) { finish(); return; }

    var myIdx = idx;
    var text = chunks[myIdx];
    var u = new Utter(text);
    var v = currentVoice();

    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    u.rate = S.rate;
    u.pitch = S.pitch;
    u.volume = S.vol;

    u.onstart = function () {
      if (!playing || myIdx !== idx) { return; }
      markChunk(myIdx, false);
      updateProg();
    };

    u.onend = function () {
      clearWatchdog();
      if (!playing || myIdx !== idx) { return; }
      idx++;
      updateProg();
      speakNext();
    };

    u.onerror = function (ev) {
      clearWatchdog();
      if (!playing || myIdx !== idx) { return; }
      var reason = ev && ev.error;
      if (reason === 'interrupted' || reason === 'canceled') { return; }
      // 其他错误：跳过该段继续，避免整篇卡死
      idx++;
      updateProg();
      window.setTimeout(speakNext, 40);
    };

    currentUtt = u;          // 持有引用，防止 iOS 上对象被回收导致朗读中断
    synth.speak(u);
    markChunk(myIdx, false);
    updateProg();

    // 看门狗：极端情况下 onend 不触发，按估算时长兜底推进
    clearWatchdog();
    var estimate = Math.round(text.length * 620 / Math.max(0.5, S.rate)) + 6000;

    function check() {
      if (!playing || paused || myIdx !== idx) { return; }
      if (synth.speaking) {
        watchdog = window.setTimeout(check, 4000);   // 仍在发声，继续等
        return;
      }
      idx++;
      updateProg();
      speakNext();
    }

    watchdog = window.setTimeout(check, estimate);
  }

  function play() {
    if (!synth) { return; }

    // 暂停态 → 继续
    if (paused) {
      synth.resume();
      paused = false;
      updateButtons();
      return;
    }
    if (playing) { return; }

    var text = els.text.value.trim();
    if (!text) {
      NS.toast('请先输入要朗读的文字');
      els.text.focus();
      return;
    }

    var list = buildChunks(text);
    if (!list.length) {
      NS.toast('没有可朗读的内容');
      return;
    }

    chunks = list;
    idx = 0;

    // 清掉可能残留的队列
    try { synth.cancel(); } catch (e) { /* 忽略 */ }

    playing = true;
    paused = false;

    renderPreview();
    clearMarks();
    updateButtons();
    updateProg();

    if (S.awake) { NS.awake.on(); }

    // 同步调用 speak：iOS 要求首次发声必须在用户手势的调用栈内
    speakNext();
  }

  function stop() {
    playing = false;
    paused = false;
    currentUtt = null;
    clearWatchdog();
    try { synth.cancel(); } catch (e) { /* 忽略 */ }
    NS.awake.off();
    updateButtons();
    clearMarks();
    updateProg();
  }

  function togglePause() {
    if (!playing) { return; }
    if (paused) {
      synth.resume();
      paused = false;
    } else {
      synth.pause();
      paused = true;
    }
    updateButtons();
  }

  /* ------------------------------------------------------------------
     事件绑定
     ------------------------------------------------------------------ */
  function syncLabels() {
    els.rateOut.textContent = S.rate.toFixed(2) + '×';
    els.pitchOut.textContent = S.pitch.toFixed(2);
    els.volOut.textContent = Math.round(S.vol * 100) + '%';
  }

  function syncControls() {
    els.rate.value = String(S.rate);
    els.pitch.value = String(S.pitch);
    els.vol.value = String(S.vol);
    els.awake.checked = !!S.awake;
    syncLabels();
  }

  function updateCount() {
    var n = els.text.value.length;
    els.count.textContent = n + ' 字';
  }

  els.play.addEventListener('click', play);
  els.stop.addEventListener('click', stop);
  els.pause.addEventListener('click', togglePause);

  els.rate.addEventListener('input', function () {
    S.rate = NS.clamp(Number(els.rate.value) || 1, 0.5, 2);
    syncLabels();
    save();
  });

  els.pitch.addEventListener('input', function () {
    S.pitch = NS.clamp(Number(els.pitch.value) || 1, 0.5, 1.8);
    syncLabels();
    save();
  });

  els.vol.addEventListener('input', function () {
    S.vol = NS.clamp(Number(els.vol.value), 0, 1);
    syncLabels();
    save();
  });

  els.awake.addEventListener('change', function () {
    S.awake = els.awake.checked;
    save();
    if (!S.awake) { NS.awake.off(); }
    else if (playing) { NS.awake.on(); }
  });

  els.voice.addEventListener('change', function () {
    S.voice = els.voice.value;
    save();
    if (playing) {
      NS.toast('语音已切换，将从当前句生效');
    }
  });

  els.text.addEventListener('input', updateCount);

  // 页面隐藏时中止朗读，避免后台残留
  window.addEventListener('pagehide', stop);

  /* ------------------------------------------------------------------
     初始化
     ------------------------------------------------------------------ */
  if (!synth || typeof Utter !== 'function') {
    els.play.disabled = true;
    els.pause.disabled = true;
    els.stop.disabled = true;
    els.note.textContent = '当前浏览器不支持语音合成，请使用 Chrome / Safari / Edge 打开。';
    els.voiceHint.textContent = '不支持';
    return;
  }

  var savedText = NS.store.get('wb.tts.text', null);
  els.text.value = typeof savedText === 'string' && savedText.length ? savedText : SAMPLE;
  updateCount();

  // 文本自动保存（防误关页面丢内容）
  var saveTextTimer = 0;
  els.text.addEventListener('input', function () {
    window.clearTimeout(saveTextTimer);
    saveTextTimer = window.setTimeout(function () {
      NS.store.set('wb.tts.text', els.text.value);
    }, 400);
  });

  syncControls();
  updateButtons();

  if (typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged', renderVoices);
  }
  loadVoicesWithRetry();

})();
