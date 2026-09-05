import { formatNum, formatTime, formatSouls } from '../core/MathUtil';
import { isTampered, type SaveData } from '../save/Storage';
import { isEn, setLang, t } from '../i18n';

export interface TitleHandlers {
  /** 开局模式：标准一局 / 无尽幽墟 */
  onStart: (mode: 'standard' | 'endless') => void;
  /** 清除全部存档并刷新页面重加载（由 Game 执行 Storage.reset + reload） */
  onClearData: () => void;
  onTogglePause: () => void;
  /** 打开商店（仅主界面可用） */
  onShop: () => void;
  /** 打开宠物中心（饲养园，仅主界面可用） */
  onPet: () => void;
  /** 打开宠物园（绿地展示场景，仅主界面可用） */
  onPark: () => void;
  /** 打开宠物远征（营地 + 横版闯关） */
  onExpedition: () => void;
}

/** 标题页：进入游戏 / 商店 / 玩法说明 / 清除数据 */
export class TitleScreen {
  private el: HTMLDivElement | null = null;
  private soulsEl: HTMLElement | null = null;
  private root: HTMLElement | null = null;
  private clearEl: HTMLDivElement | null = null;
  private startEl: HTMLDivElement | null = null;

  show(root: HTMLElement, save: SaveData, h: TitleHandlers): void {
    this.hide();
    const el = document.createElement('div');
    el.className = 'title-screen';
    el.innerHTML = `
      <div class="title-emblem"></div>
      <h1 class="title-main">HOLLOW DEPTHS</h1>
      <div class="title-sub">${t('title.sub')}</div>
      ${isTampered()
        ? `<div class="tamper-badge" role="alert"><span class="tamper-badge-dot" aria-hidden="true"></span>
            <span><b>${t('title.tamperBadge')}</b><small>${t('title.tamperHint')}</small></span>
          </div>`
        : ''}
      <div class="title-soul">${t('title.soul')}　<b>${formatSouls(save.soulCents)}</b></div>
      <div class="title-lang" role="group" aria-label="${t('title.langLabel')}">
        <button type="button" class="lang-btn ${!isEn() ? 'is-active' : ''}" data-lang="zh">中文</button>
        <button type="button" class="lang-btn ${isEn() ? 'is-active' : ''}" data-lang="en">English</button>
      </div>
      <div class="title-actions">
        <button class="btn btn--primary" data-act="start">${t('title.start')}</button>
        <button class="btn" data-act="shop">${t('title.shop')}</button>
        <button class="btn" data-act="pet">${t('title.pet')}</button>
        <button class="btn" data-act="expedition">${t('title.expedition')}</button>
        <button class="btn" data-act="park">${t('title.park')}</button>
        <button class="btn" data-act="help">${t('title.help')}</button>
        <button class="btn btn--ghost" data-act="clear">${t('title.clear')}</button>
      </div>
      <div class="title-best"></div>
      <div class="title-help" hidden>${t('title.helpLines')}</div>
    `;
    root.appendChild(el);
    this.el = el;
    this.root = root;
    this.soulsEl = el.querySelector('.title-soul b') as HTMLElement;

    // 语言切换（整页重载以一致应用）
    el.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
      b.addEventListener('click', () => setLang(b.dataset.lang === 'en' ? 'en' : 'zh'));
    });

    const best = el.querySelector('.title-best') as HTMLElement;
    if (save.runs > 0) {
      best.innerHTML = t('title.best', {
        time: formatTime(save.bestTime),
        kills: formatNum(save.bestKills),
        level: save.bestLevel,
      });
    } else {
      best.textContent = t('title.welcome');
    }

    el.querySelector('[data-act="start"]')?.addEventListener('click', () => this.openStartChoice(h));
    el.querySelector('[data-act="shop"]')?.addEventListener('click', h.onShop);
    el.querySelector('[data-act="pet"]')?.addEventListener('click', h.onPet);
    el.querySelector('[data-act="park"]')?.addEventListener('click', h.onPark);
    el.querySelector('[data-act="expedition"]')?.addEventListener('click', h.onExpedition);
    el.querySelector('[data-act="clear"]')?.addEventListener('click', () => this.openClearConfirm(h));
    const help = el.querySelector('.title-help') as HTMLElement;
    el.querySelector('[data-act="help"]')?.addEventListener('click', () => {
      help.hidden = !help.hidden;
    });
    void h.onTogglePause;
  }

  /** 打开「是否清除数据」确认弹层（带不可逆警告） */
  private openClearConfirm(h: TitleHandlers): void {
    this.closeClearConfirm();
    if (!this.root) return;
    const overlay = document.createElement('div');
    overlay.className = 'clear-confirm';
    overlay.innerHTML = `
      <div class="clear-card">
        <h2 class="clear-title">${t('title.clearTitle')}</h2>
        <p class="clear-warn">${t('title.clearWarn')}</p>
        <div class="clear-actions">
          <button class="btn btn--ghost" data-act="cancel">${t('common.cancel')}</button>
          <button class="btn clear-danger" data-act="ok">${t('title.clearOk')}</button>
        </div>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeClearConfirm();
    });
    overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', () => this.closeClearConfirm());
    overlay.querySelector('[data-act="ok"]')?.addEventListener('click', () => {
      this.closeClearConfirm();
      h.onClearData();
    });
    this.root.appendChild(overlay);
    this.clearEl = overlay;
  }

  /** 关闭确认弹层（若已打开） */
  private closeClearConfirm(): void {
    this.clearEl?.remove();
    this.clearEl = null;
  }

  /** 开局模式选择：标准一局 / 无尽幽墟 */
  private openStartChoice(h: TitleHandlers): void {
    this.closeStartChoice();
    if (!this.root) return;
    const overlay = document.createElement('div');
    overlay.className = 'start-select';
    overlay.innerHTML = `
      <div class="start-card">
        <h2 class="start-title">${t('title.modeTitle')}</h2>
        <button class="btn btn--primary start-opt" data-mode="standard">
          <b>${t('title.modeStandard')}</b>
          <span>${t('title.modeStandardDesc')}</span>
        </button>
        <button class="btn start-opt start-opt--endless" data-mode="endless">
          <b>${t('title.modeEndless')}</b>
          <span>${t('title.modeEndlessDesc')}</span>
        </button>
        <button class="btn btn--ghost start-cancel" data-act="cancel">${t('title.back')}</button>
      </div>
    `;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeStartChoice();
    });
    overlay.querySelector('[data-mode="standard"]')?.addEventListener('click', () => {
      this.closeStartChoice();
      h.onStart('standard');
    });
    overlay.querySelector('[data-mode="endless"]')?.addEventListener('click', () => {
      this.closeStartChoice();
      h.onStart('endless');
    });
    overlay.querySelector('[data-act="cancel"]')?.addEventListener('click', () => this.closeStartChoice());
    this.root.appendChild(overlay);
    this.startEl = overlay;
  }

  private closeStartChoice(): void {
    this.startEl?.remove();
    this.startEl = null;
  }

  /** 商店购买/结算入账后刷新灵魂余额显示（标题 DOM 仍保留） */
  refreshSouls(cents: number): void {
    if (this.soulsEl) this.soulsEl.textContent = formatSouls(cents);
  }

  hide(): void {
    this.closeClearConfirm();
    this.closeStartChoice();
    this.el?.remove();
    this.el = null;
    this.soulsEl = null;
    this.root = null;
  }
}
