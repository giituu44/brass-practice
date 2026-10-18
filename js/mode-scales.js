// Scales mode: a scale up and down, written with its key signature. Play along
// with a metronome (the fingering you hold on each beat is graded), or step
// through at your own pace with Space.
(() => {
  'use strict';
  const { S, store, save, $ } = TP;

  const TYPES = {
    major:     { name: 'Major',          up: [2, 2, 1, 2, 2, 2, 1] },
    natural:   { name: 'Natural minor',  up: [2, 1, 2, 2, 1, 2, 2], minor: true },
    harmonic:  { name: 'Harmonic minor', up: [2, 1, 2, 2, 1, 3, 1], minor: true },
    melodic:   { name: 'Melodic minor',  up: [2, 1, 2, 2, 2, 2, 1], down: [2, 1, 2, 2, 1, 2, 2], minor: true },
    chromatic: { name: 'Chromatic',      up: Array(12).fill(1) },
  };
  // Sharp names too, for minor keys like G♯ minor and D♯ minor.
  const TONICS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  // Keys that would need double sharps/flats get their usual enharmonic name.
  const ENHARMONIC = { 'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb', Db: 'C#', Gb: 'F#', 'C#': 'Db' };

  const SPACING = 34, BAR_GAP = 12, SCALE = 1.2, PER_BAR = 4;
  const svg = $('scStaff');
  const scroller = $('scScroll');
  const feedback = $('scFeedback');

  // ---------- building the scale ----------
  function startOptions() {
    const pc = TP.tonicPc(S.scaleKey), span = 12 * S.scaleOctaves;
    return TP.ALL_MIDI.filter(m => m % 12 === pc && m + span <= TP.ALL_MIDI[TP.ALL_MIDI.length - 1]);
  }
  // The start that keeps most of the scale inside your practice range.
  function bestStart(opts) {
    const span = 12 * S.scaleOctaves;
    const score = m => Math.min(m + span, S.high) - Math.max(m, S.low) - Math.abs(m + span / 2 - TP.inst().center) / 100;
    return opts.reduce((a, b) => (score(b) > score(a) ? b : a), opts[0]);
  }

  // Up a diatonic scale, each degree on the next letter name (so F♯ major gets E♯).
  function diatonicRun(tonic, letter, steps) {
    let midi = tonic, li = TP.LETTERS.indexOf(letter);
    const notes = [TP.spellAs(midi, letter)];
    for (let o = 0; o < S.scaleOctaves; o++) {
      for (const s of steps) {
        midi += s;
        li = (li + 1) % 7;
        notes.push(TP.spellAs(midi, TP.LETTERS[li]));
      }
    }
    return notes;
  }
  // Chromatic: sharps going up, flats coming down; the tonic keeps its own name.
  function chromaticRun(tonic, letter, pref) {
    const notes = [];
    for (let i = 0; i <= 12 * S.scaleOctaves; i++) {
      notes.push(i % 12 === 0 ? TP.spellAs(tonic + i, letter) : TP.spell(tonic + i, pref));
    }
    return notes;
  }

  function buildRun() {
    const t = TYPES[S.scaleType], letter = S.scaleKey[0], tonic = S.scaleStart;
    const chrom = S.scaleType === 'chromatic';
    const up = chrom ? chromaticRun(tonic, letter, 'sharps') : diatonicRun(tonic, letter, t.up);
    const down = chrom ? chromaticRun(tonic, letter, 'flats') : diatonicRun(tonic, letter, t.down || t.up);
    return up.concat(down.reverse().slice(1));
  }
  // Chromatic scales are written without a key signature.
  const fifths = () => (S.scaleType === 'chromatic' ? 0 : TP.keyFifths(S.scaleKey, TYPES[S.scaleType].minor) || 0);
  const scaleId = () => `${S.scaleKey} ${S.scaleType} ${S.scaleOctaves}`;
  const scaleName = () => `${TP.tonicName(S.scaleKey)} ${TYPES[S.scaleType].name.toLowerCase()}`;

  // ---------- state & drawing ----------
  let run = [], idx = 0, states = [], mistakes = 0, startedAt = 0, finished = false;
  let flow = null;   // the play-along run while it's going

  function layout() {
    const left = TP.staffStart(fifths()) + 6;
    const xOf = i => left + i * SPACING + Math.floor(i / PER_BAR) * BAR_GAP + SPACING / 2;
    const bars = [];
    for (let i = PER_BAR; i < run.length; i += PER_BAR) bars.push((xOf(i - 1) + xOf(i)) / 2);
    const final = xOf(run.length - 1) + SPACING / 2 + 6;
    return { xOf, bars, final, width: final + 8 };
  }

  function draw() {
    const { xOf, bars, final, width } = layout();
    const accs = TP.shownAccidentals(run, fifths(), i => Math.floor(i / PER_BAR));
    const showCursor = !finished && (!flow || flow.started);
    const items = run.map((note, i) => ({
      note,
      x: xOf(i),
      acc: accs[i],
      cls: i === idx && showCursor ? 'current' : states[i],
      cursor: i === idx && showCursor,
      text: S.scaleShowFingerings ? (FINGERINGS[note.midi][0] || '0') : '',
    }));
    const lo = Math.min(...run.map(n => n.midi)), hi = Math.max(...run.map(n => n.midi));
    TP.drawStaff(svg, width, items, TP.stepRange(lo, hi), { fifths: fifths(), bars, final });
    // Shrink a little to fit if that's enough; otherwise scroll sideways.
    const fit = scroller.clientWidth / width;
    const scale = fit >= 0.9 ? Math.min(SCALE, fit) : SCALE;
    svg.style.width = width * scale + 'px';
    if (!finished) scroller.scrollLeft = xOf(idx) * scale - scroller.clientWidth / 2;
  }

  function say(text, cls = '') {
    feedback.className = 'feedback' + (cls ? ' ' + cls : '');
    feedback.textContent = text || ' ';
  }

  function renderBest() {
    const rec = store.scales[scaleId()];
    const parts = [];
    if (rec && rec.flowBest) parts.push(`Clean play-along up to ${rec.flowBest} bpm`);
    if (rec && rec.best) parts.push(`best clean step-through ${(rec.best / 1000).toFixed(1)}s`);
    if (rec && !parts.length) parts.push(`${rec.runs} run${rec.runs === 1 ? '' : 's'}, no clean run yet`);
    const text = parts.join(' · ');
    $('scBest').textContent = text ? text[0].toUpperCase() + text.slice(1) : 'Not played yet';
  }

  function intro() {
    if (S.scaleMode === 'flow') {
      say(`${scaleName()} — press Space to start. After 4 clicks, hold each note's ${TP.inputWord()} by its beat.`);
    } else {
      say(`${scaleName()}, up and down — finger the highlighted note and press Space.`);
    }
  }

  function reset() {
    stopFlow();
    stopListening();
    run = buildRun();
    idx = 0;
    states = run.map(() => '');
    mistakes = 0;
    startedAt = 0;
    finished = false;
    acceptedAt = TP.mic.active ? TP.heardTime() : 0;
    TP.resetValves();
    TP.setSubmitLabel(S.scaleMode === 'flow' ? 'Start' : 'Submit');
    intro();
    renderBest();
    draw();
  }

  function record(update) {
    TP.markDone('scale');
    TP.markDone('scale:' + scaleId());
    const rec = store.scales[scaleId()] || { runs: 0 };
    rec.runs++;
    update(rec);
    store.scales[scaleId()] = rec;
    save();
    renderBest();
  }

  // ---------- step mode ----------
  function finishStep() {
    finished = true;
    const ms = performance.now() - startedAt;
    let newBest = false;
    record(rec => {
      newBest = mistakes === 0 && (!rec.best || ms < rec.best);
      if (newBest) rec.best = Math.round(ms);
    });
    say(`Done in ${(ms / 1000).toFixed(1)}s with ${mistakes} mistake${mistakes === 1 ? '' : 's'}`
      + (newBest ? ' — new best!' : '.') + ' Press Space to go again.', mistakes ? '' : 'good');
  }

  // Step through with the mic: a note counts once it's been sounding steadily,
  // and only if it started after the previous note was accepted.
  let acceptedAt = 0;
  TP.mic.on(r => {
    if ($('panel-scales').hidden || S.input !== 'mic' || S.scaleMode !== 'step' || finished || !run[idx]) return;
    if (TP.mic.matches(r.midi, run[idx].midi) && r.held >= 0.15 && r.t - r.held >= acceptedAt - 0.05) {
      acceptedAt = r.t;
      advanceStep(true);
    }
  });

  function submitStep() {
    if (finished) { reset(); return; }
    if (S.input === 'mic') {           // Space with the mic = show me this one
      const note = run[idx];
      if (!startedAt) startedAt = performance.now();
      mistakes++;
      states[idx] = 'wrong';
      say(`${TP.label(note)} is ${TP.checkFingering(note.midi, '').shown.map(TP.fmtFingering).join(' or ')} — play it to go on.`, 'bad');
      TP.playMidi(note.midi, 0.9);
      draw();
      return;
    }
    advanceStep(TP.checkFingering(run[idx].midi, TP.fingering()).ok);
  }

  function advanceStep(ok) {
    const note = run[idx];
    const { valid, shown } = TP.checkFingering(note.midi, '');
    if (!startedAt) startedAt = performance.now();
    TP.activity();
    if (S.sound && S.input !== 'mic') TP.playMidi(note.midi, 0.7);
    if (ok) {
      states[idx] = states[idx] === 'wrong' ? 'fixed' : 'correct';
      idx++;
      TP.resetValves();
      if (idx === run.length) finishStep(); else say('');
    } else {
      mistakes++;
      states[idx] = 'wrong';
      say(`✗ ${TP.label(note)} is ${shown.map(TP.fmtFingering).join(' or ')} — try it again.`, 'bad');
      TP.markAnswer(valid[0]);
      TP.clearLatched();
    }
    draw();
  }

  // ---------- play-along mode ----------
  async function startFlow() {
    reset();
    const ctx = TP.audio();
    await TP.preload(run.map(n => n.midi));
    const r = TP.makeRun();
    const spb = 60 / S.scaleTempo;
    const grace = TP.graceFor(spb);
    const mic = S.input === 'mic';
    // With the mic, listen from just before the beat to well after it (a real note
    // takes a moment to speak and to be recognised).
    const listenTo = Math.min(0.45, spb * 0.75);
    const t0 = ctx.currentTime + 0.3;
    const tp = t0 + PER_BAR * spb;
    flow = { run: r, started: false, perfect: 0, late: 0, combo: 0, maxCombo: 0 };
    TP.logValves();
    TP.setSubmitLabel('Stop');
    renderFlowBtn();

    for (let b = 0; b < PER_BAR; b++) {
      r.click(t0 + b * spb, b === 0);
      r.at(t0 + b * spb, () => say(`${b + 1}`, 'count'));
    }
    r.at(tp - spb * 0.5, () => { flow.started = true; draw(); });
    run.forEach((note, i) => {
      const t = tp + i * spb;
      r.click(t, i % PER_BAR === 0);
      // The guide plays every note; otherwise your note sounds when you finger it right.
      if (S.scalePlayAlong) r.play(note.midi, spb * 0.92, t);
      else if (!mic) TP.soundAsYouPlay(r, t, note.midi, spb * 0.92, grace);
      // Valves: judge just after the beat, then move the cursor on to the next note.
      // Mic: move the cursor on the beat, judge once the listening window closes.
      if (mic) r.at(t + grace, () => { idx = i + 1; draw(); });
      r.at(t + (mic ? listenTo : grace), () => {
        let res;
        if (mic) {
          const first = TP.mic.heard(note.midi, t - 0.15, t + listenTo);
          res = { grade: first === null ? 'miss' : first <= t + 0.12 ? 'perfect' : 'late' };
        } else {
          res = TP.judgeBeat(t, note.midi, grace);
        }
        TP.activity();
        if (res.grade === 'miss') {
          states[i] = 'wrong';
          mistakes++;
          flow.combo = 0;
          const { shown } = TP.checkFingering(note.midi, '');
          say(`✗ ${TP.label(note)} is ${shown.map(TP.fmtFingering).join(' or ')}`, 'bad');
        } else {
          states[i] = res.grade === 'perfect' ? 'correct' : 'fixed';
          flow[res.grade]++;
          flow.combo++;
          flow.maxCombo = Math.max(flow.maxCombo, flow.combo);
          say(flow.combo >= 4 ? `Combo ${flow.combo}` : res.grade === 'late' ? 'A little late' : '', res.grade === 'perfect' ? 'good' : '');
        }
        if (!mic) idx = i + 1;
        draw();
      });
    });
    r.at(tp + (run.length - 1) * spb + Math.max(grace, mic ? listenTo : 0) + 0.15, finishFlow);
  }

  function finishFlow() {
    const f = flow;
    const hits = f.perfect + f.late;
    const pct = Math.round((hits / run.length) * 100);
    const clean = mistakes === 0;
    finished = true;
    draw();
    let best = false;
    record(rec => {
      if (clean && (!rec.flowBest || S.scaleTempo > rec.flowBest)) { rec.flowBest = S.scaleTempo; best = true; }
    });
    let msg = `${hits}/${run.length} notes (${pct}%) · ${f.perfect} on the beat · best combo ${f.maxCombo}`;
    if (best) msg += ` — new record: clean at ${S.scaleTempo} bpm`;
    if (S.scaleLoop) {
      if (clean) { setTempo(S.scaleTempo + 4); msg += ` Next: ${S.scaleTempo} bpm.`; }
      say(msg, clean ? 'good' : '');
      f.run.at(TP.audio().currentTime + 2, () => { if (flow === f) startFlow(); });
      return;
    }
    say(msg + '. Space to go again.', clean ? 'good' : '');
    flow.run.stop();
    flow = null;
    TP.setSubmitLabel('Start');
    renderFlowBtn();
  }

  function stopFlow() {
    if (!flow) return;
    flow.run.stop();
    flow = null;
    TP.setSubmitLabel('Start');
    renderFlowBtn();
  }

  // ---------- listening ----------
  let listening = null;
  async function listen() {
    stopFlow();
    stopListening();
    await TP.preload(run.map(n => n.midi));
    const r = TP.makeRun();
    listening = r;
    const t0 = TP.audio().currentTime + 0.1, gap = 60 / S.scaleTempo;
    const keep = idx;
    run.forEach((n, i) => {
      r.play(n.midi, gap * 0.92, t0 + i * gap);
      r.at(t0 + i * gap, () => { idx = i; draw(); });
    });
    r.at(t0 + run.length * gap, () => { idx = keep; draw(); listening = null; });
    listening.restore = () => { idx = keep; draw(); };
  }
  function stopListening() {
    if (!listening) return;
    listening.stop();
    listening.restore();
    listening = null;
  }

  // ---------- controls ----------
  const keySel = $('scKey'), typeSel = $('scType'), octSel = $('scOct'), startSel = $('scStart');
  for (const t of TONICS) keySel.add(new Option(TP.tonicName(t), t));
  for (const [id, t] of Object.entries(TYPES)) typeSel.add(new Option(t.name, id));

  // Respell keys that would need double sharps/flats (G♯ major -> A♭ major).
  function normaliseKey() {
    if (S.scaleType === 'chromatic') return;
    const minor = !!TYPES[S.scaleType].minor;
    if (TP.keyFifths(S.scaleKey, minor) === null && ENHARMONIC[S.scaleKey]) S.scaleKey = ENHARMONIC[S.scaleKey];
  }
  function fillStarts() {
    const opts = startOptions();
    if (!opts.includes(S.scaleStart)) S.scaleStart = bestStart(opts);
    startSel.textContent = '';
    for (const m of opts) startSel.add(new Option(TP.label(TP.spellAs(m, S.scaleKey[0])), m));
    startSel.value = S.scaleStart;
  }
  function setTempo(v) {
    S.scaleTempo = Math.max(30, Math.min(200, Math.round(v)));
    $('scTempoOut').textContent = S.scaleTempo;
    save();
  }
  function renderFlowBtn() {
    const isFlow = S.scaleMode === 'flow';
    $('scFlowOpts').hidden = !isFlow;
    const mic = S.input === 'mic';
    $('scHint').textContent = mic
      ? (isFlow
        ? 'Play each note on its beat.' + (S.scalePlayAlong ? ' Wear headphones — otherwise the mic hears the play-along notes.' : '')
        : 'Play the highlighted note — it moves on when it hears it. Space shows the fingering.')
      : (isFlow
        ? `Get each note's ${TP.inputWord()} ready before its beat — what you hold on the beat counts.`
        : 'Finger the highlighted note, then Space.');
  }
  function syncControls() {
    if (!TONICS.includes(S.scaleKey)) S.scaleKey = 'Bb';
    normaliseKey();
    keySel.value = S.scaleKey;
    typeSel.value = S.scaleType;
    octSel.value = S.scaleOctaves;
    $('scMode').value = S.scaleMode;
    $('scShowF').checked = S.scaleShowFingerings;
    $('scPlayAlong').checked = S.scalePlayAlong;
    $('scLoop').checked = S.scaleLoop;
    setTempo(S.scaleTempo);
    fillStarts();
    renderFlowBtn();
  }
  function onChange(e) {
    const keyOrOctChanged = e.target === keySel || e.target === octSel || e.target === typeSel;
    S.scaleKey = keySel.value;
    S.scaleType = typeSel.value;
    S.scaleOctaves = Number(octSel.value);
    S.scaleMode = $('scMode').value;
    S.scaleShowFingerings = $('scShowF').checked;
    S.scalePlayAlong = $('scPlayAlong').checked;
    S.scaleLoop = $('scLoop').checked;
    // A new key or length picks the best octave again; picking one yourself sticks.
    S.scaleStart = keyOrOctChanged ? null : Number(startSel.value);
    normaliseKey();
    keySel.value = S.scaleKey;
    fillStarts();
    save();
    e.target.blur();
    renderFlowBtn();
    if (e.target === $('scShowF')) draw();
    else if (e.target !== $('scPlayAlong') && e.target !== $('scLoop')) reset();
  }
  for (const id of ['scKey', 'scType', 'scOct', 'scStart', 'scMode', 'scShowF', 'scPlayAlong', 'scLoop']) {
    $(id).addEventListener('change', onChange);
  }
  $('scSlower').addEventListener('click', () => setTempo(S.scaleTempo - 4));
  $('scFaster').addEventListener('click', () => setTempo(S.scaleTempo + 4));
  $('scRestart').addEventListener('click', reset);
  $('scListen').addEventListener('click', listen);

  function submit() {
    if (S.scaleMode === 'step') { submitStep(); return; }
    if (flow) { stopFlow(); reset(); } else startFlow();
  }

  TP.modes.scales = {
    panel: 'panel-scales',
    valves: true,
    enter() { syncControls(); reset(); },
    leave() { stopFlow(); stopListening(); TP.setSubmitLabel('Submit'); },
    settingsChanged() { reset(); },
    preloadNotes: () => run.map(n => n.midi),
    submit,
    hear() { if (!finished && run[idx]) TP.playMidi(run[idx].midi); },
    key(k) {
      if (k === ' ' || k === 'enter') { submit(); return true; }
      if (k === 'h') { this.hear(); return true; }
      if (k === 'r') { reset(); return true; }
      if (k === 'escape') { reset(); return true; }
      if (k === '+' || k === '=') { setTempo(S.scaleTempo + 4); return true; }
      if (k === '-') { setTempo(S.scaleTempo - 4); return true; }
      return false;
    },
  };
})();
