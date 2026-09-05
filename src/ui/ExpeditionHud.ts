import type { ExpeditionState } from '../ecs/systems/ExpeditionSystem';

export interface ExpeditionHudHandlers {
  onSkill: () => void;
  onQuit: () => void;
  /** 视野微调：+0.05 放大（拉近）/ −0.05 缩小（看更全） */
  onZoom?: (step: number) => void;
}

/** 远征战斗 HUD：顶部英雄血条 + Boss 血条 + 关卡/剩余；底部技能按钮（CD 遮罩）；过关横幅 */
export class ExpeditionHud {
  private el: HTMLDivElement | null = null;
  private hpFill: HTMLElement | null = null;
  private hpText: HTMLElement | null = null;
  private stageEl: HTMLElement | null = null;
  private skillBtn: HTMLButtonElement | null = null;
  private skillCd: HTMLElement | null = null;
  private skillName: HTMLElement | null = null;
  private bossEl: HTMLElement | null = null;
  private bossNameEl: HTMLElement | null = null;
  private bossFill: HTMLElement | null = null;
  private bossText: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;

  show(root: HTMLElement, h: ExpeditionHudHandlers): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'exp-hud';
    el.innerHTML = `
      <div class="exp-hud-top">
        <div class="exp-hero">
          <div class="exp-hero-hp"><div class="exp-hero-hp-fill"></div><span class="exp-hero-hp-text"></span></div>
        </div>
        <div class="exp-stage"></div>
        <button class="btn btn--ghost exp-quit">撤退</button>
      </div>
      <div class="exp-boss" hidden>
        <span class="exp-boss-name"></span>
        <div class="exp-boss-hp"><div class="exp-boss-hp-fill"></div><span class="exp-boss-hp-text"></span></div>
      </div>
      <div class="exp-banner" hidden></div>
      <div class="exp-hud-bottom">
        <button class="exp-skill-btn" data-act="skill">
          <span class="exp-skill-name"></span>
          <span class="exp-skill-cd"></span>
        </button>
      </div>
      <div class="exp-zoom">
        <button class="exp-zoom-btn" data-zoom="in" title="放大">＋</button>
        <button class="exp-zoom-btn" data-zoom="out" title="缩小">－</button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.hpFill = el.querySelector('.exp-hero-hp-fill');
    this.hpText = el.querySelector('.exp-hero-hp-text');
    this.stageEl = el.querySelector('.exp-stage');
    this.skillBtn = el.querySelector('.exp-skill-btn');
    this.skillCd = el.querySelector('.exp-skill-cd');
    this.skillName = el.querySelector('.exp-skill-name');
    this.bossEl = el.querySelector('.exp-boss');
    this.bossNameEl = el.querySelector('.exp-boss-name');
    this.bossFill = el.querySelector('.exp-boss-hp-fill');
    this.bossText = el.querySelector('.exp-boss-hp-text');
    this.bannerEl = el.querySelector('.exp-banner');
    this.skillBtn?.addEventListener('click', () => h.onSkill());
    el.querySelector('.exp-quit')?.addEventListener('click', () => h.onQuit());
    el.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((b) => {
      b.addEventListener('click', () => h.onZoom?.(b.dataset.zoom === 'in' ? 0.05 : -0.05));
    });
  }

  update(st: ExpeditionState): void {
    if (!this.el) return;
    const ratio = st.heroMaxHp > 0 ? Math.max(0, st.heroHp / st.heroMaxHp) : 0;
    if (this.hpFill) this.hpFill.style.width = `${(ratio * 100).toFixed(1)}%`;
    if (this.hpText) this.hpText.textContent = `${Math.ceil(Math.max(0, st.heroHp))} / ${st.heroMaxHp}`;
    if (this.stageEl) {
      const boss = st.isBoss ? ' · BOSS' : '';
      this.stageEl.innerHTML = `第 <b>${st.stage}</b> 关${boss}<span class="exp-remain">剩余 ${st.remaining}</span>`;
    }
    // Boss 顶部实时血条（普通关隐藏）
    if (this.bossEl) {
      const showBoss = st.isBoss && st.bossName !== null && st.bossMaxHp > 0;
      this.bossEl.hidden = !showBoss;
      if (showBoss) {
        const br = st.bossMaxHp > 0 ? Math.max(0, st.bossHp / st.bossMaxHp) : 0;
        if (this.bossNameEl) this.bossNameEl.textContent = st.bossName;
        if (this.bossFill) this.bossFill.style.width = `${(br * 100).toFixed(1)}%`;
        if (this.bossText) this.bossText.textContent = `${Math.ceil(Math.max(0, st.bossHp))} / ${st.bossMaxHp}`;
      }
    }
    if (this.skillName) this.skillName.textContent = st.skillName;
    if (this.skillBtn) {
      const cd = st.skillCd;
      if (cd > 0) {
        this.skillBtn.classList.add('is-cd');
        if (this.skillCd) this.skillCd.textContent = `${Math.ceil(cd)}`;
      } else {
        this.skillBtn.classList.remove('is-cd');
        if (this.skillCd) this.skillCd.textContent = '';
      }
    }
  }

  /** 过关横幅（自动续关倒计时提示） */
  showBanner(text: string): void {
    if (this.bannerEl) {
      this.bannerEl.textContent = text;
      this.bannerEl.hidden = false;
    }
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    this.hpFill = this.hpText = this.stageEl = null;
    this.skillBtn = null;
    this.skillCd = this.skillName = null;
    this.bossEl = this.bossNameEl = this.bossFill = this.bossText = null;
    this.bannerEl = null;
  }
}
