// "Add music" dialog: import MusicXML / MXL / ABC files, or write ABC by hand
// with a live preview. Saved pieces go to "My pieces" in the Pieces tab.
(() => {
  'use strict';
  const { store, save, $ } = TP;
  const SC = TP.score;
  const dlg = $('importDlg');


  let pending = null;     // { piece, source, xml?, abc?, partName? } ready to save
  let editingId = null;
  let pane = 'file';

  function showPane(p) {
    pane = p;
    dlg.querySelectorAll('.seg button').forEach(b => b.classList.toggle('active', b.dataset.pane === p));
    $('impFile').hidden = p !== 'file';
    $('impAbc').hidden = p !== 'abc';
    if (p === 'abc') previewAbc();
    else renderSaveBtn();
  }
  dlg.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => showPane(b.dataset.pane)));

  function msg(id, text, cls = '') {
    $(id).className = 'feedback' + (cls ? ' ' + cls : '');
    $(id).textContent = text || '';
  }
  function renderSaveBtn() {
    const ok = pane === 'file' ? !!pending && pending.source !== 'abc-edit' : !!pending;
    $('impSave').disabled = !ok;
    $('impSave').textContent = editingId ? 'Save changes' : 'Add to my pieces';
  }
  function preview(boxId, piece) {
    const box = $(boxId);
    box.hidden = false;
    SC.render(box, piece, { width: box.clientWidth - 4 || 520 });
  }

  // ---------- files ----------
  async function handleFile(file) {
    pending = null;
    $('impPart').hidden = true;
    $('impFilePreview').hidden = true;
    renderSaveBtn();
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.pdf')) {
        msg('impMsg', 'Opening the PDF…');
        await openPdf(file);
        return;
      }
      let text;
      if (name.endsWith('.mxl')) text = await SC.unzipMusicXML(await file.arrayBuffer());
      else text = await file.text();
      if (/^\s*</.test(text)) loadXML(text, file.name);
      else loadABC(text, 'impMsg', 'impFilePreview');
    } catch (e) {
      msg('impMsg', e.message || 'Couldn’t read that file.', 'bad');
    }
  }

  function loadXML(xml, fileName) {
    const parts = SC.musicXMLParts(xml);
    const sel = $('impPartSel');
    sel.textContent = '';
    parts.forEach((p, i) => sel.add(new Option(p, i)));
    // Pick the lowest brass part if there is one.
    const guess = parts.findIndex(p => /tuba|sousa|bass|euph|bari|trombone|tbn/i.test(p));
    sel.value = guess >= 0 ? guess : 0;
    $('impPart').hidden = parts.length < 2;
    const use = () => {
      const piece = SC.parseMusicXML(xml, Number(sel.value));
      if (!piece.measures.some(m => m.length)) throw new Error('That part has no notes.');
      if (piece.title === 'Imported score') piece.title = fileName.replace(/\.[^.]+$/, '');
      pending = { piece, source: 'musicxml', partName: piece.partName };
      const notes = SC.timeline(piece).notes.length;
      msg('impMsg', `“${piece.title}”${piece.partName ? ' — ' + piece.partName : ''}: ${piece.measures.length} bars, ${notes} notes.`, 'good');
      preview('impFilePreview', piece);
      renderSaveBtn();
    };
    sel.onchange = () => { try { use(); } catch (e) { msg('impMsg', e.message, 'bad'); } };
    use();
  }

  function loadABC(text, msgId, boxId) {
    const piece = SC.parseABC(text);
    if (!piece.measures.length) throw new Error('No notes found.');
    pending = { piece, source: 'abc', abc: text };
    msg(msgId, `“${piece.title}”: ${piece.measures.length} bars, ${SC.timeline(piece).notes.length} notes.`, 'good');
    preview(boxId, piece);
    renderSaveBtn();
  }

  $('impInput').addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  const drop = $('impDrop');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  // ---------- PDFs: show the pages beside the note palette ----------
  // A PDF only holds a picture of the music, so you copy it in with the palette.
  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => fail(new Error('Couldn’t load the PDF viewer (vendor/pdfjs is missing).'));
      document.head.appendChild(s);
    });
  }
  async function pdfjs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    // Load the worker code into the page itself: real workers can't start from
    // a page opened straight from disk (file://), and pdf.js then uses this copy.
    await loadScript('vendor/pdfjs/pdf.worker.min.js');
    await loadScript('vendor/pdfjs/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
    return window.pdfjsLib;
  }
  async function openPdf(file) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    dlg.classList.add('transcribe');
    const view = $('impPdfView');
    view.hidden = false;
    view.textContent = '';
    const title = file.name.replace(/\.pdf$/i, '');
    $('impTitle').value = title;
    $('impText').value = blankTune(title);
    syncHeaderControls();
    initOctave();
    showPane('abc');
    const pages = Math.min(doc.numPages, 30);
    for (let p = 1; p <= pages; p++) {
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = ((view.clientWidth - 12) / base.width) * Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      view.appendChild(c);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp, intent: 'print' }).promise;
    }
    if (doc.numPages > pages) view.insertAdjacentHTML('beforeend', `<p class="sub">Showing the first ${pages} of ${doc.numPages} pages.</p>`);
    await readPdfNotes(doc, lib, title);
  }

  // Try to read the notes themselves (works for PDFs exported by notation software).
  let pdfParts = null;
  async function readPdfNotes(doc, lib, title) {
    const sel = $('impPdfPart');
    $('impPdfPartRow').hidden = true;
    msg('impAbcMsg', 'Reading the notes…');
    let res;
    try {
      res = await TP.omr.read(doc, lib, (p, n) => msg('impAbcMsg', `Reading the notes… page ${p} of ${n}`));
    } catch (e) {
      msg('impAbcMsg', `${e.message} Copy it in with the palette instead: pick the key and time, then click (or type) the notes as you read them.`, 'bad');
      return;
    }
    pdfParts = res.parts.filter(p => SC.timeline(p).notes.length >= 4);
    if (!pdfParts.length) {
      msg('impAbcMsg', 'Couldn’t find notes in this PDF (it may be a scan). Copy it in with the palette: pick the key and time, then click (or type) the notes.', 'bad');
      return;
    }
    sel.textContent = '';
    pdfParts.forEach((p, i) => sel.add(new Option(`Staff ${i + 1} of each system${i === pdfParts.length - 1 && pdfParts.length > 1 ? ' (lowest)' : ''}`, i)));
    // Several staves per system: start with the lowest one (where the tuba part usually is).
    sel.value = pdfParts.length - 1;
    $('impPdfPartRow').hidden = pdfParts.length < 2;
    const use = () => {
      const p = pdfParts[Number(sel.value)];
      $('impText').value = SC.toABC(p, $('impTitle').value || title);
      syncHeaderControls();
      previewAbc();
      const n = SC.timeline(p).notes.length;
      msg('impAbcMsg', `Read ${n} notes in ${p.measures.length} bars. Check them against the page — fix anything that’s off with the palette or in the text — then add it to your pieces.`, 'good');
    };
    sel.onchange = use;
    use();
  }
  function closePdf() {
    dlg.classList.remove('transcribe');
    $('impPdfView').hidden = true;
    $('impPdfView').textContent = '';
  }

  // ---------- the note palette ----------
  const pal = { dur: 24, dot: false, acc: null, oct: 2 };
  const KEY_NAMES = Object.keys(TP.MAJOR_FIFTHS).sort((a, b) => TP.MAJOR_FIFTHS[a] - TP.MAJOR_FIFTHS[b]);
  for (const k of KEY_NAMES) {
    const f = TP.MAJOR_FIFTHS[k];
    $('palKey').add(new Option(`${TP.tonicName(k)} major${f ? ` (${Math.abs(f)}${f > 0 ? '♯' : '♭'})` : ''}`, k));
  }
  function blankTune(title) {
    return `X:1\nT:${title || 'My tune'}\nM:4/4\nL:1/8\nQ:1/4=96\nK:Bb\n`;
  }
  const header = (field, dflt) => { const m = $('impText').value.match(new RegExp(`^${field}:(.*)$`, 'm')); return m ? m[1].trim() : dflt; };
  function setHeader(field, value) {
    const t = $('impText');
    const re = new RegExp(`^${field}:.*$`, 'm');
    if (re.test(t.value)) t.value = t.value.replace(re, `${field}:${value}`);
    else t.value = t.value.replace(/^(K:.*)$/m, `${field}:${value}\n$1`);
    typed();
  }
  function syncHeaderControls() {
    const k = header('K', 'C').match(/^[A-G][b#]?/);
    if (k && TP.MAJOR_FIFTHS[k[0]] !== undefined) $('palKey').value = k[0];
    $('palTime').value = header('M', '4/4');
    const q = header('Q', '').match(/=(\d+)/);
    if (q) $('palTempo').value = [...$('palTempo').options].some(o => o.value === q[1]) ? q[1] : $('palTempo').value;
  }
  // Start the palette in the middle octave of your instrument.
  function initOctave() {
    pal.oct = Math.floor(TP.inst().center / 12) - 1;
    renderPalette();
  }
  $('palKey').addEventListener('change', e => setHeader('K', e.target.value));
  $('palTime').addEventListener('change', e => setHeader('M', e.target.value));
  $('palTempo').addEventListener('change', e => setHeader('Q', '1/4=' + e.target.value));

  function renderPalette() {
    dlg.querySelectorAll('#palDur [data-dur]').forEach(b => b.classList.toggle('on', Number(b.dataset.dur) === pal.dur));
    $('palDot').classList.toggle('on', pal.dot);
    dlg.querySelectorAll('[data-acc]').forEach(b => b.classList.toggle('on', pal.acc !== null && Number(b.dataset.acc) === pal.acc));
    $('palOct').textContent = pal.oct;
  }
  // The ABC length for the chosen duration, relative to the tune's L: unit.
  function lengthToken() {
    const unit = 96 * (header('L', '1/8').split('/').reduce((a, b) => Number(a) / Number(b)));
    const ticks = pal.dur * (pal.dot ? 1.5 : 1);
    let num = ticks, den = unit;
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = gcd(num, den);
    num /= g; den /= g;
    if (den === 1) return num === 1 ? '' : String(num);
    return (num === 1 ? '' : num) + (den === 2 && num === 1 ? '/' : '/' + den);
  }
  function noteToken(letter) {
    const acc = pal.acc === null ? '' : { '-1': '_', 0: '=', 1: '^' }[pal.acc];
    let s = pal.oct >= 5 ? letter.toLowerCase() : letter;
    if (pal.oct > 5) s += "'".repeat(pal.oct - 5);
    if (pal.oct < 4) s += ','.repeat(4 - pal.oct);
    return acc + s;
  }
  function insert(text, glue = false) {
    const t = $('impText');
    const v = t.value;
    // At the cursor if you're editing the text; otherwise at the end (before a final |]).
    let at = document.activeElement === t ? t.selectionStart : v.length;
    if (document.activeElement !== t && /\|\]\s*$/.test(v)) at = v.lastIndexOf('|]');
    const before = v.slice(0, at), after = v.slice(at);
    const sep = glue || /[\s\n]$/.test(before) || !before ? '' : ' ';
    t.value = before + sep + text + after;
    const pos = (before + sep + text).length;
    t.setSelectionRange(pos, pos);
    typed();
  }
  function addNote(letter) {
    insert(noteToken(letter) + lengthToken());
    // Let you hear it: the key signature applies unless you chose an accidental.
    const fifths = TP.MAJOR_FIFTHS[$('palKey').value] || 0;
    const acc = pal.acc !== null ? pal.acc : TP.keySigAcc(fifths, letter);
    TP.playMidi((pal.oct + 1) * 12 + TP.NATURAL_PC[letter] + acc, 0.5);
    pal.acc = null;   // accidentals are one-shot
    renderPalette();
  }
  dlg.querySelectorAll('#palDur [data-dur]').forEach(b => b.addEventListener('click', () => { pal.dur = Number(b.dataset.dur); renderPalette(); }));
  $('palDot').addEventListener('click', () => { pal.dot = !pal.dot; renderPalette(); });
  dlg.querySelectorAll('[data-acc]').forEach(b => b.addEventListener('click', () => {
    const a = Number(b.dataset.acc);
    pal.acc = pal.acc === a ? null : a;
    renderPalette();
  }));
  $('palUp').addEventListener('click', () => { pal.oct = Math.min(6, pal.oct + 1); renderPalette(); });
  $('palDown').addEventListener('click', () => { pal.oct = Math.max(0, pal.oct - 1); renderPalette(); });
  dlg.querySelectorAll('[data-note]').forEach(b => b.addEventListener('click', () => addNote(b.dataset.note)));
  $('palRest').addEventListener('click', () => insert('z' + lengthToken()));
  $('palTie').addEventListener('click', () => insert('-', true));
  $('palBar').addEventListener('click', () => insert('|'));
  $('palBack').addEventListener('click', () => {
    const t = $('impText');
    const head = t.value.match(/^[\s\S]*^K:.*\n?/m);
    const keep = head ? head[0].length : 0;
    const body = t.value.slice(keep).replace(/\s*\S+\s*$/, '');
    t.value = t.value.slice(0, keep) + body;
    typed();
  });
  for (const b of dlg.querySelectorAll('#palette button')) b.addEventListener('mousedown', e => e.preventDefault());

  // Typing shortcuts while you're not in a text box.
  dlg.addEventListener('keydown', e => {
    if (pane !== 'abc' || /^(TEXTAREA|INPUT|SELECT)$/.test(e.target.nodeName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const durKeys = { 1: 96, 2: 48, 3: 24, 4: 12, 5: 6 };
    let handled = true;
    if (/^[a-gA-G]$/.test(k)) addNote(k.toUpperCase());
    else if (durKeys[k]) { pal.dur = durKeys[k]; renderPalette(); }
    else if (k === '.') { pal.dot = !pal.dot; renderPalette(); }
    else if (k === 'ArrowUp') $('palUp').click();
    else if (k === 'ArrowDown') $('palDown').click();
    else if (k === 'r' || k === 'R') $('palRest').click();
    else if (k === 't' || k === 'T') $('palTie').click();
    else if (k === '|' || k === '\\') $('palBar').click();
    else if (k === 'Backspace') $('palBack').click();
    else if (k === '-') { pal.acc = pal.acc === -1 ? null : -1; renderPalette(); }
    else if (k === '#') { pal.acc = pal.acc === 1 ? null : 1; renderPalette(); }
    else if (k === '=') { pal.acc = pal.acc === 0 ? null : 0; renderPalette(); }
    else handled = false;
    if (handled) e.preventDefault();
  });

  // ---------- writing ABC ----------
  let typingTimer = 0;
  function previewAbc() {
    pending = null;
    try {
      loadABC($('impText').value, 'impAbcMsg', 'impPreview');
      if ($('impTitle').value.trim()) pending.piece.title = $('impTitle').value.trim();
    } catch (e) {
      $('impPreview').hidden = true;
      msg('impAbcMsg', e.message, 'bad');
    }
    renderSaveBtn();
  }
  function typed() { clearTimeout(typingTimer); typingTimer = setTimeout(previewAbc, 250); }
  $('impText').addEventListener('input', () => { typed(); syncHeaderControls(); });
  $('impTitle').addEventListener('input', () => { if (pending) pending.piece.title = $('impTitle').value.trim() || pending.piece.title; });

  // ---------- save ----------
  $('impSave').addEventListener('click', () => {
    if (!pending) return;
    if (pane === 'abc') {
      // Keep the title in the ABC text in step with the title box.
      const title = $('impTitle').value.trim() || pending.piece.title;
      pending.piece.title = title;
      pending.abc = /^T:/m.test(pending.abc) ? pending.abc.replace(/^T:.*$/m, 'T:' + title) : pending.abc.replace(/^(X:.*\n)?/, `$1T:${title}\n`);
    }
    const rec = {
      id: editingId || 'my-' + Date.now().toString(36),
      title: pending.piece.title, source: pending.source, piece: pending.piece,
      abc: pending.abc, partName: pending.partName,
    };
    const i = store.myPieces.findIndex(p => p.id === rec.id);
    const before = i >= 0 ? store.myPieces[i] : null;
    if (i >= 0) store.myPieces[i] = rec; else store.myPieces.push(rec);
    if (!save(true)) {
      // Out of browser storage: undo and say so.
      if (before) store.myPieces[i] = before; else store.myPieces.pop();
      msg(pane === 'file' ? 'impMsg' : 'impAbcMsg', 'Couldn’t save — the browser’s storage for this page is full or blocked. Delete some of My pieces and try again.', 'bad');
      return;
    }
    dlg.close();
    TP.piecesChanged(rec.id);
    TP.toast(`Saved “${rec.title}” to My pieces.`);
  });
  $('impCancel').addEventListener('click', () => dlg.close());

  TP.openImport = (opts = {}) => {
    pending = null;
    editingId = opts.id || null;
    msg('impMsg', '');
    $('impInput').value = '';
    $('impPart').hidden = true;
    $('impFilePreview').hidden = true;
    $('impTitle').value = opts.title || '';
    $('impText').value = opts.abc || blankTune(opts.title);
    closePdf();
    syncHeaderControls();
    initOctave();
    dlg.showModal();
    showPane(opts.abc ? 'abc' : 'file');
  };
  dlg.addEventListener('close', closePdf);
})();
