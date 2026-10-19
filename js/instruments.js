// Brass instruments. Valve and slide charts are generated from the harmonic
// series (with conventional preferences), except BB♭ tuba, which uses the
// hand-made chart in fingerings.js. Pitches are *written* pitch; `transpose`
// is written minus concert (B♭ trumpet reads a tone above how it sounds).
const INSTRUMENTS = (() => {
  'use strict';
  const BBB_CHART = JSON.parse(JSON.stringify(FINGERINGS));

  // Semitones each valve combination lowers by (4th valve = a fourth).
  const LOWER = { '': 0, '2': 1, '1': 2, '12': 3, '3': 3, '23': 4, '13': 5, '4': 5, '123': 6, '24': 6, '14': 7, '124': 8, '234': 9, '134': 10, '1234': 11 };
  // Most usual first.
  const PREF = {
    3: ['', '2', '1', '12', '23', '13', '3', '123'],
    4: ['', '2', '1', '12', '23', '4', '13', '3', '24', '123', '14', '124', '234', '134', '1234'],
  };
  // Harmonics used for playing (the 7th and 11th are too out of tune to be standard).
  const PARTIALS = [2, 3, 4, 5, 6, 8, 9, 10, 12, 16];
  const above = n => Math.round(12 * Math.log2(n));

  function valveChart(fundamental, valves, lo, hi) {
    const pref = PREF[valves], chart = {};
    for (let m = lo; m <= hi; m++) {
      const c = [];
      PARTIALS.forEach((n, pi) => {
        const top = fundamental + above(n);
        for (const f of pref) if (top - LOWER[f] === m) c.push({ f, score: pref.indexOf(f) + pi * 0.01 });
      });
      c.sort((a, b) => a.score - b.score);
      const list = [...new Set(c.map(x => x.f))].slice(0, 3);
      if (list.length) chart[m] = list;
    }
    return chart;
  }

  // Trombone: position p (1–7) lowers by p−1 semitones. Prefer the lowest partial
  // that works in a short position, e.g. F3 = 1st (not 6th).
  function slideChart(fundamental, lo, hi) {
    const chart = {};
    for (let m = lo; m <= hi; m++) {
      const c = [];
      for (const n of [2, 3, 4, 5, 6, 8, 9, 10]) {
        const p = fundamental + above(n) - m + 1;
        if (p >= 1 && p <= 7) c.push({ f: String(p), score: p + (n >= 8 ? 0.5 : 0) });
      }
      c.sort((a, b) => a.score - b.score);
      const list = [...new Set(c.map(x => x.f))].slice(0, 2);
      if (list.length) chart[m] = list;
    }
    return chart;
  }

  const TUBA_SOUNDS = ['iowa', 'phil', 'musyng', 'fluid'];
  const list = [
    { id: 'tuba-bb4', name: 'B♭ tuba (BB♭), 4 valves', short: 'BB♭ tuba', kind: 'valve', valves: 4, clef: 'bass', transpose: 0,
      fund: 22, chart: () => BBB_CHART, range: [29, 53], center: 41, sounds: TUBA_SOUNDS },
    { id: 'tuba-bb3', name: 'B♭ tuba (BB♭), 3 valves', short: 'BB♭ tuba', kind: 'valve', valves: 3, clef: 'bass', transpose: 0,
      fund: 22, chart: () => valveChart(22, 3, 28, 65), range: [29, 53], center: 41, sounds: TUBA_SOUNDS },
    { id: 'tuba-cc4', name: 'C tuba (CC), 4 valves', short: 'CC tuba', kind: 'valve', valves: 4, clef: 'bass', transpose: 0,
      fund: 24, chart: () => valveChart(24, 4, 26, 64), range: [31, 55], center: 43, sounds: TUBA_SOUNDS },
    { id: 'tuba-eb4', name: 'E♭ tuba, 4 valves', short: 'E♭ tuba', kind: 'valve', valves: 4, clef: 'bass', transpose: 0,
      fund: 27, chart: () => valveChart(27, 4, 29, 67), range: [34, 58], center: 46, sounds: TUBA_SOUNDS },
    { id: 'tuba-f4', name: 'F tuba, 4 valves', short: 'F tuba', kind: 'valve', valves: 4, clef: 'bass', transpose: 0,
      fund: 29, chart: () => valveChart(29, 4, 31, 69), range: [36, 60], center: 48, sounds: TUBA_SOUNDS },
    { id: 'euph4', name: 'Euphonium, 4 valves (bass clef)', short: 'Euphonium', kind: 'valve', valves: 4, clef: 'bass', transpose: 0,
      fund: 34, chart: () => valveChart(34, 4, 35, 72), range: [46, 65], center: 55, sounds: ['trombone', 'phil'] },
    { id: 'trombone', name: 'Tenor trombone', short: 'Trombone', kind: 'slide', clef: 'bass', transpose: 0,
      fund: 34, chart: () => slideChart(34, 40, 72), range: [46, 65], center: 55, sounds: ['trombone'] },
    { id: 'trumpet', name: 'B♭ trumpet (written pitch, treble clef)', short: 'Trumpet', kind: 'valve', valves: 3, clef: 'treble', transpose: 2,
      fund: 48, chart: () => valveChart(48, 3, 54, 84), range: [60, 79], center: 69, sounds: ['trumpet'] },
  ];
  const byId = {};
  for (const i of list) byId[i.id] = i;
  return { list, byId, valveChart, slideChart, LOWER };
})();
