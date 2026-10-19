// A guided session: today's routine, step after step, without going back to the
// Today page in between. A bar along the bottom says where you are; when a step is
// done there's a short rest (your lips need it), then the next step opens by itself.
TP.session = (() => {
  'use strict';
  const { S, $ } = TP;
  let ses = null;   // { ids, i, resting, timer, startSec }

  const steps = () => TP.todaySteps();
  const current = () => (ses ? steps().find(s => s.id === ses.ids[ses.i]) || null : null);
  const nextStep = () => (ses && ses.i + 1 < ses.ids.length ? steps().find(s => s.id === ses.ids[ses.i + 1]) : null);
  const secToday = () => (TP.store.days[TP.dayKey()] || { sec: 0 }).sec;

  function start() {
    const todo = steps().filter(s => !s.done);
    if (!todo.length) { TP.toast('Everything on today’s list is done — great work!', 5000); return; }
    end();
    ses = { ids: todo.map(s => s.id), i: 0, resting: false, timer: 0, startSec: secToday() };
    open();
  }
  function open() {
    const s = current();
    if (!s) { next(); return; }
    clearTimeout(ses.timer);
    ses.resting = false;
    s.go();
    render();
  }
  function next() {
    if (!ses) return;
    clearTimeout(ses.timer);
    ses.i++;
    if (ses.i >= ses.ids.length) { finish(); return; }
    open();
  }
  function finish() {
    const mins = Math.round((secToday() - ses.startSec) / 60), n = ses.ids.length;
    end();
    TP.show('today');
    TP.toast(`Session done — ${n} step${n === 1 ? '' : 's'}${mins ? `, ${mins} min of playing` : ''}. Nice work!`, 7000);
  }
  function end() {
    if (ses) clearTimeout(ses.timer);
    ses = null;
    render();
  }

  // When the open step is done: rest, counting down, then the next step.
  TP.onProgress(() => {
    if (!ses || ses.resting) return;
    const s = current();
    if (!s || !s.done) return;
    ses.resting = true;
    const after = nextStep();
    if (!after) { ses.timer = setTimeout(finish, 1500); render('✓ Done — that was the last step.'); return; }
    let left = S.sessionRest === undefined ? 20 : S.sessionRest;
    const tick = () => {
      if (!ses || !ses.resting) return;
      if (left <= 0) { next(); return; }
      render(`✓ Done. Rest your lips — next: ${after.title} in ${left} s`);
      left--;
      ses.timer = setTimeout(tick, 1000);
    };
    tick();
  });

  function render(text) {
    const bar = $('sessionBar');
    bar.hidden = !ses;
    document.body.classList.toggle('in-session', !!ses);
    if (!ses) return;
    const s = current();
    $('sbText').textContent = text || `Session · step ${ses.i + 1} of ${ses.ids.length}: ${s ? s.title : ''}`;
    $('sbNext').textContent = ses.resting ? 'Go now ›' : ses.i + 1 < ses.ids.length ? 'Skip ›' : 'Finish';
    $('sbNext').classList.toggle('primary', ses.resting);
  }
  $('sbNext').addEventListener('click', e => { e.currentTarget.blur(); next(); });
  $('sbEnd').addEventListener('click', e => { e.currentTarget.blur(); end(); TP.toast('Session ended.'); });

  return { start, end, next, active: () => !!ses };
})();
