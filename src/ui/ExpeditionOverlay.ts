export interface ExpeditionFailHandlers {
  onBack: () => void;
}

/** 远征失败叠加层（过关已改为横幅 + 自动续关，无需弹层） */
export class ExpeditionOverlay {
  private el: HTMLDivElement | null = null;

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
