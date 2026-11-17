import { GUNS } from './data/rewards.js';
import { COLLECTION_STORE, editionName, normalizeCollection, nextReward, claimReward } from './collection.js';

export function createCollectionUI({ onChange, onPlay, onView, onToast }) {
  const $ = s => document.querySelector(s);
  const guns = new Map(GUNS.map(g => [g.id, g]));
  const read = () => { try { return normalizeCollection(JSON.parse(localStorage.getItem(COLLECTION_STORE) || '{}')); } catch { return normalizeCollection({}); } };
  let collection = read();
  let displayEdition = Math.floor(collection.receipts.length / GUNS.length);
  let detail = null;
  let saveWarned = false;
  const modeName = mode => mode === 'map' ? '省份拖拽' : '省名连连看';
  const receiptFor = (id, edition) => collection.receipts.find(r => r.id === `${id}@${edition}`);
  const art = (gun, locked = false, lazy = false) => `<div class="gun-art${locked ? ' gun-locked' : ''}"><img src="${gun.image}" alt="${locked ? `${gun.name} 待解锁轮廓` : gun.imageAlt}" ${lazy ? 'loading="lazy"' : ''} decoding="async"></div>`;

  function persist() {
    try { localStorage.setItem(COLLECTION_STORE, JSON.stringify(collection)); }
    catch { if (!saveWarned) { saveWarned = true; onToast('当前浏览器无法保存收藏，请保持页面打开以继续游玩。', true); } }
  }
  function render() {
    const next = nextReward(collection), owned = new Set(collection.receipts.map(r => r.gunId));
    $('#collection-badge').textContent = collection.receipts.length;
    $('#rounds-count').textContent = collection.receipts.length;
    const select = $('#edition-select'); select.replaceChildren();
    for (let i = 0; i <= next.edition; i++) { const option = document.createElement('option'); option.value = String(i); option.textContent = `第 ${i + 1} 辑 · ${editionName(i).split(' · ').at(-1)}`; select.append(option); }
    displayEdition = Math.min(displayEdition, next.edition); select.value = String(displayEdition);
    const grid = $('#collection-grid'); grid.dataset.finish = String(displayEdition % 4); grid.replaceChildren();
    const nextGun = guns.get(next.gunId);
    $('#collection-guide').textContent = displayEdition === next.edition ? `本辑还有 ${12 - collection.receipts.filter(r => r.edition === displayEdition).length} 张待收藏。点击轮廓选择心愿，完成一轮 34 组即可获得。` : '这一辑已经集齐。每张卡都记录着一次完整的地理挑战。';
    for (const gun of GUNS) {
      const receipt = receiptFor(gun.id, displayEdition), isWish = next.id === `${gun.id}@${displayEdition}`;
      const card = document.createElement('button'); card.type = 'button'; card.className = `collection-card${receipt ? ' owned' : ' locked'}${isWish ? ' wish' : ''}`; card.dataset.gun = gun.id; card.dataset.edition = String(displayEdition);
      card.setAttribute('aria-label', `${gun.name}，${receipt ? '已收藏，查看卡片' : isWish ? '本轮心愿奖励' : '待解锁，设为心愿奖励'}`);
      card.innerHTML = `<div class="card-top"><span>${gun.country}</span><span>${receipt ? '✓ 已收藏' : isWish ? '✦ 本轮心愿' : '待解锁'}</span></div>${art(gun, !receipt, true)}<div class="card-name"><strong>${gun.name}</strong><small>${gun.kind}</small></div><span class="card-caption">${receipt ? `No. ${String(receipt.sequence).padStart(3, '0')} · ${modeName(receipt.mode)}` : isWish ? '完成一轮，把它带回家' : '点击选择这张收藏卡'}</span>`;
      grid.append(card);
    }
    $('#collection-summary').textContent = `已认识 ${owned.size} 款名枪 · 已收藏 ${collection.receipts.length} 张卡片 · 下一张：${nextGun.name}`;
  }
  function renderGoal({ count, roundId }) {
    const earned = collection.receipts.find(r => r.roundId === roundId);
    const target = earned || nextReward(collection), gun = guns.get(target.gunId);
    $('#reward-goal').innerHTML = `<span class="goal-symbol">${earned ? '✓' : '✧'}</span><span class="goal-copy"><small>${earned ? '本轮奖励已入馆' : '本轮心愿奖励'}</small><strong>${gun.name} <i>${editionName(target.edition).split(' · ').at(-1)}</i></strong><span class="goal-stars" aria-label="${[8, 16, 24].filter(n => count >= n).length}颗探索星">${[8, 16, 24].map(n => `<b class="${count >= n ? 'lit' : ''}">✦</b>`).join('')}<em>${earned ? '点击查看' : '完成 34 组解锁'}</em></span></span>`;
    $('#reward-goal').dataset.gun = gun.id; $('#reward-goal').dataset.edition = target.edition;
  }
  function showDetail(gunId, edition = nextReward(collection).edition) {
    const gun = guns.get(gunId); if (!gun) return;
    const receipt = receiptFor(gunId, edition); detail = { gunId, edition };
    const root = $('#card-detail'); root.dataset.finish = String(edition % 4);
    root.innerHTML = `<p class="collection-eyebrow">${receipt ? 'EXPLORER’S COLLECTION · 已收藏' : 'WISH LIST · 心愿预览'}</p><span class="edition-label">${editionName(edition)} · 第 ${edition + 1} 辑</span>${art(gun, !receipt)}<h2>${gun.name}</h2><p class="gun-meta">${gun.country} <i>·</i> ${gun.kind}</p><p class="gun-story">${gun.story}</p>${receipt ? `<p class="receipt-label">No. ${String(receipt.sequence).padStart(3, '0')} · 完成「${modeName(receipt.mode)}」获得</p>` : '<p class="receipt-label">完整通关一次，解锁彩色实物图片与收藏编号。</p>'}<p class="photo-credit">图片：${gun.credit.author} · <a href="${gun.credit.licenseUrl}" target="_blank" rel="noopener">${gun.credit.license}</a> · <a href="${gun.credit.source}" target="_blank" rel="noopener">图片来源</a></p>`;
    $('#wish-button').hidden = !!receipt || edition !== nextReward(collection).edition;
    if (!$('#card-dialog').open) $('#card-dialog').showModal();
  }
  function renderWin(receipt) {
    const gun = guns.get(receipt.gunId), root = $('#win-reward'); root.dataset.finish = String(receipt.edition % 4);
    root.innerHTML = `<div class="reward-stamp">✦ 新收藏已入馆</div>${art(gun)}<strong>${gun.name}</strong><span>${gun.country} · ${editionName(receipt.edition)}</span><small>No. ${String(receipt.sequence).padStart(3, '0')} · ${modeName(receipt.mode)}</small>`;
    $('#win-collection-count').textContent = `累计通关 ${collection.receipts.length} 次 · 下一张：${guns.get(nextReward(collection).gunId).name}`;
  }
  function claim(mode, roundId) {
    // Read current storage before claiming so a different open tab is respected.
    const latest = read(); if (latest.receipts.length >= collection.receipts.length) collection = latest;
    const result = claimReward(collection, { mode, roundId }); collection = result.collection;
    if (result.isNew) { displayEdition = result.receipt.edition; persist(); }
    render(); return result.receipt;
  }
  $('#collection-grid').addEventListener('click', event => { const card = event.target.closest('.collection-card'); if (card) showDetail(card.dataset.gun, Number(card.dataset.edition)); });
  $('#edition-select').addEventListener('change', event => { displayEdition = Number(event.target.value); render(); });
  $('#wish-button').addEventListener('click', () => {
    if (!detail || detail.edition !== nextReward(collection).edition || receiptFor(detail.gunId, detail.edition)) return;
    collection.wish = detail.gunId; persist(); render(); onChange(); $('#card-dialog').close();
    onToast(`心愿已选好：${guns.get(detail.gunId).name}，完成下一轮就能获得！`);
  });
  $('#card-play').addEventListener('click', () => { $('#card-dialog').close(); onPlay(); });
  $('#continue-challenge').addEventListener('click', onPlay);
  $('#view-collection').addEventListener('click', () => { $('#win-dialog').close(); onView(); });
  window.addEventListener('storage', event => { if (event.key === COLLECTION_STORE) { collection = read(); render(); onChange(); } });
  render();
  return { render, renderGoal, showDetail, renderWin, claim, getClaim: id => collection.receipts.find(r => r.roundId === id), get count() { return collection.receipts.length; }, get modelCount() { return new Set(collection.receipts.map(r => r.gunId)).size; } };
}
