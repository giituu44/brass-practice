// A mock audition: the pieces you pick, in a random order, one try each (no stopping to
// start again), every one recorded with the mic. Afterwards you listen back, give each a
// mark, and it can go in today's journal. Runs through the Pieces tab (TP.pc).
(() => {
  'use strict';
  const { S, store, $ } = TP;
  let aud = null;   // { list, k, results, waiting, saved, marked }

  // ---------- choosing the pieces ----------
  function candidates() {
    const seen = new Set(), out = [];
    const add = (id, checked) => {
      if (seen.has(id) || /^(sight-|slur:)/.test(id)) return;
      const lib = LIBRARY.find(p => p.id === id), mine = store.myPieces.find(p => p.id === id);
      if (!lib && !mine) return;
      seen.add(id);
      out.push({ id, title: (lib || mine).title, checked });
    };
    for (const p of LIBRARY) if (p.cat === 'Excerpts') add(p.id, true);
    for (const g of Object.values(store.goals || {})) if (g.pieceId) add(g.pieceId, true);
    // Then what you've been playing lately, and your own pieces.
    const recent = Object.entries(store.pieceHist || {}).sort((a, b) => b[1][b[1].length - 1].at - a[1][a[1].length - 1].at);
    for (const [id] of recent.slice(0, 12)) add(id, false);
    for (const p of store.myPieces) add(p.id, false);
    return out;
  }
  function openSetup() {
    $('libDlg').close();
    const box = $('audList');
    box.textContent = '';
    for (const c of candidates()) {
      const l = document.createElement('label');
      l.className = 'check';
      l.innerHTML = '<input type="checkbox"> <span></span>';
      l.querySelector('input').checked = c.checked;
      l.querySelector('input').value = c.id;
      l.querySelector('span').textContent = c.title;
      box.appendChild(l);
    }
    $('audDlg').showModal();
  }
  $('audOpen').addEventListener('click', openSetup);
  $('audCancel').addEventListener('click', () => $('audDlg').close());

  $('audGo').addEventListener('click', async () => {
    const ids = [...$('audList').querySelectorAll('input:checked')].map(i => i.value);
    if (!ids.length) { TP.toast('Tick at least one piece.', 4000); return; }
    // Shuffled, then as many as you asked for.
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const list = ids.slice(0, Number($('audCount').value) || 4);
    $('audDlg').close();
    if (S.input !== 'mic') await TP.setInput('mic');
    if (S.input !== 'mic') return;   // (it said why)
    // One plain try each: no loop, guide, hints or hidden notes.
    const saved = { pieceLoop: S.pieceLoop, pieceGuide: S.pieceGuide, pieceHints: S.pieceHints, pieceMemo: S.pieceMemo };
    Object.assign(S, { pieceLoop: false, pieceGuide: false, pieceHints: 'off', pieceMemo: false });
    aud = { list, k: 0, results: [], waiting: false, saved, marked: $('audMarked').checked };
    TP.pc.setAudition(hook);
    TP.show('pieces');
    next();
  });

  // ---------- running it ----------
  function next() {
    const id = aud.list[aud.k];
    TP.pc.open(id);
    const item = TP.currentPiece();
    if (aud.marked && item.piece.tempo) TP.pc.setTempo(item.piece.tempo);
    aud.waiting = true;
    TP.pc.say(`🎯 ${aud.k + 1} of ${aud.list.length}: ${item.title} at ${S.pieceBpm} bpm. One try, no starting again. Breathe, and press Space when you’re ready (Esc to end the audition).`);
  }
  function keep(res, take) {
    aud.results.push(res);
    if (!take) return;
    if (take.blob) res.blob = take.blob; else take.onBlob = b => { res.blob = b; };
  }
  function advance() {
    if (!aud) return;
    if (++aud.k < aud.list.length) next(); else end();
  }
  const hook = {
    go() {
      if (!aud || !aud.waiting) return false;
      aud.waiting = false;
      TP.pc.start('play');
      return true;
    },
    finished({ pct, bpm, msg, take }) {
      keep({ id: aud.list[aud.k], title: TP.currentPiece().title, pct, bpm }, take);
      TP.pc.say(msg + (aud.k + 1 < aud.list.length ? ' · next piece in 4 s…' : ' · that’s all — listen back in a moment…'));
      setTimeout(advance, 4000);
    },
    stopped(take) {
      keep({ id: aud.list[aud.k], title: TP.currentPiece().title, stopped: true, bpm: S.pieceBpm }, take);
      TP.pc.say('Stopped. (In an audition, keep going whatever happens!) Next piece in 4 s…');
      setTimeout(advance, 4000);
    },
    quit() {
      if (confirm('End the mock audition now?')) end();
    },
  };
  function end() {
    Object.assign(S, aud.saved);
    TP.save();
    TP.pc.setAudition(null);
    const done = aud.results;
    aud = null;
    TP.pc.idle();
    if (done.length) setTimeout(() => results(done), 600);   // the last recording finishes saving
  }

  // ---------- listening back ----------
  let player = null;
  function results(list) {
    const box = $('audResList');
    box.textContent = '';
    list.forEach(r => {
      const row = document.createElement('div');
      row.className = 'aud-row';
      row.innerHTML = '<button type="button" class="pill aud-play">▶</button><div><b></b><span class="sub"></span></div>'
        + '<select class="num-input aud-mark" aria-label="Your mark"><option value="">your mark…</option><option>★</option><option>★★</option><option>★★★</option><option>★★★★</option><option>★★★★★</option></select>'
        + '<input type="text" class="text-input aud-note" placeholder="what to fix" aria-label="What to fix">';
      row.querySelector('b').textContent = r.title;
      row.querySelector('.sub').textContent = r.stopped ? ` · stopped at ${r.bpm} bpm` : ` · ${r.pct}% at ${r.bpm} bpm`;
      const btn = row.querySelector('.aud-play');
      btn.disabled = !r.blob;
      btn.addEventListener('click', () => {
        if (player) { player.a.pause(); URL.revokeObjectURL(player.url); player.b.textContent = '▶'; const was = player.b; player = null; if (was === btn) return; }
        const url = URL.createObjectURL(r.blob), a = new Audio(url);
        player = { a, url, b: btn };
        btn.textContent = '■';
        a.onended = () => { if (player && player.a === a) { btn.textContent = '▶'; player = null; } };
        a.play().catch(() => { btn.textContent = '▶'; player = null; });
      });
      row._r = r;
      box.appendChild(row);
    });
    $('audResDlg').showModal();
  }
  function closeResults() {
    if (player) { player.a.pause(); player = null; }
    $('audResDlg').close();
  }
  $('audResClose').addEventListener('click', closeResults);
  $('audResSave').addEventListener('click', () => {
    const rows = [...$('audResList').children].map(row => {
      const r = row._r, mark = row.querySelector('.aud-mark').value, note = row.querySelector('.aud-note').value.trim();
      return `${r.title}: ${r.stopped ? 'stopped' : r.pct + '%'} at ${r.bpm} bpm${mark ? ' ' + mark : ''}${note ? ' — ' + note : ''}`;
    });
    const J = TP.journal, day = TP.dayKey(), before = (J.days[day] && J.days[day].text.trim()) || '';
    J.days[day] = { text: (before ? before + '\n' : '') + 'Mock audition — ' + rows.join('; '), at: Date.now() };
    TP.save();
    if (TP.renderJournal) TP.renderJournal();
    TP.toast('Saved to today’s journal (Today page).', 5000);
    closeResults();
  });
})();
