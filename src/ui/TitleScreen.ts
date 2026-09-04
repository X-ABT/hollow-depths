import { formatNum, formatTime, formatSouls } from '../core/MathUtil';
import type { SaveData } from '../save/Storage';

export interface TitleHandlers {
  onStart: () => void;
  onTogglePerf: () => void;
  onTogglePause: () => void;
  /** 打开商店（仅主界面可用） */
  onShop: () => void;
}

/** 标题页：进入游戏 / 商店 / 玩法说明 / 性能面板开关 */
export class TitleScreen {
  private el: HTMLDivElement | null = null;
  private soulsEl: HTMLElement | null = null;

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
        <button class="btn" data-act="help">玩法说明</button>
        <button class="btn btn--ghost" data-act="perf">性能面板</button>
      </div>
      <div class="title-best"></div>
      <div class="title-help" hidden>
        <div>用 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键移动，武器自动开火（移动端左半屏按住拖动）</div>
        <div>击杀敌人积攒经验升级三选一构筑流派；每杀 100 只怪凝结 1.00 灵魂</div>
        <div>灵魂跨局永久累积，在主界面「商店」解锁新武器与装备，解锁后才会进入升级卡池</div>
        <div>胜利条件：击败最终 Boss「终焉」即获胜；若超时未击败则失败</div>
        <div>5:00 古神现身，每击败一个 Boss，4 分钟后迎来下一场 Boss 战</div>
        <div><kbd>Esc</kbd> 或 <kbd>P</kbd> 暂停</div>
      </div>
    `;
    root.appendChild(el);
    this.el = el;
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
    el.querySelector('[data-act="perf"]')?.addEventListener('click', h.onTogglePerf);
    const help = el.querySelector('.title-help') as HTMLElement;
    el.querySelector('[data-act="help"]')?.addEventListener('click', () => {
      help.hidden = !help.hidden;
    });
    void h.onTogglePause;
  }

  /** 商店购买/结算入账后刷新灵魂余额显示（标题 DOM 仍保留） */
  refreshSouls(cents: number): void {
    if (this.soulsEl) this.soulsEl.textContent = formatSouls(cents);
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    this.soulsEl = null;
  }
}
