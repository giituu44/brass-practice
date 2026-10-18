// Listening to a real tuba: pitch detection on the microphone signal.
// McLeod pitch method on a 4× downsampled signal — the tuba lives between
// ~30 and ~400 Hz, so a ~12 kHz rate is plenty and keeps it cheap.
TP.mic = (() => {
  'use strict';
  const FFT = 4096, DECIM = 4, EVERY_MS = 40;
  const MIN_HZ = 27, MAX_HZ = 500, MIN_RMS = 0.003, MIN_CLARITY = 0.8;

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
    if (rms < MIN_RMS) return { freq: 0, clarity: 0, rms };

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

  // ---------- live input ----------
  let analyser = null, source = null, stream = null, timer = 0;
  const log = [];          // { t (heard-time), midi (rounded) or null, cents, freq }
  const listeners = [];
  let current = null;      // latest reading
  let streak = { midi: null, since: 0, frames: 0 };

  function attach(node) {
    detach();
    const ctx = TP.audio();
    analyser = ctx.createAnalyser();
    analyser.fftSize = FFT;
    node.connect(analyser);
    source = node;
    const buf = new Float32Array(FFT);
    const half = FFT / ctx.sampleRate / 2;
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const r = detect(buf, ctx.sampleRate);
      // When the middle of this window was played, on the same clock as clicks.
      const t = TP.heardTime() - half - 0.02;
      let reading = { t, midi: null, cents: 0, freq: 0, rms: r.rms };
      if (r.freq && r.clarity >= MIN_CLARITY && t > TP.outputUntil + 0.08) {
        const m = toMidi(r.freq);
        const concert = Math.round(m);
        // Everything else works in written pitch (a B♭ trumpet's C sounds B♭).
        const midi = concert + TP.inst().transpose;
        reading = { t, midi, concert, cents: Math.round((m - concert) * 100), freq: r.freq, rms: r.rms };
      }
      if (reading.midi !== streak.midi) streak = { midi: reading.midi, since: t, frames: 0 };
      streak.frames++;
      reading.held = t - streak.since;   // how long this note has been sounding
      current = reading;
      log.push(reading);
      if (log.length > 600) log.splice(0, 300);
      listeners.forEach(fn => fn(reading));
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
  // Returns the time it first sounded, or null.
  function heard(midi, t0, t1, minFrames = 2) {
    let run = 0, first = null;
    for (const r of log) {
      if (r.t < t0 || r.t > t1) continue;
      if (matches(r.midi, midi)) {
        if (!run) first = r.t;
        if (++run >= minFrames) return first;
      } else {
        run = 0;
      }
    }
    return null;
  }
  // How in tune this note was between t0 and t1: the median of its readings in cents, or null.
  function centsOn(midi, t0, t1) {
    const c = log.filter(r => r.t >= t0 && r.t <= t1 && r.midi === midi).map(r => r.cents).sort((a, b) => a - b);
    return c.length >= 2 ? c[c.length >> 1] : null;
  }
  // Same note — or with "any octave" on, the same note name in another octave.
  const matches = (got, want) => got !== null && (got === want || (TP.S.micAnyOctave && (got - want) % 12 === 0));

  return {
    detect, start, stop, attach, heard, matches, centsOn,
    get source() { return source; },
    on: fn => listeners.push(fn),
    get active() { return !!timer; },
    get current() { return current; },
  };
})();
