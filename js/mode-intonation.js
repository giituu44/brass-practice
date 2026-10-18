// Intonation map (in the Tuner tab): play every note in your range, one at a time.
// Each note's steady part is measured in cents and saved, so you can see your
// tendencies — and roughly how far to move a slide to bring each note in tune.
(() => {
  'use strict';
  const { S, $ } = TP;
  const NEED = 22;          // steady readings (~0.9 s) to measure a note
  const IN_TUNE = 5;        // cents either way that count as in tune

  const data = () => (TP.store.intonation = TP.store.intonation || {});
  let run = null;           // { notes, k, readings, done }

  // ---------- how far to move which slide ----------
  const SPEED = 343;        // m/s
  const hz = TP.hz;
  // Effective tube length for a fingering: the open horn's, made longer by the valves.
  function lengthFor(f) {
    const i = TP.inst();
    const open = SPEED / (2 * hz(i.fund - i.transpose));
    const lower = i.kind === 'slide' ? Number(f) - 1 : (INSTRUMENTS.LOWER[f] || 0);
    return open * 2 ** (lower / 12);
  }
  function slideName(f) {
    const i = TP.inst();
    if (i.kind === 'slide') return 'the slide';
    if (!f) return 'the main tuning slide';
    if (f.includes('1')) return 'the 1st-valve slide';
    if (f.includes('3')) return 'the 3rd-valve slide';
    if (f.includes('4')) return 'the 4th-valve slide';
    return 'the 2nd-valve slide';
  }
  // A slide has two legs, so moving it by x changes the tube by 2x.
  const slideMm = (f, cents) => Math.round(lengthFor(f) * (2 ** (Math.abs(cents) / 1200) - 1) / 2 * 1000);
  function advice(midi, rec) {
    const c = rec.c, f = rec.f;
    if (Math.abs(c) <= IN_TUNE) return 'in tune';
    const mm = slideMm(f, c), where = slideName(f);
    if (TP.inst().kind === 'slide') return c > 0 ? `move the slide out ~${mm} mm` : `bring the slide in ~${mm} mm`;
    return c > 0 ? `pull ${where} out ~${mm} mm (or lip down)` : `push ${where} in ~${mm} mm if it has room (or lip up)`;
  }

  // ---------- measuring ----------
  function notesInRange() {
    return TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high);
  }
  const nameOf = m => TP.label(TP.spell(m, S.spelling === 'sharps' ? 'sharps' : 'flats'));

  async function start(fromMidi) {
    if (!TP.mic.active) {
      try { await TP.mic.start(); } catch (e) { TP.toast(TP.micError(e), 7000); return; }
    }
    const notes = notesInRange();
    const k = fromMidi !== undefined ? Math.max(0, notes.indexOf(fromMidi)) : 0;
    run = { notes, k, readings: [], single: fromMidi !== undefined };
    $('intStart').textContent = 'Stop';
    $('intLive').hidden = false;
    show();
  }
  function stop() {
    if (!run) return;
    run = null;
    $('intStart').textContent = Object.keys(data()).length ? 'Measure again' : 'Start';
    $('intLive').hidden = true;
    render();
  }
  function show() {
    const m = run.notes[run.k];
    const f = (FINGERINGS[m] || [''])[0];
    $('intNote').textContent = nameOf(m);
    $('intFing').textContent = TP.fmtFingering(f);
    $('intMsg').textContent = `Note ${run.k + 1} of ${run.notes.length} — play it and hold it steady.`;
    $('intNeedle').style.left = '50%';
    $('intNeedle').classList.remove('on');
    run.readings = [];
    run.started = performance.now();
    render();
  }
  function next() {
    if (!run) return;
    if (run.single || run.k + 1 >= run.notes.length) { stop(); return; }
    run.k++;
    show();
  }
  TP.mic.on(r => {
    if (!run || $('panel-tuner').hidden || run.pause) return;
    const want = run.notes[run.k];
    if (r.midi !== want) return;
    // Skip the attack: count readings once the note has held for a moment.
    $('intNeedle').classList.add('on');
    $('intNeedle').style.left = 50 + Math.max(-50, Math.min(50, r.cents)) + '%';
    if (r.held < 0.25) return;
    run.readings.push(r.cents);
    if (run.readings.length < NEED) return;
    const sorted = run.readings.slice().sort((a, b) => a - b);
    const c = sorted[sorted.length >> 1];
    data()[want] = { c, f: (FINGERINGS[want] || [''])[0], at: Date.now() };
    TP.save();
    $('intMsg').textContent = `${nameOf(want)}: ${c > 0 ? '+' : ''}${c}¢ — ${advice(want, data()[want])}`;
    run.pause = true;
    render();
    setTimeout(() => { if (run) { run.pause = false; next(); } }, 1100);
  });

  // ---------- the map: one bar per note, up = sharp, down = flat ----------
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, a, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in a) e.setAttribute(k, a[k]);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  function render() {
    const notes = notesInRange(), d = data(), box = $('intChart');
    box.textContent = '';
    const any = notes.some(m => d[m]);
    if (!any && !run) {
      box.innerHTML = '<p class="sub center">Your map appears here as you play. Use a quiet room; it takes about a minute.</p>';
      $('intAdvice').textContent = '';
      $('intStart').textContent = 'Start';
      return;
    }
    const W = Math.max(320, notes.length * 22 + 44), H = 150, L = 34, mid = H / 2, scale = (H / 2 - 18) / 40;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'inton-svg', role: 'img', 'aria-label': 'Cents sharp or flat for each note' });
    const step = (W - L - 6) / notes.length;
    // In-tune band and grid
    svg.appendChild(el('rect', { x: L, y: mid - IN_TUNE * scale, width: W - L - 6, height: IN_TUNE * 2 * scale, class: 'inton-band' }));
    for (const v of [-40, -20, 0, 20, 40]) {
      svg.appendChild(el('line', { x1: L, x2: W - 6, y1: mid - v * scale, y2: mid - v * scale, class: v ? 'inton-grid' : 'inton-zero' }));
      svg.appendChild(el('text', { x: L - 5, y: mid - v * scale + 3.5, 'text-anchor': 'end', class: 'inton-axis' }, (v > 0 ? '+' : '') + v));
    }
    notes.forEach((m, i) => {
      const x = L + i * step + step / 2, rec = d[m];
      const g = el('g', { class: 'inton-col' + (run && run.notes[run.k] === m ? ' now' : '') });
      g.appendChild(el('rect', { x: x - step / 2, y: 0, width: step, height: H, class: 'inton-hit' }));
      if (rec) {
        const c = Math.max(-40, Math.min(40, rec.c)), h = Math.max(2, Math.abs(c) * scale);
        const cls = Math.abs(rec.c) <= IN_TUNE ? 'ok' : rec.c > 0 ? 'sharp' : 'flat';
        g.appendChild(el('rect', { x: x - Math.min(7, step * 0.32), y: c > 0 ? mid - h : mid, width: Math.min(14, step * 0.64), height: h, rx: 2, class: 'inton-bar ' + cls }));
        g.appendChild(el('title', {}, `${nameOf(m)} (${TP.fmtFingering(rec.f)}): ${rec.c > 0 ? '+' : ''}${rec.c}¢ — ${advice(m, rec)}. Click to measure again.`));
      } else {
        g.appendChild(el('circle', { cx: x, cy: mid, r: 2, class: 'inton-none' }));
        g.appendChild(el('title', {}, `${nameOf(m)}: not measured yet. Click to measure.`));
      }
      // Note names along the bottom (every note when there's room, else the naturals).
      const n = TP.spell(m, 'flats');
      if (step >= 20 || !n.acc) g.appendChild(el('text', { x, y: H - 3, 'text-anchor': 'middle', class: 'inton-axis' }, n.letter + (n.acc ? '♭' : '') + n.octave));
      g.addEventListener('click', () => { if (!run) start(m); });
      svg.appendChild(g);
    });
    const wrap = document.createElement('div');
    wrap.className = 'staff-scroll';
    wrap.appendChild(svg);
    svg.style.width = W + 'px';
    box.appendChild(wrap);
    box.insertAdjacentHTML('beforeend', '<div class="inton-key"><span class="sw sharp"></span>sharp <span class="sw flat"></span>flat <span class="sw ok"></span>in tune (±5¢)</div>');
    renderAdvice(notes, d);
  }
  function renderAdvice(notes, d) {
    const worst = notes.filter(m => d[m] && Math.abs(d[m].c) > IN_TUNE + 5)
      .sort((a, b) => Math.abs(d[b].c) - Math.abs(d[a].c)).slice(0, 6);
    const box = $('intAdvice');
    if (!worst.length) { box.innerHTML = notes.some(m => d[m]) ? '<p class="sub tight">Nothing more than 10¢ off — nice.</p>' : ''; return; }
    box.innerHTML = '<h3>Your tendencies</h3>' + worst.map(m => {
      const r = d[m];
      return `<div class="inton-row ${r.c > 0 ? 'sharp' : 'flat'}"><b>${nameOf(m)}</b><span class="fing">${TP.fmtFingering(r.f)}</span>`
        + `<span class="cents">${r.c > 0 ? '+' : ''}${r.c}¢</span><span>${advice(m, r)}</span></div>`;
    }).join('') + '<p class="sub tight">Slide distances are estimates from the tube length; check with the tuner. Measured with the main fingering.</p>';
  }

  $('intStart').addEventListener('click', e => { e.currentTarget.blur(); if (run) stop(); else start(); });
  $('intSkip').addEventListener('click', () => next());
  $('intHear').addEventListener('click', () => { if (run) TP.playMidi(run.notes[run.k], 1.4); });
  document.querySelector('.tab[data-tab="tuner"]').addEventListener('click', () => setTimeout(render, 0));

  // ---------- lip slur builder (opens the exercise in Pieces) ----------
  function fillSlurs() {
    const fsel = $('lsF'), psel = $('lsP'), keep = fsel.value;
    fsel.textContent = '';
    for (const f of TP.slurOptions()) fsel.add(new Option(TP.fmtFingering(f), f === '' ? 'open' : f));
    if ([...fsel.options].some(o => o.value === keep)) fsel.value = keep;
    if (!psel.options.length) for (const [k, v] of Object.entries(TP.slurPatterns)) psel.add(new Option(v, k));
    showPartials();
  }
  function showPartials() {
    const f = $('lsF').value === 'open' ? '' : $('lsF').value;
    const ps = TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high && FINGERINGS[m] && FINGERINGS[m].includes(f));
    $('lsNotes').textContent = ps.length ? 'Notes: ' + ps.map(nameOf).join(' · ') : '';
  }
  $('lsF').addEventListener('change', showPartials);
  $('lsGo').addEventListener('click', () => {
    S.pieceId = `slur:${$('lsF').value}:${$('lsP').value}`;
    TP.save();
    TP.show('pieces');
  });
  document.querySelector('.tab[data-tab="tuner"]').addEventListener('click', () => setTimeout(fillSlurs, 0));
  fillSlurs();

  TP.inton = { stop, render };
  render();
})();
