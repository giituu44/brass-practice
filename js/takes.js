// Your recorded runs of each piece, kept over time so you can hear how it has come
// along. Recordings are far too big for localStorage, so they live in IndexedDB;
// if a browser won't allow that (some do for pages opened from disk), takes simply
// aren't kept and ⬇ Save still works.
TP.takes = (() => {
  'use strict';
  // Version 2 added a second store, 'recordings' (the Recordings tab's play-along files).
  const NAME = 'brass-practice-takes', STORE = 'takes', KEEP = 12;   // newest takes kept per piece
  let opening = null;
  function db() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB is not available')); return; }
        let req;
        try { req = indexedDB.open(NAME, 2); } catch (e) { reject(e); return; }
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('piece', 'piece');
          if (!d.objectStoreNames.contains('recordings')) d.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        setTimeout(() => reject(new Error('IndexedDB did not open')), 5000);
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

  // Newest first: [{ id, piece, at, pct, bpm, bars, type, blob }]
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
  async function render(box, pieceId) {
    box.textContent = '';
    let all;
    try { all = await list(pieceId); } catch (e) { return 0; }
    if (!all.length) return 0;
    const fmt = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const best = Math.max(...all.map(t => t.pct || 0));
    box.innerHTML = '<div class="hist-title">Your takes</div>';
    for (const t of all) {
      const row = document.createElement('div');
      row.className = 'take-row';
      row.innerHTML = `<button type="button" class="pill take-play" aria-label="Play this take">▶</button>
        <span>${fmt(t.at)} · ${t.pct}% at ${t.bpm} bpm${t.bars ? ` · bars ${t.bars[0]}–${t.bars[1]}` : ''}${t.pct === best ? ' · <b>best</b>' : ''}</span>
        <button type="button" class="link-btn danger take-del" aria-label="Delete this take">delete</button>`;
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

  return { add, list, remove, render, recordings, available: () => db().then(() => true, () => false) };
})();
