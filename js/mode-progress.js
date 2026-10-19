// Progress: the long view. Minutes per week over months, personal records, how the
// tempo of each piece has come along, your tuning over time, recent journal notes —
// and a one-page weekly report to show a teacher.
(() => {
  'use strict';
  const { S, store, $ } = TP;
  const DAY = 86400000;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (d, o = { month: 'short', day: 'numeric' }) => new Date(d).toLocaleDateString(undefined, o);
  const keyOf = d => TP.dayKey(d);
  const dateOf = k => new Date(k + 'T12:00:00');

  // ---------- numbers from the practice log ----------
  function days() { return Object.keys(store.days).filter(k => store.days[k].n).sort(); }
  function streaks() {
    let longest = 0, run = 0, prev = null;
    for (const k of days()) {
      run = prev && (dateOf(k) - dateOf(prev)) / DAY < 1.5 ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = k;
    }
    return { longest, current: TP.progress().streak };
  }
  // Monday of the week a date falls in.
  function monday(d) { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function weeks(n) {
    const out = [], start = monday(new Date());
    for (let w = n - 1; w >= 0; w--) {
      const from = new Date(start); from.setDate(from.getDate() - 7 * w);
      let min = 0;
      for (let i = 0; i < 7; i++) { const d = new Date(from); d.setDate(d.getDate() + i); const r = store.days[keyOf(d)]; if (r) min += r.sec / 60; }
      out.push({ from, min: Math.round(min) });
    }
    return out;
  }
  const titleOf = id => {
    const lib = LIBRARY.find(p => p.id === id);
    if (lib) return lib.title;
    const mine = (store.myPieces || []).find(p => p.id === id);
    if (mine) return mine.title;
    if (/^sight-/.test(id)) return 'Sight-reading level ' + id.slice(-1);
    if (/^slur:/.test(id)) return 'Lip slurs';
    return id;
  };
  function records() {
    const rec = [];
    const st = streaks();
    rec.push(['Longest streak', `${st.longest} day${st.longest === 1 ? '' : 's'}`]);
    const top = days().reduce((b, k) => (!b || store.days[k].sec > store.days[b].sec ? k : b), null);
    if (top) rec.push(['Most in one day', `${Math.round(store.days[top].sec / 60)} min (${fmt(dateOf(top))})`]);
    const lt = Object.entries(store.longTones || {}).sort((a, b) => b[1] - a[1])[0];
    if (lt) rec.push(['Longest long tone', `${lt[1]} s on ${TP.flatLabel(Number(lt[0]))}`]);
    const r = store.rangeRec || {};
    if (r.top !== undefined || r.bottom !== undefined) rec.push(['Range (clean)', `${r.bottom !== undefined ? TP.flatLabel(r.bottom) : '?'} – ${r.top !== undefined ? TP.flatLabel(r.top) : '?'}`]);
    const sc = Object.entries(store.scales || {}).filter(([, v]) => v.flowBest).sort((a, b) => b[1].flowBest - a[1].flowBest)[0];
    if (sc) rec.push(['Fastest clean scale', `${sc[0].replace(/ (\d)$/, ', $1 oct.').replace('b ', '♭ ').replace('# ', '♯ ')} at ${sc[1].flowBest} bpm`]);
    const three = Object.values(store.pieces || {}).filter(p => p.best >= 95).length;
    rec.push(['Pieces at ★★★', String(three)]);
    const ec = Object.entries(store.echo || {}).filter(([, v]) => v.right).map(([l, v]) => `level ${l}: ${v.right}/${v.tries}`);
    if (ec.length) rec.push(['Echo phrases', ec.join(' · ')]);
    return rec;
  }
  // Pieces you've played more than once: where the tempo and score started and are now.
  function tempos() {
    return Object.entries(store.pieceHist || {}).filter(([, h]) => h.length >= 2)
      .map(([id, h]) => ({ id, runs: h.length, first: h[0], last: h[h.length - 1], best: h.reduce((b, x) => (x.pct > b.pct || (x.pct === b.pct && x.bpm > b.bpm) ? x : b)) }))
      .sort((a, b) => b.last.at - a.last.at).slice(0, 10);
  }
  function tuning() {
    const d = store.intonation || {}, twice = Object.keys(d).filter(m => d[m].hist && d[m].hist.length > 1);
    const avg = xs => Math.round(xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length);
    const worst = Object.keys(d).filter(m => d[m].c !== undefined && Math.abs(d[m].c) > 10).sort((a, b) => Math.abs(d[b].c) - Math.abs(d[a].c)).slice(0, 5);
    return {
      trend: twice.length >= 3 ? { now: avg(twice.map(m => d[m].c)), first: avg(twice.map(m => d[m].hist[0].c)), n: twice.length } : null,
      worst: worst.map(m => `${TP.flatLabel(Number(m))} ${d[m].c > 0 ? '+' : ''}${d[m].c}¢ on ${TP.fmtFingering(d[m].f)}`),
    };
  }

  // ---------- the page ----------
  function chart() {
    const ws = weeks(16), W = 640, H = 150, L = 32, B = 22;
    const max = Math.max(30, ...ws.map(w => w.min));
    const bw = (W - L - 8) / ws.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="prog-chart" role="img" aria-label="Minutes practised per week, last 16 weeks">`;
    for (const v of [0, Math.round(max / 2), max]) {
      const y = H - B - (v / max) * (H - B - 10);
      s += `<line x1="${L}" x2="${W - 4}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 5}" y="${y + 3.5}" text-anchor="end" class="axis">${v}</text>`;
    }
    ws.forEach((w, i) => {
      const h = (w.min / max) * (H - B - 10), x = L + i * bw + 3;
      s += `<g><rect x="${x}" y="${H - B - h}" width="${bw - 6}" height="${Math.max(h, w.min ? 2 : 0)}" rx="3" class="bar${i === ws.length - 1 ? ' now' : ''}"/><title>Week of ${fmt(w.from)}: ${w.min} min</title></g>`;
      if (i % 2 === ws.length % 2 || i === ws.length - 1) s += `<text x="${x + (bw - 6) / 2}" y="${H - 6}" text-anchor="middle" class="axis">${fmt(w.from)}</text>`;
    });
    return s + '</svg>';
  }
  // Notes mastered, day by day (a snapshot is kept on each day you practise).
  function notesChart() {
    const snap = store.snap || {}, keys = Object.keys(snap).sort().slice(-90);
    if (keys.length < 2) return '<p class="sub">Practise the note drill on a few different days and your trend shows here.</p>';
    const W = 640, H = 130, L = 32, B = 20, total = Math.max(...keys.map(k => snap[k].total), 1);
    const t0 = dateOf(keys[0]).getTime(), t1 = Math.max(t0 + DAY, dateOf(keys[keys.length - 1]).getTime());
    const x = k => L + (dateOf(k).getTime() - t0) / (t1 - t0) * (W - L - 10), y = v => H - B - (v / total) * (H - B - 10);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="prog-chart" role="img" aria-label="Notes mastered over time">`;
    for (const v of [0, Math.round(total / 2), total]) s += `<line x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end" class="axis">${v}</text>`;
    s += `<polyline points="${keys.map(k => `${x(k)},${y(snap[k].mastered)}`).join(' ')}" class="trend"/>`;
    for (const k of keys) s += `<circle cx="${x(k)}" cy="${y(snap[k].mastered)}" r="3" class="trend-dot"><title>${fmt(dateOf(k))}: ${snap[k].mastered} of ${snap[k].total}</title></circle>`;
    s += `<text x="${L}" y="${H - 5}" class="axis">${fmt(dateOf(keys[0]))}</text><text x="${W - 10}" y="${H - 5}" text-anchor="end" class="axis">${fmt(dateOf(keys[keys.length - 1]))}</text>`;
    const first = snap[keys[0]].mastered, last = snap[keys[keys.length - 1]].mastered;
    return s + `</svg><p class="sub tight">${last} of ${snap[keys[keys.length - 1]].total} now${last !== first ? `, ${last > first ? 'up' : 'down'} from ${first} on ${fmt(dateOf(keys[0]))}` : ''}.</p>`;
  }

  function render() {
    const ds = days(), total = ds.reduce((a, k) => a + store.days[k].sec, 0) / 60, st = streaks();
    $('prSummary').innerHTML = [
      ['Practised', `${Math.round(total)} min`], ['Days', String(ds.length)], ['Streak', `${st.current} (best ${st.longest})`],
      ['Average day', ds.length ? `${Math.round(total / ds.length)} min` : '–'],
    ].map(([a, b]) => `<div class="stat"><span class="stat-name">${a}</span><span class="stat-val">${b}</span></div>`).join('');
    $('prWeeks').innerHTML = chart();
    $('prRecords').innerHTML = records().map(([a, b]) => `<tr><th>${a}</th><td>${esc(b)}</td></tr>`).join('');
    const tp = tempos();
    $('prTempos').innerHTML = tp.length
      ? '<tr><th>Piece</th><th>Runs</th><th>First</th><th>Latest</th><th>Best</th></tr>' + tp.map(t => `<tr><td>${esc(titleOf(t.id))}</td><td>${t.runs}</td><td>${t.first.pct}% · ${t.first.bpm}</td><td>${t.last.pct}% · ${t.last.bpm}</td><td>${t.best.pct}% · ${t.best.bpm}</td></tr>`).join('')
      : '<tr><td class="sub">Play a piece a few times and its tempo history shows here.</td></tr>';
    const tu = tuning();
    $('prTuning').innerHTML = (tu.trend ? `<p>On the ${tu.trend.n} notes measured more than once: <b>${tu.trend.now}¢</b> off on average now, ${tu.trend.first}¢ the first time.</p>` : '<p class="sub">Measure the intonation map (Tuner) on two different days to see a trend.</p>')
      + (tu.worst.length ? `<p class="sub tight">Furthest out: ${tu.worst.map(esc).join(' · ')}</p>` : '');
    const J = TP.journal ? TP.journal.days : {};
    const notes = Object.keys(J).sort().reverse().slice(0, 5);
    $('prJournal').innerHTML = notes.length ? notes.map(k => `<p><b>${fmt(dateOf(k), { weekday: 'short', month: 'short', day: 'numeric' })}</b> ${esc(J[k].text.trim())}</p>`).join('') : '<p class="sub">Notes you write on the Today page show here.</p>';
    $('prInst').textContent = TP.inst().short;
    $('prNotes').innerHTML = notesChart();
  }

  // ---------- the weekly report ----------
  function report() {
    const end = new Date(), start = new Date(end); start.setDate(start.getDate() - 6);
    const dayRows = [], done = {}, pieces = {};
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const r = store.days[keyOf(d)], m = r ? Math.round(r.sec / 60) : 0;
      total += m;
      dayRows.push(`<tr><td>${fmt(d, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>${m ? m + ' min' : r && r.n ? '< 1 min' : '—'}</td></tr>`);
      for (const [k, v] of Object.entries((r && r.done) || {})) done[k] = (done[k] || 0) + v;
    }
    for (const [id, h] of Object.entries(store.pieceHist || {})) {
      const wk = h.filter(x => x.at >= start.getTime() - DAY / 2);
      if (wk.length) pieces[id] = { runs: wk.length, best: Math.max(...wk.map(x => x.pct)), bpm: [Math.min(...wk.map(x => x.bpm)), Math.max(...wk.map(x => x.bpm))] };
    }
    const scales = Object.keys(done).filter(k => /^scale:/.test(k)).map(k => k.slice(6).replace(/ 1$/, '').replace(/ 2$/, ', 2 octaves'));
    const weak = Object.entries(store.notes || {}).filter(([, s]) => s.seen >= 3).sort((a, b) => a[1].ema - b[1].ema).slice(0, 5)
      .map(([m, s]) => `${TP.flatLabel(Number(m))} (${Math.round(s.ema * 100)}%)`);
    const tu = tuning();
    const J = TP.journal ? TP.journal.days : {};
    const jn = Object.keys(J).filter(k => dateOf(k) >= start).sort().map(k => `<p><b>${fmt(dateOf(k), { weekday: 'short' })}</b> ${esc(J[k].text.trim())}</p>`);
    const act = [
      done.notes ? `${done.notes} notes in the fingering drill` : '', done.rhythm ? `${done.rhythm} rhythm exercises` : '',
      done.echo ? `${done.echo} echo phrases` : '', done.breathing ? `breathing ${done.breathing}×` : '', done.buzz ? `buzzing ${done.buzz}×` : '',
      done.tonguing ? `tonguing ${done.tonguing}×` : '', done.sight ? `sight-reading ${done.sight}×` : '',
    ].filter(Boolean);
    const pr = Object.entries(pieces).sort((a, b) => b[1].runs - a[1].runs)
      .map(([id, p]) => `<tr><td>${esc(titleOf(id))}</td><td>${p.runs}</td><td>${p.best}%</td><td>${p.bpm[0] === p.bpm[1] ? p.bpm[0] : p.bpm[0] + '–' + p.bpm[1]} bpm</td></tr>`);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Practice report — week of ${fmt(start)}</title>
<style>body{font:15px/1.5 system-ui,sans-serif;color:#1d1c1a;max-width:760px;margin:24px auto;padding:0 16px}h1{font-size:22px;margin:0}h2{font-size:16px;margin:22px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:3px 10px 3px 0;border-bottom:1px solid #eee;vertical-align:top}.sub{color:#666}.print{float:right}@media print{.print{display:none}}</style></head><body>
<button class="print" onclick="print()">Print / save as PDF</button>
<h1>Practice report</h1><p class="sub">${esc(TP.inst().name)} · ${fmt(start, { month: 'long', day: 'numeric' })} – ${fmt(end, { month: 'long', day: 'numeric', year: 'numeric' })} · from Brass Practice</p>
<h2>Time: ${total} minutes</h2><table>${dayRows.join('')}</table>
<h2>Pieces and studies</h2>${pr.length ? `<table><tr><th>Piece</th><th>Runs</th><th>Best</th><th>Tempo</th></tr>${pr.join('')}</table>` : '<p class="sub">None this week.</p>'}
<h2>Scales</h2><p>${scales.length ? scales.map(esc).join(' · ') : '<span class="sub">None this week.</span>'}</p>
<h2>Other practice</h2><p>${act.length ? act.join(' · ') : '<span class="sub">—</span>'}</p>
<h2>Notes that need work</h2><p>${weak.length ? 'Fingering drill, lowest recent accuracy: ' + weak.join(' · ') : '<span class="sub">Not enough drill data yet.</span>'}</p>
<h2>Tuning</h2><p>${tu.worst.length ? 'Furthest from in tune (intonation map): ' + tu.worst.map(esc).join(' · ') : '<span class="sub">No intonation map yet.</span>'}${tu.trend ? `<br>Average ${tu.trend.now}¢ off now, ${tu.trend.first}¢ at first.` : ''}</p>
<h2>Journal</h2>${jn.length ? jn.join('') : '<p class="sub">No notes this week.</p>'}
</body></html>`;
  }
  function openReport() {
    const html = report();
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); return; }
    downloadReport();
  }
  function downloadReport() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([report()], { type: 'text/html' }));
    a.download = `practice-report-${TP.dayKey()}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  $('prReport').addEventListener('click', openReport);
  $('prReportSave').addEventListener('click', downloadReport);
  TP.weeklyReport = report;

  TP.modes.progress = {
    panel: 'panel-progress',
    valves: false,
    enter: render,
    leave() {},
    settingsChanged: render,
    preloadNotes: () => [],
    key() { return false; },
  };
})();
