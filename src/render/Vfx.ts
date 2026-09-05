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
  /** 形状贴图（Tex.Spark / Tex.SparkStar 等，默认圆点） */
  tex: number;
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
  /** 渲染 tint 色（宠物主色） */
  color: number;
}

/** 扩散冲击环：短促放大淡出 */
interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  /** 目标尺寸（直径放大到多少） */
  size: number;
  color: number;
}

/** 横扫月牙弧：按攻击方向旋转、短暂放大淡出 */
interface Slash {
  x: number;
  y: number;
  angle: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
}

const MAX_PARTICLES = 700;
const MAX_TEXTS = 26;
const MAX_CLAWS = 18;
const MAX_RINGS = 28;
const MAX_SLASHES = 12;

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
    life: 0, maxLife: 1, size: 4, color: 0xffffff, tex: Tex.Spark, drag: 3,
  }));
  private readonly pSprites: Sprite[] = [];

  /** 冲击环独立池（避免挤占 700 粒子预算） */
  private readonly rings = new Pool<Ring>(MAX_RINGS, () => ({
    x: 0, y: 0, life: 0, maxLife: 1, size: 60, color: 0xffffff,
  }));
  private readonly ringSprites: Sprite[] = [];

  /** 横扫弧独立池 */
  private readonly slashes = new Pool<Slash>(MAX_SLASHES, () => ({
    x: 0, y: 0, angle: 0, life: 0, maxLife: 0.24, size: 1, color: 0xffffff,
  }));
  private readonly slashSprites: Sprite[] = [];

  private readonly texts = new Pool<FloatText>(MAX_TEXTS, () => ({
    x: 0, y: 0, vy: -46, life: 0, maxLife: 0.7, value: 0, crit: false,
  }));
  private readonly tObjs: Text[] = [];
  /** 每个飘字槽最近一次写入的文本/样式（内容不变不触发 Pixi Text 重建贴图） */
  private readonly lastVal: string[] = [];
  private readonly lastCrit: boolean[] = [];

  private readonly claws = new Pool<Claw>(MAX_CLAWS, () => ({
    x: 0, y: 0, life: 0, maxLife: 0.16, size: 1, color: 0xf2f7ff,
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
    for (let i = 0; i < MAX_RINGS; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.ringSprites.push(s);
      this.pLayer.addChild(s);
    }
    for (let i = 0; i < MAX_SLASHES; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.slashSprites.push(s);
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
      this.lastVal.push('');
      this.lastCrit.push(false);
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
    this.rings.clear();
    this.slashes.clear();
    for (const s of this.pSprites) s.visible = false;
    for (const t of this.tObjs) t.visible = false;
    for (const s of this.cSprites) s.visible = false;
    for (const s of this.ringSprites) s.visible = false;
    for (const s of this.slashSprites) s.visible = false;
    this.hitCounter = 0;
  }

  // ——————————————— 生成 ———————————————

  /**
   * 命中粒子 + 飘字。
   * 主局（无 force）：只显示暴击飘字，普通伤害不再飘字（避免满屏数字）。
   * force=true（远征）：保持每次真实命中都飘字。
   */
  hit(x: number, y: number, damage: number, crit: boolean, force = false): void {
    // 仅暴击（主局）或强制显示（远征）时生成飘字
    const show = force || crit;
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

  burst(x: number, y: number, count: number, color: number, tex = Tex.Spark): void {
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
      p.tex = tex;
      p.drag = 5.5;
    }
  }

  explosion(x: number, y: number, count: number, color: number, tex = Tex.Spark): void {
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
      p.tex = tex;
      p.drag = 3.2;
    }
  }

  /** 冲击环：短促扩散放大淡出（命中/死亡/宠物撞击通用） */
  ring(x: number, y: number, color: number, size = 64): void {
    const r = this.rings.spawn();
    if (!r) return;
    r.x = x;
    r.y = y;
    r.life = r.maxLife = 0.3 + Math.random() * 0.12;
    r.size = size;
    r.color = color;
  }

  /** 横扫月牙弧：绕 x,y 旋转 angle（弧度，0=朝右）短暂放大淡出；size 为体型基准（>1 更大） */
  slash(x: number, y: number, angle: number, color: number, size = 1): void {
    const s = this.slashes.spawn();
    if (!s) return;
    s.x = x;
    s.y = y;
    s.angle = angle;
    s.life = s.maxLife = 0.22;
    s.size = size * (0.9 + Math.random() * 0.25);
    s.color = color;
  }

  /** 宠物单体爪击：在命中位置亮出醒目的「三条竖线」（可按宠物主色染色） */
  claw(x: number, y: number, color = 0xf2f7ff): void {
    const c = this.claws.spawn();
    if (!c) return;
    c.x = x + (Math.random() - 0.5) * 14;
    c.y = y + (Math.random() - 0.5) * 10;
    c.life = c.maxLife = 0.42;
    c.size = 1.25 + Math.random() * 0.4;
    c.color = color;
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

    const rg = this.rings.items;
    for (let i = this.rings.count - 1; i >= 0; i--) {
      const r = rg[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.releaseAt(i);
    }

    const sl = this.slashes.items;
    for (let i = this.slashes.count - 1; i >= 0; i--) {
      const s = sl[i];
      s.life -= dt;
      if (s.life <= 0) this.slashes.releaseAt(i);
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
      const tex = atlas.get(p.tex);
      if (s.texture !== tex) s.texture = tex;
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

    // 爪击三竖线：命中瞬间放大并快速收窄淡出（按宠物主色染色）
    const cl = this.claws.items;
    for (let i = 0; i < this.claws.count; i++) {
      const c = cl[i];
      const s = this.cSprites[i];
      const t = c.life / c.maxLife;
      s.visible = true;
      if (s.texture !== atlas.get(Tex.PetClaw)) s.texture = atlas.get(Tex.PetClaw);
      s.x = c.x;
      s.y = c.y;
      s.tint = c.color;
      s.alpha = Math.min(1, t * 3);
      const sc = (1.1 + t * 1.0) * c.size;
      s.scale.set(sc, sc);
    }
    for (let i = this.claws.count; i < MAX_CLAWS; i++) this.cSprites[i].visible = false;

    // 冲击环：快速扩散放大 + 淡出
    const rg = this.rings.items;
    for (let i = 0; i < this.rings.count; i++) {
      const r = rg[i];
      const s = this.ringSprites[i];
      const t = r.life / r.maxLife;
      s.visible = true;
      if (s.texture !== atlas.get(Tex.HitRing)) s.texture = atlas.get(Tex.HitRing);
      s.x = r.x;
      s.y = r.y;
      s.tint = r.color;
      s.alpha = Math.min(1, t * 2.2);
      const sz = r.size * (0.4 + (1 - t) * 0.75);
      s.width = sz;
      s.height = sz;
    }
    for (let i = this.rings.count; i < MAX_RINGS; i++) this.ringSprites[i].visible = false;

    // 横扫弧：按攻击方向旋转、短暂放大淡出
    const sl = this.slashes.items;
    for (let i = 0; i < this.slashes.count; i++) {
      const sk = sl[i];
      const s = this.slashSprites[i];
      const t = sk.life / sk.maxLife;
      s.visible = true;
      if (s.texture !== atlas.get(Tex.PetSlash)) s.texture = atlas.get(Tex.PetSlash);
      s.x = sk.x;
      s.y = sk.y;
      s.rotation = sk.angle;
      s.tint = sk.color;
      s.alpha = Math.min(1, t * 2.5);
      const sc = (0.9 + (1 - t) * 0.7) * sk.size;
      s.scale.set(sc, sc);
    }
    for (let i = this.slashes.count; i < MAX_SLASHES; i++) this.slashSprites[i].visible = false;

    const tl = this.texts.items;
    for (let i = 0; i < this.texts.count; i++) {
      const f = tl[i];
      const t = this.tObjs[i];
      // 仅当内容/暴击样式变化时才写入，避免每个生效槽每帧重建文字贴图
      const crit = f.crit;
      if (crit !== this.lastCrit[i]) {
        t.style = crit ? this.critStyle : this.normalStyle;
        this.lastCrit[i] = crit;
      }
      const val = String(f.value);
      if (val !== this.lastVal[i]) {
        t.text = val;
        this.lastVal[i] = val;
      }
      t.visible = true;
      t.x = f.x;
      t.y = f.y;
      const k = f.life / f.maxLife;
      t.alpha = k > 0.6 ? 1 : k / 0.6;
      t.scale.set(crit ? 1 + (1 - k) * 0.25 : 1);
    }
    for (let i = this.texts.count; i < MAX_TEXTS; i++) this.tObjs[i].visible = false;
  }
}
