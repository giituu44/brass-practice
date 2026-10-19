// Pieces: the library browser (cards by category, search, your best scores), the
// piece menu, and stepping through a book with ‹ ›.
TP.piecesLib = (() => {
  'use strict';
  const { store, $ } = TP;

  // ---------- library browser: cards by category, with your best score ----------
  let libCat = 'All';
  function libEntries() {
    // Method books are listed book by book.
    const out = LIBRARY.map(p => ({ id: p.id, title: p.title, composer: p.composer || '', level: p.level, cat: p.book || p.cat, note: p.note || '' }));
    for (const l of [1, 2, 3, 4, 5]) out.push({ id: 'sight-' + l, title: `Sight-reading — level ${l}`, composer: 'New every time', level: l, cat: 'Sight-reading', note: '' });
    for (const p of store.myPieces) out.push({ id: p.id, title: p.title, composer: p.piece.composer || '', level: 0, cat: 'My pieces', note: '' });
    return out;
  }
  const starsFor = pct => (pct >= 95 ? '★★★' : pct >= 80 ? '★★☆' : pct >= 60 ? '★☆☆' : '☆☆☆');
  function renderLibrary() {
    const item = TP.currentPiece();
    // Search ignores case and accents ("etude" finds "Étude").
    const fold = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const all = libEntries(), q = fold($('libSearch').value.trim());
    const cats = ['All', ...new Set(all.map(e => e.cat))];
    $('libChips').innerHTML = cats.map(c => `<button type="button" class="lib-chip${c === libCat ? ' on' : ''}" data-cat="${c}">${c}</button>`).join('');
    const shown = all.filter(e => (libCat === 'All' || e.cat === libCat)
      && (!q || fold(e.title + ' ' + e.composer + ' ' + e.cat).includes(q)));
    const list = $('libList');
    list.textContent = '';
    let lastCat = null;
    for (const e of shown) {
      if (libCat === 'All' && e.cat !== lastCat) {
        lastCat = e.cat;
        const h = document.createElement('h3');
        h.className = 'lib-cat';
        h.textContent = e.cat;
        list.appendChild(h);
      }
      const rec = store.pieces[e.id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lib-card' + (item && item.id === e.id ? ' current' : '') + (rec ? ' tried' : '');
      card.dataset.id = e.id;
      card.innerHTML = `<span class="lib-title"></span><span class="lib-sub"></span>
        <span class="lib-foot"><span class="lib-level">${e.level ? '●'.repeat(e.level) + '<i>' + '●'.repeat(Math.max(0, 3 - e.level)) + '</i>' : ''}</span>
        <span class="lib-best">${rec ? `<b>${starsFor(rec.best)}</b> ${rec.best}%` : 'not played yet'}</span></span>`;
      card.querySelector('.lib-title').textContent = e.title;
      card.querySelector('.lib-sub').textContent = e.composer;
      list.appendChild(card);
    }
    if (!shown.length) list.innerHTML = '<p class="sub center">Nothing matches. Add your own with ＋ Add music.</p>';
  }
  function openLibrary() {
    TP.stopPiece();
    $('libSearch').value = '';
    libCat = 'All';
    renderLibrary();
    $('libDlg').showModal();
    const cur = $('libList').querySelector('.current');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  $('pcBrowse').addEventListener('click', e => { e.currentTarget.blur(); openLibrary(); });
  $('libSearch').addEventListener('input', renderLibrary);
  $('libChips').addEventListener('click', e => {
    const b = e.target.closest('.lib-chip');
    if (b) { libCat = b.dataset.cat; renderLibrary(); }
  });
  $('libList').addEventListener('click', e => {
    const c = e.target.closest('.lib-card');
    if (!c) return;
    $('libDlg').close();
    TP.openPiece(c.dataset.id);
  });
  $('libSearch').addEventListener('keydown', e => {
    // Enter opens the first match.
    if (e.key === 'Enter') { const c = $('libList').querySelector('.lib-card'); if (c) c.click(); }
  });

  // The pieces in the same book (or category), in order, for ‹ › stepping.
  function siblings() {
    const item = TP.currentPiece();
    if (!item || item.sight || item.slur) return [];
    if (item.mine) return store.myPieces.map(p => p.id);
    const lib = LIBRARY.find(p => p.id === item.id);
    if (!lib) return [];
    const group = p => p.book || p.cat;
    return LIBRARY.filter(p => group(p) === group(lib)).map(p => p.id);
  }
  function step(d) {
    const item = TP.currentPiece();
    const sib = siblings(), k = sib.indexOf(item.id) + d;
    if (k >= 0 && k < sib.length) TP.openPiece(sib[k]);
  }
  $('pcPrev').addEventListener('click', () => step(-1));
  $('pcNext').addEventListener('click', () => step(1));

  const pieceSel = $('pcPiece');
  function fillPieceList() {
    pieceSel.textContent = '';
    const group = p => p.book || p.cat;
    const cats = [...new Set(LIBRARY.map(group))];
    for (const c of cats) {
      const og = document.createElement('optgroup');
      og.label = c;
      for (const p of LIBRARY.filter(q => group(q) === c)) og.appendChild(new Option(`${p.title}${'  ' + '●'.repeat(p.level)}`, p.id));
      pieceSel.appendChild(og);
    }
    const sg = document.createElement('optgroup');
    sg.label = 'Sight-reading (new each time)';
    for (const l of [1, 2, 3, 4, 5]) sg.appendChild(new Option(`Sight-reading — level ${l}  ${'●'.repeat(l)}`, 'sight-' + l));
    pieceSel.appendChild(sg);
    const og = document.createElement('optgroup');
    og.label = 'My pieces';
    if (store.myPieces.length) for (const p of store.myPieces) og.appendChild(new Option(p.title, p.id));
    else { const o = new Option('(none yet — use Import or Write)', ''); o.disabled = true; og.appendChild(o); }
    pieceSel.appendChild(og);
  }

  return { renderLibrary, openLibrary, siblings, step, fillPieceList };
})();
