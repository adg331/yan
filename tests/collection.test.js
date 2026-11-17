import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GUNS } from '../geo/data/rewards.js';
import { normalizeCollection, nextReward, claimReward, editionName } from '../geo/collection.js';

test('twelve distinct models have real local images and attribution', async () => {
  assert.equal(GUNS.length, 12); assert.equal(new Set(GUNS.map(g => g.id)).size, 12);
  for (const gun of GUNS) {
    assert.ok(gun.credit.author && gun.credit.license);
    assert.match(gun.credit.source, /^https:\/\/commons\.wikimedia\.org\//);
    assert.match(gun.credit.licenseUrl, /^https:\/\/creativecommons\.org\//);
    const image = await readFile(new URL(`../geo/${gun.image}`, import.meta.url));
    assert.ok(image.length > 1000);
  }
});

test('120 successive completed rounds yield 120 unique cards, without a collection dead end', () => {
  let state = normalizeCollection({});
  const cardIds = new Set();
  for (let i = 0; i < 120; i++) {
    const result = claimReward(state, { mode: ['map', 'capital', 'abbr', 'match'][i % 4], roundId: `round-${i}`, earnedAt: i }); state = result.collection;
    assert.ok(result.isNew); assert.ok(!cardIds.has(result.receipt.id)); cardIds.add(result.receipt.id);
    assert.equal(result.receipt.edition, Math.floor(i / 12));
    if (i < 12) assert.equal(new Set(state.receipts.map(r => r.gunId)).size, i + 1);
  }
  assert.equal(cardIds.size, 120); assert.equal(nextReward(state).edition, 10);
  assert.ok(editionName(10).includes('11'));
  assert.deepEqual(normalizeCollection(JSON.parse(JSON.stringify(state))), state);
});

test('wish order remains unique, claims are idempotent, and invalid round modes are rejected', () => {
  let state = normalizeCollection({ wish: 'aug' });
  assert.equal(nextReward(state).gunId, 'aug');
  const first = claimReward(state, { mode: 'map', roundId: 'r1' }); state = first.collection;
  assert.equal(first.receipt.gunId, 'aug'); assert.equal(state.wish, null);
  const again = claimReward(state, { mode: 'map', roundId: 'r1' });
  assert.equal(again.isNew, false); assert.equal(again.collection.receipts.length, 1); assert.equal(again.receipt.id, first.receipt.id);
  state.wish = 'aug'; assert.notEqual(nextReward(state).gunId, 'aug');
  assert.throws(() => claimReward(state, { mode: 'collection', roundId: 'r2' }));
});

test('invalid, duplicate and future collection records cannot produce duplicate ownership', () => {
  const first = claimReward(normalizeCollection({}), { mode: 'map', roundId: 'r1' }).receipt;
  const safe = normalizeCollection({ receipts: [null, {}, { ...first, edition: 10 }, first, first, { ...first, roundId: 'r2' }], wish: first.gunId });
  assert.equal(safe.receipts.length, 1); assert.equal(safe.wish, null);
  assert.equal(normalizeCollection(null).receipts.length, 0);
});
