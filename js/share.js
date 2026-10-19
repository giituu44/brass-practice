// Sharing a piece as a link, and a practice reminder for your calendar.
//
// A link carries the music itself (no server: it's after the # in the address, which
// never leaves the browser that opens it). A teacher can add a goal to it — "this piece
// at 96 bpm by the 30th" — which becomes a goal for whoever opens it.
(() => {
  'use strict';
  const { S, store, $, toast } = TP;
  // Opened from disk there's no web address to share: links point at the published app.
  const SITE = 'https://giituu44.github.io/brass-practice/';
  const base = () => (/^https?:$/.test(location.protocol) ? location.origin + location.pathname : SITE);

  // ---------- packing a piece into a link ----------
  // JSON, squeezed with deflate where the browser can (prefix z), else plain (prefix j),
  // in URL-safe base64.
  const b64 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64 = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); };
  async function squeeze(bytes, how) {
    const stream = new Blob([bytes]).stream().pipeThrough(how === 'in' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (window.CompressionStream) { try { return 'z' + b64(await squeeze(bytes, 'in')); } catch (e) { /* plain instead */ } }
    return 'j' + b64(bytes);
  }
  async function decode(str) {
    let bytes = unb64(str.slice(1));
    if (str[0] === 'z') bytes = await squeeze(bytes, 'out');
    else if (str[0] !== 'j') throw new Error('not a piece link');
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // What goes in the link: a built-in piece by name, your own as ABC.
  function payload(item, goal) {
    const p = item.builtIn ? { v: 1, lib: item.id } : { v: 1, t: item.title, abc: item.abc || TP.score.toABC(item.piece, item.title) };
    if (goal) p.g = goal;
    return p;
  }
  TP.shareCodec = { encode, decode, payload };

  // ---------- the Share dialog ----------
  let link = '';
  async function makeLink() {
    const item = TP.currentPiece();
    const goal = $('shGoal').checked ? { bpm: Math.max(30, Math.min(240, Number($('shBpm').value) || 100)), by: $('shBy').value || undefined } : null;
    link = base() + '#p=' + await encode(payload(item, goal));
    $('shLink').value = link;
    $('shSize').textContent = link.length > 8000 ? 'A long piece makes a long link: some apps cut links this long, so try email.' : '';
  }
  $('pcShare').addEventListener('click', async e => {
    e.currentTarget.blur();
    const item = TP.currentPiece();
    if (!item || item.sight || item.slur) return;
    $('pcMore').open = false;
    $('shTitle').textContent = `Share “${item.title}”`;
    $('shBpm').value = S.pieceBpm;
    $('shGoal').checked = false;
    $('shGoalRow').hidden = true;
    await makeLink();
    $('shareDlg').showModal();
  });
  $('shGoal').addEventListener('change', () => { $('shGoalRow').hidden = !$('shGoal').checked; makeLink(); });
  $('shBpm').addEventListener('change', makeLink);
  $('shBy').addEventListener('change', makeLink);
  $('shCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copied.', 3000); } catch (e) { $('shLink').select(); toast('Select the link and copy it (Ctrl+C).', 4000); }
  });
  $('shSend').hidden = !navigator.share;
  $('shSend').addEventListener('click', () => {
    navigator.share({ title: TP.currentPiece().title, text: 'A piece for Brass Practice:', url: link }).catch(() => {});
  });
  $('shClose').addEventListener('click', () => $('shareDlg').close());

  // ---------- opening a link ----------
  async function receive() {
    const m = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    let p;
    try { p = await decode(m[1]); } catch (e) { toast('That link’s music couldn’t be read — it may have been cut short.', 7000); return; }
    let id = null, title = '';
    if (p.lib) {
      const lib = LIBRARY.find(x => x.id === p.lib);
      if (lib) { id = lib.id; title = lib.title; }
    } else if (typeof p.abc === 'string' && p.abc.length < 200000) {
      title = String(p.t || 'Shared piece').slice(0, 120);
      let piece;
      try { piece = TP.score.parseABC(p.abc); } catch (e) { piece = null; }
      if (piece && piece.measures && piece.measures.length) {
        const same = store.myPieces.find(x => x.abc === p.abc);
        if (same) id = same.id;
        else if (confirm(`Add “${title}” to My pieces? (Someone shared it with you as a link.)`)) {
          piece.title = title;
          id = 'my-' + Date.now().toString(36);
          store.myPieces.push({ id, title, source: 'abc', piece, abc: p.abc });
          if (!TP.save(true)) { store.myPieces.pop(); toast('Couldn’t save it — the browser’s storage for this page is full or blocked.', 7000); return; }
          TP.piecesLib.fillPieceList();
        } else return;
      }
    }
    if (!id) { toast('That link’s music couldn’t be read.', 6000); return; }
    // A goal that came with it (a teacher's assignment).
    const g = p.g;
    if (g && Number(g.bpm) >= 30 && Number(g.bpm) <= 240) {
      const by = /^\d{4}-\d{2}-\d{2}$/.test(g.by || '') ? g.by : undefined;
      const exists = Object.values(store.goals).some(x => x.type === 'piece' && x.pieceId === id && x.bpm === Number(g.bpm));
      if (!exists && confirm(`It comes with a goal: “${title}” cleanly at ${Number(g.bpm)} bpm${by ? ' by ' + new Date(by + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : ''}. Add it to your goals?`)) {
        const gid = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        store.goals[gid] = { id: gid, type: 'piece', pieceId: id, bpm: Number(g.bpm), by, created: Date.now() };
        TP.save();
      }
    }
    S.pieceId = id;
    TP.show('pieces');
    TP.openPiece(id);
  }
  addEventListener('hashchange', receive);
  // Once the app has set itself up and opened its first tab (main.js runs last).
  if (document.readyState === 'complete') setTimeout(receive, 0);
  else addEventListener('load', () => setTimeout(receive, 0));

  // ---------- a practice reminder for your calendar ----------
  // A repeating event (an .ics file any calendar opens) on the days and at the time you
  // pick, as long as your Today routine, with a reminder 5 minutes before.
  const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const pad = n => String(n).padStart(2, '0');
  const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  function ics(days, time, minutes, now = new Date()) {
    const [h, m] = time.split(':').map(Number);
    // The first of the chosen days from today on (today only if the time is still ahead).
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    while (!days.includes(d.getDay()) || d < now) { d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0); }
    const local = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    const utc = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brass Practice//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@brass-practice`, `DTSTAMP:${utc}`,
      `DTSTART:${local(d)}`, `DURATION:PT${minutes}M`, `RRULE:FREQ=WEEKLY;BYDAY=${days.slice().sort().map(i => DAYS[i]).join(',')}`,
      `SUMMARY:${icsText('Practise ' + TP.inst().short)}`, `DESCRIPTION:${icsText('Your Brass Practice routine (' + minutes + ' min). ' + SITE)}`, `URL:${SITE}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText('Time to practise')}`, 'TRIGGER:-PT5M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
  }
  TP.practiceIcs = ics;
  function renderRemind() {
    const box = $('rmDays');
    if (!box.children.length) {
      // Monday first.
      for (const i of [1, 2, 3, 4, 5, 6, 0]) {
        const l = document.createElement('label');
        l.className = 'rm-day';
        l.innerHTML = `<input type="checkbox" value="${i}"><span>${new Date(2026, 0, 4 + i).toLocaleDateString(undefined, { weekday: 'short' })}</span>`;
        box.appendChild(l);
      }
    }
    box.querySelectorAll('input').forEach(c => { c.checked = (S.remindDays || []).includes(Number(c.value)); });
    $('rmTime').value = S.remindTime || '18:00';
  }
  $('tdRemind').addEventListener('toggle', () => { if ($('tdRemind').open) renderRemind(); });
  $('rmSave').addEventListener('click', () => {
    const days = [...$('rmDays').querySelectorAll('input:checked')].map(c => Number(c.value));
    if (!days.length) { toast('Pick at least one day.', 4000); return; }
    S.remindDays = days;
    S.remindTime = $('rmTime').value || '18:00';
    TP.save();
    TP.downloadFile(new File([ics(days, S.remindTime, S.todayMins || 20)], 'practice-reminder.ics', { type: 'text/calendar' }));
    $('tdRemind').open = false;
    toast('Open the file to add it to your calendar (on a phone it opens straight in the calendar app).', 8000);
  });
})();
