// Fingerings mode: a note appears, you answer with its fingering. Three ways to
// answer: press Space ('self'), just hold the right valves ('auto'), or keep up
// with a metronome where a new note arrives every few beats ('timed').
(() => {
  'use strict';
  const { S, store, save, $ } = TP;

  const svg = $('fStaff');
  const feedback = $('fFeedback');
  const noteName = $('fNoteName');
  const ALPHA = 0.35; // weight of the latest answer in the "recent accuracy" average
  const KEYS = Object.keys(TP.MAJOR_FIFTHS).sort((a, b) => TP.MAJOR_FIFTHS[a] - TP.MAJOR_FIFTHS[b]);

  // Notes in your range — in a key, only that key's notes.
  function range() {
    const all = TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high);
    if (S.fKey === 'all') return all;
    const letters = TP.majorLetters(S.fKey);
    const inKey = all.filter(m => letters[m % 12]);
    return inKey.length ? inKey : all;
  }
  const fifths = () => (S.fKey === 'all' ? 0 : TP.MAJOR_FIFTHS[S.fKey]);
  function spellNote(midi) {
    if (S.fKey === 'all') return TP.spell(midi, S.spelling);
    const letter = TP.majorLetters(S.fKey)[midi % 12];
    return letter ? TP.spellAs(midi, letter) : TP.spell(midi, S.spelling);
  }

  function record(midi, ok, ms) {
    TP.activity();
    TP.markDone('notes');
    const s = store.notes[midi] || { seen: 0, correct: 0, ema: 0.5, ms: 0 };
    s.seen++;
    if (ok) s.correct++;
    s.ema = s.ema * (1 - ALPHA) + (ok ? 1 : 0) * ALPHA;
    s.ms = s.seen === 1 ? ms : s.ms * 0.7 + ms * 0.3;
    s.last = Date.now();
    store.notes[midi] = s;
    save();
  }

  // Weak and slow notes come up more often, and so do notes you haven't seen for a
  // while (a few days away counts like a little weakness), so nothing goes stale.
  const DAY = 86400000;
  function pickMidi(prev) {
    let pool = range();
    if (pool.length > 1) pool = pool.filter(m => m !== prev);
    const weights = pool.map(m => {
      const s = store.notes[m];
      if (!s || s.seen < 2) return 4;
      const away = s.last ? (Date.now() - s.last) / DAY : 7;
      return 1 + 6 * (1 - s.ema) + Math.min(s.ms / 4000, 1) + Math.min(2.5, away / 3);
    });
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  const session = { tries: 0, correct: 0, ms: 0, streak: 0, best: 0 };
  function renderScore() {
    $('streak').textContent = session.streak;
    $('bestStreak').textContent = session.best;
    $('sessionAcc').textContent = session.tries ? `${session.correct}/${session.tries}` : '–';
    $('avgTime').textContent = session.correct ? (session.ms / session.correct / 1000).toFixed(1) + 's' : '–';
    $('sessionAcc').parentElement.classList.toggle('empty', !session.tries);
    $('avgTime').parentElement.classList.toggle('empty', !session.correct);
  }
  function tally(ok, ms) {
    session.tries++;
    if (ok) {
      session.correct++;
      session.ms += ms;
      session.streak++;
      session.best = Math.max(session.best, session.streak);
    } else {
      session.streak = 0;
    }
    renderScore();
  }

  function renderGrid() {
    const grid = $('noteGrid');
    grid.textContent = '';
    for (const m of range()) {
      const s = store.notes[m];
      const cell = document.createElement('div');
      let cls = 'cell', pct = '–';
      if (s) {
        pct = Math.round(s.ema * 100) + '%';
        cls += s.ema >= 0.85 ? ' strong' : s.ema >= 0.6 ? ' ok' : ' weak';
        cell.title = `${s.correct}/${s.seen} correct overall · ~${(s.ms / 1000).toFixed(1)}s`;
      } else {
        cell.title = 'Not practiced yet';
      }
      cell.className = cls;
      cell.innerHTML = `<b>${TP.label(spellNote(m))}</b><span>${pct}</span>`;
      grid.appendChild(cell);
    }
  }

  // Ear training hides the note until it's been answered.
  const hidden = state => S.fEar && !state && q;
  function draw(state) {
    const f = fifths();
    const width = f ? 270 : 240, x = f ? 180 : 150;
    const items = q && !hidden(state) ? [{ note: q, x, cls: state, acc: TP.shownAccidentals([q], f)[0] }] : [];
    TP.drawStaff(svg, width, items, TP.stepRange(S.low, S.high), { fifths: f });
    if (hidden(state)) svg.appendChild(TP.el('text', { x, y: TP.yOf(4) + 12, 'font-size': 36, 'text-anchor': 'middle', class: 'ear-q' }, '?'));
  }
  // The note's name, unless that would give the answer away.
  const nameText = () => (S.showName && !S.fEar ? TP.label(q) : ' ');
  function say(text, cls = '') {
    feedback.className = 'feedback' + (cls ? ' ' + cls : '');
    feedback.textContent = text || ' ';
  }

  // ---------- self-paced and auto ----------
  // Flow: 'asking' -> (correct) 'done' -> next, or (wrong) 'reviewing' -> Space -> next
  let q = null, phase = 'asking', shownAt = 0, timer = 0, autoTimer = 0, active = false;

  function next() {
    clearTimeout(timer);
    phase = 'asking';
    TP.resetValves();
    q = spellNote(pickMidi(q && q.midi));
    draw();
    noteName.textContent = nameText();
    say(S.fEar ? (usingMic() ? 'Listen, then play it back.' : 'Listen, then finger the note you heard. H plays it again.') : '');
    shownAt = performance.now();
    shownHeard = TP.mic.active ? TP.heardTime() + (S.fEar ? 1.3 : 0) : 0;
    if (S.autoplay || S.fEar) TP.playMidi(q.midi);
    // Already holding the right valves for the new note? That counts too.
    if (S.fMode === 'auto' && !usingMic()) checkAuto(TP.fingering(), 300);
  }

  const usingMic = () => S.input === 'mic';

  function submit() {
    if (S.fMode === 'timed') { timed ? stopTimed() : startTimed(); return; }
    if (phase === 'reviewing') { next(); return; }
    if (phase !== 'asking') return;
    clearTimeout(autoTimer);
    if (usingMic()) { grade(false, null); return; }   // Space with the mic = show me the answer
    const ans = TP.fingering();
    grade(TP.checkFingering(q.midi, ans).ok, ans);
  }

  // ans: the fingering played, or null when the answer came from the mic.
  function grade(ok, ans) {
    const { valid, shown } = TP.checkFingering(q.midi, '');
    const ms = performance.now() - shownAt;
    record(q.midi, ok, ms);
    tally(ok, ms);
    noteName.textContent = TP.label(q);
    // With the mic, you just heard yourself — no need for the app to play it too.
    if (S.sound && !usingMic()) TP.playMidi(q.midi);

    if (ok) {
      if (ans === null) {
        say(`✓ ${TP.label(q)} — ${shown.map(TP.fmtFingering).join(' or ')}`, 'good');
      } else {
        const others = valid.filter(f => f !== ans).map(TP.fmtFingering);
        say(`✓ ${TP.fmtFingering(ans)}` + (others.length ? ` (also: ${others.join(', ')})` : ''), 'good');
      }
      draw('correct');
      phase = 'done';
      timer = setTimeout(next, S.fMode === 'auto' || ans === null ? 450 : 700);
    } else {
      const played = ans === null ? '' : `You played ${TP.fmtFingering(ans)} — `;
      say(`✗ ${played}${TP.label(q)} is ${shown.map(TP.fmtFingering).join(' or ')}. Press Space to continue.`, 'bad');
      draw('wrong');
      if (ans === null) TP.playMidi(q.midi);  // hear how it should sound
      TP.markAnswer(valid[0]);
      phase = 'reviewing';
    }
    TP.clearLatched();
    renderGrid();
  }

  // Mic: the note counts once it's been sounding steadily for a moment
  // (and it started after this note appeared, not left over from the last one).
  let shownHeard = 0;
  TP.mic.on(r => {
    if (!active || !usingMic() || S.fMode === 'timed' || phase !== 'asking' || !q) return;
    if (TP.mic.matches(r.midi, q.midi) && r.held >= 0.2 && r.t - r.held >= shownHeard - 0.05) grade(true, null);
  });

  // Auto: accept as soon as the right valves are held (briefly, so passing
  // through a combination on the way to another doesn't count). Open notes
  // have no valves to hold, so those still take a Space.
  function checkAuto(f, delay = 120) {
    clearTimeout(autoTimer);
    if (!active || S.fMode !== 'auto' || usingMic() || phase !== 'asking' || !q || f === '') return;
    if (!TP.checkFingering(q.midi, f).ok) return;
    autoTimer = setTimeout(() => {
      if (phase === 'asking' && TP.fingering() === f) submit();
    }, delay);
  }
  TP.onValves(f => checkAuto(f));

  // ---------- timed ----------
  let timed = null;

  function startTimed() {
    stopTimed();
    const ctx = TP.audio();
    TP.logValves();
    const r = TP.makeRun();
    timed = r;
    let next = ctx.currentTime + 0.3, beat = -4;   // one bar of count-in
    q = null;
    draw();
    noteName.textContent = ' ';
    TP.setSubmitLabel('Stop');
    const tick = () => {
      while (next < ctx.currentTime + 0.15) {
        const t = next, b = beat;
        r.click(t, ((b % 4) + 4) % 4 === 0);
        if (b < 0) r.at(t, () => say(`${b + 5}`, 'count'));
        else if (b % S.fBeats === 0) r.at(t, () => onBeat(t));
        next += 60 / S.fTempo;
        beat++;
      }
    };
    tick();
    r.interval = setInterval(tick, 25);
  }

  function stopTimed() {
    if (!timed) return;
    timed.stop();
    timed = null;
    TP.setSubmitLabel(S.fMode === 'timed' ? 'Start' : 'Submit');
    if (S.fMode === 'timed') say('Press Space to start.');
  }

  // On each new-note beat: grade the previous note by what's held right on the
  // beat (a hair of slack for timing), then show the next one.
  function onBeat(t) {
    if (q) {
      let ok, from;
      if (usingMic()) {
        from = TP.mic.heard(q.midi, shownAt + 0.1, t + 0.1);
        ok = from !== null;
      } else {
        const at = TP.fingeringAt(t + 0.06);
        ok = TP.checkFingering(q.midi, at.f).ok;
        from = at.t;
      }
      const { shown } = TP.checkFingering(q.midi, '');
      const ms = ok ? Math.max(0, (from - shownAt) * 1000) : S.fBeats * 60000 / S.fTempo;
      record(q.midi, ok, ms);
      tally(ok, ms);
      if (ok) say(`✓ ${TP.label(q)}`, 'good');
      else say(`✗ ${TP.label(q)} is ${shown.map(TP.fmtFingering).join(' or ')}`, 'bad');
      renderGrid();
    }
    q = spellNote(pickMidi(q && q.midi));
    shownAt = t;
    draw();
    noteName.textContent = nameText();
    if (S.autoplay || S.fEar) TP.playMidi(q.midi, Math.min(1.3, S.fBeats * 60 / S.fTempo));
  }

  // ---------- controls ----------
  const keySel = $('fKey');
  keySel.add(new Option('All notes', 'all'));
  for (const k of KEYS) {
    const f = TP.MAJOR_FIFTHS[k];
    keySel.add(new Option(`${TP.tonicName(k)} major (${f ? Math.abs(f) + (f > 0 ? '♯' : '♭') : 'no sharps/flats'})`, k));
  }
  function setTempo(v) {
    S.fTempo = Math.max(30, Math.min(200, Math.round(v)));
    $('fTempoOut').textContent = S.fTempo;
    save();
  }
  function syncControls() {
    $('fMode').value = S.fMode;
    $('fEar').checked = S.fEar;
    keySel.value = S.fKey;
    $('fBeats').value = S.fBeats;
    setTempo(S.fTempo);
    $('fTimedOpts').hidden = S.fMode !== 'timed';
    $('fHint').textContent = usingMic() ? {
      self: 'Play the note on your tuba — it moves on when it hears it. Space shows the answer.',
      auto: 'Play the note on your tuba — it moves on when it hears it. Space shows the answer.',
      timed: 'A new note every few beats. Play each one before the next arrives.',
    }[S.fMode] : {
      self: 'Finger the note, then press Space.',
      auto: `Just hold the right ${TP.inputWord()} — it moves on by itself.` + (TP.inst().kind === 'slide' ? '' : ' Open notes: press Space.'),
      timed: `A new note every few beats. Hold its ${TP.inputWord()} before the next one arrives.`,
    }[S.fMode];
    TP.setSubmitLabel(S.fMode === 'timed' ? (timed ? 'Stop' : 'Start') : usingMic() ? 'Show answer' : 'Submit');
  }
  for (const id of ['fMode', 'fKey', 'fBeats', 'fEar']) {
    $(id).addEventListener('change', e => {
      stopTimed();
      S.fMode = $('fMode').value;
      S.fKey = keySel.value;
      S.fBeats = Number($('fBeats').value);
      S.fEar = $('fEar').checked;
      save();
      e.target.blur();
      syncControls();
      renderGrid();
      start();
    });
  }
  $('fSlower').addEventListener('click', () => setTempo(S.fTempo - 4));
  $('fFaster').addEventListener('click', () => setTempo(S.fTempo + 4));

  function start() {
    if (S.fMode === 'timed') {
      q = null;
      draw();
      TP.setSubmitLabel('Start');
      say('Press Space to start. You get one bar of clicks first.');
      noteName.textContent = ' ';
    } else {
      TP.setSubmitLabel(usingMic() ? 'Show answer' : 'Submit');
      next();
    }
  }

  TP.modes.fingerings = {
    panel: 'panel-fingerings',
    valves: true,
    enter() {
      active = true;
      syncControls();
      renderScore();
      renderGrid();
      if (!q || S.fMode === 'timed') start(); else { TP.setSubmitLabel(usingMic() ? 'Show answer' : 'Submit'); draw(); }
    },
    leave() {
      active = false;
      clearTimeout(timer);
      clearTimeout(autoTimer);
      stopTimed();
      if (phase === 'done') q = null; // answered: fresh note on return
      TP.setSubmitLabel('Submit');
    },
    settingsChanged() { renderGrid(); start(); },
    preloadNotes: range,
    submit,
    hear() { if (q) TP.playMidi(q.midi); },
    key(k) {
      if (k === ' ' || k === 'enter') { submit(); return true; }
      if (k === 'h') { this.hear(); return true; }
      if (k === 'escape') { stopTimed(); return true; }
      if (S.fMode === 'timed' && (k === '+' || k === '=')) { setTempo(S.fTempo + 4); return true; }
      if (S.fMode === 'timed' && k === '-') { setTempo(S.fTempo - 4); return true; }
      return false;
    },
  };
})();
