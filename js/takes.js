// Your recorded runs of each piece, kept over time so you can hear how it has come
// along. Recordings are far too big for localStorage, so they live in IndexedDB;
// if a browser won't allow that (some do for pages opened from disk), takes simply
// aren't kept and ⬇ Save still works.
TP.takes = (() => {
  'use strict';
  // Version 2 added a second store, 'recordings' (the Recordings tab's play-along files);
  // version 3 'snapshots' (a copy of your progress each day: js/datasafe.js).
  const NAME = 'brass-practice-takes', STORE = 'takes', KEEP = 12;   // newest takes kept per piece
  let opening = null;
  function db() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
        let req;
        try { req = indexedDB.open(NAME, 3); } catch (e) { reject(e); return; }
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('piece', 'piece');
          if (!d.objectStoreNames.contains('recordings')) d.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
          if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'day' });
        };
        let done = false;
        req.onsuccess = () => {
          done = true;
          // A newer version of the app (in another tab) needs to change the stores: let go.
          req.result.onversionchange = () => { req.result.close(); opening = null; };
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
        // An older copy of the app open in another tab is holding on to the old stores.
        req.onblocked = () => TP.toast('Close Brass Practice in your other tabs or windows: this one needs to update where it keeps your recordings.', 10000);
        // (Not for good: once the other tab lets go, the next try opens it.)
        setTimeout(() => { if (!done) { opening = null; reject(new Error('IndexedDB did not open')); } }, 5000);
      });
      opening.catch(() => {});
    }
    return opening;
  }
  // Run fn(store) in a transaction; resolves with what fn's request returned.
  function run(mode, fn, name = STORE) {
    return db().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(name, mode);
      const req = fn(tx.objectStore(name));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    }));
  }
  // Takes are kept per instrument and piece.
  const key = pieceId => `${TP.inst().id}:${pieceId}`;

  // Newest first: [{ id, piece, at, pct, bpm, bars, type, blob }]. Takes since October 2026
  // also have lead (s into the recording where the music starts), startT and spt (the
  // tick it starts on, seconds per tick), part (of a duet) and trace (your pitch on
  // each note: [{ i, d, p: [f, c, f, c…] }]) — so they can be lined up with the music.
  function list(pieceId) {
    return run('readonly', s => s.index('piece').getAll(key(pieceId))).then(all => all.sort((a, b) => b.at - a.at));
  }
  async function add(pieceId, take) {
    await run('readwrite', s => s.add({ ...take, piece: key(pieceId) }));
    // Only the newest few per piece (but always keep your best).
    const all = await list(pieceId);
    const best = all.reduce((b, t) => (!b || t.pct > b.pct ? t : b), null);
    const extra = all.slice(KEEP).filter(t => t !== best);
    if (extra.length) await run('readwrite', s => { extra.forEach(t => s.delete(t.id)); return null; });
  }
  const remove = id => run('readwrite', s => s.delete(id));

  // The list of takes, with play and delete buttons, into a container.
  let playing = null;
  // opts.onCompare([a, b] or null): tick two takes to compare them (takes that can be lined up).
  async function render(box, pieceId, opts = {}) {
    box.textContent = '';
    let all;
    try { all = await list(pieceId); } catch (e) { return 0; }
    if (!all.length) return 0;
    const fmt = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const best = Math.max(...all.map(t => t.pct || 0));
    box.innerHTML = '<div class="hist-title">Your takes</div>';
    const picked = [];
    for (const t of all) {
      const row = document.createElement('div');
      row.className = 'take-row';
      row.innerHTML = `<button type="button" class="pill take-play" aria-label="Play this take">▶</button>
        <span>${fmt(t.at)} · ${t.pct}% at ${t.bpm} bpm${t.bars ? ` · bars ${t.bars[0]}–${t.bars[1]}` : ''}${t.pct === best ? ' · <b>best</b>' : ''}</span>
        <button type="button" class="link-btn danger take-del" aria-label="Delete this take">delete</button>`;
      if (opts.onCompare && t.startT !== undefined) {
        const cmp = document.createElement('label');
        cmp.className = 'take-cmp';
        cmp.title = 'Tick two takes to compare them';
        cmp.innerHTML = '<input type="checkbox"> compare';
        cmp.querySelector('input').addEventListener('change', e => {
          e.stopPropagation();
          if (e.target.checked) picked.push(t); else picked.splice(picked.indexOf(t), 1);
          // Two at most: ticking a third unticks the oldest pick.
          if (picked.length > 2) { const old = picked.shift(); box.querySelectorAll('.take-cmp input').forEach(i => { if (i._take === old) i.checked = false; }); }
          opts.onCompare(picked.length === 2 ? picked.slice().sort((a, b) => a.at - b.at) : null);
        });
        cmp.querySelector('input')._take = t;
        row.querySelector('span').after(cmp);
      }
      const btn = row.querySelector('.take-play');
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (playing) { playing.audio.pause(); URL.revokeObjectURL(playing.url); playing.btn.textContent = '▶'; const was = playing.btn; playing = null; if (was === btn) return; }
        const url = URL.createObjectURL(t.blob), audio = new Audio(url);
        playing = { audio, url, btn };
        btn.textContent = '■';
        audio.onended = () => { if (playing && playing.audio === audio) { btn.textContent = '▶'; URL.revokeObjectURL(url); playing = null; } };
        audio.play().catch(() => { btn.textContent = '▶'; playing = null; });
      });
      row.querySelector('.take-del').addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm(`Delete the take from ${fmt(t.at)}?`)) return;
        await remove(t.id);
        render(box, pieceId);
      });
      box.appendChild(row);
    }
    return all.length;
  }

  // The Recordings tab's files: { id, name, type, blob, added, a, b, speed }.
  const recordings = {
    list: () => run('readonly', s => s.getAll(), 'recordings').then(all => all.sort((x, y) => y.added - x.added)),
    add: rec => run('readwrite', s => s.add(rec), 'recordings'),
    put: rec => run('readwrite', s => s.put(rec), 'recordings'),
    remove: id => run('readwrite', s => s.delete(id), 'recordings'),
  };

  // A copy of your progress each day: { day ('YYYY-MM-DD' or 'before-restore'), at, data }.
  const snapshots = {
    list: () => run('readonly', s => s.getAll(), 'snapshots').then(all => all.sort((x, y) => y.at - x.at)),
    put: snap => run('readwrite', s => s.put(snap), 'snapshots'),
    remove: day => run('readwrite', s => s.delete(day), 'snapshots'),
  };

  return { add, list, remove, render, recordings, snapshots, available: () => db().then(() => true, () => false) };
})();
