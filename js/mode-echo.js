// Echo: ear training by call and response. The app plays a short phrase, then you
// play it back in the next bar(s) by ear, on the valves or (with the mic) on your
// instrument. The music is hidden until you've answered, then shown and graded.
(() => {
  'use strict';
  const { S, store, save, $ } = TP;
  const SC = TP.score;

  const EASY_KEYS = ['Bb', 'F', 'Eb', 'C', 'Ab', 'G'];
  // n: notes; bars: phrase length; steps: [scale steps, weight]; durs: lengths in ticks (24 = quarter).
  const LEVELS = {
    1: { name: 'Three notes, by step', n: [3, 3], bars: 1, steps: [[1, 1]], durs: [[24, 1]] },
    2: { name: 'Four notes, small leaps', n: [4, 4], bars: 1, steps: [[1, 3], [2, 2]], durs: [[24, 1]] },
    3: { name: 'Five notes, leaps and eighths', n: [5, 6], bars: 1, steps: [[1, 4], [2, 3], [3, 1], [4, 1]], durs: [[24, 2], [12, 2]] },
    4: { name: 'Two bars, any rhythm', n: [6, 9], bars: 2, steps: [[1, 4], [2, 3], [3, 1.5], [4, 1], [7, 0.4]], durs: [[24, 2], [12, 2], [36, 0.6], [48, 0.6]] },
  };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const weighted = arr => { let r = Math.random() * arr.reduce((a, x) => a + x[1], 0); for (const x of arr) if ((r -= x[1]) <= 0) return x[0]; return arr[arr.length - 1][0]; };

  // ---------- making a phrase ----------
  function makePhrase() {
    const L = LEVELS[S.echoLevel] || LEVELS[1];
    const key = S.echoKey && S.echoKey !== 'any' ? S.echoKey : pick(EASY_KEYS);
    const letters = TP.majorLetters(key), pc = TP.tonicPc(key);
    let scale = TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high && letters[m % 12]);
    if (scale.length < 6) scale = TP.ALL_MIDI.filter(m => letters[m % 12]);
    // Start on a tonic near the middle of your range.
    const tonics = scale.map((m, i) => [m, i]).filter(([m]) => m % 12 === pc);
    let at = tonics.length ? tonics.reduce((a, b) => (Math.abs(b[1] - scale.length / 2) < Math.abs(a[1] - scale.length / 2) ? b : a))[1] : Math.floor(scale.length / 2);
    const n = L.n[0] + Math.floor(Math.random() * (L.n[1] - L.n[0] + 1));
    const total = L.bars * 96;
    const notes = [];
    let used = 0;
    for (let k = 0; k < n; k++) {
      if (k) {
        const step = weighted(L.steps) * (Math.random() < 0.5 ? 1 : -1);
        let nx = at + step;
        if (nx < 0 || nx >= scale.length) nx = at - step;
        at = Math.max(0, Math.min(scale.length - 1, nx));
      }
      // Leave room for the notes still to come (at least an eighth each).
      const room = total - used - (n - k - 1) * 12;
      const durs = L.durs.filter(([d]) => d <= room);
      if (!durs.length) break;
      let d = weighted(durs);
      if (k === n - 1) d = Math.min(room, d >= 24 ? d : 24);   // end on something you can hear land
      // Notes don't cross the barline (simpler to read back).
      const inBar = used % 96;
      if (inBar + d > 96) d = 96 - inBar;
      notes.push({ midi: scale[at], dur: d });
      used += d;
    }
    const sp = m => TP.spellAs(m, letters[m % 12]);
    const measures = [];
    let bar = [], fill = 0;
    for (const x of notes) {
      const s = sp(x.midi);
      bar.push({ midi: x.midi, letter: s.letter, acc: s.acc, octave: s.octave, dur: x.dur, tie: false });
      fill += x.dur;
      if (fill === 96) { measures.push(bar); bar = []; fill = 0; }
    }
    if (fill || measures.length < L.bars) {
      // Rests to the end of the phrase.
      let left = 96 - fill;
      while (left > 0) { const r = left >= 48 ? 48 : left >= 24 ? 24 : 12; bar.push({ midi: null, dur: r, tie: false }); left -= r; }
      measures.push(bar);
    }
    while (measures.length < L.bars) measures.push([{ midi: null, dur: 96, tie: false }]);
    return { title: 'Echo', composer: '', fifths: TP.MAJOR_FIFTHS[key] || 0, beats: 4, beatType: 4, tempo: S.echoBpm, measures, keyName: key };
  }

  // ---------- a round: hear it, then play it back ----------
  let phrase = null, tl = null, running = null, lastOk = false;
  const session = { tried: 0, right: 0, streak: 0 };
  const usingMic = () => S.input === 'mic';

  function say(text, cls = '') {
    $('ecFeedback').className = 'feedback' + (cls ? ' ' + cls : '');
    $('ecFeedback').textContent = text || ' ';
  }
  function renderChips() {
    $('ecRight').textContent = session.right;
    $('ecTried').textContent = session.tried;
    $('ecStreak').textContent = session.streak;
  }
  // Hidden while you listen and answer; the music appears afterwards.
  function showHidden() {
    const box = $('ecScore');
    box.innerHTML = `<div class="echo-hidden" role="img" aria-label="A hidden phrase of ${tl ? tl.notes.length : 3} notes">${'<span aria-hidden="true">?</span>'.repeat(tl ? tl.notes.length : 3)}</div>`;
  }
  let view = null;
  function reveal(states) {
    const box = $('ecScore');
    view = SC.render(box, phrase, { width: box.clientWidth - 4 });
    if (states) tl.notes.forEach((n, k) => { for (let i = n.i; i <= n.last; i++) view.setState(i, states[k]); });
  }

  function stop() {
    if (!running) return;
    running.r.stop();
    running = null;
    TP.setSubmitLabel(lastOk || !phrase ? 'New phrase' : 'Try again');
  }

  async function round(fresh) {
    stop();
    if (fresh || !phrase) { phrase = makePhrase(); tl = SC.timeline(phrase); }
    showHidden();
    const ctx = TP.audio();
    await TP.preload(tl.notes.map(n => n.midi));
    const r = TP.makeRun(), spb = 60 / S.echoBpm, spt = spb / 24;
    const bars = phrase.measures.length, t0 = ctx.currentTime + 0.3;
    const tp = t0 + 4 * spb, tr = tp + bars * 4 * spb, tEnd = tr + bars * 4 * spb;
    running = { r, results: [], kind: 'round' };
    TP.logValves();
    TP.setSubmitLabel('Stop');
    // Clicks all the way: a bar of count-in, the phrase, then your answer.
    for (let b = 0; b < 4 + bars * 8; b++) r.click(t0 + b * spb, b % 4 === 0);
    for (let b = 0; b < 4; b++) r.at(t0 + b * spb, () => say(String(b + 1), 'count'));
    r.at(tp, () => say('Listen…'));
    r.at(tr - spb, () => say('Your turn in 1…'));
    r.at(tr, () => say(usingMic() ? 'Play it back!' : 'Finger it back!'));
    const mic = usingMic();
    tl.notes.forEach((n, k) => {
      // The app's phrase (the mic ignores the app's own sound while it plays).
      r.play(n.midi, Math.max(0.15, n.dur * spt * 0.92), tp + n.start * spt, true);
      // Your answer, graded like a piece.
      const t = tr + n.start * spt, dur = n.dur * spt, grace = TP.graceFor(dur);
      const again = k > 0 && tl.notes[k - 1].midi === n.midi;
      if (!mic) TP.soundAsYouPlay(r, t, n.midi, dur, grace);
      const win = Math.min(0.45, Math.max(0.2, dur * 0.8));
      r.at(t + (mic ? win : grace), () => {
        let grade, played = null;
        if (mic) {
          const first = TP.mic.heard(n.midi, t - 0.15, t + win, 2, again);
          grade = first === null ? 'miss' : first <= t + 0.12 ? 'perfect' : 'late';
        } else {
          const j = TP.judgeBeat(t, n.midi, grace);
          grade = j.grade;
          played = j.played;
        }
        running.results[k] = { grade, played };
      });
    });
    r.at(tEnd + 0.3, finish);
  }

  function finish() {
    if (!running) return;
    const res = tl.notes.map((n, k) => running.results[k] || { grade: 'miss' });
    stop();
    const ok = res.every(x => x.grade !== 'miss');
    const onTime = res.filter(x => x.grade === 'perfect').length;
    lastOk = ok;
    session.tried++;
    if (ok) { session.right++; session.streak++; } else session.streak = 0;
    renderChips();
    reveal(res.map(x => (x.grade === 'perfect' ? 'good' : x.grade)));
    // Per instrument: tries and echoes per level.
    const lv = String(S.echoLevel);
    const rec = store.echo[lv] || (store.echo[lv] = { tries: 0, right: 0 });
    rec.tries++;
    if (ok) rec.right++;
    save();
    TP.activity();
    TP.markDone('echo');
    const name = n => TP.label(tl.events[n.i]);
    let msg;
    if (ok) {
      msg = `✓ Echoed all ${res.length}` + (onTime < res.length ? ` (${res.length - onTime} a little late)` : ', right on time') + '. Space for a new phrase.';
      if (session.streak >= 5 && S.echoLevel < 4) msg += ` Five in a row — try level ${S.echoLevel + 1}?`;
    } else {
      const wrong = res.map((x, k) => [x, k]).filter(([x]) => x.grade === 'miss');
      msg = `${res.length - wrong.length} of ${res.length}. ` + wrong.slice(0, 3).map(([x, k]) => {
        const n = tl.notes[k];
        const made = x.played !== null && x.played !== undefined ? TP.producedBy(x.played, n.midi) : null;
        return `note ${k + 1} was ${name(n)}` + (made !== null && made !== n.midi ? ` (you made ${TP.flatLabel(made)})` : '');
      }).join(', ') + '. Space to try the same phrase again, N for a new one, H to hear it.';
    }
    say(msg, ok ? 'good' : 'bad');
  }

  // Hear the phrase again on its own (no grading).
  function hear() {
    if (!phrase || (running && running.kind === 'round')) return;
    stop();
    const r = TP.makeRun(), spt = 60 / S.echoBpm / 24, t0 = TP.audio().currentTime + 0.1;
    for (const n of tl.notes) r.play(n.midi, Math.max(0.15, n.dur * spt * 0.92), t0 + n.start * spt, true);
    running = { r, kind: 'hear' };
    r.at(t0 + tl.total * spt + 0.2, () => { if (running && running.r === r) running = null; });
  }

  function submit() {
    if (running && running.kind === 'round') { stop(); say('Stopped. Space to go again.'); return; }
    round(lastOk || !phrase);
  }

  // ---------- controls ----------
  for (const [k, L] of Object.entries(LEVELS)) $('ecLevel').add(new Option(`${k}. ${L.name}`, k));
  $('ecKey').add(new Option('Any easy key', 'any'));
  for (const k of EASY_KEYS) $('ecKey').add(new Option(`${TP.tonicName(k)} major`, k));
  function setTempo(v) {
    S.echoBpm = Math.max(40, Math.min(160, Math.round(v)));
    $('ecBpm').textContent = S.echoBpm;
    save();
  }
  $('ecLevel').addEventListener('change', e => { e.target.blur(); S.echoLevel = Number(e.target.value); save(); stop(); phrase = null; lastOk = true; intro(); });
  $('ecKey').addEventListener('change', e => { e.target.blur(); S.echoKey = e.target.value; save(); stop(); phrase = null; lastOk = true; intro(); });
  $('ecSlower').addEventListener('click', () => setTempo(S.echoBpm - 4));
  $('ecFaster').addEventListener('click', () => setTempo(S.echoBpm + 4));

  function intro() {
    $('ecScore').innerHTML = '<div class="echo-hidden"><span>?</span><span>?</span><span>?</span></div>';
    say('Press Space: a bar of clicks, the phrase, then you play it back in the next bar.');
    TP.setSubmitLabel('Start');
    $('ecHint').textContent = usingMic()
      ? 'Play it back on your instrument. Use headphones so the mic doesn’t hear the clicks.'
      : `Finger it back on the ${TP.inputWord()} — you hear your note as you play it. H hears the phrase again.`;
  }

  TP.modes.echo = {
    panel: 'panel-echo',
    valves: true,
    enter() {
      $('ecLevel').value = String(S.echoLevel || 1);
      $('ecKey').value = S.echoKey || 'any';
      setTempo(S.echoBpm || 80);
      renderChips();
      if (phrase && !running && view) { TP.setSubmitLabel(lastOk ? 'New phrase' : 'Try again'); } else intro();
    },
    leave() { stop(); TP.setSubmitLabel('Submit'); },
    settingsChanged() { phrase = null; lastOk = true; intro(); },
    preloadNotes: () => (tl ? tl.notes.map(n => n.midi) : []),
    submit,
    hear,
    key(k) {
      if (k === ' ' || k === 'enter') { submit(); return true; }
      if (k === 'h') { hear(); return true; }
      if (k === 'n') { stop(); round(true); return true; }
      if (k === 'escape') { stop(); say('Stopped.'); return true; }
      if (k === '+' || k === '=') { setTempo(S.echoBpm + 4); return true; }
      if (k === '-') { setTempo(S.echoBpm - 4); return true; }
      return false;
    },
  };
})();
