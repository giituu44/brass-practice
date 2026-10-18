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
    for (const sel of [ltNote, $('drNote')]) {
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
    lt = { midi: Number(ltNote.value), goal: Number(ltGoal.value), phase: 'wait', cents: [] };
    $('ltStart').textContent = 'Stop';
    $('ltBar').style.width = '0%';
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
    ltSay(`Held ${held.toFixed(1)} s${held >= r.goal ? ' — goal reached!' : ''} · ${Math.abs(Math.round(mean))}¢ ${mean > 0 ? 'sharp' : 'flat'} on average · steadiness ${steady}%`
      + (held > prev && prev ? ' · new best!' : ''), held >= r.goal ? 'good' : '');
  }
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
      const held = lt.last - lt.start;
      $('ltBar').style.width = Math.min(100, (held / lt.goal) * 100) + '%';
      ltSay(`${held.toFixed(1)} s`, held >= lt.goal ? 'good' : '');
    } else if (r.t - lt.last > 0.3) {
      ltFinish();
    }
  });
  $('ltStart').addEventListener('click', ltStart);

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
