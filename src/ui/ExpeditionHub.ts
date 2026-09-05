import {
  PETS,
  PET_BY_ID,
  RARITY_LABEL,
  dmgFor,
  hpFor,
  skillEffectText,
  skillFor,
  skillLevel,
  skillUpgradeCost,
  sortOwnedPets,
  visualScale,
  type PetDef,
  type PetRarity,
} from '../data/pets';
import { STAR_PER_SHARD } from '../data/expedition';
import { Storage, type SaveData } from '../save/Storage';
import { Tex } from '../render/TexKeys';
import { atlas } from '../render/Textures';

export interface ExpeditionHubHandlers {
  onClose: () => void;
  onStart: (petId: string) => void;
}

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
 * 宠物远征营地：选宠 / 星币升技能 / 星币兑碎片 / 开始挑战。
 * 顶部单列叠加层（背景即标题页），关闭即回标题。
 */
export class ExpeditionHub {
  private el: HTMLDivElement | null = null;
  private save: SaveData | null = null;
  private handlers: ExpeditionHubHandlers | null = null;
  private selected: string | null = null;
  /** 星币兑碎片：当前想兑的碎片数（可自选，不再一次兑光） */
  private exWant = 1;

  show(root: HTMLElement, save: SaveData, h: ExpeditionHubHandlers): void {
    this.hide();
    if (save.petsOwned.length === 0) {
      // 没有宠物无法出战：提示先去饲养园
      const tip = document.createElement('div');
      tip.className = 'overlay exp-hub';
      tip.innerHTML = `
        <div class="panel exp-panel">
          <h2 class="exp-title">宠物远征</h2>
          <p class="exp-note">需要先拥有一只宠物才能出战。去「饲养园」抽一只或免费领取基础宠物吧。</p>
          <div class="exp-actions"><button class="btn btn--primary" data-act="back">返回标题</button></div>
        </div>`;
      tip.querySelector('[data-act="back"]')?.addEventListener('click', () => h.onClose());
      root.appendChild(tip);
      this.el = tip;
      return;
    }
    this.save = save;
    this.handlers = h;
    // 默认选最稀有的（列表按稀有度降序后的第一只）
    this.selected = sortOwnedPets(save.petsOwned, save.petLevels)[0] ?? save.petsOwned[0] ?? null;
    this.exWant = 1;

    const el = document.createElement('div');
    el.className = 'overlay exp-hub';
    el.innerHTML = `
      <div class="panel exp-panel">
        <div class="exp-head">
          <h2 class="exp-title">宠物远征</h2>
          <span class="exp-star">★ 星币 <b class="exp-bal-star">0</b></span>
        </div>
        <p class="exp-note">单宠驻守、自动平A；点技能按钮手动放大招。通关得星币，星币可升技能 / 兑碎片。</p>
        <div class="exp-pets"></div>
        <div class="exp-detail"></div>
        <div class="exp-actions">
          <button class="btn btn--primary exp-start" data-act="start">开始挑战（第 1 关）</button>
          <button class="btn btn--ghost" data-act="back">返回标题</button>
        </div>
      </div>`;
    root.appendChild(el);
    this.el = el;

    el.querySelector('[data-act="start"]')?.addEventListener('click', () => {
      if (this.selected) this.handlers?.onStart(this.selected);
    });
    el.querySelector('[data-act="back"]')?.addEventListener('click', () => this.handlers?.onClose());
    el.addEventListener('click', (e) => this.onClick(e as MouseEvent));

    this.refresh();
  }

  /** 选宠点击事件委托 */
  private onClick(e: MouseEvent): void {
    if (!this.save || !this.el) return;
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>('[data-pick]');
    if (pick) {
      this.selected = pick.dataset.pick ?? this.selected;
      this.refresh();
      return;
    }
    const up = t.closest<HTMLElement>('[data-up]');
    if (up) {
      this.upgradeSkill(up.dataset.up ?? '');
      return;
    }
    const ex = t.closest<HTMLElement>('[data-ex]');
    if (ex) {
      this.onEx(ex.dataset.ex ?? '');
    }
  }

  private upgradeSkill(id: string): void {
    if (!this.save) return;
    const lv = skillLevel(this.save, id);
    const cost = skillUpgradeCost(lv);
    if (this.save.starCoins < cost) return;
    this.save.starCoins -= cost;
    this.save.petSkillLevels[id] = lv + 1;
    Storage.save(this.save);
    this.refresh();
  }

  /** 兑换动作：− / ＋ / 全部 / 确认，均围绕 exWant 自选数量 */
  private onEx(action: string): void {
    if (!this.save) return;
    const maxShards = Math.floor(this.save.starCoins / STAR_PER_SHARD);
    if (action === 'minus') this.exWant = Math.max(0, this.exWant - 1);
    else if (action === 'plus') this.exWant = Math.min(maxShards, this.exWant + 1);
    else if (action === 'all') this.exWant = maxShards;
    else if (action === 'go') this.exchange();
    this.refresh();
  }

  /** 按自选数量兑换（不会把全部星币一次性兑光） */
  private exchange(): void {
    if (!this.save) return;
    const maxShards = Math.floor(this.save.starCoins / STAR_PER_SHARD);
    if (this.exWant > maxShards) this.exWant = maxShards;
    if (this.exWant <= 0) return;
    this.save.starCoins -= this.exWant * STAR_PER_SHARD;
    this.save.petShards += this.exWant;
    Storage.save(this.save);
    this.exWant = 1;
    this.refresh();
  }

  private refresh(): void {
    if (!this.el || !this.save) return;
    const star = this.el.querySelector('.exp-bal-star');
    if (star) star.textContent = `${this.save.starCoins}`;
    // 开始按钮显示存档点起始关（已击败最高 Boss → 从其下一关开打）
    const startBtn = this.el.querySelector('.exp-start');
    if (startBtn) {
      const n = this.save.expBossStage > 0 ? this.save.expBossStage + 1 : 1;
      startBtn.textContent = `开始挑战（第 ${n} 关）`;
    }

    const petsEl = this.el.querySelector('.exp-pets') as HTMLElement | null;
    if (petsEl) {
      petsEl.innerHTML = '';
      for (const id of sortOwnedPets(this.save.petsOwned, this.save.petLevels)) {
        const def = PET_BY_ID[id];
        if (!def) continue;
        const sel = id === this.selected;
        const card = document.createElement('div');
        card.className = 'exp-pet-card' + (sel ? ' is-sel' : '') + ` ${rarityClass(def.rarity)}`;
        card.dataset.pick = id;
        const ico = document.createElement('span');
        ico.className = 'exp-pet-ico';
        ico.appendChild(atlas.icon(iconOf(id), 44));
        const lv = this.save.petLevels[id] ?? 1;
        const info = document.createElement('span');
        info.className = 'exp-pet-info';
        info.innerHTML = `<b>${def.name}</b><span class="pet-lv">Lv ${lv}</span>`;
        card.append(ico, info);
        petsEl.appendChild(card);
      }
    }

    const detail = this.el.querySelector('.exp-detail') as HTMLElement | null;
    if (detail && this.selected) {
      const def: PetDef = PET_BY_ID[this.selected];
      const lv = this.save.petLevels[this.selected] ?? 1;
      const sk = skillFor(def);
      const skLv = skillLevel(this.save, this.selected);
      const cost = skillUpgradeCost(skLv);
      const canUp = this.save.starCoins >= cost;
      const maxShards = Math.floor(this.save.starCoins / STAR_PER_SHARD);
      if (this.exWant < 1) this.exWant = maxShards > 0 ? 1 : 0;
      if (this.exWant > maxShards) this.exWant = maxShards;
      const want = this.exWant;
      detail.innerHTML = `
        <div class="exp-detail-head ${rarityClass(def.rarity)}">
          <span class="exp-detail-ico"></span>
          <div class="exp-detail-title">
            <b>${def.name}</b>
            <span class="pet-tag">${RARITY_LABEL[def.rarity]}</span>
            <span class="pet-lv">Lv ${lv}</span>
          </div>
        </div>
        <div class="pet-stat-grid">
          <div class="pet-stat"><b>${hpFor(def, lv)}</b><span>血量</span></div>
          <div class="pet-stat"><b>${dmgFor(def, lv)}</b><span>伤害</span></div>
          <div class="pet-stat"><b>${Math.round(visualScale(def, lv) * 100)}%</b><span>体型比例</span></div>
        </div>
        <div class="exp-skill">
          <div class="exp-skill-line">招牌技能：<b>${sk.name}</b> · 等级 <b class="exp-skill-lv">${skLv}</b></div>
          <div class="exp-skill-desc">${skillEffectText(sk)}</div>
          <button class="btn exp-up ${canUp ? '' : 'is-disabled'}" data-up="${def.id}">升级技能（${cost} 星币）</button>
          <div class="exp-exch">
            <div class="exp-exch-head">
              <span class="exp-exch-label">星币兑碎片</span>
              <span class="exp-exch-rate">${STAR_PER_SHARD} 星币 = 1 碎片</span>
            </div>
            <div class="exp-exch-ctl">
              <button class="btn exp-exch-btn ${want > 0 ? '' : 'is-disabled'}" data-ex="minus">−</button>
              <span class="exp-exch-want">${want} 碎片</span>
              <button class="btn exp-exch-btn ${want < maxShards ? '' : 'is-disabled'}" data-ex="plus">＋</button>
              <button class="btn exp-exch-btn" data-ex="all">全部</button>
              <button class="btn exp-exch-go ${want > 0 ? '' : 'is-disabled'}" data-ex="go">兑换 ${want * STAR_PER_SHARD} 星币</button>
            </div>
            ${maxShards <= 0 ? '<div class="exp-exch-note">星币不足：先闯关赚星币，或把星币留给升技能</div>' : ''}
          </div>
        </div>`;
      (detail.querySelector('.exp-detail-ico') as HTMLElement).appendChild(atlas.icon(iconOf(this.selected), 64));
    }
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    this.save = null;
    this.handlers = null;
  }
}
