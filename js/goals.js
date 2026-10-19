// Goals, on the Today page: play a piece cleanly (95%+) at a tempo, by a date if you
// like; or practise so many minutes a week. Progress comes from your runs and your
// practice log, so there's nothing to tick off by hand. Kept per instrument.
(() => {
  'use strict';
  const { S, store, save, $ } = TP;
  const DAY = 86400000;
  const goals = () => (store.goals = store.goals && typeof store.goals === 'object' ? store.goals : {});
  const titleOf = id => {
    const lib = LIBRARY.find(p => p.id === id);
    if (lib) return lib.title;
    const mine = (store.myPieces || []).find(p => p.id === id);
    return mine ? mine.title : id;
  };
  // Minutes practised since Monday.
  function weekMinutes() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    const back = (d.getDay() + 6) % 7;
    let sec = 0;
    for (let i = 0; i <= back; i++) { const x = new Date(d); x.setDate(d.getDate() - i); const r = store.days[TP.dayKey(x)]; if (r) sec += r.sec; }
    return Math.round(sec / 60);
  }
  function progressOf(g) {
    if (g.type === 'minutes') {
      const m = weekMinutes();
      return { frac: Math.min(1, m / g.minutes), text: `${m} of ${g.minutes} min this week`, reached: m >= g.minutes };
    }
    const runs = ((store.pieceHist && store.pieceHist[g.pieceId]) || []).filter(r => r.whole && r.pct >= 95);
    const best = runs.length ? Math.max(...runs.map(r => r.bpm)) : 0;
    const left = g.by ? Math.ceil((new Date(g.by + 'T23:59:59') - Date.now()) / DAY) : null;
    const when = left === null ? '' : left > 1 ? ` · ${left} days left` : left === 1 ? ' · 1 day left' : left === 0 ? ' · due today' : ' · past its date';
    return {
      frac: Math.min(1, best / g.bpm), reached: best >= g.bpm,
      text: (best ? `Clean so far at ${best} of ${g.bpm} bpm` : `Not clean yet at any tempo (aim: ${g.bpm} bpm)`) + when,
    };
  }

  function render() {
    const box = $('tdGoals'), list = Object.values(goals());
    if (!list.length) { box.innerHTML = '<p class="sub tight">Set a goal — a piece at a tempo by a date, or minutes a week — and it fills in as you practise.</p>'; return; }
    box.textContent = '';
    for (const g of list.sort((a, b) => a.created - b.created)) {
      const p = progressOf(g);
      if (p.reached && !g.reached) { g.reached = Date.now(); save(); TP.toast(`🎉 Goal reached: ${g.type === 'minutes' ? `${g.minutes} minutes this week` : `${titleOf(g.pieceId)} at ${g.bpm} bpm`}!`, 7000); }
      const row = document.createElement('div');
      row.className = 'goal' + (p.reached ? ' reached' : '');
      row.innerHTML = `<div class="goal-head"><b></b><span class="goal-actions"></span></div>
        <span class="bar-h"><span style="width:${Math.round(p.frac * 100)}%"></span></span><span class="sub tight"></span>`;
      row.querySelector('b').textContent = (p.reached ? '🎉 ' : '') + (g.type === 'minutes' ? `Practise ${g.minutes} minutes a week` : `${titleOf(g.pieceId)} at ${g.bpm} bpm`);
      row.querySelector('.sub').textContent = p.text;
      const acts = row.querySelector('.goal-actions');
      if (g.type === 'piece') {
        const go = document.createElement('button');
        go.className = 'link-btn';
        go.textContent = 'Practise ›';
        go.addEventListener('click', () => { S.pieceId = g.pieceId; TP.show('pieces'); });
        acts.appendChild(go);
      }
      const del = document.createElement('button');
      del.className = 'link-btn danger';
      del.textContent = '✕';
      del.title = 'Remove this goal';
      del.setAttribute('aria-label', 'Remove this goal');
      del.addEventListener('click', () => { if (confirm('Remove this goal?')) { delete goals()[g.id]; save(); render(); } });
      acts.appendChild(del);
      box.appendChild(row);
    }
  }
  TP.renderGoals = render;

  // ---------- adding one ----------
  function fillForm() {
    const sel = $('gPiece');
    if (sel.options.length) return;
    const group = p => p.book || p.cat;
    for (const c of [...new Set(LIBRARY.map(group))]) {
      const og = document.createElement('optgroup');
      og.label = c;
      for (const p of LIBRARY.filter(q => group(q) === c)) og.appendChild(new Option(p.title, p.id));
      sel.appendChild(og);
    }
    if ((store.myPieces || []).length) {
      const og = document.createElement('optgroup');
      og.label = 'My pieces';
      for (const p of store.myPieces) og.appendChild(new Option(p.title, p.id));
      sel.appendChild(og);
    }
  }
  $('tdGoalAdd').addEventListener('toggle', () => {
    if (!$('tdGoalAdd').open) return;
    fillForm();
    if (S.pieceId && [...$('gPiece').options].some(o => o.value === S.pieceId)) $('gPiece').value = S.pieceId;
    const lib = LIBRARY.find(p => p.id === $('gPiece').value);
    if (lib) { try { $('gBpm').value = TP.score.parseABC(lib.abc).tempo; } catch (e) { /* keep */ } }
  });
  $('gType').addEventListener('change', e => { $('gPieceRow').hidden = e.target.value !== 'piece'; $('gMinRow').hidden = e.target.value !== 'minutes'; });
  $('gPiece').addEventListener('change', e => {
    const lib = LIBRARY.find(p => p.id === e.target.value);
    if (lib) { try { $('gBpm').value = TP.score.parseABC(lib.abc).tempo; } catch (err) { /* keep */ } }
  });
  $('gSave').addEventListener('click', () => {
    const type = $('gType').value, id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const g = type === 'minutes'
      ? { id, type, minutes: Math.max(10, Number($('gMin').value) || 60), created: Date.now() }
      : { id, type, pieceId: $('gPiece').value, bpm: Math.max(30, Math.min(240, Number($('gBpm').value) || 100)), by: $('gBy').value || '', created: Date.now() };
    goals()[id] = g;
    save();
    $('tdGoalAdd').open = false;
    render();
  });
})();
