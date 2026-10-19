// Chart mode: a classic fingering chart — every note on the staff with its
// fingering underneath, one staff per octave. Click a note to hear it.
(() => {
  'use strict';
  const { S, $, el } = TP;
  const wrap = $('chartRows');
  // One row per octave (C to B) of the instrument's range; a long top octave splits in two.
  function rows() {
    const lo = TP.ALL_MIDI[0], hi = TP.ALL_MIDI[TP.ALL_MIDI.length - 1];
    const out = [];
    for (let c = lo - (lo % 12); c <= hi; c += 12) out.push([Math.max(c, lo), Math.min(c + 11, hi)]);
    const last = out[out.length - 1];
    if (out.length > 1 && last[1] - last[0] < 3) { out.pop(); out[out.length - 1][1] = last[1]; }
    const big = out[out.length - 1];
    if (big[1] - big[0] > 11) { out.pop(); out.push([big[0], big[0] + 7], [big[0] + 8, big[1]]); }
    return out;
  }
  function describe() {
    const i = TP.inst();
    const what = i.kind === 'slide' ? 'Slide positions' : 'Main fingering';
    const four = i.kind === 'valve' && i.valves === 4;
    $('chartDesc').textContent = `${i.name}${four ? (S.compensating ? ', compensating' : ', non-compensating') : ''}${i.transpose ? ' — written pitch' : ', concert pitch'}. `
      + `${what} underneath, alternates below it. Click a note to hear it; notes outside your practice range are faded.`
      + (i.kind === 'valve' ? (four && !S.compensating
        ? ' Fingerings that use three or four valves together run sharp on a non-compensating horn (hover a note to see roughly how much): pull slides or lip down, and measure your own in Tuner → Intonation map.'
        : ' Three-valve combinations (123, 13) run a little sharp: pull the 3rd or 1st slide.') : '');
  }
  const SINGLE = 46, PAIR = 80, LEFT = 56;

  function buildRow(lo, hi) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-staff');
    const items = [], cols = [];
    let x = LEFT;
    for (let m = lo; m <= hi; m++) {
      const flat = TP.spell(m, 'flats'), sharp = TP.spell(m, 'sharps');
      const pair = sharp.letter !== flat.letter;
      const w = pair ? PAIR : SINGLE;
      const cx = x + w / 2;
      const [main, ...alts] = FINGERINGS[m];
      const cls = m >= S.low && m <= S.high ? '' : 'dim';
      const text = { text: TP.fmtFingering(main), text2: alts.length ? alts.map(TP.fmtFingering).join(' · ') : '', textX: cx, textSize: 13 };
      if (pair) {
        items.push({ note: sharp, x: cx - 15, cls });
        items.push({ note: flat, x: cx + 23, cls, ...text });
      } else {
        items.push({ note: flat, x: cx + 4, cls, ...text });
      }
      const sharpBy = TP.comboCents(main);
      cols.push({ m, x, w, label: TP.label(flat) + (pair ? ' / ' + TP.label(sharp) : '') + (sharpBy >= 15 ? ` · ${TP.fmtFingering(main)} runs about ${sharpBy}¢ sharp in theory` : '') });
      x += w;
    }
    svg.dataset.width = x + 10;
    TP.drawStaff(svg, x + 10, items, TP.stepRange(lo, hi));
    // Invisible click targets, one per column.
    for (const c of cols) {
      const r = el('rect', { x: c.x, y: -120, width: c.w, height: 260, class: 'hit' });
      const title = el('title', {}, `${c.label} — click to hear`);
      r.appendChild(title);
      r.addEventListener('click', () => TP.playMidi(c.m));
      svg.appendChild(r);
    }
    return svg;
  }

  function build() {
    describe();
    wrap.textContent = '';
    const svgs = rows().map(([lo, hi]) => {
      const row = document.createElement('div');
      row.className = 'staff-scroll';
      const svg = buildRow(lo, hi);
      row.appendChild(svg);
      wrap.appendChild(row);
      return svg;
    });
    // Same scale for every row (fit the widest one), so notes are all one size.
    const widest = Math.max(...svgs.map(s => Number(s.dataset.width)));
    const k = Math.max(0.62, Math.min(1.15, (wrap.clientWidth - 2) / widest));
    for (const s of svgs) s.style.width = Number(s.dataset.width) * k + 'px';
  }
  window.addEventListener('resize', () => { if (!$('panel-chart').hidden) build(); });

  TP.modes.chart = {
    panel: 'panel-chart',
    valves: false,
    enter: build,
    leave() {},
    settingsChanged: build,
    preloadNotes: () => TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high),
    key() { return false; },
  };
})();
