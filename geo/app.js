import { PROVINCES } from './data/provinces.js';
import { MAP, SOUTH_SEA_VIEW } from './data/map.js';
import { createCollectionUI } from './collection-ui.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const byId = new Map(PROVINCES.map(p => [p.id, p]));
const shapeById = new Map(MAP.map(p => [p.id, p]));
const NS = 'http://www.w3.org/2000/svg';
const STORE = 'yan.geo.progress.v1';
const MATCH_SIZE = 6;
const MATCH_PAGES = Math.ceil(PROVINCES.length / MATCH_SIZE);
const gameModes = ['map', 'capital', 'abbr'];
const isMatch = mode => mode === 'capital' || mode === 'abbr';
const linkSide = mode => mode === 'abbr' ? 'a' : 'b';
const matchHint = '先选一张省名，再选右侧对应的卡片；也可以拖线连接。';
const createRoundId = () => globalThis.crypto?.randomUUID?.() || `round-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const palette = ['#d5e4c7', '#e1e7cc', '#ccdfd0', '#e5e8cf', '#d9e4c9', '#d2e1d8'];
const linkColors = ['#6b956a', '#9c86b3', '#b39a58', '#6e9da0', '#ad8584', '#91a259'];
const known = id => byId.has(id);
const shuffle = a => { const out = [...a]; for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; } return out; };
function readState() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { /* Recover from unavailable or invalid storage. */ }
  const ids = PROVINCES.map(p => p.id);
  const validOrder = a => Array.isArray(a) && a.length === 34 && new Set(a).size === 34 && a.every(known);
  const links = new Set(Array.isArray(s.links) ? s.links.filter(k => /^[ab]:\d{6}$/.test(k) && known(k.slice(2))) : []);
  const validRound = id => typeof id === 'string' && id.length > 0 && id.length <= 128;
  const legacyRound = validRound(s.roundIds?.match) ? s.roundIds.match : createRoundId();
  // A completed old three-column round earned one reward. Keep that receipt shared
  // during migration; subsequent restarts get independent identities in each level.
  const legacyComplete = s.matchVersion !== 2 && links.size === 68;
  return {
    placed: new Set(Array.isArray(s.placed) ? s.placed.filter(known) : []),
    links,
    orders: ['name', 'abbr', 'capital'].map((_, i) => validOrder(s.orders?.[i]) ? s.orders[i] : shuffle(ids)),
    muted: s.muted === true,
    mode: s.mode === 'match' ? 'capital' : gameModes.includes(s.mode) ? s.mode : 'map',
    pages: Object.fromEntries(['capital', 'abbr'].map(mode => [mode, Number.isInteger(s.pages?.[mode]) && s.pages[mode] >= 0 && s.pages[mode] < MATCH_PAGES ? s.pages[mode] : 0])),
    roundIds: Object.fromEntries(gameModes.map(mode => [mode, validRound(s.roundIds?.[mode]) ? s.roundIds[mode] : s.matchVersion !== 2 && (mode === 'capital' || mode === 'abbr' && legacyComplete) ? legacyRound : createRoundId()])),
  };
}
const state = readState();
let activeMode = state.mode;
let rewards = null;
let selectedProvince = null;
let selectedTile = null;
let gesture = null;
let pan = null;
let audio = null;
let toastTimer;
let winTimer;
let drawFrame;
const flashTimers = new Set();
let view = { x: 0, y: 0, w: 900, h: 620 };
let zoom = 1;
let storageWarned = false;

function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ matchVersion: 2, placed: [...state.placed], links: [...state.links], orders: state.orders, pages: state.pages, muted: state.muted, mode: state.mode, roundIds: state.roundIds })); }
  catch { if (!storageWarned) { storageWarned = true; toast('当前浏览器无法保存进度，本次仍可正常游玩。', true); } }
}
function svg(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
function toast(message, gentle = false) {
  const e = $('#toast'); e.textContent = message; e.classList.toggle('gentle', gentle); e.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('visible'), 2400);
}
function shake(e) { if (!e) return; e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake'); setTimeout(() => e.classList.remove('shake'), 450); }
function initAudio() {
  try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') void audio.resume().catch(() => {}); } catch { /* Devices without Web Audio can still play. */ }
}
function sound(kind = 'correct') {
  if (state.muted) return;
  initAudio(); if (!audio || audio.state !== 'running') return;
  const notes = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5, 783.99, 987.77, 1046.5] : kind === 'gentle' ? [293.66, 261.63] : [523.25, 659.25, 783.99];
  notes.forEach((f, i) => {
    const osc = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + i * (kind === 'win' ? .14 : .085);
    osc.type = 'sine'; osc.frequency.value = f; gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(kind === 'gentle' ? .04 : .1, start + .012); gain.gain.exponentialRampToValueAtTime(.001, start + .3);
    osc.connect(gain); gain.connect(audio.destination); osc.start(start); osc.stop(start + .32);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  });
}
document.addEventListener('pointerdown', initAudio, { passive: true });
document.addEventListener('keydown', initAudio, { passive: true });

function makeShape(feature, insetTargets) {
  const p = byId.get(feature.id);
  if (!p) return svg('path', { d: feature.path, class: 'boundary-dashes' });
  const idx = PROVINCES.findIndex(p => p.id === feature.id);
  const active = !insetTargets || insetTargets.includes(feature.id);
  return svg('path', {
    d: feature.path, class: `province${insetTargets && active ? ' inset-target' : ''}`,
    'data-province': feature.id, style: `--province-fill:${palette[idx % palette.length]}`,
    ...(active ? { tabindex: '0', role: 'button', 'aria-label': `未命名的省级区域 ${idx + 1}` } : {}),
  });
}
function boundsUnion(ids, padding = .16) {
  const b = ids.map(id => shapeById.get(id).bounds);
  const x = Math.min(...b.map(p => p[0])), y = Math.min(...b.map(p => p[1]));
  const w = Math.max(...b.map(p => p[0] + p[2])) - x, h = Math.max(...b.map(p => p[1] + p[3])) - y;
  return [x - w * padding, y - h * padding, w * (1 + padding * 2), h * (1 + padding * 2)];
}
function createMap() {
  MAP.forEach(f => $('#map-geography').append(makeShape(f)));
  const insetSpecs = [
    { ids: ['110000', '120000'], title: '北部沿海', padding: .18 },
    { ids: ['310000'], title: '东部沿海', padding: .3 },
    { ids: ['810000'], title: '珠江口东侧', padding: .28 },
    { ids: ['820000'], title: '珠江口西侧', padding: .28 },
  ];
  insetSpecs.forEach(spec => {
    const b = boundsUnion(spec.ids, spec.padding);
    const container = document.createElement('div'); container.className = 'inset';
    const canvas = svg('svg', { viewBox: b.join(' '), 'aria-label': `${spec.title}无名称放大图` });
    MAP.filter(f => {
      const [x, y, w, h] = f.bounds;
      return x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1];
    }).forEach(f => canvas.append(makeShape(f, spec.ids)));
    const labels = svg('g', { class: 'inset-labels' }); canvas.append(labels);
    container.dataset.ids = spec.ids.join(',');
    container.append(canvas); const caption = document.createElement('span'); caption.textContent = spec.title; container.append(caption); $('#insets').append(container);
  });
  const sc = $('#south-sea-detail');
  // The source's complete Hainan and maritime discontinuous-line geometries are retained.
  sc.setAttribute('viewBox', SOUTH_SEA_VIEW.join(' '));
  [shapeById.get('460000'), shapeById.get('100000_JD')].filter(Boolean).forEach(f => sc.append(makeShape(f)));
  updateMap();
}
function addLabel(container, id, inset = false) {
  const p = byId.get(id), f = shapeById.get(id); if (!p || !f) return;
  const loc = id === '620000' ? [f.label[0] + 8, f.label[1] - 18] : f.label;
  const attrs = { x: loc[0], y: loc[1], class: `map-label${['110000', '120000', '310000', '810000', '820000'].includes(id) ? ' small-label' : ''}`, 'data-label': id };
  if (inset) { attrs.style = `font-size:${Math.max(f.bounds[2] * .17, .3)}px;stroke-width:${Math.max(f.bounds[2] * .025, .05)}px`; attrs.x = f.bounds[0] + f.bounds[2] / 2; attrs.y = f.bounds[1] + f.bounds[3] / 2; }
  const e = svg('text', attrs); e.textContent = p.name; container.append(e);
}
function updateMap() {
  $$('.province').forEach(e => { const done = state.placed.has(e.dataset.province); e.classList.toggle('is-done', done); if (e.hasAttribute('tabindex')) e.setAttribute('aria-label', done ? `${byId.get(e.dataset.province).name}，已找到` : `未命名的省级区域 ${PROVINCES.findIndex(p => p.id === e.dataset.province) + 1}`); });
  $('#map-labels').replaceChildren();
  [...state.placed].forEach(id => addLabel($('#map-labels'), id));
  $$('.inset').forEach(e => { const labels = $('.inset-labels', e); labels.replaceChildren(); e.dataset.ids.split(',').filter(id => state.placed.has(id)).forEach(id => addLabel(labels, id, true)); });
  const candidates = $('#candidates');
  if (!candidates.children.length) PROVINCES.forEach(p => {
    const e = document.createElement('button'); e.className = 'province-token'; e.dataset.id = p.id; e.setAttribute('aria-label', `${p.name}，拖动到地图或点击后选择地图区域`); e.innerHTML = `${p.name}<span>${p.pinyin[0].toUpperCase()}</span>`; candidates.append(e);
  });
  $$('.province-token').forEach(e => { const done = state.placed.has(e.dataset.id); e.classList.toggle('placed', done); e.classList.toggle('selected', e.dataset.id === selectedProvince); e.disabled = done; e.setAttribute('aria-pressed', String(e.dataset.id === selectedProvince)); });
  $('#remaining').textContent = `${34 - state.placed.size} 个待探索`;
  candidates.hidden = state.placed.size === 34; $('#candidates-complete').hidden = state.placed.size !== 34;
}
function placeProvince(id, target, point) {
  if (state.placed.has(id)) return;
  if (id !== target) { sound('gentle'); shake($(`.province-token[data-id="${id}"]`)); toast('再看看它的形状，换个位置试试。', true); return; }
  state.placed.add(id); selectedProvince = null; save(); updateMap(); updateProgress();
  $$(`.province[data-province="${id}"]`).forEach(e => { e.classList.add('newly-done'); setTimeout(() => e.classList.remove('newly-done'), 1000); });
  const p = byId.get(id); flashAbbr(p, point); sound('correct'); burst(point?.x ?? innerWidth / 2, point?.y ?? innerHeight / 2, 24);
  toast(`${p.name}，找到了！简称「${p.abbr}」`);
  if (state.placed.size === 34) scheduleWin('map');
}
function flashAbbr(p, point) {
  const layer = $('#abbr-flash'), bounds = $('#map-canvas').getBoundingClientRect();
  const position = document.createElement('div'); position.className = 'abbr-position';
  if (point && point.x > 0 && bounds.width > 180 && bounds.height > 180) {
    position.style.left = `${Math.max(90, Math.min(bounds.width - 90, point.x - bounds.left))}px`;
    position.style.top = `${Math.max(90, Math.min(bounds.height - 90, point.y - bounds.top))}px`;
  }
  const e = document.createElement('div'); e.className = 'abbr-flash run';
  e.innerHTML = `<strong class="${p.abbr.length > 3 ? 'long-abbr' : ''}">${p.abbr}</strong><span>${p.name} · 简称</span>`;
  position.append(e); layer.append(position); layer.hidden = false;
  const timer = setTimeout(() => { position.remove(); layer.hidden = !layer.children.length; flashTimers.delete(timer); }, reducedMotion.matches ? 3600 : 2550);
  flashTimers.add(timer);
}
function setSelectedProvince(id) {
  selectedProvince = selectedProvince === id ? null : id; updateMap();
  if (selectedProvince) toast(`已选「${byId.get(id).name}」，点一下它在地图上的位置。`);
}
function provinceFromElement(element) {
  const path = element?.closest('.province');
  if (path) return path.dataset.province;
  // Single-region enlarged tiles accept their whole padded area as a touch target.
  const inset = element?.closest('.inset');
  if (inset && !inset.dataset.ids.includes(',')) return inset.dataset.ids;
}
function provinceAt(x, y) { return provinceFromElement(document.elementFromPoint(x, y)); }

function matchComplete(id, mode = state.mode) { return state.links.has(`${linkSide(mode)}:${id}`); }
function pageProvinces(page = state.pages[state.mode]) { return PROVINCES.slice(page * MATCH_SIZE, (page + 1) * MATCH_SIZE); }
function setMatchPage(page) {
  if (!isMatch(activeMode) || page < 0 || page >= MATCH_PAGES) return;
  cancelGesture(); selectedTile = null; state.pages[state.mode] = page;
  createMatch(); save(); $('#match-status').textContent = matchHint;
}
function createMatch() {
  if (!isMatch(state.mode)) return;
  const target = state.mode, batch = pageProvinces(), ids = new Set(batch.map(p => p.id));
  $('#match-panel').setAttribute('aria-labelledby', `tab-${target}`);
  $('#match-target-title').textContent = target === 'capital' ? '省会 / 首府' : '简称';
  $('#match-target-note').textContent = target === 'capital' ? '找到中心城市' : '找到它的小名';
  $('#match-target-column').dataset.column = target;
  const cols = ['name', target], orders = [batch.map(p => p.id), state.orders[target === 'abbr' ? 1 : 2].filter(id => ids.has(id))];
  ['#match-names', '#match-targets'].forEach((holder, i) => {
    $(holder).replaceChildren();
    orders[i].forEach(id => {
      const p = byId.get(id), col = cols[i], e = document.createElement('button');
      e.className = `match-tile${p[col].length > 4 ? ' small-text' : ''}`; e.dataset.id = id; e.dataset.col = col;
      e.textContent = p[col]; e.setAttribute('aria-label', `${col === 'name' ? '省名' : col === 'abbr' ? '简称' : '省会或首府'}：${p[col]}`);
      if (col === 'capital' && p.type === 'municipality') { const tag = document.createElement('span'); tag.className = 'type-tag'; tag.textContent = '直辖市'; e.append(tag); }
      $(holder).append(e);
    });
  });
  $('#match-range').textContent = `${batch[0].name} — ${batch.at(-1).name}`;
  $('#match-page-label').textContent = `第 ${state.pages[target] + 1} / ${MATCH_PAGES} 批`;
  $('#match-steps').replaceChildren();
  for (let page = 0; page < MATCH_PAGES; page++) {
    const group = pageProvinces(page), done = group.filter(p => matchComplete(p.id)).length, button = document.createElement('button');
    button.dataset.page = page;
    button.textContent = `${page + 1}${done === group.length ? ' ✓' : ''}`;
    button.setAttribute('aria-label', `第 ${page + 1} 批，${group[0].name}至${group.at(-1).name}，已完成 ${done}/${group.length} 对`);
    button.setAttribute('aria-current', page === state.pages[target] ? 'step' : 'false');
    button.classList.toggle('complete', done === group.length);
    $('#match-steps').append(button);
  }
  $('#match-status').textContent = matchHint;
  updateMatch();
}
function updateMatch() {
  if (!isMatch(state.mode)) return;
  $$('.match-tile').forEach(e => {
    const done = matchComplete(e.dataset.id); e.classList.toggle('is-done', done);
    e.classList.toggle('selected', e === selectedTile); e.setAttribute('aria-pressed', String(e === selectedTile)); e.setAttribute('aria-disabled', String(done));
  });
  const page = state.pages[state.mode], batch = pageProvinces(), done = batch.filter(p => matchComplete(p.id)).length;
  $('#match-batch-progress').textContent = `本批 ${done} / ${batch.length} 对`;
  $('#match-prev').disabled = page === 0;
  $('#match-next').disabled = page === MATCH_PAGES - 1;
  $('#match-next').classList.toggle('ready', done === batch.length && page < MATCH_PAGES - 1);
  $('#match-next').textContent = done === batch.length && page < MATCH_PAGES - 1 ? '本批完成，下一批 →' : '下一批 →';
  const step = $(`#match-steps [data-page="${page}"]`);
  if (step) {
    step.textContent = `${page + 1}${done === batch.length ? ' ✓' : ''}`;
    step.classList.toggle('complete', done === batch.length);
    step.setAttribute('aria-label', `第 ${page + 1} 批，${batch[0].name}至${batch.at(-1).name}，已完成 ${done}/${batch.length} 对`);
  }
  $('#clear-selection').disabled = !selectedTile;
  requestDraw();
}
function chooseTile(e) {
  if (matchComplete(e.dataset.id)) { toast('这一对已经连好啦，找找其他的。'); return; }
  if (!selectedTile) { selectedTile = e; updateMatch(); $('#match-status').textContent = '在另一列找到对应的卡片，再点一下。'; return; }
  if (selectedTile === e) { selectedTile = null; updateMatch(); return; }
  if (selectedTile.dataset.col === e.dataset.col) { selectedTile = e; updateMatch(); return; }
  connectTiles(selectedTile, e);
}
function connectTiles(a, b, point) {
  if (a.dataset.col === b.dataset.col) { sound('gentle'); toast('请连接左边的省名和右边的卡片。', true); selectedTile = a; updateMatch(); return; }
  if (a.dataset.id !== b.dataset.id) { sound('gentle'); shake(a); shake(b); toast('这两个还不是好朋友，再找找看。', true); selectedTile = a; updateMatch(); return; }
  const id = a.dataset.id, key = `${linkSide(state.mode)}:${id}`;
  if (state.links.has(key)) return;
  state.links.add(key); selectedTile = null; save(); updateMatch(); updateProgress(); sound('correct');
  const p = byId.get(id), batchDone = pageProvinces().every(p => matchComplete(p.id));
  $('#match-status').textContent = `✦ ${p.name} — ${p[state.mode]}，配对成功！${batchDone && roundCount(state.mode) < 34 ? '这一批完成啦，点击「下一批」继续。' : ''}`;
  const r = b.getBoundingClientRect(); burst(point?.x ?? r.x + r.width / 2, point?.y ?? r.y + r.height / 2, 14);
  if (roundCount(state.mode) === 34) scheduleWin(state.mode);
}
function requestDraw() { if (drawFrame) return; drawFrame = requestAnimationFrame(() => { drawFrame = null; drawLines(); }); }
function drawLines() {
  if (!isMatch(activeMode)) return;
  const holder = $('#connection-lines'), bounds = $('#match-board').getBoundingClientRect(); holder.replaceChildren();
  if (!bounds.width || !bounds.height) return;
  function curve(a, b, klass, color) {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.right - bounds.left - 3, y1 = ra.top + ra.height / 2 - bounds.top;
    const x2 = rb.left - bounds.left + 3, y2 = rb.top + rb.height / 2 - bounds.top;
    const dx = Math.max(20, Math.abs(x2 - x1) * .4);
    const path = svg('path', { d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, class: klass }); if (color) path.style.stroke = color; holder.append(path);
  }
  for (const key of state.links) {
    const [side, id] = key.split(':');
    if (side !== linkSide(state.mode)) continue;
    const c1 = 'name', c2 = state.mode;
    const a = $(`.match-tile[data-col="${c1}"][data-id="${id}"]`), b = $(`.match-tile[data-col="${c2}"][data-id="${id}"]`);
    if (!a || !b) continue;
    const focus = selectedTile ? selectedTile.dataset.id === id ? ' focused' : ' dimmed' : '';
    curve(a, b, `connection${focus}`, linkColors[PROVINCES.findIndex(p => p.id === id) % linkColors.length]);
  }
  if (gesture?.kind === 'match' && gesture.moved) {
    const r = gesture.element.getBoundingClientRect();
    const x = r.left + r.width / 2 - bounds.left, y = r.top + r.height / 2 - bounds.top;
    holder.append(svg('path', { d: `M${x},${y} L${gesture.x - bounds.left},${gesture.y - bounds.top}`, class: 'connection preview' }));
  }
}

function roundCount(mode) { return mode === 'map' ? state.placed.size : PROVINCES.filter(p => matchComplete(p.id, mode)).length; }
function updateProgress() {
  const collecting = activeMode === 'collection', max = collecting ? 12 : 34;
  const n = collecting ? (rewards?.modelCount || 0) : roundCount(state.mode);
  $('#progress-count').textContent = n; $('#progress-total').textContent = ` / ${max}`; $('#progress-fill').style.width = `${n / max * 100}%`;
  $('.progress-track').setAttribute('aria-valuenow', n); $('.progress-track').setAttribute('aria-valuemax', max);
  $('#progress-message').textContent = collecting ? `每次通关，都有一张新的收藏卡` : n === 34 ? '本轮奖励已入馆，再来一轮解锁新卡！' : n >= 24 ? '离通关奖励越来越近啦' : n >= 10 ? '你的地理小宇宙正在发光' : '每一步，都是新的发现';
  $('#reward-goal').hidden = collecting;
  if (!collecting) rewards?.renderGoal({ count: n, roundId: state.roundIds[state.mode] });
}
function setMode(mode) {
  cancelGesture(); pan = null; selectedProvince = null; selectedTile = null; clearTimeout(winTimer); activeMode = mode;
  if (mode !== 'collection') state.mode = mode;
  document.body.classList.toggle('is-matching', isMatch(mode));
  $$('.tab').forEach(e => { const active = e.dataset.mode === mode; e.classList.toggle('active', active); e.setAttribute('aria-selected', String(active)); e.tabIndex = active ? 0 : -1; });
  $('#map-panel').hidden = mode !== 'map'; $('#match-panel').hidden = !isMatch(mode); $('#collection-panel').hidden = mode !== 'collection';
  $('#mission-title').innerHTML = `${mode === 'map' ? '把名字，送回它的家' : isMatch(mode) ? mode === 'capital' ? '第 2 关 · 省名配省会' : '第 3 关 · 省名配简称' : '把每一次进步，变成收藏'}<span class="heading-star">✦</span>`;
  $('#mission-description').textContent = mode === 'map' ? '拖动右侧的省名，放到地图上对应的位置。' : isMatch(mode) ? '每屏 6 对，省名按拼音排列。连起两列对应的卡片，逐批完成挑战。' : '反复练习，逐辑收集。每完成一轮，就能获得一张新卡。';
  $('#progress-caption').textContent = mode === 'map' ? '探索进度' : isMatch(mode) ? '本关完成' : '型号收集';
  $('#footer-note').innerHTML = mode === 'map' ? '建议横屏游玩 <i>·</i> 触控与鼠标均可使用' : isMatch(mode) ? mode === 'capital' ? '直辖市使用市名 <i>·</i> 港澳不设省会' : '部分省份有多个简称，合并展示' : '收藏仅保存在当前浏览器 <i>·</i> 重新挑战会保留收藏';
  $('#restart').innerHTML = mode === 'collection' ? '<span aria-hidden="true">↩</span> 继续挑战' : '<span aria-hidden="true">↻</span> 重新开始';
  if (mode === 'collection') rewards?.render();
  if (isMatch(mode)) createMatch();
  updateMap(); updateMatch(); updateProgress(); save();
}
$$('.tab').forEach(e => {
  e.addEventListener('click', () => setMode(e.dataset.mode));
  e.addEventListener('keydown', ev => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) { ev.preventDefault(); const tabs = $$('.tab'), index = tabs.indexOf(e), next = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (index + (ev.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; const other = tabs[next]; setMode(other.dataset.mode); other.focus(); } });
});

function startGesture(event, kind, element) {
  if (gesture || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  element.setPointerCapture(event.pointerId);
  gesture = { kind, element, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false, ghost: null };
}
$('#candidates').addEventListener('pointerdown', e => { const b = e.target.closest('.province-token'); if (b && !b.disabled) startGesture(e, 'map', b); });
$('#match-board').addEventListener('pointerdown', e => { const b = e.target.closest('.match-tile'); if (b && !matchComplete(b.dataset.id)) startGesture(e, 'match', b); });
document.addEventListener('pointermove', e => {
  if (!gesture || gesture.pointerId !== e.pointerId) return;
  gesture.x = e.clientX; gesture.y = e.clientY;
  if (!gesture.moved && Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 7) {
    gesture.moved = true;
    if (gesture.kind === 'map') { gesture.element.classList.add('dragging'); const ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.textContent = byId.get(gesture.element.dataset.id).name; document.body.append(ghost); gesture.ghost = ghost; }
  }
  if (!gesture.moved) return;
  if (gesture.kind === 'map') {
    gesture.ghost.style.left = `${e.clientX}px`; gesture.ghost.style.top = `${e.clientY}px`;
    const target = provinceAt(e.clientX, e.clientY);
    $$('.province.is-hovered').forEach(p => p.classList.remove('is-hovered'));
    if (target && !state.placed.has(target)) $$(`.province[data-province="${target}"]`).forEach(p => p.classList.add('is-hovered'));
  } else requestDraw();
}, { passive: true });
document.addEventListener('pointerup', e => {
  if (!gesture || e.pointerId !== gesture.pointerId) return;
  const g = gesture, point = { x: e.clientX, y: e.clientY };
  if (g.kind === 'map') {
    const target = g.moved ? provinceAt(e.clientX, e.clientY) : null;
    cancelGesture();
    if (!g.moved) setSelectedProvince(g.element.dataset.id);
    else if (target) placeProvince(g.element.dataset.id, target, point);
    else { sound('gentle'); toast('把卡片放到地图区域里，或试试下方放大图。', true); }
  } else {
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.match-tile'); cancelGesture();
    if (!g.moved) chooseTile(g.element);
    else if (target && target !== g.element) connectTiles(g.element, target, point);
  }
});
function cancelGesture() {
  if (gesture) { const g = gesture; gesture = null; g.ghost?.remove(); g.element.classList.remove('dragging'); try { if (g.element.hasPointerCapture(g.pointerId)) g.element.releasePointerCapture(g.pointerId); } catch {} }
  $$('.province.is-hovered').forEach(e => e.classList.remove('is-hovered')); requestDraw();
}
document.addEventListener('pointercancel', cancelGesture);
window.addEventListener('blur', () => { cancelGesture(); pan = null; });
$('#candidates').addEventListener('click', e => { const b = e.target.closest('.province-token'); if (e.detail === 0 && b && !b.disabled) setSelectedProvince(b.dataset.id); });
$('#match-board').addEventListener('click', e => { const b = e.target.closest('.match-tile'); if (e.detail === 0 && b) chooseTile(b); });
$('#map-panel').addEventListener('click', e => { const target = provinceFromElement(e.target); if (target && selectedProvince && !pan?.moved) placeProvince(selectedProvince, target, { x: e.clientX, y: e.clientY }); });
$('#map-panel').addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key) && e.target.matches('.province')) { e.preventDefault(); if (selectedProvince) placeProvince(selectedProvince, e.target.dataset.province); else toast('先选择右侧的省名，再来地图上找位置。'); } });
$('#match-prev').addEventListener('click', () => setMatchPage(state.pages[state.mode] - 1));
$('#match-next').addEventListener('click', () => setMatchPage(state.pages[state.mode] + 1));
$('#match-steps').addEventListener('click', e => { const button = e.target.closest('[data-page]'); if (button) setMatchPage(Number(button.dataset.page)); });
$('#clear-selection').addEventListener('click', () => { selectedTile = null; $('#match-status').textContent = matchHint; updateMatch(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { selectedProvince = null; selectedTile = null; cancelGesture(); updateMap(); updateMatch(); } });

function applyView() { $('#china-map').setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); $('#zoom-out').disabled = zoom <= 1; $('#zoom-in').disabled = zoom >= 3; }
function zoomBy(factor) { const old = zoom; zoom = Math.max(1, Math.min(3, zoom * factor)); const w = 900 / zoom, h = 620 / zoom; view = { x: zoom === 1 ? 0 : view.x + (900 / old - w) / 2, y: zoom === 1 ? 0 : view.y + (620 / old - h) / 2, w, h }; applyView(); }
$('#zoom-in').addEventListener('click', () => zoomBy(1.5)); $('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.5)); $('#zoom-reset').addEventListener('click', () => { zoom = 1; view = { x: 0, y: 0, w: 900, h: 620 }; applyView(); });
$('#china-map').addEventListener('pointerdown', e => { if (zoom <= 1 || selectedProvince || gesture || !e.isPrimary || e.button !== 0) return; pan = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; $('#china-map').setPointerCapture(e.pointerId); });
$('#china-map').addEventListener('pointermove', e => { if (!pan || pan.id !== e.pointerId) return; const r = $('#china-map').getBoundingClientRect(), scale = Math.min(r.width / view.w, r.height / view.h); const dx = (e.clientX - pan.x) / scale, dy = (e.clientY - pan.y) / scale; if (Math.hypot(dx, dy) > 3) pan.moved = true; view.x = Math.max(-30, Math.min(930 - view.w, pan.vx - dx)); view.y = Math.max(-30, Math.min(650 - view.h, pan.vy - dy)); applyView(); });
$('#china-map').addEventListener('pointerup', () => { setTimeout(() => { pan = null; }, 0); });
$('#china-map').addEventListener('pointercancel', () => { pan = null; });

function updateSoundButton() { $('#sound').setAttribute('aria-pressed', String(state.muted)); $('#sound').setAttribute('aria-label', state.muted ? '开启音效' : '关闭音效'); $('#sound').title = state.muted ? '开启音效' : '关闭音效'; }
$('#sound').addEventListener('click', () => { state.muted = !state.muted; updateSoundButton(); save(); if (!state.muted) sound(); });
$('#restart').addEventListener('click', () => { if (activeMode === 'collection') { beginChallenge(state.mode); return; } cancelGesture(); $('#restart-dialog').showModal(); });
$('#cancel-restart').addEventListener('click', () => $('#restart-dialog').close());
function restartCurrent() {
  clearTimeout(winTimer); flashTimers.forEach(clearTimeout); flashTimers.clear(); $('#abbr-flash').replaceChildren(); $('#abbr-flash').hidden = true; selectedProvince = null; selectedTile = null;
  state.roundIds[state.mode] = createRoundId();
  if (state.mode === 'map') { state.placed.clear(); zoom = 1; view = { x: 0, y: 0, w: 900, h: 620 }; applyView(); updateMap(); }
  else {
    for (const key of state.links) if (key.startsWith(`${linkSide(state.mode)}:`)) state.links.delete(key);
    state.pages[state.mode] = 0;
    state.orders[state.mode === 'abbr' ? 1 : 2] = shuffle(PROVINCES.map(p => p.id)); createMatch();
  }
  save(); updateProgress(); toast('新的探索，出发！');
}
$('#confirm-restart').addEventListener('click', () => { $('#restart-dialog').close(); restartCurrent(); });
$('#about-button').addEventListener('click', () => $('#about-dialog').showModal());
$$('.dialog-close,.dialog-close-button').forEach(e => e.addEventListener('click', () => e.closest('dialog').close()));
$$('dialog').forEach(e => e.addEventListener('click', ev => { if (ev.target === e) { const r = e.getBoundingClientRect(); if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) e.close(); } }));
function showWin(mode, receipt, celebrate = true) {
  if (!receipt) return;
  $('#win-dialog').dataset.mode = mode;
  $('#win-message').textContent = mode === 'map' ? '34 个名字，都找到了自己的家。' : mode === 'capital' ? '省名与省会，34 对全部连对！' : '省名与简称，34 对全部连对！';
  $('#other-mode').textContent = mode === 'map' ? '挑战第 2 关：省名配省会 →' : mode === 'capital' ? '挑战第 3 关：省名配简称 →' : '挑战第 1 关：省份拖拽 →';
  rewards.renderWin(receipt);
  if (!$('#win-dialog').open) $('#win-dialog').showModal();
  if (celebrate) { sound('win'); burst(innerWidth / 2, innerHeight * .3, 150); }
}
function scheduleWin(mode) {
  clearTimeout(winTimer);
  // Award synchronously before any animation delay or tab change can interrupt it.
  const receipt = rewards.claim(mode, state.roundIds[mode]); updateProgress();
  winTimer = setTimeout(() => { if (activeMode === mode) showWin(mode, receipt); }, mode === 'map' ? (reducedMotion.matches ? 3750 : 2700) : 700);
}
function beginChallenge(mode) {
  $('#win-dialog').close(); setMode(mode);
  if (roundCount(mode) === 34) restartCurrent();
}
$('#play-again').addEventListener('click', () => { const mode = $('#win-dialog').dataset.mode; $('#win-dialog').close(); setMode(mode); restartCurrent(); });
$('#other-mode').addEventListener('click', () => beginChallenge(gameModes[(gameModes.indexOf($('#win-dialog').dataset.mode) + 1) % gameModes.length]));
$('#reward-goal').addEventListener('click', () => {
  const earned = rewards.getClaim(state.roundIds[state.mode]);
  if (earned) showWin(state.mode, earned, false);
  else rewards.showDetail($('#reward-goal').dataset.gun, Number($('#reward-goal').dataset.edition));
});

const canvas = $('#confetti'), ctx = canvas.getContext('2d');
let particles = [], animationFrame, lastTime = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function sizeCanvas() { const dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; ctx?.setTransform(dpr, 0, 0, dpr, 0, 0); }
function burst(x, y, count) {
  if (!ctx || reducedMotion.matches) return;
  const colors = ['#87ae77', '#d5b859', '#aa90bf', '#78a9a1', '#e0a58c'];
  for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, v = Math.random() * 4 + 2; particles.push({ x, y, vx: Math.cos(a) * v * (count > 100 ? 2 : 1), vy: Math.sin(a) * v - 3, age: 0, life: 1000 + Math.random() * 1000, size: 3 + Math.random() * 4, rotation: Math.random() * 6, color: colors[i % colors.length] }); }
  if (!animationFrame) { lastTime = performance.now(); animationFrame = requestAnimationFrame(animateParticles); }
}
function animateParticles(now) {
  const dt = Math.min((now - lastTime) / 16.67, 3); lastTime = now; ctx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter(p => p.age < p.life);
  particles.forEach(p => { p.age += dt * 16.67; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += .1 * dt; p.rotation += .06 * dt; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p.age / p.life); ctx.fillStyle = p.color; ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .55); ctx.restore(); });
  animationFrame = particles.length ? requestAnimationFrame(animateParticles) : null;
}
window.addEventListener('resize', () => { sizeCanvas(); requestDraw(); });
window.addEventListener('scroll', requestDraw, { passive: true });
new ResizeObserver(requestDraw).observe($('#match-board'));
rewards = createCollectionUI({ onChange: updateProgress, onPlay: () => beginChallenge(state.mode), onView: () => setMode('collection'), onToast: toast });
// Persist round identities before migrating any already-completed legacy games.
save();
for (const mode of gameModes) if (roundCount(mode) === 34) rewards.claim(mode, state.roundIds[mode]);
createMap(); updateSoundButton(); applyView(); sizeCanvas(); setMode(state.mode);
