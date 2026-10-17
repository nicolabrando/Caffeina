/* Caffeina — diario del consumo di caffeina (PWA, nessuna dipendenza esterna) */
(function () {
'use strict';

const APP_VERSION = '1.0.0';
const KEY_SETTINGS = 'caffeina:settings';
const KEY_ENTRIES = 'caffeina:entries';
const IS_PREVIEW = window.CAFFEINA_PREVIEW === true;

const ICONS = ['pill', 'espresso', 'capsule', 'moka', 'mug', 'generic'];
const ICON_NAMES = { pill: 'Compressa', espresso: 'Tazzina', capsule: 'Capsula', moka: 'Moka', mug: 'Tazza', generic: 'Generico' };
const WEEKDAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
const SLOTS = [
  { name: 'Mattina', range: '6–12' },
  { name: 'Pomeriggio', range: '12–18' },
  { name: 'Sera', range: '18–24' },
  { name: 'Notte', range: '0–6' },
];

function DEFAULT_ITEMS() {
  return [
    { id: 'compressa', name: 'Compressa di caffeina', mg: 200, icon: 'pill', enabled: true },
    { id: 'espresso', name: 'Espresso al bar', mg: 80, icon: 'espresso', enabled: true },
    { id: 'capsula', name: 'Caffè in capsula', mg: 60, icon: 'capsule', enabled: true },
    { id: 'moka', name: 'Tazzina di moka', mg: 100, icon: 'moka', enabled: true },
    { id: 'americano', name: 'Caffè americano', mg: 95, icon: 'mug', enabled: true },
  ];
}
function DEFAULT_SETTINGS() {
  return { schema: 1, target: 400, halfLife: 5, bedtime: '23:00', items: DEFAULT_ITEMS() };
}

/* ----------------------------------------------------------------------
 * Utilità
 * -------------------------------------------------------------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const pad = n => String(n).padStart(2, '0');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nfInt = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toNumber(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

/* Date (tutto in ora locale) */
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(dayStartTs, n) { const d = new Date(dayStartTs); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); return d.getTime(); }
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function minutesOfDay(ts) { const d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); }
function toInputLocal(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function fromInputLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || '');
  if (!m) return NaN;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}
function bedtimeTs(bedtime, nowTs) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(bedtime || '');
  const h = m ? clamp(+m[1], 0, 23) : 23, mi = m ? clamp(+m[2], 0, 59) : 0;
  const d = new Date(startOfDay(nowTs)); d.setHours(h, mi, 0, 0);
  let ts = d.getTime(), tomorrow = false;
  if (ts <= nowTs) { ts = new Date(addDays(startOfDay(nowTs), 1)).setHours(h, mi, 0, 0); tomorrow = true; }
  return { ts, tomorrow, label: pad(h) + ':' + pad(mi) };
}

/* Formattazione */
const fmtInt = n => nfInt.format(Math.round(n));
const fmtQty = q => nf1.format(q);
const fmtTime = ts => { const d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const fmtMinutes = m => { m = Math.round(m); return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60); };
const fmtDateLong = ts => new Date(ts).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDateShort = ts => new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const fmtDateNum = ts => { const d = new Date(ts); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); };
const fmtWeekdayShort = ts => new Date(ts).toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '');
function fmtDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? h + ' h ' + r + ' min' : h + ' h';
}
function fmtAgo(ms) { return ms < 60000 ? 'adesso' : fmtDuration(ms) + ' fa'; }
function fmtAgoShort(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return m + ' min fa';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' h fa';
  const g = Math.floor(h / 24);
  return g + (g === 1 ? ' giorno fa' : ' giorni fa');
}
function iconSvg(icon, cls) {
  const name = ICONS.includes(icon) ? icon : 'generic';
  return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}

/* ----------------------------------------------------------------------
 * Persistenza (localStorage, con fallback in memoria)
 * -------------------------------------------------------------------- */
const memoryStore = {};
let storageWarned = false;
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return key in memoryStore ? memoryStore[key] : fallback;
    return JSON.parse(raw);
  } catch (e) {
    return key in memoryStore ? memoryStore[key] : fallback;
  }
}
function saveJSON(key, value) {
  memoryStore[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    if (!storageWarned) {
      storageWarned = true;
      toast('Non riesco a salvare nella memoria del browser: i dati resteranno solo finché la pagina è aperta.', { duration: 8000 });
    }
    return false;
  }
}

function normalizeItem(raw, i) {
  const it = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof it.id === 'string' && it.id ? it.id : 'item-' + i + '-' + uid(),
    name: typeof it.name === 'string' && it.name.trim() ? it.name.trim().slice(0, 40) : 'Voce ' + (i + 1),
    mg: clamp(toNumber(it.mg, 0), 0, 2000),
    icon: ICONS.includes(it.icon) ? it.icon : 'generic',
    enabled: it.enabled !== false,
  };
}
function normalizeSettings(raw) {
  const d = DEFAULT_SETTINGS();
  const s = raw && typeof raw === 'object' ? raw : {};
  const items = Array.isArray(s.items) && s.items.length ? s.items.map(normalizeItem) : d.items;
  const bedtime = /^\d{1,2}:\d{2}$/.test(s.bedtime || '') ? s.bedtime : d.bedtime;
  return {
    schema: 1,
    target: clamp(toNumber(s.target, d.target), 50, 2000),
    halfLife: clamp(toNumber(s.halfLife, d.halfLife), 1, 12),
    bedtime,
    items,
  };
}
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ts = toNumber(raw.ts, NaN);
  const mg = toNumber(raw.mg, NaN);
  if (!Number.isFinite(ts) || !Number.isFinite(mg) || mg < 0) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    ts: Math.round(ts),
    itemId: typeof raw.itemId === 'string' ? raw.itemId : '',
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : 'Voce',
    icon: ICONS.includes(raw.icon) ? raw.icon : 'generic',
    qty: clamp(toNumber(raw.qty, 1), 0.01, 100),
    mg: Math.round(clamp(mg, 0, 5000)),
    note: typeof raw.note === 'string' ? raw.note.slice(0, 80) : '',
  };
}
function normalizeEntries(raw) {
  const list = Array.isArray(raw) ? raw.map(normalizeEntry).filter(Boolean) : [];
  list.sort((a, b) => a.ts - b.ts);
  return list;
}

/* ----------------------------------------------------------------------
 * Calcoli (funzioni pure)
 * -------------------------------------------------------------------- */
function slotOf(hour) { return hour < 6 ? 3 : hour < 12 ? 0 : hour < 18 ? 1 : 2; }

function entriesOfDay(entries, dayStart) {
  const end = addDays(dayStart, 1);
  return entries.filter(e => e.ts >= dayStart && e.ts < end);
}

/* Caffeina stimata in circolo al tempo t: decadimento esponenziale con emivita in ore */
function activeAt(entries, t, halfLifeHours) {
  const hl = (halfLifeHours || 5) * 3600000;
  const horizon = hl * 10; // oltre 10 emivite il residuo è < 0,1 %
  let sum = 0;
  for (const e of entries) {
    if (e.ts > t || t - e.ts > horizon) continue;
    sum += e.mg * Math.pow(0.5, (t - e.ts) / hl);
  }
  return sum;
}

function niceCeil(v) {
  if (!(v > 0)) return 100;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const n = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 4 ? 4 : m <= 5 ? 5 : m <= 8 ? 8 : 10;
  return n * p;
}

function computeStats(entries, settings, days, nowTs) {
  const target = settings.target;
  const itemsById = new Map((settings.items || []).map(it => [it.id, it]));
  const todayStart = startOfDay(nowTs);
  const tomorrowStart = addDays(todayStart, 1);
  let fromStart;
  if (days > 0) {
    fromStart = addDays(todayStart, -(days - 1));
  } else {
    let minTs = Infinity;
    for (const e of entries) if (e.ts < minTs) minTs = e.ts;
    fromStart = minTs === Infinity ? todayStart : Math.min(startOfDay(minTs), todayStart);
  }
  const dayList = [];
  for (let t = fromStart; t <= todayStart; t = addDays(t, 1)) {
    dayList.push({ key: dayKey(t), start: t, mg: 0, count: 0, entries: [] });
  }
  const index = new Map(dayList.map(d => [d.key, d]));
  const nDays = dayList.length;
  const slotTotals = [0, 0, 0, 0];
  const hourTotals = new Array(24).fill(0), hourCounts = new Array(24).fill(0);
  const wdTotals = new Array(7).fill(0), wdDays = new Array(7).fill(0);
  for (const d of dayList) wdDays[(new Date(d.start).getDay() + 6) % 7]++;
  const items = new Map();
  let total = 0, count = 0;

  for (const e of entries) {
    if (e.ts < fromStart || e.ts >= tomorrowStart) continue;
    const d = index.get(dayKey(e.ts));
    if (!d) continue;
    d.mg += e.mg; d.count++; d.entries.push(e);
    total += e.mg; count++;
    const dt = new Date(e.ts), h = dt.getHours();
    hourTotals[h] += e.mg; hourCounts[h]++;
    slotTotals[slotOf(h)] += e.mg;
    wdTotals[(dt.getDay() + 6) % 7] += e.mg;
    const cur = itemsById.get(e.itemId);
    const key = cur ? 'id:' + cur.id : 'name:' + e.name;
    const agg = items.get(key) || { key, name: cur ? cur.name : e.name, icon: cur ? cur.icon : e.icon, mg: 0, count: 0 };
    agg.mg += e.mg; agg.count++;
    items.set(key, agg);
  }

  let daysOver = 0, daysZero = 0, activeDays = 0, max = null, firstSum = 0, lastSum = 0;
  const gaps = [];
  for (const d of dayList) {
    if (d.count === 0) { daysZero++; continue; }
    activeDays++;
    if (d.mg > target) daysOver++;
    if (!max || d.mg > max.mg) max = d;
    d.entries.sort((a, b) => a.ts - b.ts);
    firstSum += minutesOfDay(d.entries[0].ts);
    lastSum += minutesOfDay(d.entries[d.entries.length - 1].ts);
    for (let i = 1; i < d.entries.length; i++) gaps.push(d.entries[i].ts - d.entries[i - 1].ts);
  }
  let streak = 0;
  for (let i = dayList.length - 1; i >= 0; i--) { if (dayList[i].mg <= target) streak++; else break; }

  const hourAvg = hourTotals.map(v => v / nDays);
  let peakHour = -1, peakVal = 0;
  hourAvg.forEach((v, i) => { if (v > peakVal) { peakVal = v; peakHour = i; } });

  return {
    fromStart, todayStart, nDays, dayList, total, count, target,
    avgPerDay: nDays ? total / nDays : 0,
    avgActive: activeDays ? total / activeDays : 0,
    activeDays, daysOver, daysZero, max, streak,
    slotAvg: slotTotals.map(v => v / nDays), slotTotals,
    hourAvg, hourCounts,
    wdAvg: wdTotals.map((v, i) => (wdDays[i] ? v / wdDays[i] : 0)), wdDays,
    items: Array.from(items.values()).sort((a, b) => b.mg - a.mg).map(it => Object.assign({}, it, { share: total ? it.mg / total : 0 })),
    avgFirst: activeDays ? firstSum / activeDays : null,
    avgLast: activeDays ? lastSum / activeDays : null,
    avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    peakHour,
  };
}

/* ----------------------------------------------------------------------
 * Stato
 * -------------------------------------------------------------------- */
const state = {
  settings: normalizeSettings(loadJSON(KEY_SETTINGS, null)),
  entries: normalizeEntries(loadJSON(KEY_ENTRIES, [])),
  tab: 'oggi',
  period: 14,
  openDay: null,
  dayRowsLimit: 31,
  deferredPrompt: null,
};

function persistSettings() { saveJSON(KEY_SETTINGS, state.settings); }
function persistEntries() { saveJSON(KEY_ENTRIES, state.entries); }
function requestPersistentStorage() {
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignora */ }
}
function itemById(id) { return state.settings.items.find(it => it.id === id) || null; }

function addEntry(data) {
  const entry = normalizeEntry(data);
  if (!entry) return null;
  state.entries.push(entry);
  state.entries.sort((a, b) => a.ts - b.ts);
  persistEntries();
  if (state.entries.length === 1) requestPersistentStorage();
  return entry;
}
function updateEntry(id, patch) {
  const e = state.entries.find(x => x.id === id);
  if (!e) return null;
  Object.assign(e, normalizeEntry(Object.assign({}, e, patch)));
  state.entries.sort((a, b) => a.ts - b.ts);
  persistEntries();
  return e;
}
function removeEntry(id) {
  const i = state.entries.findIndex(x => x.id === id);
  if (i < 0) return null;
  const [removed] = state.entries.splice(i, 1);
  persistEntries();
  return removed;
}
function restoreEntry(entry) {
  if (!entry || state.entries.some(e => e.id === entry.id)) return;
  state.entries.push(entry);
  state.entries.sort((a, b) => a.ts - b.ts);
  persistEntries();
}

/* ----------------------------------------------------------------------
 * Toast
 * -------------------------------------------------------------------- */
let toastTimer = null, toastOnAction = null;
function toast(msg, opts) {
  opts = opts || {};
  const el = $('#toast'), btn = $('#toastAction');
  if (!el) return;
  $('#toastMsg').textContent = msg;
  if (opts.action) { btn.textContent = opts.action; btn.hidden = false; toastOnAction = opts.onAction || null; }
  else { btn.hidden = true; toastOnAction = null; }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, opts.duration || 4500);
}
function hideToast() { const el = $('#toast'); if (el) el.hidden = true; toastOnAction = null; }
function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignora */ } }

/* ----------------------------------------------------------------------
 * Conferme (nessun confirm() nativo)
 * -------------------------------------------------------------------- */
let askResolve = null;
function ask(opts) {
  return new Promise(resolve => {
    askResolve = resolve;
    $('#askTitle').textContent = opts.title || '';
    $('#askMsg').textContent = opts.message || '';
    const box = $('#askActions');
    box.innerHTML = '';
    (opts.actions || []).forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + (a.kind === 'danger' ? 'btn-danger-ghost' : a.kind === 'primary' ? 'btn-primary' : 'btn-ghost');
      b.textContent = a.label;
      b.dataset.ask = a.value;
      if (i === 0 && (opts.actions.length > 1)) {
        const sp = document.createElement('span'); sp.className = 'spacer';
        box.appendChild(b); box.appendChild(sp); return;
      }
      box.appendChild(b);
    });
    openOverlay('#ask');
    const first = box.querySelector('button'); if (first) first.focus();
  });
}
function closeAsk(value) {
  closeOverlay('#ask');
  const r = askResolve; askResolve = null;
  if (r) r(value == null || value === '' ? null : value);
}

function openOverlay(sel) { $(sel).hidden = false; document.body.classList.add('has-sheet'); }
function closeOverlay(sel) {
  $(sel).hidden = true;
  if (!$$('.sheet').some(s => !s.hidden)) document.body.classList.remove('has-sheet');
}

/* ----------------------------------------------------------------------
 * Vista "Oggi"
 * -------------------------------------------------------------------- */
const RING_C = 2 * Math.PI * 68;

function renderHome() {
  const now = Date.now();
  const s = state.settings;
  const todayStart = startOfDay(now);
  const todayEntries = entriesOfDay(state.entries, todayStart);
  const total = todayEntries.reduce((a, e) => a + e.mg, 0);
  const pct = s.target > 0 ? total / s.target : 0;

  const dateLabel = fmtDateLong(now);
  $('#todayLabel').textContent = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  $('#todayTotal').textContent = fmtInt(total);
  $('#targetLabel').textContent = fmtInt(s.target);
  $('#todayPct').textContent = Math.round(pct * 100) + '%';
  $('#ringFill').style.strokeDashoffset = String(RING_C * (1 - clamp(pct, 0, 1)));
  const hero = $('#hero');
  hero.dataset.state = pct > 1 ? 'over' : pct >= 0.75 ? 'near' : 'ok';

  let msg;
  if (total === 0) msg = 'Nessuna caffeina registrata oggi.';
  else if (pct > 1) msg = 'Target superato di ' + fmtInt(total - s.target) + ' mg.';
  else if (pct === 1) msg = 'Target raggiunto esattamente.';
  else {
    const rem = s.target - total;
    const esp = itemById('espresso');
    const eq = esp && esp.mg > 0 ? Math.floor(rem / esp.mg) : 0;
    msg = 'Restano ' + fmtInt(rem) + ' mg al target' + (eq >= 1 ? ' (circa ' + eq + (eq === 1 ? ' espresso' : ' espressi') + ').' : '.');
  }
  $('#heroMsg').textContent = msg;

  $('#activeNow').textContent = '≈ ' + fmtInt(activeAt(state.entries, now, s.halfLife)) + ' mg';
  const bed = bedtimeTs(s.bedtime, now);
  $('#activeBedLabel').textContent = 'A letto ' + (bed.tomorrow ? 'domani ' : '') + bed.label;
  $('#activeBed').textContent = '≈ ' + fmtInt(activeAt(state.entries, bed.ts, s.halfLife)) + ' mg';

  const past = state.entries.filter(e => e.ts <= now);
  const last = past.length ? past[past.length - 1] : null;
  if (!last) $('#lastIntake').textContent = '—';
  else {
    const sameDay = last.ts >= todayStart;
    $('#lastIntake').textContent = (sameDay ? '' : fmtDateNum(last.ts) + ' ') + fmtTime(last.ts) + ' · ' + fmtAgoShort(now - last.ts);
  }

  renderQuickGrid();
  renderTodayList(todayEntries);
}

function renderQuickGrid() {
  const grid = $('#quickGrid');
  const items = state.settings.items.filter(it => it.enabled);
  grid.innerHTML = items.map(it =>
    '<button type="button" class="quick" data-item="' + esc(it.id) + '" aria-label="Aggiungi ' + esc(it.name) + ', ' + fmtInt(it.mg) + ' mg">' +
      '<span class="quick-ico">' + iconSvg(it.icon) + '</span>' +
      '<span class="quick-text"><span class="quick-name">' + esc(it.name) + '</span><span class="quick-mg">' + fmtInt(it.mg) + ' mg</span></span>' +
    '</button>').join('');
  if (!items.length) grid.innerHTML = '<p class="empty">Nessuna voce attiva: abilitane una nelle impostazioni.</p>';
}

function entryRow(e) {
  const qty = e.qty !== 1 ? ' ×' + fmtQty(e.qty) : '';
  return '<li class="entry" data-id="' + esc(e.id) + '">' +
    '<button type="button" class="entry-edit" data-edit="' + esc(e.id) + '" aria-label="Modifica ' + esc(e.name) + ' delle ' + fmtTime(e.ts) + '"></button>' +
    '<span class="entry-time">' + fmtTime(e.ts) + '</span>' +
    '<span class="entry-ico">' + iconSvg(e.icon) + '</span>' +
    '<span class="entry-main"><span class="entry-name">' + esc(e.name) + esc(qty) + '</span>' +
      (e.note ? '<span class="entry-note">' + esc(e.note) + '</span>' : '') + '</span>' +
    '<span class="entry-mg">' + fmtInt(e.mg) + ' mg</span>' +
    '<button type="button" class="entry-del" data-del="' + esc(e.id) + '" aria-label="Elimina ' + esc(e.name) + ' delle ' + fmtTime(e.ts) + '">' + iconSvg('cross') + '</button>' +
  '</li>';
}

function renderTodayList(todayEntries) {
  const list = todayEntries.slice().sort((a, b) => b.ts - a.ts);
  $('#todayList').innerHTML = list.map(entryRow).join('');
  $('#todayEmpty').hidden = list.length > 0;
  $('#todayCount').textContent = list.length === 1 ? '1 assunzione' : list.length + ' assunzioni';
}

function quickAdd(itemId) {
  const it = itemById(itemId);
  if (!it) return;
  const entry = addEntry({ ts: Date.now(), itemId: it.id, name: it.name, icon: it.icon, qty: 1, mg: it.mg, note: '' });
  vibrate(12);
  renderAll();
  toast('Aggiunto: ' + it.name + ' (' + fmtInt(it.mg) + ' mg)', {
    action: 'Annulla',
    onAction: () => { removeEntry(entry.id); renderAll(); hideToast(); },
  });
}

function deleteWithUndo(id) {
  const removed = removeEntry(id);
  if (!removed) return;
  renderAll();
  toast('Eliminato: ' + removed.name + ' delle ' + fmtTime(removed.ts), {
    action: 'Annulla',
    onAction: () => { restoreEntry(removed); renderAll(); hideToast(); },
  });
}

/* ----------------------------------------------------------------------
 * Foglio aggiungi / modifica
 * -------------------------------------------------------------------- */
const sheet = { mode: 'add', id: null, mgTouched: false };

function buildPicker(selectedId, extra) {
  const items = state.settings.items.filter(it => it.enabled || it.id === selectedId);
  const opts = items.map(it => ({ id: it.id, name: it.name, mg: it.mg, icon: it.icon }));
  if (extra && !opts.some(o => o.id === extra.id)) opts.push(extra);
  opts.push({ id: '__custom', name: 'Altro', mg: null, icon: 'generic' });
  const grid = opts.map(o =>
    '<label class="pick"><input type="radio" name="pickItem" value="' + esc(o.id) + '"' + (o.id === selectedId ? ' checked' : '') + '>' +
    '<span class="box">' + iconSvg(o.icon) + '<span class="nm">' + esc(o.name) + '</span>' +
    (o.mg != null ? '<span class="pm">' + fmtInt(o.mg) + ' mg</span>' : '') + '</span></label>').join('');
  const fs = $('#sheetItems');
  fs.innerHTML = '<legend class="field-label">Cosa</legend><div class="picker-grid">' + grid + '</div>';
  fs._opts = opts;
}
function pickerSelected() {
  const r = $('input[name="pickItem"]:checked');
  const id = r ? r.value : '__custom';
  return ($('#sheetItems')._opts || []).find(o => o.id === id) || { id: '__custom', name: 'Altro', mg: null, icon: 'generic' };
}
function recomputeMg() {
  if (sheet.mgTouched) return;
  const o = pickerSelected();
  const qty = toNumber($('#fQty').value, 1);
  if (o.mg != null) $('#fMg').value = String(Math.round(o.mg * qty));
}

function openSheet(opts) {
  opts = opts || {};
  const now = Date.now();
  $('#formError').hidden = true;
  if (opts.entry) {
    const e = opts.entry;
    sheet.mode = 'edit'; sheet.id = e.id;
    const cur = itemById(e.itemId);
    const extra = cur ? null : { id: e.itemId || '__snap:' + e.name, name: e.name, mg: e.qty ? Math.round(e.mg / e.qty) : e.mg, icon: e.icon };
    buildPicker(cur ? cur.id : extra.id, extra);
    $('#fQty').value = String(e.qty);
    $('#fMg').value = String(e.mg);
    $('#fWhen').value = toInputLocal(e.ts);
    $('#fNote').value = e.note || '';
    const o = pickerSelected();
    sheet.mgTouched = !(o.mg != null && Math.round(o.mg * e.qty) === e.mg);
    $('#sheetTitle').textContent = 'Modifica assunzione';
    $('#fDelete').hidden = false;
  } else {
    sheet.mode = 'add'; sheet.id = null; sheet.mgTouched = false;
    const first = state.settings.items.find(it => it.enabled);
    buildPicker(opts.itemId || (first ? first.id : '__custom'), null);
    $('#fQty').value = '1';
    $('#fWhen').value = toInputLocal(now);
    $('#fNote').value = '';
    recomputeMg();
    if (pickerSelected().mg == null) $('#fMg').value = '';
    $('#sheetTitle').textContent = 'Aggiungi assunzione';
    $('#fDelete').hidden = true;
  }
  openOverlay('#sheet');
}
function closeSheet() { closeOverlay('#sheet'); }

function submitSheet() {
  const o = pickerSelected();
  const qty = toNumber($('#fQty').value, NaN);
  const mg = toNumber($('#fMg').value, NaN);
  const ts = fromInputLocal($('#fWhen').value);
  const err = $('#formError');
  if (!(qty > 0)) { err.textContent = 'La quantità deve essere maggiore di zero.'; err.hidden = false; return; }
  if (!Number.isFinite(mg) || mg < 0) { err.textContent = 'Indica i mg di caffeina (anche 0).'; err.hidden = false; return; }
  if (!Number.isFinite(ts)) { err.textContent = 'Indica data e ora.'; err.hidden = false; return; }
  if (ts > Date.now() + 5 * 60000) { err.textContent = "L'orario è nel futuro."; err.hidden = false; return; }
  const note = $('#fNote').value.trim();
  const isCustom = o.id === '__custom';
  const data = {
    ts, qty, mg: Math.round(mg), note,
    itemId: isCustom || String(o.id).startsWith('__snap:') ? '' : o.id,
    name: isCustom ? (note || 'Altro') : o.name,
    icon: o.icon,
  };
  if (isCustom && note) data.note = '';
  if (sheet.mode === 'edit' && sheet.id) { updateEntry(sheet.id, data); toast('Modifica salvata'); }
  else { addEntry(data); vibrate(12); toast('Aggiunto: ' + data.name + ' (' + fmtInt(data.mg) + ' mg)'); }
  closeSheet();
  renderAll();
}

/* ----------------------------------------------------------------------
 * Vista "Statistiche"
 * -------------------------------------------------------------------- */
function renderStats() {
  const st = computeStats(state.entries, state.settings, state.period, Date.now());
  $$('#periodChips .chip-btn').forEach(b => b.classList.toggle('is-active', +b.dataset.days === state.period));
  $('#periodNote').textContent = (state.period > 0 ? 'Ultimi ' + st.nDays + ' giorni' : 'Dal ' + fmtDateShort(st.fromStart)) +
    ' · ' + fmtInt(st.total) + ' mg in ' + st.count + (st.count === 1 ? ' assunzione' : ' assunzioni');

  renderKpis(st);
  $('#chartDaily').innerHTML = svgDaily(st);
  $('#chartSlots').innerHTML = hbarsHtml(SLOTS.map((sl, i) => ({
    label: sl.name, sub: sl.range, value: st.slotAvg[i], max: Math.max.apply(null, st.slotAvg.concat([1])),
    text: fmtInt(st.slotAvg[i]) + ' mg', small: st.total ? Math.round(st.slotTotals[i] / st.total * 100) + '%' : '',
  })), st.total === 0);
  $('#chartHours').innerHTML = svgHours(st);
  $('#chartItems').innerHTML = hbarsHtml(st.items.map(it => ({
    label: it.name, icon: it.icon, sub: it.count + (it.count === 1 ? ' assunzione' : ' assunzioni'), value: it.mg,
    max: st.items.length ? st.items[0].mg : 1, text: fmtInt(it.mg) + ' mg', small: Math.round(it.share * 100) + '%',
  })), st.items.length === 0);
  $('#chartWeekday').innerHTML = hbarsHtml(WEEKDAYS.map((w, i) => ({
    label: w, sub: st.wdDays[i] + (st.wdDays[i] === 1 ? ' giorno' : ' giorni'), value: st.wdAvg[i],
    max: Math.max.apply(null, st.wdAvg.concat([1])), text: fmtInt(st.wdAvg[i]) + ' mg',
  })), st.total === 0);
  renderTimes(st);
  renderDayTable(st);
}

function kpiTile(k, v, unit, sub, cls) {
  return '<div class="kpi' + (cls ? ' ' + cls : '') + '"><span class="kpi-k">' + esc(k) + '</span>' +
    '<span class="kpi-v">' + esc(v) + (unit ? '<small>' + esc(unit) + '</small>' : '') + '</span>' +
    (sub ? '<span class="kpi-s">' + esc(sub) + '</span>' : '') + '</div>';
}
function renderKpis(st) {
  const tiles = [
    kpiTile('Media al giorno', fmtInt(st.avgPerDay), 'mg', st.activeDays ? fmtInt(st.avgActive) + ' mg nei giorni con consumo' : 'nessun consumo nel periodo'),
    kpiTile('Giorni sopra il target', String(st.daysOver), '/' + st.nDays, st.daysOver ? Math.round(st.daysOver / st.nDays * 100) + '% dei giorni' : 'sempre entro il target', st.daysOver ? 'is-bad' : (st.total ? 'is-good' : '')),
    kpiTile('Giorno più alto', st.max ? fmtInt(st.max.mg) : '—', st.max ? 'mg' : '', st.max ? fmtWeekdayShort(st.max.start) + ' ' + fmtDateShort(st.max.start) : ''),
    kpiTile('Giorni di fila entro il target', String(st.streak), st.streak === 1 ? 'giorno' : 'giorni', st.daysZero + (st.daysZero === 1 ? ' giorno' : ' giorni') + ' senza caffeina'),
    kpiTile('Assunzioni', String(st.count), '', st.nDays ? nf1.format(st.count / st.nDays) + ' al giorno' : ''),
    kpiTile('Dose media per assunzione', st.count ? fmtInt(st.total / st.count) : '—', st.count ? 'mg' : '', st.count ? 'target singola dose EFSA: 200 mg' : ''),
  ];
  $('#kpis').innerHTML = tiles.join('');
}

function svgDaily(st) {
  const days = st.dayList, n = days.length, target = st.target;
  if (!n) return '';
  const W = 360, H = 200, padL = 36, padR = 40, padT = 16, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  let maxV = target;
  for (const d of days) if (d.mg > maxV) maxV = d.mg;
  const yMax = niceCeil(maxV * 1.1);
  const y = v => padT + innerH - (v / yMax) * innerH;
  const slot = innerW / n;
  const bw = Math.max(1.5, Math.min(26, slot * 0.68));
  const todayKey = dayKey(st.todayStart);
  let out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Caffeina totale per giorno">';
  for (let i = 1; i <= 5; i++) {
    const v = yMax * i / 5, yy = y(v);
    out += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>';
    out += '<text class="ax" x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end">' + fmtInt(v) + '</text>';
  }
  out += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '"/>';
  const labelEvery = n <= 14 ? 1 : Math.ceil(n / 6);
  days.forEach((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const h = (d.mg / yMax) * innerH;
    const title = fmtWeekdayShort(d.start) + ' ' + fmtDateShort(d.start) + ': ' + fmtInt(d.mg) + ' mg (' + d.count + (d.count === 1 ? ' assunzione' : ' assunzioni') + ')';
    if (d.mg > 0) {
      out += '<rect class="bar' + (d.mg > target ? ' is-over' : '') + (d.key === todayKey ? ' is-today' : '') + '" x="' + x.toFixed(1) + '" y="' + (y(0) - h).toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(3, bw / 2).toFixed(1) + '"><title>' + esc(title) + '</title></rect>';
      if (n <= 14) out += '<text class="val" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y(0) - h - 4).toFixed(1) + '" text-anchor="middle">' + fmtInt(d.mg) + '</text>';
    } else if (d.key === todayKey) {
      out += '<rect class="bar is-today" x="' + x.toFixed(1) + '" y="' + (y(0) - 1.5).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="1.5" style="fill:none"><title>' + esc(title) + '</title></rect>';
    }
    const showLabel = labelEvery === 1 || (n - 1 - i) % labelEvery === 0;
    if (showLabel) {
      const cx = (padL + i * slot + slot / 2).toFixed(1);
      if (n <= 14) {
        out += '<text class="ax" x="' + cx + '" y="' + (H - padB + 13) + '" text-anchor="middle">' + new Date(d.start).getDate() + '</text>';
        out += '<text class="ax" x="' + cx + '" y="' + (H - padB + 24) + '" text-anchor="middle" font-size="8.5">' + WEEKDAY_INITIALS[(new Date(d.start).getDay() + 6) % 7] + '</text>';
      } else {
        out += '<text class="ax" x="' + cx + '" y="' + (H - padB + 14) + '" text-anchor="middle">' + fmtDateNum(d.start) + '</text>';
      }
    }
  });
  const ty = y(target);
  out += '<line class="tgt" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + ty.toFixed(1) + '" y2="' + ty.toFixed(1) + '"/>';
  out += '<text class="ax" x="' + (W - padR + 5) + '" y="' + (ty - 2).toFixed(1) + '" font-size="8.5" style="fill:var(--danger)">target</text>';
  out += '<text class="ax" x="' + (W - padR + 5) + '" y="' + (ty + 9).toFixed(1) + '" style="fill:var(--danger);font-weight:600">' + fmtInt(target) + '</text>';
  out += '</svg>';
  return out;
}

function svgHours(st) {
  const W = 360, H = 150, padL = 36, padR = 10, padT = 10, padB = 22;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const vals = st.hourAvg;
  let maxV = 0; for (const v of vals) if (v > maxV) maxV = v;
  if (maxV === 0) {
    return '<svg viewBox="0 0 ' + W + ' 60" role="img" aria-label="Profilo orario"><text class="nodata" x="' + (W / 2) + '" y="34" text-anchor="middle">Nessun dato nel periodo</text></svg>';
  }
  const yMax = niceCeil(maxV * 1.1);
  const y = v => padT + innerH - (v / yMax) * innerH;
  const slot = innerW / 24, bw = slot * 0.7;
  let out = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Caffeina media per ora del giorno">';
  for (let i = 1; i <= 3; i++) {
    const v = yMax * i / 3, yy = y(v);
    out += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy.toFixed(1) + '" y2="' + yy.toFixed(1) + '"/>';
    out += '<text class="ax" x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end">' + fmtInt(v) + '</text>';
  }
  out += '<line class="grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '"/>';
  vals.forEach((v, h) => {
    const x = padL + h * slot + (slot - bw) / 2;
    const hh = (v / yMax) * innerH;
    if (v > 0) {
      out += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + (y(0) - hh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" rx="2"><title>' +
        pad(h) + '–' + pad((h + 1) % 24) + ': ' + fmtInt(v) + ' mg al giorno (' + st.hourCounts[h] + (st.hourCounts[h] === 1 ? ' assunzione' : ' assunzioni') + ')</title></rect>';
    }
    if (h % 3 === 0) out += '<text class="ax" x="' + (padL + h * slot + slot / 2).toFixed(1) + '" y="' + (H - padB + 14) + '" text-anchor="middle">' + pad(h) + '</text>';
  });
  out += '</svg>';
  return out;
}

function hbarsHtml(rows, empty) {
  if (empty) return '<p class="empty">Nessun dato nel periodo.</p>';
  return rows.map(r => {
    const pct = r.max > 0 ? clamp(r.value / r.max * 100, 0, 100) : 0;
    return '<div class="hbar"><span class="hbar-label"><span class="nm">' + (r.icon ? iconSvg(r.icon) : '') + '<span class="nm-text">' + esc(r.label) + '</span></span>' +
      (r.sub ? '<span class="hbar-sub">' + esc(r.sub) + '</span>' : '') + '</span>' +
      '<div class="hbar-track" aria-hidden="true"><div class="hbar-fill" style="width:' + pct.toFixed(1) + '%"></div></div>' +
      '<span class="hbar-value">' + esc(r.text) + (r.small ? ' <small>' + esc(r.small) + '</small>' : '') + '</span></div>';
  }).join('');
}

function renderTimes(st) {
  const rows = [];
  if (st.activeDays) {
    rows.push(['Prima assunzione (media)', fmtMinutes(st.avgFirst)]);
    rows.push(['Ultima assunzione (media)', fmtMinutes(st.avgLast)]);
    rows.push(['Tra una e l’altra, nella stessa giornata', st.avgGap != null ? fmtDuration(st.avgGap) : '—']);
    rows.push(['Ora di picco', st.peakHour >= 0 ? pad(st.peakHour) + '–' + pad((st.peakHour + 1) % 24) : '—']);
    rows.push(['Giorni con almeno un’assunzione', st.activeDays + ' su ' + st.nDays]);
  }
  $('#statTimes').innerHTML = rows.length
    ? rows.map(r => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('')
    : '<dt>Nessun dato nel periodo.</dt><dd></dd>';
}

function renderDayTable(st) {
  const target = st.target;
  let days = st.dayList.slice().reverse();
  if (state.period === 0 || state.period > 31) days = days.filter(d => d.count > 0);
  const shown = days.slice(0, state.dayRowsLimit);
  const maxV = Math.max(target, ...st.dayList.map(d => d.mg), 1);
  if (!shown.length) { $('#dayTable').innerHTML = '<p class="empty">Nessun dato nel periodo.</p>'; return; }
  let html = '<table class="daytable"><thead><tr><th>Giorno</th><th class="num">N</th><th class="num">mg</th><th class="bar"></th></tr></thead><tbody>';
  for (const d of shown) {
    const state_ = d.count === 0 ? 'is-none' : d.mg > target ? 'is-over' : d.mg >= target * 0.75 ? 'is-near' : '';
    const isOpen = state.openDay === d.key;
    html += '<tr class="day' + (isOpen ? ' is-open' : '') + '" data-day="' + d.key + '" tabindex="0" aria-expanded="' + isOpen + '">' +
      '<td class="date"><span class="dot ' + state_ + '"></span>' + esc(fmtWeekdayShort(d.start)) + ' <small>' + esc(fmtDateShort(d.start)) + '</small></td>' +
      '<td class="num">' + d.count + '</td><td class="num"><strong>' + fmtInt(d.mg) + '</strong></td>' +
      '<td class="bar"><span class="mini' + (d.mg > target ? ' is-over' : '') + '" style="width:' + (d.mg / maxV * 100).toFixed(1) + '%"></span></td></tr>';
    if (isOpen) {
      html += '<tr class="detail"><td colspan="4">' + (d.entries.length
        ? '<ul class="detail-list">' + d.entries.slice().sort((a, b) => b.ts - a.ts).map(entryRow).join('') + '</ul>'
        : '<p class="empty">Nessuna assunzione in questo giorno.</p>') +
        '<button type="button" class="btn-link" data-add-day="' + d.key + '">Aggiungi un’assunzione in questo giorno</button></td></tr>';
    }
  }
  html += '</tbody></table>';
  if (days.length > shown.length) html += '<button type="button" class="btn btn-ghost btn-more" id="btnMoreDays">Mostra altri ' + Math.min(31, days.length - shown.length) + ' giorni</button>';
  $('#dayTable').innerHTML = html;
}

/* ----------------------------------------------------------------------
 * Vista "Impostazioni"
 * -------------------------------------------------------------------- */
function renderSettings() {
  const s = state.settings;
  $('#setTarget').value = String(s.target);
  $$('#targetPresets .chip-btn').forEach(b => b.classList.toggle('is-active', +b.dataset.target === s.target));
  $('#setHalfLife').value = String(s.halfLife);
  $('#setBedtime').value = s.bedtime;
  renderItemEditor();
  const n = state.entries.length;
  $('#dataSummary').textContent = n
    ? n + (n === 1 ? ' assunzione' : ' assunzioni') + ' dal ' + fmtDateShort(state.entries[0].ts) + ' ' + new Date(state.entries[0].ts).getFullYear()
    : 'nessuna assunzione salvata';
  renderInstall();
  $('#versionLabel').textContent = 'Caffeina ' + APP_VERSION + (IS_PREVIEW ? ' · anteprima' : '');
}

function renderItemEditor() {
  $('#itemEditor').innerHTML = state.settings.items.map(it =>
    '<li class="item-row' + (it.enabled ? '' : ' is-disabled') + '" data-id="' + esc(it.id) + '">' +
      '<button type="button" class="ico-pick" data-action="icon" title="Cambia icona" aria-label="Icona: ' + esc(ICON_NAMES[it.icon] || 'Generico') + ' (tocca per cambiare)">' + iconSvg(it.icon) + '</button>' +
      '<input type="text" data-field="name" value="' + esc(it.name) + '" maxlength="40" aria-label="Nome della voce" autocomplete="off">' +
      '<span class="row-actions"><button type="button" class="mini-btn" data-action="remove" aria-label="Rimuovi voce">' + iconSvg('cross') + '</button></span>' +
      '<div class="item-row-2"><span class="mg-wrap"><input type="number" data-field="mg" value="' + esc(it.mg) + '" min="0" max="2000" step="1" inputmode="numeric" aria-label="mg di caffeina per porzione"></span>' +
      '<label class="toggle"><input type="checkbox" data-field="enabled"' + (it.enabled ? ' checked' : '') + '> Mostra tra i pulsanti rapidi</label></div>' +
    '</li>').join('');
}

function renderInstall() {
  const txt = $('#installText'), btn = $('#btnInstall');
  if (!txt) return;
  let standalone = false;
  try { standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; } catch (e) { /* ignora */ }
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  btn.hidden = true;
  if (IS_PREVIEW) {
    txt.textContent = 'Questa è un’anteprima pubblicata su claude.ai: funziona come pagina web, ma non si installa e non lavora offline. Per averla come app sul telefono, pubblica i file del progetto su GitHub Pages e aprila da lì.';
  } else if (standalone) {
    txt.textContent = 'App installata. Funziona anche senza connessione e i dati restano nella memoria dell’app.';
  } else if (state.deferredPrompt) {
    txt.textContent = 'Puoi installare Caffeina come app: icona nella schermata Home, avvio a schermo intero e funzionamento offline.';
    btn.hidden = false;
  } else if (isIOS) {
    txt.textContent = 'Su iPhone: apri questa pagina in Safari, tocca Condividi e poi “Aggiungi alla schermata Home”. Da lì funziona anche offline e Safari non cancella i dati dopo i periodi di inattività.';
  } else {
    txt.textContent = 'Dal menu del browser scegli “Installa app” (o “Aggiungi alla schermata Home”) per usarla offline e a schermo intero.';
  }
}

/* ----------------------------------------------------------------------
 * Esportazione e importazione
 * -------------------------------------------------------------------- */
let exportPayload = null;
function openExport(filename, text, mime, info) {
  exportPayload = { filename, text, mime };
  $('#exportInfo').textContent = info + (IS_PREVIEW ? ' In questa anteprima il download è disattivato: usa “Copia” e incolla il contenuto in un file.' : '');
  $('#exportText').value = text;
  $('#btnDownloadExport').hidden = IS_PREVIEW;
  openOverlay('#exportSheet');
}
function closeExport() { closeOverlay('#exportSheet'); }

function downloadExport() {
  if (!exportPayload) return;
  try {
    const blob = new Blob([exportPayload.text], { type: exportPayload.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = exportPayload.filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('File pronto: ' + exportPayload.filename);
  } catch (e) {
    toast('Download non riuscito: usa “Copia”.');
  }
}
function copyExport() {
  const ta = $('#exportText');
  const done = () => toast('Copiato negli appunti');
  const fallback = () => {
    try { ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length); document.execCommand && document.execCommand('copy'); done(); }
    catch (e) { toast('Seleziona il testo e copialo manualmente.'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, fallback);
  else fallback();
}

function exportJSON() {
  const payload = { app: 'caffeina', version: 1, exportedAt: new Date().toISOString(), settings: state.settings, entries: state.entries };
  const text = JSON.stringify(payload, null, 2);
  const date = dayKey(Date.now());
  openExport('caffeina-backup-' + date + '.json', text, 'application/json',
    'Backup completo: ' + state.entries.length + ' assunzioni e impostazioni (' + Math.max(1, Math.round(text.length / 1024)) + ' KB). Importalo da “Importa backup JSON”.');
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCSV() {
  const lines = ['id;data;ora;voce;quantita;mg;nota'];
  for (const e of state.entries) {
    lines.push([e.id, dayKey(e.ts), fmtTime(e.ts), e.name, String(e.qty).replace('.', ','), e.mg, e.note].map(csvCell).join(';'));
  }
  const text = '﻿' + lines.join('\r\n');
  openExport('caffeina-' + dayKey(Date.now()) + '.csv', text, 'text/csv;charset=utf-8',
    'CSV con separatore “;” (si apre direttamente in Excel/Numbers): ' + state.entries.length + ' righe. Per ripristinare i dati usa invece il backup JSON.');
}

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onerror = () => toast('Non riesco a leggere il file.');
  reader.onload = () => {
    let data;
    try { data = JSON.parse(String(reader.result)); } catch (e) { toast('Il file non è un backup JSON valido.'); return; }
    const entries = normalizeEntries(data && (data.entries || (Array.isArray(data) ? data : null)));
    if (!entries.length) { toast('Nel file non ci sono assunzioni riconoscibili.'); return; }
    const first = entries[0], last = entries[entries.length - 1];
    const existing = new Set(state.entries.map(e => e.id));
    const fresh = entries.filter(e => !existing.has(e.id));
    ask({
      title: 'Importa ' + entries.length + ' assunzioni',
      message: 'Dal ' + fmtDateShort(first.ts) + ' ' + new Date(first.ts).getFullYear() + ' al ' + fmtDateShort(last.ts) + ' ' + new Date(last.ts).getFullYear() +
        '. “Unisci” aggiunge solo le ' + fresh.length + ' voci non ancora presenti e lascia le impostazioni com’erano; “Sostituisci” rimpiazza tutto, impostazioni comprese, con il contenuto del backup.',
      actions: [
        { label: 'Annulla', value: 'cancel' },
        { label: 'Sostituisci tutto', value: 'replace', kind: 'danger' },
        { label: 'Unisci', value: 'merge', kind: 'primary' },
      ],
    }).then(choice => {
      if (choice === 'merge') {
        state.entries = normalizeEntries(state.entries.concat(fresh));
        persistEntries();
        toast('Importate ' + fresh.length + ' assunzioni');
      } else if (choice === 'replace') {
        state.entries = entries;
        if (data.settings) state.settings = normalizeSettings(data.settings);
        persistEntries(); persistSettings();
        toast('Dati sostituiti con il backup');
      } else return;
      renderAll();
    });
  };
  reader.readAsText(file);
}

/* ----------------------------------------------------------------------
 * Navigazione
 * -------------------------------------------------------------------- */
const TABS = ['oggi', 'statistiche', 'impostazioni'];
function showTab(name, opts) {
  if (!TABS.includes(name)) name = 'oggi';
  state.tab = name;
  $$('.view').forEach(v => { v.hidden = v.dataset.view !== name; });
  $$('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  if (!(opts && opts.silent)) {
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignora */ }
    window.scrollTo(0, 0);
  }
  if (name === 'oggi') renderHome();
  else if (name === 'statistiche') renderStats();
  else renderSettings();
}
function renderAll() {
  if (state.tab === 'oggi') renderHome();
  else if (state.tab === 'statistiche') renderStats();
  else renderSettings();
}

/* ----------------------------------------------------------------------
 * Eventi
 * -------------------------------------------------------------------- */
function wireEvents() {
  $$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
  window.addEventListener('hashchange', () => showTab((location.hash || '#oggi').slice(1), { silent: true }));

  $('#btnTopAdd').addEventListener('click', () => openSheet());
  $('#btnCustom').addEventListener('click', () => openSheet());

  $('#quickGrid').addEventListener('click', ev => {
    const b = ev.target.closest('.quick');
    if (b) quickAdd(b.dataset.item);
  });

  // Diario di oggi e dettaglio giornate: modifica / elimina
  document.addEventListener('click', ev => {
    const edit = ev.target.closest('[data-edit]');
    if (edit) { const e = state.entries.find(x => x.id === edit.dataset.edit); if (e) openSheet({ entry: e }); return; }
    const del = ev.target.closest('[data-del]');
    if (del) { deleteWithUndo(del.dataset.del); return; }
    const addDay = ev.target.closest('[data-add-day]');
    if (addDay) {
      const parts = addDay.dataset.addDay.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
      openSheet();
      $('#fWhen').value = toInputLocal(Math.min(d.getTime(), Date.now()));
      return;
    }
    const row = ev.target.closest('tr.day');
    if (row) { state.openDay = state.openDay === row.dataset.day ? null : row.dataset.day; renderStats(); return; }
    if (ev.target.closest('#btnMoreDays')) { state.dayRowsLimit += 31; renderStats(); }
  });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && ev.target.matches && ev.target.matches('tr.day')) { ev.target.click(); }
    if (ev.key === 'Escape') {
      if (!$('#ask').hidden) closeAsk(null);
      else if (!$('#sheet').hidden) closeSheet();
      else if (!$('#exportSheet').hidden) closeExport();
    }
  });

  // Foglio aggiungi/modifica
  $$('#sheet [data-close]').forEach(el => el.addEventListener('click', closeSheet));
  $('#entryForm').addEventListener('submit', ev => { ev.preventDefault(); submitSheet(); });
  $('#sheetItems').addEventListener('change', () => { sheet.mgTouched = false; recomputeMg(); if (pickerSelected().mg == null) { $('#fMg').value = ''; $('#fMg').focus(); } });
  $('#fQty').addEventListener('input', () => { recomputeMg(); });
  $('#fMg').addEventListener('input', () => { sheet.mgTouched = true; });
  $$('#entryForm .step').forEach(b => b.addEventListener('click', () => {
    const inp = $('#fQty');
    let q = toNumber(inp.value, 1);
    if (+b.dataset.step > 0) q = q < 1 ? 1 : q + 1;
    else q = q > 1 ? q - 1 : q > 0.5 ? 0.5 : 0.25;
    inp.value = String(q);
    recomputeMg();
  }));
  $('#fDelete').addEventListener('click', () => { const id = sheet.id; closeSheet(); if (id) deleteWithUndo(id); });

  // Conferme
  $('#ask').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ask]');
    if (b) closeAsk(b.dataset.ask);
  });

  // Esportazione
  $$('#exportSheet [data-close-export]').forEach(el => el.addEventListener('click', closeExport));
  $('#btnDownloadExport').addEventListener('click', downloadExport);
  $('#btnCopyExport').addEventListener('click', copyExport);

  // Toast
  $('#toastAction').addEventListener('click', () => { if (toastOnAction) toastOnAction(); });

  // Statistiche
  $('#periodChips').addEventListener('click', ev => {
    const b = ev.target.closest('.chip-btn');
    if (!b) return;
    state.period = +b.dataset.days; state.dayRowsLimit = 31; state.openDay = null;
    renderStats();
  });

  // Impostazioni
  $('#setTarget').addEventListener('change', ev => {
    const v = clamp(Math.round(toNumber(ev.target.value, state.settings.target)), 50, 2000);
    state.settings.target = v; persistSettings(); renderSettings();
    toast('Target: ' + fmtInt(v) + ' mg al giorno');
  });
  $('#targetPresets').addEventListener('click', ev => {
    const b = ev.target.closest('[data-target]');
    if (!b) return;
    state.settings.target = +b.dataset.target; persistSettings(); renderSettings();
  });
  $('#setHalfLife').addEventListener('change', ev => {
    state.settings.halfLife = clamp(toNumber(ev.target.value, 5), 1, 12); persistSettings(); renderSettings();
  });
  $('#setBedtime').addEventListener('change', ev => {
    if (/^\d{1,2}:\d{2}$/.test(ev.target.value)) { state.settings.bedtime = ev.target.value; persistSettings(); }
    renderSettings();
  });
  $('#itemEditor').addEventListener('change', ev => {
    const row = ev.target.closest('.item-row'); if (!row) return;
    const it = itemById(row.dataset.id); if (!it) return;
    const f = ev.target.dataset.field;
    if (f === 'name') it.name = ev.target.value.trim().slice(0, 40) || it.name;
    else if (f === 'mg') it.mg = clamp(Math.round(toNumber(ev.target.value, it.mg)), 0, 2000);
    else if (f === 'enabled') it.enabled = ev.target.checked;
    persistSettings(); renderItemEditor();
  });
  $('#itemEditor').addEventListener('click', ev => {
    const b = ev.target.closest('[data-action]'); if (!b) return;
    const row = b.closest('.item-row'); const it = itemById(row.dataset.id); if (!it) return;
    if (b.dataset.action === 'icon') {
      it.icon = ICONS[(ICONS.indexOf(it.icon) + 1) % ICONS.length]; persistSettings(); renderItemEditor();
    } else if (b.dataset.action === 'remove') {
      ask({
        title: 'Rimuovere “' + it.name + '”?',
        message: 'La voce sparisce dai pulsanti rapidi. Le assunzioni già registrate restano nel diario con il nome e i mg di allora.',
        actions: [{ label: 'Annulla', value: 'cancel' }, { label: 'Rimuovi', value: 'ok', kind: 'danger' }],
      }).then(c => {
        if (c !== 'ok') return;
        state.settings.items = state.settings.items.filter(x => x.id !== it.id);
        persistSettings(); renderItemEditor();
      });
    }
  });
  $('#btnAddItem').addEventListener('click', () => {
    state.settings.items.push({ id: 'custom-' + uid(), name: 'Nuova voce', mg: 50, icon: 'generic', enabled: true });
    persistSettings(); renderItemEditor();
    const rows = $$('#itemEditor .item-row'); const lastRow = rows[rows.length - 1];
    const inp = lastRow && lastRow.querySelector('[data-field="name"]');
    if (inp) { inp.focus(); inp.select && inp.select(); }
  });
  $('#btnResetItems').addEventListener('click', () => {
    ask({
      title: 'Ripristinare le voci predefinite?',
      message: 'Le cinque voci tornano ai valori iniziali e le voci aggiunte da te vengono rimosse. Il diario non cambia.',
      actions: [{ label: 'Annulla', value: 'cancel' }, { label: 'Ripristina', value: 'ok', kind: 'primary' }],
    }).then(c => { if (c !== 'ok') return; state.settings.items = DEFAULT_ITEMS(); persistSettings(); renderSettings(); toast('Voci ripristinate'); });
  });

  $('#btnExportJson').addEventListener('click', exportJSON);
  $('#btnExportCsv').addEventListener('click', exportCSV);
  $('#fileImport').addEventListener('change', ev => { importFile(ev.target.files && ev.target.files[0]); ev.target.value = ''; });
  $('#btnReset').addEventListener('click', () => {
    ask({
      title: 'Cancellare tutti i dati?',
      message: 'Diario e impostazioni vengono eliminati da questo dispositivo. Se vuoi conservarli, esporta prima il backup JSON.',
      actions: [{ label: 'Annulla', value: 'cancel' }, { label: 'Cancella tutto', value: 'ok', kind: 'danger' }],
    }).then(c => {
      if (c !== 'ok') return;
      state.entries = []; state.settings = DEFAULT_SETTINGS();
      persistEntries(); persistSettings();
      try { localStorage.removeItem(KEY_ENTRIES); localStorage.removeItem(KEY_SETTINGS); } catch (e) { /* ignora */ }
      renderAll(); toast('Tutti i dati sono stati cancellati');
    });
  });

  // Installazione
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); state.deferredPrompt = ev; renderInstall(); });
  window.addEventListener('appinstalled', () => { state.deferredPrompt = null; renderInstall(); toast('Caffeina è installata'); });
  $('#btnInstall').addEventListener('click', () => {
    const p = state.deferredPrompt; if (!p) return;
    p.prompt();
    p.userChoice.then(() => { state.deferredPrompt = null; renderInstall(); }).catch(() => {});
  });

  // Aggiornamenti periodici (cambio giorno, "in circolo")
  setInterval(() => { if (state.tab === 'oggi' && !document.hidden) renderHome(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
}

/* ----------------------------------------------------------------------
 * Service worker
 * -------------------------------------------------------------------- */
function setupServiceWorker() {
  if (IS_PREVIEW || !('serviceWorker' in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) return; refreshing = true; location.reload(); });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      const onWaiting = () => showUpdateBanner(reg);
      if (reg.waiting && navigator.serviceWorker.controller) onWaiting();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) onWaiting(); });
      });
      setInterval(() => reg.update().catch(() => {}), 6 * 3600000);
    }).catch(() => {});
  });
}
function showUpdateBanner(reg) {
  if ($('#updateBanner')) return;
  const div = document.createElement('div');
  div.className = 'update-banner'; div.id = 'updateBanner';
  div.innerHTML = '<div class="inner"><span>Nuova versione disponibile</span><button type="button" id="btnUpdate">Aggiorna</button></div>';
  document.body.appendChild(div);
  $('#btnUpdate').addEventListener('click', () => { if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); div.remove(); });
}

/* ----------------------------------------------------------------------
 * Avvio
 * -------------------------------------------------------------------- */
function init() {
  wireEvents();
  setupServiceWorker();
  const initial = (location.hash || '#oggi').slice(1);
  showTab(TABS.includes(initial) ? initial : 'oggi', { silent: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// Funzioni pure esposte per test e riuso
window.CaffeinaCore = { computeStats, activeAt, dayKey, startOfDay, addDays, niceCeil, normalizeEntries, normalizeSettings, bedtimeTs, slotOf, DEFAULT_ITEMS, DEFAULT_SETTINGS, APP_VERSION };
})();
