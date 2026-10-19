// Tuner mode: shows the note you're playing, how many cents off it is, and its fingering.
(() => {
  'use strict';
  const { S, store, $ } = TP;
  let smooth = null;   // cents, smoothed while the same note holds

  function render(r) {
    if ($('panel-tuner').hidden) return;
    const has = r && r.midi !== null;
    $('tunNeedleWrap').classList.toggle('idle', !has);
    if (!has) {
      smooth = null;
      $('tunNote').innerHTML = '–';
      $('tunCents').textContent = ' ';
      $('tunFreq').textContent = TP.mic.active ? 'Play a note…' : ' ';
      $('tunFing').textContent = ' ';
      return;
    }
    smooth = smooth && smooth.midi === r.midi ? { midi: r.midi, c: smooth.c * 0.6 + r.cents * 0.4 } : { midi: r.midi, c: r.cents };
    const c = Math.round(smooth.c);
    const n = TP.spell(r.midi, 'flats'), sharp = TP.spell(r.midi, 'sharps');
    $('tunNote').innerHTML = `${n.letter}${TP.ACC_TEXT[n.acc]}<sub>${n.octave}</sub>`
      + (sharp.letter !== n.letter ? `<small> / ${sharp.letter}${TP.ACC_TEXT[sharp.acc]}</small>` : '');
    $('tunCents').textContent = (c > 0 ? '+' : '') + c + '¢ ' + (Math.abs(c) <= 8 ? 'in tune' : c > 0 ? 'sharp' : 'flat');
    $('tunCents').className = 'tun-cents' + (Math.abs(c) <= 8 ? ' good' : Math.abs(c) <= 20 ? ' close' : ' off');
    $('tunNeedle').style.left = (50 + Math.max(-50, Math.min(50, c))) + '%';
    $('tunNeedle').className = 'tun-needle' + (Math.abs(c) <= 8 ? ' good' : Math.abs(c) <= 20 ? ' close' : '');
    const concert = TP.inst().transpose ? ` · sounds ${TP.label(TP.spell(r.concert, 'flats'))} (concert)` : '';
    $('tunFreq').textContent = r.freq.toFixed(1) + ' Hz' + concert;
    const f = FINGERINGS[r.midi];
    $('tunFing').textContent = f ? `Fingering: ${f.map(TP.fmtFingering).join(' or ')}` : 'Outside the fingering chart';
  }
  TP.mic.on(render);

  async function startMic() {
    try {
      await TP.mic.start();
      $('tunStatus').textContent = '';
    } catch (e) {
      $('tunStatus').textContent = micError(e);
    }
    renderBtn();
    render(null);
  }
  function renderBtn() {
    $('tunStart').firstChild.textContent = TP.mic.active ? 'Stop listening ' : 'Start listening ';
  }
  $('tunStart').addEventListener('click', () => {
    if (TP.mic.active) { TP.mic.stop(); renderBtn(); render(null); } else startMic();
  });

  function micError(e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      return 'Microphone access was blocked. Allow it in the browser’s address bar (or site settings) and try again.';
    }
    if (e && e.name === 'NotFoundError') return 'No microphone found.';
    return (e && e.message) || 'Couldn’t start the microphone.';
  }
  TP.micError = micError;

  // ---------- long-tone challenge ----------
  // Waits for the note, then times how long it's held (short dropouts forgiven)
  // and how steady the pitch is.
  let lt = null;   // { midi, goal, phase: 'wait'|'hold', start, last, cents: [] }
  const ltNote = $('ltNote'), ltGoal = $('ltGoal');
  function fillNotes() {
    for (const sel of [ltNote, $('drNote'), $('tgNote')]) {
      const keep = sel.value;
      sel.textContent = '';
      for (const m of TP.ALL_MIDI) sel.add(new Option(TP.flatLabel(m), m));
      const mid = TP.ALL_MIDI.find(m => m >= (S.low + S.high) / 2 && FINGERINGS[m] && FINGERINGS[m][0] === '') || TP.ALL_MIDI[Math.floor(TP.ALL_MIDI.length / 2)];
      sel.value = keep && FINGERINGS[keep] ? keep : mid;
    }
  }
  function ltSay(text, cls = '') { $('ltMsg').className = 'feedback' + (cls ? ' ' + cls : ''); $('ltMsg').textContent = text || ' '; }
  function ltBest(midi) { return (store.longTones && store.longTones[midi]) || 0; }

  async function ltStart() {
    if (lt) { ltFinish(); return; }
    if (!TP.mic.active) await startMic();
    if (!TP.mic.active) { ltSay('The long-tone challenge needs the microphone.', 'bad'); return; }
    lt = { midi: Number(ltNote.value), goal: Number(ltGoal.value), shape: $('ltShape').value, phase: 'wait', cents: [], pts: [] };
    $('ltStart').textContent = 'Stop';
    $('ltBar').style.width = '0%';
    drawLt(lt);
    const best = ltBest(lt.midi);
    ltSay(`Play ${TP.label(TP.spell(lt.midi, 'flats'))} (${FINGERINGS[lt.midi].map(TP.fmtFingering).join(' or ')}) when you're ready…` + (best ? ` Best: ${best.toFixed(1)} s.` : ''));
  }
  function ltFinish() {
    const r = lt;
    lt = null;
    $('ltStart').textContent = 'Start';
    if (!r || r.phase !== 'hold') { ltSay(''); return; }
    const held = r.last - r.start;
    const mean = r.cents.reduce((a, b) => a + b, 0) / r.cents.length;
    const sd = Math.sqrt(r.cents.reduce((a, b) => a + (b - mean) ** 2, 0) / r.cents.length);
    const steady = Math.max(0, Math.round(100 - sd * 4));
    const prev = ltBest(r.midi);
    if (held > prev) { store.longTones[r.midi] = Math.round(held * 10) / 10; TP.save(); }
    if (held >= r.goal) TP.markDone('warmup');
    TP.activity();
    drawLt(r);
    ltSay(`Held ${held.toFixed(1)} s${held >= r.goal ? ' — goal reached!' : ''} · ${Math.abs(Math.round(mean))}¢ ${mean > 0 ? 'sharp' : 'flat'} on average · pitch steadiness ${steady}%`
      + (held > prev && prev ? ' · new best!' : '') + shapeReport(r), held >= r.goal ? 'good' : '');
  }

  // ---------- the shape of a long tone: loudness (and pitch) over time ----------
  const SPAN = 12;   // dB between soft and loud in the target shapes
  // Target loudness, in dB below the loudest, at fraction x of the goal.
  const target = (shape, x) => ({ cres: -SPAN + SPAN * x, dim: -SPAN * x, swell: x < 0.5 ? -SPAN + 2 * SPAN * x : SPAN - 2 * SPAN * x }[shape] || 0);
  const dbOf = (rms, max) => Math.max(-24, 20 * Math.log10(rms / max));
  function drawLt(r) {
    const g = $('ltGraph');
    g.hidden = false;
    $('ltKey').hidden = false;
    g.textContent = '';
    const pts = r.pts, len = Math.max(r.goal, pts.length ? pts[pts.length - 1].t : 0);
    const X = t => 6 + (t / len) * 288, Yd = d => 8 + (-d / 24) * 80, Yc = c => 48 - Math.max(-30, Math.min(30, c)) * 1.3;
    g.appendChild(TP.el('line', { x1: 6, x2: 294, y1: 48, y2: 48, class: 'mid' }));
    const tline = [];
    for (let i = 0; i <= 40; i++) tline.push(`${X(r.goal * i / 40)},${Yd(target(r.shape, i / 40))}`);
    g.appendChild(TP.el('polyline', { points: tline.join(' '), class: 'target' }));
    if (pts.length < 2) return;
    const max = Math.max(...pts.map(p => p.rms));
    g.appendChild(TP.el('polyline', { points: pts.map(p => `${X(p.t)},${Yd(dbOf(p.rms, max))}`).join(' '), class: 'loud' }));
    g.appendChild(TP.el('polyline', { points: pts.map(p => `${X(p.t)},${Yc(p.c)}`).join(' '), class: 'pitch' }));
  }
  // How well the loudness followed the shape, and whether the pitch moved with it.
  function shapeReport(r) {
    const pts = r.pts;
    if (pts.length < 15) return '';
    const max = Math.max(...pts.map(p => p.rms)), db = pts.map(p => dbOf(p.rms, max));
    const parts = [];
    if (r.shape === 'steady') {
      const m = db.reduce((a, b) => a + b, 0) / db.length;
      const sd = Math.sqrt(db.reduce((a, b) => a + (b - m) ** 2, 0) / db.length);
      parts.push(`loudness steadiness ${Math.max(0, Math.round(100 - sd * 12))}%`);
    } else {
      let err = 0, n = 0;
      pts.forEach((p, i) => { if (p.t <= r.goal) { err += Math.abs(db[i] - target(r.shape, p.t / r.goal)); n++; } });
      parts.push(`shape ${n ? Math.max(0, Math.round(100 - (err / n) * 7)) : 0}%`);
      parts.push(`${Math.round(-Math.min(...db))} dB from soft to loud`);
      if (r.shape === 'swell') {
        const peak = pts[db.indexOf(0)].t / Math.max(r.goal, pts[pts.length - 1].t);
        parts.push(`loudest at ${Math.round(peak * 100)}% of the way (aim for 50%)`);
      }
    }
    // Pitch against loudness: brass players often go sharp or flat as they get louder.
    const range = -Math.min(...db);
    if (range >= 6) {
      const mx = db.reduce((a, b) => a + b, 0) / db.length, my = pts.reduce((a, p) => a + p.c, 0) / pts.length;
      let sxy = 0, sxx = 0;
      pts.forEach((p, i) => { sxy += (db[i] - mx) * (p.c - my); sxx += (db[i] - mx) ** 2; });
      const drift = Math.round((sxx ? sxy / sxx : 0) * range);
      if (Math.abs(drift) >= 6) parts.push(`pitch went ${Math.abs(drift)}¢ ${drift > 0 ? 'sharp' : 'flat'} as you got louder`);
      else parts.push('pitch held as the volume changed');
    }
    return ' · ' + parts.join(' · ');
  }
  $('ltShape').value = S.ltShape || 'steady';
  $('ltShape').addEventListener('change', e => { S.ltShape = e.target.value; TP.save(); if (!lt) drawLt({ goal: Number(ltGoal.value), shape: S.ltShape, pts: [] }); });
  TP.mic.on(r => {
    if (!lt) return;
    const on = TP.mic.matches(r.midi, lt.midi) && Math.abs(r.cents) <= 35;
    if (lt.phase === 'wait') {
      if (on && r.held >= 0.15) { lt.phase = 'hold'; lt.start = r.t - r.held; lt.last = r.t; }
      return;
    }
    if (on) {
      lt.last = r.t;
      lt.cents.push(r.cents);
      lt.pts.push({ t: r.t - lt.start, rms: r.rms, c: r.cents });
      if (lt.pts.length % 3 === 0) drawLt(lt);
      const held = lt.last - lt.start;
      $('ltBar').style.width = Math.min(100, (held / lt.goal) * 100) + '%';
      ltSay(`${held.toFixed(1)} s`, held >= lt.goal ? 'good' : '');
    } else if (r.t - lt.last > 0.3) {
      ltFinish();
    }
  });
  $('ltStart').addEventListener('click', ltStart);

  // ---------- tonguing: repeated notes against the click ----------
  // One bar of clicks, then two bars of notes on one pitch (8ths, triplets or 16ths).
  // Each note start the mic hears is matched to where it should have been.
  let tg = null;
  const MAX_RATE = 9;   // notes a second the mic can still tell apart
  function tgSetBpm(v) {
    const top = Math.floor(MAX_RATE * 60 / S.tgSub);
    S.tgBpm = Math.max(40, Math.min(top, Math.round(v)));
    $('tgBpm').textContent = S.tgBpm;
    TP.save();
  }
  function tgSay(text, cls = '') { $('tgMsg').className = 'feedback' + (cls ? ' ' + cls : ''); $('tgMsg').textContent = text || ' '; }
  function tgStop(msg) {
    if (!tg) return;
    tg.r.stop();
    tg = null;
    $('tgStart').textContent = 'Start';
    if (msg !== undefined) tgSay(msg);
  }
  async function tgStart() {
    if (tg) { tgStop(''); return; }
    if (lt) ltFinish();
    if (!TP.mic.active) await startMic();
    if (!TP.mic.active) { tgSay('The tonguing trainer needs the microphone.', 'bad'); return; }
    const ctx = TP.audio();
    await ctx.resume();
    const midi = Number($('tgNote').value), sub = S.tgSub, spb = 60 / S.tgBpm, BEATS = 8;
    const r = TP.makeRun(), t0 = ctx.currentTime + 0.4, tp = t0 + 4 * spb;
    const want = [];
    for (let k = 0; k < BEATS * sub; k++) want.push(tp + k * spb / sub);
    tg = { r, midi, sub, spb, want, readings: [], tp, end: tp + BEATS * spb };
    $('tgStart').textContent = 'Stop';
    for (let b = 0; b < 4 + BEATS; b++) {
      const t = t0 + b * spb;
      r.click(t, b % 4 === 0);
      if (b < 4) r.at(t, () => tgSay(String(b + 1), 'count'));
    }
    r.at(tp, () => tgSay(`Tongue ${TP.label(TP.spell(midi, 'flats'))}: ${{ 2: 'two', 3: 'three', 4: 'four' }[sub]} notes a beat…`));
    r.at(tg.end + 0.35, tgFinish);
  }
  TP.mic.on(r => { if (tg) tg.readings.push(r); });
  function tgFinish() {
    const t = tg, step = t.spb / t.sub;
    tgStop();
    // Note starts on your note (any octave counts as the same note for this).
    const starts = TP.mic.noteStarts(t.readings, m => (m - t.midi) % 12 === 0).filter(s => s >= t.tp - step / 2 && s <= t.end);
    const used = new Set(), res = t.want.map(w => {
      let best = -1;
      starts.forEach((s, j) => { if (!used.has(j) && Math.abs(s - w) <= step / 2 && (best < 0 || Math.abs(s - w) < Math.abs(starts[best] - w))) best = j; });
      if (best < 0) return null;
      used.add(best);
      return (starts[best] - w) * 1000;
    });
    drawTg(t, res, starts);
    const hits = res.filter(x => x !== null);
    TP.activity();
    if (hits.length < t.want.length / 3) {
      tgSay(`Heard ${hits.length} of ${t.want.length} notes. Play a little louder (or raise Mic sensitivity in Settings), with headphones on.`, 'bad');
      return;
    }
    const mean = hits.reduce((a, b) => a + b, 0) / hits.length;
    const sd = Math.sqrt(hits.reduce((a, b) => a + (b - mean) ** 2, 0) / hits.length);
    let msg = `${hits.length}/${t.want.length} notes · on average ${Math.abs(Math.round(mean))} ms ${mean > 0 ? 'late' : 'early'} · evenness ±${Math.round(sd)} ms`;
    // Double/triple tonguing: is one syllable (the K) behind the other?
    if (t.sub > 1) {
      const byPos = Array.from({ length: t.sub }, (_, p) => res.filter((x, k) => x !== null && k % t.sub === p));
      const avg = byPos.map(a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0));
      const worst = avg.reduce((w, a, p) => (Math.abs(a - avg[0]) > Math.abs(avg[w] - avg[0]) ? p : w), 0);
      if (worst && Math.abs(avg[worst] - avg[0]) >= 15) {
        msg += ` · note ${worst + 1} of each group lands ${Math.round(Math.abs(avg[worst] - avg[0]))} ms ${avg[worst] > avg[0] ? 'later' : 'earlier'} than the first`
          + (t.sub === 2 || t.sub === 4 ? ' (your K?)' : '');
      }
    }
    const good = hits.length >= t.want.length * 0.9 && sd <= 30;
    tgSay(msg + (good ? ' — nice and even.' : '.'), good ? 'good' : '');
  }
  function drawTg(t, res, starts) {
    const g = $('tgGraph'), step = t.spb / t.sub, len = t.end - t.tp;
    g.hidden = false;
    g.textContent = '';
    const X = s => 8 + ((s - t.tp + step / 2) / (len + step)) * 284;
    t.want.forEach((w, k) => {
      g.appendChild(TP.el('line', { x1: X(w), x2: X(w), y1: k % t.sub ? 14 : 8, y2: 36, class: k % t.sub ? 'sub' : 'beat' }));
      const off = res[k];
      if (off === null) g.appendChild(TP.el('circle', { cx: X(w), cy: 22, r: 3, class: 'missed' }));
      else g.appendChild(TP.el('circle', { cx: X(w + off / 1000), cy: 22, r: 3, class: 'hit' + (Math.abs(off) > 50 ? ' off' : Math.abs(off) > 25 ? ' close' : '') }));
    });
  }
  $('tgStart').addEventListener('click', tgStart);
  $('tgSub').value = String(S.tgSub || 4);
  $('tgSub').addEventListener('change', e => { S.tgSub = Number(e.target.value); tgSetBpm(S.tgBpm); });
  $('tgSlower').addEventListener('click', () => tgSetBpm(S.tgBpm - 4));
  $('tgFaster').addEventListener('click', () => tgSetBpm(S.tgBpm + 4));
  tgSetBpm(S.tgBpm || 80);

  // ---------- drone ----------
  let drone = null;
  function droneToggle() {
    if (drone) { drone.stop(); drone = null; $('drBtn').textContent = '▶ Play drone'; return; }
    const ctx = TP.audio();
    const f = TP.hz(Number($('drNote').value) - TP.inst().transpose);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(1200, f * 5);
    const oscs = [[f, 'sawtooth', 0.5], [f * 2, 'sine', 0.35], [f * 1.002, 'sawtooth', 0.4]].map(([fr, type, g]) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.value = fr; gn.gain.value = g;
      o.connect(gn); gn.connect(lp); o.start();
      return o;
    });
    lp.connect(out);
    out.connect(ctx.destination);
    drone = {
      stop() {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        oscs.forEach(o => o.stop(t + 0.35));
      },
    };
    $('drBtn').textContent = '■ Stop drone';
  }
  $('drBtn').addEventListener('click', droneToggle);
  $('drNote').addEventListener('change', () => { if (drone) { droneToggle(); droneToggle(); } });

  TP.modes.tuner = {
    panel: 'panel-tuner',
    valves: false,
    enter() { $('tunA').textContent = `A = ${S.a4 || 440} Hz`; fillNotes(); renderBtn(); render(TP.mic.current); if (!TP.mic.active) startMic(); },
    leave() {
      if (TP.inton) TP.inton.stop();
      if (lt) ltFinish();
      if (tg) tgStop('');
      if (drone) droneToggle();
      if (S.input !== 'mic' && TP.mic.active) TP.mic.stop();
    },
    settingsChanged() {},
    preloadNotes: () => [],
    key(k) {
      if (k === ' ' || k === 'enter') { $('tunStart').click(); return true; }
      return false;
    },
  };
})();
