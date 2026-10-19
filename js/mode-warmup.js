// Warm-up tab: the fundamentals. Breathing, mouthpiece buzzing, long tones with a
// dynamic shape, tonguing against the click, lip slurs (built in mode-intonation.js)
// and extending your range. Everything but breathing listens through the mic.
(() => {
  'use strict';
  const { S, store, $ } = TP;

  // The mic, started here if it isn't on yet; true once it's listening.
  async function micOn() {
    if (TP.mic.active) return true;
    try { await TP.mic.start(); return true; } catch (e) { TP.toast(TP.micError(e), 7000); return false; }
  }
  const startMic = micOn;

  // ---------- long-tone challenge ----------
  // Waits for the note, then times how long it's held (short dropouts forgiven)
  // and how steady the pitch is.
  let lt = null;   // { midi, goal, phase: 'wait'|'hold', start, last, cents: [] }
  const ltNote = $('ltNote'), ltGoal = $('ltGoal');
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


  // ---------- breathing: a paced in / hold / out cycle ----------
  // A pattern is counts of one second: "4-4-8" = in for 4, hold for 4, out for 8;
  // four numbers make a box (in, hold, out, hold).
  const BREATHS = { '4-0-8': 'In 4 · out 8', '4-4-8': 'In 4 · hold 4 · out 8', '4-0-12': 'In 4 · out 12', '2-0-16': 'In 2 · out 16', '4-4-4-4': 'Box: 4 in · 4 hold · 4 out · 4 hold' };
  let br = null;
  for (const [k, v] of Object.entries(BREATHS)) $('brPattern').add(new Option(v, k));
  $('brPattern').value = BREATHS[S.breathPattern] ? S.breathPattern : '4-0-8';
  $('brRounds').value = String(S.breathRounds || 6);
  $('brPattern').addEventListener('change', e => { S.breathPattern = e.target.value; TP.save(); });
  $('brRounds').addEventListener('change', e => { S.breathRounds = Number(e.target.value); TP.save(); });
  const PHASE = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out' };
  function brStop(msg, done) {
    if (!br) return;
    br.stop();
    br = null;
    $('brStart').textContent = 'Start';
    $('brPhase').textContent = msg || ' ';
    $('brCount').textContent = '';
    $('brCircle').style.transform = 'scale(0.35)';
    if (done) { TP.activity(); TP.markDone('breathing'); }
  }
  function brStart() {
    if (br) { brStop('Stopped.'); return; }
    const n = (S.breathPattern || '4-0-8').split('-').map(Number);
    const names = n.length === 4 ? ['in', 'hold', 'out', 'hold'] : ['in', 'hold', 'out'];
    const seq = names.map((p, i) => [p, n[i]]).filter(p => p[1] > 0);
    const ctx = TP.audio(), r = TP.makeRun(), rounds = S.breathRounds || 6;
    let t = ctx.currentTime + 0.6;
    for (let k = 0; k < rounds; k++) {
      for (const [ph, len] of seq) {
        for (let c = 0; c < len; c++) {
          if ($('brClick').checked) r.click(t + c, c === 0);
          r.at(t + c, () => {
            // The circle grows while you breathe in and shrinks while you breathe out.
            const frac = ph === 'in' ? (c + 1) / len : ph === 'out' ? 1 - (c + 1) / len : null;
            if (frac !== null) $('brCircle').style.transform = `scale(${0.35 + 0.65 * frac})`;
            $('brPhase').textContent = PHASE[ph];
            $('brCount').textContent = `${c + 1} · round ${k + 1} of ${rounds}`;
          });
        }
        t += len;
      }
    }
    r.at(t, () => brStop(`Done — ${rounds} rounds. Pick up the horn while the air is free.`, true));
    br = r;
    $('brStart').textContent = 'Stop';
  }
  $('brStart').addEventListener('click', brStart);

  // ---------- mouthpiece buzzing: follow a pitch line ----------
  // Hear the line, then buzz it on the mouthpiece alone; your pitch is drawn over it.
  const BUZZES = {
    siren: { name: 'Siren (glide up and back)', dur: 6, at: (t, b) => b + 7 * (1 - Math.cos(2 * Math.PI * t / 6)) / 2 },
    hold: { name: 'Hold one note', dur: 4, at: (t, b) => b },
    slide: { name: 'Slide up a fourth and back', dur: 6, at: (t, b) => b + (t < 1.5 ? 0 : t < 3 ? 5 * (t - 1.5) / 1.5 : t < 4.5 ? 5 : 5 - 5 * (t - 4.5) / 1.5) },
    steps: { name: 'Five-note scale up and down', dur: 6.75, steps: [0, 2, 4, 5, 7, 5, 4, 2, 0], at: (t, b) => b + [0, 2, 4, 5, 7, 5, 4, 2, 0][Math.min(8, Math.floor(t / 0.75))] },
  };
  for (const [k, v] of Object.entries(BUZZES)) $('bzPattern').add(new Option(v.name, k));
  $('bzPattern').value = BUZZES[S.buzzPattern] ? S.buzzPattern : 'siren';
  $('bzPattern').addEventListener('change', e => { S.buzzPattern = e.target.value; TP.save(); drawBuzz(null); });
  let bz = null;
  function bzSay(text, cls = '') { $('bzMsg').className = 'feedback' + (cls ? ' ' + cls : ''); $('bzMsg').textContent = text || ' '; }
  // A smooth glide on a soft synth (the samples can't glide), for siren and slide.
  function glide(pat, base, t0) {
    const ctx = TP.audio(), o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    for (let k = 0; k <= 60; k++) {
      const t = pat.dur * k / 60;
      o.frequency.setValueAtTime(TP.hz(pat.at(t, base) - TP.inst().transpose), t0 + t);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.1);
    g.gain.setValueAtTime(0.18, t0 + pat.dur - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + pat.dur);
    o.connect(lp); lp.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + pat.dur + 0.05);
    TP.outputUntil = Math.max(TP.outputUntil, t0 + pat.dur);
    return o;
  }
  function drawBuzz(run) {
    const pat = BUZZES[$('bzPattern').value], base = Number($('bzNote').value) || 41;
    const g = $('bzGraph');
    g.textContent = '';
    const tops = [];
    for (let k = 0; k <= 60; k++) tops.push(pat.at(pat.dur * k / 60, base));
    const lo = Math.min(...tops) - 3, hi = Math.max(...tops) + 3;
    const X = t => 6 + (t / pat.dur) * 288, Y = m => 6 + (hi - m) / (hi - lo) * 98;
    for (let m = Math.ceil(lo); m <= hi; m++) {
      if (m % 12 === base % 12) {
        g.appendChild(TP.el('line', { x1: 6, x2: 294, y1: Y(m), y2: Y(m), class: 'mid' }));
        g.appendChild(TP.el('text', { x: 296, y: Y(m) + 3, class: 'axis' }, TP.flatLabel(m)));
      }
    }
    g.appendChild(TP.el('polyline', { points: tops.map((m, k) => `${X(pat.dur * k / 60)},${Y(m)}`).join(' '), class: 'target' }));
    if (!run) return;
    for (const p of run.pts) {
      const off = Math.abs(p.m - pat.at(p.t, base)) * 100;
      g.appendChild(TP.el('circle', { cx: X(p.t), cy: Y(Math.max(lo, Math.min(hi, p.m))), r: 2, class: 'pt' + (off > 50 ? ' off' : off > 25 ? ' close' : '') }));
    }
  }
  async function bzStart() {
    if (bz) { bzStop('Stopped.'); return; }
    if (!await micOn()) { bzSay('Buzzing needs the microphone.', 'bad'); return; }
    const ctx = TP.audio();
    await ctx.resume();
    const pat = BUZZES[$('bzPattern').value], base = Number($('bzNote').value);
    const r = TP.makeRun();
    // Listen to the line, two clicks, then buzz it.
    const tHear = ctx.currentTime + 0.3;
    if (pat.steps) pat.steps.forEach((s, k) => r.play(base + s, 0.7, tHear + k * 0.75, true));
    else if ($('bzPattern').value === 'hold') r.play(base, pat.dur, tHear, true);
    else r.add(glide(pat, base, tHear));
    const tGo = tHear + pat.dur + 0.9;
    r.click(tGo - 1, false);
    r.click(tGo - 0.5, false);
    bz = { r, pat, base, t0: tGo, pts: [], heard: 0, frames: 0 };
    TP.mic.setLoose(true);
    bzSay('Listen…');
    r.at(tGo - 1, () => bzSay('Ready…'));
    r.at(tGo, () => bzSay('Buzz!'));
    r.at(tGo + pat.dur + 0.15, bzFinish);
    $('bzStart').textContent = 'Stop';
    drawBuzz(bz);
  }
  function bzStop(msg) {
    if (!bz) return;
    bz.r.stop();
    bz = null;
    TP.mic.setLoose(false);
    $('bzStart').textContent = 'Start';
    if (msg !== undefined) bzSay(msg);
  }
  TP.mic.on(x => {
    if (!bz) return;
    const t = x.t - bz.t0;
    if (t < 0 || t > bz.pat.dur) return;
    bz.frames++;
    if (x.midi === null) return;
    bz.pts.push({ t, m: x.midi + x.cents / 100 });
    if (bz.pts.length % 3 === 0) drawBuzz(bz);
  });
  function bzFinish() {
    const run = bz;
    bzStop();
    drawBuzz(run);
    TP.activity();
    if (run.pts.length < 5) { bzSay('No buzz heard. Buzz a little louder, close to the mic (or raise Mic sensitivity in Settings).', 'bad'); return; }
    const offs = run.pts.map(p => Math.abs(p.m - run.pat.at(p.t, run.base)) * 100);
    const on = offs.filter(c => c <= 50).length;
    const avg = Math.round(offs.reduce((a, b) => a + b, 0) / offs.length);
    const heard = Math.round(run.pts.length / Math.max(1, run.frames) * 100);
    TP.markDone('buzz');
    bzSay(`On the line ${Math.round(on / offs.length * 100)}% of the time · ${avg}¢ off on average · pitch heard ${heard}% of the time`
      + (heard < 60 ? ' (a steadier buzz helps the mic)' : ''), on / offs.length >= 0.7 ? 'good' : '');
  }
  $('bzStart').addEventListener('click', bzStart);

  // ---------- range: extend your highest and lowest clean notes ----------
  // A note counts as clean once it's held a second within 35¢. Kept per instrument.
  let rg = null;
  const rec = () => store.rangeRec;
  const day = at => new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  function rgRender() {
    const r = rec(), name = m => TP.flatLabel(m);
    const parts = [];
    if (r.top !== undefined) parts.push(`Highest clean note: <b>${name(r.top)}</b>` + (r.topAt ? ` (${day(r.topAt)})` : ''));
    if (r.bottom !== undefined) parts.push(`lowest: <b>${name(r.bottom)}</b>` + (r.bottomAt ? ` (${day(r.bottomAt)})` : ''));
    const first = (r.hist || [])[0];
    if (first && (first.top !== r.top || first.bottom !== r.bottom)) {
      parts.push(`since ${day(first.at)}: ${first.bottom !== undefined ? name(first.bottom) : '?'}–${first.top !== undefined ? name(first.top) : '?'}`);
    }
    $('rgBest').innerHTML = parts.length ? parts.join(' · ') : 'Not measured yet: press ↑ or ↓ to find your range.';
  }
  function rgSay(text, cls = '') { $('rgMsg').className = 'feedback' + (cls ? ' ' + cls : ''); $('rgMsg').textContent = text || ' '; }
  async function rgStart(dir) {
    if (rg) { rgStop('Stopped.'); return; }
    if (!await micOn()) { rgSay('The range builder needs the microphone.', 'bad'); return; }
    const r = rec(), all = TP.ALL_MIDI;
    // Start on your best so far (or the edge of your practice range) and go one note further each time.
    const start = dir > 0 ? (r.top !== undefined ? r.top : S.high) : (r.bottom !== undefined ? r.bottom : S.low);
    rg = { dir, target: Math.max(all[0], Math.min(all[all.length - 1], start)), got: [] };
    $('rgUp').disabled = $('rgDown').disabled = true;
    $('rgStop').hidden = false;
    rgNext();
  }
  function rgNext() {
    const m = rg.target;
    rg.since = null;
    rg.deadline = TP.heardTime() + 14;
    $('rgNote').textContent = TP.flatLabel(m);
    $('rgFing').textContent = FINGERINGS[m] ? FINGERINGS[m].map(TP.fmtFingering).join(' or ') : '';
    rgSay(`Play ${TP.flatLabel(m)} and hold it for a second…`);
    TP.playMidi(m, 1.2);
    clearTimeout(rg.timer);
    rg.timer = setTimeout(() => { if (rg) rgStop(rg.got.length ? `Not this time. Today you got to ${TP.flatLabel(rg.got[rg.got.length - 1])}.` : 'Not this time — try again after a rest.'); }, 15500);
  }
  function rgStop(msg) {
    if (!rg) return;
    clearTimeout(rg.timer);
    const got = rg.got;
    rg = null;
    $('rgUp').disabled = $('rgDown').disabled = false;
    $('rgStop').hidden = true;
    if (got.length) TP.activity();
    rgSay(msg || '');
    rgRender();
  }
  TP.mic.on(x => {
    if (!rg || rg.wait) return;
    const ok = x.midi === rg.target && Math.abs(x.cents) <= 35;
    if (!ok) { rg.since = null; return; }
    if (rg.since === null) rg.since = x.t;
    if (x.t - rg.since < 1.0) return;
    // Clean: keep it, and try one note further.
    const r = rec(), m = rg.target, at = Date.now();
    rg.got.push(m);
    let record = false;
    if (rg.dir > 0 && (r.top === undefined || m > r.top)) { r.top = m; r.topAt = at; record = true; }
    if (rg.dir < 0 && (r.bottom === undefined || m < r.bottom)) { r.bottom = m; r.bottomAt = at; record = true; }
    if (record) {
      r.hist = r.hist || [];
      r.hist.push({ at, top: r.top, bottom: r.bottom });
      if (r.hist.length > 60) r.hist.splice(1, r.hist.length - 60);
    }
    TP.save();
    rgRender();
    const next = m + rg.dir;
    if (!FINGERINGS[next] && !TP.ALL_MIDI.includes(next)) { rgStop(`${TP.flatLabel(m)} — that's the edge of the chart. Well played!`); return; }
    rgSay(`✓ ${TP.flatLabel(m)}${record ? ' — a new record!' : ''} Next: ${TP.flatLabel(next)}.`, 'good');
    rg.wait = true;
    clearTimeout(rg.timer);
    setTimeout(() => { if (!rg) return; rg.wait = false; rg.target = next; rgNext(); }, 1400);
  });
  $('rgUp').addEventListener('click', () => rgStart(1));
  $('rgDown').addEventListener('click', () => rgStart(-1));
  $('rgStop').addEventListener('click', () => rgStop('Stopped.'));

  function fillWarmupNotes() {
    TP.fillNoteSelects();
    const sel = $('bzNote'), keep = sel.value;
    sel.textContent = '';
    for (const m of TP.ALL_MIDI) sel.add(new Option(TP.flatLabel(m), m));
    // Default: an open note low in the middle of your range (buzzing sits low and easy).
    const def = TP.ALL_MIDI.find(m => m >= S.low + 5 && FINGERINGS[m] && FINGERINGS[m][0] === '') || TP.ALL_MIDI[0];
    sel.value = keep && TP.ALL_MIDI.includes(Number(keep)) ? keep : def;
  }
  $('bzNote').addEventListener('change', () => drawBuzz(null));

  TP.modes.warmup = {
    panel: 'panel-warmup',
    valves: false,
    enter() { fillWarmupNotes(); rgRender(); drawBuzz(null); },
    leave() {
      if (lt) ltFinish();
      if (tg) tgStop('');
      brStop(' ');
      bzStop('');
      rgStop('');
      if (S.input !== 'mic' && TP.mic.active) TP.mic.stop();
    },
    settingsChanged() { fillWarmupNotes(); rgRender(); },
    preloadNotes: () => [],
    key(k) {
      if (k === 'escape') { brStop('Stopped.'); bzStop('Stopped.'); rgStop('Stopped.'); if (lt) ltFinish(); if (tg) tgStop(''); return true; }
      return false;
    },
  };
})();
