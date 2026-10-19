// A metronome you can open from any tab (for practising from paper music):
// tempo, beats per bar, subdivisions, tap tempo. Keeps going while you switch tabs.
(() => {
  'use strict';
  const { S, $ } = TP;
  S.metro = Object.assign({ bpm: 80, beats: 4, sub: 1, group: '', gap: '', ramp: '' }, S.metro || {});
  // Ways to stress a bar of 5–9 beats: '3+2' accents beats 1 and 4.
  const GROUPS = { 5: ['3+2', '2+3'], 6: ['3+3', '2+2+2'], 7: ['2+2+3', '3+2+2', '2+3+2'], 8: ['3+3+2', '4+4'], 9: ['3+3+3', '2+2+2+3'] };
  // Beat numbers (0-based) that start a group, besides the first.
  function groupStarts() {
    const g = S.metro.group;
    if (!g || !(GROUPS[S.metro.beats] || []).includes(g)) return new Set();
    const out = new Set();
    let at = 0;
    for (const n of g.split('+').map(Number)) { if (at) out.add(at); at += n; }
    return out;
  }

  let timer = 0, next = 0, tick = 0;
  const LOOKAHEAD = 0.12;

  function blip(at, level) {
    const ctx = TP.audio();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    // 2 = bar, 1.5 = start of a group, 1 = beat, 0 = subdivision.
    o.frequency.value = level === 2 ? 1760 : level === 1.5 ? 1480 : level === 1 ? 1175 : 880;
    const peak = level === 2 ? 0.6 : level === 1.5 ? 0.5 : level === 1 ? 0.42 : 0.16;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + (level ? 0.05 : 0.03));
    o.connect(g);
    g.connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.06);
  }
  function schedule() {
    const ctx = TP.audio(), m = S.metro, starts = groupStarts();
    const [play, mute] = (m.gap || '0-0').split('-').map(Number);
    const [up, every] = (m.ramp || '0-0').split('-').map(Number);
    while (next < ctx.currentTime + LOOKAHEAD) {
      const perBar = m.beats * m.sub;
      const k = tick % perBar, bar = Math.floor(tick / perBar);
      // Speed up at the start of every few bars.
      if (k === 0 && bar > 0 && up && bar % every === 0) { m.bpm = Math.min(260, m.bpm + up); setTimeout(render, Math.max(0, (next - ctx.currentTime) * 1000)); }
      // Gaps: some bars are silent (the lights keep going, dimmed).
      const silent = play && mute && bar % (play + mute) >= play;
      const beat = Math.floor(k / m.sub);
      const level = k === 0 && m.beats > 1 ? 2 : k % m.sub === 0 ? (starts.has(beat) ? 1.5 : 1) : 0;
      if (!silent) blip(next, level);
      if (k % m.sub === 0) {
        const at = next;
        setTimeout(() => light(beat, silent), Math.max(0, (at - TP.heardTime()) * 1000));
      }
      next += 60 / m.bpm / m.sub;
      tick++;
    }
  }
  function light(beat, silent) {
    if (!timer) return;
    const dots = $('metroDots').children;
    for (let i = 0; i < dots.length; i++) { dots[i].classList.toggle('on', i === beat && !silent); dots[i].classList.toggle('ghost', i === beat && silent); }
    $('metro').classList.add('pulse');
    setTimeout(() => $('metro').classList.remove('pulse'), 90);
  }
  async function start() {
    const ctx = TP.audio();
    await ctx.resume();
    next = ctx.currentTime + 0.08;
    tick = 0;
    timer = setInterval(schedule, 25);
    schedule();
    render();
  }
  function stop() {
    clearInterval(timer);
    timer = 0;
    render();
  }
  function setBpm(v) {
    S.metro.bpm = Math.max(30, Math.min(260, Math.round(v)));
    TP.save();
    render();
  }
  function render() {
    const m = S.metro;
    $('metroBpm').textContent = m.bpm;
    $('metroRange').value = m.bpm;
    $('metroBeats').value = m.beats;
    $('metroSub').value = m.sub;
    const gs = GROUPS[m.beats] || [];
    $('metroGroup').textContent = '';
    $('metroGroup').add(new Option(gs.length ? 'first beat only' : 'first beat', ''));
    for (const g of gs) $('metroGroup').add(new Option(g, g));
    $('metroGroup').value = gs.includes(m.group) ? m.group : '';
    $('metroGroup').disabled = !gs.length;
    $('metroGap').value = m.gap || '';
    $('metroRamp').value = m.ramp || '';
    $('metroGo').textContent = timer ? '■ Stop' : '▶ Start';
    $('metroGo').classList.toggle('primary', !timer);
    $('metro').classList.toggle('running', !!timer);
    $('metroMini').textContent = timer ? m.bpm : '';
    const dots = $('metroDots');
    if (dots.children.length !== m.beats) dots.innerHTML = '<span class="dot"></span>'.repeat(m.beats);
    if (!timer) [...dots.children].forEach(d => d.classList.remove('on'));
  }

  // Tap tempo: the average of the last few taps.
  let taps = [];
  $('metroTap').addEventListener('click', () => {
    const now = performance.now();
    taps = taps.filter(t => now - t < 3000);
    taps.push(now);
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  });
  $('metroGo').addEventListener('click', () => (timer ? stop() : start()));
  $('metroSlower').addEventListener('click', () => setBpm(S.metro.bpm - 1));
  $('metroFaster').addEventListener('click', () => setBpm(S.metro.bpm + 1));
  $('metroRange').addEventListener('input', e => setBpm(Number(e.target.value)));
  $('metroBeats').addEventListener('change', e => { S.metro.beats = Number(e.target.value); TP.save(); render(); });
  $('metroSub').addEventListener('change', e => { S.metro.sub = Number(e.target.value); TP.save(); render(); });
  for (const [id, key] of [['metroGroup', 'group'], ['metroGap', 'gap'], ['metroRamp', 'ramp']]) {
    $(id).addEventListener('change', e => { S.metro[key] = e.target.value; TP.save(); render(); });
  }

  TP.metronome = { start, stop, get running() { return !!timer; } };
  render();
})();
