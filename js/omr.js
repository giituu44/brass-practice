// Reading notes out of PDFs exported by notation software (LilyPond, MuseScore,
// Sibelius, Finale, Dorico…). Not scanned PDFs: those are pictures with no shapes inside.
//
// Such a PDF still contains the music's geometry: staff lines, barlines and stems are
// vector lines, beams are filled shapes, and every symbol is a glyph of a music font.
// We walk pdf.js's drawing commands to collect those, recognise each glyph by drawing
// it and measuring its shape, then rebuild the notes: pitch from where a notehead sits
// on the staff (with clef, key signature and accidentals), length from the notehead,
// its beams or flags, and dots.
TP.omr = (() => {
  'use strict';

  // ---------- geometry ----------
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const scaleOf = m => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

  // Everything drawn on a page: glyphs (with position and size) and paths (bounding boxes).
  async function collect(page, lib) {
    const O = lib.OPS;
    const list = await page.getOperatorList();
    const glyphs = [], paths = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let tm = [1, 0, 0, 1, 0, 0], tlm = [1, 0, 0, 1, 0, 0];
    let font = null, size = 1, charSp = 0, wordSp = 0, hscale = 1, leading = 0, lineWidth = 1;
    let pending = null;
    const showText = arr => {
      for (const g of arr) {
        if (typeof g === 'number') { tm = mul(tm, [1, 0, 0, 1, (-g / 1000) * size * hscale, 0]); continue; }
        if (!g) continue;
        const m = mul(ctm, tm);
        const [x, y] = apply(m, 0, 0);
        if (g.fontChar && !g.isSpace) glyphs.push({ font, ch: g.fontChar, uni: g.unicode, x, y, size: size * scaleOf(m) });
        const adv = ((g.width || 0) / 1000) * size + charSp + (g.isSpace ? wordSp : 0);
        tm = mul(tm, [1, 0, 0, 1, adv * hscale, 0]);
      }
    };
    for (let i = 0; i < list.fnArray.length; i++) {
      const fn = list.fnArray[i], a = list.argsArray[i];
      switch (fn) {
        case O.save: stack.push({ ctm, lineWidth }); break;
        case O.restore: { const s = stack.pop(); if (s) { ctm = s.ctm; lineWidth = s.lineWidth; } break; }
        case O.transform: ctm = mul(ctm, a); break;
        case O.setLineWidth: lineWidth = a[0]; break;
        case O.beginText: tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
        case O.setFont: font = a[0]; size = a[1]; break;
        case O.setTextMatrix: tm = tlm = a.slice(); break;
        case O.moveText: tlm = mul(tlm, [1, 0, 0, 1, a[0], a[1]]); tm = tlm; break;
        case O.setLeadingMoveText: leading = -a[1]; tlm = mul(tlm, [1, 0, 0, 1, a[0], a[1]]); tm = tlm; break;
        case O.setLeading: leading = a[0]; break;
        case O.nextLine: tlm = mul(tlm, [1, 0, 0, 1, 0, -leading]); tm = tlm; break;
        case O.setCharSpacing: charSp = a[0]; break;
        case O.setWordSpacing: wordSp = a[0]; break;
        case O.setHScale: hscale = a[0] / 100; break;
        case O.showText: case O.showSpacedText: showText(a[0]); break;
        case O.nextLineShowText: tlm = mul(tlm, [1, 0, 0, 1, 0, -leading]); tm = tlm; showText(a[0]); break;
        case O.constructPath: {
          const [ops, coords, mm] = a;
          // Corners of the path's box, in page coordinates.
          const cs = [[mm[0], mm[2]], [mm[1], mm[2]], [mm[0], mm[3]], [mm[1], mm[3]]].map(([x, y]) => apply(ctm, x, y));
          const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
          // Keep the points too (for beams), and whether it has curves (ties, slurs).
          const pts = [], segs = [];
          let k = 0, curved = false, last = null;
          for (const op of ops) {
            if (op === O.moveTo || op === O.lineTo) {
              const q = apply(ctm, coords[k], coords[k + 1]);
              if (op === O.lineTo && last) segs.push([last, q]);
              pts.push(q);
              last = q;
              k += 2;
            }
            else if (op === O.curveTo) { curved = true; pts.push(apply(ctm, coords[k + 4], coords[k + 5])); k += 6; }
            else if (op === O.curveTo2 || op === O.curveTo3) { curved = true; pts.push(apply(ctm, coords[k + 2], coords[k + 3])); k += 4; }
            else if (op === O.rectangle) {
              const [rx, ry, rw, rh] = coords.slice(k, k + 4);
              pts.push(apply(ctm, rx, ry), apply(ctm, rx + rw, ry), apply(ctm, rx + rw, ry + rh), apply(ctm, rx, ry + rh));
              k += 4;
            }
          }
          pending = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), pts, segs, curved, lw: lineWidth * scaleOf(ctm) };
          break;
        }
        case O.stroke: case O.closeStroke: case O.fill: case O.eoFill: case O.fillStroke: case O.eoFillStroke:
        case O.closeFillStroke: case O.closeEOFillStroke:
          if (pending) {
            const stroked = fn === O.stroke || fn === O.closeStroke;
            if (stroked) { const h = pending.lw / 2; pending.x0 -= h; pending.x1 += h; pending.y0 -= h; pending.y1 += h; }
            pending.kind = stroked ? 'stroke' : 'fill';
            // Several straight lines in one path (MuseScore draws a bar's five staff
            // lines that way): keep each line as its own path.
            if (stroked && !pending.curved && pending.segs.length > 1) {
              const h = pending.lw / 2;
              for (const [a, b] of pending.segs) {
                paths.push({ x0: Math.min(a[0], b[0]) - h, x1: Math.max(a[0], b[0]) + h, y0: Math.min(a[1], b[1]) - h, y1: Math.max(a[1], b[1]) + h,
                  pts: [a, b], segs: [[a, b]], curved: false, lw: pending.lw, kind: 'stroke' });
              }
            } else {
              paths.push(pending);
            }
            pending = null;
          }
          break;
        case O.endPath: pending = null; break;
        default: break;
      }
    }
    return { glyphs, paths };
  }

  // ---------- staves ----------
  // Five long, evenly spaced horizontal lines.
  function findStaves(paths) {
    // Horizontal lines, joined end to end (some programs draw staff lines bar by bar).
    // Strokes only (beams are thin filled shapes and must not chain into "lines"),
    // plus very thin, long filled bars, which some programs use for staff lines.
    const raw = paths.filter(p => p.y1 - p.y0 < 2.5 && (p.kind === 'stroke' ? p.x1 - p.x0 > 8 : p.x1 - p.x0 > 60 && p.y1 - p.y0 < 1.2))
      .map(p => ({ y: (p.y0 + p.y1) / 2, x0: p.x0, x1: p.x1 }))
      .sort((a, b) => b.y - a.y || a.x0 - b.x0);
    const joined = [];
    for (const l of raw) {
      const j = joined.find(m => Math.abs(m.y - l.y) < 0.4 && l.x0 <= m.x1 + 3 && l.x1 >= m.x0 - 3);
      if (j) { j.x0 = Math.min(j.x0, l.x0); j.x1 = Math.max(j.x1, l.x1); } else joined.push({ ...l });
    }
    const lines = joined.filter(l => l.x1 - l.x0 > 60).sort((a, b) => b.y - a.y);
    const used = new Set(), staves = [];
    for (let i = 0; i < lines.length; i++) {
      if (used.has(i)) continue;
      const group = [i];
      for (let j = i + 1; j < lines.length && group.length < 5; j++) {
        if (used.has(j)) continue;
        const a = lines[group[group.length - 1]], b = lines[j];
        if (Math.abs(b.x0 - lines[i].x0) > 8 || Math.abs(b.x1 - lines[i].x1) > 8) continue;
        const gap = a.y - b.y;
        if (gap < 2.5) continue;
        if (group.length >= 2) {
          const first = lines[group[0]].y - lines[group[1]].y;
          if (Math.abs(gap - first) > first * 0.15) { if (gap > first * 1.15) break; continue; }
        } else if (gap > 15) break;
        group.push(j);
      }
      if (group.length === 5) {
        group.forEach(g => used.add(g));
        const ys = group.map(g => lines[g].y);
        staves.push({ top: ys[0], bottom: ys[4], s: (ys[0] - ys[4]) / 4, x0: lines[i].x0, x1: lines[i].x1 });
      }
    }
    return staves.sort((a, b) => b.top - a.top);
  }

  // ---------- recognising glyphs by their shape ----------
  // Draw the glyph big, then measure its box (in em) and how much of it is ink.
  const shapeCache = new Map();
  function shape(fontObj, ch) {
    const key = fontObj.loadedName + '|' + ch;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const PX = 100, W = 400, H = 500, ox = 100, oy = 300;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000';
    g.font = `${PX}px "${fontObj.loadedName}"`;
    g.fillText(ch, ox, oy);
    const d = g.getImageData(0, 0, W, H).data;
    let x0 = W, x1 = -1, y0 = H, y1 = -1, ink = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] > 100) { ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    let res = null;
    if (x1 >= 0) {
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const at = (fx, fy) => d[((Math.round(y0 + fy * (bh - 1))) * W + Math.round(x0 + fx * (bw - 1))) * 4 + 3] > 100;
      // Ink in the lower vs upper half (flats are bottom-heavy).
      let lower = 0, upper = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 100) { if (y > (y0 + y1) / 2) lower++; else upper++; }
      res = {
        // em units, y up, relative to the glyph origin
        x0: (x0 - ox) / PX, x1: (x1 + 1 - ox) / PX, y0: (oy - y1 - 1) / PX, y1: (oy - y0) / PX,
        fill: ink / (bw * bh), hole: !at(0.5, 0.5), lowerHeavy: lower > upper * 1.35,
      };
    }
    shapeCache.set(key, res);
    return res;
  }

  // Name each glyph from its size in staff spaces and its shape.
  function classify(sh, s, size) {
    if (!sh) return 'other';
    const w = ((sh.x1 - sh.x0) * size) / s, h = ((sh.y1 - sh.y0) * size) / s, r = w / h;
    if (h >= 0.75 && h <= 1.3 && w >= 0.95 && w <= 1.75 && r >= 1.0) {
      if (w > 1.55 && sh.hole) return 'whole';
      return sh.hole ? 'half' : sh.fill > 0.55 ? 'black' : 'other';
    }
    if (h < 0.7 && w < 0.7 && sh.fill > 0.5 && r > 0.6 && r < 1.6) return 'dot';
    if (h >= 0.3 && h <= 0.75 && w >= 0.9 && w <= 1.6 && sh.fill > 0.8) return 'restbar';   // whole/half rest
    if (h >= 1.7 && h <= 3.6 && w >= 0.45 && w <= 1.35) {
      if (sh.lowerHeavy && h < 2.9 && r > 0.28) return 'flat';
      if (r < 0.3 && h > 2.0) return 'natural';
      if (r >= 0.3 && h > 2.0 && sh.fill > 0.3 && !sh.lowerHeavy) return 'sharp-or-tall';
      return 'tall';
    }
    if (h >= 1.2 && h < 1.7 && w >= 0.5 && w <= 1.2) return 'tall';
    if (h > 4.5) return 'bigclef';
    if (h >= 3.6 && h <= 4.5) return 'clef';
    return 'other';
  }

  // ---------- rebuilding the music ----------
  // Music fonts used by notation programs (and not their text/dynamics companions).
  const MUSIC_FONT = /emmentaler|feta|gonville|lilyjazz|leland|bravura|petaluma|sebastian|finale|maestro|engraver|opus|helsinki|reprise|norfolk|november|sonata|mscore|musescore|campania|toccata|ekmelos|musisync|golden ?age|broadway|jazz|ghost/i;
  const TEXT_FONT = /alphabet|text|roman|serif|sans|dynamics|expressions|special|metronome/i;
  const LET = 'CDEFGAB', NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF';

  // Read one document. Returns { parts: [piece…] } — one piece per staff position in a system.
  async function read(doc, lib, onProgress = () => {}, opts = {}) {
    const pagesData = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      // Render once so the embedded fonts are loaded and can be drawn by name.
      const vp = page.getViewport({ scale: 0.3 });
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp, intent: 'print' }).promise;   // 'print': no requestAnimationFrame, so it works in background tabs too
      const { glyphs, paths } = await collect(page, lib);
      for (const g of glyphs) {
        try { g.fontObj = page.commonObjs.get(g.font); } catch (e) { g.fontObj = null; }
      }
      pagesData.push({ glyphs: glyphs.filter(g => g.fontObj && g.fontObj.loadedName), paths, staves: findStaves(paths) });
      onProgress(p, doc.numPages);
    }
    // Only music-font glyphs: titles, part names and lyrics are text, and round
    // letters like "o" would otherwise pass for noteheads.
    const isMusic = g => MUSIC_FONT.test(g.fontObj.name || '') && !TEXT_FONT.test(g.fontObj.name || '');
    // Numbers in text fonts are kept separately: triplet 3s and 1st/2nd-ending numbers.
    for (const d of pagesData) d.texts = d.glyphs.filter(g => !isMusic(g) && /^[0-9]$/.test(g.uni || ''));
    if (pagesData.some(d => d.glyphs.some(isMusic))) for (const d of pagesData) d.glyphs = d.glyphs.filter(isMusic);
    const allStaves = pagesData.flatMap(d => d.staves);
    if (!allStaves.length) throw new Error('No staves found — this PDF looks scanned (a picture), or isn’t sheet music.');
    const S0 = median(allStaves.map(s => s.s));

    // Systems: staves joined by a line down their left edge (or one staff each).
    const systemsByPage = pagesData.map(d => groupSystems(d));
    const perSystem = Math.max(...systemsByPage.flat().map(sys => sys.length));

    const parts = [], raw = [];
    for (let part = 0; part < perSystem; part++) {
      const measures = [];
      let fifths = 0, firstFifths = null, clefBottom = null;
      pagesData.forEach((d, pi) => {
        for (const sys of systemsByPage[pi]) {
          const st = sys[Math.min(part, sys.length - 1)];
          if (sys.length < perSystem && part >= sys.length) continue;
          const res = readStaff(d, st, S0, clefBottom);
          clefBottom = res.clefBottom;
          if (res.fifths !== null) fifths = res.fifths;
          if (firstFifths === null) firstFifths = fifths;
          measures.push(...res.measures);
        }
      });
      // Play repeats out in order (|: … :| with 1st/2nd endings).
      const cleaned = measures.filter(m => m.length);
      raw.push(cleaned.map(m => (m.repeatStart ? '|:' : '') + m.length + (m.repeatEnd ? ':|' : '') + (m.ending ? '[' + m.ending : '')));
      const expanded = opts.expand === false ? cleaned
        : TP.score.expandRepeats(cleaned.map(m => ({ events: m, repeatStart: m.repeatStart, repeatEnd: m.repeatEnd, ending: m.ending })));
      parts.push(finish(expanded, firstFifths || 0));
    }
    return { parts, staffCount: allStaves.length, structure: raw };
  }

  function groupSystems(d) {
    const staves = d.staves;
    if (staves.length < 2) return staves.map(s => [s]);
    const verticals = d.paths.filter(p => p.x1 - p.x0 < 4 && p.y1 - p.y0 > 0);
    const systems = [];
    let cur = [staves[0]];
    for (let i = 1; i < staves.length; i++) {
      const a = staves[i - 1], b = staves[i];
      // Something vertical spanning the gap at the left edge joins them into one system.
      const joined = verticals.some(v => v.x0 < a.x0 + 3 * a.s && v.x1 > a.x0 - 6 * a.s && v.y1 >= a.bottom - 0.5 && v.y0 <= b.top + 0.5);
      if (joined) cur.push(b); else { systems.push(cur); cur = [b]; }
    }
    systems.push(cur);
    return systems;
  }

  function readStaff(d, st, S0, prevClefBottom) {
    const s = st.s;
    const inStaff = (y0, y1) => y1 > st.bottom - 6 * s && y0 < st.top + 6 * s;
    const mid = (st.top + st.bottom) / 2;
    // Glyphs belonging to this staff (nearest staff wins).
    const gl = d.glyphs.filter(g => {
      const sh = shape(g.fontObj, g.ch);
      if (!sh) return false;
      g.sh = sh;
      g.bx0 = g.x + sh.x0 * g.size; g.bx1 = g.x + sh.x1 * g.size; g.by0 = g.y + sh.y0 * g.size; g.by1 = g.y + sh.y1 * g.size;
      g.cx = (g.bx0 + g.bx1) / 2; g.cy = (g.by0 + g.by1) / 2;
      if (!inStaff(g.by0, g.by1) || g.cx < st.x0 - s || g.cx > st.x1 + s) return false;
      const near = d.staves.reduce((best, o) => (Math.abs((o.top + o.bottom) / 2 - g.cy) < Math.abs((best.top + best.bottom) / 2 - g.cy) ? o : best));
      return near === st;
    });
    for (const g of gl) g.kind = classify(g.sh, s, g.size);

    const paths = d.paths.filter(p => inStaff(p.y0, p.y1) && p.x1 > st.x0 - s && p.x0 < st.x1 + s);
    // Stems and thin barlines; thick (final/repeat) barlines are wider.
    const verticals = paths.filter(p => p.x1 - p.x0 < 0.8 * s && p.y1 - p.y0 > 1.5 * s);
    // A line exactly the height of the staff is a barline — unless a notehead sits at
    // one end of it, in which case it's a stem that happens to be that long.
    const allHeads = gl.filter(g => g.kind === 'black' || g.kind === 'half');
    // (It may run on through other staves of the system, as piano barlines do.)
    const covers = p => p.y1 >= st.top - 0.5 * s && p.y0 <= st.bottom + 0.5 * s;
    const endsAtStaff = p => Math.abs(p.y1 - st.top) < 0.5 * s || Math.abs(p.y0 - st.bottom) < 0.5 * s;
    const spansStaff = p => covers(p) && (endsAtStaff(p) || p.y1 - p.y0 > 9 * s);
    const headAtEnd = p => allHeads.some(h => Math.abs(h.cx - (p.x0 + p.x1) / 2) < 1.4 * s && (Math.abs(h.cy - p.y0) < 0.8 * s || Math.abs(h.cy - p.y1) < 0.8 * s));
    // (Lines at the very left edge join the staves of a system; they aren't barlines.)
    const barPaths = verticals.filter(p => spansStaff(p) && !headAtEnd(p) && p.x0 > st.x0 + 0.8 * s);
    // A double or thick barline (end of a section or movement) counts once, marked heavy.
    const bars = [];
    for (const p of barPaths.sort((a, b) => a.x0 - b.x0)) {
      const x = (p.x0 + p.x1) / 2, thick = p.x1 - p.x0 > 0.3 * s;
      const b = bars.find(b => Math.abs(b.x - x) < 1.2 * s);
      // The same line drawn twice (fill + outline) isn't a double barline.
      if (b) { if (Math.abs(b.x - x) > 0.15 * s || thick) b.heavy = true; b.x = Math.max(b.x, x); } else bars.push({ x, heavy: thick });
    }
    const stems = verticals.filter(p => !barPaths.includes(p) && p.x1 - p.x0 < 0.4 * s);
    const beams = paths.filter(p => p.kind === 'fill' && !p.curved && p.x1 - p.x0 > 0.8 * s && p.y1 - p.y0 < 4 * s && p.pts.length >= 3 && p.pts.length <= 6
      && !(p.y1 - p.y0 < 0.3 * s && p.x1 - p.x0 > 10 * s));
    const curves = paths.filter(p => p.curved);

    // Clef: a big glyph at the very start of the staff.
    const startGl = gl.filter(g => g.bx0 < st.x0 + 5 * s);
    let clefBottom = prevClefBottom;
    const clef = startGl.find(g => g.kind === 'bigclef' || g.kind === 'clef' || ((g.by1 - g.by0) / s > 2.6 && (g.bx1 - g.bx0) / s > 1.8));
    if (clef) {
      const h = (clef.by1 - clef.by0) / s;
      if (h > 4.8) clefBottom = 2 + 7 * 4;                 // treble: bottom line E4
      else {
        // A C clef is symmetric about its centre line; a bass clef sits high.
        // A C clef is about 4 spaces tall and centred on its line (alto: middle line,
        // tenor: 4th line); a bass clef is about 3 spaces tall.
        const centre = Math.round(((clef.cy - st.bottom) / s) * 2);
        if (h >= 3.55 && h <= 4.7 && centre >= 2 && centre <= 6 && centre % 2 === 0) clefBottom = 28 - centre;
        else clefBottom = 4 + 7 * 2;                       // bass: bottom line G2
      }
    }
    if (clefBottom === null) clefBottom = TP.inst().clef === 'treble' ? 30 : 18;

    const heads = gl.filter(g => g.kind === 'black' || g.kind === 'half' || g.kind === 'whole');
    const firstHeadX = heads.length ? Math.min(...heads.map(h => h.bx0)) : st.x1;
    // Key signature: accidentals after the clef, before the first note, not beside a note.
    const clefEnd = clef ? clef.bx1 : st.x0 + 2 * s;
    const ksGl = gl.filter(g => (g.kind === 'flat' || g.kind === 'sharp-or-tall' || g.kind === 'natural') && g.bx0 >= clefEnd - 0.2 * s && g.bx1 < firstHeadX - 0.3 * s && g.bx0 < clefEnd + 9 * s);
    let fifths = null;
    if (clef) {
      const flats = ksGl.filter(g => g.kind === 'flat').length, sharps = ksGl.filter(g => g.kind === 'sharp-or-tall').length;
      fifths = flats > sharps ? -Math.min(7, flats) : Math.min(7, sharps);
    }
    const ksSet = new Set(ksGl);
    const keyAcc = letter => {
      const f = fifths || 0;
      if (f > 0) return SHARP_ORDER.indexOf(letter) < f ? 1 : 0;
      if (f < 0) return FLAT_ORDER.indexOf(letter) < -f ? -1 : 0;
      return 0;
    };

    const accGl = gl.filter(g => !ksSet.has(g) && (g.kind === 'flat' || g.kind === 'sharp-or-tall' || g.kind === 'natural'));
    const dots = gl.filter(g => g.kind === 'dot');
    const usedAcc = new Set();

    // Notes: group heads by stem; keep the top head of a chord.
    const stemOf = h => {
      let best = null, bd = Infinity;
      for (const p of stems) {
        const x = (p.x0 + p.x1) / 2;
        if (x < h.bx0 - 0.3 * s || x > h.bx1 + 0.3 * s) continue;
        if (h.cy < p.y0 - 0.7 * s || h.cy > p.y1 + 0.7 * s) continue;
        const dx = Math.min(Math.abs(x - h.bx0), Math.abs(x - h.bx1));
        if (dx < bd) { bd = dx; best = p; }
      }
      return best;
    };
    const flagGl = gl.filter(g => g.kind === 'tall' || g.kind === 'sharp-or-tall');
    const flagKeys = [...new Set(flagGl.map(g => g.fontObj.loadedName + g.ch))];
    const items = [];
    const byStem = new Map();
    for (const h of heads) {
      const stem = h.kind === 'whole' ? null : stemOf(h);
      const key = stem || h;
      if (!byStem.has(key)) byStem.set(key, []);
      byStem.get(key).push(h);
    }
    for (const [stem, hs] of byStem) {
      const h = hs.reduce((a, b) => (b.cy > a.cy ? b : a));   // top note
      let ticks = h.kind === 'whole' ? 96 : h.kind === 'half' ? 48 : 24;
      if (h.kind === 'black' && stem && stem !== h) {
        const sx = (stem.x0 + stem.x1) / 2;
        const up = stem.y1 > h.cy + 0.8 * s;
        const tip = up ? stem.y1 : stem.y0;
        // Beams crossing this stem near its tip.
        let n = beams.filter(b => {
          if (sx < b.x0 - 0.3 * s || sx > b.x1 + 0.3 * s) return false;
          const lp = b.pts.reduce((a, q) => (q[0] < a[0] ? q : a)), rp = b.pts.reduce((a, q) => (q[0] > a[0] ? q : a));
          const left = b.pts.filter(q => Math.abs(q[0] - lp[0]) < 0.2 * s).map(q => q[1]);
          const right = b.pts.filter(q => Math.abs(q[0] - rp[0]) < 0.2 * s).map(q => q[1]);
          const yl = left.reduce((a, c) => a + c, 0) / left.length, yr = right.reduce((a, c) => a + c, 0) / right.length;
          const t = rp[0] > lp[0] ? (sx - lp[0]) / (rp[0] - lp[0]) : 0.5;
          const y = yl + (yr - yl) * Math.max(0, Math.min(1, t));
          return Math.abs(y - tip) < 2.7 * s && (up ? y > h.cy : y < h.cy);
        }).length;
        // Or flags at the tip.
        if (!n) {
          const flag = flagGl.find(g => g.bx0 > sx - 0.4 * s && g.bx0 < sx + 0.8 * s && (up ? g.by1 > tip - 0.8 * s && g.by0 < tip + 0.5 * s : g.by0 < tip + 0.8 * s && g.by1 > tip - 0.5 * s));
          if (flag) {
            const fh = (flag.by1 - flag.by0) / s;
            n = fh > 3.3 ? 2 : 1;
            flag.kind = 'flag';
          }
        }
        ticks = 24 / Math.pow(2, Math.min(3, n));
      }
      if (dots.some(dt => dt.bx0 > h.bx1 - 0.1 * s && dt.bx0 < h.bx1 + 1.6 * s && Math.abs(dt.cy - h.cy) < 0.65 * s)) ticks *= 1.5;
      // Accidental just left of the note.
      const acc = accGl.find(a => !usedAcc.has(a) && a.bx1 < h.bx0 + 0.25 * s && a.bx1 > h.bx0 - 2.6 * s && h.cy > a.by0 + 0.15 * (a.by1 - a.by0) && h.cy < a.by1 - 0.15 * (a.by1 - a.by0));
      if (acc) usedAcc.add(acc);
      const step = Math.round(((h.cy - st.bottom) / s) * 2);
      const dia = clefBottom + step;
      const letter = LET[((dia % 7) + 7) % 7], octave = Math.floor(dia / 7);
      items.push({ x: h.bx0, type: 'note', ticks, letter, octave, accGlyph: acc ? acc.kind : null, cy: h.cy, cx: h.cx, bx1: h.bx1 });
    }
    // Rests: what's left that isn't a note part, accidental, flag, dot, clef or number.
    for (const g of gl) {
      if (g.bx0 < firstHeadX - 0.2 * s && g.bx1 < clefEnd + 9 * s && !heads.length) continue;
      if (g.bx1 < clefEnd + 0.1 * s) continue;
      if (ksSet.has(g) || usedAcc.has(g) || g.kind === 'flag') continue;
      let ticks = null;
      if (g.kind === 'restbar') {
        const stepC = ((g.cy - st.bottom) / s) * 2;
        ticks = stepC > 5 ? 96 : 48;
      } else if ((g.kind === 'tall' || g.kind === 'sharp-or-tall') && Math.abs(g.cy - mid) < 1.6 * s && !accGl.includes(g)) {
        const h = (g.by1 - g.by0) / s;
        // No stem touching it: a rest. Height tells which.
        const touching = stems.some(p => (p.x0 + p.x1) / 2 > g.bx0 - 0.2 * s && (p.x0 + p.x1) / 2 < g.bx1 + 0.2 * s && p.y1 > g.by0 && p.y0 < g.by1);
        if (!touching) ticks = h > 2.4 ? 24 : 12;
      }
      if (ticks) {
        if (dots.some(dt => dt.bx0 > g.bx1 - 0.1 * s && dt.bx0 < g.bx1 + 1.4 * s && Math.abs(dt.cy - g.cy) < 1.2 * s)) ticks *= 1.5;
        items.push({ x: g.bx0, bx1: g.bx1, type: 'rest', ticks });
      }
    }
    // Repeat signs: two dots in the middle spaces just before (end) or after (start) a barline.
    // (One dot in each of the two middle spaces, stacked exactly above each other.)
    const repeatDots = (from, to) => {
      const at = k => dots.filter(dt => dt.cx > from && dt.cx < to && Math.abs((dt.cy - st.bottom) / s - k) < 0.3);
      return at(1.5).some(a => at(2.5).some(b => Math.abs(a.cx - b.cx) < 0.25 * s));
    };
    for (const b of bars) items.push({ x: b.x, heavy: b.heavy, type: 'bar', repEnd: repeatDots(b.x - 2.2 * s, b.x - 0.05 * s), repStart: repeatDots(b.x + 0.05 * s, b.x + 2.2 * s) });
    items.sort((a, b) => a.x - b.x);

    // Ties: a curve from one note to the next of the same pitch.
    const notesOnly = items.filter(i => i.type === 'note');
    for (let i = 0; i + 1 < notesOnly.length; i++) {
      const a = notesOnly[i], b = notesOnly[i + 1];
      if (a.letter !== b.letter || a.octave !== b.octave) continue;
      a.tieNext = curves.some(c => c.x0 > a.cx - 0.5 * s && c.x0 < a.bx1 + 1.2 * s && c.x1 > b.x - 1.2 * s && c.x1 < b.cx + 0.5 * s && Math.abs((c.y0 + c.y1) / 2 - a.cy) < 1.6 * s && c.y1 - c.y0 < 1.5 * s);
    }

    // Triplets: a "3" just above or below three equal notes in a row.
    const seq = items.filter(i => i.type !== 'bar');
    for (const t of d.texts || []) {
      if (t.uni !== '3') continue;
      const tx = t.x + 0.25 * t.size, ty = t.y + 0.35 * t.size;
      if (tx < firstHeadX || tx > st.x1 || ty < st.bottom - 5 * s || ty > st.top + 5 * s) continue;
      const near = d.staves.reduce((b, o) => (Math.abs((o.top + o.bottom) / 2 - ty) < Math.abs((b.top + b.bottom) / 2 - ty) ? o : b));
      if (near !== st) continue;
      let best = null, bd = Infinity;
      for (let i = 0; i + 2 < seq.length; i++) {
        const g = seq.slice(i, i + 3);
        if (g.some(x => x.tuplet)) continue;
        const end = g[2].bx1 || g[2].x + s;
        if (end - g[0].x > 9 * s) continue;
        const dd = Math.abs((g[0].x + end) / 2 - tx);
        if (dd < bd) { bd = dd; best = g; }
      }
      if (best && bd < 2.5 * s && best.every(x => x.ticks === best[0].ticks)) for (const x of best) { x.ticks = (x.ticks * 2) / 3; x.tuplet = true; }
    }
    // 1st/2nd endings: a 1 or 2 above the staff with the ending's bracket line near it.
    const endingAt = [];
    for (const t of d.texts || []) {
      if (t.uni !== '1' && t.uni !== '2') continue;
      const tx = t.x, ty = t.y;
      if (ty < st.top + 0.8 * s || ty > st.top + 5 * s || tx < st.x0 || tx > st.x1) continue;
      const bracket = d.paths.some(p => p.kind === 'stroke' && p.y1 - p.y0 < 1 && p.x1 - p.x0 > 3 * s && p.x0 < tx + s && p.x1 > tx && p.y0 > ty - 0.5 * s && p.y0 < ty + 2 * t.size);
      if (bracket) endingAt.push({ x: tx, n: Number(t.uni) });
    }

    // Into measures, applying the key and accidentals (which last to the barline).
    const measures = [];
    let cur = [], carry = new Map(), startNext = false, curX = st.x0;
    const close = (bar) => {
      if (cur.length) {
        if (startNext) { cur.repeatStart = true; startNext = false; }
        if (bar && bar.repEnd) cur.repeatEnd = true;
        const e = endingAt.find(e => e.x >= curX - 0.5 * s && e.x < (bar ? bar.x : st.x1));
        if (e) cur.ending = e.n;
        measures.push(cur);
      }
      // After a start-repeat — or a double/final barline, where a new section begins and
      // an end-repeat with no start sign goes back to.
      if (bar && (bar.repStart || bar.heavy)) startNext = true;
      cur = []; carry = new Map();
      curX = bar ? bar.x : st.x1;
    };
    for (const it of items) {
      if (it.type === 'bar') { close(it); continue; }
      const tuplet = it.tuplet ? { actual: 3, normal: 2 } : null;
      if (it.type === 'rest') { cur.push({ midi: null, dur: it.ticks, tie: false, tuplet }); continue; }
      const k = it.letter + it.octave;
      let acc;
      if (it.accGlyph) { acc = it.accGlyph === 'flat' ? -1 : it.accGlyph === 'natural' ? 0 : 1; carry.set(k, acc); }
      else acc = carry.has(k) ? carry.get(k) : keyAcc(it.letter);
      cur.push({ midi: (it.octave + 1) * 12 + NAT[it.letter] + acc, letter: it.letter, acc, octave: it.octave, dur: it.ticks, tie: !!it.tieNext, tuplet });
    }
    close(null);
    return { measures, fifths, clefBottom };
  }

  // Time signature from the most common bar length.
  function finish(measures, fifths) {
    const lens = measures.slice(1, -1).map(m => m.reduce((a, e) => a + e.dur, 0));
    const common = lens.length ? Number(Object.entries(lens.reduce((c, l) => (c[l] = (c[l] || 0) + 1, c), {})).sort((a, b) => b[1] - a[1])[0][0]) : 96;
    const TS = { 96: [4, 4], 72: [3, 4], 48: [2, 4], 120: [5, 4], 144: [6, 4], 36: [3, 8], 108: [9, 8], 192: [4, 2], 24: [1, 4] };
    const [beats, beatType] = TS[common] || [Math.max(1, Math.round(common / 24)), 4];
    return { title: '', composer: '', fifths, beats, beatType, tempo: 90, measures };
  }

  return { read, _collect: collect, _findStaves: findStaves };
})();
