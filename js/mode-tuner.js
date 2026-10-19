// Tuner mode: shows the note you're playing, how many cents off it is, and its fingering.
(() => {
  'use strict';
  const { S, store, $ } = TP;
  let smooth = null;   // cents, smoothed while the same note holds

  // Chord tuning: where each note of the chord sits when tuned pure against the drone
  // (just intonation), in cents from the tuner's equal temperament.
  const JUST = { 0: 0, 7: 2, 4: -14, 3: 16, 9: -16, 10: -31 };
  const ROLE_NAME = { 0: 'root', 7: 'fifth', 4: 'major third', 3: 'minor third', 9: 'major sixth', 10: 'seventh' };
  // If you're playing the chord note picked under Drone: { name, offset }, else null.
  function chordTarget(midi) {
    const role = $('drRole').value;
    if (!drone || role === '') return null;
    const root = Number($('drNote').value), iv = Number(role);
    if (((midi - root - iv) % 12 + 12) % 12) return null;
    return { name: `${ROLE_NAME[iv]} above ${TP.label(TP.spell(root, 'flats')).replace(/\d+$/, '')}`, offset: JUST[iv] };
  }
  // A line about this note from your intonation map, or (if not measured) the usual
  // tendency of its fingering.
  function mapHint(midi, f) {
    const d = store.intonation && store.intonation[midi];
    if (d && d.c !== undefined) {
      const better = TP.myFingering(midi);
      return ` · your map: usually ${d.c > 0 ? '+' : ''}${d.c}¢ on ${TP.fmtFingering(d.f)}` + (better !== null ? ` (${TP.fmtFingering(better)} sits better)` : '');
    }
    const c = f ? TP.comboCents(f[0]) : 0;
    return c >= 15 ? ` · ${TP.fmtFingering(f[0])} tends to run sharp${S.compensating ? '' : ' on a non-compensating horn'}` : '';
  }

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
    // With a chord note picked, the needle's centre is that note's pure tuning.
    const ct = chordTarget(r.midi);
    const c = Math.round(smooth.c - (ct ? ct.offset : 0));
    $('drTarget').textContent = ct ? `You're on the ${ct.name}: aim ${ct.offset ? Math.abs(ct.offset) + '¢ ' + (ct.offset < 0 ? 'low' : 'high') : 'dead centre'} — the needle is centred there.` : ($('drRole').value && drone ? 'Play the note you picked, against the drone.' : '');
    const n = TP.spell(r.midi, 'flats'), sharp = TP.spell(r.midi, 'sharps');
    $('tunNote').innerHTML = `${n.letter}${TP.ACC_TEXT[n.acc]}<sub>${n.octave}</sub>`
      + (sharp.letter !== n.letter ? `<small> / ${sharp.letter}${TP.ACC_TEXT[sharp.acc]}</small>` : '');
    $('tunCents').textContent = (c > 0 ? '+' : '') + c + '¢ ' + (Math.abs(c) <= 8 ? (ct ? 'in tune with the drone' : 'in tune') : c > 0 ? 'sharp' : 'flat');
    $('tunCents').className = 'tun-cents' + (Math.abs(c) <= 8 ? ' good' : Math.abs(c) <= 20 ? ' close' : ' off');
    $('tunNeedle').style.left = (50 + Math.max(-50, Math.min(50, c))) + '%';
    $('tunNeedle').className = 'tun-needle' + (Math.abs(c) <= 8 ? ' good' : Math.abs(c) <= 20 ? ' close' : '');
    const concert = TP.inst().transpose ? ` · sounds ${TP.label(TP.spell(r.concert, 'flats'))} (concert)` : '';
    $('tunFreq').textContent = r.freq.toFixed(1) + ' Hz' + concert;
    const f = FINGERINGS[r.midi];
    $('tunFing').textContent = f ? `Fingering: ${f.map(TP.fmtFingering).join(' or ')}${mapHint(r.midi, f)}` : 'Outside the fingering chart';
  }
  TP.mic.on(render);

  async function startMic() {
    try {
      await TP.mic.start();
      $('tunStatus').textContent = '';
    } catch (e) {
      $('tunStatus').textContent = TP.micError(e);
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


  // The drone's note menu.
  function fillNotes() { TP.noteMenu($('drNote')); }

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
    // Root + fifth: the fifth tuned pure (exactly 3:2), as an ensemble would.
    const voices = [[f, 'sawtooth', 0.5], [f * 2, 'sine', 0.35], [f * 1.002, 'sawtooth', 0.4]];
    if ($('drChord').value === 'fifth') voices.push([f * 1.5, 'sawtooth', 0.32], [f * 1.5 * 1.002, 'sawtooth', 0.2]);
    const oscs = voices.map(([fr, type, g]) => {
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
  $('drChord').addEventListener('change', () => { if (drone) { droneToggle(); droneToggle(); } });
  $('drRole').addEventListener('change', e => { e.target.blur(); $('drTarget').textContent = ''; });

  TP.modes.tuner = {
    panel: 'panel-tuner',
    valves: false,
    enter() { $('tunA').textContent = `A = ${S.a4 || 440} Hz`; fillNotes(); renderBtn(); render(TP.mic.current); if (!TP.mic.active) startMic(); },
    leave() {
      if (TP.inton) TP.inton.stop();
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
