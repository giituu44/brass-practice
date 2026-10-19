// Tabs, keyboard routing and the settings dialog.
(() => {
  'use strict';
  const { S, store, save, $ } = TP;
  const valvePanel = $('valvePanel');
  let active = null;

  // One tab's bug shouldn't take the others down: log it, say so, carry on.
  function safely(what, fn) {
    try { return fn(); } catch (e) {
      console.error(e);
      TP.toast(`Something went wrong in ${what} — the rest of the app still works. (Details are in the browser console.)`, 7000);
      return undefined;
    }
  }
  TP.safely = safely;
  const tabName = id => { const b = document.querySelector(`.tab[data-tab="${id}"] span`); return b ? b.textContent : id; };
  function show(tab) {
    if (!TP.modes[tab]) tab = 'today';
    if (active) { const was = active; safely(tabName(S.tab), () => was.leave()); }
    S.tab = tab;
    save();
    for (const [id, m] of Object.entries(TP.modes)) $(m.panel).hidden = id !== tab;
    document.querySelectorAll('.tab[data-tab], .more-item').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
      if (b.classList.contains('tab')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
    });
    // On a phone, a tab from the More menu shows its name on the More button.
    const inMore = document.querySelector(`.tab.tab-more[data-tab="${tab}"]`);
    $('tabMore').classList.toggle('active', !!inMore);
    $('tabMoreLabel').textContent = inMore ? inMore.querySelector('span').textContent : 'More';
    active = TP.modes[tab];
    valvePanel.hidden = !active.valves;
    if (active.valves) $(active.panel).querySelector('.valve-slot').appendChild(valvePanel);
    TP.held.clear();
    TP.touched.clear();
    TP.resetValves();
    safely(tabName(tab), () => active.enter());
    safely(tabName(tab), () => TP.preload(active.preloadNotes()));
  }
  document.querySelectorAll('.tab[data-tab]').forEach(b => b.addEventListener('click', () => { closeMore(); show(b.dataset.tab); }));

  // ---------- phones: four tabs and a More menu for the rest ----------
  const more = $('moreSheet');
  for (const b of document.querySelectorAll('.tab.tab-more')) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'more-item';
    item.setAttribute('role', 'menuitem');
    item.dataset.tab = b.dataset.tab;
    item.innerHTML = b.innerHTML;
    item.addEventListener('click', () => { closeMore(); show(b.dataset.tab); });
    more.appendChild(item);
  }
  function closeMore() { more.hidden = true; $('tabMore').setAttribute('aria-expanded', 'false'); }
  $('tabMore').addEventListener('click', e => {
    e.stopPropagation();
    more.hidden = !more.hidden;
    $('tabMore').setAttribute('aria-expanded', String(!more.hidden));
  });
  document.addEventListener('click', e => { if (!more.hidden && !more.contains(e.target)) closeMore(); });
  TP.show = show;

  // Pop-out menus close when you click elsewhere, or press Esc.
  document.addEventListener('click', e => {
    document.querySelectorAll('details.pop[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { document.querySelectorAll('details.pop[open]').forEach(d => { d.open = false; }); closeMore(); }
  }, true);
  // Keep an opened pop-out on screen: slide it left if it would spill over the right edge.
  document.querySelectorAll('details.pop').forEach(d => d.addEventListener('toggle', () => {
    const body = d.querySelector('.pop-body');
    body.style.left = '';
    if (!d.open) return;
    const r = body.getBoundingClientRect(), room = document.documentElement.clientWidth - 8;
    if (r.right > room) body.style.left = Math.max(8 - (r.left - body.offsetLeft), room - r.width - (r.left - body.offsetLeft)) + 'px';
  }));

  // Keyboard: J K L ; are valves (held like real ones); everything else goes to the mode.
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]') || e.ctrlKey || e.metaKey || e.altKey) return;
    // Typing in a text box (the journal) is just typing; and Space or Enter on a button
    // or menu you've tabbed to works it, rather than starting the exercise.
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    // A page-turner pedal (they send Page Down / Page Up or the arrow keys): forward is
    // Space (start, check, next), back is Esc (stop). Only outside menus and buttons.
    const control = e.target.closest && e.target.closest('button, select, summary, a, label');
    let key = e.key;
    if (S.pedal !== false && !control) {
      if (key === 'PageDown' || key === 'ArrowRight') key = ' ';
      else if (key === 'PageUp' || key === 'ArrowLeft') key = 'Escape';
    }
    // Space or Enter on a button or menu you tabbed to works that control. (A menu you
    // only clicked and closed keeps focus by accident: there Space still starts.)
    if ((key === ' ' || key === 'Enter') && control && control !== mouseFocused) return;
    if (control && control === mouseFocused) control.blur();
    const k = key.toLowerCase();
    if (k === '?') { e.preventDefault(); openHelp(); return; }
    if (active.valves && TP.VALVE_KEYS[k]) {
      e.preventDefault();
      if (!e.repeat) { TP.held.add(TP.VALVE_KEYS[k]); TP.renderValves(); }
      return;
    }
    if (e.repeat && (k === ' ' || k === 'enter')) { e.preventDefault(); return; }
    if (k === 'escape' && TP.standMode && TP.standMode.on()) { e.preventDefault(); TP.standMode.set(false); return; }
    if (k === 'f' && !(active.valves && TP.VALVE_KEYS[k])) { e.preventDefault(); TP.standMode.toggle(); return; }
    if (safely(tabName(S.tab), () => active.key(k, e))) e.preventDefault();
  });
  document.addEventListener('keyup', e => {
    const v = TP.VALVE_KEYS[e.key.toLowerCase()];
    if (v) { TP.held.delete(v); TP.renderValves(); }
  });
  window.addEventListener('blur', () => { TP.held.clear(); TP.touched.clear(); TP.renderValves(); });

  // The control last focused by a click or tap (not by Tab).
  let mouseFocused = null;
  document.addEventListener('pointerdown', e => { mouseFocused = e.target.closest && e.target.closest('select, button, summary, label'); }, true);
  document.addEventListener('focusin', e => { if (e.target !== mouseFocused && !(mouseFocused && mouseFocused.contains(e.target))) mouseFocused = null; });

  // Keep focus off buttons so Space doesn't also click whatever was last pressed.
  // (Delegated, so buttons added later count too; checkboxes and selects let go after a change.)
  document.addEventListener('mousedown', e => {
    if (e.target.closest('main button, header button, main summary, header summary')) e.preventDefault();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.closest('main, header') && (t.type === 'checkbox' || t.tagName === 'SELECT')) setTimeout(() => t.blur(), 0);
  });
  $('submitBtn').addEventListener('click', () => safely(tabName(S.tab), () => active.submit()));
  $('hearBtn').addEventListener('click', () => safely(tabName(S.tab), () => active.hear()));

  // ---------- settings ----------
  const dlg = $('settings');
  const setLow = $('setLow'), setHigh = $('setHigh');
  for (const i of INSTRUMENTS.list) $('setInstrument').add(new Option(i.name, i.id));
  // Options that depend on the instrument: its range and its sounds.
  function fillInstrumentOptions() {
    setLow.textContent = '';
    setHigh.textContent = '';
    for (const m of TP.ALL_MIDI) {
      setLow.add(new Option(TP.flatLabel(m), m));
      setHigh.add(new Option(TP.flatLabel(m), m));
    }
    const tone = $('setTone');
    tone.textContent = '';
    for (const t of [...TP.inst().sounds, 'synth']) tone.add(new Option(TP.SOUND_NAMES[t], t));
    $('instBtn').textContent = TP.inst().short + ' ▾';
  }
  function fillSettings() {
    fillInstrumentOptions();
    $('setInstrument').value = S.instrument;
    $('setComp').checked = !!S.compensating;
    $('setCountIn').value = String(S.countIn || 1);
    $('setRest').value = String(S.restAfter === undefined ? 20 : S.restAfter);
    $('setHandsFree').checked = !!S.handsFree;
    $('setPedal').checked = S.pedal !== false;
    $('setCompRow').hidden = !(TP.inst().kind === 'valve' && TP.inst().valves === 4);
    setLow.value = S.low;
    setHigh.value = S.high;
    $('setSpelling').value = S.spelling;
    $('setAccept').value = S.accept;
    $('setSound').checked = S.sound;
    $('setAutoplay').checked = S.autoplay;
    $('setShowName').checked = S.showName;
    $('setTone').value = TP.tone();
    $('setAnyOctave').checked = S.micAnyOctave;
    $('setMicSens').value = S.micSens || 'normal';
    $('setMicLatency').value = S.micLatencyMs || 0;
    $('setYouSound').checked = S.youSound;
    $('setWrongSound').checked = S.wrongSound;
    $('setTiming').value = S.timing;
    $('setLatency').value = S.latencyMs;
    $('setA4').value = String(S.a4 || 440);
    $('setTheme').value = S.theme;
    $('setAwake').checked = !!S.keepAwake;
    $('setCB').checked = !!S.cbColors;
    renderKeybinds();
  }

  // ---------- keys and theme ----------
  let rebinding = null;
  function renderKeybinds() {
    const box = $('setKeys');
    box.textContent = '';
    S.valveKeys.forEach((k, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'keybind' + (rebinding === i ? ' waiting' : '');
      b.textContent = rebinding === i ? 'press…' : `${i + 1}: ${k === ' ' ? 'Space' : k.toUpperCase()}`;
      b.addEventListener('click', () => { rebinding = i; renderKeybinds(); });
      box.appendChild(b);
    });
  }
  // ---------- calibrate the audio offset: tap along to clicks ----------
  let cal = null;
  $('calBtn').addEventListener('click', async () => {
    if (cal) return;
    const ctx = TP.audio();
    await ctx.resume();
    const r = TP.makeRun(), BEAT = 0.6, LEAD = 4, TAPS = 8;
    const t0 = ctx.currentTime + 0.5;
    const clicks = [];
    $('calBox').hidden = false;
    $('calDots').innerHTML = '<span class="dot"></span>'.repeat(4);
    const dots = [...$('calDots').children];
    for (let i = 0; i < LEAD + TAPS; i++) {
      const t = t0 + i * BEAT;
      r.click(t, i % 4 === 0);
      r.at(t, () => dots.forEach((d, j) => d.classList.toggle('on', j === i % 4)));
      if (i >= LEAD) clicks.push(t);
    }
    $('calMsg').innerHTML = 'Listen for 4 clicks, then tap <kbd>Space</kbd> exactly on each of the next 8.';
    cal = { taps: [], clicks };
    r.at(t0 + (LEAD + TAPS) * BEAT, () => {
      // How far behind the clicks your taps landed, measured the way the app hears them.
      const offs = [];
      for (const tap of cal.taps) {
        const near = clicks.reduce((a, c) => (Math.abs(c - tap) < Math.abs(a - tap) ? c : a));
        if (Math.abs(near - tap) < 0.3) offs.push(tap - near);
      }
      dots.forEach(d => d.classList.remove('on'));
      cal = null;
      if (offs.length < 5) { $('calMsg').textContent = 'Not enough taps landed near the clicks — try again.'; return; }
      offs.sort((a, b) => a - b);
      const ms = Math.max(-100, Math.min(400, Math.round(offs[offs.length >> 1] * 100) * 10));
      S.latencyMs = ms;
      $('setLatency').value = ms;
      save();
      $('calMsg').textContent = `Done — offset set to ${ms} ms.` + (ms > 80 ? ' (Bluetooth headphones? Wired ones are much tighter.)' : '');
    });
  });
  dlg.addEventListener('keydown', e => {
    if (cal && !e.repeat && (e.key === ' ' || TP.VALVE_KEYS[e.key.toLowerCase()])) {
      e.preventDefault();
      cal.taps.push(TP.heardTime(e.timeStamp));
      return;
    }
  }, true);
  dlg.addEventListener('close', () => { $('calBox').hidden = true; });

  // ---------- the mic: level meter, and its delay measured by playing on clicks ----------
  // The mic only stays on after Settings if you're answering with it or in the Tuner.
  const micStillNeeded = () => S.input === 'mic' || S.tab === 'tuner' || S.tab === 'warmup';
  async function micOn() {
    if (TP.mic.active) return true;
    try { await TP.mic.start(); return true; } catch (e) { $('micMeterTxt').textContent = TP.micError(e); return false; }
  }
  const dB = rms => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(rms, 1e-6)) + 66) / 60));
  TP.mic.on(r => {
    if (!dlg.open) return;
    const playing = r.rms >= TP.mic.gate();
    $('micMeter').style.width = dB(r.rms) * 100 + '%';
    $('micMeter').classList.toggle('quiet', !playing);
    $('micMeterGate').style.left = dB(TP.mic.gate()) * 100 + '%';
    if (!micCal) {
      $('micMeterTxt').textContent = r.midi !== null ? `Hearing ${TP.label(TP.spell(r.midi, 'flats'))} — good.`
        : playing ? 'Hearing sound, but no clear note.' : 'Quiet. Play a note: the bar should pass the line.';
    }
  });
  $('micTestBtn').addEventListener('click', async () => {
    if (TP.mic.active && $('micTestBtn').dataset.mine) {
      TP.mic.stop(); delete $('micTestBtn').dataset.mine;
      $('micTestBtn').textContent = 'Test mic'; $('micMeter').style.width = '0'; $('micMeterTxt').textContent = '';
      return;
    }
    if (!TP.mic.active && await micOn()) { $('micTestBtn').dataset.mine = '1'; $('micTestBtn').textContent = 'Stop test'; }
  });

  let micCal = null;
  $('micCalBtn').addEventListener('click', async () => {
    if (micCal || cal) return;
    if (!await micOn()) return;
    const ctx = TP.audio();
    await ctx.resume();
    const r = TP.makeRun(), BEAT = 0.75, LEAD = 4, NOTES = 8;
    const t0 = ctx.currentTime + 0.6, clicks = [];
    $('micCalBox').hidden = false;
    $('micCalDots').innerHTML = '<span class="dot"></span>'.repeat(4);
    const dots = [...$('micCalDots').children];
    for (let i = 0; i < LEAD + NOTES; i++) {
      const t = t0 + i * BEAT;
      r.click(t, i % 4 === 0);
      r.at(t, () => dots.forEach((d, j) => d.classList.toggle('on', j === i % 4)));
      if (i >= LEAD) clicks.push(t);
    }
    $('micCalMsg').innerHTML = '<b>Headphones on</b> (so the mic doesn’t hear the clicks). Listen to 4 clicks, then play a short, tongued note exactly on each of the next 8 — any note.';
    micCal = { readings: [] };
    r.at(t0 + (LEAD + NOTES) * BEAT + 0.4, () => {
      const rs = micCal.readings;
      micCal = null;
      dots.forEach(d => d.classList.remove('on'));
      // Note starts that really were notes (a pitch on your instrument follows), against the nearest click.
      const offs = [];
      for (const s of TP.mic.noteStarts(rs, m => !!FINGERINGS[m])) {
        const near = clicks.reduce((a, c) => (Math.abs(c - s) < Math.abs(a - s) ? c : a));
        if (Math.abs(near - s) < 0.35) offs.push(s - near);
      }
      if (!micStillNeeded() && !$('micTestBtn').dataset.mine) TP.mic.stop();
      if (offs.length < 5) {
        $('micCalMsg').textContent = `Only ${offs.length} of 8 notes were heard near the clicks — try again (louder, shorter notes; check Mic sensitivity).`;
        return;
      }
      offs.sort((a, b) => a - b);
      const ms = Math.max(-100, Math.min(400, (S.micLatencyMs || 0) + Math.round(offs[offs.length >> 1] * 200) * 5));
      S.micLatencyMs = ms;
      $('setMicLatency').value = ms;
      save();
      $('micCalMsg').textContent = `Done — mic delay set to ${ms} ms (from ${offs.length} notes).`;
    });
  });
  TP.mic.on(r => { if (micCal) micCal.readings.push(r); });
  dlg.addEventListener('close', () => {
    $('micCalBox').hidden = true;
    if ($('micTestBtn').dataset.mine) { delete $('micTestBtn').dataset.mine; $('micTestBtn').textContent = 'Test mic'; if (!micStillNeeded()) TP.mic.stop(); }
    $('micMeter').style.width = '0';
    $('micMeterTxt').textContent = '';
  });
  dlg.addEventListener('keydown', e => {
    if (rebinding === null) return;
    e.preventDefault();
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if (k !== 'escape' && k.length === 1 && k !== ' ' && !/[0-9?+=-]/.test(k)) {
      // A key used by another valve swaps places with it.
      const other = S.valveKeys.indexOf(k);
      if (other >= 0) S.valveKeys[other] = S.valveKeys[rebinding];
      S.valveKeys[rebinding] = k;
      save();
      TP.buildInputs();
    }
    rebinding = null;
    renderKeybinds();
  });
  function applyTheme() {
    if (S.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = S.theme;
    if (S.cbColors) document.documentElement.dataset.cb = '1'; else delete document.documentElement.dataset.cb;
  }
  applyTheme();
  const openSettings = () => { if (active) active.leave(); fillSettings(); dlg.showModal(); };
  // Settings in sections, one at a time.
  function settingsSection(sec) {
    dlg.querySelectorAll('.set-seg button').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
    dlg.querySelectorAll('.set-sec').forEach(d => { d.hidden = d.dataset.sec !== sec; });
  }
  dlg.querySelector('.set-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) settingsSection(b.dataset.sec); });
  TP.openSettings = sec => { openSettings(); if (sec) settingsSection(sec); };
  $('settingsBtn').addEventListener('click', openSettings);
  $('instBtn').addEventListener('click', () => { openSettings(); $('setInstrument').focus(); });
  dlg.addEventListener('change', e => {
    if (e.target.id === 'setInstrument') {
      TP.applyInstrument(e.target.value);
      fillSettings();
      return;
    }
    let lo = Number(setLow.value), hi = Number(setHigh.value);
    if (lo > hi) [lo, hi] = [hi, lo];
    Object.assign(S, {
      low: lo, high: hi,
      spelling: $('setSpelling').value,
      accept: $('setAccept').value,
      sound: $('setSound').checked,
      autoplay: $('setAutoplay').checked,
      showName: $('setShowName').checked,
      tone: $('setTone').value,
      micAnyOctave: $('setAnyOctave').checked,
      compensating: $('setComp').checked,
      countIn: Number($('setCountIn').value),
      restAfter: Number($('setRest').value),
      handsFree: $('setHandsFree').checked,
      pedal: $('setPedal').checked,
      micSens: $('setMicSens').value,
      micLatencyMs: Math.max(-100, Math.min(400, Number($('setMicLatency').value) || 0)),
      youSound: $('setYouSound').checked,
      wrongSound: $('setWrongSound').checked,
      timing: $('setTiming').value,
      latencyMs: Math.max(-100, Math.min(400, Number($('setLatency').value) || 0)),
      theme: $('setTheme').value,
      keepAwake: $('setAwake').checked,
      cbColors: $('setCB').checked,
      a4: Number($('setA4').value) || 440,
    });
    applyTheme();
    if (TP.standMode) TP.standMode.wake();
    S.ranges[S.instrument] = { low: lo, high: hi };
    save();
  });
  dlg.addEventListener('close', () => {
    fillSettings();
    active.enter();
    active.settingsChanged();
    TP.preload(active.preloadNotes());
  });
  $('resetBtn').addEventListener('click', () => {
    if (!confirm(`Clear your note, scale and piece stats for ${TP.inst().short}?`)) return;
    for (const f of ['notes', 'scales', 'pieces']) for (const k of Object.keys(store[f])) delete store[f][k];
    save();
  });
  fillInstrumentOptions();

  // ---------- backup ----------
  $('backupBtn').addEventListener('click', () => {
    store.lastBackup = Date.now();
    save();
    const blob = new Blob([JSON.stringify({ app: 'brass-practice', version: 1, saved: new Date().toISOString(), data: JSON.parse(TP.serialize()) }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brass-practice-backup-${TP.dayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  $('restoreBtn').addEventListener('click', () => $('restoreInput').click());
  $('restoreInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'brass-practice' || !d.data || !d.data.settings) throw new Error('not a backup');
      if (!confirm(`Restore the backup from ${new Date(d.saved).toLocaleString()}? This replaces your current progress.`)) return;
      localStorage.setItem('tuba-practice-v1', JSON.stringify(d.data));
      location.reload();
    } catch (err) {
      TP.toast('That file isn’t a Brass Practice backup.', 5000);
    }
  });

  // ---------- toast ----------

  // ---------- a nudge to back up now and then ----------
  // Progress lives only in this browser, so after a week of practice days without
  // a backup, say so (at most once a day).
  {
    const since = Object.keys(store.days).filter(k => store.days[k].n && new Date(k + 'T23:59:59').getTime() > (store.lastBackup || 0)).length;
    if (Object.keys(store.days).length >= 5 && since >= 7 && store.backupNag !== TP.dayKey()) {
      store.backupNag = TP.dayKey();
      save();
      setTimeout(() => TP.toast(`${since} practice days since your last backup. ⚙ Settings → ⬇ Back up keeps a copy of your progress.`, 9000), 1500);
    }
  }

  // ---------- microphone input ----------
  function renderInput() {
    const mic = S.input === 'mic';
    $('micBtn').classList.toggle('on', mic);
    $('micBtn').setAttribute('aria-pressed', mic);
    $('keysSeg').classList.toggle('on', !mic);
    $('keysSeg').setAttribute('aria-pressed', !mic);
    valvePanel.classList.toggle('mic', mic);
    if (!mic) $('micLive').textContent = 'Mic';
    else if (!TP.mic.active) $('micLive').textContent = 'Mic';
  }
  async function setInput(mode) {
    if (mode === 'mic') {
      try {
        await TP.mic.start();
      } catch (e) {
        TP.toast(TP.micError(e), 7000);
        mode = 'valves';
      }
    } else if (S.tab !== 'tuner' && S.tab !== 'warmup') {
      TP.mic.stop();
    }
    S.input = mode;
    save();
    renderInput();
    if (mode === 'mic') TP.toast('Listening — play the notes on your tuba. Click 🎤 again to go back to valves.');
    if (active) { active.leave(); active.enter(); }
  }
  $('micBtn').addEventListener('click', () => { if (S.input !== 'mic') setInput('mic'); });
  $('keysSeg').addEventListener('click', () => { if (S.input === 'mic') setInput('valves'); });
  TP.mic.on(r => {
    if (S.input !== 'mic') return;
    if (r.midi === null) { $('micLive').textContent = '…'; return; }
    const n = TP.spell(r.midi, 'flats');
    $('micLive').textContent = TP.label(n) + (Math.abs(r.cents) > 15 ? (r.cents > 0 ? ' ↑' : ' ↓') : '');
  });

  // ---------- hands-free start: with the mic, a short note starts the exercise ----------
  // A tab that can start this way says when it's ready (autoStart). A note of at least
  // 0.15 s, then a quarter-second of quiet, starts it — but not the last note of a run
  // that just ended (the tab has to have been ready for a moment first).
  const hf = { since: null, last: 0, readySince: null };
  TP.startHint = () => (S.handsFree && S.input === 'mic' ? ' (or play a short note)' : '');
  TP.mic.on(r => {
    const ready = S.handsFree && S.input === 'mic' && active && active.autoStart && !document.querySelector('dialog[open]') && safely(tabName(S.tab), () => active.autoStart());
    if (!ready) { hf.since = null; hf.readySince = null; return; }
    if (hf.readySince === null) hf.readySince = r.t;
    if (r.midi !== null) {
      if (hf.since === null) hf.since = r.t;
      hf.last = r.t;
      return;
    }
    if (hf.since === null) return;
    if (hf.since >= hf.readySince + 0.5 && hf.last - hf.since >= 0.15 && r.t - hf.last >= 0.25) {
      hf.since = null;
      hf.readySince = null;
      safely(tabName(S.tab), () => active.submit());
    } else if (r.t - hf.last > 1) hf.since = null;
  });

  // ---------- practice log ----------
  function renderProgress() {
    const p = TP.progress();
    $('progress').textContent = p.streak || p.minutes ? `🔥 ${p.streak} · ${p.minutes} min` : '';
    $('progress').title = `${p.streak} day${p.streak === 1 ? '' : 's'} in a row · ${p.minutes} min and ${p.today} answers today`;
  }
  TP.onProgress(renderProgress);

  // ---------- help ----------
  function openHelp() {
    if (active) active.leave();
    $('help').showModal();
  }
  $('helpBtn').addEventListener('click', openHelp);
  $('help').addEventListener('close', () => {
    if (!S.seenHelp) { S.seenHelp = true; save(); }
    active.enter();
  });

  // The audio context can only start after a click or key press; so does the mic.
  const warm = () => {
    TP.audio();
    TP.preload(active.preloadNotes());
    if (S.input === 'mic' && !TP.mic.active) {
      TP.mic.start().then(renderInput, e => { TP.toast(TP.micError(e), 7000); setInput('valves'); });
    }
  };
  document.addEventListener('pointerdown', warm, { once: true });
  document.addEventListener('keydown', warm, { once: true });

  // ---------- first visit: a short welcome instead of the whole guide ----------
  function wcKeys() {
    const i = TP.inst();
    const keys = i.kind === 'slide' ? ['1', '2', '3', '4', '5', '6', '7'] : S.valveKeys.slice(0, i.valves);
    $('wcKeys').innerHTML = keys.map(k => `<kbd>${k === ';' ? ';' : k.toUpperCase()}</kbd>`).join('');
    $('wcKeysSub').textContent = i.kind === 'slide'
      ? 'Hold a number for the slide position, or play into the mic (🎤).'
      : `Hold them like real valves (1–${i.valves}), tap the pistons on screen, or play into the mic (🎤).`;
  }
  function openWelcome() {
    if (active) active.leave();
    const sel = $('wcInst');
    if (!sel.options.length) for (const i of INSTRUMENTS.list) sel.add(new Option(i.name, i.id));
    sel.value = S.instrument;
    wcKeys();
    $('welcome').showModal();
  }
  let wcChanged = false;
  $('wcInst').addEventListener('change', e => {
    TP.applyInstrument(e.target.value);
    renderInput();
    wcKeys();
    wcChanged = true;
  });
  $('welcome').addEventListener('close', () => {
    S.seenHelp = true;
    save();
    if (wcChanged) {
      // Same as closing Settings after switching instrument.
      wcChanged = false;
      active.enter();
      active.settingsChanged();
      TP.preload(active.preloadNotes());
    }
    const how = $('welcome').returnValue;
    if (how === 'tour') { openHelp(); return; }
    if (how === 'go') { show('today'); return; }
    active.enter();
  });

  renderInput();
  renderProgress();
  show(S.tab);
  if (!S.seenHelp) openWelcome();
})();
