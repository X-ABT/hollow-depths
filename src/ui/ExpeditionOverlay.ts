import { t } from '../i18n';

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
        <h2 class="exp-title exp-fail-title">${t('exp.failTitle')}</h2>
        <p class="exp-note">${t('exp.failNote', { stage: info.stage, resume: info.resume })}</p>
        <div class="exp-actions"><button class="btn btn--primary" data-act="back">${t('exp.backToCamp')}</button></div>
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
