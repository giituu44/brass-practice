// Shared pieces for every mode: saved settings, the instrument, note spelling,
// the staff, sound (samples, synth, metronome clicks) and the valve/slide input.
const TP = (() => {
  'use strict';

  const STORE_KEY = 'tuba-practice-v1';
  const ALL_MIDI = [];   // every note on the current instrument's chart (filled by applyInstrument)
  const DEFAULTS = {
    instrument: 'tuba-bb4',
    ranges: {},       // practice range per instrument
    low: 29,          // F1
    high: 53,         // F3
    spelling: 'both',
    accept: 'any',
    sound: true,
    autoplay: false,
    showName: false,
    tone: 'iowa',     // a key of SAMPLE_SETS, or 'synth'
    tab: 'today',
    todayMins: 20,        // the daily routine fits this many minutes
    input: 'valves',      // 'valves' (keyboard/touch) or 'mic' (play your tuba)
    micAnyOctave: false,  // accept the right note name in the wrong octave
    youSound: true,       // play-along: your note sounds when you finger it right
    wrongSound: true,     // …and a wrong note sounds when you don't
    timing: 'normal',     // 'strict' | 'normal' | 'lenient' timing windows
    latencyMs: 0,         // audio offset: how late your keys land vs. what you hear
    valveKeys: ['j', 'k', 'l', ';'],   // keys for valves 1–4 (rebindable)
    theme: 'auto',        // 'auto' (follow the system), 'light' or 'dark'
    // scales
    scaleKey: 'Bb',
    scaleType: 'major',
    scaleOctaves: 1,
    scaleStart: null, // MIDI note of the first tonic; null = pick one in your range
    scaleShowFingerings: false,
    scaleMode: 'flow',     // 'flow' = play along with a metronome, 'step' = at your own pace
    scaleTempo: 60,
    scalePlayAlong: true,  // tuba plays each note on its beat
    scaleLoop: false,      // repeat, +4 bpm after each clean run
    // pieces
    pieceId: null,
    pieceMode: 'play',     // 'play' along, 'wait' for me, or 'listen'
    pieceBpm: 100,
    pieceClick: true,
    pieceGuide: false,
    pieceLoop: false,
    pieceRamp: false,
    a4: 440,             // tuning reference (Hz); many bands use 442
    pieceAcc: true,      // play the piano accompaniment where a piece has one
    pieceMemo: false,      // memorize: hide notes until played
    pieceView: 'scroll',   // 'scroll' = music moves past a play line, 'page' = whole page with a playhead
    // fingerings
    fMode: 'self',         // 'self' = press Space, 'auto' = accepts when right, 'timed' = metronome
    fKey: 'all',           // 'all' notes, or a major key name to read in that key
    fTempo: 60,
    fBeats: 2,             // beats per note in timed mode
    fEar: false,           // ear training: hear the note instead of seeing it
    // rhythm
    tempo: 80,
    beats: 4,
    rhythmLevel: 1,
    rhythmBars: 2,
    clickDuring: true,
    rhythmTime: null,     // '2/4' '3/4' '4/4' '6/8' (null: from beats)
    scalePattern: 'straight',
    micSens: 'normal',    // mic sensitivity: 'low' (noisy room) | 'normal' | 'high' (quiet mic)
    micLatencyMs: 0,      // how late the mic hears you (Settings: calibrate with your horn)
    ltShape: 'steady',    // long tones: 'steady' | 'cres' | 'dim' | 'swell'
    tgBpm: 80,            // tonguing trainer tempo
    tgSub: 4,             // …and notes per beat
    intAlts: false,       // intonation map: measure alternate fingerings too
    compensating: false,  // 4-valve horn with compensating valves (combinations with 4 stay in tune)
    countIn: 1,           // bars of clicks before Pieces and Scales start
    restAfter: 20,        // minutes of playing before a rest reminder (0 = off)
    handsFree: false,     // with the mic: a short note starts the count-in
    pedal: true,          // page-turner pedal keys: → / Page Down = Space, ← / Page Up = Esc
    keepAwake: false,     // keep the screen on while the app is open (stand mode always does)
    sessionRest: 20,      // seconds of rest between the steps of a guided session
    cbColors: false,      // colour-blind friendly grading colours
    fRead: 'concert',     // Fingerings: read in 'concert' pitch, 'band' (brass band treble clef) or 'tenor' clef
    echoLevel: 1,         // Echo: phrase difficulty 1–4
    echoBpm: 80,
    echoKey: 'any',
    pieceDuet: true,      // duets: the app plays the other part
    duetPart: 1,          // …and you play part 1 or 2
    myFingerings: true,   // Pieces: show a fingering that sits better on your horn (from the intonation map)
    pieceHints: 'off',    // Pieces: fingerings under the notes: 'off' | 'fade' (as you learn) | 'always'
    pieceBacking: 'none', // Pieces without accompaniment: 'none' | 'drone' | 'chords'
    todayCustom: null,    // Today: your own list of steps (null = built from the time you have)
    breathPattern: '4-0-8',
    breathRounds: 6,
    buzzPattern: 'siren',
    sbRounds: 6,          // Sing, buzz, play: notes per go
    remindDays: [1, 3, 5],// practice reminder (calendar file): days of the week, 0 = Sunday
    remindTime: '18:00',
  };

  // ---------- storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return { ...d, settings: { ...DEFAULTS, ...d.settings }, notes: d.notes || {}, scales: d.scales || {}, days: d.days || {}, lastAct: d.lastAct || 0 };
      }
    } catch (e) { /* storage unavailable */ }
    return { settings: { ...DEFAULTS }, notes: {}, scales: {}, days: {}, lastAct: 0 };
  }
  const store = load();
  const S = store.settings;
  // The saved data's format. Bump it and add a step to migrate() when the shape changes.
  //   1: everything at the top level (per-instrument history copied there too)
  //   2: per-instrument history saved only under byInst
  const SCHEMA = 2;
  function migrate() {
    // 1 -> 2 needs nothing on load: applyInstrument reads byInst, and the stale
    // top-level copies are simply left out of the next save (see serialize).
    store.schema = SCHEMA;
  }
  migrate();
  // Everything once: store.notes, store.pieces… are the current instrument's history,
  // which also lives under byInst — so they're left out here rather than saved twice.
  const serialize = space => JSON.stringify(store, function (k, v) {
    return this === store && PER_INSTRUMENT.includes(k) && store.byInst ? undefined : v;
  }, space);
  // Opened by the tests' smoke check (index.html?smoke): look but never save.
  const SMOKE = /[?&]smoke\b/.test(location.search);
  // Returns false if it couldn't save (storage blocked or full). The first failure
  // says so (once, until a save works again); `quiet` callers report it themselves.
  let saveWarned = false;
  function save(quiet = false) {
    if (SMOKE) return true;
    try {
      localStorage.setItem(STORE_KEY, serialize());
      saveWarned = false;
      return true;
    } catch (e) {
      if (!quiet && !saveWarned && api.toast) {
        saveWarned = true;
        api.toast('Your progress isn’t being saved — the browser’s storage for this page is full or blocked. Back up (Settings), then delete some of My pieces.', 12000);
      }
      return false;
    }
  }
  // Setting values from earlier versions.
  if (S.tone === 'real') S.tone = 'musyng';
  if (/^iowa_/.test(S.tone)) S.tone = 'iowa';

  const $ = id => document.getElementById(id);

  // A short message at the bottom of the screen.
  let toastTimer = 0;
  function toast(text, ms = 4000) {
    const t = $('toast');
    if (!t) return;
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ---------- practice log ----------
  const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');   // YYYY-MM-DD, local time
  const progressListeners = [];
  // Call on every answer or attempt: counts today's minutes (gaps over 90 s don't count).
  // Rest reminders (Settings): brass players' lips tire. After so many minutes of
  // playing with no real break (2+ minutes), say so — once per stretch.
  let stretch = 0, restWarned = false;
  function remindRest(minutes) {
    if (S.restAfter && !restWarned && minutes >= S.restAfter) {
      restWarned = true;
      toast(`You've been playing for ${S.restAfter} minutes without a break — rest your lips for a few minutes. (A good rule: rest about as much as you play.)`, 10000);
    }
  }
  function activity() {
    const now = Date.now();
    if (!stretch || !store.lastAct || now - store.lastAct > 120000) { stretch = now; restWarned = false; }
    // With the mic listening, the reminder counts time actually playing instead (played()).
    if (!(api.mic && api.mic.active)) remindRest((now - stretch) / 60000);
    const d = store.days[dayKey()] || (store.days[dayKey()] = { sec: 0, n: 0 });
    if (store.lastAct && now - store.lastAct < 90000) d.sec += (now - store.lastAct) / 1000;
    store.lastAct = now;
    d.n++;
    // Today's snapshot, for the trend in Progress.
    if (store.snap) store.snap[dayKey()] = notesMastered();
    save();
    progressListeners.forEach(fn => fn());
  }
  // Time with sound coming out of the horn, as the mic hears it (sec at a time): kept per
  // day beside the time in the app (Progress shows both), and what rest reminders count
  // while the mic is on — minutes of sound since your last break of 2 minutes or more.
  const sound = { stretch: 0, last: 0, unsaved: 0 };
  function played(sec) {
    const now = Date.now();
    if (now - sound.last > 120000) { sound.stretch = 0; restWarned = false; }
    sound.last = now;
    sound.stretch += sec;
    remindRest(sound.stretch / 60);
    const d = store.days[dayKey()] || (store.days[dayKey()] = { sec: 0, n: 0 });
    d.play = (d.play || 0) + sec;
    if ((sound.unsaved += sec) >= 15) { sound.unsaved = 0; save(); }
  }
  // Today's routine: modes mark what's been done, e.g. markDone('scale').
  function markDone(key, n = 1) {
    const d = store.days[dayKey()] || (store.days[dayKey()] = { sec: 0, n: 0 });
    d.done = d.done || {};
    d.done[key] = (d.done[key] || 0) + n;
    save();
    progressListeners.forEach(fn => fn());
  }
  // Notes you've mastered in your practice range (3+ answers, 85%+ recently).
  function notesMastered() {
    const range = ALL_MIDI.filter(m => m >= S.low && m <= S.high);
    return { mastered: range.filter(m => store.notes[m] && store.notes[m].seen >= 3 && store.notes[m].ema >= 0.85).length, total: range.length };
  }
  const doneToday = key => { const d = store.days[dayKey()]; return (d && d.done && d.done[key]) || 0; };
  function progress() {
    const today = store.days[dayKey()];
    let streak = 0;
    const d = new Date();
    if (!today) d.setDate(d.getDate() - 1);          // streak still alive until tonight
    while (store.days[dayKey(d)] && store.days[dayKey(d)].n) { streak++; d.setDate(d.getDate() - 1); }
    return { streak, minutes: today ? Math.floor(today.sec / 60) : 0, today: today ? today.n : 0 };
  }

  // ---------- note spelling ----------
  const LETTERS = 'CDEFGAB';
  const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARPS = [['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['A',1],['B',0]];
  const FLATS  = [['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['G',-1],['G',0],['A',-1],['A',0],['B',-1],['B',0]];
  const ACC_TEXT = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };

  function spell(midi, pref) {
    const useSharps = pref === 'sharps' || (pref === 'both' && Math.random() < 0.5);
    const [letter, acc] = (useSharps ? SHARPS : FLATS)[midi % 12];
    return { midi, letter, acc, octave: Math.floor(midi / 12) - 1 };
  }
  // Spell a note with a given letter name, e.g. MIDI 60 as "B" gives B♯3.
  function spellAs(midi, letter) {
    let acc = ((midi - NATURAL_PC[letter]) % 12 + 12) % 12;
    if (acc > 6) acc -= 12;
    return { midi, letter, acc, octave: Math.floor((midi - acc) / 12) - 1 };
  }
  const label = n => n.letter + ACC_TEXT[n.acc] + n.octave;
  const tonicPc = t => (NATURAL_PC[t[0]] + (t[1] === '#' ? 1 : t[1] === 'b' ? -1 : 0) + 12) % 12;
  const tonicName = t => t[0] + (t[1] === '#' ? '♯' : t[1] === 'b' ? '♭' : '');

  // ---------- keys ----------
  const MAJOR_FIFTHS = { Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7 };
  const SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF';
  const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];

  // Key signature as a count of fifths (+ sharps, − flats), or null when the key
  // would need double sharps/flats (e.g. G♯ major — written as A♭ instead).
  function keyFifths(tonic, minor) {
    if (!minor) return tonic in MAJOR_FIFTHS ? MAJOR_FIFTHS[tonic] : null;
    const letter = LETTERS[(LETTERS.indexOf(tonic[0]) + 2) % 7];          // relative major
    const rel = spellAs(60 + tonicPc(tonic) + 3, letter);
    const name = letter + (rel.acc === 1 ? '#' : rel.acc === -1 ? 'b' : rel.acc ? '?' : '');
    return name in MAJOR_FIFTHS ? MAJOR_FIFTHS[name] : null;
  }
  // The accidental a key signature gives a letter.
  function keySigAcc(fifths, letter) {
    if (fifths > 0) return SHARP_ORDER.indexOf(letter) < fifths ? 1 : 0;
    if (fifths < 0) return FLAT_ORDER.indexOf(letter) < -fifths ? -1 : 0;
    return 0;
  }
  // Which accidental to print on each note, given the key signature and that an
  // accidental lasts until the end of its bar. null = print nothing, 0 = natural.
  function shownAccidentals(notes, fifths, barOf = () => 0) {
    let bar = -1, state;
    return notes.map((n, i) => {
      if (barOf(i) !== bar) { bar = barOf(i); state = new Map(); }
      const k = n.letter + n.octave;
      const cur = state.has(k) ? state.get(k) : keySigAcc(fifths, n.letter);
      state.set(k, n.acc);
      return n.acc === cur ? null : n.acc;
    });
  }
  // Pitch class -> letter for each degree of a major key, e.g. F major: A♯ is never used, B♭ is.
  function majorLetters(tonic) {
    const map = {};
    let pc = tonicPc(tonic), li = LETTERS.indexOf(tonic[0]);
    for (const s of MAJOR_STEPS) { map[pc] = LETTERS[li]; pc = (pc + s) % 12; li = (li + 1) % 7; }
    return map;
  }
  const flatLabel = midi => label(spell(midi, 'flats'));
  // A menu of every note on the chart, keeping its choice; by default an open note
  // in the middle of your practice range.
  function noteMenu(sel, def) {
    const keep = sel.value;
    sel.textContent = '';
    for (const m of ALL_MIDI) sel.add(new Option(flatLabel(m), m));
    const mid = def !== undefined ? def
      : ALL_MIDI.find(m => m >= (S.low + S.high) / 2 && FINGERINGS[m] && FINGERINGS[m][0] === '') || ALL_MIDI[Math.floor(ALL_MIDI.length / 2)];
    sel.value = keep && FINGERINGS[keep] ? keep : mid;
  }
  // The alternate fingering your intonation map found sits clearly better (8¢+) than
  // the main one, or null.
  function myFingering(midi) {
    const d = store.intonation && store.intonation[midi];
    if (!d || !d.alts || d.c === undefined || !FINGERINGS[midi]) return null;
    let best = null;
    for (const [f, a] of Object.entries(d.alts)) {
      if (f !== d.f && Math.abs(d.c) - Math.abs(a.c) >= 8 && (!best || Math.abs(a.c) < Math.abs(best[1].c))) best = [f, a];
    }
    return best ? best[0] : null;
  }
  // How far a valve combination lands from in tune, in cents (+ = sharp), on an ideal
  // horn: each valve's tubing is cut for the open horn, so two or more together are
  // too short. Compensating 4-valve horns fix the combinations that use the 4th valve.
  const VALVE_SEMIS = { 1: 2, 2: 1, 3: 3, 4: 5 };
  function comboCents(f) {
    if (!inst || inst.kind === 'slide' || !f || f.length < 2) return 0;
    if (S.compensating && f.includes('4')) return 0;
    const semis = [...f].reduce((a, v) => a + VALVE_SEMIS[v], 0);
    const added = [...f].reduce((a, v) => a + (2 ** (VALVE_SEMIS[v] / 12) - 1), 0);
    return Math.round(1200 * Math.log2(2 ** (semis / 12) / (1 + added)));
  }
  const fmtFingering = f => (f === '' ? 'open' : inst.kind === 'slide' ? 'pos ' + f : f);

  function checkFingering(midi, ans) {
    const valid = FINGERINGS[midi];
    const ok = S.accept === 'any' ? valid.includes(ans) : valid[0] === ans;
    return { ok, valid, shown: S.accept === 'any' ? valid : [valid[0]] };
  }

  // ---------- staff drawing ----------
  const NS = 'http://www.w3.org/2000/svg';
  const STEP = 6;          // px per diatonic step (half a line gap)
  // Diatonic index of the bottom staff line: G2 in bass clef, E4 in treble.
  let BOTTOM = 4 + 7 * 2;
  let clef = 'bass';

  const diatonic = n => LETTERS.indexOf(n.letter) + 7 * n.octave;
  const stepOf = n => diatonic(n) - BOTTOM;  // 0 = bottom line, 8 = top line
  const yOf = step => -step * STEP;

  function el(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // Staff steps needed to show every note from MIDI lo to hi, however it's spelled.
  const stepRange = (lo, hi) => [stepOf(spell(lo, 'sharps')) - 1, stepOf(spell(hi, 'flats')) + 1];

  // Where key-signature sharps and flats sit, per clef.
  const KEY_STEPS = {
    bass: { sharp: { F: 6, C: 3, G: 7, D: 4, A: 1, E: 5, B: 2 }, flat: { B: 2, E: 5, A: 1, D: 4, G: 0, C: 3, F: -1 } },
    treble: { sharp: { F: 8, C: 5, G: 9, D: 6, A: 3, E: 7, B: 4 }, flat: { B: 4, E: 7, A: 3, D: 6, G: 1, C: 5, F: 2 } },
    // Tenor clef: the sharps start low (F♯ on the second line), the flats on the third space.
    tenor: { sharp: { F: 2, C: 6, G: 3, D: 7, A: 4, E: 8, B: 5 }, flat: { B: 5, E: 8, A: 4, D: 7, G: 3, C: 6, F: 2 } },
  };
  // Bottom staff line per clef (diatonic index): G2 bass, E4 treble, D3 tenor.
  const CLEF_BOTTOM = { bass: 4 + 7 * 2, treble: 2 + 7 * 4, tenor: 1 + 7 * 3 };
  // Draw in another clef for a while (e.g. a reading drill); returns the one it replaced.
  function useClef(name) {
    const was = clef;
    clef = CLEF_BOTTOM[name] !== undefined ? name : 'bass';
    BOTTOM = CLEF_BOTTOM[clef];
    return was;
  }
  const SHOWN_ACC = { '-2': '𝄫', '-1': '♭', '0': '♮', '1': '♯', '2': '𝄪' };
  const KEYSIG_X = 44;
  // Room the clef and key signature take; notes start after this.
  const staffStart = fifths => KEYSIG_X + (fifths ? Math.abs(fifths) * 9 + 8 : 4);

  function accGlyph(g, acc, x, y) {
    const dy = acc === -1 || acc === -2 ? 4 : acc === 0 ? 7 : acc === 2 ? 4 : 8;
    g.appendChild(el('text', { x, y: y + dy, 'font-size': 24, 'text-anchor': 'middle', class: 'acc' }, SHOWN_ACC[acc]));
  }

  // Five lines, the clef and the key signature.
  function drawStaffBase(svg, width, fifths) {
    for (let i = 0; i < 5; i++) {
      const y = yOf(i * 2);
      svg.appendChild(el('line', { x1: 6, x2: width - 6, y1: y, y2: y, class: 'staff-line' }));
    }
    if (clef === 'treble') {
      // Treble clef: the curl wraps the G4 line (step 2).
      svg.appendChild(el('text', { x: 10, y: yOf(2) + 15, 'font-size': 58, class: 'clef' }, '𝄞'));
    } else if (clef === 'tenor') {
      // Tenor clef: a C clef centred on the fourth line (middle C, step 6).
      svg.appendChild(el('text', { x: 12, y: yOf(6) + 12, 'font-size': 46, class: 'clef' }, '𝄡'));
    } else {
      // Bass clef: the dots sit around the F3 line (step 6).
      svg.appendChild(el('text', { x: 12, y: yOf(6) + 26, 'font-size': 50, class: 'clef' }, '𝄢'));
    }
    const ks = el('g', { class: 'keysig' });
    const order = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
    const spots = KEY_STEPS[clef][fifths > 0 ? 'sharp' : 'flat'];
    for (let i = 0; i < Math.abs(fifths); i++) {
      accGlyph(ks, fifths > 0 ? 1 : -1, KEYSIG_X + 4 + i * 9, yOf(spots[order[i]]));
    }
    svg.appendChild(ks);
  }

  // Draw a bass staff `width` units wide with whole notes on it.
  // items: [{ note, x, cls, text, cursor, acc }] — acc is the accidental to print
  // (null for none; default: the note's own). `steps` is the [low, high] staff range
  // to make room for, so the staff doesn't jump between notes.
  // opts: { fifths: key signature, bars: x positions of barlines, final: x of the end barline }
  function drawStaff(svg, width, items, steps, opts = {}) {
    const fifths = opts.fifths || 0;
    svg.textContent = '';
    const lo = Math.min(steps[0], ...items.map(i => stepOf(i.note)), -1);
    const hi = Math.max(steps[1], ...items.map(i => stepOf(i.note)), 9);
    const textY = yOf(lo) + 24;
    const top = yOf(hi) - 20;
    const bottom = items.some(i => i.text2) ? textY + 20 : items.some(i => i.text) ? textY + 6 : yOf(lo) + 20;
    svg.setAttribute('viewBox', `0 ${top} ${width} ${bottom - top}`);

    for (const it of items) {
      if (it.cursor) svg.appendChild(el('rect', { x: it.x - 17, y: top + 4, width: 34, height: bottom - top - 8, rx: 6, class: 'cursor' }));
    }
    drawStaffBase(svg, width, fifths);
    for (const x of opts.bars || []) {
      svg.appendChild(el('line', { x1: x, x2: x, y1: yOf(8), y2: yOf(0), class: 'barline' }));
    }
    if (opts.final) {
      svg.appendChild(el('line', { x1: opts.final - 5, x2: opts.final - 5, y1: yOf(8), y2: yOf(0), class: 'barline' }));
      svg.appendChild(el('rect', { x: opts.final - 2, y: yOf(8), width: 3, height: yOf(0) - yOf(8), class: 'barline-thick' }));
    }

    for (const it of items) {
      const { note, x } = it;
      const step = stepOf(note);
      const y = yOf(step);
      for (let s = -2; s >= step; s -= 2) {
        svg.appendChild(el('line', { x1: x - 13, x2: x + 13, y1: yOf(s), y2: yOf(s), class: 'staff-line' }));
      }
      for (let s = 10; s <= step; s += 2) {
        svg.appendChild(el('line', { x1: x - 13, x2: x + 13, y1: yOf(s), y2: yOf(s), class: 'staff-line' }));
      }
      const g = el('g', { class: 'note' + (it.cls ? ' ' + it.cls : '') });
      // A mark as well as a colour (× wrong, › late or fixed), so grading reads without colour.
      const mark = { wrong: '×', fixed: '›' }[it.cls];
      if (mark) g.appendChild(el('text', { x, y: Math.min(y - 13, yOf(10)), 'font-size': 13, 'text-anchor': 'middle', class: 'state-mark' }, mark));
      const acc = it.acc !== undefined ? it.acc : (note.acc || null);
      if (acc !== null) accGlyph(g, acc, x - 20, y);
      // Whole note: a filled oval with a tilted hole.
      g.appendChild(el('ellipse', { cx: x, cy: y, rx: 8.5, ry: 6, class: 'head' }));
      g.appendChild(el('ellipse', { cx: x, cy: y, rx: 3.6, ry: 5.2, class: 'hole', transform: `rotate(-55 ${x} ${y})` }));
      const tx = it.textX !== undefined ? it.textX : x;
      if (it.text) g.appendChild(el('text', { x: tx, y: textY, 'font-size': it.textSize || 11, 'text-anchor': 'middle', class: 'under' }, it.text));
      if (it.text2) g.appendChild(el('text', { x: tx, y: textY + 14, 'font-size': 9, 'text-anchor': 'middle', class: 'under alt' }, it.text2));
      svg.appendChild(g);
    }
  }

  // ---------- sound ----------
  // Real tuba samples come from sounds/tuba-*.js (MIDI.js soundfonts: one base64
  // MP3 per note, keyed like "Bb1"). If a set is missing, fall back to the synth.
  // Each set is a 0.5–3 MB script, so only the one in use is loaded, when first
  // needed (an added <script> tag works from file://, unlike fetch).
  const SAMPLE_SETS = {
    iowa: ['sounds/tuba-iowa.js', 'tuba_iowa'], phil: ['sounds/tuba-phil.js', 'tuba_phil'],
    musyng: ['sounds/tuba-musyng.js', 'tuba_musyng'], fluid: ['sounds/tuba-fluid.js', 'tuba_fluid'],
    trumpet: ['sounds/trumpet-phil.js', 'trumpet_phil'], trombone: ['sounds/trombone-phil.js', 'trombone_phil'],
  };
  const loading = {};
  const loadedSet = name => (SAMPLE_SETS[name] && window.MIDI && MIDI.Soundfont && MIDI.Soundfont[SAMPLE_SETS[name][1]]) || null;
  // Resolves once the set has loaded (or failed to: then the synth plays instead).
  function loadSet(name = tone()) {
    if (!SAMPLE_SETS[name] || loadedSet(name)) return Promise.resolve();
    return loading[name] || (loading[name] = new Promise(done => {
      const s = document.createElement('script');
      s.src = SAMPLE_SETS[name][0];
      s.onload = s.onerror = () => done();
      document.head.appendChild(s);
    }));
  }
  // Concert pitch in Hz for a MIDI note, at the chosen A (440, 442...).
  const hz = midi => (S.a4 || 440) * Math.pow(2, (midi - 69) / 12);

  // How far each recording is from A = 440 (cents, measured from the samples): real players
  // aren't perfectly in tune, so playback is corrected to keep the app's notes true.
  const SAMPLE_CENTS = {"iowa":{"Db1":-44,"D1":7,"Eb1":-7,"E1":5,"F1":12,"Gb1":18,"Ab1":11,"A1":4,"Bb1":28,"B1":30,"C2":20,"Db2":23,"D2":5,"Eb2":19,"E2":13,"F2":19,"Gb2":18,"G2":11,"Ab2":8,"A2":28,"Bb2":22,"B2":22,"C3":25,"Db3":13,"D3":7,"E3":3,"F3":24,"Gb3":20,"G3":7,"Ab3":-6,"A3":13,"Bb3":32,"B3":8,"C4":9},"phil":{"F1":8,"Bb1":-5,"F2":-4,"D4":-3},"musyng":{"A0":-3,"Bb0":-3,"B0":-3,"C1":-3,"Db1":-3,"D1":-3,"Eb1":-3,"E1":-9,"F1":-8,"Gb1":-8,"G1":-7,"Ab1":-7,"A1":-8,"Bb1":-8,"Eb2":-5,"E2":-5,"F2":-5,"Gb2":-5,"G2":-7,"Ab2":-7,"A2":-7,"Bb2":-7,"B2":-3,"C3":-3,"Db3":-2,"D3":-2,"Eb3":-2,"E3":-2,"F3":-2,"Gb3":-2,"B3":-2,"C4":-2,"Db4":-2,"D4":-2,"Eb4":-2,"E4":-2,"Gb4":-2,"G4":-2,"Ab4":-2,"A4":-2,"Bb4":-2},"fluid":{"Db1":-2,"D1":-2,"Eb1":-2,"E1":-2,"F1":-2,"A2":-2,"Bb2":-2,"B2":-2,"C3":-2,"Db3":-2},"trumpet":{"Eb4":-2,"F3":-12},"trombone":{"Bb3":-3,"D4":-4,"Eb3":4,"Ab3":-2}};
  const SET_GAIN = { iowa: 0.25, phil: 0.28, musyng: 1, fluid: 1, trumpet: 0.28, trombone: 0.28 }; // roughly level-matched
  const SOUND_NAMES = {
    iowa: 'Orchestral tuba (Univ. of Iowa)', phil: 'Orchestral tuba (Philharmonia)',
    musyng: 'Soundfont tuba A (MusyngKite)', fluid: 'Soundfont tuba B (FluidR3)',
    trumpet: 'Orchestral trumpet (Philharmonia)', trombone: 'Orchestral trombone (Philharmonia)', synth: 'Synth',
  };
  // The sound actually used: your choice if it suits this instrument, else its first.
  const tone = () => (S.tone === 'synth' || inst.sounds.includes(S.tone) ? S.tone : inst.sounds[0]);
  const decoded = {};
  let actx = null;

  function audio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  // Map a performance.now() time to the audio-clock time being heard at that
  // moment, so taps can be compared with scheduled clicks despite output latency.
  function heardTime(perf = performance.now()) {
    const ctx = audio();
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && ts.performanceTime) return ts.contextTime + (perf - ts.performanceTime) / 1000;
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) + (perf - performance.now()) / 1000;
  }

  const sampleKey = midi => {
    const [letter, acc] = FLATS[midi % 12];
    return letter + (acc ? 'b' : '') + (Math.floor(midi / 12) - 1);
  };
  const currentSet = () => loadedSet(tone());

  // The recording to use for a note: its own, or the nearest one within 5
  // semitones, pitch-shifted (the Philharmonia set has a note every 2-5 semitones).
  function findSample(midi) {
    const set = currentSet();
    if (!set) return null;
    for (const d of [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5]) {
      const key = sampleKey(midi + d);
      if (set[key]) return { key, rate: Math.pow(2, -d / 12) };
    }
    return null;
  }

  function decodeSample(key) {
    const id = tone() + ':' + key;
    if (!decoded[id]) {
      const bin = atob(currentSet()[key].split(',')[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      decoded[id] = audio().decodeAudioData(bytes.buffer);
    }
    return decoded[id];
  }

  // Decode notes ahead of time so playing them isn't delayed.
  function preload(midis) {
    return loadSet().then(() => {
      if (!actx) return null;
      const jobs = [];
      for (const m of midis) {
        const s = findSample(m);
        if (s) jobs.push(decodeSample(s.key).catch(() => {}));
      }
      return Promise.all(jobs);
    });
  }

  // Play a (written-pitch) note now, or at audio time `at`. Resolves to something
  // with stop(). `gate`: the microphone ignores what it hears while this plays
  // (so the app doesn't grade its own sound). Play-along guide notes pass false.
  function playMidi(written, dur = 1.3, at = 0, gate = true, vol = 1) {
    // The very first note may have to wait a moment for its sample set to load.
    if (!currentSet() && SAMPLE_SETS[tone()] && !loading[tone() + ':done']) {
      return loadSet().then(() => { loading[tone() + ':done'] = true; return playMidi(written, dur, at, gate, vol); });
    }
    const midi = written - inst.transpose;     // what it sounds like
    try {
      const ctx = audio();
      if (gate) api.outputUntil = Math.max(api.outputUntil, Math.max(at, ctx.currentTime) + dur);
      const s = findSample(midi);
      if (s) {
        return decodeSample(s.key).then(
          buf => playBuffer(buf, s.rate * (S.a4 || 440) / 440 * 2 ** (-(((SAMPLE_CENTS[tone()] || {})[s.key]) || 0) / 1200), dur, Math.max(at, ctx.currentTime), vol),
          () => playSynth(midi, dur, at, vol));
      }
      return Promise.resolve(playSynth(midi, dur, at, vol));
    } catch (e) {
      return Promise.resolve({ stop() {} });
    }
  }

  function playBuffer(buf, rate, dur, t, vol = 1) {
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = actx.createGain();
    const level = (SET_GAIN[tone()] || 1) * vol;
    const release = Math.min(0.25, dur * 0.4);
    g.gain.setValueAtTime(level, t);
    g.gain.setValueAtTime(level, t + dur - release);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(g);
    g.connect(actx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
    return src;
  }

  function playSynth(midi, dur, at, vol = 1) {
    const t = Math.max(at, actx.currentTime);
    const f = hz(midi);
    const release = Math.min(0.2, dur * 0.4);

    const out = actx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.3 * vol, t + 0.05);
    out.gain.setValueAtTime(0.3 * vol, t + dur - release);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // Brassy-ish: two slightly detuned saws through a filter that opens on the attack.
    const lp = actx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1;
    lp.frequency.setValueAtTime(f * 2, t);
    lp.frequency.linearRampToValueAtTime(Math.min(f * 9, 2600), t + 0.08);
    lp.frequency.linearRampToValueAtTime(Math.min(f * 6, 1800), t + 0.35);

    const oscs = [1, 1.004].map(detune => {
      const o = actx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
      return o;
    });
    lp.connect(out);
    out.connect(actx.destination);
    return { stop() { oscs.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }); } };
  }

  // Accompaniment piano: a soft FM electric piano (no samples to load). Concert pitch.
  let pianoBus = null;
  function pianoOut() {
    if (!pianoBus) {
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      pianoBus = actx.createGain();
      pianoBus.gain.value = 0.55;
      pianoBus.connect(comp);
      comp.connect(actx.destination);
    }
    return pianoBus;
  }
  function playPiano(midi, dur, at, vol = 1) {
    const ctx = audio();
    const t = Math.max(at, ctx.currentTime), f = hz(midi);
    const len = Math.max(0.12, dur);
    const amp = ctx.createGain(), car = ctx.createOscillator(), mod = ctx.createOscillator(), idx = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f;
    // The FM index (brightness) falls fast after the strike, like a tine.
    idx.gain.setValueAtTime(f * 1.6, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.25);
    // Louder low notes are boomy: ease off below middle C.
    const level = 0.16 * vol * (midi < 60 ? 0.75 + 0.25 * Math.max(0, (midi - 36) / 24) : 1);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(level, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(level * 0.35, t + Math.min(1.2, len));
    amp.gain.setValueAtTime(level * 0.35, t + len);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.18);
    mod.connect(idx);
    idx.connect(car.frequency);
    car.connect(amp);
    amp.connect(pianoOut());
    car.start(t); mod.start(t);
    car.stop(t + len + 0.25); mod.stop(t + len + 0.25);
    return { stop() { try { amp.gain.cancelScheduledValues(0); amp.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); car.stop(ctx.currentTime + 0.15); mod.stop(ctx.currentTime + 0.15); } catch (e) { /* done */ } } };
  }

  // Metronome click at audio time `at`; the first beat of a bar is higher.
  function click(at, accent) {
    const ctx = audio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.6 : 0.4, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.06);
    return o;
  }

  // ---------- valves ----------
  const VALVE_KEYS = {};      // key -> valve (or slide position); set per instrument
  let valveBtns = [];
  const held = new Set();     // keys physically held down
  const touched = new Set();  // valves held down by a finger on a touch screen
  const latched = new Set();  // valves toggled by mouse click
  // Valves: every valve down, e.g. "124". Slide: the position, e.g. "3".
  function fingering() {
    if (inst.kind === 'slide') {
      const all = [...latched, ...held, ...touched];
      return all.length ? all[all.length - 1] : '';
    }
    return [...new Set([...held, ...touched, ...latched])].sort().join('');
  }

  // Every fingering change, stamped with the audio time being heard, so timed
  // modes can ask "what was held on that beat?" after the fact.
  const valveLog = [];
  const valveListeners = [];
  let lastFingering = '';
  // When a key press "really" happened relative to the music you heard, allowing
  // for a known audio delay (e.g. Bluetooth headphones).
  const inputTime = (perf = performance.now()) => heardTime(perf) - (S.latencyMs || 0) / 1000;
  function logValves() {
    if (actx) {
      valveLog.push({ t: inputTime(), f: lastFingering });
      if (valveLog.length > 400) valveLog.splice(0, 200);
    }
  }
  function renderValves() {
    for (const b of valveBtns) {
      const v = b.dataset.valve;
      const down = held.has(v) || touched.has(v) || latched.has(v);
      b.classList.toggle('down', down);
      b.setAttribute('aria-pressed', String(down));
    }
    const f = fingering();
    if (f !== lastFingering) {
      lastFingering = f;
      logValves();
      for (const it of live) tryHit(it, f);
      valveListeners.forEach(fn => fn(f));
    }
  }
  // The fingering held at audio time t, and since when.
  function fingeringAt(t) {
    let cur = { t: -Infinity, f: '' };
    for (const e of valveLog) {
      if (e.t <= t) cur = e; else break;
    }
    return cur;
  }
  // Judge a note due on the beat at audio time t. Holding the right valves by the
  // beat is 'perfect'; getting there within `grace` seconds after is 'late'.
  function judgeBeat(t, midi, grace) {
    const at = fingeringAt(t + grace);
    if (!checkFingering(midi, at.f).ok) return { grade: 'miss', played: at.f };
    return { grade: at.t <= t + 0.03 * timingScale() ? 'perfect' : 'late', played: at.f };
  }
  // How forgiving timed modes are.
  const timingScale = () => ({ strict: 0.6, normal: 1, lenient: 1.7 }[S.timing] || 1);
  const graceFor = dur => Math.min(0.2 * timingScale(), dur * 0.45 * timingScale());
  // Grading one note of a timed exercise (Scales, Pieces, Echo), due at audio time t
  // and lasting dur seconds. With the valves: what was held on the beat. With the mic:
  // whether it sounded, starting near t (a real note takes a moment to speak). Call it
  // once its window has closed, at t + gradeWait(dur, mic). `again`: the same pitch as
  // the note before, so it has to be played again, not just held over.
  const micWindow = dur => Math.min(0.45, Math.max(0.2, dur * 0.8));
  const gradeWait = (dur, mic) => (mic ? micWindow(dur) : graceFor(dur));
  function gradeNote(t, midi, dur, mic, again = false) {
    if (mic) {
      const first = api.mic.heard(midi, t - 0.15, t + micWindow(dur), 2, again);
      return { grade: first === null ? 'miss' : first <= t + 0.12 ? 'perfect' : 'late', played: null };
    }
    const j = judgeBeat(t, midi, graceFor(dur));
    return { grade: j.grade, played: j.played };
  }
  // A − / + tempo control: clamps, shows and saves; returns the setter (for the + and − keys).
  function tempoControl(outId, slowerId, fasterId, { min, max, get, put }) {
    const set = v => { put(Math.max(min, Math.min(max, Math.round(v)))); $(outId).textContent = get(); save(); return get(); };
    $(slowerId).addEventListener('click', () => set(get() - 4));
    $(fasterId).addEventListener('click', () => set(get() + 4));
    return set;
  }

  // ---------- your sound in play-along ----------
  // The note sounds when you finger it right — on its beat, or the moment you get
  // there — and if you're still wrong when the window closes, you hear the note
  // your valves would actually make (or nothing, for a combination that's no note).
  const live = new Set();
  function producedBy(f, target) {
    let best = null;
    for (const m of ALL_MIDI) if (FINGERINGS[m].includes(f) && (best === null || Math.abs(m - target) < Math.abs(best - target))) best = m;
    return best;
  }
  function tryHit(item, f) {
    if (item.played || !checkFingering(item.midi, f).ok) return;
    item.played = true;
    const left = Math.max(0.15, item.dur - Math.max(0, heardTime() - item.t));
    item.run.play(item.midi, left * 0.95, 0, true);
  }
  function soundAsYouPlay(run, t, midi, dur, grace) {
    if (!S.youSound) return;
    const item = { run, t, midi, dur, played: false };
    run.at(t - 0.01, () => { live.add(item); tryHit(item, fingering()); });
    run.at(t + grace, () => {
      live.delete(item);
      if (item.played || !S.wrongSound) return;
      const w = producedBy(fingering(), midi);
      if (w !== null && w !== midi) run.play(w, Math.min(dur, 0.6), 0, true, 0.5);
    });
  }

  // ---------- scheduling ----------
  // Sounds and callbacks scheduled on the audio clock that can be cancelled together.
  function makeRun() {
    const run = {
      nodes: [], timers: [], stopped: false,
      // Call fn when audio time t is actually heard.
      at(t, fn) { run.timers.push(setTimeout(() => { if (!run.stopped) fn(); }, Math.max(0, (t - heardTime()) * 1000))); },
      add(n) { if (run.stopped) { try { n.stop(); } catch (e) { /* done */ } } else run.nodes.push(n); },
      play(midi, dur, t, gate = false, vol = 1) { playMidi(midi, dur, t, gate, vol).then(n => run.add(n)); },
      click(t, accent) { run.add(click(t, accent)); },
      piano(midi, dur, t, vol) { run.add(playPiano(midi, dur, t, vol)); },
      stop() {
        run.stopped = true;
        run.nodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } });
        run.timers.forEach(clearTimeout);
        clearInterval(run.interval);
      },
    };
    return run;
  }

  function setSubmitLabel(text) { $('submitBtn').firstChild.textContent = text + ' '; }
  function markAnswer(f) {
    for (const b of valveBtns) b.classList.toggle('answer', f.includes(b.dataset.valve));
  }
  function clearLatched() { latched.clear(); renderValves(); }
  function resetValves() { latched.clear(); markAnswer(''); renderValves(); }

  // Valve buttons (J K L ;) or slide positions (1–7) for the current instrument.
  function buildInputs() {
    const box = document.querySelector('#valvePanel .valves');
    box.textContent = '';
    for (const k of Object.keys(VALVE_KEYS)) delete VALVE_KEYS[k];
    held.clear();
    touched.clear();
    latched.clear();
    const slide = inst.kind === 'slide';
    const keys = slide ? ['1', '2', '3', '4', '5', '6', '7'] : (S.valveKeys || ['j', 'k', 'l', ';']).slice(0, inst.valves);
    keys.forEach((key, i) => {
      const v = String(i + 1);
      VALVE_KEYS[key] = v;
      const b = document.createElement('button');
      b.className = 'valve' + (slide ? ' pos' : '') + (!slide && i === 3 ? ' fourth' : '');
      b.dataset.valve = v;
      b.setAttribute('aria-label', slide ? `Slide position ${v} (key ${key})` : `Valve ${v} (key ${key === ';' ? 'semicolon' : key.toUpperCase()})`);
      // Valves look like real pistons: finger button, stem, and the casing with its key.
      b.innerHTML = slide
        ? `<span class="num">${v}</span><kbd>${key.toUpperCase()}</kbd>`
        : `<span class="cap"></span><span class="stem"></span><span class="casing"><b>${key === ';' ? ';' : key.toUpperCase()}</b><small>${v}</small></span>`;
      b.addEventListener('mousedown', e => e.preventDefault());
      // Touch: a valve is down while your finger is on it, like a real one, and
      // several fingers can hold several valves. The mouse can only click, so a
      // click toggles a valve instead.
      let byTouch = false;
      b.addEventListener('pointerdown', e => {
        byTouch = e.pointerType !== 'mouse';
        if (!byTouch) return;
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
        latched.clear();
        touched.add(v);
        renderValves();
      });
      const lift = e => {
        if (e.pointerType === 'mouse' || !touched.has(v)) return;
        touched.delete(v);
        renderValves();
      };
      b.addEventListener('pointerup', lift);
      b.addEventListener('pointercancel', lift);
      b.addEventListener('contextmenu', e => { if (byTouch) e.preventDefault(); });
      b.addEventListener('click', () => {
        if (byTouch) { byTouch = false; return; }
        if (slide) { const on = latched.has(v); latched.clear(); if (!on) latched.add(v); }
        else if (latched.has(v)) latched.delete(v);
        else latched.add(v);
        renderValves();
      });
      box.appendChild(b);
    });
    box.classList.toggle('slide', slide);
    valveBtns = [...box.querySelectorAll('.valve')];
    const hint = $('valveHint');
    if (hint) {
      hint.innerHTML = slide
        ? 'Slide: hold <kbd>1</kbd>–<kbd>7</kbd> for the position (or touch and hold one; a mouse click picks one).'
        : `Valves: hold ${keys.map(k => `<kbd>${k.toUpperCase()}</kbd>`).join(' ')}, or hold the pistons with your fingers on a touch screen (a mouse click toggles one). No valves = open.`;
    }
    lastFingering = '';
  }

  // ---------- instruments ----------
  // Practice history kept separately for each instrument.
  const PER_INSTRUMENT = ['notes', 'scales', 'pieces', 'pieceShift', 'pieceTempo', 'pieceKey', 'pieceHist', 'intonation', 'longTones', 'rangeRec', 'echo', 'trouble', 'pieceMiss', 'goals', 'snap', 'breaths'];
  let inst = null;
  function applyInstrument(id) {
    const next = INSTRUMENTS.byId[id] || INSTRUMENTS.byId['tuba-bb4'];
    store.byInst = store.byInst || {};
    if (!store.byInst[next.id]) {
      // First time on this instrument; BB♭ tuba inherits history from before instruments existed.
      store.byInst[next.id] = {};
      if (next.id === 'tuba-bb4') for (const f of PER_INSTRUMENT) if (store[f]) store.byInst[next.id][f] = store[f];
    }
    for (const f of PER_INSTRUMENT) store.byInst[next.id][f] = store.byInst[next.id][f] || {};
    if (inst && inst !== next) S.scaleStart = null;   // pick a scale octave that suits the new range
    inst = next;
    S.instrument = inst.id;
    for (const f of PER_INSTRUMENT) store[f] = store.byInst[inst.id][f];
    for (const k of Object.keys(FINGERINGS)) delete FINGERINGS[k];
    Object.assign(FINGERINGS, inst.chart());
    ALL_MIDI.length = 0;
    ALL_MIDI.push(...Object.keys(FINGERINGS).map(Number).sort((a, b) => a - b));
    useClef(inst.clef);
    const r = S.ranges[inst.id] || { low: inst.range[0], high: inst.range[1] };
    S.low = Math.max(ALL_MIDI[0], r.low);
    S.high = Math.min(ALL_MIDI[ALL_MIDI.length - 1], r.high);
    buildInputs();
    loadSet();
    if ($('instBtn')) $('instBtn').textContent = inst.short + ' ▾';
    save();
  }

  const api = {
    outputUntil: -1,
    S, store, save, serialize, $, ALL_MIDI, modes: {}, toast, SMOKE,
    noteMenu, myFingering, gradeNote, gradeWait, tempoControl,
    activity, played, notesMastered, progress, onProgress: fn => progressListeners.push(fn), markDone, doneToday, dayKey,
    LETTERS, NATURAL_PC, ACC_TEXT, SHARPS, MAJOR_FIFTHS, MAJOR_STEPS,
    spell, spellAs, label, flatLabel, fmtFingering, checkFingering, tonicPc, tonicName,
    keyFifths, keySigAcc, shownAccidentals, majorLetters,
    el, stepOf, yOf, stepRange, drawStaff, drawStaffBase, staffStart, accGlyph, useClef, comboCents,
    clef: () => clef,
    audio, heardTime, preload, playMidi, playPiano, click, makeRun, hz,
    VALVE_KEYS, held, touched, fingering, renderValves, markAnswer, clearLatched, resetValves,
    logValves, fingeringAt, judgeBeat, onValves: fn => valveListeners.push(fn), setSubmitLabel,
    inputTime, graceFor, timingScale, soundAsYouPlay, producedBy,
    inst: () => inst, applyInstrument, tone, SOUND_NAMES, buildInputs, loadSet,
    inputWord: () => (inst.kind === 'slide' ? 'slide position' : 'valves'),
  };
  applyInstrument(S.instrument);
  return api;
})();
