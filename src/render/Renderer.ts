import {
  Container,
  Graphics,
  Sprite,
  Texture,
  TilingSprite,
  type Renderer as PixiRenderer,
} from 'pixi.js';
import { MAX_ENEMIES, MAX_PICKUPS, MAX_PROJ, type World } from '../ecs/World';
import { Behavior, PickupKind } from '../ecs/Components';
import { Camera } from './Camera';
import { atlas } from './Textures';
import { Tex } from './TexKeys';
import { Rng } from '../core/Rng';

/** 剔除边距：略大于视口，避免精灵在边缘突然弹出 */
const CULL_PAD = 72;

function makeFloorTexture(renderer: PixiRenderer): Texture {
  const g = new Graphics();
  const rng = new Rng(20240917);
  g.rect(0, 0, 128, 128).fill(0x120d20);
  // 石缝
  g.moveTo(0, 0).lineTo(128, 0).stroke({ width: 2, color: 0x0a0713, alpha: 0.9 });
  g.moveTo(0, 0).lineTo(0, 128).stroke({ width: 2, color: 0x0a0713, alpha: 0.9 });
  // 石板高光
  g.rect(3, 3, 122, 6).fill({ color: 0x1e1636, alpha: 0.55 });
  g.rect(3, 3, 6, 122).fill({ color: 0x1e1636, alpha: 0.35 });
  // 随机裂纹与苔痕
  for (let i = 0; i < 5; i++) {
    const x = rng.range(10, 118);
    const y = rng.range(10, 118);
    g.circle(x, y, rng.range(4, 13)).fill({ color: 0x1a1330, alpha: 0.5 });
  }
  for (let i = 0; i < 3; i++) {
    let x = rng.range(12, 116);
    let y = rng.range(12, 116);
    g.moveTo(x, y);
    for (let k = 0; k < 3; k++) {
      x += rng.range(-18, 18);
      y += rng.range(-18, 18);
      g.lineTo(x, y);
    }
    g.stroke({ width: 1.2, color: 0x0a0713, alpha: 0.7 });
  }
  const tex = renderer.generateTexture(g);
  g.destroy();
  return tex;
}

function makeVignetteTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(128, 128, 48, 128, 128, 132);
    g.addColorStop(0, 'rgba(10,7,19,0)');
    g.addColorStop(0.62, 'rgba(10,7,19,0.28)');
    g.addColorStop(1, 'rgba(10,7,19,0.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }
  return Texture.from(c);
}

/**
 * 世界渲染：地板平铺 + 实体精灵池 + 视口剔除 + 渲染插值。
 *
 * 剔除策略：所有精灵一次性预创建并挂在容器上，屏外实体只置 `visible = false`。
 * 相比频繁 addChild/removeChild，这样不会有场景图结构变化带来的额外开销，
 * 而 PixiJS 会跳过不可见对象（不产生 draw call）。
 */
export class WorldRenderer {
  readonly root = new Container();
  private readonly bg = new Container();
  private readonly world = new Container();
  private readonly fg = new Container();

  private floor: TilingSprite | null = null;
  private vignette: Sprite | null = null;

  private readonly enemySprites: Sprite[] = [];
  private readonly projSprites: Sprite[] = [];
  private readonly pickSprites: Sprite[] = [];
  private readonly playerSprite = new Sprite();
  private readonly arenaRing = new Graphics();

  /** Boss 施法蓄力警示环（跟随正在蓄力的 Boss） */
  private readonly warnLayer = new Container();
  private readonly warnSprites: Sprite[] = [];

  private enemyLayer = new Container();
  private pickLayer = new Container();
  private projLayer = new Container();

  /** 上一帧可见实体数（性能面板） */
  visibleCount = 0;

  /** 视野缩放因子：>1 放大（看得更近、更细），<1 缩小（视野更开阔） */
  zoom = 1;
  /** 缩放下限（桌面 0.5；手机端可放宽到 0.3）。地板为贴屏无限平铺，任意下限都不会露边 */
  zoomMin = 0.5;
  /** 缩放上限 */
  zoomMax = 1.5;
  private viewW = 0;
  private viewH = 0;

  init(renderer: PixiRenderer): void {
    this.world.addChild(this.arenaRing);
    this.world.addChild(this.pickLayer);
    this.world.addChild(this.enemyLayer);
    this.world.addChild(this.warnLayer);
    this.world.addChild(this.projLayer);
    this.world.addChild(this.playerSprite);
    this.root.addChild(this.bg);
    this.root.addChild(this.world);
    this.root.addChild(this.fg);

    const floorTex = makeFloorTexture(renderer);
    this.floor = new TilingSprite({ texture: floorTex, width: 1024, height: 768 });
    this.bg.addChild(this.floor);

    this.vignette = new Sprite(makeVignetteTexture());
    this.fg.addChild(this.vignette);

    for (let i = 0; i < MAX_ENEMIES; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.enemySprites.push(s);
      this.enemyLayer.addChild(s);
    }
    for (let i = 0; i < MAX_PROJ; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.projSprites.push(s);
      this.projLayer.addChild(s);
    }
    for (let i = 0; i < MAX_PICKUPS; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      this.pickSprites.push(s);
      this.pickLayer.addChild(s);
    }
    // Boss 蓄力警示环（同屏最多一个 Boss，备 3 个保险）
    for (let i = 0; i < 3; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.visible = false;
      s.texture = atlas.get(Tex.Ring);
      this.warnSprites.push(s);
      this.warnLayer.addChild(s);
    }
    this.playerSprite.anchor.set(0.5);
    this.playerSprite.texture = atlas.get(Tex.Player);
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    if (this.floor) {
      this.floor.width = w;
      this.floor.height = h;
    }
    if (this.vignette) {
      this.vignette.width = w;
      this.vignette.height = h;
    }
  }

  /** 设定视野缩放（[zoomMin, zoomMax]）。实际投影在 sync() 中按 cam 应用。 */
  setZoom(z: number): void {
    this.zoom = z < this.zoomMin ? this.zoomMin : z > this.zoomMax ? this.zoomMax : z;
  }

  /** 每渲染帧调用：alpha 为固定步长的插值系数 */
  sync(world: World, alpha: number, cam: Camera, viewW: number, viewH: number): void {
    const cx = cam.viewX;
    const cy = cam.viewY;
    const z = this.zoom;
    // 视野缩放：世界半宽随 zoom 变化（zoom>1 放大时看得更近更少）
    const halfW = (viewW * 0.5) / z + CULL_PAD;
    const halfH = (viewH * 0.5) / z + CULL_PAD;

    // 实体层：世界点 w 投影到屏 = viewW/2 + (w - cam) * zoom
    this.world.scale.set(z, z);
    this.world.position.set(viewW * 0.5 - cx * z, viewH * 0.5 - cy * z);

    if (this.floor) {
      // 地板平铺周期与相位也按 zoom 缩放，使砖块随实体一起放大/缩小
      this.floor.tileScale.set(z, z);
      this.floor.tilePosition.set(-cx * z + viewW * 0.5, -cy * z + viewH * 0.5);
    }

    let visible = 0;

    // ——— 敌人 ———
    const elist = world.enemies.items;
    for (let i = 0; i < world.enemies.count; i++) {
      const e = elist[i];
      const s = this.enemySprites[i];
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      if (x < cx - halfW || x > cx + halfW || y < cy - halfH || y > cy + halfH) {
        s.visible = false;
        continue;
      }
      visible++;
      s.visible = true;
      s.texture = atlas.get(e.spriteKey);
      s.x = x;
      s.y = y;
      const size = e.radius * 3;
      s.width = size;
      s.height = size;
      if (e.flash > 0) {
        s.tint = 0xffffff;
        s.alpha = 1;
        s.rotation = 0;
      } else if (e.slowT > 0) {
        s.tint = 0x9fd8ff;
        s.alpha = 0.92;
      } else if (e.isElite) {
        s.tint = 0xffd9a0;
        s.alpha = 0.98;
      } else {
        s.tint = 0xffffff;
        s.alpha = 0.94;
      }
    }
    for (let i = world.enemies.count; i < MAX_ENEMIES; i++) this.enemySprites[i].visible = false;

    // ——— Boss 蓄力警示环（cast>0 时在施法/落点处脉动提示）———
    {
      let wi = 0;
      const puls = 0.7 + 0.3 * Math.sin(world.time * 18);
      for (let i = 0; i < world.enemies.count; i++) {
        const eb = elist[i];
        if (!eb.isBoss || eb.cast <= 0 || wi >= this.warnSprites.length) continue;
        // 本体的施法警示环
        const w1 = this.warnSprites[wi++];
        w1.visible = true;
        w1.x = eb.x;
        w1.y = eb.y;
        const base = eb.radius * 2.6;
        const size = base * puls;
        w1.width = size;
        w1.height = size;
        w1.alpha = 0.45 + 0.4 * Math.abs(Math.sin(world.time * 14));
        w1.tint = 0xff5470;
        // 若有远离本体的锁定落点（如脚下伤害区 / 落点圈），在落点也放一个
        const dx = eb.tx - eb.x;
        const dy = eb.ty - eb.y;
        if (dx * dx + dy * dy > 3600 && wi < this.warnSprites.length) {
          const w2 = this.warnSprites[wi++];
          w2.visible = true;
          w2.x = eb.tx;
          w2.y = eb.ty;
          w2.width = 70 * puls;
          w2.height = 70 * puls;
          w2.alpha = 0.5 + 0.4 * Math.abs(Math.sin(world.time * 16 + 1));
          w2.tint = 0x43e0ff;
        }
        visible++;
      }
      for (; wi < this.warnSprites.length; wi++) this.warnSprites[wi].visible = false;
    }

    // ——— 拾取物 ———
    const klist = world.pickups.items;
    for (let i = 0; i < world.pickups.count; i++) {
      const k = klist[i];
      const s = this.pickSprites[i];
      const x = k.px + (k.x - k.px) * alpha;
      const y = k.py + (k.y - k.py) * alpha;
      if (x < cx - halfW || x > cx + halfW || y < cy - halfH || y > cy + halfH) {
        s.visible = false;
        continue;
      }
      visible++;
      s.visible = true;
      s.texture = atlas.get(
        k.kind === PickupKind.Chest
          ? Tex.Chest
          : k.kind === PickupKind.Heal
            ? Tex.Heart
            : k.kind === PickupKind.Magnet
              ? Tex.Magnet
              : k.value > 6
                ? Tex.GemXpBig
                : Tex.GemXp,
      );
      s.x = x;
      s.y = y + Math.sin(k.bob) * 3;
      // 经验宝石整体缩小一半（宝箱/心等保持原尺寸），减少满屏拾取物的视觉遮挡
      const size = k.radius * (k.kind === PickupKind.Xp ? 1.6 : 3.2);
      s.width = size;
      s.height = size;
      s.tint = 0xffffff;
      s.rotation = 0;
      s.alpha = k.life < 3 ? 0.4 + 0.6 * Math.abs(Math.sin(k.life * 9)) : 1;
    }
    for (let i = world.pickups.count; i < MAX_PICKUPS; i++) this.pickSprites[i].visible = false;

    // ——— 投射物 ———
    const plist = world.projs.items;
    for (let i = 0; i < world.projs.count; i++) {
      const p = plist[i];
      const s = this.projSprites[i];
      const x = p.px + (p.x - p.px) * alpha;
      const y = p.py + (p.y - p.py) * alpha;

      if (p.behavior === Behavior.Beam) {
        if (Math.abs(x - cx) > halfW + p.length || Math.abs(y - cy) > halfH + p.length) {
          s.visible = false;
          continue;
        }
      } else if (
        x < cx - halfW ||
        x > cx + halfW ||
        y < cy - halfH ||
        y > cy + halfH
      ) {
        s.visible = false;
        continue;
      }
      visible++;
      s.visible = true;
      s.texture = atlas.get(p.spriteKey);
      s.x = x;
      s.y = y;
      s.tint = p.hostile ? 0xff9aa8 : 0xffffff;

      switch (p.behavior) {
        case Behavior.Beam: {
          s.rotation = p.angle + Math.PI / 2;
          s.width = p.width;
          s.height = p.length;
          s.alpha = 0.55 + 0.45 * (p.life / p.maxLife);
          break;
        }
        case Behavior.Aoe: {
          const sz = p.radius * 2;
          s.width = sz;
          s.height = sz;
          s.rotation = 0;
          s.alpha = 0.85 * (p.life / p.maxLife);
          break;
        }
        case Behavior.Field: {
          const sz = p.radius * 2;
          s.width = sz;
          s.height = sz;
          s.rotation = p.rot;
          s.alpha = p.hostile ? 0.42 : 0.5;
          break;
        }
        case Behavior.Mark: {
          const t = 1 - p.life / p.maxLife;
          const sz = 30 + t * p.r1 * 0.7;
          s.width = sz;
          s.height = sz;
          s.rotation = p.rot;
          s.alpha = 0.5 + 0.5 * Math.abs(Math.sin(p.life * 22));
          break;
        }
        case Behavior.Telegraph: {
          const t = 1 - p.life / p.maxLife;
          const sz = p.radius * 2;
          s.width = sz;
          s.height = sz;
          s.rotation = 0;
          s.alpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 18));
          break;
        }
        default: {
          const sz = p.radius * 3.4 * p.scale;
          s.width = sz;
          s.height = sz;
          s.rotation = p.rot;
          s.alpha = 0.95;
          break;
        }
      }
    }
    for (let i = world.projs.count; i < MAX_PROJ; i++) this.projSprites[i].visible = false;

    // ——— 玩家 ———
    const p = world.player;
    const px = p.px + (p.x - p.px) * alpha;
    const py = p.py + (p.y - p.py) * alpha;
    this.playerSprite.x = px;
    this.playerSprite.y = py;
    this.playerSprite.width = p.radius * 3.4;
    this.playerSprite.height = p.radius * 3.4;
    this.playerSprite.scale.x = Math.abs(this.playerSprite.scale.x) * (p.face < 0 ? -1 : 1);
    // 无敌帧闪烁
    this.playerSprite.alpha = p.iframe > 0 ? 0.35 + 0.65 * Math.abs(Math.sin(p.iframe * 26)) : 1;
    visible++;

    // ——— 终焉收缩边界 ———
    this.arenaRing.clear();
    if (world.arenaR > 0) {
      this.arenaRing.circle(p.x, p.y, world.arenaR).stroke({
        width: 6,
        color: 0xf5c451,
        alpha: 0.75,
      });
      this.arenaRing.circle(p.x, p.y, world.arenaR).fill({ color: 0xff5470, alpha: 0.05 });
    }

    this.visibleCount = visible;
  }
}
