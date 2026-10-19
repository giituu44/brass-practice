// A practice journal: a note on each piece ("bar 12: breathe after the high F"),
// shown whenever you open it again, and a note for each day on the Today page.
(() => {
  'use strict';
  const { store, save, $ } = TP;
  store.journal = store.journal || { pieces: {}, days: {} };
  const J = store.journal;
  const fmt = at => new Date(at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // Saved as you type (a moment after you stop).
  function saver(write) {
    let timer = 0;
    return e => { clearTimeout(timer); const v = e.target.value; timer = setTimeout(() => { write(v); save(); }, 400); };
  }

  // ---------- Pieces: the 📝 Notes pop-out, and your note under the title ----------
  let pieceId = null;
  function showPieceNote() {
    const n = pieceId && J.pieces[pieceId];
    $('pcMyNote').hidden = !(n && n.text.trim());
    if (n) $('pcMyNote').textContent = '📝 ' + n.text.trim();
    $('pcJournalText').value = n ? n.text : '';
    $('pcJournalWhen').textContent = n && n.text.trim() ? `Last changed ${fmt(n.at)}.` : 'Saved as you type; shown whenever you open this piece.';
  }
  TP.onPieceOpen(item => { pieceId = item.id; showPieceNote(); });
  $('pcJournalText').addEventListener('input', saver(v => {
    if (!pieceId) return;
    if (v.trim()) J.pieces[pieceId] = { text: v, at: Date.now() }; else delete J.pieces[pieceId];
    showPieceNote();
  }));

  // ---------- Today: today's note, and what you wrote last time ----------
  TP.renderJournal = () => {
    const today = TP.dayKey();
    $('tdJournal').value = (J.days[today] && J.days[today].text) || '';
    const before = Object.keys(J.days).filter(k => k < today && J.days[k].text.trim()).sort().pop();
    $('tdJournalPrev').textContent = before ? `${fmt(before + 'T12:00:00')}: ${J.days[before].text.trim()}` : '';
    $('tdJournalPrev').hidden = !before;
  };
  $('tdJournal').addEventListener('input', saver(v => {
    const today = TP.dayKey();
    if (v.trim()) J.days[today] = { text: v, at: Date.now() }; else delete J.days[today];
  }));
  TP.journal = J;
})();
