// Warm-up: sing, buzz, play. Hear a note, sing it, buzz it on the mouthpiece, then play
// it — Arnold Jacobs' "song and wind": hear the pitch in your head first and the lips
// find it. The mic checks each step: singing and buzzing in any octave, playing on the note.
(() => {
  'use strict';
  const { S, $ } = TP;
  const STEPS = [
    { key: 'sing', name: 'Sing', how: 'Sing it — any comfortable octave, on “ah”', loose: true, octaves: true, tol: 50 },
    { key: 'buzz', name: 'Buzz', how: 'Buzz it on the mouthpiece alone', loose: true, octaves: true, tol: 50 },
    { key: 'play', name: 'Play', how: 'Now play it on the horn', loose: false, octaves: false, tol: 30 },
  ];
  const HOLD = 0.6;      // s on the pitch to count
  const TIMEOUT = 8;     // s to find it before moving on
  const GAP = 0.5;       // s after each step before listening for the next (so one doesn't count twice)
  let sb = null;         // { notes, k, step, from, on, cents, results: [[{ ok, c }…]…], r, timer }

  function say(text, cls = '') { $('sbMsg').className = 'feedback' + (cls ? ' ' + cls : ''); $('sbMsg').textContent = text || ' '; }
  // Notes within a fifth of the chosen one, in your range and with a fingering.
  function pickNotes(center, n) {
    const pool = TP.ALL_MIDI.filter(m => FINGERINGS[m] && Math.abs(m - center) <= 7 && m >= S.low && m <= S.high);
    const out = [];
    for (let i = 0; i < n; i++) {
      const choices = pool.filter(m => m !== out[out.length - 1]);
      out.push((choices.length ? choices : [center])[Math.floor(Math.random() * (choices.length || 1))]);
    }
    return out;
  }
  // Cents from the note (any octave for singing and buzzing).
  function offOf(x, midi, octaves) {
    let d = x.midi - midi;
    if (octaves || TP.S.micAnyOctave) d = ((d % 12) + 18) % 12 - 6;
    return d * 100 + x.cents;
  }

  function render() {
    const box = $('sbSteps');
    box.textContent = '';
    if (!sb) return;
    const res = sb.results[sb.k] || [];
    STEPS.forEach((st, i) => {
      const d = document.createElement('div');
      const r = res[i];
      d.className = 'sb-step' + (i === sb.step && !r ? ' now' : '') + (r ? (r.ok ? ' ok' : ' miss') : '');
      d.innerHTML = `<b>${st.name}</b><span>${r ? (r.ok ? `✓ ${r.c > 0 ? '+' : ''}${r.c}¢` : '✗') : i === sb.step ? '…' : ''}</span>`;
      box.appendChild(d);
    });
    const done = sb.results.slice(0, sb.k);
    if (done.length) {
      const log = document.createElement('div');
      log.className = 'sb-log';
      log.textContent = done.map((r, i) => `${TP.flatLabel(sb.notes[i])} ${r.map(x => (x.ok ? '✓' : '✗')).join('')}`).join(' · ');
      box.appendChild(log);
    }
  }

  async function start() {
    if (sb) { stop('Stopped.'); return; }
    if (!TP.mic.active) {
      try { await TP.mic.start(); } catch (e) { say(TP.micError(e), 'bad'); return; }
    }
    await TP.audio().resume();
    sb = { notes: pickNotes(Number($('sbNote').value), S.sbRounds || 6), k: 0, step: 0, results: [], r: null };
    $('sbStart').textContent = 'Stop';
    note();
  }
  // Hear the next note, then the steps.
  function note() {
    const midi = sb.notes[sb.k], ctx = TP.audio();
    sb.results[sb.k] = [];
    sb.step = 0;
    sb.from = Infinity;
    if (sb.r) sb.r.stop();
    sb.r = TP.makeRun();
    const t = ctx.currentTime + 0.2;
    sb.r.play(midi, 1.4, t, true);
    say(`Note ${sb.k + 1} of ${sb.notes.length}: listen…`);
    render();
    sb.r.at(t + 1.4, () => step(0));
  }
  function step(i) {
    if (!sb) return;
    sb.step = i;
    sb.from = TP.heardTime() + (i ? GAP : 0.1);
    sb.on = null;
    sb.cents = [];
    TP.mic.setLoose(STEPS[i].loose);
    say(STEPS[i].how + ` (${TP.flatLabel(sb.notes[sb.k])}${i === 2 ? ', ' + TP.fmtFingering(FINGERINGS[sb.notes[sb.k]][0]) : ''})…`);
    render();
    clearTimeout(sb.timer);
    sb.timer = setTimeout(() => done(false), (TIMEOUT + GAP) * 1000);
  }
  function done(ok) {
    if (!sb) return;
    clearTimeout(sb.timer);
    const c = sb.cents.length ? Math.round(sb.cents.reduce((a, b) => a + b, 0) / sb.cents.length) : 0;
    sb.results[sb.k][sb.step] = { ok, c };
    render();
    if (sb.step < STEPS.length - 1) { sb.from = Infinity; setTimeout(() => step(sb ? sb.step + 1 : 0), 300); return; }
    // Next note, or the end.
    sb.from = Infinity;
    TP.activity();
    if (++sb.k < sb.notes.length) setTimeout(() => { if (sb) note(); }, 900);
    else finish();
  }
  TP.mic.on(x => {
    if (!sb || x.t < sb.from || x.midi === null) { if (sb && x.t >= sb.from) sb.on = null; return; }
    const st = STEPS[sb.step], off = offOf(x, sb.notes[sb.k], st.octaves);
    if (Math.abs(off) > st.tol) { sb.on = null; sb.cents = []; return; }
    if (sb.on === null) sb.on = x.t;
    sb.cents.push(off);
    if (x.t - sb.on >= HOLD) done(true);
  });
  function finish() {
    const res = sb.results, n = res.length, notes = sb.notes;
    stop();
    const count = i => res.filter(r => r[i] && r[i].ok).length;
    const avg = i => { const c = res.filter(r => r[i] && r[i].ok).map(r => r[i].c); return c.length ? Math.round(c.reduce((a, b) => a + b, 0) / c.length) : null; };
    const tune = c => (c === null ? '' : Math.abs(c) < 8 ? ', in tune' : `, ${Math.abs(c)}¢ ${c > 0 ? 'sharp' : 'flat'} on average`);
    TP.markDone('buzz');
    const all = count(0) + count(1) + count(2);
    say(`Sang ${count(0)} of ${n}${tune(avg(0))} · buzzed ${count(1)} of ${n}${tune(avg(1))} · played ${count(2)} of ${n}${tune(avg(2))}.`
      + (count(0) < count(2) ? ' Singing is the weak link: hum the note before you play it.' : ''), all >= 3 * n * 0.8 ? 'good' : '');
    sb = { notes, results: res, k: n, step: -1 };
    render();
    sb = null;
  }
  function stop(msg) {
    if (!sb) return;
    clearTimeout(sb.timer);
    if (sb.r) sb.r.stop();
    sb = null;
    TP.mic.setLoose(false);
    $('sbStart').textContent = 'Start';
    if (msg !== undefined) { say(msg); $('sbSteps').textContent = ''; }
  }

  $('sbStart').addEventListener('click', e => { e.currentTarget.blur(); start(); });
  $('sbRounds').value = String(S.sbRounds || 6);
  $('sbRounds').addEventListener('change', e => { S.sbRounds = Number(e.target.value); TP.save(); });
  const fill = () => TP.noteMenu($('sbNote'), TP.ALL_MIDI.find(m => m >= S.low + 7 && FINGERINGS[m] && FINGERINGS[m][0] === '') || TP.ALL_MIDI[0]);
  // Joins in with the rest of the Warm-up tab (js/mode-warmup.js).
  const W = TP.modes.warmup, enter = W.enter, leave = W.leave, key = W.key, changed = W.settingsChanged;
  W.enter = function () { enter.call(this); fill(); };
  W.leave = function () { stop(''); leave.call(this); };
  W.settingsChanged = function () { changed.call(this); fill(); };
  W.key = function (k) { if (k === 'escape' && sb) stop('Stopped.'); return key.call(this, k); };
})();
