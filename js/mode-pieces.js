// Pieces mode: play real music — exercises, études, melodies, or your own
// imported scores. Three ways: play along with the metronome (graded on each
// note), wait-for-me (it waits until you play each note right), or listen.
(() => {
  'use strict';
  const { S, store, save, $ } = TP;
  const SC = TP.score;

  store.myPieces = store.myPieces || [];
  store.pieces = store.pieces || {};

  const { sightPiece, slurPiece, partialsFor, SLUR_PATTERNS } = TP.gen;
  const sightCache = {};


  // ---------- the piece list ----------
  const parsedLib = {};
  function libraryPiece(item) {
    if (!parsedLib[item.id]) parsedLib[item.id] = SC.parseABC(item.abc);
    return parsedLib[item.id];
  }
  function partPiece(item, part) {
    const k = item.id + ':' + part;
    if (!parsedLib[k]) parsedLib[k] = SC.parseABC(part === 2 ? item.abc2 : item.abc);
    return parsedLib[k];
  }
  function findItem(id) {
    const sm = /^sight-(\d)$/.exec(id || '');
    if (sm) {
      const level = Number(sm[1]);
      if (!sightCache[id]) sightCache[id] = sightPiece(level);
      const p = sightCache[id];
      return { id, title: p.title, level, cat: 'Sight-reading', piece: p, sight: true,
        note: `New every time: 8 bars in ${TP.tonicName(p.keyName)} major, ${p.beats}/${p.beatType}, in your practice range. Read it once, then play it through without stopping.` };
    }
    const sl = /^slur:([^:]*):(\w+)$/.exec(id || '');
    if (sl) {
      const f = sl[1] === 'open' ? '' : sl[1];
      if (partialsFor(f).length < 2) return null;
      return { id, title: `Lip slurs on ${TP.fmtFingering(f)} — ${SLUR_PATTERNS[sl[2]] || sl[2]}`, level: 2, cat: 'Lip slurs',
        piece: slurPiece(f, sl[2]), slur: true, mic: true,
        note: `${f === '' ? 'No valves the whole time' : `Keep ${TP.fmtFingering(f)} down the whole time`}; change notes with air speed and lip, not the valves. Use the mic (🎤) — it hears which partial you hit.` };
    }
    const lib = LIBRARY.find(p => p.id === id);
    if (lib && lib.abc2) {
      // A duet: you play one part and the app can play the other.
      const two = S.duetPart === 2;
      return { id, title: lib.title, composer: lib.composer || '', level: lib.level, note: lib.note || '', cat: lib.cat, builtIn: true, duet: true,
        piece: partPiece(lib, two ? 2 : 1), partner: partPiece(lib, two ? 1 : 2), abc: two ? lib.abc2 : lib.abc };
    }
    if (lib) return { id, title: lib.title, composer: lib.composer || '', level: lib.level, note: lib.note || '', mic: lib.mic, cat: lib.cat, piece: libraryPiece(lib), builtIn: true, abc: lib.abc, acc: lib.acc };
    const mine = store.myPieces.find(p => p.id === id);
    if (mine) return { id, title: mine.title, composer: mine.piece.composer || '', note: mine.source === 'abc' ? 'Your ABC piece' : `Imported${mine.partName ? ' — ' + mine.partName : ''}`, cat: 'My pieces', piece: mine.piece, abc: mine.abc, mine: true };
    return null;
  }

  const pieceSel = $('pcPiece');

  // ---------- current piece ----------
  let item = null, piece = null, tl = null, view = null;
  let lastTake = null;   // your last recorded run (mic), for "Hear my take"
  let from = 0, to = 0;

  // Move a whole piece by octaves (for music written too high or low for the instrument).
  function shifted(p, oct) {
    if (!oct) return p;
    return { ...p, measures: p.measures.map(m => m.map(e => (e.midi === null ? e : { ...e, midi: e.midi + 12 * oct, octave: e.octave + oct }))) };
  }
  // Concert-pitch music -> written pitch for a transposing instrument (B♭ trumpet: up a tone).
  const LETTER_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
  function toWritten(p, semis) {
    if (!semis) return p;
    const steps = LETTER_STEPS[((semis % 12) + 12) % 12];
    let df = ((semis * 7) % 12 + 12) % 12;
    if (df > 6) df -= 12;
    return {
      ...p, fifths: p.fifths + df,
      measures: p.measures.map(m => m.map(e => {
        if (e.midi === null) return e;
        const n = TP.spellAs(e.midi + semis, TP.LETTERS[(TP.LETTERS.indexOf(e.letter) + steps) % 7]);
        return { ...e, midi: n.midi, letter: n.letter, acc: n.acc, octave: n.octave };
      })),
    };
  }
  // Move a piece into another key signature (fifths), spelled properly; the nearest way up or down.
  // The octave control (and its best-fit pick) then puts it where it suits the instrument.
  let keySemis = 0;   // how far toKey moved the current piece (the piano follows)
  function toKey(p, target) {
    const df = target - (p.fifths || 0);
    if (!df) return p;
    let semis = ((df * 7) % 12 + 12) % 12;
    if (semis > 5) semis -= 12;
    keySemis = semis;
    const steps = ((df * 4) % 7 + 7) % 7;
    return {
      ...p, fifths: target,
      measures: p.measures.map(m => m.map(e => {
        if (e.midi === null) return e;
        const n = TP.spellAs(e.midi + semis, TP.LETTERS[(TP.LETTERS.indexOf(e.letter) + steps) % 7]);
        return { ...e, midi: n.midi, letter: n.letter, acc: n.acc, octave: n.octave };
      })),
    };
  }
  const KEY_CHOICES = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  function keyLabel(f) {
    const name = Object.keys(TP.MAJOR_FIFTHS).find(k => TP.MAJOR_FIFTHS[k] === f).replace('b', '♭').replace('#', '♯');
    return `${name} · ${f ? Math.abs(f) + (f > 0 ? '♯' : '♭') : 'no ♯/♭'}`;
  }
  const keyOf = id => (store.pieceKey && store.pieceKey[id] !== undefined ? store.pieceKey[id] : null);
  // The octave that puts the most notes on this instrument's chart (nearest its middle on a tie).
  function bestOctave(p) {
    const notes = SC.timeline(p).notes.map(n => n.midi);
    if (!notes.length) return 0;
    const mid = notes.slice().sort((a, b) => a - b)[notes.length >> 1];
    let best = 0, bestScore = -Infinity;
    for (let k = -3; k <= 3; k++) {
      // Fit matters most; then staying as written; then being near the middle of the range.
      const score = notes.filter(m => FINGERINGS[m + 12 * k]).length * 100 - (k ? 15 : 0) - Math.abs(mid + 12 * k - TP.inst().center);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best;
  }
  let autoShift = 0;
  const shiftOf = id => (store.pieceShift[id] !== undefined ? store.pieceShift[id] : autoShift);
  const usingMic = () => S.input === 'mic';
  const gradable = midi => usingMic() || !!FINGERINGS[midi];


  function open(id, keepRange) {
    stop();
    lastTake = null;
    item = findItem(id) || findItem(LIBRARY[0].id);
    S.pieceId = item.id;
    save();
    pieceSel.value = item.id;
    // Sight-reading is generated in written pitch for this instrument already.
    const gen = item.sight || item.slur;   // generated in written pitch for this instrument
    let written = gen ? item.piece : toWritten(item.piece, TP.inst().transpose);
    const asWritten = written.fifths || 0;
    keySemis = 0;
    if (!gen && keyOf(item.id) !== null) written = toKey(written, keyOf(item.id));
    autoShift = gen ? 0 : bestOctave(written);
    piece = gen ? written : shifted(written, shiftOf(item.id));
    $('pcNew').hidden = !item.sight;
    if (item.slur && ![...pieceSel.options].some(o => o.value === item.id)) {
      // A generated lip slur: list it so the menu shows what's open.
      let og = pieceSel.querySelector('optgroup[data-slurs]');
      if (!og) { og = document.createElement('optgroup'); og.label = 'Lip slurs'; og.dataset.slurs = '1'; pieceSel.prepend(og); }
      og.appendChild(new Option(item.title, item.id));
      pieceSel.value = item.id;
    }
    $('pcOct').disabled = !!gen;
    $('pcKey').disabled = !!gen;
    $('pcAccRow').hidden = !item.acc;
    $('pcDuetRow').hidden = !item.duet;
    $('pcBackingRow').hidden = !!(item.acc || item.duet);
    $('pcDuetPart').value = String(S.duetPart === 2 ? 2 : 1);
    partnerTl = null;
    const sib = TP.piecesLib.siblings();
    $('pcNav').hidden = sib.length < 2;
    $('pcPrev').disabled = sib.indexOf(item.id) <= 0;
    $('pcNext').disabled = sib.indexOf(item.id) >= sib.length - 1;
    $('pcKey').textContent = '';
    $('pcKey').add(new Option(`as written (${keyLabel(Math.max(-6, Math.min(5, asWritten)))})`, ''));
    for (const f of KEY_CHOICES) if (f !== asWritten) $('pcKey').add(new Option(keyLabel(f), f));
    $('pcKey').value = keyOf(item.id) === null ? '' : String(keyOf(item.id));
    tl = SC.timeline(piece);
    const tempo = (store.pieceTempo && store.pieceTempo[item.id]) || item.piece.tempo || 100;
    setTempo(tempo, false);
    if (!keepRange) { from = 0; to = piece.measures.length - 1; }
    // Opened from Today (a trouble spot): start on its bars, at its tempo, looping.
    const req = TP.pieceRequest && TP.pieceRequest.id === item.id ? TP.pieceRequest : null;
    if (req) {
      TP.pieceRequest = null;
      from = Math.min(req.from, piece.measures.length - 1);
      to = Math.min(Math.max(from, req.to), piece.measures.length - 1);
      if (req.bpm) setTempo(req.bpm, false);
      if (req.loop) { S.pieceLoop = true; $('pcLoop').checked = true; }
    }
    fillRange();
    for (const o of $('pcOct').options) {
      const k = Number(o.value);
      o.textContent = (k === 0 ? 'as written' : k > 0 ? `up ${k}` : `down ${-k}`) + (k === autoShift ? ' (best fit)' : '');
    }
    $('pcOct').value = String(shiftOf(item.id));
    $('pcEdit').hidden = !item.abc;
    $('pcEdit').textContent = item.mine ? 'Edit' : 'Copy & edit';
    $('pcDelete').hidden = !item.mine;
    renderInfo();
    draw();
    idle();
    openListeners.forEach(fn => fn(item));
  }
  // Other parts of the app (the journal) follow which piece is open.
  const openListeners = [];
  TP.onPieceOpen = fn => openListeners.push(fn);
  TP.openPiece = (id, keepRange) => open(id, keepRange);
  TP.stopPiece = () => stop();
  TP.currentPiece = () => item;

  // ---------- history: accuracy and tempo of your runs on this piece ----------
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  function renderHist() {
    const runs = (store.pieceHist && store.pieceHist[item.id]) || [];
    $('pcHist').hidden = runs.length < 2;
    // Recorded takes (kept with the mic) show in the same pop-out, under the charts.
    const takesBox = document.createElement('div');
    takesBox.className = 'takes';
    const forId = item.id;
    if (TP.takes) TP.takes.render(takesBox, forId).then(n => { if (n && item && item.id === forId) $('pcHist').hidden = false; });
    if (runs.length < 2) { $('pcHist').open = false; $('pcHistBody').textContent = ''; $('pcHistBody').appendChild(takesBox); $('pcSpark').textContent = ''; return; }
    // Sparkline in the button: the last 20 runs' accuracy.
    const last = runs.slice(-20), sp = $('pcSpark');
    sp.textContent = '';
    const sx = i => 2 + (i / Math.max(1, last.length - 1)) * 60, sy = p => 18 - (p / 100) * 16;
    sp.appendChild(svgEl('polyline', { points: last.map((r, i) => `${sx(i)},${sy(r.pct)}`).join(' '), class: 'spark-line' }));
    // The pop-out: two small charts on one time line (accuracy, then tempo), never two scales on one.
    const body = $('pcHistBody');
    body.textContent = '';
    const rs = runs.slice(-30), W = 300, H = 74, L = 30, R = 8;
    const x = i => L + (i / Math.max(1, rs.length - 1)) * (W - L - R);
    const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const tip = r => `${fmtDate(r.at)} · ${r.pct}% at ${r.bpm} bpm${r.bars ? ` · bars ${r.bars[0]}–${r.bars[1]}` : ''}`;
    function chart(title, val, lo, hi, unit) {
      const wrap = document.createElement('div');
      wrap.className = 'hist-chart';
      wrap.innerHTML = `<div class="hist-title">${title}</div>`;
      const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hist-svg', role: 'img', 'aria-label': title });
      const y = v => 6 + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - 14);
      for (const v of [lo, hi]) {
        svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'hist-grid' }));
        const t = svgEl('text', { x: L - 5, y: y(v) + 3.5, class: 'hist-axis', 'text-anchor': 'end' });
        t.textContent = v + unit;
        svg.appendChild(t);
      }
      svg.appendChild(svgEl('polyline', { points: rs.map((r, i) => `${x(i)},${y(val(r))}`).join(' '), class: 'hist-line' }));
      rs.forEach((r, i) => {
        const g = svgEl('g', { class: 'hist-pt' });
        g.appendChild(svgEl('circle', { cx: x(i), cy: y(val(r)), r: 3.2, class: 'hist-dot' + (r.whole ? '' : ' part') }));
        g.appendChild(svgEl('rect', { x: x(i) - 6, y: 0, width: 12, height: H, class: 'hist-hit' }));
        const tt = document.createElementNS(NS, 'title');
        tt.textContent = tip(r);
        g.appendChild(tt);
        svg.appendChild(g);
      });
      wrap.appendChild(svg);
      return wrap;
    }
    const bpms = rs.map(r => r.bpm), bLo = Math.min(...bpms), bHi = Math.max(...bpms);
    body.appendChild(chart('Accuracy', r => r.pct, 0, 100, '%'));
    body.appendChild(chart('Tempo', r => r.bpm, bLo === bHi ? bLo - 4 : bLo, bLo === bHi ? bHi + 4 : bHi, ''));
    const first = rs[0], lastR = rs[rs.length - 1];
    const sum = document.createElement('p');
    sum.className = 'sub tight hist-sum';
    sum.textContent = `${runs.length} runs since ${fmtDate(runs[0].at)} · last ${lastR.pct}% at ${lastR.bpm} bpm`
      + (lastR.bpm !== first.bpm ? ` (from ${first.bpm})` : '') + '. Hollow dots are part-of-the-piece runs.';
    body.appendChild(sum);
    body.appendChild(takesBox);
  }

  // The tempo coach: from your last whole run of this piece, a tempo to try now.
  function renderCoach() {
    const btn = $('pcCoach');
    const runs = ((store.pieceHist && store.pieceHist[item.id]) || []).filter(r => r.whole);
    if (!runs.length) { btn.hidden = true; return; }
    const last = runs[runs.length - 1];
    let bpm, why;
    if (last.pct >= 95) { bpm = last.bpm + 4; why = `Your last run (${last.pct}% at ${last.bpm}) was clean — try a little faster.`; }
    else if (last.pct < 80) { bpm = Math.max(30, Math.round(last.bpm * 0.9 / 2) * 2); why = `Your last run was ${last.pct}% at ${last.bpm} — slower and cleaner first.`; }
    else { bpm = last.bpm; why = `Your last run was ${last.pct}% at ${last.bpm} — the same tempo until it's clean.`; }
    btn.hidden = bpm === S.pieceBpm;
    btn.textContent = `🎯 Try ${bpm}`;
    btn.title = why;
    btn.onclick = e => { e.currentTarget.blur(); setTempo(bpm); say(why); };
  }

  function renderInfo() {
    const rec = store.pieces[item.id];
    const parts = [];
    if (item.composer) parts.push(item.composer);
    if (item.level) parts.push(`Level ${item.level}`);
    parts.push(`${piece.measures.length} bars · ${piece.beats}/${piece.beatType}`);
    if (rec) parts.push(`Best ${rec.best}% at ${rec.bpm} bpm`);
    $('pcMeta').textContent = parts.join(' · ');
    renderHist();
    renderCoach();
    $('pcNote').textContent = item.note || '';
    $('pcNote').hidden = !item.note;
    // Warn if much of it can't be fingered on this tuba.
    const pitched = tl.notes;
    const outside = pitched.filter(n => !FINGERINGS[n.midi]).length;
    $('pcRangeWarn').hidden = !(outside && !usingMic());
    $('pcRangeWarn').textContent = outside
      ? `${outside} of ${pitched.length} notes are outside the tuba fingering chart (shown faded and skipped). Try the Octave control.`
      : '';
  }

  const scrolling = () => S.pieceView === 'scroll';
  function hintNotes() {
    if (S.pieceHints === 'always') return tl.notes;
    if (S.pieceHints !== 'fade' || usingMic()) return [];
    const runs = (store.pieceHist && store.pieceHist[item.id]) || [];
    if (runs.length < 2) return tl.notes;
    const missed = (store.pieceMiss && store.pieceMiss[item.id]) || [];
    return tl.notes.filter(n => missed.includes(n.i));
  }
  function draw() {
    const box = $('pcScore');
    document.querySelectorAll('.tune-report').forEach(e => e.remove());
    box.classList.toggle('scroll', scrolling());
    box.classList.toggle('memorize', !!S.pieceMemo);
    if (scrolling()) {
      // One long line that slides under a fixed play line.
      box.textContent = '';
      const track = document.createElement('div');
      track.className = 'score-track';
      box.appendChild(track);
      view = SC.render(track, piece, { singleLine: true });
      box.insertAdjacentHTML('beforeend', '<div class="play-line"></div><div class="hud" id="pcHud"></div>');
      pinClef(box);
      requestAnimationFrame(() => placeAt(tl.measureStarts[from]));
    } else {
      view = SC.render(box, piece, { width: box.clientWidth - 4 });
    }
    // Fade notes we can't grade; show the practice range.
    for (const n of tl.notes) if (!gradable(n.midi)) for (let i = n.i; i <= n.last; i++) view.setState(i, 'oor');
    // Fingering hints under the notes: always, or fading as you learn the piece (every
    // note for your first two runs, then only the ones you missed last time).
    const hinted = new Set(hintNotes().map(n => n.i));
    for (const n of tl.notes) {
      if (!hinted.has(n.i) || !FINGERINGS[n.midi]) continue;
      const mine = S.myFingerings ? TP.myFingering(n.midi) : null;
      view.annotate(n.i, TP.fmtFingering(mine !== null ? mine : FINGERINGS[n.midi][0]), mine !== null ? 'tip' : 'hint');
    }
    // A fingering that sits better in tune on your horn (from the intonation map),
    // under the first such note in each bar.
    if (S.myFingerings) {
      const done = new Set();
      for (const n of tl.notes) {
        const f = TP.myFingering(n.midi);
        if (f !== null && !hinted.has(n.i) && !done.has(n.m + ':' + n.midi)) { done.add(n.m + ':' + n.midi); view.annotate(n.i, TP.fmtFingering(f), 'tip'); }
      }
    }
    markRange();
    box.querySelectorAll('.mhit').forEach(r => r.addEventListener('click', e => {
      const m = Number(r.dataset.m);
      if (running) return;
      // Click: start from this bar. Shift-click: end here.
      if (e.shiftKey && m >= from) to = m;
      else { from = m; if (to < from) to = piece.measures.length - 1; }
      $('pcFrom').value = from;
      $('pcTo').value = to;
      markRange();
    }));
  }
  // Scrolling view: a copy of the opening clef + key + time stays pinned at the left edge,
  // so you can still read the key once the start has scrolled away.
  let pin = null, pinW = 0;
  function pinClef(box) {
    pin = null;
    const svg = view.lines[0], first = view.posOfTick(0);
    if (!svg || !first) return;
    const copy = svg.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    copy.querySelectorAll('.mhit').forEach(n => n.remove());
    pin = document.createElement('div');
    pin.className = 'clef-pin';
    pin.setAttribute('aria-hidden', 'true');
    pin.appendChild(copy);
    box.appendChild(pin);
    pinW = Math.max(0, first.x - 10);
  }
  function placePin(shift, scale) {
    if (!pin) return;
    const w = pinW * scale;
    pin.style.width = w + 'px';
    pin.firstChild.style.width = view.width * scale + 'px';
    pin.classList.toggle('on', shift < -w * 0.6);
  }
  // Scrolling view: slide the music so this moment (in ticks) sits on the play line.
  function placeAt(tick) {
    if (!scrolling() || !view || !view.lines[0]) return;
    const p = view.posOfTick(tick);
    if (!p) return;
    const svg = view.lines[0];
    const scale = svg.getBoundingClientRect().width / view.width || 1;
    // The play line sits 30% in, but always clear of the pinned clef.
    const box = $('pcScore'), lineX = Math.round(Math.max(box.clientWidth * 0.3, pinW * scale + 36));
    const pl = box.querySelector('.play-line');
    if (pl) pl.style.left = lineX + 'px';
    const shift = Math.round(lineX - p.x * scale);
    svg.parentNode.style.transform = `translateX(${shift}px)`;
    placePin(shift, scale);
  }
  // Follow the music while it plays: the play line (scrolling) or the playhead bar (page).
  function follow(r, tStart, startT, spt) {
    const frame = () => {
      if (!running || running.r !== r) return;
      const tick = startT + (TP.heardTime() - tStart) / spt;
      if (scrolling()) placeAt(Math.max(startT, tick));
      else view.playhead(tick >= startT ? tick : null);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function hud() {
    const h = $('pcHud');
    if (!h || !running || !running.results) return;
    const res = running.results;
    const good = res.filter(g => g !== 'miss').length, miss = res.length - good;
    h.innerHTML = `<b>${good}</b> ✓ &nbsp; <b>${miss}</b> ✗${running.combo >= 4 ? ` &nbsp; 🔥 ${running.combo}` : ''}`;
  }

  // What the folded Options hide, when it isn't the default.
  function optionsSummary() {
    const bits = [];
    if (!(from === 0 && to === piece.measures.length - 1)) bits.push(`bars ${from + 1}–${to + 1}`);
    if ($('pcKey').value !== '') bits.push('in ' + keyLabel(Number($('pcKey').value)).split(' ·')[0]);
    // Only an octave you chose yourself (the automatic best fit isn't news).
    const oct = Number($('pcOct').value);
    if (oct !== autoShift) bits.push(`octave ${oct > 0 ? '+' : ''}${oct}`);
    if (S.pieceLoop) bits.push(S.pieceRamp ? 'loop, speeding up' : 'loop');
    if (S.pieceGuide) bits.push('guide on');
    if (item && item.acc) bits.push(S.pieceAcc ? 'with piano' : 'no piano');
    if (item && !item.acc && !item.duet && S.pieceBacking && S.pieceBacking !== 'none') bits.push(S.pieceBacking === 'drone' ? 'drone' : 'chords');
    if (S.pieceHints && S.pieceHints !== 'off') bits.push(S.pieceHints === 'fade' ? 'fading hints' : 'fingerings shown');
    if (item && item.duet) bits.push(`part ${S.duetPart === 2 ? 2 : 1}` + (S.pieceDuet ? ', with partner' : ', alone'));
    if (!S.pieceClick) bits.push('no metronome');
    if (S.pieceMemo) bits.push('memorize');
    $('pcMoreSum').textContent = bits.length ? '· ' + bits.join(' · ') : '';
  }
  function markRange() {
    optionsSummary();
    const all = from === 0 && to === piece.measures.length - 1;
    $('pcScore').querySelectorAll('.mhit').forEach(r => {
      const m = Number(r.dataset.m);
      r.classList.toggle('sel', !all && m >= from && m <= to);
    });
    // The scrolling view waits at the start of the chosen passage.
    if (!running && view && tl.measureStarts[from] != null) placeAt(tl.measureStarts[from]);
  }
  function fillRange() {
    for (const id of ['pcFrom', 'pcTo']) {
      const s = $(id);
      s.textContent = '';
      piece.measures.forEach((_, i) => s.add(new Option(`Bar ${i + 1}`, i)));
    }
    $('pcFrom').value = from;
    $('pcTo').value = to;
  }

  function say(text, cls = '') {
    $('pcFeedback').className = 'feedback' + (cls ? ' ' + cls : '');
    $('pcFeedback').textContent = text || ' ';
  }
  function idle() {
    const how = {
      play: `Press Space to start${TP.startHint()} — ${S.countIn === 2 ? 'two bars' : 'one bar'} of clicks, then play each note on time.`,
      wait: `Press Space to start${TP.startHint()} — it waits on each note until you play it right.`,
      listen: 'Press Space to hear it played.',
    }[S.pieceMode];
    say(how);
    TP.setSubmitLabel('Start');
    offerReplay();
  }

  function setTempo(v, remember = true) {
    S.pieceBpm = Math.max(20, Math.min(240, Math.round(v)));
    $('pcTempoOut').textContent = S.pieceBpm;
    if (remember && item) {
      store.pieceTempo = store.pieceTempo || {};
      store.pieceTempo[item.id] = S.pieceBpm;
    }
    save();
    if (item && remember) renderCoach();
  }

  // ---------- playing ----------
  let running = null;   // { kind, r, notes, results }

  function selection() {
    const startT = tl.measureStarts[from];
    const endT = to + 1 < tl.measureStarts.length ? tl.measureStarts[to + 1] : tl.total;
    return { startT, endT, notes: tl.notes.filter(n => n.start >= startT && n.start < endT) };
  }

  function stop() {
    if (!running) return;
    running.r && running.r.stop();
    if (running.take) endTake(running.take);
    running = null;
    if (view) { view.setCurrent(null); if (!scrolling()) view.playhead(null); }
    TP.setSubmitLabel('Start');
  }

  // "✗ F2 is 1 — you held 1-3 (that's D2)": what was written, and what your valves actually made.
  function missText(n, played) {
    const name = TP.label(tl.events[n.i]);
    if (!FINGERINGS[n.midi]) return `✗ ${name}`;
    let msg = `✗ ${name} is ${FINGERINGS[n.midi].map(TP.fmtFingering).join(' or ')}`;
    if (played !== null && played !== undefined && !usingMic()) {
      const made = TP.producedBy(played, n.midi);
      msg += ` — you held ${TP.fmtFingering(played)}` + (made !== null && made !== n.midi ? ` (that's ${TP.label(TP.spell(made, S.spelling === 'sharps' ? 'sharps' : 'flats'))})` : '');
    }
    return msg;
  }
  function mark(n, state) {
    for (let i = n.i; i <= n.last; i++) view.setState(i, state);
  }

  async function start(kind) {
    stop();
    draw();
    const sel = selection();
    if (!sel.notes.length) { say('No notes in that range.'); return; }
    if (kind === 'wait') return startWait(sel);

    const ctx = TP.audio();
    TP.logValves();
    await TP.preload(sel.notes.map(n => n.midi));
    const r = TP.makeRun();
    const spt = 60 / S.pieceBpm / SC.TPQ;               // seconds per tick
    const bt = SC.beatTicks(piece);
    const barT = piece.beats * 96 / piece.beatType;
    const perBar = Math.max(1, Math.round(barT / bt));
    const countBeats = perBar * (S.countIn === 2 ? 2 : 1);   // Settings: 2 bars gives time to breathe
    const t0 = ctx.currentTime + 0.3;
    const tStart = t0 + countBeats * bt * spt;
    running = { kind, r, results: [], combo: 0, bars: {}, tune: [], traces: [], missed: [], readings: usingMic() ? [] : null };
    if (kind === 'play' && usingMic()) running.take = startTake({ tStart, startT: sel.startT, spt });
    TP.setSubmitLabel('Stop');
    follow(r, tStart, sel.startT, spt);
    hud();

    for (let b = 0; b < countBeats; b++) {
      r.click(t0 + b * bt * spt, b === 0);
      r.at(t0 + b * bt * spt, () => say(String((b % perBar) + 1), 'count'));
    }
    r.at(tStart - 0.05, () => say(kind === 'listen' ? 'Listen…' : ''));
    if (S.pieceClick || kind === 'listen') {
      // Bar by bar, so a short pickup bar doesn't throw the beat off.
      for (let m = from; m <= to; m++) {
        const ms = tl.measureStarts[m], me = m + 1 < tl.measureStarts.length ? tl.measureStarts[m + 1] : tl.total;
        for (let t = ms; t < me; t += bt) r.click(tStart + (t - sel.startT) * spt, t === ms);
      }
    }
    const mic = usingMic();
    if (item.acc && S.pieceAcc) {
      scheduleAccompaniment(r, sel, tStart, spt);
      if (mic && !accWarned) { accWarned = true; TP.toast('Piano + mic: use headphones, or the mic will hear the piano.', 6000); }
    }
    // The guide's notes come out of the speakers too: the mic would grade them as yours.
    if (mic && S.pieceGuide && kind === 'play' && !guideWarned) { guideWarned = true; TP.toast('Guide + mic: use headphones, or the mic will hear the guide and count its notes as yours.', 7000); }
    if (!item.acc && !item.duet && S.pieceBacking && S.pieceBacking !== 'none') {
      scheduleBacking(r, sel, tStart, spt);
      if (mic && kind === 'play' && !guideWarned) { guideWarned = true; TP.toast('Backing + mic: use headphones, or the mic will hear it.', 7000); }
    }
    if (item.partner && S.pieceDuet) {
      schedulePartner(r, sel, tStart, spt);
      if (mic && kind === 'play' && !guideWarned) { guideWarned = true; TP.toast('Duet + mic: use headphones, or the mic will hear the other part.', 7000); }
    }
    sel.notes.forEach((n, k) => {
      const t = tStart + (n.start - sel.startT) * spt;
      // A repeat of the note before has to be played again, not just held over.
      const again = k > 0 && sel.notes[k - 1].midi === n.midi;
      const dur = n.dur * spt;
      if (kind === 'listen' || S.pieceGuide) r.play(n.midi, Math.max(0.12, dur * 0.95), t, false);
      r.at(t, () => view.setCurrent(n.i, !scrolling()));
      if (kind !== 'play' || !gradable(n.midi)) return;
      // Your note sounds as you play it (valves) — unless the guide is already playing it.
      if (!mic && !S.pieceGuide) TP.soundAsYouPlay(r, t, n.midi, dur, TP.graceFor(dur));
      const wait = TP.gradeWait(dur, mic);
      r.at(t + wait, () => {
        const { grade, played } = TP.gradeNote(t, n.midi, dur, mic, again);
        running.results.push(grade);
        const bar = running.bars[n.m] || (running.bars[n.m] = { bad: 0, n: 0 });
        bar.n++;
        bar.bad += grade === 'miss' ? 1 : grade === 'late' ? 0.4 : 0;
        mark(n, grade === 'perfect' ? 'good' : grade);
        if (grade === 'miss') {
          running.combo = 0;
          running.missed.push(n.i);
          // Show the right fingering under the note, like a teacher's pencil mark.
          if (FINGERINGS[n.midi]) view.annotate(n.i, TP.fmtFingering(FINGERINGS[n.midi][0]), 'miss');
          say(missText(n, played), 'bad');
        } else if (++running.combo >= 8 && running.combo % 4 === 0) say(`Combo ${running.combo}`, 'good');
        else if (grade === 'perfect') say('');
        hud();
        TP.activity();
        // With the mic, also note how in tune the held part of the note was.
        if (mic && grade !== 'miss') running.traces.push({ n, t, dur });
        if (mic && grade !== 'miss' && dur >= 0.25) {
          r.at(t + Math.max(wait, dur * 0.9) + 0.05, () => {
            const c = TP.mic.centsOn(n.midi, t + 0.1, t + dur * 0.9);
            if (c !== null && running) running.tune.push({ n, c });
          });
        }
      });
    });
    const end = tStart + (sel.endT - sel.startT) * spt;
    r.at(end + 0.5, () => finish(kind));
  }

  // ---------- record yourself, then hear it back with the music scrolling along ----------
  function startTake(info) {
    const src = TP.mic.source;
    if (!src || !window.MediaRecorder) return null;
    const ctx = TP.audio();
    try {
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      const rec = new MediaRecorder(dest.stream);
      const take = { ...info, rec, dest, src, chunks: [], t0: ctx.currentTime, pieceId: item.id };
      rec.ondataavailable = e => { if (e.data.size) take.chunks.push(e.data); };
      rec.start();
      return take;
    } catch (e) { return null; }
  }
  function endTake(take) {
    if (!take || take.rec.state === 'inactive') return;
    take.rec.onstop = async () => {
      try { take.src.disconnect(take.dest); } catch (e) { /* already gone */ }
      if (!take.chunks.length) return;
      // A finished, graded run is kept with your other takes of this piece.
      if (take.pct !== undefined && TP.takes) {
        const type = take.rec.mimeType || 'audio/webm';
        TP.takes.add(take.pieceId, { at: Date.now(), pct: take.pct, bpm: take.bpm, bars: take.bars, type, blob: new Blob(take.chunks, { type }) })
          .then(() => { if (item && item.id === take.pieceId) renderHist(); }, () => {
            if (!takesWarned) { takesWarned = true; TP.toast('This browser won’t keep recordings here, so takes aren’t saved — use ⬇ Save to keep one.', 7000); }
          });
      }
      try {
        const data = await new Blob(take.chunks).arrayBuffer();
        lastTake = { ...take, buffer: await TP.audio().decodeAudioData(data) };
        offerReplay();
      } catch (e) { /* couldn't decode: no replay */ }
    };
    take.rec.stop();
  }
  function offerReplay() {
    const fb = $('pcFeedback');
    if (!lastTake || running || fb.querySelector('.replay-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'pill replay-btn';
    btn.innerHTML = '▶ Hear my take <kbd>P</kbd>';
    btn.addEventListener('click', e => { e.stopPropagation(); btn.blur(); replay(); });
    fb.appendChild(document.createTextNode(' '));
    fb.appendChild(btn);
    // Keep it: save the recording as an audio file.
    const save = document.createElement('a');
    save.className = 'pill replay-btn';
    save.textContent = '⬇ Save';
    save.title = 'Save this recording as an audio file';
    const type = lastTake.rec.mimeType || 'audio/webm';
    save.href = URL.createObjectURL(new Blob(lastTake.chunks, { type }));
    const day = new Date().toLocaleDateString('en-CA');
    save.download = `${item.title.replace(/[\/:*?"<>|]+/g, '')} — ${day}.${type.includes('ogg') ? 'ogg' : 'webm'}`;
    fb.appendChild(document.createTextNode(' '));
    fb.appendChild(save);
  }
  function replay() {
    if (!lastTake || running) return;
    const tk = lastTake, ctx = TP.audio();
    const src = ctx.createBufferSource();
    src.buffer = tk.buffer;
    src.connect(ctx.destination);
    const at = ctx.currentTime + 0.1;
    src.start(at);
    const r = { stop() { try { src.stop(); } catch (e) { /* done */ } } };
    running = { kind: 'replay', r };
    TP.setSubmitLabel('Stop');
    // The music started (tStart - t0) seconds into the recording.
    follow(r, at + (tk.tStart - tk.t0), tk.startT, tk.spt);
    say('Your take — listen for the notes that wobble or come in late.');
    src.onended = () => {
      if (!running || running.r !== r) return;
      running = null;
      if (view) view.setCurrent(null);
      idle();
    };
  }

  // Backing for music without its own: a drone on the key note, or simple chords
  // worked out from the notes (one per half bar; per bar in 2/4 and 3/4).
  function backingKey() {
    const name = Object.keys(TP.MAJOR_FIFTHS).find(k => TP.MAJOR_FIFTHS[k] === (piece.fifths || 0)) || 'C';
    const major = TP.tonicPc(name);
    // A minor-key piece usually ends on its key note: the relative minor of the signature.
    const last = tl.notes[tl.notes.length - 1];
    const minor = !!last && last.midi % 12 === (major + 9) % 12;
    return { major, minor, tonic: minor ? (major + 9) % 12 : major };
  }
  // A soft synth drone between audio times t0 and t1 (concert midi).
  function drone(midi, t0, t1) {
    const ctx = TP.audio(), f = TP.hz(midi), out = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(1200, f * 4);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(0.08, t0 + 0.5);
    out.gain.setValueAtTime(0.08, Math.max(t0 + 0.5, t1 - 0.5));
    out.gain.exponentialRampToValueAtTime(0.0001, t1);
    const oscs = [[f, 'sawtooth', 0.5], [f * 1.003, 'sawtooth', 0.4], [f * 1.5, 'sine', 0.22]].map(([fr, type, g]) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type; o.frequency.value = fr; gn.gain.value = g;
      o.connect(gn); gn.connect(lp); o.start(t0); o.stop(t1 + 0.05);
      return o;
    });
    lp.connect(out);
    out.connect(ctx.destination);
    return { stop() { const t = ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0.0001, t, 0.05); oscs.forEach(o => { try { o.stop(t + 0.3); } catch (e) { /* done */ } }); } };
  }
  function scheduleBacking(r, sel, tStart, spt) {
    const k = backingKey(), tr = TP.inst().transpose;
    // Written pitch class -> a concert note from C3 up.
    const low = pc => 48 + ((pc - tr) % 12 + 12) % 12;
    if (S.pieceBacking === 'drone') {
      r.add(drone(low(k.tonic), tStart, tStart + (sel.endT - sel.startT) * spt));
      return;
    }
    // The key's six triads (and, in minor, the major chord on its fifth).
    const chords = [[0, 4, 7], [2, 5, 9], [4, 7, 11], [5, 9, 0], [7, 11, 2], [9, 0, 4]].map(c => c.map(x => (x + k.major) % 12));
    if (k.minor) chords.push([4, 8, 11].map(x => (x + k.major) % 12));
    const home = chords[k.minor ? 5 : 0];
    const barT = piece.beats * 96 / piece.beatType, span = piece.beats >= 4 ? barT / 2 : barT;
    for (let t = sel.startT; t < sel.endT; t += span) {
      const w = new Array(12).fill(0);
      for (const n of tl.notes) {
        const s0 = Math.max(n.start, t), s1 = Math.min(n.start + n.dur, t + span);
        if (s1 > s0) w[n.midi % 12] += s1 - s0;
      }
      if (!w.some(Boolean)) continue;
      // The chord whose notes the melody uses most here (the home chord wins a tie).
      let best = home, bestScore = -Infinity;
      for (const c of chords) {
        const score = c.reduce((a, pc) => a + w[pc], 0) - 0.5 * w.reduce((a, x, pc) => a + (c.includes(pc) ? 0 : x), 0) + (c === home ? 0.1 * span : 0);
        if (score > bestScore) { bestScore = score; best = c; }
      }
      const root = low(best[0]);
      const at = tStart + (t - sel.startT) * spt, len = Math.min(span, sel.endT - t) * spt * 0.95;
      for (const pc of best) { let m = low(pc); while (m < root) m += 12; r.piano(m, len, at, 0.5); }
    }
  }

  // Duets: the other part, on your instrument's sound (concert pitch, following any key change).
  let partnerTl = null;
  function schedulePartner(r, sel, tStart, spt) {
    partnerTl = partnerTl || SC.timeline(item.partner);
    for (const n of partnerTl.notes) {
      if (n.start < sel.startT || n.start >= sel.endT) continue;
      const len = Math.max(0.12, Math.min(n.dur, sel.endT - n.start) * spt * 0.95);
      r.play(n.midi + keySemis + TP.inst().transpose, len, tStart + (n.start - sel.startT) * spt, false, 0.8);
    }
  }
  // With the mic, after a run: a line through each note you played, showing your pitch
  // over its length (up = sharp). Scoops, sags and late centring show at a glance.
  TP.mic.on(x => { if (running && running.readings) running.readings.push(x); });
  function drawTraces(run) {
    if (!run.readings || !run.traces.length) return;
    for (const { n, t, dur } of run.traces) {
      const pts = run.readings
        .filter(x => x.t >= t && x.t <= t + dur && x.midi !== null && Math.abs(x.midi - n.midi) <= 1)
        .map(x => ({ f: (x.t - t) / dur, c: x.cents + 100 * (x.midi - n.midi) }));
      view.trace(n.i, pts, n.dur);
    }
  }

  // Piano accompaniment ("start,dur,midi;..." in ticks, concert pitch), from where the passage starts.
  const accCache = {};
  let accWarned = false, guideWarned = false, takesWarned = false;
  function scheduleAccompaniment(r, sel, tStart, spt) {
    const notes = accCache[item.id] || (accCache[item.id] = item.acc.split(';').map(x => x.split(',').map(Number)));
    for (const [st, d, m] of notes) {
      if (st < sel.startT || st >= sel.endT) continue;
      const len = Math.min(d, sel.endT - st) * spt;
      r.piano(m + keySemis, len, tStart + (st - sel.startT) * spt);
    }
  }

  function finish(kind) {
    const res = running ? running.results : [];
    const wasLoop = S.pieceLoop;
    view.setCurrent(null);
    const take = running && running.take;
    if (take) { endTake(take); running.take = null; }
    if (kind === 'listen') { running = null; idle(); return; }
    const total = res.length;
    if (!total) { running = null; idle(); return; }
    const perfect = res.filter(g => g === 'perfect').length, late = res.filter(g => g === 'late').length;
    const pct = Math.round(((perfect + 0.6 * late) / total) * 100);
    // The recording finishes saving a moment later; it's kept with this score.
    if (take) Object.assign(take, { pct, bpm: S.pieceBpm, bars: from === 0 && to === piece.measures.length - 1 ? null : [from + 1, to + 1] });
    const stars = pct >= 95 ? '★★★' : pct >= 80 ? '★★☆' : pct >= 60 ? '★☆☆' : '☆☆☆';
    const whole = from === 0 && to === piece.measures.length - 1;
    TP.markDone('piece');
    TP.markDone('piece:' + item.id);
    // Every graded run goes in the piece's history (the chart under History).
    store.pieceHist = store.pieceHist || {};
    const hist = store.pieceHist[item.id] || (store.pieceHist[item.id] = []);
    hist.push({ at: Date.now(), pct, bpm: S.pieceBpm, whole, bars: whole ? null : [from + 1, to + 1] });
    if (hist.length > 60) hist.splice(0, hist.length - 60);
    save();
    if (item.cat === 'Warm-ups') TP.markDone('warmup');
    if (item.sight) TP.markDone('sight');
    // The notes you missed (fading fingering hints come back on just those), and the
    // trouble spot, kept until you play it clean (Today brings it back).
    store.pieceMiss = store.pieceMiss || {};
    store.pieceMiss[item.id] = running ? running.missed.slice() : [];
    const spot = running ? rememberTrouble(running.bars, pct) : null;
    // Personal bests only count for the whole piece.
    let best = false;
    if (whole) {
      const rec = store.pieces[item.id];
      if (!rec || pct > rec.best || (pct === rec.best && S.pieceBpm > rec.bpm)) {
        store.pieces[item.id] = { best: pct, bpm: S.pieceBpm };
        best = true;
        save();
      }
    }
    renderInfo();
    let msg = `${stars}  ${pct}% · ${perfect} on time, ${late} late, ${total - perfect - late} missed`;
    if (best) msg += ' — personal best!';
    if (wasLoop && running) {
      // Tempo trainer: a clean run earns the next one 4 bpm faster.
      if (S.pieceRamp && pct >= 95) { setTempo(S.pieceBpm + 4); msg += ` · clean! → ${S.pieceBpm} bpm`; }
      say(msg + ' · again in 2 s…', pct >= 80 ? 'good' : '');
      running.r.at(TP.audio().currentTime + 2, () => start(kind));
      return;
    }
    const tune = running.tune, done = running;
    drawTraces(running);
    running = null;
    TP.setSubmitLabel('Start');
    say(msg + '. Space to play again.', pct >= 80 ? 'good' : '');
    if (spot) offerSpot(spot);
    else if (pct >= 80) offerNext();
    if (tune.length >= 3) tuningReport(tune);
    dynamicsReport(done);
  }
  function rememberTrouble(bars, pct) {
    store.trouble = store.trouble || {};
    const old = store.trouble[item.id];
    if (old && from <= old.a && to >= old.b) {
      let clean = true;
      for (let m = old.a; m <= old.b; m++) if (!bars[m] || bars[m].bad > 0) clean = false;
      if (clean) delete store.trouble[item.id];
    }
    const spot = pct < 95 ? troubleSpot(bars) : null;
    if (spot) store.trouble[item.id] = { a: spot.a, b: spot.b, bpm: Math.max(40, Math.round(S.pieceBpm * 0.85)), at: Date.now(), title: item.title };
    save();
    return spot;
  }
  // With the mic, when the music has dynamics (p, mf, f…): how much louder the loud
  // marks were than the soft ones (median loudness of each note, grouped by marking).
  const DYN = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
  function dynamicsReport(run) {
    if (!run || !run.readings || !run.traces.length) return;
    const markAt = [];
    let cur = null;
    for (const e of tl.events) { if (e.dyn) cur = e.dyn; markAt[e.i] = cur; }
    const levels = {};
    for (const { n, t, dur } of run.traces) {
      const d = markAt[n.i];
      if (!d) continue;
      const rms = run.readings.filter(x => x.t >= t + 0.05 && x.t <= t + dur * 0.85 && x.midi !== null).map(x => x.rms).sort((a, b) => a - b);
      if (rms.length < 2) continue;
      (levels[d] = levels[d] || []).push(20 * Math.log10(rms[rms.length >> 1]));
    }
    const used = DYN.filter(d => levels[d] && levels[d].length >= 2);
    if (used.length < 2) return;
    const avg = d => levels[d].reduce((a, b) => a + b, 0) / levels[d].length;
    const lo = used[0], hi = used[used.length - 1], span = Math.round(avg(hi) - avg(lo));
    const box = document.createElement('div');
    box.className = 'tune-report dyn-report';
    box.innerHTML = `<b>Dynamics</b> · ` + used.map(d => `<i>${d}</i> ${d === lo ? '0' : (avg(d) >= avg(lo) ? '+' : '') + Math.round(avg(d) - avg(lo))} dB`).join(' · ') + '<br>'
      + (span >= 10 ? `Your <i>${hi}</i> was ${span} dB above your <i>${lo}</i> — a real contrast.`
        : span >= 5 ? `<i>${hi}</i> was ${span} dB above <i>${lo}</i>: some contrast — aim for 10 dB or more.`
          : `<i>${hi}</i> was only ${Math.max(0, span)} dB above <i>${lo}</i> — make the soft softer and the loud louder.`);
    $('pcFeedback').after(box);
  }
  // After a mic run: which notes sat sharp or flat, marked on the music and summed up.
  function tuningReport(tune) {
    const byNote = new Map();
    for (const { n, c } of tune) {
      if (Math.abs(c) >= 15) view.annotate(n.i, (c > 0 ? '+' : '') + c, c > 0 ? 'sharp' : 'flat');
      const g = byNote.get(n.midi) || { midi: n.midi, n: n, sum: 0, k: 0 };
      g.sum += c; g.k++;
      byNote.set(n.midi, g);
    }
    const avgOff = Math.round(tune.reduce((t, x) => t + Math.abs(x.c), 0) / tune.length);
    const worst = [...byNote.values()].map(g => ({ ...g, avg: Math.round(g.sum / g.k) }))
      .filter(g => Math.abs(g.avg) >= 12).sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg)).slice(0, 3);
    const box = document.createElement('div');
    box.className = 'tune-report';
    const notes = worst.map(g => {
      const name = TP.label(tl.events[g.n.i]);
      const f = FINGERINGS[g.midi] || [];
      // Another fingering may sit better in tune: worth trying.
      const alt = f.length > 1 ? ` (alt. ${f.slice(1).map(TP.fmtFingering).join(' or ')})` : '';
      return `<span class="${g.avg > 0 ? 'sharp' : 'flat'}"><b>${name}</b> ${g.avg > 0 ? '+' : ''}${g.avg}¢ ${g.avg > 0 ? 'sharp' : 'flat'}${alt}</span>`;
    });
    box.innerHTML = `<b>Tuning</b> · ${avgOff}¢ off on average` + (avgOff <= 8 ? ' — nicely in tune.' : '')
      + (notes.length ? '<br>' + notes.join(' · ') : '');
    $('pcFeedback').after(box);
  }
  // The stretch (up to 2 bars) where most of the misses were, if one stands out.
  function troubleSpot(bars) {
    let best = null;
    for (const k of Object.keys(bars)) {
      const m = Number(k), a = bars[m], b = bars[m + 1];
      const one = { a: m, b: m, bad: a.bad };
      const two = b ? { a: m, b: m + 1, bad: a.bad + b.bad } : one;
      // Take the pair only when the second bar adds real trouble too.
      const pick = b && b.bad >= 1 ? two : one;
      if (pick.bad >= 1 && (!best || pick.bad > best.bad)) best = pick;
    }
    if (!best || (best.a === from && best.b === to)) return null;
    // If the misses are spread all over, a single spot won't help (slow the whole thing down instead).
    const all = Object.values(bars).reduce((t, x) => t + x.bad, 0);
    return best.bad >= 0.35 * all ? best : null;
  }
  // After a good run in a book, a button straight to the next study.
  function offerNext() {
    const lib = LIBRARY.find(p => p.id === item.id);
    if (!lib || !lib.book) return;
    const sib = TP.piecesLib.siblings(), nextId = sib[sib.indexOf(item.id) + 1];
    if (!nextId) return;
    const btn = document.createElement('button');
    btn.className = 'pill spot-btn';
    btn.textContent = `Next: ${LIBRARY.find(p => p.id === nextId).title.split(' — ')[0]} ›`;
    btn.addEventListener('click', e => { e.stopPropagation(); open(nextId); });
    const fb = $('pcFeedback');
    fb.appendChild(document.createTextNode(' '));
    fb.appendChild(btn);
  }
  function offerSpot(spot) {
    const label = spot.a === spot.b ? `bar ${spot.a + 1}` : `bars ${spot.a + 1}–${spot.b + 1}`;
    const slower = Math.max(40, Math.round(S.pieceBpm * 0.85));
    const btn = document.createElement('button');
    btn.className = 'pill spot-btn';
    btn.textContent = `Loop ${label} at ${slower} bpm`;
    btn.title = 'Most of the misses were here';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.blur();
      from = spot.a; to = spot.b;
      $('pcFrom').value = from; $('pcTo').value = to;
      S.pieceLoop = true; $('pcLoop').checked = true;
      save();
      setTempo(slower);
      markRange();
      say(`Looping ${label} at ${slower} bpm — press Space. Speed back up once it’s clean.`);
    });
    const fb = $('pcFeedback');
    fb.appendChild(document.createTextNode(' '));
    fb.appendChild(btn);
  }

  // Wait-for-me: no clock. The cursor waits until you play the note right.
  function startWait(sel) {
    TP.logValves();
    const queue = sel.notes.filter(n => gradable(n.midi));
    running = { kind: 'wait', queue, k: 0, mistakes: 0, acceptedAt: TP.mic.active ? TP.heardTime() : 0, startedAt: performance.now() };
    TP.setSubmitLabel('Check');
    showWait();
  }
  function showWait() {
    const w = running;
    if (w.k >= w.queue.length) {
      const secs = ((performance.now() - w.startedAt) / 1000).toFixed(0);
      running = null;
      view.setCurrent(null);
      TP.setSubmitLabel('Start');
      say(`Done — ${w.queue.length} notes in ${secs}s with ${w.mistakes} mistake${w.mistakes === 1 ? '' : 's'}. Space to go again.`, w.mistakes ? '' : 'good');
      TP.markDone('piece');
      TP.markDone('piece:' + item.id);
      if (item.cat === 'Warm-ups') TP.markDone('warmup');
      if (item.sight) TP.markDone('sight');
      return;
    }
    const n = w.queue[w.k];
    view.setCurrent(n.i, !scrolling());
    if (scrolling()) placeAt(n.start); else view.playhead(n.start);
    say(usingMic() ? 'Play the highlighted note.' : 'Finger the highlighted note' + (FINGERINGS[n.midi][0] === '' ? ' (open: press Space)' : ''));
  }
  function waitAccept() {
    const w = running;
    const n = w.queue[w.k];
    mark(n, 'good');
    if (S.sound && !usingMic()) TP.playMidi(n.midi, Math.min(1, n.dur * 60 / S.pieceBpm / SC.TPQ + 0.1));
    TP.activity();
    w.k++;
    TP.clearLatched();
    TP.markAnswer('');
    showWait();
  }
  function waitCheck() {
    const w = running;
    const n = w.queue[w.k];
    if (usingMic()) {   // Space with the mic: show me
      w.mistakes++;
      mark(n, 'miss');
      say(`That's ${TP.label(tl.events[n.i])} — ${FINGERINGS[n.midi] ? FINGERINGS[n.midi].map(TP.fmtFingering).join(' or ') : ''}`, 'bad');
      TP.playMidi(n.midi, 0.9);
      return;
    }
    if (TP.checkFingering(n.midi, TP.fingering()).ok) waitAccept();
    else {
      w.mistakes++;
      mark(n, 'miss');
      say(missText(n, TP.fingering()), 'bad');
      TP.markAnswer(FINGERINGS[n.midi][0]);
    }
  }
  let waitTimer = 0;
  TP.onValves(f => {
    clearTimeout(waitTimer);
    if (!running || running.kind !== 'wait' || usingMic() || f === '') return;
    const n = running.queue[running.k];
    if (!n || !TP.checkFingering(n.midi, f).ok) return;
    waitTimer = setTimeout(() => { if (running && running.kind === 'wait' && TP.fingering() === f) { TP.markAnswer(''); waitAccept(); } }, 120);
  });
  TP.mic.on(r => {
    if (!running || running.kind !== 'wait' || !usingMic()) return;
    const n = running.queue[running.k];
    if (n && TP.mic.matches(r.midi, n.midi) && r.held >= 0.15 && r.t - r.held >= running.acceptedAt - 0.05) {
      running.acceptedAt = r.t;
      waitAccept();
    }
  });

  function submit() {
    if (running && running.kind === 'wait') { waitCheck(); return; }
    if (running) { stop(); draw(); idle(); return; }
    start(S.pieceMode);
  }

  // ---------- controls ----------
  pieceSel.addEventListener('change', e => { e.target.blur(); if (pieceSel.value) open(pieceSel.value); });
  $('pcMode').addEventListener('change', e => { e.target.blur(); S.pieceMode = e.target.value; save(); stop(); idle(); });
  $('pcView').addEventListener('change', e => { e.target.blur(); S.pieceView = e.target.value; save(); stop(); draw(); idle(); });
  $('pcSlower').addEventListener('click', () => setTempo(S.pieceBpm - 4));
  $('pcFaster').addEventListener('click', () => setTempo(S.pieceBpm + 4));
  $('pcResetTempo').addEventListener('click', () => setTempo(item.piece.tempo || 100));
  for (const id of ['pcFrom', 'pcTo']) {
    $(id).addEventListener('change', e => {
      e.target.blur();
      from = Number($('pcFrom').value);
      to = Math.max(from, Number($('pcTo').value));
      $('pcTo').value = to;
      markRange();
    });
  }
  $('pcWhole').addEventListener('click', () => { from = 0; to = piece.measures.length - 1; fillRange(); markRange(); });
  $('pcDuetPart').addEventListener('change', e => { e.target.blur(); S.duetPart = Number(e.target.value); save(); open(item.id, true); });
  $('pcMyF').addEventListener('change', e => { e.target.blur(); S.myFingerings = e.target.checked; save(); if (!running) draw(); });
  $('pcHints').addEventListener('change', e => { e.target.blur(); S.pieceHints = e.target.value; save(); optionsSummary(); if (!running) draw(); });
  $('pcBacking').addEventListener('change', e => { e.target.blur(); S.pieceBacking = e.target.value; save(); optionsSummary(); });
  for (const [id, key] of [['pcClick', 'pieceClick'], ['pcGuide', 'pieceGuide'], ['pcLoop', 'pieceLoop'], ['pcRamp', 'pieceRamp'], ['pcAcc', 'pieceAcc'], ['pcMemo', 'pieceMemo'], ['pcDuet', 'pieceDuet']]) {
    $(id).addEventListener('change', e => { e.target.blur(); S[key] = e.target.checked; save(); optionsSummary(); $('pcScore').classList.toggle('memorize', S.pieceMemo); });
  }
  $('pcKey').addEventListener('change', e => {
    e.target.blur();
    store.pieceKey = store.pieceKey || {};
    if (e.target.value === '') delete store.pieceKey[item.id];
    else store.pieceKey[item.id] = Number(e.target.value);
    // A new key moves the notes, so let the octave be re-fitted.
    delete store.pieceShift[item.id];
    save();
    open(item.id, true);
  });
  $('pcOct').addEventListener('change', e => {
    e.target.blur();
    store.pieceShift[item.id] = Number(e.target.value);
    save();
    open(item.id, true);
  });
  $('pcDelete').addEventListener('click', () => {
    if (!item.mine || !confirm(`Delete “${item.title}” from your pieces?`)) return;
    store.myPieces = store.myPieces.filter(p => p.id !== item.id);
    save();
    TP.piecesLib.fillPieceList();
    open(LIBRARY[0].id);
  });
  $('pcEdit').addEventListener('click', () => TP.openImport({ abc: item.abc, id: item.mine ? item.id : null, title: item.mine ? item.title : item.title + ' (my copy)' }));
  $('pcImport').addEventListener('click', () => TP.openImport());
  $('pcNew').addEventListener('click', () => { delete sightCache[item.id]; open(item.id); });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (!$('panel-pieces').hidden && !running) draw(); }, 200);
  });

  // Called by the import dialog after saving.
  TP.piecesChanged = id => { TP.piecesLib.fillPieceList(); if (id) open(id); };

  TP.modes.pieces = {
    panel: 'panel-pieces',
    valves: true,
    enter() {
      TP.piecesLib.fillPieceList();
      $('pcMode').value = S.pieceMode;
      $('pcView').value = S.pieceView;
      $('pcClick').checked = S.pieceClick;
      $('pcGuide').checked = S.pieceGuide;
      $('pcLoop').checked = S.pieceLoop;
      $('pcRamp').checked = S.pieceRamp;
      $('pcAcc').checked = S.pieceAcc;
      $('pcMemo').checked = S.pieceMemo;
      $('pcDuet').checked = S.pieceDuet;
      $('pcMyF').checked = S.myFingerings;
      $('pcHints').value = S.pieceHints || 'off';
      $('pcBacking').value = S.pieceBacking || 'none';
      open(S.pieceId || LIBRARY[0].id, item && item.id === S.pieceId);
    },
    leave() { stop(); },
    autoStart: () => !running && S.pieceMode !== 'listen',
    settingsChanged() { if (item) open(item.id, true); },
    preloadNotes: () => (tl ? [...new Set(tl.notes.map(n => n.midi))] : []),
    submit,
    hear() {
      if (running && running.kind === 'wait') { const n = running.queue[running.k]; if (n) TP.playMidi(n.midi); }
    },
    key(k) {
      if (k === ' ' || k === 'enter') { submit(); return true; }
      if (k === 'escape') { stop(); draw(); idle(); return true; }
      if (k === 'h') { this.hear(); return true; }
      if (k === 'p' && lastTake && !running) { replay(); return true; }
      if (k === 'b' && !running) { TP.piecesLib.openLibrary(); return true; }
      if ((k === '[' || k === ']') && !running) { TP.piecesLib.step(k === ']' ? 1 : -1); return true; }
      if (k === 'n' && item && item.sight && !running) { $('pcNew').click(); return true; }
      if (k === '+' || k === '=') { setTempo(S.pieceBpm + 4); return true; }
      if (k === '-') { setTempo(S.pieceBpm - 4); return true; }
      return false;
    },
  };
})();
