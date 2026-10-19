// Recordings: play along with a real recording. Load a file (MP3, M4A, WAV…), drag
// across the waveform to loop a passage, and slow it down — the browser keeps the
// pitch the same, so you can still play along in tune. Files are kept in this
// browser (IndexedDB), each with its own loop and speed.
(() => {
  'use strict';
  const { $ } = TP;
  const audio = new Audio();
  audio.preservesPitch = true;
  audio.mozPreservesPitch = true;
  audio.webkitPreservesPitch = true;
  let cur = null;          // { id, name, blob, a, b, speed, peaks, url }
  let drag = null, raf = 0;
  const fmt = s => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

  // ---------- your recordings ----------
  async function renderList() {
    const box = $('plList');
    let all = [];
    try { all = await TP.takes.recordings.list(); } catch (e) {
      box.innerHTML = '<p class="sub tight">This browser won’t keep recordings here, so add one each time you open the app.</p>';
      return;
    }
    if (!all.length) { box.innerHTML = '<p class="sub tight">No recordings yet. Add one: a performance of a piece you’re learning, an orchestral excerpt, a backing track.</p>'; return; }
    box.textContent = '';
    for (const r of all) {
      const row = document.createElement('div');
      row.className = 'pl-row' + (cur && cur.id === r.id ? ' current' : '');
      row.innerHTML = `<button class="pl-open"><b></b><span></span></button><button class="link-btn danger" aria-label="Delete this recording">delete</button>`;
      row.querySelector('b').textContent = r.name;
      row.querySelector('span').textContent = `added ${new Date(r.added).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        + (r.a !== undefined && r.b !== undefined ? ` · loop ${fmt(r.a)}–${fmt(r.b)}` : '') + (r.speed && r.speed !== 1 ? ` · ${Math.round(r.speed * 100)}%` : '');
      row.querySelector('.pl-open').addEventListener('click', () => load(r));
      row.querySelector('.danger').addEventListener('click', async () => {
        if (!confirm(`Delete “${r.name}” from this browser?`)) return;
        if (cur && cur.id === r.id) close();
        await TP.takes.recordings.remove(r.id);
        renderList();
      });
      box.appendChild(row);
    }
  }
  $('plFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const rec = { name: f.name.replace(/\.[^.]+$/, ''), type: f.type, blob: f, added: Date.now(), speed: 1 };
    try { rec.id = await TP.takes.recordings.add(rec); } catch (err) { TP.toast('This browser won’t keep recordings here — it plays now, but add it again next time.', 7000); }
    await load(rec);
    renderList();
  });

  // ---------- the player ----------
  async function load(rec) {
    pause();
    if (cur && cur.url) URL.revokeObjectURL(cur.url);
    cur = { ...rec, url: URL.createObjectURL(rec.blob), peaks: null };
    audio.src = cur.url;
    audio.playbackRate = cur.speed || 1;
    $('plPlayer').hidden = false;
    $('plTitle').textContent = cur.name;
    $('plSpeed').value = String(cur.speed || 1);
    $('plLoop').checked = cur.a !== undefined && cur.b !== undefined;
    renderList();
    // The waveform: the loudest sample in each of a few hundred slices.
    try {
      const buf = await TP.audio().decodeAudioData(await rec.blob.arrayBuffer());
      const d = buf.getChannelData(0), n = 600, size = Math.floor(d.length / n), peaks = new Float32Array(n);
      for (let i = 0; i < n; i++) { let m = 0; for (let j = i * size, e = j + size; j < e; j += 8) m = Math.max(m, Math.abs(d[j])); peaks[i] = m; }
      const top = Math.max(...peaks) || 1;
      cur.peaks = peaks.map(p => p / top);
      cur.duration = buf.duration;
    } catch (e) { TP.toast('Couldn’t read that file’s sound for the waveform — it may still play.', 5000); }
    draw();
  }
  function close() { pause(); cur = null; $('plPlayer').hidden = true; }
  const dur = () => (cur && (cur.duration || audio.duration)) || 0;
  function draw() {
    const cv = $('plWave'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 600, H = 90;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const D = dur();
    if (cur && cur.a !== undefined && cur.b !== undefined && D) {
      g.fillStyle = css('--brass-soft');
      g.fillRect(cur.a / D * W, 0, (cur.b - cur.a) / D * W, H);
    }
    if (cur && cur.peaks) {
      g.fillStyle = css('--muted');
      const n = cur.peaks.length;
      for (let i = 0; i < n; i++) { const h = Math.max(1, cur.peaks[i] * (H - 8)); g.fillRect(i / n * W, (H - h) / 2, Math.max(1, W / n - 0.5), h); }
    }
    if (D) {
      g.fillStyle = css('--brass');
      g.fillRect(audio.currentTime / D * W - 1, 0, 2, H);
    }
    $('plPos').textContent = fmt(audio.currentTime);
    $('plDur').textContent = fmt(D);
    $('plLoopTxt').textContent = cur && cur.a !== undefined && cur.b !== undefined ? `loop ${fmt(cur.a)}–${fmt(cur.b)}` : 'drag on the waveform to pick a loop';
  }
  // While playing: follow along, and jump back to A at B when looping.
  function frame() {
    if (audio.paused) { raf = 0; draw(); return; }
    if (cur && $('plLoop').checked && cur.b !== undefined && audio.currentTime >= cur.b) {
      audio.currentTime = cur.a;
      // Each time round a little faster, up to full speed.
      if ($('plRamp').checked && audio.playbackRate < 1) setSpeed(Math.min(1, Math.round((audio.playbackRate + 0.05) * 100) / 100));
    }
    draw();
    raf = requestAnimationFrame(frame);
  }
  function play() {
    if (!cur) return;
    if (cur.a !== undefined && $('plLoop').checked && (audio.currentTime < cur.a || audio.currentTime >= cur.b)) audio.currentTime = cur.a;
    audio.play().then(() => { if (!raf) raf = requestAnimationFrame(frame); }, () => TP.toast('That file won’t play in this browser.', 5000));
    $('plPlay').firstChild.textContent = '❚❚ Pause ';
    TP.activity();
  }
  function pause() { audio.pause(); $('plPlay').firstChild.textContent = '▶ Play '; }
  function setSpeed(v) {
    if (!cur) return;
    cur.speed = v;
    audio.playbackRate = v;
    $('plSpeed').value = String(v);
    if (![...$('plSpeed').options].some(o => o.value === String(v))) $('plSpeed').add(new Option(Math.round(v * 100) + '%', String(v), true, true));
    keep();
  }
  // The loop and speed are kept with the recording.
  function keep() {
    if (!cur || cur.id === undefined) return;
    const { url, peaks, duration, ...rec } = cur;
    TP.takes.recordings.put(rec).catch(() => {});
  }
  function setPoint(which) {
    if (!cur) return;
    cur[which] = audio.currentTime;
    if (cur.a !== undefined && cur.b !== undefined && cur.b < cur.a) [cur.a, cur.b] = [cur.b, cur.a];
    if (cur.a !== undefined && cur.b !== undefined) $('plLoop').checked = true;
    keep();
    draw();
  }

  // Drag on the waveform: a loop. Click: jump there.
  const timeAt = e => { const r = $('plWave').getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur(); };
  $('plWave').addEventListener('pointerdown', e => { if (!cur) return; drag = { t0: timeAt(e), moved: false }; $('plWave').setPointerCapture(e.pointerId); });
  $('plWave').addEventListener('pointermove', e => {
    if (!drag) return;
    const t = timeAt(e);
    if (Math.abs(t - drag.t0) > dur() / 200) { drag.moved = true; cur.a = Math.min(drag.t0, t); cur.b = Math.max(drag.t0, t); draw(); }
  });
  $('plWave').addEventListener('pointerup', e => {
    if (!drag) return;
    if (drag.moved) { $('plLoop').checked = true; audio.currentTime = cur.a; keep(); } else audio.currentTime = timeAt(e);
    drag = null;
    draw();
  });

  $('plPlay').addEventListener('click', e => { e.currentTarget.blur(); audio.paused ? play() : pause(); });
  $('plBack').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 5); draw(); });
  $('plA').addEventListener('click', () => setPoint('a'));
  $('plB').addEventListener('click', () => setPoint('b'));
  $('plSpeed').addEventListener('change', e => { e.target.blur(); setSpeed(Number(e.target.value)); });
  $('plLoop').addEventListener('change', e => { e.target.blur(); draw(); });
  audio.addEventListener('ended', () => { pause(); draw(); });
  window.addEventListener('resize', () => { if (!$('panel-player').hidden && cur) draw(); });

  TP.modes.player = {
    panel: 'panel-player',
    valves: false,
    enter() { renderList(); if (cur) draw(); },
    leave() { pause(); },
    settingsChanged() {},
    preloadNotes: () => [],
    key(k) {
      if (!cur) return false;
      if (k === ' ') { audio.paused ? play() : pause(); return true; }
      if (k === 'escape') { pause(); audio.currentTime = cur.a !== undefined && $('plLoop').checked ? cur.a : 0; draw(); return true; }
      if (k === '[') { setPoint('a'); return true; }
      if (k === ']') { setPoint('b'); return true; }
      if (k === 'l') { $('plLoop').checked = !$('plLoop').checked; draw(); return true; }
      if (k === '-' || k === '+' || k === '=') {
        const opts = [...$('plSpeed').options].map(o => Number(o.value)).sort((a, b) => a - b);
        const i = opts.indexOf(cur.speed || 1) + (k === '-' ? -1 : 1);
        if (i >= 0 && i < opts.length) setSpeed(opts[i]);
        return true;
      }
      return false;
    },
  };
})();
