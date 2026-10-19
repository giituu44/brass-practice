// Scores: the piece model, parsers (ABC notation, MusicXML / compressed MXL)
// and a notation renderer that lays a piece out over several lines of music.
//
// Piece: { title, composer, fifths, beats, beatType, tempo (quarter-note bpm),
//          measures: [[event…]] }
// Event: { midi|null (rest), letter, acc, octave, dur (ticks), tie, tuplet }
// Time is counted in ticks: 24 per quarter note (so triplets and 32nds fit).
TP.score = (() => {
  'use strict';
  const { el, stepOf, yOf } = TP;
  const TPQ = 24, WHOLE = 96;
  const NAT = TP.NATURAL_PC;

  // ---------- model helpers ----------
  // Every event with its start time and measure; and the notes you actually
  // play (tied notes merged into one).
  function timeline(piece) {
    const events = [], notes = [], measureStarts = [];
    let t = 0;
    piece.measures.forEach((m, mi) => {
      measureStarts.push(t);
      for (const e of m) {
        events.push({ ...e, start: t, m: mi, i: events.length });
        t += e.dur;
      }
    });
    let open = null;
    for (const e of events) {
      if (e.midi === null) { open = null; continue; }
      if (open && open.midi === e.midi && open.tieOpen) {
        open.dur += e.dur;
        open.last = e.i;
        open.tieOpen = e.tie;
        continue;
      }
      open = { i: e.i, last: e.i, midi: e.midi, start: e.start, dur: e.dur, m: e.m, tieOpen: e.tie };
      notes.push(open);
    }
    return { events, notes, measureStarts, total: t };
  }

  // Ticks per beat, as you'd count it: 6/8 counts in dotted quarters.
  function beatTicks(piece) {
    if (piece.beatType === 8 && piece.beats % 3 === 0 && piece.beats > 3) return 36;
    return (WHOLE / piece.beatType);
  }

  // ---------- ABC ----------
  // The common subset: header fields, notes and rests with lengths, accidentals,
  // octave marks, ties, triplets, broken rhythm, chords (top note), repeats
  // with first/second endings, inline field changes. Decorations are ignored.
  function keyFromABC(k) {
    const m = (k || 'C').trim().match(/^(none|[A-G])([#b]?)\s*(m(?:in|aj)?|ion|mix|dor|aeo|phr|loc|lyd)?/i);
    if (!m || m[1].toLowerCase() === 'none') return 0;
    const base = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 }[m[1].toUpperCase()];
    const acc = m[2] === '#' ? 7 : m[2] === 'b' ? -7 : 0;
    const mode = (m[3] || '').toLowerCase();
    const off = { m: -3, min: -3, aeo: -3, dor: -2, phr: -4, loc: -5, mix: -1, lyd: 1 }[mode] || 0;
    return base + acc + off;
  }
  function frac(s, dflt) {
    const m = (s || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    return m ? Number(m[1]) / Number(m[2]) : dflt;
  }
  function meterFromABC(s) {
    s = (s || '4/4').trim();
    if (s === 'C') return [4, 4];
    if (s === 'C|') return [2, 2];
    const m = s.match(/^(\d+)\s*\/\s*(\d+)/);
    return m ? [Number(m[1]), Number(m[2])] : [4, 4];
  }
  function tempoFromABC(s) {
    if (!s) return null;
    const m = s.match(/(\d+)\s*\/\s*(\d+)\s*=\s*(\d+)/);
    if (m) return Math.round(Number(m[3]) * (Number(m[1]) / Number(m[2])) * 4);
    const n = s.match(/(\d+)/);
    return n ? Number(n[1]) : null;
  }

  function parseABC(text) {
    const head = { T: '', C: '', M: null, L: null, Q: null, K: 'C' };
    let body = '', inBody = false;
    for (const raw of text.replace(/\r/g, '').split('\n')) {
      const line = raw.replace(/(^|[^\\])%.*$/, '$1');
      const f = line.match(/^\s*([A-Za-z]):\s*(.*)$/);
      if (f && !inBody) {
        if (f[1] === 'K') { head.K = f[2]; inBody = true; }
        else if (!(f[1] === 'T' && head.T)) head[f[1]] = f[2].trim();
        continue;
      }
      if (f && inBody) {
        if (/^[KLMQ]$/.test(f[1])) body += ` [${f[1]}:${f[2]}] `;
        continue;
      }
      if (inBody) body += line + ' ';
    }
    if (!inBody) throw new Error('No K: (key) line found — ABC tunes need X:, T:, M:, L:, K: and then the notes.');

    let [beats, beatType] = meterFromABC(head.M);
    let unit = frac(head.L, beats / beatType < 0.75 ? 1 / 16 : 1 / 8);
    let fifths = keyFromABC(head.K);
    const tempo = tempoFromABC(head.Q) || 100;

    const measures = [];
    let cur = { events: [] }, carry = new Map();
    let nextFlags = {};
    let tuplet = null, broken = 1, last = null, dyn = null;

    const pushMeasure = () => {
      if (cur.events.length) measures.push(cur);
      cur = { events: [], ...nextFlags };
      nextFlags = {};
      carry = new Map();
    };
    const readLength = s => {
      const m = s.match(/^(\d*)(\/*)(\d*)/);
      let num = m[1] ? Number(m[1]) : 1;
      let den = 1;
      if (m[2]) den = m[3] ? Number(m[3]) * Math.pow(2, m[2].length - 1) : Math.pow(2, m[2].length);
      return { len: num / den, used: m[0].length };
    };
    const addEvent = ev => {
      ev.dur *= broken;
      broken = 1;
      if (tuplet) {
        ev.dur *= tuplet.factor;
        ev.tuplet = { actual: tuplet.actual, normal: tuplet.normal };
        if (--tuplet.left <= 0) tuplet = null;
      }
      ev.dur = Math.max(1, Math.round(ev.dur));
      if (dyn && ev.midi !== null) { ev.dyn = dyn; dyn = null; }
      cur.events.push(ev);
      last = ev;
    };

    let i = 0;
    const s = body;
    while (i < s.length) {
      const c = s[i];
      const rest = s.slice(i);
      let m;
      if (/\s/.test(c)) { i++; continue; }
      // inline fields: [K:Bb] [L:1/8] [M:3/4] [Q:...]
      if ((m = rest.match(/^\[([KLMQ]):([^\]]*)\]/))) {
        if (m[1] === 'K') fifths = keyFromABC(m[2]);
        if (m[1] === 'L') unit = frac(m[2], unit);
        if (m[1] === 'M') [beats, beatType] = meterFromABC(m[2]);
        i += m[0].length;
        continue;
      }
      // endings: [1  [2  |1  :|2
      if ((m = rest.match(/^\[([12])/))) { nextFlags.ending = Number(m[1]); if (!cur.events.length) cur.ending = Number(m[1]); i += m[0].length; continue; }
      // bar lines and repeats
      if ((m = rest.match(/^(:*\|[\]|:]*|\[\||::)([12])?/))) {
        const bar = m[1];
        if (bar.startsWith(':') || bar === '::') cur.repeatEnd = true;
        pushMeasure();
        if (bar.endsWith(':') || bar === '::') cur.repeatStart = true;
        if (m[2]) cur.ending = Number(m[2]);
        i += m[0].length;
        continue;
      }
      if (c === '"') { const j = s.indexOf('"', i + 1); i = j < 0 ? s.length : j + 1; continue; }
      if (c === '!' || c === '+') {
        const j = s.indexOf(c, i + 1);
        // !breath! right after a note: breathe after that note. !p! !mf! !ff!…: dynamics.
        const deco = j > i ? s.slice(i + 1, j) : '';
        if (deco === 'breath' && last) last.breath = true;
        if (/^(ppp|pp|p|mp|mf|f|ff|fff)$/.test(deco)) dyn = deco;
        i = j < 0 ? s.length : j + 1;
        continue;
      }
      if (c === '{') { const j = s.indexOf('}', i); i = j < 0 ? s.length : j + 1; continue; }
      if ((m = rest.match(/^\((\d)/))) {
        const n = Number(m[1]);
        const normal = { 2: 3, 3: 2, 4: 3, 6: 2 }[n] || 2;
        tuplet = { actual: n, normal, factor: normal / n, left: n };
        i += m[0].length;
        continue;
      }
      if (c === '(' || c === ')' || c === '.' || c === '~' || c === '`' || c === '\\') { i++; continue; }
      if ((m = rest.match(/^(>+|<+)/))) {
        const n = m[1].length, big = 2 - Math.pow(0.5, n), small = Math.pow(0.5, n);
        if (last) {
          const before = last.dur;
          last.dur = Math.round(before * (m[1][0] === '>' ? big : small));
        }
        broken = m[1][0] === '>' ? small : big;
        i += n;
        continue;
      }
      if (c === '-') { if (last && last.midi !== null) last.tie = true; i++; continue; }
      // multi-measure rest
      if ((m = rest.match(/^Z(\d*)/))) {
        const n = m[1] ? Number(m[1]) : 1;
        for (let k = 0; k < n; k++) {
          cur.events.push({ midi: null, dur: beats * WHOLE / beatType, tie: false });
          pushMeasure();
        }
        i += m[0].length;
        continue;
      }
      // rests
      if ((m = rest.match(/^[zx]/))) {
        i++;
        const L = readLength(s.slice(i));
        i += L.used;
        addEvent({ midi: null, dur: WHOLE * unit * L.len, tie: false });
        continue;
      }
      // chord: use its first (lowest written) note
      if (c === '[') {
        const j = s.indexOf(']', i);
        const inner = s.slice(i + 1, j < 0 ? s.length : j);
        const n = inner.match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)(\d*\/*\d*)/);
        i = j < 0 ? s.length : j + 1;
        const L = readLength(s.slice(i));
        i += L.used;
        if (n) {
          const ev = makeNote(n[1], n[2], n[3], fifths, carry);
          ev.dur = WHOLE * unit * readLength(n[4]).len * L.len;
          addEvent(ev);
        }
        continue;
      }
      // notes
      if ((m = rest.match(/^(\^{1,2}|_{1,2}|=)?([A-Ga-g])([,']*)/))) {
        i += m[0].length;
        const L = readLength(s.slice(i));
        i += L.used;
        const ev = makeNote(m[1], m[2], m[3], fifths, carry);
        ev.dur = WHOLE * unit * L.len;
        addEvent(ev);
        continue;
      }
      i++; // anything else (decoration letters, stray symbols): skip
    }
    pushMeasure();

    return {
      title: head.T || 'Untitled', composer: head.C || '',
      fifths: keyFromABC(head.K), beats: meterFromABC(head.M)[0], beatType: meterFromABC(head.M)[1],
      tempo, measures: expandRepeats(measures),
    };
  }

  function makeNote(accTok, letterTok, octTok, fifths, carry) {
    const letter = letterTok.toUpperCase();
    let octave = letterTok === letter ? 4 : 5;
    for (const ch of octTok) octave += ch === "'" ? 1 : -1;
    const key = letter + octave;
    let acc;
    if (accTok) {
      acc = { '^': 1, '^^': 2, '_': -1, '__': -2, '=': 0 }[accTok];
      carry.set(key, acc);
    } else {
      acc = carry.has(key) ? carry.get(key) : TP.keySigAcc(fifths, letter);
    }
    return { midi: (octave + 1) * 12 + NAT[letter] + acc, letter, acc, octave, dur: 0, tie: false };
  }

  // |: A [1 B :| [2 C |  ->  A B A C
  function expandRepeats(ms) {
    let inEnd1 = false;
    for (const m of ms) {
      if (m.ending === 1) inEnd1 = true;
      else if (m.ending) inEnd1 = false;
      m.inEnding1 = inEnd1;
      if (m.repeatEnd) inEnd1 = false;
    }
    const out = [];
    let start = 0;
    const copy = m => m.events.map(e => ({ ...e }));
    ms.forEach((m, i) => {
      if (m.repeatStart) start = i;
      out.push(copy(m));
      if (m.repeatEnd) {
        for (let j = start; j <= i; j++) if (!ms[j].inEnding1) out.push(copy(ms[j]));
        start = i + 1;
      }
    });
    return out;
  }

  // ---------- MusicXML ----------
  function musicXMLParts(xml) {
    const doc = parseXML(xml);
    return [...doc.querySelectorAll('part-list > score-part')].map(p => {
      const n = p.querySelector('part-name');
      return (n && n.textContent.trim()) || p.getAttribute('id');
    });
  }
  function parseXML(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('That file isn’t valid MusicXML.');
    if (doc.documentElement.nodeName === 'score-timewise') throw new Error('This is “timewise” MusicXML — please export it as normal (partwise) MusicXML.');
    if (doc.documentElement.nodeName !== 'score-partwise') throw new Error('That doesn’t look like a MusicXML score.');
    return doc;
  }

  function parseMusicXML(xml, partIndex = 0) {
    const doc = parseXML(xml);
    const parts = [...doc.querySelectorAll('score-partwise > part')];
    const part = parts[partIndex] || parts[0];
    if (!part) throw new Error('No parts in this score.');
    const txt = (root, sel) => { const n = root.querySelector(sel); return n ? n.textContent.trim() : ''; };
    const title = txt(doc, 'work > work-title') || txt(doc, 'movement-title') || 'Imported score';
    const composer = txt(doc, 'identification > creator[type="composer"]');

    let divisions = 1, fifths = null, beats = null, beatType = null, tempo = null, dynamic = null;
    let firstFifths = null, firstBeats = null, firstBeatType = null;
    let transChrom = 0, transDia = 0, voice = null;
    const measures = [];
    for (const m of part.querySelectorAll(':scope > measure')) {
      const events = [];
      for (const ch of m.children) {
        const name = ch.nodeName;
        if (name === 'attributes') {
          if (txt(ch, 'divisions')) divisions = Number(txt(ch, 'divisions'));
          if (txt(ch, 'key > fifths')) { fifths = Number(txt(ch, 'key > fifths')); if (firstFifths === null) firstFifths = fifths; }
          if (txt(ch, 'time > beats')) {
            beats = Number(txt(ch, 'time > beats').split('+')[0]);
            beatType = Number(txt(ch, 'time > beat-type'));
            if (firstBeats === null) { firstBeats = beats; firstBeatType = beatType; }
          }
          if (txt(ch, 'transpose > chromatic')) {
            transChrom = Number(txt(ch, 'transpose > chromatic')) + 12 * Number(txt(ch, 'transpose > octave-change') || 0);
            transDia = Number(txt(ch, 'transpose > diatonic') || 0) + 7 * Number(txt(ch, 'transpose > octave-change') || 0);
          }
        } else if (name === 'direction' || name === 'sound') {
          const dm = name === 'direction' ? ch.querySelector('direction-type > dynamics > *') : null;
          if (dm && /^(ppp|pp|p|mp|mf|f|ff|fff)$/.test(dm.tagName)) dynamic = dm.tagName;
          const snd = name === 'sound' ? ch : ch.querySelector('sound');
          if (tempo === null && snd && snd.getAttribute('tempo')) tempo = Math.round(Number(snd.getAttribute('tempo')));
          if (tempo === null && txt(ch, 'metronome > per-minute')) {
            const unitName = txt(ch, 'metronome > beat-unit');
            const mult = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 }[unitName] || 1;
            const dotted = ch.querySelector('metronome > beat-unit-dot') ? 1.5 : 1;
            tempo = Math.round(Number(txt(ch, 'metronome > per-minute')) * mult * dotted);
          }
        } else if (name === 'note') {
          if (ch.querySelector('grace') || ch.querySelector('chord')) continue;
          const v = txt(ch, 'voice') || '1';
          if (voice === null) voice = v;
          if (v !== voice) continue;
          if (txt(ch, 'staff') && txt(ch, 'staff') !== '1') continue;
          let dur = Math.round(Number(txt(ch, 'duration') || 0) * TPQ / divisions);
          if (!dur) continue;
          const tm = ch.querySelector('time-modification');
          const tuplet = tm ? { actual: Number(txt(tm, 'actual-notes')), normal: Number(txt(tm, 'normal-notes')) } : null;
          if (ch.querySelector('rest')) {
            events.push({ midi: null, dur, tie: false, tuplet });
            continue;
          }
          const step = txt(ch, 'pitch > step');
          const alter = Math.round(Number(txt(ch, 'pitch > alter') || 0));
          const oct = Number(txt(ch, 'pitch > octave'));
          let midi = (oct + 1) * 12 + NAT[step] + alter;
          let note = { midi, letter: step, acc: alter, octave: oct };
          if (transChrom) {
            // Written for a transposing instrument: convert to concert pitch.
            midi += transChrom;
            const li = ((TP.LETTERS.indexOf(step) + transDia) % 7 + 7) % 7;
            note = TP.spellAs(midi, TP.LETTERS[li]);
          }
          const tie = !!ch.querySelector('tie[type="start"]');
          const ev = { midi: note.midi, letter: note.letter, acc: note.acc, octave: note.octave, dur, tie, tuplet };
          if (dynamic) { ev.dyn = dynamic; dynamic = null; }
          events.push(ev);
        }
      }
      measures.push(events);
    }
    return {
      title, composer,
      fifths: firstFifths || 0, beats: firstBeats || 4, beatType: firstBeatType || 4,
      tempo: tempo || 100, measures,
      partName: musicXMLParts(xml)[partIndex] || '',
    };
  }

  // .mxl = zipped MusicXML. A tiny zip reader using the browser's own inflate.
  async function unzipMusicXML(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let p = buf.byteLength - 22; p >= Math.max(0, buf.byteLength - 70000); p--) {
      if (dv.getUint32(p, true) === 0x06054b50) { eocd = p; break; }
    }
    if (eocd < 0) throw new Error('That .mxl file isn’t a valid zip.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const size = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      files[name] = { method, size, local };
      p += 46 + nameLen + extraLen + commentLen;
    }
    const read = async name => {
      const f = files[name];
      const lh = f.local;
      const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
      const data = new Uint8Array(buf, start, f.size);
      if (f.method === 0) return dec.decode(data);
      if (f.method !== 8) throw new Error('Unsupported compression in .mxl file.');
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser can’t open .mxl files — export uncompressed .musicxml instead.');
      const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      return dec.decode(out);
    };
    let root = null;
    if (files['META-INF/container.xml']) {
      const m = (await read('META-INF/container.xml')).match(/full-path="([^"]+)"/);
      if (m && files[m[1]]) root = m[1];
    }
    if (!root) root = Object.keys(files).find(n => !n.startsWith('META-INF') && /\.(xml|musicxml)$/i.test(n));
    if (!root) throw new Error('No score found inside the .mxl file.');
    return read(root);
  }

  // ---------- rendering ----------
  const STD = [96, 72, 48, 36, 24, 18, 12, 9, 6, 3];
  const BASE = { 96: 96, 72: 48, 48: 48, 36: 24, 24: 24, 18: 12, 12: 12, 9: 6, 6: 6, 3: 3 };
  const BEAMS = { 12: 1, 6: 2, 3: 3 };
  const REST_GLYPH = { 24: '𝄽', 12: '𝄾', 6: '𝄿', 3: '𝄿' };

  // Split a written length into standard note values (tied when needed).
  function splitDur(t) {
    const out = [];
    let rem = t;
    while (rem >= 3) {
      const v = STD.find(x => x <= rem);
      out.push(v);
      rem -= v;
    }
    return out.length ? out : [t >= 2 ? 3 : 3];
  }

  // Lay out and draw `piece` into `container` as one SVG per line of music.
  // Returns a handle to colour notes, move the cursor and find what was clicked.
  function render(container, piece, opts = {}) {
    container.textContent = '';
    let W = Math.max(300, opts.width || container.clientWidth || 700);
    const fifths = piece.fifths || 0;
    const tl = timeline(piece);
    const beatT = beatTicks(piece);

    // Segments: what's drawn. Long or odd lengths become tied pieces.
    const measures = piece.measures.map(() => []);
    for (const e of tl.events) {
      const nominal = e.tuplet ? Math.round(e.dur * e.tuplet.actual / e.tuplet.normal) : e.dur;
      const parts = e.tuplet ? [STD.find(x => x <= nominal) || 3] : splitDur(nominal);
      let t = e.start;
      parts.forEach((v, k) => {
        measures[e.m].push({
          ev: e.i, e, v, base: BASE[v], dots: v !== BASE[v] ? 1 : 0, start: t,
          tieNext: e.midi !== null && (k < parts.length - 1 || e.tie), first: k === 0,
        });
        t += e.tuplet ? e.dur : v;
      });
    }
    // Accidentals to print, bar by bar.
    measures.forEach(segs => {
      const pitched = segs.filter(s => s.e.midi !== null);
      const accs = TP.shownAccidentals(pitched.map(s => s.e), fifths);
      pitched.forEach((s, k) => { s.acc = s.first ? accs[k] : null; });
    });

    const segW = s => 12 + 20 * Math.sqrt(s.v / TPQ) + (s.acc !== null && s.acc !== undefined ? 11 : 0) + (s.dots ? 5 : 0);
    const mWidth = segs => 18 + segs.reduce((a, s) => a + segW(s), 0);
    const header0 = TP.staffStart(fifths) + 26, header = TP.staffStart(fifths) + 4;

    // Break into lines.
    const lines = [];
    let line = { ms: [], w: header0 };
    measures.forEach((segs, mi) => {
      const w = mWidth(segs);
      if (line.ms.length && line.w + w > W - 8) { lines.push(line); line = { ms: [], w: header }; }
      line.ms.push(mi);
      line.w += w;
    });
    if (line.ms.length) lines.push(line);
    // Scrolling view: everything on one long line, a little more spread out.
    const SPREAD = 1.35;
    if (opts.singleLine) {
      const total = measures.reduce((a, segs) => a + mWidth(segs), 0);
      lines.length = 0;
      lines.push({ ms: measures.map((_, i) => i), w: header0 + total, single: true });
      W = Math.ceil(header0 + total * SPREAD + 40);
    }

    // One vertical size for every line so the page doesn't jump.
    const steps = tl.events.filter(e => e.midi !== null).map(e => stepOf(e));
    const lo = Math.min(-3, ...steps.map(s => s - 5)), hi = Math.max(11, ...steps.map(s => s + 5));
    const top = yOf(hi), bottom = yOf(lo);

    const evEls = new Map();
    const evX = new Map();      // event -> { line svg, x }
    const track = [];           // { t (ticks), x, svg } — where each moment of the music is drawn
    const lineEls = [];
    const tiePending = [];      // ties drawn once both ends are placed

    lines.forEach((ln, li) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'score-line');
      svg.setAttribute('viewBox', `0 ${top} ${W} ${bottom - top}`);
      svg.style.width = W + 'px';
      container.appendChild(svg);
      lineEls.push(svg);
      const add = (tag, a, t, parent = svg) => parent.appendChild(el(tag, a, t));
      TP.drawStaffBase(svg, W, fifths);
      let x = li === 0 ? header0 : header;
      if (li === 0) {
        const tx = TP.staffStart(fifths) + 10;
        add('text', { x: tx, y: yOf(4) - 2, 'font-size': 23, 'text-anchor': 'middle', class: 'timesig' }, piece.beats);
        add('text', { x: tx, y: yOf(0) - 2, 'font-size': 23, 'text-anchor': 'middle', class: 'timesig' }, piece.beatType);
      } else {
        add('text', { x: 8, y: yOf(8) - 8, 'font-size': 10, class: 'mnum' }, ln.ms[0] + 1);
      }
      // Stretch to the full width (but not a short last line).
      const natural = ln.w;
      const isLast = li === lines.length - 1;
      const stretch = ln.single ? SPREAD
        : isLast && natural < W * 0.7 ? 1 : (W - 8 - (li === 0 ? header0 : header)) / (natural - (li === 0 ? header0 : header));

      for (const mi of ln.ms) {
        const segs = measures[mi];
        const mx = x;
        const mw = mWidth(segs) * stretch;
        // Click target for the whole bar.
        const hit = add('rect', { x: mx, y: top, width: mw, height: bottom - top, class: 'mhit' });
        hit.dataset.m = mi;
        let cx = mx + 10 * stretch;
        // A bar with just one rest the length of the bar: whole rest in the middle.
        const fullRest = segs.length === 1 && segs[0].e.midi === null;
        const placed = [];
        for (const sg of segs) {
          const w = segW(sg) * stretch;
          const hasAcc = sg.acc !== null && sg.acc !== undefined;
          const hx = fullRest ? mx + mw / 2 : cx + (hasAcc ? 11 : 0) + 9;
          const g = el('g', { class: 'sc-ev' });
          g.dataset.ev = sg.ev;
          svg.appendChild(g);
          if (!evEls.has(sg.ev)) evEls.set(sg.ev, []);
          evEls.get(sg.ev).push(g);
          if (!evX.has(sg.ev)) evX.set(sg.ev, { svg, x: hx });
          track.push({ t: sg.start, x: hx, svg });
          placed.push({ sg, g, x: hx });
          if (sg.e.midi === null) drawRest(g, sg, hx, fullRest);
          else drawHead(g, sg, hx);
          cx += w;
        }
        // Breath marks: a comma above the staff, after the note (on its last tied segment).
        placed.forEach((p, k) => {
          if (!p.sg.e.breath || (placed[k + 1] && placed[k + 1].sg.ev === p.sg.ev)) return;
          const nx = placed[k + 1] ? placed[k + 1].x : mx + mw;
          add('text', { x: (p.x + nx) / 2 + 4, y: yOf(10) - 2, 'font-size': 22, 'text-anchor': 'middle', class: 'breath' }, ',');
        });
        drawStemsAndBeams(svg, placed, beatT);
        drawTuplets(svg, placed);
        // A tie runs from a note marked "tie to next" to the very next note, if same pitch.
        for (const p of placed) {
          if (p.sg.e.midi === null) continue;
          const a = tiePending.pop();
          if (a && a.sg.e.midi === p.sg.e.midi) drawTie(a, p, W);
          if (p.sg.tieNext) tiePending.push(p);
        }
        x += mw;
        track.push({ t: mi + 1 < tl.measureStarts.length ? tl.measureStarts[mi + 1] : tl.total, x: x - 4, svg, end: true });
        const final = mi === piece.measures.length - 1;
        if (final) {
          add('line', { x1: x - 6, x2: x - 6, y1: yOf(8), y2: yOf(0), class: 'barline' });
          add('rect', { x: x - 3, y: yOf(8), width: 3, height: yOf(0) - yOf(8), class: 'barline-thick' });
        } else {
          add('line', { x1: x, x2: x, y1: yOf(8), y2: yOf(0), class: 'barline' });
        }
      }
    });

    // Ties: pair each "tie to next" with the following note of the same pitch.
    function drawTie(a, b, w) {
      const y = yOf(stepOf(a.sg.e));
      const below = stepOf(a.sg.e) >= 4 ? -1 : 1;   // opposite the stem
      const dy = 7 * below;
      const arc = (svg, x1, x2) => svg.appendChild(el('path', {
        d: `M${x1} ${y + dy} Q${(x1 + x2) / 2} ${y + dy + 7 * below} ${x2} ${y + dy}`, class: 'tie',
      }));
      if (a.g.ownerSVGElement === b.g.ownerSVGElement) arc(a.g.ownerSVGElement, a.x + 6, b.x - 6);
      else {
        arc(a.g.ownerSVGElement, a.x + 6, w - 8);
        arc(b.g.ownerSVGElement, b.x - 26, b.x - 6);
      }
    }

    function drawRest(g, sg, x, full) {
      const y4 = yOf(4);
      if (full || sg.base === 96) g.appendChild(el('rect', { x: x - 6, y: yOf(6), width: 12, height: 5, class: 'rest' }));
      else if (sg.base === 48) g.appendChild(el('rect', { x: x - 6, y: y4 - 5, width: 12, height: 5, class: 'rest' }));
      else g.appendChild(el('text', { x, y: y4 + (sg.base === 24 ? 10 : 8), 'font-size': sg.base === 24 ? 30 : 28, 'text-anchor': 'middle', class: 'rest' }, REST_GLYPH[sg.base]));
      if (sg.dots) g.appendChild(el('circle', { cx: x + 9, cy: yOf(5), r: 1.8, class: 'dot' }));
    }

    function drawHead(g, sg, x) {
      const step = stepOf(sg.e);
      const y = yOf(step);
      for (let s = -2; s >= step; s -= 2) g.appendChild(el('line', { x1: x - 11, x2: x + 11, y1: yOf(s), y2: yOf(s), class: 'staff-line' }));
      for (let s = 10; s <= step; s += 2) g.appendChild(el('line', { x1: x - 11, x2: x + 11, y1: yOf(s), y2: yOf(s), class: 'staff-line' }));
      if (sg.acc !== null && sg.acc !== undefined) TP.accGlyph(g, sg.acc, x - 15, y);
      const open = sg.base >= 48;
      if (sg.base === 96) {
        g.appendChild(el('ellipse', { cx: x, cy: y, rx: 8, ry: 5.6, class: 'head' }));
        g.appendChild(el('ellipse', { cx: x, cy: y, rx: 3.4, ry: 4.8, class: 'hole', transform: `rotate(-55 ${x} ${y})` }));
      } else {
        g.appendChild(el('ellipse', { cx: x, cy: y, rx: 6.4, ry: 4.6, transform: `rotate(-20 ${x} ${y})`, class: open ? 'head open' : 'head' }));
      }
      if (sg.dots) g.appendChild(el('circle', { cx: x + 10, cy: step % 2 === 0 ? y - 4 : y, r: 1.8, class: 'dot' }));
      // A dynamic marking (p, mf, f…) under the staff.
      if (sg.first && sg.e.dyn) g.appendChild(el('text', { x: x - 4, y: bottom - 20, 'font-size': 15, class: 'dyn' }, sg.e.dyn));
    }

    function drawStemsAndBeams(svg, placed, beatLen) {
      // Group beamable notes (eighths and shorter) within a beat.
      const groups = [];
      let cur = null;
      for (const p of placed) {
        const beamable = p.sg.e.midi !== null && p.sg.base <= 12;
        const beat = Math.floor(p.sg.start / beatLen);
        if (beamable && cur && cur.beat === beat) cur.items.push(p);
        else if (beamable) groups.push(cur = { beat, items: [p] });
        else cur = null;
      }
      const beamed = new Set();
      for (const grp of groups) {
        if (grp.items.length < 2) continue;
        grp.items.forEach(p => beamed.add(p));
        const ys = grp.items.map(p => yOf(stepOf(p.sg.e)));
        const avg = grp.items.reduce((a, p) => a + stepOf(p.sg.e), 0) / grp.items.length;
        const up = avg < 4;
        const by = up ? Math.min(...ys) - 22 : Math.max(...ys) + 22;
        const sx = p => p.x + (up ? 5.8 : -5.8);
        grp.items.forEach(p => {
          const y = yOf(stepOf(p.sg.e));
          p.g.appendChild(el('line', { x1: sx(p), x2: sx(p), y1: y + (up ? -1 : 1), y2: by, class: 'stem' }));
          p.stemUp = up;
          p.beamY = by;
        });
        const xs = grp.items.map(sx);
        const thick = 4.5, gap = 7 * (up ? 1 : -1);
        svg.appendChild(el('rect', { x: Math.min(...xs), y: up ? by : by - thick, width: Math.abs(xs[xs.length - 1] - xs[0]) + 1.3, height: thick, class: 'beam' }));
        // Second/third beams between neighbours that share them; stubs otherwise.
        for (let level = 2; level <= 3; level++) {
          const need = grp.items.map(p => BEAMS[p.sg.base] >= level);
          const y = (up ? by : by - thick) + gap * (level - 1);
          grp.items.forEach((p, k) => {
            if (!need[k]) return;
            if (k + 1 < grp.items.length && need[k + 1]) {
              svg.appendChild(el('rect', { x: xs[k], y, width: xs[k + 1] - xs[k] + 1.3, height: thick, class: 'beam' }));
            } else if (!(k > 0 && need[k - 1])) {
              const x0 = k > 0 ? xs[k] - 8 : xs[k];
              svg.appendChild(el('rect', { x: x0, y, width: 9, height: thick, class: 'beam' }));
            }
          });
        }
      }
      // Lone notes: stem (and flags).
      for (const p of placed) {
        if (p.sg.e.midi === null || beamed.has(p) || p.sg.base === 96) continue;
        const step = stepOf(p.sg.e);
        const y = yOf(step);
        const up = step < 4;
        const sx = p.x + (up ? 5.8 : -5.8);
        const ey = up ? Math.min(y - 21, yOf(4)) : Math.max(y + 21, yOf(4));
        p.g.appendChild(el('line', { x1: sx, x2: sx, y1: y + (up ? -1 : 1), y2: ey, class: 'stem' }));
        p.stemUp = up;
        p.beamY = ey;
        const flags = BEAMS[p.sg.base] || 0;
        for (let f = 0; f < flags; f++) {
          const fy = ey + (up ? f * 7 : -f * 7);
          p.g.appendChild(el('path', { d: up ? `M${sx} ${fy} c1 6 9 7 7 17` : `M${sx} ${fy} c1 -6 9 -7 7 -17`, class: 'flag' }));
        }
      }
    }

    // A "3" over each complete triplet group (on the stem side).
    function drawTuplets(svg, placed) {
      let run = [];
      for (const p of placed) {
        const t = p.sg.e.tuplet;
        if (!t) { run = []; continue; }
        run.push(p);
        if (run.length < t.actual) continue;
        const pitched = run.filter(q => q.sg.e.midi !== null);
        const up = pitched.length ? pitched[0].stemUp !== false : true;
        const ys = run.map(q => (q.beamY !== undefined ? q.beamY : yOf(q.sg.e.midi === null ? 4 : stepOf(q.sg.e)) + (up ? -20 : 20)));
        const x = (run[0].x + run[run.length - 1].x) / 2 + (up ? 6 : -6);
        const y = up ? Math.min(...ys) - 5 : Math.max(...ys) + 13;
        svg.appendChild(el('text', { x, y, 'font-size': 12, 'text-anchor': 'middle', class: 'tuplet' }, t.actual));
        run = [];
      }
    }

    // A playhead bar on each line (shown on the line being played).
    track.sort((a, b) => a.t - b.t || (a.end ? -1 : 1));
    const heads = new Map();
    for (const svg of lineEls) {
      const ph = el('rect', { x: -10, y: yOf(10), width: 3, height: yOf(-2) - yOf(10), rx: 1.5, class: 'playhead' });
      svg.appendChild(ph);
      heads.set(svg, ph);
    }
    // Where a moment in the music (ticks) is drawn: its line and x, sliding smoothly
    // between notes.
    function posOfTick(t) {
      let lo = 0, hi = track.length - 1;
      if (!track.length) return null;
      if (t <= track[0].t) return { svg: track[0].svg, x: track[0].x };
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (track[mid].t <= t) lo = mid; else hi = mid - 1; }
      const a = track[lo], b = track[lo + 1];
      if (!b || b.svg !== a.svg || b.t === a.t) return { svg: a.svg, x: a.x };
      return { svg: a.svg, x: a.x + (b.x - a.x) * ((t - a.t) / (b.t - a.t)) };
    }
    let headOn = null;
    const annots = new Map();

    let current = null;
    return {
      lines: lineEls,
      width: W,
      posOfTick,
      // Move the playhead bar to a moment (or hide it with null).
      playhead(t, scroll = true) {
        if (headOn) heads.get(headOn).setAttribute('x', -10);
        headOn = null;
        if (t === null) return;
        const p = posOfTick(t);
        if (!p) return;
        heads.get(p.svg).setAttribute('x', p.x - 1.5);
        headOn = p.svg;
        if (scroll) {
          const box = container.getBoundingClientRect(), r = p.svg.getBoundingClientRect();
          if (r.top < box.top || r.bottom > box.bottom) container.scrollTop += r.top - box.top - 8;
        }
      },
      // Write something under a note (e.g. the right fingering for a missed note).
      annotate(ev, text, cls = '') {
        const at = evX.get(ev);
        if (!at) return;
        // One note, one annotation: the newest (a miss's fingering replaces a hint).
        if (annots.has(ev)) annots.get(ev).remove();
        const t = el('text', { x: at.x, y: bottom - 6, 'font-size': 12, 'text-anchor': 'middle', class: 'annot ' + cls }, text);
        annots.set(ev, t);
        at.svg.appendChild(t);
      },
      setState(ev, state) {
        for (const g of evEls.get(ev) || []) {
          g.setAttribute('class', 'sc-ev' + (state ? ' ' + state : '') + (ev === current ? ' current' : ''));
          // A mark as well as a colour, so grading doesn't rely on telling red from green.
          const old = g.querySelector('.state-mark');
          if (old) old.remove();
          const mark = { miss: '×', late: '›' }[state];
          const e = tl.events[ev];
          if (mark && e && e.midi !== null) {
            const at = evX.get(ev);
            g.appendChild(el('text', { x: at.x, y: Math.min(yOf(stepOf(e)) - 12, yOf(10)), 'font-size': 12, 'text-anchor': 'middle', class: 'state-mark' }, mark));
          }
        }
      },
      // A line through a note showing the pitch actually played over its length
      // (points: { f: 0–1 through the note, c: cents }; up = sharp, one staff step = 50¢).
      trace(ev, points, ticks, cls = '') {
        const e = tl.events[ev], a = evX.get(ev);
        if (!e || e.midi === null || !a || points.length < 2) return;
        const b = posOfTick(e.start + ticks);
        const x2 = b && b.svg === a.svg && b.x > a.x ? b.x - 4 : a.x + 24;
        const y = yOf(stepOf(e));
        const off = points.reduce((s, p) => s + Math.abs(p.c), 0) / points.length;
        a.svg.appendChild(el('polyline', {
          points: points.map(p => `${(a.x + (x2 - a.x) * p.f).toFixed(1)},${(y - Math.max(-60, Math.min(60, p.c)) * 0.12).toFixed(1)}`).join(' '),
          class: 'ptrace' + (cls ? ' ' + cls : off > 25 ? ' off' : off > 12 ? ' close' : ''),
        }));
      },
      // A breath mark (comma above the staff) after a note: one you planned, or one you took.
      breath(ev, cls = '') {
        const e = tl.events[ev], a = evX.get(ev);
        if (!e || !a) return;
        const b = posOfTick(e.start + e.dur);
        const x = b && b.svg === a.svg && b.x > a.x ? (a.x + b.x) / 2 + 4 : a.x + 14;
        a.svg.appendChild(el('text', { x, y: yOf(10) - 2, 'font-size': 22, 'text-anchor': 'middle', class: 'breath ' + cls }, ','));
      },
      // The note nearest a point on the screen (for tapping notes), or null.
      eventAt(cx, cy) {
        for (const svg of lineEls) {
          const r = svg.getBoundingClientRect();
          if (cy < r.top || cy > r.bottom || cx < r.left || cx > r.right) continue;
          const p = svg.createSVGPoint();
          p.x = cx; p.y = cy;
          const q = p.matrixTransform(svg.getScreenCTM().inverse());
          let best = null;
          for (const [ev, at] of evX) {
            if (at.svg === svg && tl.events[ev].midi !== null && (best === null || Math.abs(at.x - q.x) < Math.abs(evX.get(best).x - q.x))) best = ev;
          }
          return best;
        }
        return null;
      },
      clearTraces() { for (const s of lineEls) s.querySelectorAll('.ptrace').forEach(n => n.remove()); },
      setCurrent(ev, scroll = true) {
        const prev = current;
        current = ev;
        if (prev !== null) for (const g of evEls.get(prev) || []) g.classList.remove('current');
        if (ev === null) return;
        for (const g of evEls.get(ev) || []) g.classList.add('current');
        const at = evX.get(ev);
        if (scroll && at) {
          const box = container.getBoundingClientRect(), r = at.svg.getBoundingClientRect();
          if (r.top < box.top || r.bottom > box.bottom) container.scrollTop += r.top - box.top - 8;
        }
      },
      clear() { for (const ev of evEls.keys()) this.setState(ev, ''); },
    };
  }

  // ---------- writing ABC ----------
  // A piece back to ABC text (so imported music can be edited by hand).
  function toABC(p, title) {
    const keyName = Object.keys(TP.MAJOR_FIFTHS).find(k => TP.MAJOR_FIFTHS[k] === (p.fifths || 0)) || 'C';
    const head = `X:1\nT:${title || p.title || 'Untitled'}\nM:${p.beats}/${p.beatType}\nL:1/16\nQ:1/4=${p.tempo || 90}\nK:${keyName}\n`;
    const len = ticks => {
      const n = ticks / 6;                       // in sixteenths
      if (Number.isInteger(n)) return n === 1 ? '' : String(n);
      for (const den of [2, 3, 4, 6, 8]) { const num = n * den; if (Math.abs(num - Math.round(num)) < 1e-6) return `${Math.round(num)}/${den}`; }
      return String(Math.max(1, Math.round(n)));
    };
    const ACC = { '-2': '__', '-1': '_', '0': '=', '1': '^', '2': '^^' };
    const bars = p.measures.map(m => {
      const carry = new Map();
      return m.map(e => {
        if (e.midi === null) return 'z' + len(e.dur);
        const k = e.letter + e.octave;
        const cur = carry.has(k) ? carry.get(k) : TP.keySigAcc(p.fifths || 0, e.letter);
        let acc = '';
        if (e.acc !== cur) { acc = ACC[e.acc] || ''; carry.set(k, e.acc); }
        let name = e.octave >= 5 ? e.letter.toLowerCase() : e.letter;
        if (e.octave > 5) name += "'".repeat(e.octave - 5);
        if (e.octave < 4) name += ','.repeat(4 - e.octave);
        return (e.dyn ? `!${e.dyn}! ` : '') + acc + name + len(e.dur) + (e.tie ? '-' : '');
      }).join(' ');
    });
    let body = '';
    bars.forEach((b, i) => { body += b + (i === bars.length - 1 ? ' |]' : ' | ') + ((i + 1) % 4 === 0 && i < bars.length - 1 ? '\n' : ''); });
    return head + body + '\n';
  }

  return { TPQ, timeline, beatTicks, parseABC, parseMusicXML, musicXMLParts, unzipMusicXML, render, toABC, expandRepeats };
})();
