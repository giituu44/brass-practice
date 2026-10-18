// Rhythm mode: a metronome, and rhythm reading where you tap along with a pattern.
(() => {
  'use strict';
  const { S, save, $, el } = TP;

  // Rhythm cells, a beat or more each. Durations are in sixteenths; 'r' = rest.
  const CELLS = [
    { lvl: 1, beats: 1, ev: [[4]], w: 3 },
    { lvl: 1, beats: 1, ev: [[4, 'r']], w: 0.8 },
    { lvl: 1, beats: 2, ev: [[8]], w: 1.5 },
    { lvl: 1, beats: 3, ev: [[12]], w: 0.4 },
    { lvl: 1, beats: 4, ev: [[16]], w: 0.3, barStart: true },
    { lvl: 2, beats: 1, ev: [[2], [2]], w: 3 },
    { lvl: 2, beats: 1, ev: [[2, 'r'], [2]], w: 1 },
    { lvl: 3, beats: 2, ev: [[6], [2]], w: 2.5 },
    { lvl: 3, beats: 2, ev: [[2], [4], [2]], w: 2 },
    { lvl: 3, beats: 1, ev: [[2], [2, 'r']], w: 0.6 },
    { lvl: 4, beats: 1, ev: [[1], [1], [1], [1]], w: 2 },
    { lvl: 4, beats: 1, ev: [[2], [1], [1]], w: 2 },
    { lvl: 4, beats: 1, ev: [[1], [1], [2]], w: 2 },
    { lvl: 4, beats: 1, ev: [[3], [1]], w: 2 },
  ];
  const LEVELS = ['Quarters & halves', 'Eighths', 'Dotted & syncopated', 'Sixteenths'];
  const PLAY_NOTE = 46; // B♭2, for "Hear it"

  // ---------- pattern ----------
  function weighted(pool, weight) {
    let r = Math.random() * pool.reduce((a, c) => a + weight(c), 0);
    for (const c of pool) if ((r -= weight(c)) <= 0) return c;
    return pool[pool.length - 1];
  }

  function generate() {
    const lvl = S.rhythmLevel, beats = S.beats;
    let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const ev = [];
      let usesLevel = lvl === 1;
      for (let bar = 0; bar < S.rhythmBars; bar++) {
        let beat = 0;
        while (beat < beats) {
          const pool = CELLS.filter(c => c.lvl <= lvl && c.beats <= beats - beat
            && (!c.barStart || (beat === 0 && beats === 4)));
          // New material for the chosen level comes up more often.
          const c = weighted(pool, c => c.w * (c.lvl === lvl && lvl > 1 ? 2.5 : 1));
          if (c.lvl === lvl) usesLevel = true;
          let pos = (bar * beats + beat) * 4;
          for (const [dur, r] of c.ev) {
            ev.push({ pos, dur, rest: r === 'r' });
            pos += dur;
          }
          beat += c.beats;
        }
      }
      const notes = ev.filter(e => !e.rest).length;
      best = ev;
      if (usesLevel && !ev[0].rest && notes >= S.rhythmBars * beats * 0.6) break;
    }
    return best;
  }

  // ---------- drawing ----------
  const UNIT = 17, LEFT = 46, BAR_PAD = 14, SCALE = 1.1, STEM = 30;
  const svg = $('rhStaff');
  let pattern = [];

  const barUnits = () => S.beats * 4;
  const xOf = pos => LEFT + 10 + pos * UNIT + Math.floor(pos / barUnits()) * BAR_PAD;

  function drawRhythm() {
    svg.textContent = '';
    const bars = S.rhythmBars, total = bars * barUnits();
    const width = LEFT + total * UNIT + (bars - 1) * BAR_PAD + 14;
    svg.setAttribute('viewBox', `0 -46 ${width} 80`);
    // Shrink to fit the stage when we can; only scroll for very long rhythms.
    const room = svg.parentElement.clientWidth;
    const k = room ? Math.min(SCALE, Math.max(0.7, room / width)) : SCALE;
    svg.style.width = width * k + 'px';
    const add = (tag, a, t) => svg.appendChild(el(tag, a, t));

    add('line', { x1: 6, x2: width - 4, y1: 0, y2: 0, class: 'staff-line' });
    add('text', { x: 24, y: -3, 'font-size': 22, 'text-anchor': 'middle', class: 'timesig' }, S.beats);
    add('text', { x: 24, y: 19, 'font-size': 22, 'text-anchor': 'middle', class: 'timesig' }, 4);
    for (let b = 1; b <= bars; b++) {
      const x = LEFT + b * barUnits() * UNIT + (b - 1) * BAR_PAD + 2;
      if (b < bars) add('line', { x1: x, x2: x, y1: -12, y2: 12, class: 'barline' });
      else {
        add('line', { x1: x - 4, x2: x - 4, y1: -12, y2: 12, class: 'barline' });
        add('rect', { x: x - 1, y: -12, width: 3, height: 24, class: 'barline-thick' });
      }
    }

    // Beam groups: notes shorter than a quarter within the same beat.
    const groups = [];
    let cur = null;
    pattern.forEach((e, i) => {
      const beamable = !e.rest && e.dur < 4;
      const beat = Math.floor(e.pos / 4);
      if (beamable && cur && cur.beat === beat) cur.items.push(i);
      else if (beamable) groups.push(cur = { beat, items: [i] });
      else cur = null;
    });
    const beamed = new Set(groups.filter(g => g.items.length > 1).flatMap(g => g.items));

    pattern.forEach((e, i) => {
      const x = xOf(e.pos);
      const g = el('g', { class: 'rh-ev' + (e.result ? ' ' + e.result.grade : '') + (e.active ? ' active' : '') });
      svg.appendChild(g);
      const put = (tag, a, t) => g.appendChild(el(tag, a, t));
      if (e.rest) {
        if (e.dur === 4) put('text', { x, y: 11, 'font-size': 30, 'text-anchor': 'middle', class: 'rest' }, '𝄽');
        else put('text', { x, y: 9, 'font-size': 28, 'text-anchor': 'middle', class: 'rest' }, '𝄾');
        return;
      }
      const open = e.dur >= 8;
      put('ellipse', { cx: x, cy: 0, rx: 6.2, ry: 4.4, transform: `rotate(-20 ${x} 0)`, class: open ? 'head open' : 'head' });
      if (e.dur === 6 || e.dur === 12 || e.dur === 3) put('circle', { cx: x + 11, cy: -3, r: 1.8, class: 'dot' });
      if (e.dur < 16) put('line', { x1: x + 5.6, x2: x + 5.6, y1: -1.5, y2: -STEM, class: 'stem' });
      // Lone eighths and sixteenths get flags.
      if (e.dur < 4 && !beamed.has(i)) {
        const sx = x + 5.6;
        const flags = e.dur === 1 ? 2 : 1;
        for (let f = 0; f < flags; f++) {
          const y = -STEM + f * 7;
          put('path', { d: `M${sx} ${y} c1 6 9 7 7 17`, class: 'flag' });
        }
      }
      if (e.result) {
        put('text', { x, y: 28, 'font-size': 10, 'text-anchor': 'middle', class: 'offset' },
          e.result.grade === 'miss' ? 'miss' : (e.result.ms > 0 ? '+' : '') + e.result.ms);
      }
    });

    // Beams: primary across the group, secondary between neighbouring sixteenths
    // (or a short stub for a lone sixteenth, e.g. in a dotted-eighth pair).
    for (const grp of groups.filter(g => g.items.length > 1)) {
      const xs = grp.items.map(i => xOf(pattern[i].pos) + 5.6);
      svg.appendChild(el('rect', { x: xs[0], y: -STEM, width: xs[xs.length - 1] - xs[0] + 1, height: 4.5, class: 'beam' }));
      grp.items.forEach((i, k) => {
        if (pattern[i].dur !== 1) return;
        const nextIs16 = k + 1 < grp.items.length && pattern[grp.items[k + 1]].dur === 1;
        const prevIs16 = k > 0 && pattern[grp.items[k - 1]].dur === 1;
        if (nextIs16) {
          svg.appendChild(el('rect', { x: xs[k], y: -STEM + 7, width: xs[k + 1] - xs[k] + 1, height: 4.5, class: 'beam' }));
        } else if (!prevIs16) {
          const x0 = k > 0 ? xs[k] - 8 : xs[k];
          svg.appendChild(el('rect', { x: x0, y: -STEM + 7, width: 9, height: 4.5, class: 'beam' }));
        }
      });
    }
  }

  // ---------- beat dots ----------
  const dots = $('rhDots');
  function renderDots() {
    dots.textContent = '';
    for (let i = 0; i < S.beats; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i === 0 ? ' first' : '');
      dots.appendChild(d);
    }
  }
  function lightDot(i) {
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
  }

  // ---------- playback ----------
  const status = $('rhStatus');
  function say(text, cls = '') {
    status.className = 'feedback' + (cls ? ' ' + cls : '');
    status.textContent = text || ' ';
  }

  // What's running: the metronome, or a pattern being played ('test' or 'hear').
  let running = null;

  // Run fn when audio time t is actually heard.
  function at(t, fn) {
    const delay = Math.max(0, (t - TP.heardTime()) * 1000);
    running.timers.push(setTimeout(fn, delay));
  }

  function stopAll() {
    if (!running) return;
    running.nodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } });
    running.timers.forEach(clearTimeout);
    clearInterval(running.interval);
    const was = running.kind;
    running = null;
    lightDot(-1);
    pattern.forEach(e => { e.active = false; });
    if (was !== 'metro') {
      drawRhythm();
      say('Press Space (or Start) for a one-bar count-in, then tap each note.');
    }
    renderButtons();
  }

  function renderButtons() {
    $('rhMetro').firstChild.textContent = running && running.kind === 'metro' ? 'Stop metronome ' : 'Start metronome ';
    $('rhStart').firstChild.textContent = running && running.kind === 'test' ? 'Stop ' : 'Start ';
    $('rhPad').classList.toggle('live', !!(running && running.kind === 'test'));
  }

  function startMetronome() {
    stopAll();
    const ctx = TP.audio();
    running = { kind: 'metro', nodes: [], timers: [] };
    let next = ctx.currentTime + 0.1, beat = 0;
    const tick = () => {
      while (next < ctx.currentTime + 0.15) {
        const b = beat;
        running.nodes.push(TP.click(next, b === 0));
        at(next, () => lightDot(b));
        next += 60 / S.tempo;
        beat = (beat + 1) % S.beats;
      }
      running.nodes = running.nodes.slice(-8);
      running.timers = running.timers.slice(-8);
    };
    tick();
    running.interval = setInterval(tick, 25);
    renderButtons();
  }

  // One bar of count-in, then the pattern. 'test' collects taps; 'hear' plays it on tuba.
  async function playPattern(kind) {
    stopAll();
    const ctx = TP.audio();
    if (kind === 'hear') await TP.preload([PLAY_NOTE]);
    pattern.forEach(e => { delete e.result; e.active = false; });
    drawRhythm();

    const spb = 60 / S.tempo, unit = spb / 4;
    const t0 = ctx.currentTime + 0.3;
    const tp = t0 + S.beats * spb;
    const total = S.rhythmBars * barUnits();
    const tEnd = tp + total * unit;
    running = { kind, nodes: [], timers: [], tp, unit, taps: [], tapFrom: tp - spb / 2 };

    for (let b = 0; b < S.beats; b++) {
      const t = t0 + b * spb;
      running.nodes.push(TP.click(t, b === 0));
      at(t, () => { lightDot(b); say(`${b + 1}`, 'count'); });
    }
    const totalBeats = S.rhythmBars * S.beats;
    for (let b = 0; b < totalBeats; b++) {
      const t = tp + b * spb;
      if (S.clickDuring || kind === 'hear') running.nodes.push(TP.click(t, b % S.beats === 0));
      at(t, () => lightDot(b % S.beats));
    }
    at(tp, () => say(kind === 'test' ? 'Tap!' : 'Listen…'));
    pattern.forEach(e => {
      if (e.rest) return;
      const t = tp + e.pos * unit;
      if (kind === 'hear') {
        TP.playMidi(PLAY_NOTE, Math.min(e.dur * unit * 0.9, 1.2), t).then(n => running && running.nodes.push(n));
      }
      at(t, () => { pattern.forEach(p => { p.active = p === e; }); drawRhythm(); });
    });
    at(tEnd + 0.35, () => {
      const r = running;
      stopAll();
      if (kind === 'test') evaluate(r); else say('Press Space to try it.');
    });
    renderButtons();
  }

  function tap(perfTime) {
    $('rhPad').classList.add('hit');
    setTimeout(() => $('rhPad').classList.remove('hit'), 90);
    if (!running || running.kind !== 'test') return;
    const t = TP.inputTime(perfTime);
    if (t >= running.tapFrom) running.taps.push(t);
  }

  // Match each note to the nearest tap and grade how far off it was.
  function evaluate(r) {
    TP.activity();
    TP.markDone('rhythm');
    const notes = pattern.filter(e => !e.rest).map(e => ({ e, t: r.tp + e.pos * r.unit }));
    let minGap = Infinity;
    for (let i = 1; i < notes.length; i++) minGap = Math.min(minGap, notes[i].t - notes[i - 1].t);
    const tol = Math.min(0.2, Math.max(0.06, (isFinite(minGap) ? minGap : 1) / 2));
    const used = new Set();
    const errs = [];
    let great = 0, hits = 0;
    for (const n of notes) {
      let best = -1, bestD = Infinity;
      r.taps.forEach((t, j) => {
        if (!used.has(j) && Math.abs(t - n.t) < Math.abs(bestD)) { best = j; bestD = t - n.t; }
      });
      if (best >= 0 && Math.abs(bestD) <= tol) {
        used.add(best);
        const ms = Math.round(bestD * 1000);
        const grade = Math.abs(ms) <= 35 ? 'great' : Math.abs(ms) <= 75 ? 'good' : 'off';
        n.e.result = { grade, ms };
        errs.push(ms);
        hits++;
        if (grade === 'great') great++;
      } else {
        n.e.result = { grade: 'miss' };
      }
    }
    const extra = r.taps.length - used.size;
    drawRhythm();
    const avg = errs.length ? Math.round(errs.reduce((a, b) => a + b, 0) / errs.length) : 0;
    let msg = `${hits}/${notes.length} notes hit, ${great} spot on`;
    if (errs.length) msg += ` · on average ${Math.abs(avg)} ms ${avg > 0 ? 'late' : 'early'}`;
    if (extra) msg += ` · ${extra} extra tap${extra === 1 ? '' : 's'}`;
    say(msg + '. Space to retry, N for a new rhythm.', hits === notes.length && great >= notes.length * 0.7 ? 'good' : '');
  }

  function newPattern() {
    stopAll();
    pattern = generate();
    drawRhythm();
    say('Press Space (or Start) for a one-bar count-in, then tap each note.');
  }

  // ---------- controls ----------
  const tempo = $('rhTempo');
  function setTempo(v) {
    S.tempo = Math.max(40, Math.min(208, Math.round(v)));
    tempo.value = S.tempo;
    $('rhTempoOut').textContent = S.tempo;
    save();
  }
  tempo.addEventListener('input', () => setTempo(Number(tempo.value)));
  $('rhSlower').addEventListener('click', () => setTempo(S.tempo - 4));
  $('rhFaster').addEventListener('click', () => setTempo(S.tempo + 4));

  const levelSel = $('rhLevel');
  LEVELS.forEach((name, i) => levelSel.add(new Option(`${i + 1}. ${name}`, i + 1)));
  function syncControls() {
    setTempo(S.tempo);
    $('rhBeats').value = S.beats;
    levelSel.value = S.rhythmLevel;
    $('rhBars').value = S.rhythmBars;
    $('rhClick').checked = S.clickDuring;
  }
  for (const id of ['rhBeats', 'rhLevel', 'rhBars', 'rhClick']) {
    $(id).addEventListener('change', e => {
      S.beats = Number($('rhBeats').value);
      S.rhythmLevel = Number(levelSel.value);
      S.rhythmBars = Number($('rhBars').value);
      S.clickDuring = $('rhClick').checked;
      save();
      e.target.blur();
      renderDots();
      if (id !== 'rhClick') newPattern();
    });
  }
  $('rhMetro').addEventListener('click', () => (running && running.kind === 'metro' ? stopAll() : startMetronome()));
  $('rhStart').addEventListener('click', () => (running && running.kind === 'test' ? stopAll() : playPattern('test')));
  $('rhHear').addEventListener('click', () => playPattern('hear'));
  $('rhNew').addEventListener('click', newPattern);
  $('rhPad').addEventListener('pointerdown', e => {
    e.preventDefault();
    if (running && running.kind === 'test') tap(e.timeStamp); else playPattern('test');
  });

  TP.modes.rhythm = {
    panel: 'panel-rhythm',
    valves: false,
    enter() {
      syncControls();
      renderDots();
      if (!pattern.length) newPattern(); else drawRhythm();
    },
    leave() { stopAll(); },
    settingsChanged() {},
    preloadNotes: () => [PLAY_NOTE],
    key(k, e) {
      if (k === ' ' || k === 'enter') {
        if (running && running.kind === 'test') tap(e.timeStamp); else playPattern('test');
        return true;
      }
      if (k === 'h') { playPattern('hear'); return true; }
      if (k === 'n') { newPattern(); return true; }
      if (k === 'm') { running && running.kind === 'metro' ? stopAll() : startMetronome(); return true; }
      if (k === '+' || k === '=') { setTempo(S.tempo + 4); return true; }
      if (k === '-') { setTempo(S.tempo - 4); return true; }
      if (k === 'escape') { stopAll(); return true; }
      return false;
    },
  };
})();
