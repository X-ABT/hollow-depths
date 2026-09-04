import { formatNum, formatTime, formatSouls } from '../core/MathUtil';
import type { SaveData } from '../save/Storage';

export interface TitleHandlers {
  onStart: () => void;
  /** 清除全部存档并刷新页面重加载（由 Game 执行 Storage.reset + reload） */
  onClearData: () => void;
  onTogglePause: () => void;
  /** 打开商店（仅主界面可用） */
  onShop: () => void;
  /** 打开宠物中心（饲养园，仅主界面可用） */
  onPet: () => void;
  /** 打开宠物园（绿地展示场景，仅主界面可用） */
  onPark: () => void;
}

/** 标题页：进入游戏 / 商店 / 玩法说明 / 清除数据 */
export class TitleScreen {
  private el: HTMLDivElement | null = null;
  private soulsEl: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private clearEl: HTMLDivElement | null = null;

  show(root: HTMLElement, save: SaveData, h: TitleHandlers): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'title-screen';
    el.innerHTML = `
      <div class="title-emblem"></div>
      <h1 class="title-main">HOLLOW DEPTHS</h1>
      <div class="title-sub">幽墟幸存者</div>
      <p class="title-tag">纯前端 · 零后端 · 打开即玩</p>
      <div class="title-soul">灵魂　<b>${formatSouls(save.soulCents)}</b></div>
      <div class="title-actions">
        <button class="btn btn--primary" data-act="start">进入幽墟</button>
        <button class="btn" data-act="shop">商店</button>
        <button class="btn" data-act="pet">饲养园</button>
        <button class="btn" data-act="park">宠物园</button>
        <button class="btn" data-act="help">玩法说明</button>
        <button class="btn btn--ghost" data-act="clear">清除数据</button>
      </div>
      <div class="title-best"></div>
      <div class="title-help" hidden>
        <div>用 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键移动，武器自动开火（移动端左半屏按住拖动）</div>
        <div>击杀敌人积攒经验升级三选一构筑流派；每杀 100 只怪凝结 1.00 灵魂</div>
        <div>灵魂跨局永久累积，在主界面「商店」解锁新武器与装备，解锁后才会进入升级卡池</div>
        <div>胜利条件：击败最终 Boss「终焉」即获胜；若超时未击败则失败</div>
        <div>5:00 古神现身，每击败一个 Boss，4 分钟后迎来下一场 Boss 战</div>
        <div>Boss 被击杀越快，挑战越强：2分钟内×2 / 1分30秒内×3 / 1分钟内×4 / 30秒内×5 / 15秒内×10</div>
        <div>下一只 Boss 血量按上表提高；普通小怪刷新永久提速（每次快杀累乘，不会回落）</div>
        <div>「饲养园」用灵魂抽宠物/粮食，投喂升级属性随等级成长，出战宠物跟随你自动战斗</div>
        <div><kbd>Esc</kbd> 或 <kbd>P</kbd> 暂停</div>
      </div>
    `;
    root.appendChild(el);
    this.el = el;
    this.root = root;
    this.soulsEl = el.querySelector('.title-soul b') as HTMLElement;

    const best = el.querySelector('.title-best') as HTMLElement;
    if (save.runs > 0) {
      best.innerHTML = `最佳记录　存活 <b>${formatTime(save.bestTime)}</b>　击杀 <b>${formatNum(
        save.bestKills,
      )}</b>　等级 <b>${save.bestLevel}</b>`;
    } else {
      best.textContent = '首次进入幽墟，祝你好运';
    }

    el.querySelector('[data-act="start"]')?.addEventListener('click', h.onStart);
    el.querySelector('[data-act="shop"]')?.addEventListener('click', h.onShop);
    el.querySelector('[data-act="pet"]')?.addEventListener('click', h.onPet);
    el.querySelector('[data-act="park"]')?.addEventListener('click', h.onPark);
    el.querySelector('[data-act="clear"]')?.addEventListener('click', () => this.openClearConfirm(h));
    const help = el.querySelector('.title-help') as HTMLElement;
    el.querySelector('[data-act="help"]')?.addEventListener('click', () => {
      help.hidden = !help.hidden;
    });
    void h.onTogglePause;
  }

  /** 打开「是否清除数据」确认弹层（带不可逆警告） */
  private openClearConfirm(h: TitleHandlers): void {
    this.closeClearConfirm();
    if (!this.root) return;
    const overlay = document.createElement('div');
    overlay.className = 'clear-confirm';
    overlay.innerHTML = `
      <div class="clear-card">
        <h2 class="clear-title">是否清除数据？</h2>
        <p class="clear-warn">将清空全部进度（灵魂 / 宠物 / 解锁 / 设置），不可恢复。</p>
        <div class="clear-actions">
          <button class="btn btn--ghost" data-act="cancel">取消</button>
          <button class="btn clear-danger" data-act="ok">确定清除</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeClearConfirm();
    });
    overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', () => this.closeClearConfirm());
    overlay.querySelector('[data-act="ok"]')?.addEventListener('click', () => {
      this.closeClearConfirm();
      h.onClearData();
    });
    this.root.appendChild(overlay);
    this.clearEl = overlay;
  }

  /** 关闭确认弹层（若已打开） */
  private closeClearConfirm(): void {
    this.clearEl?.remove();
    this.clearEl = null;
  }

  /** 商店购买/结算入账后刷新灵魂余额显示（标题 DOM 仍保留） */
  refreshSouls(cents: number): void {
    if (this.soulsEl) this.soulsEl.textContent = formatSouls(cents);
  }

  hide(): void {
    this.closeClearConfirm();
    this.el?.remove();
    this.el = null;
    this.soulsEl = null;
    this.root = null;
  }
}
