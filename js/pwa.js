// Offline use and installing to the home screen. Served over https (GitHub Pages) or from
// localhost, the app registers a service worker (sw.js) that keeps a copy of it and its
// sounds. Opened from disk (file://) there are no service workers, and none is needed.
(() => {
  const { $, toast } = TP;
  const sw = navigator.serviceWorker;
  const local = location.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (!sw || !(location.protocol === 'https:' || local) || TP.SMOKE) return;
  // The manifest (name, icons and colours for installing) is linked here, not in index.html:
  // opened from disk, the browser can't read it and says so in the console.
  document.head.insertAdjacentHTML('beforeend', '<link rel="manifest" href="manifest.webmanifest">');

  // The first time, say how saving for offline use is going (8 MB of sounds can take a while).
  let controlled = !!sw.controller;
  const firstTime = !controlled;
  sw.addEventListener('message', e => {
    const m = e.data || {};
    if (m.type === 'saving') toast(`Saving the app for offline use… (sounds: ${m.done} of ${m.total})`, 120000);
    if (m.type === 'saved' && firstTime) {
      toast(m.failed ? 'Saved for offline use, apart from a sound or two: they’ll be saved the first time they play.'
        : 'Saved: the app now works without the internet. Add it to your home screen to open it like an app.', 8000);
    }
  });
  sw.startMessages();

  // A new version has downloaded and is waiting: offer to reload into it.
  let reloading = false;
  function offer(worker) {
    $('updateBar').hidden = false;
    $('updateReload').onclick = () => {
      reloading = true;
      if (worker && worker.state === 'installed') worker.postMessage('skipWaiting');
      else location.reload();
    };
  }
  $('updateLater').onclick = () => { $('updateBar').hidden = true; };
  // The new version took over (after Reload, or Reload in another window): reload into it.
  // The very first install takes over quietly, as nothing on the page changes.
  sw.addEventListener('controllerchange', () => {
    if (reloading) location.reload();
    else if (controlled) offer(null);
    controlled = true;
  });

  addEventListener('load', () => {
    sw.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && sw.controller) offer(w); });
      });
      // A tablet on the stand can keep the app open for days: look for a new version on coming back to it.
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  });
})();
