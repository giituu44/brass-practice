// Music made on the spot for Pieces: sight-reading melodies (new every time) and
// lip slurs over one fingering's partials, in written pitch for the current instrument.
TP.gen = (() => {
  'use strict';
  const { S } = TP;

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

  return { sightPiece, slurPiece, partialsFor, SLUR_PATTERNS };
})();
