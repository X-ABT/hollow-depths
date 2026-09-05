import type { Build } from '../core/Build';
import { formatNum, formatSouls, formatTime } from '../core/MathUtil';
import { atlas } from '../render/Textures';
import { i18nName, t } from '../i18n';

export interface RunResult {
  win: boolean;
  time: number;
  kills: number;
  /** 本局击杀转化的灵魂（单位 0.01），已存入永久账户 */
  soulEarnedCents: number;
  level: number;
  build: Build;
  damageByWeapon: Float64Array;
  /** 玩家可见的「最高伤害武器」标签（已按当前语言格式化） */
  topWeaponName: string;
  newBest: boolean;
}

/** 结算页：战绩 + 本局 build + 重开 + 看广告翻倍灵魂 */
export class GameOverScreen {
  private el: HTMLDivElement | null = null;
  /** 双倍按钮 DOM（点击后 busy / 已领态） */
  private doubleBtn: HTMLButtonElement | null = null;
  private soulEl: HTMLElement | null = null;
  /** 本局已入账的初始数额（显示用；翻倍后 += 同额并刷新） */
  private shownCents = 0;
  private claimed = false;
  private busy = false;

  get visible(): boolean {
    return this.el !== null;
  }

  show(
    root: HTMLElement,
    r: RunResult,
    onRestart: () => void,
    onTitle: () => void,
    onShare: () => void,
    onDouble?: () => Promise<boolean>,
  ): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'overlay';
    this.shownCents = r.soulEarnedCents;
    this.claimed = false;
    this.busy = false;
    el.innerHTML = `
      <h2 class="result-title ${r.win ? 'result-title--win' : 'result-title--lose'}"></h2>
      ${r.newBest ? '<div class="result-newbest">' + t('gameover.newBest') + '</div>' : ''}
      <div class="panel result-stats">
        <div class="stat"><div class="stat-k">${t('gameover.statTime')}</div><div class="stat-v" data-s="time"></div></div>
        <div class="stat"><div class="stat-k">${t('gameover.statKills')}</div><div class="stat-v" data-s="kills"></div></div>
        <div class="stat"><div class="stat-k">${t('gameover.statLevel')}</div><div class="stat-v" data-s="level"></div></div>
        <div class="stat"><div class="stat-k">${t('gameover.statTop')}</div><div class="stat-v stat-v--hi" data-s="top"></div></div>
      </div>
      <div class="result-build">
        <div class="result-build-title">${t('gameover.buildTitle')}</div>
        <div class="result-build-list"></div>
      </div>
      <div class="result-soul-line">${t('gameover.soulBankedPre')}<b data-s="soul"></b>${t('gameover.soulBankedPost')}</div>
      <div class="result-double">
        <button class="btn result-double-btn" type="button" data-act="double">
          <span>${t('gameover.doubleBtn')}</span>
          <small>${t('gameover.doubleHint')}</small>
        </button>
      </div>
      <div class="result-actions">
        <button class="btn btn--primary" data-act="restart">${t('gameover.restart')}</button>
        <button class="btn" data-act="title">${t('gameover.toTitle')}</button>
        <button class="btn btn--ghost" data-act="share">${t('gameover.copy')}</button>
      </div>
    `;
    root.appendChild(el);
    this.el = el;
    this.doubleBtn = el.querySelector<HTMLButtonElement>('[data-act="double"]');
    this.soulEl = el.querySelector('[data-s="soul"]');
    this.refreshSoul();

    (el.querySelector('.result-title') as HTMLElement).textContent = r.win ? t('gameover.win') : t('gameover.lose');
    (el.querySelector('[data-s="time"]') as HTMLElement).textContent = formatTime(r.time);
    (el.querySelector('[data-s="kills"]') as HTMLElement).textContent = formatNum(r.kills);
    (el.querySelector('[data-s="level"]') as HTMLElement).textContent = String(r.level);
    (el.querySelector('[data-s="top"]') as HTMLElement).textContent = r.topWeaponName;

    const list = el.querySelector('.result-build-list') as HTMLElement;
    for (const w of r.build.weapons) {
      const item = document.createElement('div');
      item.className = 'build-item' + (w.def.isEvolved ? ' build-item--evolved' : '');
      item.appendChild(atlas.icon(w.def.icon, 22));
      const label = document.createElement('b');
      label.textContent = `${i18nName(w.def)} Lv${w.level}`;
      item.appendChild(label);
      list.appendChild(item);
    }
    for (const p of r.build.passives) {
      const item = document.createElement('div');
      item.className = 'build-item';
      item.appendChild(atlas.icon(p.def.icon, 22));
      const label = document.createElement('b');
      label.textContent = `${i18nName(p.def)} Lv${p.level}`;
      item.appendChild(label);
      list.appendChild(item);
    }

    el.querySelector('[data-act="restart"]')?.addEventListener('click', onRestart);
    el.querySelector('[data-act="title"]')?.addEventListener('click', onTitle);
    el.querySelector('[data-act="share"]')?.addEventListener('click', onShare);
    this.doubleBtn?.addEventListener('click', () => {
      if (onDouble && !this.busy && !this.claimed) {
        this.setBusy(true);
        void onDouble()
          .then((ok) => {
            if (ok && !this.claimed) {
              this.claimed = true;
              this.shownCents += r.soulEarnedCents;
              this.refreshSoul();
            }
          })
          .finally(() => {
            this.setBusy(false);
            if (this.doubleBtn && this.claimed) {
              this.doubleBtn.disabled = true;
              this.doubleBtn.classList.add('is-done');
              const label = this.doubleBtn.querySelector('span');
              if (label) label.textContent = t('gameover.doubleClaimed');
            }
          });
      }
    });
  }

  /** 当前展示的灵魂入账额（双倍后为原始额 ×2） */
  get soulDisplayCents(): number {
    return this.shownCents;
  }

  private refreshSoul(): void {
    if (this.soulEl) this.soulEl.textContent = `+${formatSouls(this.shownCents)}`;
  }

  private setBusy(b: boolean): void {
    this.busy = b;
    if (this.doubleBtn) this.doubleBtn.classList.toggle('is-busy', b);
  }

  hide(): void {
    this.el?.remove();
    this.el = null;
    this.doubleBtn = null;
    this.soulEl = null;
    this.claimed = false;
    this.busy = false;
  }
}
