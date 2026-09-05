import { Application, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import {
  PETS,
  PET_BY_ID,
  dmgFor,
  foodToNext,
  hpFor,
  visualScale,
  volFor,
  type PetDef,
  type PetRarity,
} from '../data/pets';
import { Tex } from '../render/TexKeys';
import { atlas } from '../render/Textures';
import { Storage, type SaveData } from '../save/Storage';
import { i18nName, petBuffText, rarityLabel, t } from '../i18n';

/** 宠物在展示园的基准宽（体积比例 =1 时） */
const PARK_BASE_W = 72;
/** 展示区四周留白（世界坐标，留出草地观感） */
const PAD = 170;
/** 放大上限固定；缩小下限为动态值 = 最近一次「适应全部」视野缩放 × 0.1 */
const ZOOM_MAX = 1.35;
const RARITY_COLOR: Record<PetRarity, number> = {
  common: 0x9fb2e0,
  rare: 0xc58cff,
  legend: 0xf5c451,
};

interface ParkItem {
  def: PetDef;
  level: number;
  r: number; // 展示半径（世界坐标 = PARK_BASE_W/2 × visualScale）
  x: number; // 中心 x
  y: number; // 中心 y（待机动画会在 y 上浮动）
  phase: number;
  sprite: Sprite;
}

/** 图鉴索引缓存：Tex.Pet + PETS 下标 */
const iconOf = (() => {
  const cache = new Map<string, number>();
  return (id: string): number => {
    let k = cache.get(id);
    if (k === undefined) {
      k = Tex.Pet + PETS.findIndex((p) => p.id === id);
      cache.set(id, k);
    }
    return k;
  };
})();

/**
 * 宠物园：独立的绿地展示场景（Pixi）。
 * 所有已拥有宠物按当前养成体型站上展台做待机动画；支持拖拽平移 / 缩放 / 适应全部；
 * 点击宠物弹出详情并可原地投喂升级（与饲养园同一套宠物数据与存档规则）。
 */
export class PetPark {
  /** 挂到 app.stage 的场景根 */
  readonly scene = new Container();

  private readonly podia = new Container();
  private readonly pets = new Container();

  private app: Application | null = null;
  private uiRoot: HTMLElement | null = null;
  private save: SaveData | null = null;
  private onClose: (() => void) | null = null;

  private ground: TilingSprite | null = null;
  private items: ParkItem[] = [];

  /** 视角：zoom 缩放、camX/camY 为视野中心（世界坐标） */
  private zoom = 0.5;
  /** 最近一次「适应全部」的实际视野缩放；缩小下限 = 该值 × 0.1（随屏幕自适应） */
  private fitZoom = 1;
  private camX = 0;
  private camY = 0;
  private field: Rectangle = new Rectangle(0, 0, 800, 600);

  private animT = 0;
  private down = false;
  private moved = false;
  private downX = 0;
  private downY = 0;
  private selId: string | null = null;

  /** DOM 层（控制条 + 详情卡）；park-ui 整层不拦截指针，子按钮 auto */
  private ui: HTMLDivElement | null = null;
  private detailEl: HTMLElement | null = null;

  private resizeFn: ((w: number, h: number) => void) | null = null;

  get visible(): boolean {
    return this.ui !== null;
  }

  /** 供调试/自动化读取的当前缩放与全览基准（只读） */
  get cameraZoom(): number {
    return this.zoom;
  }

  get cameraFit(): number {
    return this.fitZoom;
  }

  show(app: Application, uiRoot: HTMLElement, save: SaveData, onClose: () => void): void {
    this.app = app;
    this.uiRoot = uiRoot;
    this.save = save;
    this.onClose = onClose;

    app.stage.addChild(this.scene);
    this.scene.addChild(this.podia);
    this.scene.addChild(this.pets);
    this.scene.eventMode = 'static';
    this.scene.cursor = 'grab';
    // 草地配色铺满画布：把渲染底色换成草地绿，多余区域（缩放后露白）也会是草地色
    this.app.renderer.background.color = 0x5aa862;
    this.scene.on('pointerdown', this.onDown);
    this.scene.on('pointermove', this.onMove);
    this.scene.on('pointerup', this.onUp);
    this.scene.on('pointerupoutside', this.onUp);
    this.scene.on('pointercancel', this.onUp);

    this.buildUi();
    this.rebuild();
    this.fitAll();

    const fn = (w: number, h: number): void => {
      void w;
      void h;
      this.refreshViewport();
    };
    this.resizeFn = fn;
    app.renderer.on('resize', fn);
    this.refreshViewport();
  }

  hide(): void {
    if (this.app) this.app.renderer.background.color = 0x0a0713;
    this.app?.stage.removeChild(this.scene);
    if (this.resizeFn && this.app) {
      this.app.renderer.off('resize', this.resizeFn);
      this.resizeFn = null;
    }
    this.scene.off('pointerdown', this.onDown);
    this.scene.off('pointermove', this.onMove);
    this.scene.off('pointerup', this.onUp);
    this.scene.off('pointerupoutside', this.onUp);
    this.scene.off('pointercancel', this.onUp);
    this.ui?.remove();
    this.ui = null;
    this.detailEl = null;
    this.clearScene();
    this.app = null;
    this.uiRoot = null;
    this.save = null;
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  /** 帧驱动待机动画（由 Game.render 在公园打开时调用） */
  update(frameDt: number): void {
    if (!this.visible) return;
    this.animT += frameDt;
    const list = this.items;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const bob = Math.sin(this.animT * 2.1 + it.phase) * Math.max(2.5, it.r * 0.07);
      it.sprite.y = it.y - bob;
      it.sprite.rotation =
        Math.sin(this.animT * 1.7 + it.phase * 1.7) * 0.05 * Math.min(1, 22 / Math.max(8, it.r));
      // 传说专属：叠加极轻微呼吸缩放
      const breathe = it.def.rarity === 'legend' ? 1 + 0.03 * Math.sin(this.animT * 2.6 + it.phase) : 1;
      it.sprite.width = it.r * 2 * breathe;
      it.sprite.height = it.r * 2 * breathe;
    }
  }

  // ——————————————— 场景构建 ———————————————

  private clearScene(): void {
    this.ground?.destroy();
    this.ground = null;
    this.podia.removeChildren().forEach((c) => c.destroy());
    this.pets.removeChildren().forEach((c) => c.destroy());
    this.items = [];
    this.field = new Rectangle(0, 0, 800, 600);
  }

  /** 依据当前存档重建草地与全部宠物（喂食升级后调用可让体型原地变大） */
  rebuild(): void {
    if (!this.save) return;
    this.clearScene();
    const app = this.app;
    if (!app) return;

    const owned = this.save.petsOwned
      .map((id) => PET_BY_ID[id])
      .filter((p): p is PetDef => !!p);
    const rowsData: { def: PetDef; level: number; r: number }[] = owned.map((def) => {
      const level = this.save?.petLevels[def.id] ?? 1;
      const r = (PARK_BASE_W / 2) * visualScale(def, level);
      return { def, level, r };
    });

    // —— 布局：按列均分放置（每行以最大体型留间距），保证巨大宠不互相重叠 ——
    let bounds = new Rectangle(0, 0, 1, 1);
    if (rowsData.length > 0) {
      const n = rowsData.length;
      const maxR = rowsData.reduce((m, d) => Math.max(m, d.r), 0);
      const cellW = Math.max(140, maxR * 2 * 1.55);
      const rowH = Math.max(150, maxR * 2 * 1.65);
      const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.8))));
      const rows = Math.ceil(n / cols);
      const gridW = cols * cellW;
      const gridH = rows * rowH;
      const originX = PAD + gridW / 2;
      const originY = PAD + gridH / 2;
      for (let i = 0; i < n; i++) {
        const d = rowsData[i];
        const cx = originX - gridW / 2 + ((i % cols) + 0.5) * cellW;
        const cy = originY - gridH / 2 + ((i / cols) | 0) * rowH + rowH / 2;
        const it: ParkItem = {
          def: d.def,
          level: d.level,
          r: d.r,
          x: cx,
          y: cy,
          phase: (i / n) * Math.PI * 2,
          sprite: new Sprite(atlas.get(iconOf(d.def.id))),
        };
        it.sprite.anchor.set(0.5);
        it.sprite.width = d.r * 2;
        it.sprite.height = d.r * 2;
        it.sprite.position.set(cx, cy);
        it.sprite.eventMode = 'none';
        this.pets.addChild(it.sprite);
        this.items.push(it);
      }
      bounds = new Rectangle(originX - gridW / 2, originY - gridH / 2, gridW, gridH);
    }

    // 草地铺满展示区域（含留白）
    const pad = PAD;
    this.field = new Rectangle(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2);
    this.field = new Rectangle(
      Math.min(this.field.x, -pad * 0.5),
      Math.min(this.field.y, -pad * 0.5),
      Math.max(this.field.width, pad * 2),
      Math.max(this.field.height, pad * 2),
    );

    // 地面：绿色平铺草地
    const tex = this.grassTexture(app);
    this.ground = new TilingSprite({ texture: tex, width: this.field.width, height: this.field.height });
    this.ground.position.set(this.field.x, this.field.y);
    this.ground.eventMode = 'none';
    this.scene.addChildAt(this.ground, 0);

    // 展台/底座（垫在所有宠物下面）
    for (const it of this.items) this.drawPodium(it);

    // 命中区域 = 草地范围（世界坐标）
    this.scene.hitArea = new Rectangle(this.field.x, this.field.y, this.field.width, this.field.height);
  }

  private drawPodium(it: ParkItem): void {
    const g = new Graphics();
    const color = RARITY_COLOR[it.def.rarity];
    const bottomY = it.y + it.r;
    const pr = Math.max(10, it.r * 1.05);
    // 阴影
    g.ellipse(it.x, bottomY + 7, pr * 1.1, pr * 0.4).fill({ color: 0x0e2a14, alpha: 0.35 });
    // 圆台
    g.ellipse(it.x, bottomY, pr, pr * 0.42).fill({ color: 0x2e6b3c, alpha: 0.9 });
    g.ellipse(it.x, bottomY, pr, pr * 0.42).stroke({
      width: Math.max(1.5, it.r * 0.05),
      color,
      alpha: 0.6,
    });
    // 台面高光
    g.ellipse(it.x, bottomY - 2, pr * 0.8, pr * 0.3).fill({ color: 0x54a05e, alpha: 0.85 });
    this.podia.addChild(g);
  }

  /** 生成一张无缝感更强的绿地平铺贴图（确定随机 + 安全边距，避免 tile 接缝） */
  private grassTexture(app: Application): Texture {
    const g = new Graphics();
    let seed = 20260817;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const S = 512;
    const PAD = 72; // 安全边距：所有随机元素距边缘 >= PAD，让 tile 接缝自然
    g.rect(0, 0, S, S).fill({ color: 0x5aa862 });
    // 边缘一圈额外填一层同色，防拼接露出深色背景
    g.rect(0, 0, S, 24).fill({ color: 0x5aa862 });
    g.rect(0, S - 24, S, 24).fill({ color: 0x5aa862 });
    g.rect(0, 0, 24, S).fill({ color: 0x5aa862 });
    g.rect(S - 24, 0, 24, S).fill({ color: 0x5aa862 });
    // 颜色斑块（控制在安全区内）
    for (let i = 0; i < 56; i++) {
      const x = PAD + rnd() * (S - PAD * 2);
      const y = PAD + rnd() * (S - PAD * 2);
      const r = 22 + rnd() * 42;
      const darker = rnd() < 0.5;
      g.circle(x, y, r).fill({ color: darker ? 0x43894f : 0x73c477, alpha: 0.16 });
    }
    // 草叶细线
    for (let i = 0; i < 720; i++) {
      const x = PAD + rnd() * (S - PAD * 2);
      const y = PAD + rnd() * (S - PAD * 2);
      const len = 5 + rnd() * 8;
      const col = rnd() < 0.5 ? 0x43894f : 0x86d28a;
      g.roundRect(x, y - len / 2, 1.6, len, 0.8).fill({ color: col, alpha: 0.55 });
    }
    // 小黄花（也限在安全区）
    for (let i = 0; i < 28; i++) {
      const x = PAD + rnd() * (S - PAD * 2);
      const y = PAD + rnd() * (S - PAD * 2);
      g.circle(x, y, 1.4 + rnd() * 1).fill({ color: 0xffe6a0, alpha: 0.85 });
      g.circle(x, y, 0.6).fill({ color: 0xfff3c8, alpha: 1 });
    }
    const tex = app.renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  // ——————————————— 视角 ———————————————

  private refreshViewport(): void {
    const app = this.app;
    if (!app) return;
    this.applyView();
  }

  private applyView(): void {
    const app = this.app;
    if (!app) return;
    const w = app.screen.width;
    const h = app.screen.height;
    this.scene.scale.set(this.zoom, this.zoom);
    this.scene.x = w / 2 - this.camX * this.zoom;
    this.scene.y = h / 2 - this.camY * this.zoom;
  }

  private clampZoom(z: number): number {
    return Math.min(ZOOM_MAX, Math.max(0.1 * this.fitZoom, z));
  }

  zoomIn(): void {
    this.zoom = this.clampZoom(this.zoom * 1.28);
    this.applyView();
  }

  zoomOut(): void {
    this.zoom = this.clampZoom(this.zoom / 1.28);
    this.applyView();
  }

  /** 适应全部：按整片展示区计算视野，保证全部宠物（含巨大宠）可见 */
  fitAll(): void {
    const app = this.app;
    if (!app) return;
    const w = Math.max(1, app.screen.width);
    const h = Math.max(1, app.screen.height);
    const fw = Math.max(1, this.field.width);
    const fh = Math.max(1, this.field.height);
    const fit = Math.min((w * 0.92) / fw, (h * 0.92) / fh);
    // 记录实际生效的全览缩放：fit 若超放大上限则以可见上限 1.35 为基准
    this.fitZoom = Math.min(ZOOM_MAX, fit);
    this.zoom = this.clampZoom(fit);
    this.camX = this.field.x + fw / 2;
    this.camY = this.field.y + fh / 2;
    this.applyView();
  }

  // ——————————————— 交互 ———————————————

  private onDown = (e: { global: { x: number; y: number } }): void => {
    this.down = true;
    this.moved = false;
    this.downX = e.global.x;
    this.downY = e.global.y;
  };

  private onMove = (e: { global: { x: number; y: number } }): void => {
    if (!this.down) return;
    const dx = e.global.x - this.downX;
    const dy = e.global.y - this.downY;
    if (Math.hypot(dx, dy) > 5) this.moved = true;
    if (this.moved) {
      this.camX -= dx / this.zoom;
      this.camY -= dy / this.zoom;
      this.downX = e.global.x;
      this.downY = e.global.y;
      this.applyView();
    }
  };

  private onUp = (e: { global: { x: number; y: number } }): void => {
    this.down = false;
    if (this.moved) {
      this.moved = false;
      return;
    }
    // 未拖动 = 点击：换算世界坐标找宠物
    const p = this.scene.toLocal({ x: e.global.x, y: e.global.y });
    const found = this.itemAt(p.x, p.y);
    if (found) this.openDetail(found.def.id);
  };

  private itemAt(wx: number, wy: number): ParkItem | null {
    const list = this.items;
    for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      const dx = wx - it.x;
      const dy = wy - (it.y - it.r * 0.25);
      if (dx * dx + dy * dy <= it.r * it.r * 1.15) return it;
    }
    return null;
  }

  // ——————————————— DOM 控制条与详情 ———————————————

  private buildUi(): void {
    if (!this.uiRoot) return;
    const ui = document.createElement('div');
    ui.className = 'park-ui';
    ui.innerHTML = `
      <div class="park-topbar">
        <button class="btn btn--ghost park-back" aria-label="${t('park.backAria')}">${t('park.back')}</button>
        <span class="park-hint">${t('park.hint')}</span>
      </div>
      <div class="park-controls">
        <button class="btn park-ctl" data-act="zoomout" aria-label="${t('hud.zoomOut')}">－</button>
        <button class="btn park-ctl" data-act="zoomin" aria-label="${t('hud.zoomIn')}">＋</button>
        <button class="btn park-ctl park-ctl--fit" data-act="fit">${t('park.fit')}</button>
      </div>
    `;
    ui.querySelector('.park-back')?.addEventListener('click', () => this.hide());
    ui.querySelector('[data-act="zoomin"]')?.addEventListener('click', () => this.zoomIn());
    ui.querySelector('[data-act="zoomout"]')?.addEventListener('click', () => this.zoomOut());
    ui.querySelector('[data-act="fit"]')?.addEventListener('click', () => this.fitAll());
    // 详情卡内的投喂 / 关闭委托
    ui.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const feed = t.closest<HTMLElement>('.park-feed');
      const close = t.closest<HTMLElement>('.park-detail-close');
      if (feed && feed.dataset.feed) {
        this.feedPet(feed.dataset.feed);
        return;
      }
      if (close) {
        const dlg = this.ui?.querySelector('.park-detail');
        if (dlg) dlg.remove();
        this.detailEl = null;
        this.selId = null;
      }
    });
    this.uiRoot.appendChild(ui);
    this.ui = ui;
  }

  private openDetail(id: string): void {
    this.selId = id;
    if (!this.ui) return;
    let dlg = this.ui.querySelector<HTMLElement>('.park-detail');
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.className = 'park-detail';
      this.ui.appendChild(dlg);
    }
    this.detailEl = dlg;
    this.renderDetail(id);
  }

  private feedPet(id: string): void {
    const s = this.save;
    if (!s) return;
    const def = PET_BY_ID[id];
    if (!def || !s.petsOwned.includes(id)) return;
    const lv = s.petLevels[id] ?? 1;
    const need = foodToNext(lv);
    if (s.petFood < need) return;
    s.petFood -= need;
    s.petLevels[id] = lv + 1;
    Storage.save(s);
    this.rebuild();
    this.fitAll();
    this.openDetail(id);
  }

  private renderDetail(id: string): void {
    const s = this.save;
    const el = this.detailEl;
    if (!s || !el) return;
    const def = PET_BY_ID[id];
    if (!def || !s.petsOwned.includes(id)) {
      el.remove();
      this.detailEl = null;
      return;
    }
    const lv = s.petLevels[id] ?? 1;
    const need = foodToNext(lv);
    const can = s.petFood >= need;
    const ico = atlas.icon(iconOf(id), 56);
    el.innerHTML = '';
    el.className = `park-detail pet-r-${def.rarity}`;
    const head = document.createElement('div');
    head.className = 'park-detail-head';
    const ic = document.createElement('span');
    ic.className = 'park-detail-ico';
    ic.appendChild(ico);
    head.appendChild(ic);
    const ti = document.createElement('div');
    ti.className = 'park-detail-title';
    ti.innerHTML = `<b>${i18nName(def)}</b><span class="pet-tag">${rarityLabel(def.rarity)}</span><span class="pet-lv">${t('pet.lv', { lv })}</span>`;
    head.appendChild(ti);
    el.appendChild(head);

    const stats = document.createElement('div');
    stats.className = 'pet-stat-grid';
    stats.innerHTML = `
      <div class="pet-stat"><b>${volFor(def, lv).toFixed(1)}</b><span>${t('pet.statVol')}</span></div>
      <div class="pet-stat"><b>${hpFor(def, lv)}</b><span>${t('pet.statHp')}</span></div>
      <div class="pet-stat"><b>${dmgFor(def, lv)}</b><span>${t('pet.statDmg')}</span></div>
      <div class="pet-stat"><b>${Math.round(visualScale(def, lv) * 100)}%</b><span>${t('pet.statSize')}</span></div>
    `;
    el.appendChild(stats);
    const buffLine = petBuffText(def);
    if (buffLine) {
      const b = document.createElement('p');
      b.className = 'pet-buff';
      b.textContent = `${t('pet.buffTitle')} · ${buffLine}`;
      el.appendChild(b);
    }
    const feed = document.createElement('button');
    feed.className = 'btn btn--primary park-feed' + (can ? '' : ' is-disabled');
    feed.dataset.feed = id;
    feed.innerHTML = t('pet.feedNeed', { n: need });
    el.appendChild(feed);
    const close = document.createElement('button');
    close.className = 'btn btn--ghost park-detail-close';
    close.textContent = t('park.close');
    el.appendChild(close);
  }
}
