// Music-stand mode, for playing from a tablet or phone on the stand: the menus and
// toolbars go, the music gets bigger, and the screen is kept from going to sleep.
// (Settings → Look can also keep the screen on whenever the app is open.)
(() => {
  'use strict';
  const { S, $ } = TP;
  let lock = null, on = false;

  // The screen wake lock: asked for while it's wanted, given back when it isn't.
  async function wake() {
    const want = on || S.keepAwake;
    try {
      if (want && !lock && navigator.wakeLock && document.visibilityState === 'visible') {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } else if (!want && lock) {
        const l = lock;
        lock = null;
        await l.release();
      }
    } catch (e) { /* not allowed here (or unsupported): the screen may still sleep */ }
  }
  // The browser drops the lock when the page is hidden; take it back on return.
  document.addEventListener('visibilitychange', wake);

  function set(v) {
    on = !!v;
    document.body.classList.toggle('stand', on);
    $('standExit').hidden = !on;
    document.querySelectorAll('.stand-btn').forEach(b => b.setAttribute('aria-pressed', String(on)));
    wake();
    // The music is laid out for the space it has: let the open tab redraw.
    window.dispatchEvent(new Event('resize'));
    if (on) TP.toast('Stand mode: big music, no menus, screen stays on. Esc or ✕ to leave.', 4000);
  }
  $('standExit').addEventListener('click', () => set(false));
  document.querySelectorAll('.stand-btn').forEach(b => b.addEventListener('click', e => { e.currentTarget.blur(); set(!on); }));

  TP.standMode = { set, on: () => on, toggle: () => set(!on), wake };
  wake();
})();
