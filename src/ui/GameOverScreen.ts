import type { Build } from '../core/Build';
import { formatNum, formatSouls, formatTime } from '../core/MathUtil';
import { atlas } from '../render/Textures';

export interface RunResult {
  win: boolean;
  time: number;
  kills: number;
  /** 本局击杀转化的灵魂（单位 0.01），已存入永久账户 */
  soulEarnedCents: number;
  level: number;
  build: Build;
  damageByWeapon: Float64Array;
  topWeaponName: string;
  newBest: boolean;
}

/** 结算页：战绩 + 本局 build + 重开 */
export class GameOverScreen {
  private el: HTMLDivElement | null = null;

  get visible(): boolean {
    return this.el !== null;
  }

  show(
    root: HTMLElement,
    r: RunResult,
    onRestart: () => void,
    onTitle: () => void,
    onShare: () => void,
  ): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <h2 class="result-title ${r.win ? 'result-title--win' : 'result-title--lose'}"></h2>
      ${r.newBest ? '<div class="result-newbest">新纪录</div>' : ''}
      <div class="panel result-stats">
        <div class="stat"><div class="stat-k">存活时间</div><div class="stat-v" data-s="time"></div></div>
        <div class="stat"><div class="stat-k">击杀</div><div class="stat-v" data-s="kills"></div></div>
        <div class="stat"><div class="stat-k">等级</div><div class="stat-v" data-s="level"></div></div>
        <div class="stat"><div class="stat-k">最高伤害</div><div class="stat-v stat-v--hi" data-s="top"></div></div>
      </div>
      <div class="result-build">
        <div class="result-build-title">本 局 构 筑</div>
        <div class="result-build-list"></div>
      </div>
      <div class="result-soul-line">本局凝聚灵魂 <b data-s="soul"></b>　已存入永久账户</div>
      <div class="result-actions">
        <button class="btn btn--primary" data-act="restart">再来一局</button>
        <button class="btn" data-act="title">返回标题</button>
        <button class="btn btn--ghost" data-act="share">复制战绩</button>
      </div>
    `;
    root.appendChild(el);
    this.el = el;

    (el.querySelector('.result-title') as HTMLElement).textContent = r.win ? '逃出幽墟' : '葬身幽墟';
    (el.querySelector('[data-s="time"]') as HTMLElement).textContent = formatTime(r.time);
    (el.querySelector('[data-s="kills"]') as HTMLElement).textContent = formatNum(r.kills);
    (el.querySelector('[data-s="soul"]') as HTMLElement).textContent = `+${formatSouls(r.soulEarnedCents)}`;
    (el.querySelector('[data-s="level"]') as HTMLElement).textContent = String(r.level);
    (el.querySelector('[data-s="top"]') as HTMLElement).textContent = r.topWeaponName;

    const list = el.querySelector('.result-build-list') as HTMLElement;
    for (const w of r.build.weapons) {
      const item = document.createElement('div');
      item.className = 'build-item' + (w.def.isEvolved ? ' build-item--evolved' : '');
      item.appendChild(atlas.icon(w.def.icon, 22));
      const label = document.createElement('b');
      label.textContent = `${w.def.name} Lv${w.level}`;
      item.appendChild(label);
      list.appendChild(item);
    }
    for (const p of r.build.passives) {
      const item = document.createElement('div');
      item.className = 'build-item';
      item.appendChild(atlas.icon(p.def.icon, 22));
      const label = document.createElement('b');
      label.textContent = `${p.def.name} Lv${p.level}`;
      item.appendChild(label);
      list.appendChild(item);
    }

    el.querySelector('[data-act="restart"]')?.addEventListener('click', onRestart);
    el.querySelector('[data-act="title"]')?.addEventListener('click', onTitle);
    el.querySelector('[data-act="share"]')?.addEventListener('click', onShare);
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }
}
