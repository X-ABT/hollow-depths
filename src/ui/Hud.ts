import type { Build } from '../core/Build';
import { formatNum, formatTime } from '../core/MathUtil';
import type { UpgradeOption } from '../core/Build';
import { atlas } from '../render/Textures';
import { i18nName, t } from '../i18n';

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
  private readonly bossHp: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly bossCd: HTMLElement;
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
  private lastClock = '';
  private lastKills = '';
  private lastLv = '';
  private lastBossHp = -1;
  private lastBossCd = '';
  private readonly modeEl: HTMLElement;

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
        <div class="hud-mode" hidden></div>
      </div>
      <div class="hud-boss">
        <div class="hud-boss-name"><span class="hud-boss-title"></span><span class="hud-boss-hp"></span></div>
        <div class="hud-boss-bar"><i></i></div>
      </div>
      <div class="hud-boss-cd" hidden></div>
      <div class="hud-slots">
        <div class="slot-row" data-row="w"></div>
        <div class="slot-row" data-row="p"></div>
      </div>
      <div class="hud-zoom">
        <button data-zoom="in" aria-label="${t('hud.zoomIn')}">＋</button>
        <button data-zoom="reset" class="zoom-reset" aria-label="${t('hud.zoomReset')}"></button>
        <button data-zoom="out" aria-label="${t('hud.zoomOut')}">－</button>
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
    this.bossName = el.querySelector('.hud-boss-title') as HTMLElement;
    this.bossHp = el.querySelector('.hud-boss-hp') as HTMLElement;
    this.bossFill = el.querySelector('.hud-boss-bar > i') as HTMLElement;
    this.bossCd = el.querySelector('.hud-boss-cd') as HTMLElement;
    this.weaponRow = el.querySelector('[data-row="w"]') as HTMLElement;
    this.passiveRow = el.querySelector('[data-row="p"]') as HTMLElement;
    this.zoomResetBtn = el.querySelector('[data-zoom="reset"]') as HTMLElement;
    this.modeEl = el.querySelector('.hud-mode') as HTMLElement;

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

  /** 无尽幽墟模式徽标（标准局隐藏） */
  setMode(endless: boolean): void {
    if (!this.modeEl) return;
    this.modeEl.hidden = !endless;
    if (endless) this.modeEl.textContent = t('hud.endless');
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
    // 值变化才写 DOM，避免每帧重复赋值造成布局/渲染抖动
    const lv = `Lv ${level}`;
    if (lv !== this.lastLv) {
      this.lvText.textContent = lv;
      this.lastLv = lv;
    }
    const clock = formatTime(time);
    if (clock !== this.lastClock) {
      this.clockText.textContent = clock;
      this.lastClock = clock;
    }
    const ks = t('hud.kills', { n: formatNum(kills) });
    if (ks !== this.lastKills) {
      this.killsText.textContent = ks;
      this.lastKills = ks;
    }
  }

  setBoss(name: string | null, hp: number, maxHp: number): void {
    if (name === null) {
      if (this.bossWrap.classList.contains('is-on')) this.bossWrap.classList.remove('is-on');
      this.lastBossHp = -1;
      return;
    }
    if (!this.bossWrap.classList.contains('is-on')) {
      this.bossName.textContent = name;
      this.bossWrap.classList.add('is-on');
    }
    const hpInt = Math.ceil(hp);
    if (hpInt !== this.lastBossHp) {
      const ratio = Math.max(0, Math.min(1, hp / maxHp));
      // 血条即时吸附真实 HP（无平滑过渡），避免爆发伤害下血条滞后于实际数值
      this.bossFill.style.transform = `scaleX(${ratio})`;
      this.bossHp.textContent = `${hpInt} / ${Math.ceil(maxHp)}`;
      this.lastBossHp = hpInt;
    }
  }

  /** 左上角显示下一个 Boss 出现的倒计时（name 为 null 时隐藏）；mul 为快杀叠加的血量倍率 */
  setBossCountdown(name: string | null, remain: number, mul = 1): void {
    if (name === null || remain <= 0) {
      if (!this.bossCd.hidden) this.bossCd.hidden = true;
      return;
    }
    // 内容不变时跳过，倒计时每秒才变化一次，避免每帧重建 DOM
    const tag = mul > 1 ? `<em class="cd-mul">×${mul}</em>` : '';
    const content = `⚔ ${name}${tag} ${formatTime(Math.max(1, Math.ceil(remain)))}`;
    if (content !== this.lastBossCd) {
      this.bossCd.innerHTML = content;
      this.lastBossCd = content;
    }
    if (this.bossCd.hidden) this.bossCd.hidden = false;
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
      slot.title = `${i18nName(w.def)} Lv${w.level}`;
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
      slot.title = `${i18nName(p.def)} Lv${p.level}`;
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
      chip.title = `${i18nName(w.def)} Lv${w.level}`;
      strip.appendChild(chip);
    }
    for (const p of build.passives) {
      const chip = document.createElement('div');
      chip.className = 'build-chip';
      chip.appendChild(atlas.icon(p.def.icon, 18));
      chip.title = `${i18nName(p.def)} Lv${p.level}`;
      strip.appendChild(chip);
    }
    void options;
    return strip;
  }

  reset(): void {
    this.lastHp = -1;
    this.buildSig = '';
    this.setBoss(null, 0, 0);
    this.setBossCountdown(null, 0);
  }
}
