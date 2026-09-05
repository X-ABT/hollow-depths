export interface ExpeditionClearInfo {
  stage: number;
  reward: number;
  starCoins: number;
}
export interface ExpeditionClearHandlers {
  onNext: () => void;
  onStay?: () => void;
  onBack?: () => void;
}
export interface ExpeditionFailHandlers {
  onBack: () => void;
}

/** 远征过关 / 失败叠加层 */
export class ExpeditionOverlay {
  private el: HTMLDivElement | null = null;

  showClear(root: HTMLElement, info: ExpeditionClearInfo, h: ExpeditionClearHandlers): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'overlay exp-result';
    const isFirst = info.stage === 1;
    const nextLabel = isFirst ? '进入第 2 关' : `进入第 ${info.stage + 1} 关`;
    let actions = `<button class="btn btn--primary" data-act="next">${nextLabel}</button>`;
    if (isFirst) {
      actions += `<button class="btn btn--ghost" data-act="stay">留本关刷星币</button>`;
    }
    actions += `<button class="btn btn--ghost" data-act="back">返回营地</button>`;
    el.innerHTML = `
      <div class="panel exp-panel exp-panel--clear">
        <h2 class="exp-title">第 ${info.stage} 关通过！</h2>
        <p class="exp-reward">获得 ★ <b>${info.reward}</b> 星币（共 ${info.starCoins}）</p>
        <div class="exp-actions">${actions}</div>
      </div>`;
    root.appendChild(el);
    this.el = el;
    el.querySelector('[data-act="next"]')?.addEventListener('click', () => h.onNext());
    el.querySelector('[data-act="stay"]')?.addEventListener('click', () => h.onStay?.());
    el.querySelector('[data-act="back"]')?.addEventListener('click', () => h.onBack?.());
  }

  /** resume：下次从营地开战的起始关（=最高击败 Boss 关 + 1，未击败则为 1） */
  showFail(root: HTMLElement, info: { stage: number; resume: number }, h: ExpeditionFailHandlers): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'overlay exp-result';
    el.innerHTML = `
      <div class="panel exp-panel exp-panel--fail">
        <h2 class="exp-title exp-fail-title">挑战失败</h2>
        <p class="exp-note">你的宠物在第 ${info.stage} 关倒下了。再战将从第 ${info.resume} 关开始。</p>
        <div class="exp-actions"><button class="btn btn--primary" data-act="back">返回营地</button></div>
      </div>`;
    root.appendChild(el);
    this.el = el;
    el.querySelector('[data-act="back"]')?.addEventListener('click', () => h.onBack());
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
  }
}
