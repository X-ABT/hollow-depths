import { formatSouls } from '../core/MathUtil';
import {
  DUP_SHARDS,
  FOOD_BULK_COST,
  FOOD_BULK_COUNT,
  FOOD_COST_SHARDS,
  FREE_PET,
  GACHA_FOOD_CHANCE,
  GACHA_HUNDRED_COST,
  GACHA_PETS,
  GACHA_SINGLE_COST,
  GACHA_TEN_COST,
  PETS,
  PET_BY_ID,
  PET_SHOP_COST,
  RARITY_CHANCE,
  RARITY_RANK,
  sortOwnedPets,
  VOL_GROWTH,
  dmgFor,
  foodToNext,
  hpFor,
  petSlotCount,
  rollGacha,
  visualScale,
  volFor,
  type PetDef,
  type PetRarity,
} from '../data/pets';
import { Storage, type SaveData } from '../save/Storage';
import { Tex } from '../render/TexKeys';
import { atlas } from '../render/Textures';
import { ads } from '../ads/index';
import { i18nName, rarityLabel, t } from '../i18n';

type Tab = 'gacha' | 'farm' | 'shop';

/** 图标 key 缓存：Tex.Pet + PETS 下标 */
const iconOf = (() => {
  const cache = new Map<string, number>();
  return (id: string): number => {
    let k = cache.get(id);
    if (k === undefined) {
      k = Tex.Pet + PETS.findIndex((p) => p.id === id);
      cache.set(id, k);
    }
    return k;
  };
})();

const rarityClass = (r: PetRarity): string => `pet-r-${r}`;

/**
 * 宠物中心（主界面）：抽奖 / 饲养与上阵 / 碎片商店 三个页签。
 * 所有扣费操作完成后即时 Storage.save 并整屏刷新。
 */
export class PetScreen {
  private el: HTMLDivElement | null = null;
  private save: SaveData | null = null;
  private onClose: (() => void) | null = null;
  private tab: Tab = 'gacha';
  private selected: string | null = null;
  /** 「免费十连」广告播放中：防止连点/并发 */
  private adBusy = false;

  get visible(): boolean {
    return this.el !== null;
  }

  show(root: HTMLElement, save: SaveData, onClose: () => void): void {
    this.hide();
    this.save = save;
    this.onClose = onClose;
    // 打开时默认选中第一只拥有的宠物，便于直接喂养
    this.selected = save.petsOwned[0] ?? null;

    const el = document.createElement('div');
    el.className = 'overlay pet-screen';
    el.innerHTML = `
      <div class="panel pet-panel">
        <div class="pet-head">
          <h2 class="pet-title">${t('pet.center')}</h2>
          <button class="btn pet-close" aria-label="${t('pet.close')}">✕</button>
        </div>
        <div class="pet-balance">
          <span class="pet-res pet-res--soul">${t('title.soul')} <b class="pet-bal-soul"></b></span>
          <span class="pet-res pet-res--food">${t('pet.resFood')} <b class="pet-bal-food"></b></span>
          <span class="pet-res pet-res--shard">${t('pet.resShards')} <b class="pet-bal-shard"></b></span>
        </div>
        <div class="pet-tabs">
          <button class="pet-tab" data-tab="gacha">${t('pet.tabGacha')}</button>
          <button class="pet-tab" data-tab="farm">${t('pet.tabFarm')}</button>
          <button class="pet-tab" data-tab="shop">${t('pet.tabShop')}</button>
        </div>
        <div class="pet-body"></div>
      </div>
    `;
    root.appendChild(el);
    this.el = el;

    el.querySelector('.pet-close')?.addEventListener('click', () => this.hide());
    el.querySelector('.pet-body')?.addEventListener('click', (e) => this.onBodyClick(e as MouseEvent));
    for (const b of el.querySelectorAll<HTMLElement>('.pet-tab')) {
      b.addEventListener('click', () => {
        this.tab = (b.dataset.tab as Tab) ?? 'gacha';
        this.refresh();
      });
    }
    this.refresh();
  }

  /** 从抽奖/兑换/喂养的入口进入时，把某只新宠显示到饲养页签 */
  selectPet(id: string): void {
    this.selected = id;
  }

  refresh(): void {
    if (!this.el || !this.save) return;
    // 顶部余额
    const soul = this.el.querySelector('.pet-bal-soul');
    const food = this.el.querySelector('.pet-bal-food');
    const shard = this.el.querySelector('.pet-bal-shard');
    if (soul) soul.textContent = formatSouls(this.save.soulCents);
    if (food) food.textContent = `${this.save.petFood}`;
    if (shard) shard.textContent = `${this.save.petShards}`;
    // 页签高亮
    for (const b of this.el.querySelectorAll<HTMLElement>('.pet-tab')) {
      b.classList.toggle('is-on', b.dataset.tab === this.tab);
    }
    const body = this.el.querySelector('.pet-body') as HTMLElement | null;
    if (!body) return;
    body.innerHTML = '';
    if (this.tab === 'gacha') this.renderGacha(body);
    else if (this.tab === 'farm') this.renderFarm(body);
    else this.renderShop(body);
  }

  // ——————————————— 抽奖页签 ———————————————
  private renderGacha(body: HTMLElement): void {
    const d = document.createElement('div');
    d.className = 'pet-gacha';
    const pct = (n: number): string => `${(n * 100).toFixed(2).replace(/\.?0+$/, '')}`;
    d.innerHTML = `
      <div class="pet-gacha-actions">
        <button class="btn pet-gacha-btn" data-pull="1">${t('pet.draw1')}<br><span class="pet-cost">${t('pet.souls', { n: GACHA_SINGLE_COST })}</span></button>
        <button class="btn pet-gacha-btn pet-gacha-btn--ten" data-pull="10">${t('pet.draw10')}<br><span class="pet-cost">${t('pet.souls10', { n: GACHA_TEN_COST })}</span></button>
        <button class="btn pet-gacha-btn pet-gacha-btn--hundred" data-pull="100">${t('pet.draw100')}<br><span class="pet-cost">${t('pet.souls100', { n: GACHA_HUNDRED_COST })}</span></button>
        <button class="btn pet-gacha-btn pet-gacha-btn--ad" data-adpull="10">${t('pet.free10')}<br><span class="pet-cost">${t('pet.free10Hint')}</span></button>
      </div>
      <p class="pet-gacha-note">${t('pet.gachaNote', {
        pet: pct(1 - GACHA_FOOD_CHANCE),
        c: pct(RARITY_CHANCE.common),
        r: pct(RARITY_CHANCE.rare),
        l: pct(RARITY_CHANCE.legend),
        food: pct(GACHA_FOOD_CHANCE),
      })}</p>
      <div class="pet-result"></div>
    `;
    body.appendChild(d);
    for (const b of d.querySelectorAll<HTMLElement>('[data-pull]')) {
      b.addEventListener('click', () => {
        const pulls = Number(b.dataset.pull ?? '1');
        const cost = pulls >= 100 ? GACHA_HUNDRED_COST : pulls >= 10 ? GACHA_TEN_COST : GACHA_SINGLE_COST;
        this.doGacha(pulls, cost);
      });
    }
    // 广告免费十连：独立入口，绝不走付费扣款路径
    for (const b of d.querySelectorAll<HTMLElement>('[data-adpull]')) {
      b.addEventListener('click', () => {
        if (!this.adBusy) void this.freeTen(b);
      });
    }
  }

  /** 看广告免费十连：完整观看（rewarded）才发放且不扣灵魂；取消/失败还原按钮 */
  private async freeTen(btn: HTMLElement): Promise<void> {
    if (!this.save || !this.el || this.adBusy) return;
    this.adBusy = true;
    btn.classList.add('is-busy');
    btn.setAttribute('aria-disabled', 'true');
    const orig = btn.innerHTML;
    btn.innerHTML = t('pet.adBusy');
    const out = await ads.showRewardedAd('pet_free_ten');
    this.adBusy = false;
    if (out === 'rewarded') {
      // doGacha 内部整屏刷新，会重建按钮，无需还原
      this.doGacha(10, 0);
      return;
    }
    // 取消 / 播放失败：还原按钮可再点
    btn.classList.remove('is-busy');
    btn.removeAttribute('aria-disabled');
    btn.innerHTML = orig;
  }

  /** 批量抽：扣款后逐抽结算并聚合展示（粮食合计一行，每种宠物一行） */
  private doGacha(pulls: number, cost: number): void {
    if (!this.save || !this.el) return;
    if (this.save.soulCents < cost * 100) return;
    this.save.soulCents -= cost * 100;

    let foodGot = 0;
    const petAgg = new Map<
      string,
      { def: PetDef; isNew: boolean; times: number; shards: number }
    >();
    const newly = new Set<string>();
    for (let i = 0; i < pulls; i++) {
      const r = rollGacha(Math.random);
      if (r.kind === 'food') {
        foodGot += r.count;
        continue;
      }
      const pet = r.pet;
      const rec = petAgg.get(pet.id) ?? { def: pet, isNew: false, times: 0, shards: 0 };
      rec.times++;
      if (!this.save.petsOwned.includes(pet.id) && !newly.has(pet.id)) {
        this.save.petsOwned.push(pet.id);
        newly.add(pet.id);
        rec.isNew = true;
      } else {
        const s = DUP_SHARDS[pet.rarity];
        this.save.petShards += s;
        rec.shards += s;
      }
      petAgg.set(pet.id, rec);
    }
    if (foodGot > 0) this.save.petFood += foodGot;
    Storage.save(this.save);

    // 聚合结果行
    const log: { text: string; pet?: PetDef; isNew?: boolean; food: number }[] = [];
    if (foodGot > 0) log.push({ text: t('pet.drawResultFood', { n: foodGot }), food: foodGot });
    for (const rec of petAgg.values()) {
      const text = rec.isNew
        ? t('pet.drawResultNew', { name: i18nName(rec.def) })
        : t('pet.drawResultDup', { name: i18nName(rec.def), n: rec.times, s: rec.shards });
      log.push({ text, pet: rec.def, isNew: rec.isNew, food: 0 });
    }
    // 新宠自动切到饲养页方便查看
    const firstNew = log.find((l) => l.isNew);
    if (firstNew?.pet) this.selected = firstNew.pet.id;
    // 先整屏刷新（会重建 .pet-result），再渲染本轮结果，避免结果被清空
    this.refresh();
    this.showResult(log);
  }

  /** 渲染最近一次抽奖结果卡片 */
  private showResult(log: { text: string; pet?: PetDef; isNew?: boolean; food: number }[]): void {
    const box = this.el?.querySelector('.pet-result');
    if (!box) return;
    box.innerHTML = '';
    for (const item of log) {
      const row = document.createElement('div');
      row.className = 'pet-result-row' + (item.isNew ? ' pet-result-row--new' : '');
      const ico = document.createElement('span');
      ico.className = 'pet-result-ico';
      if (item.pet) {
        ico.appendChild(atlas.icon(iconOf(item.pet.id), 40));
      } else {
        ico.appendChild(atlas.icon(Tex.PetFood, 32));
      }
      row.appendChild(ico);
      const t = document.createElement('span');
      t.className = 'pet-result-text';
      t.textContent = item.text;
      row.appendChild(t);
      box.appendChild(row);
    }
  }

  // ——————————————— 饲养页签 ———————————————
  private renderFarm(body: HTMLElement): void {
    if (!this.save) return;
    const owned = sortOwnedPets(this.save.petsOwned, this.save.petLevels)
      .map((id) => PET_BY_ID[id])
      .filter((p): p is PetDef => !!p);
    const slots = petSlotCount(owned.length);
    const loadout = this.save.petLoadout.filter((id) => this.save?.petsOwned.includes(id) ?? false);

    const d = document.createElement('div');
    d.className = 'pet-farm';
    // 免费基础宠物（一生一次，不进抽奖池）
    if (!this.save.freePetClaimed && !this.save.petsOwned.includes(FREE_PET.id)) {
      const fb = document.createElement('div');
      fb.className = 'pet-free';
      const ico = document.createElement('span');
      ico.className = 'pet-ic';
      ico.appendChild(atlas.icon(iconOf(FREE_PET.id), 40));
      const txt = document.createElement('span');
      txt.className = 'pet-free-text';
      txt.innerHTML = `<b>${i18nName(FREE_PET)}</b> ${t('pet.freeBanner')}`;
      const act = document.createElement('button');
      act.className = 'btn btn--primary';
      act.dataset.free = '1';
      act.textContent = t('pet.claimFree');
      fb.append(ico, txt, act);
      d.appendChild(fb);
    }
    const list = document.createElement('div');
    list.className = 'pet-farm-list';
    if (owned.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pet-empty';
      empty.textContent = t('pet.noOwned');
      list.appendChild(empty);
    } else {
      for (const p of owned) {
        const lv = this.save.petLevels[p.id] ?? 1;
        const on = loadout.includes(p.id);
        const sel = p.id === this.selected;
        const row = document.createElement('div');
        row.className = 'pet-farm-row' + ` ${rarityClass(p.rarity)}` + (sel ? ' is-sel' : '');
        row.dataset.pick = p.id;
        const ico = document.createElement('span');
        ico.className = 'pet-ic';
        ico.appendChild(atlas.icon(iconOf(p.id), 44));
        row.appendChild(ico);
        const info = document.createElement('span');
        info.className = 'pet-farm-info';
        info.innerHTML = `<b>${i18nName(p)}</b><span class="pet-lv">${t('pet.lv', { lv })}</span><span class="pet-tag">${rarityLabel(p.rarity)}</span>`;
        row.appendChild(info);
        const act = document.createElement('button');
        act.className = 'btn pet-mini' + (on ? ' pet-mini--off' : '');
        act.dataset.toggle = p.id;
        act.textContent = on ? t('pet.offBattle') : t('pet.onBattle');
        row.appendChild(act);
        list.appendChild(row);
      }
    }
    d.appendChild(list);

    // 上阵槽
    const slotsEl = document.createElement('div');
    slotsEl.className = 'pet-slots';
    for (let i = 0; i < slots; i++) {
      const chip = document.createElement('div');
      chip.className = 'pet-slot';
      const id = loadout[i];
      const def = id ? PET_BY_ID[id] : undefined;
      if (def) {
        chip.className += ` ${rarityClass(def.rarity)}`;
        chip.appendChild(atlas.icon(iconOf(def.id), 30));
        const n = document.createElement('span');
        n.textContent = i18nName(def);
        chip.appendChild(n);
      } else {
        chip.classList.add('pet-slot--empty');
        chip.textContent = t('pet.emptySlot');
      }
      slotsEl.appendChild(chip);
    }
    const slotTip = document.createElement('p');
    slotTip.className = 'pet-slot-tip';
    slotTip.textContent = t('pet.slotTip', { a: loadout.length, b: slots });
    d.appendChild(slotsEl);
    d.appendChild(slotTip);

    // 选中宠物详情
    const sel = this.selected && PET_BY_ID[this.selected] ? PET_BY_ID[this.selected] : undefined;
    const ownedSel = sel && this.save.petsOwned.includes(sel.id) ? sel : owned[0];
    const detail = document.createElement('div');
    detail.className = 'pet-detail';
    if (ownedSel) {
      const lv = this.save.petLevels[ownedSel.id] ?? 1;
      const need = foodToNext(lv);
      detail.innerHTML = `
        <div class="pet-detail-head ${rarityClass(ownedSel.rarity)}">
          <span class="pet-detail-ico"></span>
          <div class="pet-detail-title">
            <b>${i18nName(ownedSel)}</b>
            <span class="pet-tag">${rarityLabel(ownedSel.rarity)}</span>
            <span class="pet-lv">${t('pet.lv', { lv })}</span>
          </div>
        </div>
        <div class="pet-stat-grid">
          <div class="pet-stat"><b>${volFor(ownedSel, lv).toFixed(1)}</b><span>${t('pet.statVol')}</span></div>
          <div class="pet-stat"><b>${hpFor(ownedSel, lv)}</b><span>${t('pet.statHp')}</span></div>
          <div class="pet-stat"><b>${dmgFor(ownedSel, lv)}</b><span>${t('pet.statDmg')}</span></div>
          <div class="pet-stat"><b>${Math.round(visualScale(ownedSel, lv) * 100)}%</b><span>${t('pet.statSize')}</span></div>
        </div>
        <p class="pet-rule">${t('pet.growRule', { v: VOL_GROWTH[ownedSel.rarity] })}</p>
        <button class="btn btn--primary pet-feed" data-feed="${ownedSel.id}">${t('pet.feedNeed', { n: need })}</button>
      `;
      (detail.querySelector('.pet-detail-ico') as HTMLElement).appendChild(atlas.icon(iconOf(ownedSel.id), 72));
      // 上阵/下阵选中宠物
      const isOn = loadout.includes(ownedSel.id);
      const tgl = document.createElement('button');
      tgl.className = 'btn pet-mini pet-toggle' + (isOn ? ' pet-mini--off' : '');
      tgl.textContent = isOn ? t('pet.moveOut') : t('pet.fightNow');
      detail.appendChild(tgl);
    } else {
      detail.innerHTML = `<div class="pet-empty">${t('pet.noDetail')}</div>`;
    }
    d.appendChild(detail);
    body.appendChild(d);
  }

  // ——————————————— 碎片商店页签 ———————————————
  private renderShop(body: HTMLElement): void {
    if (!this.save) return;
    const ownedSet = new Set(this.save.petsOwned);
    const d = document.createElement('div');
    d.className = 'pet-shop';

    const secTitle = (t: string): HTMLElement => {
      const el = document.createElement('div');
      el.className = 'shop-section';
      el.textContent = t;
      return el;
    };

    d.appendChild(secTitle(t('pet.exchangePets')));
    const petList = document.createElement('div');
    petList.className = 'shop-list pet-shop-list';
    // 仅可兑换抽奖池宠物（免费赠送宠不可兑换），传说/稀有在前，同档未拥有的排前面
    const sorted = [...GACHA_PETS].sort((a, b) => {
      if (RARITY_RANK[b.rarity] !== RARITY_RANK[a.rarity]) return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity];
      return Number(ownedSet.has(a.id)) - Number(ownedSet.has(b.id));
    });
    for (const p of sorted) {
      const row = document.createElement('div');
      const owned = ownedSet.has(p.id);
      row.className = `shop-item pet-shop-item ${rarityClass(p.rarity)}` + (owned ? ' shop-item--owned' : '');
      const ico = document.createElement('div');
      ico.className = 'shop-item-icon';
      ico.appendChild(atlas.icon(iconOf(p.id), 36));
      const info = document.createElement('div');
      info.className = 'shop-item-info';
      info.innerHTML = `<div class="shop-item-name">${i18nName(p)}<span class="shop-item-tag pet-tag">${rarityLabel(p.rarity)}</span></div>
        <div class="shop-item-desc">${t('pet.baseStats', { v: p.baseVol, hp: p.baseHp, d: p.baseDmg })}</div>`;
      const action = document.createElement('div');
      action.className = 'shop-item-action';
      if (owned) {
        const span = document.createElement('span');
        span.className = 'shop-owned';
        span.textContent = t('pet.owned');
        action.appendChild(span);
      } else {
        const cost = PET_SHOP_COST[p.rarity];
        const btn = document.createElement('button');
        btn.className = 'btn pet-buy';
        btn.dataset.pet = p.id;
        btn.textContent = t('pet.shardCost', { n: cost });
        if (this.save.petShards < cost) btn.classList.add('is-disabled');
        action.appendChild(btn);
      }
      row.append(ico, info, action);
      petList.appendChild(row);
    }
    d.appendChild(petList);

    d.appendChild(secTitle(t('pet.exchangeFood')));
    const food = document.createElement('div');
    food.className = 'pet-food-shop';
    for (const n of [1, 5, 10]) {
      const cost = n * FOOD_COST_SHARDS;
      const btn = document.createElement('button');
      btn.className = 'btn pet-food-buy';
      btn.dataset.food = `${n}`;
      btn.innerHTML = `${t('pet.bags', { n })}<br><span class="pet-cost">${t('pet.shardCost', { n: cost })}</span>`;
      if (this.save.petShards < cost) btn.classList.add('is-disabled');
      food.appendChild(btn);
    }
    // 整包特惠：100 碎片换 FOOD_BULK_COUNT 袋粮
    const bulkCost = FOOD_BULK_COST;
    const bulk = document.createElement('button');
    bulk.className = 'btn pet-food-buy pet-food-buy--bulk';
    bulk.dataset.bulkfood = '1';
    bulk.innerHTML = `${t('pet.bulkTag', { n: FOOD_BULK_COUNT })}<br><span class="pet-cost">${t('pet.bulkSub', { count: FOOD_BULK_COUNT, cost: bulkCost })}</span>`;
    if (this.save.petShards < bulkCost) bulk.classList.add('is-disabled');
    food.appendChild(bulk);
    d.appendChild(food);
    body.appendChild(d);
  }

  /** 事件委托：饲养列表点选 / 上阵下阵 / 投喂 / 商店兑换 */
  private onBodyClick(e: MouseEvent): void {
    if (!this.save || !this.el) return;
    const t = e.target as HTMLElement;
    const pickBtn = t.closest<HTMLElement>('[data-pick]');
    const toggle = t.closest<HTMLElement>('[data-toggle]');
    const feed = t.closest<HTMLElement>('[data-feed]');
    const petBuy = t.closest<HTMLElement>('[data-pet]');
    const foodBuy = t.closest<HTMLElement>('[data-food]');
    const bulkFood = t.closest<HTMLElement>('[data-bulkfood]');
    const freeClaim = t.closest<HTMLElement>('[data-free]');
    const toggleDetail = t.closest<HTMLElement>('.pet-toggle');
    if (pickBtn) {
      this.selected = pickBtn.dataset.pick ?? this.selected;
      this.refresh();
      return;
    }
    if (toggle) {
      const id = toggle.dataset.toggle ?? '';
      if (id) this.toggleLoadout(id);
      return;
    }
    if (toggleDetail && this.selected) {
      this.toggleLoadout(this.selected);
      return;
    }
    if (feed) {
      const id = feed.dataset.feed ?? '';
      if (id) this.feed(id);
      return;
    }
    if (freeClaim) {
      if (!this.save.freePetClaimed && !this.save.petsOwned.includes(FREE_PET.id)) {
        this.save.petsOwned.push(FREE_PET.id);
        this.save.freePetClaimed = true;
        Storage.save(this.save);
        this.selected = FREE_PET.id;
        this.refresh();
      }
      return;
    }
    if (petBuy) {
      const id = petBuy.dataset.pet ?? '';
      const def = PET_BY_ID[id];
      if (def && this.save.petShards >= PET_SHOP_COST[def.rarity] && !this.save.petsOwned.includes(id)) {
        this.save.petShards -= PET_SHOP_COST[def.rarity];
        this.save.petsOwned.push(id);
        Storage.save(this.save);
        this.selected = id;
        this.refresh();
      }
      return;
    }
    if (foodBuy) {
      const n = Number(foodBuy.dataset.food ?? '0');
      const cost = n * FOOD_COST_SHARDS;
      if (n > 0 && this.save.petShards >= cost) {
        this.save.petShards -= cost;
        this.save.petFood += n;
        Storage.save(this.save);
        this.refresh();
      }
      return;
    }
    if (bulkFood) {
      if (this.save.petShards >= FOOD_BULK_COST) {
        this.save.petShards -= FOOD_BULK_COST;
        this.save.petFood += FOOD_BULK_COUNT;
        Storage.save(this.save);
        this.refresh();
      }
    }
  }

  private toggleLoadout(id: string): void {
    if (!this.save) return;
    const def = PET_BY_ID[id];
    if (!def || !this.save.petsOwned.includes(id)) return;
    const loadout = this.save.petLoadout;
    const idx = loadout.indexOf(id);
    const slots = petSlotCount(this.save.petsOwned.length);
    if (idx >= 0) {
      loadout.splice(idx, 1);
    } else {
      if (loadout.length >= slots) return;
      loadout.push(id);
    }
    Storage.save(this.save);
    this.refresh();
  }

  private feed(id: string): void {
    if (!this.save) return;
    const def = PET_BY_ID[id];
    if (!def || !this.save.petsOwned.includes(id)) return;
    const lv = this.save.petLevels[id] ?? 1;
    const need = foodToNext(lv);
    if (this.save.petFood < need) return;
    this.save.petFood -= need;
    this.save.petLevels[id] = lv + 1;
    Storage.save(this.save);
    this.selected = id;
    this.refresh();
  }

  hide(): void {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.save = null;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }
}
