// Pieces mode: play real music — exercises, études, melodies, or your own
// imported scores. Three ways: play along with the metronome (graded on each
// note), wait-for-me (it waits until you play each note right), or listen.
(() => {
  'use strict';
  const { S, store, save, $ } = TP;
  const SC = TP.score;

  store.myPieces = store.myPieces || [];
  store.pieces = store.pieces || {};

  // ---------- sight-reading: a new melody every time ----------
  const SIGHT = {
    1: { keys: ['C', 'F', 'Bb', 'G', 'Eb'], meters: [[4, 4]], tempo: 72,
      steps: [[1, 80], [2, 20]],
      cells: [{ b: 1, d: [24], w: 4 }, { b: 2, d: [48], w: 2 }, { b: 3, d: [72], w: 0.4 }, { b: 4, d: [96], w: 0.3 }, { b: 1, d: [-24], w: 0.4 }] },
    2: { keys: ['C', 'F', 'Bb', 'Eb', 'G', 'D', 'Ab'], meters: [[4, 4], [3, 4]], tempo: 80,
      steps: [[1, 60], [2, 30], [3, 7], [4, 3]],
      cells: [{ b: 1, d: [24], w: 3 }, { b: 2, d: [48], w: 1.2 }, { b: 1, d: [12, 12], w: 3 }, { b: 2, d: [36, 12], w: 1.2 },
        { b: 1, d: [-12, 12], w: 0.5 }, { b: 1, d: [-24], w: 0.4 }, { b: 3, d: [72], w: 0.3 }] },
    3: { keys: ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'G', 'D', 'A', 'E'], meters: [[4, 4], [3, 4], [2, 4]], tempo: 88,
      steps: [[1, 50], [2, 30], [3, 10], [4, 7], [5, 3]],
      cells: [{ b: 1, d: [24], w: 2 }, { b: 1, d: [12, 12], w: 2.5 }, { b: 2, d: [36, 12], w: 1.2 }, { b: 1, d: [6, 6, 6, 6], w: 1.5 },
        { b: 1, d: [12, 6, 6], w: 1.5 }, { b: 1, d: [18, 6], w: 1.5 }, { b: 2, d: [12, 24, 12], w: 0.8 },
        { b: 1, d: [8, 8, 8], w: 1, tuplet: true }, { b: 2, d: [48], w: 0.8 }, { b: 1, d: [-12, 12], w: 0.5 }] },
  };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const weighted = (arr, w) => { let r = Math.random() * arr.reduce((a, x) => a + w(x), 0); for (const x of arr) if ((r -= w(x)) <= 0) return x; return arr[arr.length - 1]; };

  function sightPiece(level) {
    const L = SIGHT[level];
    const key = pick(L.keys), [beats, beatType] = pick(L.meters);
    const letters = TP.majorLetters(key);
    // Scale notes you can play in your practice range.
    let scale = TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high && letters[m % 12]);
    if (scale.length < 6) scale = TP.ALL_MIDI.filter(m => letters[m % 12]);
    const tonicPc = TP.tonicPc(key);
    const tonics = scale.map((m, i) => [m, i]).filter(([m]) => m % 12 === tonicPc);
    const mid = scale.length / 2;
    let at = (tonics.length ? tonics.reduce((a, b) => (Math.abs(b[1] - mid) < Math.abs(a[1] - mid) ? b : a)) : [0, Math.floor(mid)])[1];
    const home = at;
    let dir = Math.random() < 0.5 ? 1 : -1;
    const stepNext = () => {
      const [n] = weighted(L.steps, s => s[1]);
      if (Math.random() < 0.3) dir = -dir;
      let nx = at + dir * n;
      if (nx < 0 || nx >= scale.length) { dir = -dir; nx = at + dir * n; }
      at = Math.max(0, Math.min(scale.length - 1, nx));
      return scale[at];
    };
    const note = (midi, dur, tuplet) => {
      const n = TP.spellAs(midi, letters[midi % 12]);
      return { midi, letter: n.letter, acc: n.acc, octave: n.octave, dur, tie: false, tuplet: tuplet ? { actual: 3, normal: 2 } : null };
    };
    const BARS = 8, barTicks = beats * 96 / beatType, beatT = 96 / beatType;
    const measures = [];
    for (let bar = 0; bar < BARS; bar++) {
      const evs = [];
      if (bar === BARS - 1) {
        // End on the tonic nearest where the tune is.
        const tonic = tonics.length ? tonics.reduce((a, b) => (Math.abs(b[1] - at) < Math.abs(a[1] - at) ? b : a))[0] : scale[home];
        evs.push(note(tonic, barTicks));
        measures.push(evs);
        break;
      }
      let beat = 0;
      while (beat < beats) {
        const pool = L.cells.filter(c => c.b <= beats - beat && !(c.b === 4 && beat !== 0) && !(bar === 0 && beat === 0 && c.d[0] < 0));
        const c = weighted(pool, x => x.w);
        for (const d of c.d) {
          const t = Math.abs(d) * beatT / 24;
          evs.push(d < 0 ? { midi: null, dur: t, tie: false } : note(bar === 0 && beat === 0 && !evs.length ? scale[at] : stepNext(), t, c.tuplet));
        }
        beat += c.b;
      }
      measures.push(evs);
    }
    return { title: `Sight-reading · level ${level}`, composer: '', fifths: TP.MAJOR_FIFTHS[key] || 0, beats, beatType, tempo: L.tempo, measures, keyName: key };
  }
  const sightCache = {};

  // Lip slurs: one fingering, moving between its partials (the notes that fingering
  // plays) inside your practice range. Best with the mic, which hears the partial.
  const SLUR_PATTERNS = { pairs: 'two partials', triples: 'three partials', arpeggio: 'up and down the series' };
  function partialsFor(f) {
    return TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high && FINGERINGS[m] && FINGERINGS[m].includes(f));
  }
  function slurPiece(f, pattern) {
    const ps = partialsFor(f);
    const q = 24, measures = [];
    const note = (midi, dur) => {
      const n = TP.spell(midi, 'flats');
      return { midi, letter: n.letter, acc: n.acc, octave: n.octave, dur, tie: false };
    };
    const rest = dur => ({ midi: null, dur, tie: false });
    if (pattern === 'arpeggio') {
      const up = ps.concat(ps.slice(0, -1).reverse());
      for (let i = 0; i < up.length; i += 4) measures.push(up.slice(i, i + 4).map(m => note(m, q)));
      const last = measures[measures.length - 1];
      while (last.reduce((t, e) => t + e.dur, 0) < 4 * q) last.push(rest(q));
      measures.push([note(ps[0], 4 * q)]);
    } else {
      const span = pattern === 'triples' ? 3 : 2;
      for (let i = 0; i + span <= ps.length; i++) {
        const g = ps.slice(i, i + span);
        const line = span === 2 ? [g[0], g[1], g[0], g[1]] : [g[0], g[1], g[2], g[1]];
        measures.push(line.map(m => note(m, q)));
        measures.push([note(g[0], 2 * q), rest(2 * q)]);
      }
    }
    return { title: `Lip slurs · ${TP.fmtFingering(f)}`, composer: '', fifths: 0, beats: 4, beatType: 4, tempo: 72, measures };
  }
  TP.slurOptions = () => {
    // Fingerings with at least two partials in range, most open first.
    const fs = [...new Set(TP.ALL_MIDI.flatMap(m => FINGERINGS[m] || []))];
    return fs.filter(f => partialsFor(f).length >= 2)
      .sort((a, b) => (INSTRUMENTS.LOWER[a] || Number(a) || 0) - (INSTRUMENTS.LOWER[b] || Number(b) || 0));
  };
  TP.slurPatterns = SLUR_PATTERNS;

  // ---------- the piece list ----------
  const parsedLib = {};
  function libraryPiece(item) {
    if (!parsedLib[item.id]) parsedLib[item.id] = SC.parseABC(item.abc);
    return parsedLib[item.id];
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
    if (lib) return { id, title: lib.title, composer: lib.composer || '', level: lib.level, note: lib.note || '', mic: lib.mic, cat: lib.cat, piece: libraryPiece(lib), builtIn: true, abc: lib.abc, acc: lib.acc };
    const mine = store.myPieces.find(p => p.id === id);
    if (mine) return { id, title: mine.title, composer: mine.piece.composer || '', note: mine.source === 'abc' ? 'Your ABC piece' : `Imported${mine.partName ? ' — ' + mine.partName : ''}`, cat: 'My pieces', piece: mine.piece, abc: mine.abc, mine: true };
    return null;
  }

  // ---------- library browser: cards by category, with your best score ----------
  let libCat = 'All';
  function libEntries() {
    // Method books are listed book by book.
    const out = LIBRARY.map(p => ({ id: p.id, title: p.title, composer: p.composer || '', level: p.level, cat: p.book || p.cat, note: p.note || '' }));
    for (const l of [1, 2, 3]) out.push({ id: 'sight-' + l, title: `Sight-reading — level ${l}`, composer: 'New every time', level: l, cat: 'Sight-reading', note: '' });
    for (const p of store.myPieces) out.push({ id: p.id, title: p.title, composer: p.piece.composer || '', level: 0, cat: 'My pieces', note: '' });
    return out;
  }
  const starsFor = pct => (pct >= 95 ? '★★★' : pct >= 80 ? '★★☆' : pct >= 60 ? '★☆☆' : '☆☆☆');
  function renderLibrary() {
    // Search ignores case and accents ("etude" finds "Étude").
    const fold = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const all = libEntries(), q = fold($('libSearch').value.trim());
    const cats = ['All', ...new Set(all.map(e => e.cat))];
    $('libChips').innerHTML = cats.map(c => `<button type="button" class="lib-chip${c === libCat ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('');
    const shown = all.filter(e => (libCat === 'All' || e.cat === libCat)
      && (!q || fold(e.title + ' ' + e.composer + ' ' + e.cat).includes(q)));
    const list = $('libList');
    list.textContent = '';
    let lastCat = null;
    for (const e of shown) {
      if (libCat === 'All' && e.cat !== lastCat) {
        lastCat = e.cat;
        const h = document.createElement('h3');
        h.className = 'lib-cat';
        h.textContent = e.cat;
        list.appendChild(h);
      }
      const rec = store.pieces[e.id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lib-card' + (item && item.id === e.id ? ' current' : '') + (rec ? ' tried' : '');
      card.dataset.id = e.id;
      card.innerHTML = `<span class="lib-title"></span><span class="lib-sub"></span>
        <span class="lib-foot"><span class="lib-level">${e.level ? '●'.repeat(e.level) + '<i>' + '●'.repeat(3 - e.level) + '</i>' : ''}</span>
        <span class="lib-best">${rec ? `<b>${starsFor(rec.best)}</b> ${rec.best}%` : 'not played yet'}</span></span>`;
      card.querySelector('.lib-title').textContent = e.title;
      card.querySelector('.lib-sub').textContent = e.composer;
      list.appendChild(card);
    }
    if (!shown.length) list.innerHTML = '<p class="sub center">Nothing matches. Add your own with ＋ Add music.</p>';
  }
  function openLibrary() {
    stop();
    $('libSearch').value = '';
    libCat = 'All';
    renderLibrary();
    $('libDlg').showModal();
    const cur = $('libList').querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  $('pcBrowse').addEventListener('click', e => { e.currentTarget.blur(); openLibrary(); });
  $('libSearch').addEventListener('input', renderLibrary);
  $('libChips').addEventListener('click', e => {
    const b = e.target.closest('.lib-chip');
    if (b) { libCat = b.dataset.cat; renderLibrary(); }
  });
  $('libList').addEventListener('click', e => {
    const c = e.target.closest('.lib-card');
    if (!c) return;
    $('libDlg').close();
    open(c.dataset.id);
  });
  $('libSearch').addEventListener('keydown', e => {
    // Enter opens the first match.
    if (e.key === 'Enter') { const c = $('libList').querySelector('.lib-card'); if (c) c.click(); }
  });

  // The pieces in the same book (or category), in order, for ‹ › stepping.
  function siblings() {
    if (!item || item.sight || item.slur) return [];
    if (item.mine) return store.myPieces.map(p => p.id);
    const lib = LIBRARY.find(p => p.id === item.id);
    if (!lib) return [];
    const group = p => p.book || p.cat;
    return LIBRARY.filter(p => group(p) === group(lib)).map(p => p.id);
  }
  function step(d) {
    const sib = siblings(), k = sib.indexOf(item.id) + d;
    if (k >= 0 && k < sib.length) open(sib[k]);
  }
  $('pcPrev').addEventListener('click', () => step(-1));
  $('pcNext').addEventListener('click', () => step(1));

  const pieceSel = $('pcPiece');
  function fillPieceList() {
    pieceSel.textContent = '';
    const group = p => p.book || p.cat;
    const cats = [...new Set(LIBRARY.map(group))];
    for (const c of cats) {
      const og = document.createElement('optgroup');
      og.label = c;
      for (const p of LIBRARY.filter(q => group(q) === c)) og.appendChild(new Option(`${p.title}${'  ' + '●'.repeat(p.level)}`, p.id));
      pieceSel.appendChild(og);
    }
    const sg = document.createElement('optgroup');
    sg.label = 'Sight-reading (new each time)';
    for (const l of [1, 2, 3]) sg.appendChild(new Option(`Sight-reading — level ${l}  ${'●'.repeat(l)}`, 'sight-' + l));
    pieceSel.appendChild(sg);
    const og = document.createElement('optgroup');
    og.label = 'My pieces';
    if (store.myPieces.length) for (const p of store.myPieces) og.appendChild(new Option(p.title, p.id));
    else { const o = new Option('(none yet — use Import or Write)', ''); o.disabled = true; og.appendChild(o); }
    pieceSel.appendChild(og);
  }

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
    const sib = siblings();
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
  }

  // ---------- history: accuracy and tempo of your runs on this piece ----------
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  function renderHist() {
    const runs = (store.pieceHist && store.pieceHist[item.id]) || [];
    $('pcHist').hidden = runs.length < 2;
    if (runs.length < 2) { $('pcHist').open = false; return; }
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
      play: 'Press Space to start — one bar of clicks, then play each note on time.',
      wait: 'Press Space to start — it waits on each note until you play it right.',
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
    const countBeats = Math.max(1, Math.round(barT / bt));
    const t0 = ctx.currentTime + 0.3;
    const tStart = t0 + countBeats * bt * spt;
    running = { kind, r, results: [], combo: 0, bars: {}, tune: [] };
    if (kind === 'play' && usingMic()) running.take = startTake({ tStart, startT: sel.startT, spt });
    TP.setSubmitLabel('Stop');
    follow(r, tStart, sel.startT, spt);
    hud();

    for (let b = 0; b < countBeats; b++) {
      r.click(t0 + b * bt * spt, b === 0);
      r.at(t0 + b * bt * spt, () => say(String(b + 1), 'count'));
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
    sel.notes.forEach((n, k) => {
      const t = tStart + (n.start - sel.startT) * spt;
      // A repeat of the note before has to be played again, not just held over.
      const again = k > 0 && sel.notes[k - 1].midi === n.midi;
      const dur = n.dur * spt;
      if (kind === 'listen' || S.pieceGuide) r.play(n.midi, Math.max(0.12, dur * 0.95), t, false);
      r.at(t, () => view.setCurrent(n.i, !scrolling()));
      if (kind !== 'play' || !gradable(n.midi)) return;
      const grace = TP.graceFor(dur);
      // Your note sounds as you play it (valves) — unless the guide is already playing it.
      if (!mic && !S.pieceGuide) TP.soundAsYouPlay(r, t, n.midi, dur, grace);
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
        running.results.push(grade);
        const bar = running.bars[n.m] || (running.bars[n.m] = { bad: 0, n: 0 });
        bar.n++;
        bar.bad += grade === 'miss' ? 1 : grade === 'late' ? 0.4 : 0;
        mark(n, grade === 'perfect' ? 'good' : grade);
        if (grade === 'miss') {
          running.combo = 0;
          // Show the right fingering under the note, like a teacher's pencil mark.
          if (FINGERINGS[n.midi]) view.annotate(n.i, TP.fmtFingering(FINGERINGS[n.midi][0]), 'miss');
          say(missText(n, played), 'bad');
        } else if (++running.combo >= 8 && running.combo % 4 === 0) say(`Combo ${running.combo}`, 'good');
        else if (grade === 'perfect') say('');
        hud();
        TP.activity();
        // With the mic, also note how in tune the held part of the note was.
        if (mic && grade !== 'miss' && dur >= 0.25) {
          r.at(t + Math.max(win, dur * 0.9) + 0.05, () => {
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
      const take = { ...info, rec, dest, src, chunks: [], t0: ctx.currentTime };
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

  // Piano accompaniment ("start,dur,midi;..." in ticks, concert pitch), from where the passage starts.
  const accCache = {};
  let accWarned = false, guideWarned = false;
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
    if (running && running.take) { endTake(running.take); running.take = null; }
    if (kind === 'listen') { running = null; idle(); return; }
    const total = res.length;
    if (!total) { running = null; idle(); return; }
    const perfect = res.filter(g => g === 'perfect').length, late = res.filter(g => g === 'late').length;
    const pct = Math.round(((perfect + 0.6 * late) / total) * 100);
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
    const spot = pct < 95 ? troubleSpot(running.bars) : null;
    const tune = running.tune;
    running = null;
    TP.setSubmitLabel('Start');
    say(msg + '. Space to play again.', pct >= 80 ? 'good' : '');
    if (spot) offerSpot(spot);
    else if (pct >= 80) offerNext();
    if (tune.length >= 3) tuningReport(tune);
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
    const sib = siblings(), nextId = sib[sib.indexOf(item.id) + 1];
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
  for (const [id, key] of [['pcClick', 'pieceClick'], ['pcGuide', 'pieceGuide'], ['pcLoop', 'pieceLoop'], ['pcRamp', 'pieceRamp'], ['pcAcc', 'pieceAcc'], ['pcMemo', 'pieceMemo']]) {
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
    fillPieceList();
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
  TP.piecesChanged = id => { fillPieceList(); if (id) open(id); };

  TP.modes.pieces = {
    panel: 'panel-pieces',
    valves: true,
    enter() {
      fillPieceList();
      $('pcMode').value = S.pieceMode;
      $('pcView').value = S.pieceView;
      $('pcClick').checked = S.pieceClick;
      $('pcGuide').checked = S.pieceGuide;
      $('pcLoop').checked = S.pieceLoop;
      $('pcRamp').checked = S.pieceRamp;
      $('pcAcc').checked = S.pieceAcc;
      $('pcMemo').checked = S.pieceMemo;
      open(S.pieceId || LIBRARY[0].id, item && item.id === S.pieceId);
    },
    leave() { stop(); },
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
      if (k === 'b' && !running) { openLibrary(); return true; }
      if ((k === '[' || k === ']') && !running) { step(k === ']' ? 1 : -1); return true; }
      if (k === 'n' && item && item.sight && !running) { $('pcNew').click(); return true; }
      if (k === '+' || k === '=') { setTempo(S.pieceBpm + 4); return true; }
      if (k === '-') { setTempo(S.pieceBpm - 4); return true; }
      return false;
    },
  };
})();
