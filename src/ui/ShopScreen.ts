import { formatSouls } from '../core/MathUtil';
import { WEAPONS } from '../data/weapons';
import { PASSIVES } from '../data/passives';
import type { WeaponDef } from '../data/weapons';
import type { PassiveDef } from '../data/passives';
import { Storage, type SaveData } from '../save/Storage';
import { atlas } from '../render/Textures';

/**
 * 商店（主界面）：用跨局永久「灵魂」解锁新武器 / 被动。
 * 所有商品共用累进价：当前价格 = 3 + purchases（首件 3，每买一件 +1）。
 * 解锁后该内容才进入每局升级三选一的随机池。
 */
export class ShopScreen {
  private el: HTMLDivElement | null = null;
  private save: SaveData | null = null;
  private onClose: (() => void) | null = null;
  private soulsEl: HTMLElement | null = null;
  private priceEl: HTMLElement | null = null;
  private listWeapons: HTMLElement | null = null;
  private listPassives: HTMLElement | null = null;

  get visible(): boolean {
    return this.el !== null;
  }

  show(root: HTMLElement, save: SaveData, onClose: () => void): void {
    this.hide();
    this.save = save;
    this.onClose = onClose;

    const el = document.createElement('div');
    el.className = 'overlay shop-screen';
    el.innerHTML = `
      <div class="panel shop-panel">
        <div class="shop-head">
          <h2 class="shop-title">灵魂商店</h2>
          <button class="btn shop-close" aria-label="关闭商店">✕</button>
        </div>
        <div class="shop-sub">
          余额　<b class="shop-souls"></b>
          <span class="shop-price-hint">本件　<b class="shop-price"></b></span>
        </div>
        <div class="shop-note">解锁后才会进入每局升级三选一的卡池 · 已解锁项可花灵魂永久提升「起始等级」，升级后在本局刷到即从此等级起算（价格翻倍：30/60/120…）</div>
        <div class="shop-scroll">
          <div class="shop-section">武 器</div>
          <div class="shop-list" data-list="weapons"></div>
          <div class="shop-section">装 备</div>
          <div class="shop-list" data-list="passives"></div>
        </div>
      </div>
    `;
    root.appendChild(el);
    this.el = el;
    this.soulsEl = el.querySelector('.shop-souls');
    this.priceEl = el.querySelector('.shop-price');
    this.listWeapons = el.querySelector('[data-list="weapons"]');
    this.listPassives = el.querySelector('[data-list="passives"]');

    el.querySelector('.shop-close')?.addEventListener('click', () => this.hide());

    this.refresh();
  }

  private currentPrice(): number {
    return 3 + (this.save?.purchases ?? 0);
  }

  /** 升级起始等级价格：升到 Lv2 花 30、Lv3 花 60、Lv4 花 120（每级翻倍） */
  private upgradeCost(currentLevel: number): number {
    return 30 * Math.pow(2, currentLevel - 1);
  }

  private baseLevel(id: string, kind: 'weapon' | 'passive'): number {
    const map = kind === 'weapon' ? this.save?.weaponLevels : this.save?.passiveLevels;
    const v = map?.[id];
    return typeof v === 'number' && v >= 1 ? Math.floor(v) : 1;
  }

  private canAfford(price: number): boolean {
    return (this.save?.soulCents ?? 0) >= price * 100;
  }

  /** 购买：扣灵魂、解锁并持久化，然后刷新整张列表 */
  private buy(id: string, kind: 'weapon' | 'passive'): void {
    if (!this.save) return;
    const price = this.currentPrice();
    if (this.save.soulCents < price * 100) return;
    this.save.soulCents -= price * 100;
    this.save.purchases++;
    if (kind === 'weapon') this.save.unlockedWeapons.push(id);
    else this.save.unlockedPassives.push(id);
    Storage.save(this.save);
    this.refresh();
  }

  /** 升级：提升已解锁内容的永久起始等级并持久化 */
  private upgrade(id: string, kind: 'weapon' | 'passive', maxLevel: number): void {
    if (!this.save) return;
    const cur = this.baseLevel(id, kind);
    if (cur >= maxLevel) return;
    const cost = this.upgradeCost(cur);
    if (this.save.soulCents < cost * 100) return;
    this.save.soulCents -= cost * 100;
    if (kind === 'weapon') this.save.weaponLevels[id] = cur + 1;
    else this.save.passiveLevels[id] = cur + 1;
    Storage.save(this.save);
    this.refresh();
  }

  refresh(): void {
    if (!this.save) return;
    if (this.soulsEl) this.soulsEl.textContent = formatSouls(this.save.soulCents);
    if (this.priceEl) this.priceEl.textContent = `${this.currentPrice()} 灵魂`;
    if (this.listWeapons) this.listWeapons.innerHTML = '';
    if (this.listPassives) this.listPassives.innerHTML = '';
    const ownedW = new Set(this.save.unlockedWeapons);
    const ownedP = new Set(this.save.unlockedPassives);
    for (const def of WEAPONS) {
      this.listWeapons?.appendChild(this.itemWeapon(def, ownedW.has(def.id)));
    }
    for (const def of PASSIVES) {
      this.listPassives?.appendChild(this.itemPassive(def, ownedP.has(def.id)));
    }
  }

  private itemWeapon(def: WeaponDef, owned: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'shop-item' + (owned ? ' shop-item--owned' : '');
    const base = this.baseLevel(def.id, 'weapon');
    el.innerHTML = `
      <div class="shop-item-icon"></div>
      <div class="shop-item-info">
        <div class="shop-item-name">${def.name}<span class="shop-item-tag">武器</span></div>
        <div class="shop-item-desc">${def.desc} · 满级 Lv${def.maxLevel} · 起始 Lv${base}</div>
      </div>
    `;
    (el.querySelector('.shop-item-icon') as HTMLElement).appendChild(atlas.icon(def.icon, 36));
    this.attachAction(el, def.id, 'weapon', owned, base, def.maxLevel);
    return el;
  }

  private itemPassive(def: PassiveDef, owned: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'shop-item' + (owned ? ' shop-item--owned' : '');
    const base = this.baseLevel(def.id, 'passive');
    el.innerHTML = `
      <div class="shop-item-icon"></div>
      <div class="shop-item-info">
        <div class="shop-item-name">${def.name}<span class="shop-item-tag">装备</span></div>
        <div class="shop-item-desc">${def.desc} · 满级 Lv${def.maxLevel} · 起始 Lv${base}</div>
      </div>
    `;
    (el.querySelector('.shop-item-icon') as HTMLElement).appendChild(atlas.icon(def.icon, 36));
    this.attachAction(el, def.id, 'passive', owned, base, def.maxLevel);
    return el;
  }

  /** 右侧状态：未解锁 → 购买按钮（买不起置灰）；已解锁 → 升级起始等级按钮 */
  private attachAction(
    item: HTMLElement,
    id: string,
    kind: 'weapon' | 'passive',
    owned: boolean,
    base: number,
    maxLevel: number,
  ): void {
    const action = document.createElement('div');
    action.className = 'shop-item-action';
    if (owned) {
      if (base >= maxLevel) {
        action.innerHTML = `<span class="shop-owned">已解锁 · 满级起始 Lv${maxLevel}</span>`;
      } else {
        const cost = this.upgradeCost(base);
        const btn = document.createElement('button');
        btn.className = 'btn shop-up';
        btn.innerHTML = `升起始 Lv${base}→${base + 1}<br><span class="shop-up-cost">${cost} 灵魂</span>`;
        if (!this.canAfford(cost)) btn.classList.add('is-disabled');
        btn.addEventListener('click', () => this.upgrade(id, kind, maxLevel));
        action.appendChild(btn);
      }
    } else {
      const price = this.currentPrice();
      const btn = document.createElement('button');
      btn.className = 'btn shop-buy';
      btn.textContent = `${price} 灵魂`;
      if (!this.canAfford(price)) btn.classList.add('is-disabled');
      btn.addEventListener('click', () => this.buy(id, kind));
      action.appendChild(btn);
    }
    item.appendChild(action);
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
