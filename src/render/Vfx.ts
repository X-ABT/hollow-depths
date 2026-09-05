import { Container, Sprite, Text, type TextStyleOptions } from 'pixi.js';
import { Pool } from '../core/ObjectPool';
import { TAU } from '../core/MathUtil';
import { atlas } from './Textures';
import { Tex } from './TexKeys';

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  drag: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  value: number;
  crit: boolean;
}

/** 宠物爪击「三竖线」短特效 */
interface Claw {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
}

const MAX_PARTICLES = 700;
const MAX_TEXTS = 26;
const MAX_CLAWS = 18;

/**
 * 特效层：粒子与伤害飘字。
 *
 * 两者都走预分配对象池，运行期零 `new`；飘字还做了「节流」——
 * 普通伤害只按比例显示，避免怪潮时刷出上千个 Text 把帧率拖垮。
 */
export class Vfx {
  readonly container = new Container();
  private readonly pLayer = new Container();
  private readonly tLayer = new Container();

  private readonly parts = new Pool<Particle>(MAX_PARTICLES, () => ({
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    life: 0, maxLife: 1, size: 4, color: 0xffffff, drag: 3,
  }));
  private readonly pSprites: Sprite[] = [];

  private readonly texts = new Pool<FloatText>(MAX_TEXTS, () => ({
    x: 0, y: 0, vy: -46, life: 0, maxLife: 0.7, value: 0, crit: false,
  }));
  private readonly tObjs: Text[] = [];

  private readonly claws = new Pool<Claw>(MAX_CLAWS, () => ({
    x: 0, y: 0, life: 0, maxLife: 0.16, size: 1,
  }));
  private readonly cSprites: Sprite[] = [];

  /** 飘字节流计数：普通伤害每 N 次显示一次 */
  private hitCounter = 0;

  constructor() {
    this.container.addChild(this.pLayer);
    this.container.addChild(this.tLayer);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.pSprites.push(s);
      this.pLayer.addChild(s);
    }
    for (let i = 0; i < MAX_CLAWS; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      // 注意：不能在构造函数里 atlas.get()——Game 字段初始化早于 atlas.build()，
      // 这里纹理会在 render 时按需补齐
      this.cSprites.push(s);
      this.pLayer.addChild(s);
    }
    const critStyle: TextStyleOptions = {
      fontFamily: 'Noto Sans, system-ui, sans-serif',
      fontSize: 20,
      fontWeight: '700',
      fill: 0xf5c451,
      stroke: { color: 0x2a1a00, width: 3, join: 'round' },
    };
    const normalStyle: TextStyleOptions = {
      fontFamily: 'Noto Sans, system-ui, sans-serif',
      fontSize: 15,
      fontWeight: '700',
      fill: 0xf2eeff,
      stroke: { color: 0x1a1026, width: 2.5, join: 'round' },
    };
    for (let i = 0; i < MAX_TEXTS; i++) {
      const t = new Text({ text: '', style: normalStyle });
      t.anchor.set(0.5);
      t.visible = false;
      this.tObjs.push(t);
      this.tLayer.addChild(t);
      // 预留两种样式，切换时只改 style 而不新建对象
      void critStyle;
    }
    this.critStyle = critStyle;
    this.normalStyle = normalStyle;
  }

  private readonly critStyle: TextStyleOptions;
  private readonly normalStyle: TextStyleOptions;

  reset(): void {
    this.parts.clear();
    this.texts.clear();
    this.claws.clear();
    for (const s of this.pSprites) s.visible = false;
    for (const t of this.tObjs) t.visible = false;
    for (const s of this.cSprites) s.visible = false;
    this.hitCounter = 0;
  }

  // ——————————————— 生成 ———————————————

  /**
   * 命中粒子 + 飘字。
   * force=true 时跳过节流（远征内每次真实命中都显示）；仍受 MAX_TEXTS 同屏上限保护。
   */
  hit(x: number, y: number, damage: number, crit: boolean, force = false): void {
    // 节流：普通伤害隔几次才飘字，暴击始终显示
    this.hitCounter++;
    const show = force || crit || this.hitCounter % 4 === 0;
    if (show && this.texts.count < MAX_TEXTS) {
      const f = this.texts.spawn();
      if (f) {
        f.x = x + (Math.random() - 0.5) * 10;
        f.y = y - 8;
        f.vy = -52;
        f.life = f.maxLife = crit ? 0.85 : 0.62;
        f.value = Math.round(damage);
        f.crit = crit;
      }
    }
  }

  burst(x: number, y: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.parts.spawn();
      if (!p) return;
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * 190;
      p.x = p.px = x;
      p.y = p.py = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = p.maxLife = 0.22 + Math.random() * 0.3;
      p.size = 3 + Math.random() * 4;
      p.color = color;
      p.drag = 5.5;
    }
  }

  explosion(x: number, y: number, count: number, color: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.parts.spawn();
      if (!p) return;
      const a = Math.random() * TAU;
      const sp = 120 + Math.random() * 420;
      p.x = p.px = x;
      p.y = p.py = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = p.maxLife = 0.4 + Math.random() * 0.55;
      p.size = 5 + Math.random() * 7;
      p.color = color;
      p.drag = 3.2;
    }
  }

  /** 宠物单体爪击：在命中位置亮出醒目的「三条竖线」 */
  claw(x: number, y: number): void {
    const c = this.claws.spawn();
    if (!c) return;
    c.x = x + (Math.random() - 0.5) * 14;
    c.y = y + (Math.random() - 0.5) * 10;
    c.life = c.maxLife = 0.42;
    c.size = 1.25 + Math.random() * 0.4;
  }

  /** 调试：返回当前活跃爪击的世界坐标（验证特效层投影用） */
  debugClaws(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const cl = this.claws.items;
    for (let i = 0; i < this.claws.count; i++) out.push({ x: cl[i].x, y: cl[i].y });
    return out;
  }

  // ——————————————— 更新 ———————————————

  update(dt: number): void {
    const list = this.parts.items;
    for (let i = this.parts.count - 1; i >= 0; i--) {
      const p = list[i];
      p.px = p.x;
      p.py = p.y;
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.releaseAt(i);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    const cl = this.claws.items;
    for (let i = this.claws.count - 1; i >= 0; i--) {
      const c = cl[i];
      c.life -= dt;
      if (c.life <= 0) this.claws.releaseAt(i);
    }

    const tl = this.texts.items;
    for (let i = this.texts.count - 1; i >= 0; i--) {
      const f = tl[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.texts.releaseAt(i);
        continue;
      }
      f.y += f.vy * dt;
      f.vy += 92 * dt;
    }
  }

  /** 渲染同步：插值 + 池回收后的精灵隐藏 */
  render(alpha: number): void {
    const list = this.parts.items;
    for (let i = 0; i < this.parts.count; i++) {
      const p = list[i];
      const s = this.pSprites[i];
      s.visible = true;
      s.texture = atlas.get(Tex.Spark);
      s.tint = p.color;
      s.x = p.px + (p.x - p.px) * alpha;
      s.y = p.py + (p.y - p.py) * alpha;
      const t = p.life / p.maxLife;
      s.alpha = t;
      const sz = p.size * (0.4 + t * 0.6);
      s.width = sz * 3;
      s.height = sz * 3;
    }
    for (let i = this.parts.count; i < MAX_PARTICLES; i++) this.pSprites[i].visible = false;

    // 爪击三竖线：命中瞬间放大并快速收窄淡出
    const cl = this.claws.items;
    for (let i = 0; i < this.claws.count; i++) {
      const c = cl[i];
      const s = this.cSprites[i];
      const t = c.life / c.maxLife;
      s.visible = true;
      if (s.texture !== atlas.get(Tex.PetClaw)) s.texture = atlas.get(Tex.PetClaw);
      s.x = c.x;
      s.y = c.y;
      s.tint = 0xf2f7ff;
      s.alpha = Math.min(1, t * 3);
      const sc = (1.1 + t * 1.0) * c.size;
      s.scale.set(sc, sc);
    }
    for (let i = this.claws.count; i < MAX_CLAWS; i++) this.cSprites[i].visible = false;

    const tl = this.texts.items;
    for (let i = 0; i < this.texts.count; i++) {
      const f = tl[i];
      const t = this.tObjs[i];
      if (t.text !== String(f.value)) t.text = String(f.value);
      t.style = f.crit ? this.critStyle : this.normalStyle;
      t.visible = true;
      t.x = f.x;
      t.y = f.y;
      const k = f.life / f.maxLife;
      t.alpha = k > 0.6 ? 1 : k / 0.6;
      t.scale.set(f.crit ? 1 + (1 - k) * 0.25 : 1);
    }
    for (let i = this.texts.count; i < MAX_TEXTS; i++) this.tObjs[i].visible = false;
  }
}
