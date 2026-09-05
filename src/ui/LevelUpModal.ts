import type { Build, UpgradeOption } from '../core/Build';
import { atlas } from '../render/Textures';
import { t } from '../i18n';

/** 重摇按钮默认提示（广告结束 / 取消后恢复） */
const REROLL_HINT = (): string => t('levelup.rerollHint');

/**
 * 升级三选一弹窗（弹出时游戏逻辑暂停）。
 * 可选传入 onReroll：由外部播放激励广告后返回新的三个选项；
 * 返回 null（广告未看完 / 取消 / 卡池已耗尽）则保留原选项不动。
 */
export class LevelUpModal {
  private el: HTMLDivElement | null = null;
  private cards: HTMLDivElement | null = null;
  private onPick: ((opt: UpgradeOption) => void) | null = null;

  get visible(): boolean {
    return this.el !== null;
  }

  show(
    root: HTMLElement,
    options: UpgradeOption[],
    build: Build,
    level: number,
    onPick: (opt: UpgradeOption) => void,
    onReroll?: () => Promise<UpgradeOption[] | null>,
  ): void {
    this.hide();
    this.onPick = onPick;

    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `
      <h2 class="overlay-title">${t('levelup.title')}</h2>
      <p class="overlay-sub">${t('levelup.sub', { level })}</p>
    `;

    const cards = document.createElement('div');
    cards.className = 'cards';
    this.cards = cards;
    this.renderOptions(options);
    el.appendChild(cards);

    // 看广告重摇：可选，仅在外部提供 onReroll 时渲染
    if (onReroll) {
      const row = document.createElement('div');
      row.className = 'lv-reroll';
      row.innerHTML = `
        <button class="btn lv-reroll-btn" type="button">
          <span class="lv-reroll-label">${t('levelup.rerollBtn')}</span>
          <span class="lv-reroll-hint">${REROLL_HINT()}</span>
        </button>
      `;
      const btn = row.querySelector<HTMLButtonElement>('.lv-reroll-btn');
      btn?.addEventListener('click', () => void this.handleReroll(btn, onReroll));
      el.appendChild(row);
    }

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

  /** 原地重绘三张卡片（重摇成功后调用；不动标题 / 重摇按钮 / build 条） */
  private renderOptions(options: UpgradeOption[]): void {
    const cards = this.cards;
    if (!cards) return;
    cards.innerHTML = '';
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
      const kindKey =
        opt.kind === 'weapon' ? 'build.kindWeapon' : opt.kind === 'evolve' ? 'build.kindEvolve' : 'build.kindPassive';
      (card.querySelector('.card-kind') as HTMLElement).textContent = t(kindKey);
      (card.querySelector('.card-name') as HTMLElement).textContent = opt.title;
      (card.querySelector('.card-desc') as HTMLElement).textContent = opt.desc;
      (card.querySelector('.card-lv') as HTMLElement).textContent = opt.sub;
      card.addEventListener('click', () => {
        if (this.onPick) this.onPick(opt);
      });
      cards.appendChild(card);
    }
  }

  /** 点「看广告重摇」：等外部广告结果，成功则替换卡片，取消/失败则恢复按钮 */
  private async handleReroll(
    btn: HTMLButtonElement,
    onReroll: () => Promise<UpgradeOption[] | null>,
  ): Promise<void> {
    if (btn.disabled) return;
    const hint = btn.querySelector<HTMLElement>('.lv-reroll-hint');
    const prevText = hint?.textContent ?? '';
    btn.disabled = true;
    btn.classList.add('is-busy');
    if (hint) hint.textContent = t('levelup.adPlaying');

    try {
      const next = await onReroll();
      // 弹窗可能在等待期间被外部关闭（极少数竞态）；此时无需再渲染
      if (!this.el || !next) return;
      this.renderOptions(next);
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
      if (hint) hint.textContent = prevText || REROLL_HINT();
    }
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    this.cards = null;
    this.onPick = null;
  }
}
