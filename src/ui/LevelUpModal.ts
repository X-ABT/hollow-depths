import type { Build, UpgradeOption } from '../core/Build';
import { atlas } from '../render/Textures';

const KIND_LABEL: Record<UpgradeOption['kind'], string> = {
  weapon: '武器',
  passive: '装备',
  evolve: '进化',
};

/** 升级三选一弹窗（弹出时游戏逻辑暂停） */
export class LevelUpModal {
  private el: HTMLDivElement | null = null;

  get visible(): boolean {
    return this.el !== null;
  }

  show(
    root: HTMLElement,
    options: UpgradeOption[],
    build: Build,
    level: number,
    onPick: (opt: UpgradeOption) => void,
  ): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <h2 class="overlay-title">等级提升</h2>
      <p class="overlay-sub">Lv ${level} · 选择你的强化</p>
    `;

    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const opt of options) {
      const card = document.createElement('div');
      card.className = `card card--${opt.kind}`;
      card.innerHTML = `
        <div class="card-icon"></div>
        <div class="card-kind"></div>
        <div class="card-name"></div>
        <div class="card-desc"></div>
        <div class="card-lv"></div>
      `;
      (card.querySelector('.card-icon') as HTMLElement).appendChild(atlas.icon(opt.icon, 40));
      (card.querySelector('.card-kind') as HTMLElement).textContent = KIND_LABEL[opt.kind];
      (card.querySelector('.card-name') as HTMLElement).textContent = opt.title;
      (card.querySelector('.card-desc') as HTMLElement).textContent = opt.desc;
      (card.querySelector('.card-lv') as HTMLElement).textContent = opt.sub;
      card.addEventListener('click', () => {
        onPick(opt);
      });
      cards.appendChild(card);
    }
    el.appendChild(cards);

    // 底部展示当前 build，帮助玩家判断搭配
    const strip = document.createElement('div');
    strip.className = 'build-strip';
    for (const w of build.weapons) {
      const chip = document.createElement('div');
      chip.className = 'build-chip' + (w.def.isEvolved ? ' build-chip--evolved' : '');
      chip.appendChild(atlas.icon(w.def.icon, 18));
      strip.appendChild(chip);
    }
    for (const p of build.passives) {
      const chip = document.createElement('div');
      chip.className = 'build-chip';
      chip.appendChild(atlas.icon(p.def.icon, 18));
      strip.appendChild(chip);
    }
    el.appendChild(strip);

    root.appendChild(el);
    this.el = el;
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }
}
