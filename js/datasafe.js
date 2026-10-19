// Keeping your progress safe. It lives in this browser's storage, which a browser may
// clear: when the device runs short of space, or (Safari on iPhone and iPad) after 7 days
// without a visit unless the app is on the Home Screen. So: ask the browser to keep it,
// keep a copy of each day's progress (the last 7), and make moving it to another device easy.
(() => {
  'use strict';
  const { store, $, toast } = TP;
  const KEY = 'tuba-practice-v1', KEEP = 7;
  const fmt = at => new Date(at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // ---------- the backup file (Settings → Back up, and Send) ----------
  TP.backupFile = () => {
    store.lastBackup = Date.now();
    TP.save();
    const text = JSON.stringify({ app: 'brass-practice', version: 1, saved: new Date().toISOString(), data: JSON.parse(TP.serialize()) }, null, 1);
    return new File([text], `brass-practice-backup-${TP.dayKey()}.json`, { type: 'application/json' });
  };
  function download(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  TP.downloadFile = download;
  // Phones and tablets: the share sheet (AirDrop, email to yourself, a cloud drive…).
  $('dsSend').addEventListener('click', async () => {
    const file = TP.backupFile();
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Brass Practice backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    download(file);
    toast('Saved the backup file. Get it to your other device (email it to yourself, or a cloud drive), then open Settings → ⬆ Restore there.', 10000);
  });

  // ---------- asking the browser to keep it ----------
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const homeScreen = navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const can = name => !!(navigator.storage && navigator.storage[name]);
  async function persisted() { try { return can('persisted') ? await navigator.storage.persisted() : null; } catch (e) { return null; } }
  async function persist() { try { return can('persist') ? await navigator.storage.persist() : null; } catch (e) { return null; } }
  async function renderKeep(justAsked) {
    const box = $('dsKeep'), kept = await persisted();
    const bits = [];
    if (kept) bits.push('✓ This browser has agreed to keep your progress (it won’t clear it to make space).');
    else if (kept === false) {
      bits.push(justAsked ? 'The browser said not yet — they agree more readily once you use a site often, or install it. Back up now and then.'
        : 'This browser may clear your progress if the device runs short of space. <button type="button" class="link-btn" id="dsAsk">Ask it to keep it</button>');
    } else bits.push('Back up now and then: this browser doesn’t say whether it will keep your progress.');
    if (ios && !homeScreen) bits.push('On iPhone and iPad, Safari clears a site’s data after 7 days without a visit: add the app to your Home Screen (Share → Add to Home Screen) to keep it.');
    box.innerHTML = bits.join(' ');
    const ask = $('dsAsk');
    if (ask) ask.addEventListener('click', async () => { await persist(); renderKeep(true); });
  }
  // Once you've practised on a few days, ask (once). Firefox asks you in a pop-up, so
  // there it waits for the button in Settings instead.
  const firefox = /Firefox\//.test(navigator.userAgent);
  if (!TP.SMOKE && !firefox && !store.keepAsked && Object.keys(store.days).length >= 3) {
    persisted().then(k => { if (k === false) { store.keepAsked = TP.dayKey(); TP.save(); persist(); } });
  }

  // ---------- a copy of each day's progress ----------
  // Taken the first time the app opens each day, so each is how things stood at the end
  // of the last day you practised. Kept in this browser (IndexedDB), beside your takes.
  async function snapshot() {
    if (TP.SMOKE || !Object.keys(store.days).length) return;
    const all = await TP.takes.snapshots.list(), day = TP.dayKey();
    if (all.some(s => s.day === day)) return;
    await TP.takes.snapshots.put({ day, at: Date.now(), data: TP.serialize() });
    const daily = all.filter(s => s.day !== 'before-restore');
    for (const s of daily.slice(KEEP - 1)) await TP.takes.snapshots.remove(s.day);
  }
  let snaps = [];
  async function renderSnaps() {
    try { snaps = await TP.takes.snapshots.list(); } catch (e) { snaps = []; }
    $('dsSnapRow').hidden = !snaps.length;
    const sel = $('dsSnaps');
    sel.textContent = '';
    for (const s of snaps) sel.add(new Option(s.day === 'before-restore' ? `Just before you last went back (${fmt(s.at)})` : fmt(s.at), s.day));
  }
  $('dsRestore').addEventListener('click', async () => {
    const s = snaps.find(x => x.day === $('dsSnaps').value);
    if (!s) return;
    if (!confirm(`Go back to your progress as it was on ${fmt(s.at)}? Everything since then is replaced — but a copy of it is kept here, so you can come back.`)) return;
    try { await TP.takes.snapshots.put({ day: 'before-restore', at: Date.now(), data: TP.serialize() }); } catch (e) { /* go back anyway */ }
    try { localStorage.setItem(KEY, s.data); } catch (e) { toast('Couldn’t go back: the browser’s storage for this page is full or blocked.', 7000); return; }
    location.reload();
  });

  snapshot().catch(() => {}).then(renderSnaps);
  TP.renderDataSafety = () => { renderKeep(false); renderSnaps(); };
})();
