// Today: a short daily routine (warm-up, scale of the day, note drill, rhythm,
// a piece), this week's practice time, and overall progress on this instrument.
(() => {
  'use strict';
  const { S, store, $ } = TP;

  // A number that changes once a day, to rotate the suggestions.
  const dayNo = () => Math.floor(new Date(TP.dayKey() + 'T12:00:00').getTime() / 86400000);
  const MAJORS = ['Bb', 'F', 'Eb', 'C', 'Ab', 'G', 'Db', 'D', 'A', 'E'];
  const MINORS = ['G', 'D', 'C', 'F', 'A', 'E', 'B'];
  const WARMUPS = ['long-tones', 'lip-slurs-1', 'lip-slurs-2'];

  function scaleOfDay() {
    const d = dayNo();
    // Mostly majors; every third day a harmonic minor.
    if (d % 3 === 2) return { key: MINORS[Math.floor(d / 3) % MINORS.length], type: 'harmonic' };
    return { key: MAJORS[d % MAJORS.length], type: 'major' };
  }
  function pieceOfDay() {
    const pieces = LIBRARY.filter(p => p.cat !== 'Warm-ups' && p.cat !== 'Method books').sort((a, b) => a.level - b.level);
    const unfinished = pieces.find(p => !store.pieces[p.id] || store.pieces[p.id].best < 80);
    return unfinished || pieces[dayNo() % pieces.length];
  }
  // Every other day, the last step is a method-book study instead: the next one in the book
  // you haven't got to 80% yet, alternating Bordogni (singing line) and Kopprasch (technique).
  function studyOfDay() {
    const book = Math.floor(dayNo() / 2) % 2 ? 'Kopprasch Op. 6' : 'Bordogni vocalises';
    const list = LIBRARY.filter(p => p.book === book);
    if (!list.length) return null;
    return list.find(p => !store.pieces[p.id] || store.pieces[p.id].best < 80) || list[dayNo() % list.length];
  }
  const typeName = { major: 'major', harmonic: 'harmonic minor' };

  function steps() {
    const sc = scaleOfDay(), study = dayNo() % 2 ? studyOfDay() : null, pc = study || pieceOfDay();
    const warm = LIBRARY.find(p => p.id === WARMUPS[dayNo() % WARMUPS.length]);
    const scaleId = `${sc.key} ${sc.type} 1`;
    const rec = store.pieces[pc.id];
    const answered = TP.doneToday('notes');
    return [
      { id: 'warmup', icon: '🌬️', title: `Warm up: ${warm.title}`, sub: 'Long, steady notes and slurs to get the air going.',
        done: TP.doneToday('warmup') > 0, go: () => { S.pieceId = warm.id; TP.show('pieces'); } },
      { id: 'scale', icon: '🎼', title: `Scale of the day: ${TP.tonicName(sc.key)} ${typeName[sc.type]}`, sub: 'One octave, up and down, with the metronome.',
        done: TP.doneToday('scale:' + scaleId) > 0,
        go: () => { Object.assign(S, { scaleKey: sc.key, scaleType: sc.type, scaleOctaves: 1, scaleStart: null, scaleMode: 'flow' }); TP.show('scales'); } },
      { id: 'notes', icon: '🎯', title: 'Note drill: 20 notes', sub: answered ? `${Math.min(answered, 20)} of 20 done — your weakest notes come up most.` : 'Your weakest notes come up most.',
        done: answered >= 20, go: () => TP.show('fingerings') },
      { id: 'rhythm', icon: '🥁', title: `Rhythm reading (level ${S.rhythmLevel})`, sub: 'Tap one rhythm along with the click.',
        done: TP.doneToday('rhythm') > 0, go: () => TP.show('rhythm') },
      { id: 'piece', icon: study ? '📖' : '🎵', title: `${study ? 'Study' : 'Piece'}: ${pc.title}`, sub: rec ? `Your best is ${rec.best}% — play it through once.` : 'Play it through once (try “Wait for me” first).',
        done: TP.doneToday('piece:' + pc.id) > 0, go: () => { S.pieceId = pc.id; TP.show('pieces'); } },
    ];
  }

  function render() {
    const list = steps();
    const done = list.filter(s => s.done).length;
    const p = TP.progress();
    const date = new Date();
    $('tdDate').textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('tdSub').textContent = done === list.length
      ? `All done today — great work! ${p.minutes} min practised.`
      : `${done} of ${list.length} done · ${p.minutes} min today · ${p.streak ? `🔥 ${p.streak}-day streak` : 'start a streak today'}`;
    $('tdRing').style.setProperty('--p', done / list.length);
    $('tdRing').textContent = `${done}/${list.length}`;

    const ol = $('tdSteps');
    ol.textContent = '';
    list.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'step' + (s.done ? ' done' : '');
      li.innerHTML = `<span class="step-icon">${s.done ? '✓' : s.icon}</span>
        <span class="step-text"><b></b><span></span></span>
        <button class="small-btn">${s.done ? 'Again' : i === list.findIndex(x => !x.done) ? 'Start' : 'Go'}</button>`;
      li.querySelector('b').textContent = s.title;
      li.querySelector('.step-text span').textContent = s.sub;
      const btn = li.querySelector('button');
      if (!s.done && i === list.findIndex(x => !x.done)) btn.classList.add('primary');
      btn.addEventListener('click', s.go);
      btn.addEventListener('mousedown', e => e.preventDefault());
      ol.appendChild(li);
    });

    // This week: minutes per day.
    const week = $('tdWeek');
    week.textContent = '';
    let total = 0, days = 0;
    const mins = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date();
      d.setDate(d.getDate() - k);
      const rec = store.days[TP.dayKey(d)];
      const m = rec ? Math.round(rec.sec / 60) : 0;
      mins.push({ d, m, any: rec && rec.n });
      total += m;
      if (rec && rec.n) days++;
    }
    const max = Math.max(10, ...mins.map(x => x.m));
    for (const x of mins) {
      const col = document.createElement('div');
      col.className = 'day' + (x.d.toDateString() === new Date().toDateString() ? ' today' : '');
      col.innerHTML = `<span class="bar-v"><span style="height:${Math.round((x.m / max) * 100)}%"></span></span>
        <span class="m">${x.m || (x.any ? '<1' : '')}</span><span class="dl">${x.d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>`;
      col.title = `${x.d.toLocaleDateString()}: ${x.m} min`;
      week.appendChild(col);
    }
    $('tdWeekSum').textContent = `${total} min over ${days} day${days === 1 ? '' : 's'} this week.`;

    // Progress on this instrument.
    const inRange = TP.ALL_MIDI.filter(m => m >= S.low && m <= S.high);
    const mastered = inRange.filter(m => store.notes[m] && store.notes[m].seen >= 3 && store.notes[m].ema >= 0.85).length;
    const scalesPlayed = Object.keys(store.scales).length;
    const scalesClean = Object.values(store.scales).filter(r => r.flowBest || r.best).length;
    // Pieces and method-book studies are counted separately (113 studies would swamp the rest).
    const count = list => ({
      n: list.length,
      three: list.filter(p => store.pieces[p.id] && store.pieces[p.id].best >= 95).length,
      tried: list.filter(p => store.pieces[p.id]).length,
    });
    const pc = count(LIBRARY.filter(p => p.cat !== 'Method books'));
    const mb = count(LIBRARY.filter(p => p.cat === 'Method books'));
    $('tdInst').textContent = TP.inst().short;
    const stats = [
      ['Notes mastered', `${mastered} / ${inRange.length}`, mastered / Math.max(1, inRange.length)],
      ['Scales played clean', `${scalesClean}`, Math.min(1, scalesClean / 24), `${scalesPlayed} tried`],
      ['Pieces at ★★★', `${pc.three} / ${pc.n}`, pc.three / Math.max(1, pc.n), `${pc.tried} tried`],
      ['Method-book studies at ★★★', `${mb.three} / ${mb.n}`, mb.three / Math.max(1, mb.n), `${mb.tried} tried · Kopprasch, Bordogni`],
    ];
    $('tdStats').innerHTML = stats.map(([name, val, frac, extra]) => `
      <div class="stat"><span class="stat-name">${name}</span><span class="stat-val">${val}</span>
        <span class="bar-h"><span style="width:${Math.round(frac * 100)}%"></span></span>${extra ? `<span class="stat-extra">${extra}</span>` : ''}</div>`).join('');
  }

  TP.onProgress(() => { if (!$('panel-today').hidden) render(); });

  TP.modes.today = {
    panel: 'panel-today',
    valves: false,
    enter: render,
    leave() {},
    settingsChanged: render,
    preloadNotes: () => [],
    key(k) {
      if (k === ' ' || k === 'enter') {
        const next = steps().find(s => !s.done);
        if (next) next.go();
        return true;
      }
      return false;
    },
  };
})();
