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
  // The next few pieces you haven't got to 80% yet, easiest first, taking turns by
  // day (so one hard piece doesn't take over every day).
  function pieceOfDay() {
    const pieces = LIBRARY.filter(p => p.cat !== 'Warm-ups' && p.cat !== 'Method books').sort((a, b) => a.level - b.level);
    const unfinished = pieces.filter(p => !store.pieces[p.id] || store.pieces[p.id].best < 80).slice(0, 3);
    return unfinished.length ? unfinished[dayNo() % unfinished.length] : pieces[dayNo() % pieces.length];
  }
  // Every other day, the last step is a method-book study instead: the next one in the book
  // you haven't got to 80% yet, alternating Bordogni (singing line) and Kopprasch (technique).
  function studyOfDay() {
    const book = Math.floor(dayNo() / 2) % 2 ? 'Kopprasch Op. 6' : 'Bordogni vocalises';
    const list = LIBRARY.filter(p => p.book === book);
    if (!list.length) return null;
    return list.find(p => !store.pieces[p.id] || store.pieces[p.id].best < 80) || list[dayNo() % list.length];
  }
  // Sight-reading at the first level you haven't yet read at 80%.
  function sightLevel() {
    let l = 1;
    while (l < 5 && store.pieces['sight-' + l] && store.pieces['sight-' + l].best >= 80) l++;
    return l;
  }
  const typeName = { major: 'major', harmonic: 'harmonic minor' };
  // Relative minor of each major scale of the day, and relative major of each minor.
  const RELATIVE = {
    major: { Bb: 'G', F: 'D', Eb: 'C', C: 'A', Ab: 'F', G: 'E', Db: 'Bb', D: 'B', A: 'F#', E: 'C#' },
    harmonic: { G: 'Bb', D: 'F', C: 'Eb', F: 'Ab', A: 'C', E: 'G', B: 'D' },
  };
  const MINS = [10, 20, 30, 45];
  // Every kind of step, in the order a session runs; the time you pick (or your own
  // choice, "My routine") decides which ones are in today's list.
  const ORDER = ['breathing', 'buzz', 'warmup', 'slurs', 'scale', 'scale2', 'notes', 'rhythm', 'tonguing', 'echo', 'sight', 'study', 'piece', 'trouble', 'review'];
  const NAMES = {
    breathing: 'Breathing', buzz: 'Mouthpiece buzzing', warmup: 'Warm-up piece', slurs: 'Lip slurs', scale: 'Scale of the day',
    scale2: 'Its relative scale', notes: 'Note drill', rhythm: 'Rhythm reading', tonguing: 'Tonguing', echo: 'Echo (ear training)',
    sight: 'Sight-reading', study: 'Next study from your books', piece: 'A piece', trouble: 'A trouble spot from last time', review: 'Review a piece from a while ago',
  };
  const BUDGET = {
    10: ['warmup', 'scale', 'notes', 'piece'],
    20: ['warmup', 'scale', 'notes', 'rhythm', 'piece'],
    30: ['warmup', 'slurs', 'scale', 'notes', 'rhythm', 'sight', 'piece', 'trouble', 'review'],
    45: ['breathing', 'warmup', 'slurs', 'scale', 'scale2', 'notes', 'rhythm', 'echo', 'sight', 'study', 'piece', 'trouble', 'review'],
  };
  const mine = () => S.todayMins === 'mine' && Array.isArray(S.todayCustom) && S.todayCustom.length;
  // A piece or study you've played well (80%+) but not for two weeks or more: the longest ago.
  function reviewOfDay() {
    const now = Date.now(), DAY = 86400000;
    let best = null;
    for (const p of LIBRARY) {
      const rec = store.pieces[p.id], hist = store.pieceHist && store.pieceHist[p.id];
      if (!rec || rec.best < 80 || !hist || !hist.length) continue;
      const last = hist[hist.length - 1].at;
      if (now - last >= 14 * DAY && (!best || last < best.last)) best = { p, last };
    }
    return best;
  }
  const goWarmup = id => () => { TP.show('warmup'); const el = $(id); if (el) el.closest('section').scrollIntoView({ block: 'center' }); };

  function steps() {
    const custom = mine();
    const mins = MINS.includes(Number(S.todayMins)) ? Number(S.todayMins) : 20;
    const ids = custom ? ORDER.filter(id => S.todayCustom.includes(id)) : BUDGET[mins];
    const sc = scaleOfDay(), study = studyOfDay();
    // Under 45 minutes the piece and the next study take turns by day.
    const turns = !custom && mins < 45;
    const warm = LIBRARY.find(p => p.id === WARMUPS[dayNo() % WARMUPS.length]);
    const answered = TP.doneToday('notes');
    const drill = !custom && mins <= 10 ? 10 : !custom && mins >= 45 ? 30 : 20;
    const scaleStep = (id, key, type, title, sub) => ({
      id, icon: '🎼', title: `${title}: ${TP.tonicName(key)} ${typeName[type]}`, sub,
      done: TP.doneToday(`scale:${key} ${type} 1`) > 0,
      go: () => { Object.assign(S, { scaleKey: key, scaleType: type, scaleOctaves: 1, scaleStart: null, scaleMode: 'flow', scalePattern: 'straight' }); TP.show('scales'); },
    });
    const pieceStep = (pc, kind) => {
      const rec = store.pieces[pc.id];
      const label = { study: 'Study', piece: 'Piece', review: 'Review' }[kind];
      return { id: kind + ':' + pc.id, icon: { study: '📖', piece: '🎵', review: '🔁' }[kind], title: `${label}: ${pc.title}`,
        sub: kind === 'review' ? `You had it at ${rec.best}% — see if it's still there.` : rec ? `Your best is ${rec.best}% — play it through once.` : 'Play it through once (try “Wait for me” first).',
        done: TP.doneToday('piece:' + pc.id) > 0, go: () => { S.pieceId = pc.id; TP.show('pieces'); } };
    };
    const make = {
      breathing: () => ({ id: 'breathing', icon: '🫁', title: 'Breathing', sub: 'A few slow, full breaths before you play.',
        done: TP.doneToday('breathing') > 0, go: goWarmup('brStart') }),
      buzz: () => ({ id: 'buzz', icon: '💋', title: 'Mouthpiece buzzing', sub: 'Buzz a siren or a short line on the mouthpiece alone.',
        done: TP.doneToday('buzz') > 0, go: goWarmup('bzStart') }),
      warmup: () => ({ id: 'warmup', icon: '🌬️', title: `Warm up: ${warm.title}`, sub: 'Long, steady notes and slurs to get the air going (in the Warm-up tab).',
        done: TP.doneToday('warmup') > 0, go: goWarmup('wuRoutines') }),
      slurs: () => {
        const opts = TP.slurOptions ? TP.slurOptions() : [];
        if (!opts.length) return null;
        const f = opts[dayNo() % opts.length], id = `slur:${f === '' ? 'open' : f}:${Object.keys(TP.slurPatterns)[0]}`;
        return { id: 'slurs', icon: '〰️', title: `Lip slurs on ${TP.fmtFingering(f)}`, sub: 'Air and lips only: move between the partials of one fingering.',
          done: TP.doneToday('piece:' + id) > 0, go: () => { S.pieceId = id; TP.show('pieces'); } };
      },
      scale: () => scaleStep('scale', sc.key, sc.type, 'Scale of the day', 'One octave, up and down, with the metronome.'),
      scale2: () => scaleStep('scale2', RELATIVE[sc.type][sc.key], sc.type === 'major' ? 'harmonic' : 'major', 'Its relative', 'Same key signature, a different home note.'),
      notes: () => ({ id: 'notes', icon: '🎯', title: `Note drill: ${drill} notes`, sub: answered ? `${Math.min(answered, drill)} of ${drill} done — your weakest notes come up most.` : 'Your weakest notes come up most.',
        done: answered >= drill, go: () => TP.show('fingerings') }),
      rhythm: () => ({ id: 'rhythm', icon: '🥁', title: `Rhythm reading (level ${S.rhythmLevel})`, sub: S.input === 'mic' ? 'Play one rhythm along with the click.' : 'Tap one rhythm along with the click.',
        done: TP.doneToday('rhythm') > 0, go: () => TP.show('rhythm') }),
      tonguing: () => ({ id: 'tonguing', icon: '👅', title: 'Tonguing', sub: 'Two bars of repeated notes against the click: even and on time.',
        done: TP.doneToday('tonguing') > 0, go: goWarmup('tgStart') }),
      echo: () => ({ id: 'echo', icon: '👂', title: `Echo: 5 phrases (level ${S.echoLevel || 1})`, sub: `${Math.min(5, TP.doneToday('echo'))} of 5 — hear a phrase, play it back.`,
        done: TP.doneToday('echo') >= 5, go: () => TP.show('echo') }),
      sight: () => {
        const sl = sightLevel();
        return { id: 'sight', icon: '👀', title: `Sight-reading (level ${sl})`, sub: 'A new melody, once through, without stopping.',
          done: TP.doneToday('sight') > 0, go: () => { S.pieceId = 'sight-' + sl; TP.show('pieces'); } };
      },
      study: () => (study ? pieceStep(study, 'study') : null),
      piece: () => (turns && dayNo() % 2 && study ? pieceStep(study, 'study') : pieceStep(pieceOfDay(), 'piece')),
      review: () => { const r = reviewOfDay(); return r ? pieceStep(r.p, 'review') : null; },
      // The most recent trouble spot Pieces remembered (it's forgotten once you play it clean).
      trouble: () => {
        const [id, t] = Object.entries(store.trouble || {}).sort((a, b) => b[1].at - a[1].at)[0] || [];
        if (!id || (!LIBRARY.some(p => p.id === id) && !(store.myPieces || []).some(p => p.id === id))) return null;
        return { id: 'trouble:' + id, icon: '🔧', title: `Trouble spot: ${t.title || id}, bars ${t.a + 1}–${t.b + 1}`, sub: `Loop it at ${t.bpm} bpm until it's clean, then speed up.`,
          done: TP.doneToday('piece:' + id) > 0, go: () => { TP.pieceRequest = { id, from: t.a, to: t.b, bpm: t.bpm, loop: true }; S.pieceId = id; TP.show('pieces'); } };
      },
    };
    return ids.map(id => make[id]()).filter(Boolean);
  }

  TP.todaySteps = steps;
  TP.todayWarmupId = () => WARMUPS[dayNo() % WARMUPS.length];

  // ---------- getting set up: a checklist until everything's done (or you hide it) ----------
  function renderSetup() {
    const box = $('tdSetup'), inst = TP.inst(), r = store.rangeRec || {};
    if (S.setupHidden) { box.hidden = true; return; }
    const four = inst.kind === 'valve' && inst.valves === 4;
    const measured = r.top !== undefined && r.bottom !== undefined;
    const items = [
      { done: !!S.seenHelp, text: `Instrument: ${inst.name}`, acts: [['Change', () => TP.openSettings('inst')]] },
      { done: !!S.ranges[S.instrument], text: `Practice range: ${TP.flatLabel(S.low)}–${TP.flatLabel(S.high)} (the notes drills and sight-reading use)`,
        acts: measured
          ? [[`Use ${TP.flatLabel(r.bottom)}–${TP.flatLabel(r.top)} (measured)`, () => { S.low = r.bottom; S.high = r.top; S.ranges[S.instrument] = { low: r.bottom, high: r.top }; TP.save(); render(); }]]
          : [['Find mine', goWarmup('rgUp')], ['Set it', () => TP.openSettings('inst')]] },
      four && { done: !!S.compAsked, text: 'Are your valves compensating?', acts: [['Yes', () => setComp(true)], ['No', () => setComp(false)]] },
      { done: !!S.micTested, text: 'Microphone: play into it instead of using the keys', acts: [['Test it', () => TP.openSettings('mic')]] },
      { done: !!S.audioCalibrated || !!S.latencyMs, text: 'Audio delay (matters most with Bluetooth headphones)', acts: [['Calibrate', () => TP.openSettings('timing')]] },
      S.micTested && { done: !!S.micCalibrated || !!S.micLatencyMs, text: 'Mic delay, so notes you play on time are graded on time', acts: [['Calibrate', () => TP.openSettings('mic')]] },
    ].filter(Boolean);
    const left = items.filter(i => !i.done).length;
    box.hidden = !left;
    if (!left) return;
    box.innerHTML = `<div class="today-head"><h2>Get set up</h2><button class="link-btn" id="tdSetupHide">hide</button></div><ul class="setup-list"></ul>`;
    const ul = box.querySelector('ul');
    for (const it of items) {
      const li = document.createElement('li');
      li.className = it.done ? 'done' : '';
      li.innerHTML = `<span class="setup-tick">${it.done ? '✓' : '○'}</span><span class="setup-text"></span>`;
      li.querySelector('.setup-text').textContent = it.text;
      if (!it.done) for (const [label, fn] of it.acts) { const b = document.createElement('button'); b.className = 'small-btn'; b.textContent = label; b.addEventListener('click', fn); li.appendChild(b); }
      ul.appendChild(li);
    }
    $('tdSetupHide').addEventListener('click', () => { S.setupHidden = true; TP.save(); render(); });
  }
  function setComp(yes) { S.compensating = yes; S.compAsked = true; TP.save(); render(); TP.toast(yes ? 'Compensating: the chart and tuner won’t warn about 4th-valve combinations.' : 'Non-compensating: the chart and tuner say which combinations run sharp.', 6000); }

  // "My routine": tick the steps you want.
  function renderCustom() {
    const box = $('tdCustom'), chosen = Array.isArray(S.todayCustom) ? S.todayCustom : BUDGET[20];
    box.innerHTML = ORDER.map(id => `<label class="check"><input type="checkbox" value="${id}"${chosen.includes(id) ? ' checked' : ''}> ${NAMES[id]}</label>`).join('');
  }
  $('tdCustom').addEventListener('change', () => {
    S.todayCustom = [...$('tdCustom').querySelectorAll('input:checked')].map(i => i.value);
    S.todayMins = 'mine';
    TP.save();
    render();
  });

  function render() {
    const list = steps();
    const done = list.filter(s => s.done).length;
    const p = TP.progress();
    const date = new Date();
    $('tdDate').textContent = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('tdSub').textContent = done === list.length
      ? `All done today — great work! ${p.minutes} min practised.`
      : `${done} of ${list.length} done · ${p.minutes} min today · ${p.streak ? `🔥 ${p.streak}-day streak` : 'start a streak today'}`;
    $('tdMins').value = mine() ? 'mine' : String(MINS.includes(Number(S.todayMins)) ? S.todayMins : 20);
    renderCustom();
    renderSetup();
    if (TP.renderJournal) TP.renderJournal();
    if (TP.renderGoals) TP.renderGoals();
    $('tdSession').textContent = TP.session && TP.session.active() ? '■ End session' : '▶ Start session';
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
    const { mastered, total: inRangeCount } = TP.notesMastered();
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
      ['Notes mastered', `${mastered} / ${inRangeCount}`, mastered / Math.max(1, inRangeCount)],
      ['Scales played clean', `${scalesClean}`, Math.min(1, scalesClean / 24), `${scalesPlayed} tried`],
      ['Pieces at ★★★', `${pc.three} / ${pc.n}`, pc.three / Math.max(1, pc.n), `${pc.tried} tried`],
      ['Method-book studies at ★★★', `${mb.three} / ${mb.n}`, mb.three / Math.max(1, mb.n), `${mb.tried} tried · Kopprasch, Bordogni`],
    ];
    $('tdStats').innerHTML = stats.map(([name, val, frac, extra]) => `
      <div class="stat"><span class="stat-name">${name}</span><span class="stat-val">${val}</span>
        <span class="bar-h"><span style="width:${Math.round(frac * 100)}%"></span></span>${extra ? `<span class="stat-extra">${extra}</span>` : ''}</div>`).join('');
  }

  TP.onProgress(() => { if (!$('panel-today').hidden) render(); });
  $('tdSession').addEventListener('click', e => {
    e.currentTarget.blur();
    if (TP.session.active()) { TP.session.end(); render(); } else TP.session.start();
  });
  $('tdMins').addEventListener('change', e => {
    e.target.blur();
    if (e.target.value === 'mine') {
      if (!Array.isArray(S.todayCustom) || !S.todayCustom.length) S.todayCustom = BUDGET[20].slice();
      S.todayMins = 'mine';
      $('tdCustomPop').open = true;
    } else S.todayMins = Number(e.target.value);
    TP.save();
    render();
  });

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
