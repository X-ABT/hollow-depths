import { formatNum, formatTime } from '../core/MathUtil';
import type { SaveData } from '../save/Storage';

export interface TitleHandlers {
  onStart: () => void;
  onTogglePerf: () => void;
  onTogglePause: () => void;
}

/** 标题页：进入游戏 / 玩法说明 / 性能面板开关 */
export class TitleScreen {
  private el: HTMLDivElement | null = null;

  show(root: HTMLElement, save: SaveData, h: TitleHandlers): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'title-screen';
    el.innerHTML = `
      <div class="title-emblem"></div>
      <h1 class="title-main">HOLLOW DEPTHS</h1>
      <div class="title-sub">幽墟幸存者</div>
      <p class="title-tag">纯前端 · 零后端 · 打开即玩</p>
      <div class="title-actions">
        <button class="btn btn--primary" data-act="start">进入幽墟</button>
        <button class="btn" data-act="help">玩法说明</button>
        <button class="btn btn--ghost" data-act="perf">性能面板</button>
      </div>
      <div class="title-best"></div>
      <div class="title-help" hidden>
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或 方向键 移动，武器自动开火</div>
        <div>移动端：左半屏任意位置按下拖动即可移动</div>
        <div>击杀敌人拾取灵魂碎片，升级时三选一构筑你的流派</div>
        <div>胜利条件：击败最终 Boss「终焉」即获胜</div>
        <div>5:00 / 8:00 / 12:00 各有一场 Boss 战，越强越要小心</div>
        <div><kbd>Esc</kbd> 或 <kbd>P</kbd> 暂停</div>
      </div>
    `;
    root.appendChild(el);
    this.el = el;

    const best = el.querySelector('.title-best') as HTMLElement;
    if (save.runs > 0) {
      best.innerHTML = `最佳记录　存活 <b>${formatTime(save.bestTime)}</b>　击杀 <b>${formatNum(
        save.bestKills,
      )}</b>　等级 <b>${save.bestLevel}</b>`;
    } else {
      best.textContent = '首次进入幽墟，祝你好运';
    }

    el.querySelector('[data-act="start"]')?.addEventListener('click', h.onStart);
    el.querySelector('[data-act="perf"]')?.addEventListener('click', h.onTogglePerf);
    const help = el.querySelector('.title-help') as HTMLElement;
    el.querySelector('[data-act="help"]')?.addEventListener('click', () => {
      help.hidden = !help.hidden;
    });
    void h.onTogglePause;
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }
}
