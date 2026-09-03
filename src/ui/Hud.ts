import type { Build } from '../core/Build';
import { formatNum, formatTime } from '../core/MathUtil';
import type { UpgradeOption } from '../core/Build';
import { atlas } from '../render/Textures';

/** 战斗界面 HUD：血条 / 经验 / 计时 / 击杀 / Boss 血条 / 武器被动槽 */
export class Hud {
  readonly el: HTMLDivElement;

  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly hpWrap: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly lvText: HTMLElement;
  private readonly clockText: HTMLElement;
  private readonly killsText: HTMLElement;

  private readonly bossWrap: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly zoomResetBtn: HTMLElement;
  private lastZoomLabel = -1;

  /** 视野缩放回调（Game 注入） */
  onZoomIn: () => void = () => {};
  onZoomOut: () => void = () => {};
  onZoomReset: () => void = () => {};

  private readonly weaponRow: HTMLElement;
  private readonly passiveRow: HTMLElement;

  private lastHp = -1;
  private buildSig = '';

  constructor(root: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'hud';
    el.innerHTML = `
      <div class="hud-top">
        <div class="hud-hp"><i></i><span class="hud-hp-text"></span></div>
        <div class="hud-xp"><i></i></div>
        <div class="hud-lv"></div>
        <div class="hud-clock"></div>
        <div class="hud-kills"></div>
      </div>
      <div class="hud-boss">
        <div class="hud-boss-name"></div>
        <div class="hud-boss-bar"><i></i></div>
      </div>
      <div class="hud-slots">
        <div class="slot-row" data-row="w"></div>
        <div class="slot-row" data-row="p"></div>
      </div>
      <div class="hud-zoom">
        <button data-zoom="in" aria-label="放大视野">＋</button>
        <button data-zoom="reset" class="zoom-reset" aria-label="重置视野"></button>
        <button data-zoom="out" aria-label="缩小视野">－</button>
      </div>
    `;
    root.appendChild(el);
    this.el = el;

    this.hpWrap = el.querySelector('.hud-hp') as HTMLElement;
    this.hpFill = el.querySelector('.hud-hp > i') as HTMLElement;
    this.hpText = el.querySelector('.hud-hp-text') as HTMLElement;
    this.xpFill = el.querySelector('.hud-xp > i') as HTMLElement;
    this.lvText = el.querySelector('.hud-lv') as HTMLElement;
    this.clockText = el.querySelector('.hud-clock') as HTMLElement;
    this.killsText = el.querySelector('.hud-kills') as HTMLElement;
    this.bossWrap = el.querySelector('.hud-boss') as HTMLElement;
    this.bossName = el.querySelector('.hud-boss-name') as HTMLElement;
    this.bossFill = el.querySelector('.hud-boss-bar > i') as HTMLElement;
    this.weaponRow = el.querySelector('[data-row="w"]') as HTMLElement;
    this.passiveRow = el.querySelector('[data-row="p"]') as HTMLElement;
    this.zoomResetBtn = el.querySelector('[data-zoom="reset"]') as HTMLElement;

    el.querySelector('[data-zoom="in"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onZoomIn();
    });
    el.querySelector('[data-zoom="out"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onZoomOut();
    });
    this.zoomResetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onZoomReset();
    });
  }

  /** 更新缩放倍率提示（reset 按钮上显示，如 ×1.0）；值未变时不重复写 DOM */
  setZoomLabel(z: number): void {
    const v = Math.round(z * 10);
    if (v === this.lastZoomLabel) return;
    this.lastZoomLabel = v;
    this.zoomResetBtn.textContent = `×${z.toFixed(1)}`;
  }

  setVisible(v: boolean): void {
    this.el.style.display = v ? '' : 'none';
  }

  update(hp: number, maxHp: number, xp: number, xpNext: number, level: number, time: number, kills: number): void {
    // 用 transform 缩放而非改 width，避免触发布局重排
    this.hpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, hp / maxHp))})`;
    this.xpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, xp / xpNext))})`;
    const hpInt = Math.ceil(hp);
    if (hpInt !== this.lastHp) {
      this.hpText.textContent = `${Math.max(0, hpInt)} / ${Math.ceil(maxHp)}`;
      if (hpInt < this.lastHp) {
        this.hpWrap.classList.remove('is-hurt');
        void this.hpWrap.offsetWidth; // 强制重启动画
        this.hpWrap.classList.add('is-hurt');
      }
      this.lastHp = hpInt;
    }
    this.lvText.textContent = `Lv ${level}`;
    this.clockText.textContent = formatTime(time);
    this.killsText.textContent = `${formatNum(kills)} 击杀`;
  }

  setBoss(name: string | null, ratio: number): void {
    if (name === null) {
      this.bossWrap.classList.remove('is-on');
      return;
    }
    if (!this.bossWrap.classList.contains('is-on')) {
      this.bossName.textContent = name;
      this.bossWrap.classList.add('is-on');
    }
    this.bossFill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  }

  /** build 变化时重建图标槽（用签名避免每帧重建 DOM） */
  syncBuild(build: Build): void {
    const wSig = build.weapons.map((w) => `${w.def.id}${w.level}`).join(',');
    const pSig = build.passives.map((p) => `${p.def.id}${p.level}`).join(',');
    const sig = `${wSig}|${pSig}`;
    if (sig === this.buildSig) return;
    this.buildSig = sig;

    this.weaponRow.textContent = '';
    for (const w of build.weapons) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (w.def.isEvolved ? ' slot--evolved' : '');
      slot.title = `${w.def.name} Lv${w.level}`;
      slot.appendChild(atlas.icon(w.def.icon, 28));
      const lv = document.createElement('span');
      lv.className = 'slot-lv';
      lv.textContent = String(w.level);
      slot.appendChild(lv);
      this.weaponRow.appendChild(slot);
    }

    this.passiveRow.textContent = '';
    for (const p of build.passives) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.title = `${p.def.name} Lv${p.level}`;
      slot.appendChild(atlas.icon(p.def.icon, 28));
      const lv = document.createElement('span');
      lv.className = 'slot-lv';
      lv.textContent = String(p.level);
      slot.appendChild(lv);
      this.passiveRow.appendChild(slot);
    }
  }

  /** 升级弹窗底部展示当前 build 的迷你图标条 */
  renderBuildStrip(options: UpgradeOption[], build: Build): HTMLElement {
    const strip = document.createElement('div');
    strip.className = 'build-strip';
    for (const w of build.weapons) {
      const chip = document.createElement('div');
      chip.className = 'build-chip' + (w.def.isEvolved ? ' build-chip--evolved' : '');
      chip.appendChild(atlas.icon(w.def.icon, 18));
      chip.title = `${w.def.name} Lv${w.level}`;
      strip.appendChild(chip);
    }
    for (const p of build.passives) {
      const chip = document.createElement('div');
      chip.className = 'build-chip';
      chip.appendChild(atlas.icon(p.def.icon, 18));
      chip.title = `${p.def.name} Lv${p.level}`;
      strip.appendChild(chip);
    }
    void options;
    return strip;
  }

  reset(): void {
    this.lastHp = -1;
    this.buildSig = '';
    this.setBoss(null, 0);
  }
}
