import { GUNS } from './data/rewards.js';

const validGun = new Set(GUNS.map(g => g.id));
export const COLLECTION_STORE = 'yan.geo.collection.v1';
export function editionName(edition) {
  return ['初见 · 经典卡', '探索 · 银辉卡', '荣耀 · 金边卡', '星空 · 典藏卡'][edition] || `远行 · 第 ${edition + 1} 辑纪念卡`;
}
export function normalizeCollection(raw) {
  const receipts = [], rounds = new Set(), cards = new Set();
  for (const item of Array.isArray(raw?.receipts) ? raw.receipts : []) {
    if (!item || !validGun.has(item.gunId) || !['map', 'match', 'capital', 'abbr'].includes(item.mode)) continue;
    if (typeof item.roundId !== 'string' || !item.roundId || item.roundId.length > 128) continue;
    if (item.edition !== Math.floor(receipts.length / GUNS.length)) continue;
    const id = `${item.gunId}@${item.edition}`;
    if (rounds.has(item.roundId) || cards.has(id)) continue;
    rounds.add(item.roundId); cards.add(id);
    receipts.push({ id, gunId: item.gunId, edition: item.edition, sequence: receipts.length + 1, mode: item.mode, roundId: item.roundId, earnedAt: Number.isFinite(item.earnedAt) && item.earnedAt >= 0 ? item.earnedAt : 0 });
  }
  const edition = Math.floor(receipts.length / GUNS.length);
  const wish = validGun.has(raw?.wish) && !cards.has(`${raw.wish}@${edition}`) ? raw.wish : null;
  return { version: 1, receipts, wish };
}
export function nextReward(collection) {
  const edition = Math.floor(collection.receipts.length / GUNS.length);
  const owned = new Set(collection.receipts.filter(r => r.edition === edition).map(r => r.gunId));
  const gun = GUNS.find(g => g.id === collection.wish && !owned.has(g.id)) || GUNS.find(g => !owned.has(g.id));
  return { gunId: gun.id, edition, id: `${gun.id}@${edition}` };
}
export function claimReward(collection, { mode, roundId, earnedAt = Date.now() }) {
  if (!['map', 'match', 'capital', 'abbr'].includes(mode) || typeof roundId !== 'string' || !roundId || roundId.length > 128) throw new Error('Invalid completed round');
  const previous = collection.receipts.find(r => r.roundId === roundId);
  if (previous) return { collection, receipt: previous, isNew: false };
  const receipt = { ...nextReward(collection), sequence: collection.receipts.length + 1, mode, roundId, earnedAt };
  return { collection: { version: 1, receipts: [...collection.receipts, receipt], wish: null }, receipt, isNew: true };
}
