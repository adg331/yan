import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { PROVINCES } from '../geo/data/provinces.js';
import { MAP, SOUTH_SEA_VIEW } from '../geo/data/map.js';

const html = await readFile(new URL('../geo/index.html', import.meta.url), 'utf8');
const code = (await readFile(new URL('../geo/app.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
const key = 'yan.geo.progress.v1';

function launch(saved) {
  const dom = new JSDOM(html, { url: 'http://localhost/yan/geo/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  let oscillators = 0;
  Object.assign(w, { PROVINCES, MAP, SOUTH_SEA_VIEW });
  w.matchMedia = () => ({ matches: false });
  w.ResizeObserver = class { observe() {} };
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.HTMLElement.prototype.setPointerCapture = function () {};
  w.HTMLElement.prototype.hasPointerCapture = () => false;
  w.AudioContext = class {
    state = 'running'; currentTime = 0; destination = {};
    createOscillator() { oscillators++; return { frequency: {}, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  };
  // jsdom has no layout engine. Synthetic boxes only exercise SVG line construction.
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'match-board') return { left: 0, top: 0, x: 0, y: 0, width: 960, height: 610, right: 960, bottom: 610 };
    const col = ['name', 'abbr', 'capital'].indexOf(this.dataset.col);
    const idx = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
    const x = Math.max(col, 0) * 320 + (idx % 2) * 140, y = Math.floor(idx / 2) * 32;
    return { left: x, top: y, x, y, width: 130, height: 27, right: x + 130, bottom: y + 27 };
  };
  if (saved !== undefined) w.localStorage.setItem(key, typeof saved === 'string' ? saved : JSON.stringify(saved));
  w.eval(code);
  const q = selector => w.document.querySelector(selector);
  const click = selector => { const el = typeof selector === 'string' ? q(selector) : selector; assert.ok(el, `Missing ${selector}`); el.click(); };
  const tile = (col, id) => q(`.match-tile[data-col="${col}"][data-id="${id}"]`);
  const progress = () => Number(q('#progress-count').textContent);
  const stored = () => JSON.parse(w.localStorage.getItem(key));
  function pointer(target, type, x, y) {
    const ev = new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperties(ev, { pointerId: { value: 1 }, isPrimary: { value: true } }); target.dispatchEvent(ev);
  }
  function dragMap(id, targetId) {
    const source = q(`.province-token[data-id="${id}"]`), target = q(`#map-geography .province[data-province="${targetId}"]`);
    w.document.elementFromPoint = () => target;
    pointer(source, 'pointerdown', 20, 20); pointer(w.document, 'pointermove', 250, 250); pointer(w.document, 'pointerup', 250, 250);
  }
  function dragLine(col1, id1, col2, id2) {
    const source = tile(col1, id1), target = tile(col2, id2);
    w.document.elementFromPoint = () => target;
    pointer(source, 'pointerdown', 20, 20); pointer(w.document, 'pointermove', 400, 300); pointer(w.document, 'pointerup', 400, 300);
  }
  return { w, q, click, tile, progress, stored, dragMap, dragLine, sounds: () => oscillators, close: () => w.close() };
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('34 unique learning groups match every map region, with north upwards and complete sea inset', () => {
  assert.equal(PROVINCES.length, 34);
  assert.equal(new Set(PROVINCES.map(p => p.id)).size, 34);
  assert.deepEqual(new Set(MAP.filter(f => f.label).map(f => f.id)), new Set(PROVINCES.map(p => p.id)));
  for (let i = 1; i < PROVINCES.length; i++) assert.ok(PROVINCES[i - 1].pinyin.localeCompare(PROVINCES[i].pinyin, 'en') <= 0);
  const byMap = new Map(MAP.map(f => [f.id, f]));
  assert.ok(byMap.get('230000').label[1] < byMap.get('460000').label[1], 'Heilongjiang must be north of Hainan');
  assert.ok(byMap.get('650000').label[0] < byMap.get('310000').label[0], 'Xinjiang must be west of Shanghai');
  const [x, y, width, height] = SOUTH_SEA_VIEW;
  for (const id of ['460000', '100000_JD']) {
    const numbers = byMap.get(id).path.match(/-?\d+(?:\.\d+)?/g).map(Number);
    for (let i = 0; i < numbers.length; i += 2) assert.ok(numbers[i] >= x && numbers[i] <= x + width && numbers[i + 1] >= y && numbers[i + 1] <= y + height, `${id} must fit inside the sea inset`);
  }
  assert.equal(PROVINCES.find(p => p.id === '150000').abbr, '内蒙古');
  assert.ok(PROVINCES.filter(p => p.type === 'special').every(p => p.capital.includes('不设省会')));
});

test('blank map reveals no province names; wrong drop retries, correct touch drag embeds name and saves progress', () => {
  const app = launch();
  try {
    assert.equal(app.q('#map-labels').textContent, '');
    assert.equal(app.w.document.querySelectorAll('.province-token').length, 34);
    app.dragMap('340000', '350000'); assert.equal(app.progress(), 0); assert.deepEqual(app.stored().placed, []);
    app.dragMap('340000', '340000'); assert.equal(app.progress(), 1);
    assert.match(app.q('#map-labels').textContent, /安徽/);
    assert.equal(app.q('#abbr-flash strong').textContent, '皖');
    assert.ok(app.q('#abbr-flash .abbr-flash').classList.contains('run'));
    assert.ok(app.q('.province-token[data-id="340000"]').disabled);
    assert.deepEqual(app.stored().placed, ['340000']);
    assert.equal(app.w.document.querySelectorAll('.drag-ghost').length, 0);
  } finally { app.close(); }
});

test('map tap fallback, small-area inset and pointer cancellation work', () => {
  const app = launch();
  try {
    app.click('.province-token[data-id="820000"]');
    app.q('.inset[data-ids="820000"]').dispatchEvent(new app.w.MouseEvent('click', { bubbles: true }));
    assert.equal(app.progress(), 1);
    assert.match(app.q('.inset[data-ids="820000"] .inset-labels').textContent, /澳门/);
    const source = app.q('.province-token[data-id="110000"]');
    const ev = new app.w.MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperties(ev, { pointerId: { value: 1 }, isPrimary: { value: true } }); source.dispatchEvent(ev);
    app.w.document.dispatchEvent(new app.w.Event('pointercancel'));
    app.dragMap('110000', '110000'); assert.equal(app.progress(), 2);
  } finally { app.close(); }
});

test('34 matching groups are present; skip-column and incorrect links fail; both links are required', () => {
  const app = launch();
  try {
    app.click('#tab-match');
    for (const id of ['#match-names', '#match-abbrs', '#match-capitals']) assert.equal(app.q(id).children.length, 34);
    app.dragLine('name', '340000', 'capital', '340000'); assert.equal(app.stored().links.length, 0);
    app.dragLine('name', '340000', 'abbr', '350000'); assert.equal(app.stored().links.length, 0);
    app.dragLine('name', '340000', 'abbr', '340000'); assert.equal(app.progress(), 0); assert.equal(app.stored().links.length, 1);
    app.dragLine('capital', '340000', 'abbr', '340000'); assert.equal(app.progress(), 1); assert.equal(app.stored().links.length, 2);
    assert.ok(app.tile('capital', '340000').classList.contains('is-done'));
  } finally { app.close(); }
});

test('all 34 matching groups can finish, render 68 fixed links, celebrate and restart', async () => {
  const app = launch();
  try {
    app.click('#tab-match');
    for (const p of PROVINCES) {
      app.click(app.tile('name', p.id)); app.click(app.tile('abbr', p.id));
      app.click(app.tile('abbr', p.id)); app.click(app.tile('capital', p.id));
    }
    assert.equal(app.progress(), 34); assert.equal(app.stored().links.length, 68);
    await wait(800);
    assert.equal(app.w.document.querySelectorAll('#connection-lines .connection').length, 68);
    assert.ok(app.q('#win-dialog').open);
    app.click('#play-again'); assert.equal(app.progress(), 0); assert.equal(app.stored().links.length, 0); assert.ok(!app.q('#win-dialog').open);
  } finally { app.close(); }
});

test('all 34 map drops finish and celebrate after the final abbreviation flashes', async () => {
  const app = launch();
  try {
    for (const p of PROVINCES) app.dragMap(p.id, p.id);
    assert.equal(app.progress(), 34); assert.equal(app.w.document.querySelectorAll('#map-labels text').length, 34);
    assert.equal(app.q('#abbr-flash').children.length, 34, 'rapid correct answers must not interrupt earlier three-flash effects');
    assert.ok(!app.q('#candidates-complete').hidden); assert.ok(!app.q('#win-dialog').open);
    await wait(2800); assert.ok(app.q('#win-dialog').open); assert.ok(app.q('#abbr-flash').hidden);
    app.click('#other-mode'); assert.equal(app.progress(), 0); app.click('#tab-map'); assert.equal(app.progress(), 34);
  } finally { app.close(); }
});

test('reload retains separate progress and shuffled orders; restart is scoped; muted sound creates no tones', () => {
  let app = launch(), saved;
  try {
    app.dragMap('340000', '340000'); app.click('#tab-match'); app.dragLine('name', '350000', 'abbr', '350000');
    saved = app.stored();
  } finally { app.close(); }
  app = launch(saved);
  try {
    assert.equal(app.q('#tab-match').getAttribute('aria-selected'), 'true');
    assert.deepEqual(app.stored().orders, saved.orders); assert.equal(app.stored().links.length, 1);
    app.click('#tab-map'); assert.equal(app.progress(), 1);
    app.click('#sound'); const before = app.sounds(); app.dragMap('350000', '350000'); assert.equal(app.sounds(), before);
    app.click('#restart'); app.click('#cancel-restart'); assert.equal(app.progress(), 2);
    app.click('#restart'); app.click('#confirm-restart'); assert.equal(app.progress(), 0);
    app.click('#tab-match'); assert.equal(app.stored().links.length, 1);
  } finally { app.close(); }
});

test('corrupt or stale saved state recovers without accepting invalid IDs or incomplete card orders', () => {
  for (const value of ['{broken json', { placed: ['invalid', '340000'], links: ['a:invalid', 'c:340000', 'a:340000'], orders: [['340000']], mode: 'unknown' }]) {
    const app = launch(value);
    try {
      assert.equal(app.w.document.querySelectorAll('.province-token').length, 34);
      for (const order of app.stored().orders) assert.equal(new Set(order).size, 34);
      assert.ok(app.stored().placed.every(id => PROVINCES.some(p => p.id === id)));
      assert.ok(app.stored().links.every(k => k === 'a:340000'));
    } finally { app.close(); }
  }
});
