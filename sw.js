// The service worker: keeps a copy of the app so it opens and plays with no internet,
// and lets it be installed (added to the home screen). js/pwa.js registers it, and only
// when the app is served over https or from localhost; opened from disk (file://) the
// app runs as before without it.
//
// The app's files are kept in a cache named after their version, and served from it
// first. A new version downloads into a new cache alongside the old one, waits, and takes
// over when you reload (the app offers to); then the old caches are deleted.
// tools/check.ps1 sets these two versions from the files' contents, so a change to any of
// them makes a new version.
const SHELL_VERSION = 'fc1d0e7ad1';
const SOUNDS_VERSION = '14015f243f';
// Several GitHub Pages sites share one origin (and so one set of caches): ours are prefixed.
const PREFIX = 'brass-practice-';
const SHELL_CACHE = PREFIX + 'shell-' + SHELL_VERSION;
const SOUND_CACHE = PREFIX + 'sounds-' + SOUNDS_VERSION;

// Everything the app loads (tools/check.ps1 checks this list against the files).
const SHELL_FILES = [
  'index.html', 'style.css', 'manifest.webmanifest', 'fingerings.js',
  'js/audition.js', 'js/core.js', 'js/datasafe.js', 'js/goals.js', 'js/import.js', 'js/instruments.js', 'js/journal.js',
  'js/library-methods.js', 'js/library.js', 'js/main.js', 'js/metronome.js', 'js/mode-chart.js',
  'js/mode-echo.js', 'js/mode-fingerings.js', 'js/mode-intonation.js', 'js/mode-pieces.js',
  'js/mode-player.js', 'js/mode-progress.js', 'js/mode-rhythm.js', 'js/mode-scales.js',
  'js/mode-today.js', 'js/mode-tuner.js', 'js/mode-warmup.js', 'js/omr.js', 'js/pieces-gen.js',
  'js/pieces-library.js', 'js/pitch.js', 'js/pwa.js', 'js/score.js', 'js/session.js', 'js/share.js',
  'js/stand.js', 'js/takes.js', 'js/warmup-sbp.js',
  'vendor/pdfjs/pdf.min.js', 'vendor/pdfjs/pdf.worker.min.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
// The sample sets, about 8 MB in all, the default tuba sound first. They're kept in their
// own cache, which only changes when they do, so a new version of the app doesn't fetch them again.
const SOUND_FILES = [
  'sounds/tuba-iowa.js', 'sounds/tuba-phil.js', 'sounds/tuba-musyng.js', 'sounds/tuba-fluid.js',
  'sounds/trombone-phil.js', 'sounds/trumpet-phil.js',
];
// The app's page, however it's asked for (./, index.html, index.html?smoke).
const PAGE = [new URL('./', location).pathname, new URL('index.html', location).pathname];

// Tells the app's open pages how saving is going (js/pwa.js shows it).
async function tell(msg) {
  for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage(msg);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    // cache: 'reload' skips the browser's own cache, so a new version never keeps an old file.
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_FILES.map(f => new Request(f, { cache: 'reload' })));
    // Sounds: only those not saved yet, one at a time so the app can show progress. One
    // that fails doesn't stop the install; it's saved the first time it's played instead.
    const sounds = await caches.open(SOUND_CACHE);
    const missing = [];
    for (const f of SOUND_FILES) if (!(await sounds.match(f))) missing.push(f);
    let done = 0, failed = 0;
    for (const f of missing) {
      await tell({ type: 'saving', done, total: missing.length });
      try {
        const res = await fetch(f, { cache: 'reload' });
        if (res.ok) await sounds.put(f, res); else failed++;
      } catch (err) { failed++; }
      done++;
    }
    await tell({ type: 'saved', failed });
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Delete other versions' caches, unless a newer version is already on its way in: it
    // may be filling its cache now, and it deletes ours when it takes over.
    if (!self.registration.installing && !self.registration.waiting) {
      for (const k of await caches.keys()) {
        if (k.startsWith(PREFIX) && k !== SHELL_CACHE && k !== SOUND_CACHE) await caches.delete(k);
      }
    }
    // Look after the page that installed us too, not only the next one.
    await self.clients.claim();
  })());
});

// "Reload" on the app's new-version notice.
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(respond(e.request, url));
});

// From this version's caches first (never another version's), else from the network.
async function respond(req, url) {
  const sound = SOUND_FILES.some(f => url.pathname.endsWith('/' + f));
  const cache = await caches.open(sound ? SOUND_CACHE : SHELL_CACHE);
  const hit = await cache.match(PAGE.includes(url.pathname) ? 'index.html' : req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (sound && res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}
