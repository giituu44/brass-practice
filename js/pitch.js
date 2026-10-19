// Listening to a real tuba: pitch detection on the microphone signal.
// McLeod pitch method on a 4× downsampled signal — the tuba lives between
// ~30 and ~400 Hz, so a ~12 kHz rate is plenty and keeps it cheap.
TP.mic = (() => {
  'use strict';
  const FFT = 4096, DECIM = 4, EVERY_MS = 40;
  const MIN_HZ = 27, MAX_HZ = 500, MIN_RMS = 0.003, MIN_CLARITY = 0.8;
  // Quietest signal treated as playing; Settings → Mic sensitivity scales it
  // (low = needs more sound, for noisy rooms; high = for quiet mics).
  const SENS = { low: 3, normal: 1, high: 0.35 };
  const gate = () => MIN_RMS * (SENS[TP.S.micSens] || 1);
  // Mouthpiece buzzing is rougher than a played note: a looser test for 'has a pitch'.
  let loose = false;

  // Returns { freq, clarity, rms } for a block of samples (freq 0 = no pitch).
  function detect(buf, sr) {
    const n = Math.floor(buf.length / DECIM);
    const x = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < DECIM; j++) s += buf[i * DECIM + j];
      x[i] = s / DECIM;
      mean += x[i];
    }
    mean /= n;
    let rms = 0;
    for (let i = 0; i < n; i++) { x[i] -= mean; rms += x[i] * x[i]; }
    rms = Math.sqrt(rms / n);
    if (rms < gate()) return { freq: 0, clarity: 0, rms };

    const fs = sr / DECIM;
    const maxLag = Math.min(Math.floor(fs / MIN_HZ), Math.floor(n / 2));
    const minLag = Math.floor(fs / MAX_HZ);
    // Normalised square difference: 1 = perfectly periodic at that lag.
    const nsdf = new Float32Array(maxLag + 2);
    for (let tau = 0; tau <= maxLag + 1; tau++) {
      let ac = 0, m = 0;
      for (let i = 0; i < n - tau; i++) {
        ac += x[i] * x[i + tau];
        m += x[i] * x[i] + x[i + tau] * x[i + tau];
      }
      nsdf[tau] = m ? (2 * ac) / m : 0;
    }
    // The highest point of each positive lobe (after the first zero crossing)...
    const peaks = [];
    let tau = 1;
    while (tau < maxLag && nsdf[tau] > 0) tau++;
    let lobe = -1;
    for (; tau <= maxLag; tau++) {
      if (nsdf[tau] > 0) {
        if (lobe < 0 || nsdf[tau] > nsdf[lobe]) lobe = tau;
      } else if (lobe >= 0) {
        peaks.push(lobe);
        lobe = -1;
      }
    }
    if (lobe >= 0) peaks.push(lobe);
    const usable = peaks.filter(p => p >= minLag && p < maxLag);
    if (!usable.length) return { freq: 0, clarity: 0, rms };
    // ...and the first one nearly as good as the best is the period (avoids octave errors).
    const top = Math.max(...usable.map(p => nsdf[p]));
    const p = usable.find(q => nsdf[q] >= 0.9 * top);
    const a = nsdf[p - 1], b = nsdf[p], c = nsdf[p + 1];
    const den = a - 2 * b + c;
    const shift = den ? (a - c) / (2 * den) : 0;
    const freq = fs / (p + shift);
    return { freq, clarity: b, rms };
  }

  const toMidi = f => 69 + 12 * Math.log2(f / (TP.S.a4 || 440));   // relative to your chosen A

  // ---------- note starts ----------
  // A re-tongued note on the same pitch doesn't change the pitch reading, so note
  // starts also come from the loudness: a clear dip, then a quick rise.
  const ENV_STEP = 0.005;   // s between loudness points
  const DIP = 0.55;         // the dip must fall to this fraction of the level before it...
  const RISE = 1.8;         // ...and the level must climb this many times above the dip
  const MIN_GAP = 0.1;      // s: no two note starts closer than this (low attacks can bump twice)

  // Turns blocks of samples into readings: { t, midi, cents, freq, rms, held, since, onset }.
  // `t` is when the middle of the block was played; `since` when this note started.
  function makeTracker(sr) {
    const env = [];           // { t, v } loudness, last ~0.3 s
    let streak = { midi: null, since: 0 }, lastOnset = -Infinity, freq = 0, quietFrom = null;

    // Loudness along the new samples (the last `fresh` of buf, whose final sample
    // played at tEnd), each over a whole number of pitch periods so it doesn't ripple.
    function loudness(buf, fresh, tEnd) {
      const period = freq ? sr / freq : sr * 0.02;
      const win = Math.round(period * Math.max(1, Math.ceil(sr * 0.01 / period)));
      const step = Math.round(sr * ENV_STEP);
      let onset = null;
      for (let end = Math.max(win, buf.length - fresh); end <= buf.length; end += step) {
        let s = 0;
        for (let i = end - win; i < end; i++) s += buf[i] * buf[i];
        const pt = { t: tEnd - (buf.length - end + win / 2) / sr, v: Math.sqrt(s / win) };
        if (env.length && pt.t <= env[env.length - 1].t) continue;
        env.push(pt);
        // From silence: the note starts where the sound climbs well clear of the quiet.
        const g = gate();
        if (pt.v < g * 1.5) { if (quietFrom === null) quietFrom = pt.t; continue; }
        if (pt.v >= g * 3 && quietFrom !== null) {
          if (pt.t - quietFrom >= 0.03 && pt.t - lastOnset >= MIN_GAP) lastOnset = onset = pt.t;
          quietFrom = null;
          continue;
        }
        // The lowest point in the last 40 ms, and the loudest in the 120 ms before it.
        let lo = -1;
        for (let j = env.length - 2; j >= 0 && pt.t - env[j].t <= 0.04; j--) if (lo < 0 || env[j].v < env[lo].v) lo = j;
        if (lo < 0) continue;
        let before = 0;
        for (let j = lo - 1; j >= 0 && env[lo].t - env[j].t <= 0.12; j--) before = Math.max(before, env[j].v);
        if (pt.v >= RISE * env[lo].v && env[lo].v <= DIP * before && pt.v >= g) {
          // The note starts where the sound comes back up: halfway from the dip to now.
          let k = lo + 1;
          while (k < env.length - 1 && env[k].v < (env[lo].v + pt.v) / 2) k++;
          if (env[k].t - lastOnset >= MIN_GAP) lastOnset = onset = env[k].t;
        }
      }
      while (env.length && env[0].t < tEnd - 0.3) env.shift();
      return onset;
    }

    // buf: the latest FFT samples; fresh: how many are new since the last call;
    // t: when the middle of buf was played; live: skip what the app itself is playing.
    return (buf, fresh, t, live) => {
      const r = detect(buf, sr);
      const onset = loudness(buf, Math.min(fresh, buf.length), t + buf.length / sr / 2);
      let reading = { t, midi: null, cents: 0, freq: 0, rms: r.rms };
      if (r.freq && r.clarity >= (loose ? 0.6 : MIN_CLARITY) && (!live || t > TP.outputUntil + 0.08)) {
        const m = toMidi(r.freq);
        let concert = Math.round(m);
        // Near the edge between two notes, stay on the one already sounding
        // (a note played 50¢ sharp shouldn't flicker between two names).
        const was = streak.midi === null ? null : streak.midi - TP.inst().transpose;
        if (was !== null && concert !== was && Math.abs(m - was) < 0.65) concert = was;
        // Everything else works in written pitch (a B♭ trumpet's C sounds B♭).
        const midi = concert + TP.inst().transpose;
        reading = { t, midi, concert, cents: Math.round((m - concert) * 100), freq: r.freq, rms: r.rms };
      }
      freq = reading.freq;
      // A note that starts from silence starts at its attack (if one was just heard).
      if (reading.midi !== streak.midi) streak = { midi: reading.midi, since: reading.midi !== null && streak.midi === null && t - lastOnset < 0.15 ? Math.min(t, lastOnset) : t };
      else if (onset !== null && reading.midi !== null && onset > streak.since + MIN_GAP) streak = { midi: reading.midi, since: onset };
      reading.since = streak.since;
      reading.held = Math.max(0, t - streak.since);   // how long this note has been sounding
      if (onset !== null) reading.onset = onset;
      return reading;
    };
  }

  // A whole recording at once, read the same way as the live mic (for testing).
  function analyse(samples, sr) {
    const step = makeTracker(sr), hop = Math.round(sr * EVERY_MS / 1000), out = [];
    for (let end = FFT; end <= samples.length; end += hop) {
      out.push(step(samples.subarray(end - FFT, end), end === FFT ? FFT : hop, (end - FFT / 2) / sr, false));
    }
    return out;
  }

  // ---------- live input ----------
  let analyser = null, source = null, stream = null, timer = 0;
  const log = [];          // readings, oldest first
  const listeners = [];
  let current = null;      // latest reading

  function attach(node) {
    detach();
    const ctx = TP.audio();
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT;
    node.connect(analyser);
    source = node;
    const buf = new Float32Array(FFT);
    const half = FFT / ctx.sampleRate / 2;
    const step = makeTracker(ctx.sampleRate);
    let last = 0, lag = null;
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const now = ctx.currentTime, fresh = last ? Math.round((now - last) * ctx.sampleRate) : FFT;
      last = now;
      // When the middle of this window was played, on the same clock as clicks. The
      // audio clock moves with the samples themselves, so it's steadier than asking
      // heardTime() each tick; the gap between the two only changes when the output does.
      // (Just after audio starts, the output clock can report nonsense: skip those.)
      const d = now - TP.heardTime();
      if (d >= 0 && d < 0.5) lag = lag === null ? d : lag * 0.98 + d * 0.02;
      else if (lag === null) lag = ctx.outputLatency || ctx.baseLatency || 0;
      // Settings → Mic delay: how late the mic hears you, measured by calibrating.
      const reading = step(buf, fresh, now - lag - half - 0.02 - (TP.S.micLatencyMs || 0) / 1000, true);
      current = reading;
      log.push(reading);
      if (log.length > 600) log.splice(0, 300);
      listeners.forEach(fn => fn(reading));
      // Sound from the horn: counts as time playing (Progress, rest reminders).
      if (reading.midi !== null && TP.played) TP.played(EVERY_MS / 1000);
    }, EVERY_MS);
  }

  function detach() {
    clearInterval(timer);
    timer = 0;
    if (source) { try { source.disconnect(); } catch (e) { /* gone */ } }
    source = null;
    analyser = null;
    current = null;
  }

  async function start() {
    if (stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('This browser can’t use the microphone here.');
    }
    // Raw signal: echo cancelling and noise suppression mangle instrument tone.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    attach(TP.audio().createMediaStreamSource(stream));
  }

  function stop() {
    detach();
    if (stream) stream.getTracks().forEach(tr => tr.stop());
    stream = null;
  }

  // Did the target note sound (for at least `minFrames` readings) between t0 and t1?
  // Returns the time it first sounded, or null. `fresh`: the note must also have
  // started after t0 (so a held note on the same pitch doesn't count for the next one).
  function heard(midi, t0, t1, minFrames = 2, fresh = false) {
    let run = 0, first = null;
    for (const r of log) {
      if (r.t < t0 || r.t > t1) continue;
      if (matches(r.midi, midi) && (!fresh || r.since >= t0)) {
        if (!run) first = r.t;
        if (++run >= minFrames) return first;
      } else {
        run = 0;
      }
    }
    return null;
  }
  // Where notes started, from a run of readings: each loudness onset that a pitch
  // follows within 150 ms (so a click or knock the mic overhears isn't a note), and
  // each slur straight from one pitch to another. `ok(midi)`: which pitches count.
  function noteStarts(readings, ok = () => true) {
    const out = [];
    const add = t => { if (!out.some(s => Math.abs(s - t) < 0.05)) out.push(t); };
    readings.forEach((x, i) => {
      if (x.onset !== undefined) {
        if (readings.some(y => y.t >= x.onset && y.t <= x.onset + 0.15 && y.midi !== null && ok(y.midi))) add(x.onset);
      } else if (i && x.midi !== null && ok(x.midi) && x.since === x.t && readings[i - 1].midi !== null && readings[i - 1].midi !== x.midi) {
        add(x.t);
      }
    });
    return out.sort((a, b) => a - b);
  }
  // How in tune this note was between t0 and t1: the median of its readings in cents, or null.
  function centsOn(midi, t0, t1) {
    const c = log.filter(r => r.t >= t0 && r.t <= t1 && r.midi === midi).map(r => r.cents).sort((a, b) => a - b);
    return c.length >= 2 ? c[c.length >> 1] : null;
  }
  // ---------- attacks ----------
  // How a note began, from the readings around its start t (s): how long until the pitch
  // sat within 25¢ of the note (settle, s; null if it never did), and where the first
  // pitch was (from, cents from the note): well below = scooped up into it, more than
  // a semitone away = started on another note (a split). `octaves`: any octave counts.
  // `prev`: the note before, if any — slurred into, its last moments aren't this note's start.
  function attackOf(readings, midi, t, dur, octaves = false, prev = null) {
    const off = x => { let d = x.midi - midi; if (octaves) d = ((d % 12) + 18) % 12 - 6; return d * 100 + x.cents; };
    const tail = x => prev !== null && prev !== midi && Math.abs(x.midi + x.cents / 100 - prev) <= 0.5;
    const rs = readings.filter(x => x.t >= t - 0.06 && x.t <= t + Math.max(0.2, Math.min(dur, 0.6)) && x.midi !== null && !tail(x)).map(x => ({ t: x.t, c: off(x) }));
    if (rs.length < 2) return null;
    const k = rs.findIndex((x, i) => Math.abs(x.c) <= 25 && rs[i + 1] && Math.abs(rs[i + 1].c) <= 25);
    return { settle: k < 0 ? null : Math.max(0, rs[k].t - t), from: Math.round(rs[0].c) };
  }
  // Many attacks summed up: the median time to settle, and how many scooped, came down
  // from sharp, split or never settled.
  function attackSummary(list) {
    const a = list.filter(Boolean);
    if (!a.length) return null;
    const settled = a.filter(x => x.settle !== null).map(x => x.settle).sort((p, q) => p - q);
    return {
      n: a.length,
      settleMs: settled.length ? Math.round(settled[settled.length >> 1] * 1000) : null,
      scoops: a.filter(x => x.from <= -30 && x.from >= -110).length,
      sharp: a.filter(x => x.from >= 30 && x.from <= 110).length,
      splits: a.filter(x => Math.abs(x.from) > 110).length,
      unsettled: a.length - settled.length,
    };
  }
  function attackText(s) {
    if (!s) return '';
    const bits = [s.settleMs === null ? 'the pitch never settled'
      : `settled on the pitch in ~${s.settleMs} ms` + (s.settleMs <= 80 ? ' (clean)' : s.settleMs > 150 ? ' (slow — aim to start right on the pitch)' : '')];
    const of = k => (s.n > 1 ? `${k} of ${s.n}` : '');
    if (s.scoops) bits.push(s.n > 1 ? `${of(s.scoops)} scooped up from flat` : 'scooped up from flat');
    if (s.sharp) bits.push(s.n > 1 ? `${of(s.sharp)} came down from sharp` : 'came down from sharp');
    if (s.splits) bits.push(s.n > 1 ? `${of(s.splits)} started on another note (split)` : 'started on another note (split)');
    return bits.join(', ');
  }

  // Same note — or with "any octave" on, the same note name in another octave.
  const matches = (got, want) => got !== null && (got === want || (TP.S.micAnyOctave && (got - want) % 12 === 0));

  return {
    detect, analyse, start, stop, attach, heard, matches, centsOn, gate, noteStarts, attackOf, attackSummary, attackText,
    setLoose: on => { loose = !!on; },
    get source() { return source; },
    on: fn => listeners.push(fn),
    get active() { return !!timer; },
    get current() { return current; },
  };
})();

// Why the microphone didn't start, in plain words.
TP.micError = function micError(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
    return 'Microphone access was blocked. Allow it in the browser’s address bar (or site settings) and try again.';
  }
  if (e && e.name === 'NotFoundError') return 'No microphone found.';
  return (e && e.message) || 'Couldn’t start the microphone.';
};
