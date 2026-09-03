import { Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { TEX_SIZE, Tex } from './TexKeys';

/**
 * 程序化图集：用 Graphics 画出全部精灵，一次性烘焙成单张 RenderTexture 并按需切分。
 * 好处是——单 BaseTexture ⇒ 所有精灵可合批；且完全不依赖外部素材文件。
 */

const C = {
  void: 0x0a0713,
  deep: 0x150f26,
  stone: 0x1e1636,
  arcane: 0x7c5cff,
  soul: 0x43e0ff,
  amber: 0xf5c451,
  bright: 0xf2eeff,
  mid: 0xa79ec9,
  dim: 0x6b6189,
  good: 0x4ade80,
  bad: 0xff5470,
  warn: 0xffb020,
} as const;

type G = Graphics;

/** 三层同心圆模拟外发光 */
function glow(g: G, x: number, y: number, r: number, color: number, a = 1): void {
  g.circle(x, y, r).fill({ color, alpha: 0.16 * a });
  g.circle(x, y, r * 0.74).fill({ color, alpha: 0.3 * a });
  g.circle(x, y, r * 0.46).fill({ color, alpha: 0.85 * a });
}

function eyes(g: G, x: number, y: number, d: number, r: number, color: number = C.void): void {
  g.circle(x - d, y, r).fill(color);
  g.circle(x + d, y, r).fill(color);
}

/** 单个纹理的绘制（坐标系固定为 0..64，烘焙时统一缩放） */
export function drawTex(g: G, key: number): void {
  g.clear();
  switch (key) {
    // ——————————————— 角色与敌人 ———————————————
    case Tex.Player: {
      // 兜帽斗篷
      g.poly([32, 6, 50, 30, 54, 58, 10, 58, 14, 30]).fill({ color: C.deep, alpha: 0.96 });
      g.poly([32, 6, 50, 30, 54, 58, 10, 58, 14, 30]).stroke({ width: 2, color: C.arcane, alpha: 0.85 });
      // 兜帽内的阴影与发光眼
      g.ellipse(32, 26, 15, 13).fill({ color: C.void, alpha: 0.95 });
      eyes(g, 32, 26, 6, 2.6, C.soul);
      g.circle(27, 26, 1.1).fill({ color: 0xffffff, alpha: 0.9 });
      // 斗篷下摆
      g.poly([10, 58, 32, 50, 54, 58, 32, 62]).fill({ color: C.stone, alpha: 0.9 });
      break;
    }
    case Tex.Wraith: {
      // 飘带状幽灵
      g.poly([32, 8, 50, 24, 52, 50, 44, 58, 38, 50, 32, 58, 26, 50, 20, 58, 12, 50, 14, 24]).fill({
        color: C.soul,
        alpha: 0.42,
      });
      g.poly([32, 8, 50, 24, 52, 50, 44, 58, 38, 50, 32, 58, 26, 50, 20, 58, 12, 50, 14, 24]).stroke({
        width: 2,
        color: C.soul,
        alpha: 0.95,
      });
      g.ellipse(32, 26, 13, 15).fill({ color: 0xdff8ff, alpha: 0.5 });
      eyes(g, 32, 26, 5.5, 3, C.void);
      break;
    }
    case Tex.Swarmling: {
      g.ellipse(32, 36, 13, 15).fill({ color: 0x7a2338, alpha: 0.95 });
      g.ellipse(32, 36, 13, 15).stroke({ width: 1.6, color: C.bad, alpha: 0.8 });
      g.circle(32, 20, 7).fill({ color: 0x9c2c46, alpha: 1 });
      // 触角
      g.moveTo(28, 15).lineTo(23, 6).stroke({ width: 1.6, color: C.bad, alpha: 0.85 });
      g.moveTo(36, 15).lineTo(41, 6).stroke({ width: 1.6, color: C.bad, alpha: 0.85 });
      eyes(g, 32, 19, 3, 1.8, 0xffd9a0);
      // 腿
      for (let i = -1; i <= 1; i++) {
        g.moveTo(32 + i * 8, 46).lineTo(32 + i * 13, 58).stroke({ width: 1.6, color: C.bad, alpha: 0.6 });
      }
      break;
    }
    case Tex.Slime: {
      g.ellipse(32, 44, 22, 15).fill({ color: C.good, alpha: 0.5 });
      g.moveTo(10, 44).quadraticCurveTo(32, 4, 54, 44).fill({ color: C.good, alpha: 0.68 });
      g.moveTo(10, 44).quadraticCurveTo(32, 4, 54, 44).stroke({ width: 2, color: 0x9dfbc4, alpha: 0.85 });
      eyes(g, 32, 36, 6, 3.2, C.void);
      g.ellipse(24, 28, 5, 3.4).fill({ color: 0xffffff, alpha: 0.35 });
      break;
    }
    case Tex.Phantom: {
      g.poly([32, 6, 56, 32, 32, 58, 8, 32]).fill({ color: C.arcane, alpha: 0.55 });
      g.poly([32, 6, 56, 32, 32, 58, 8, 32]).stroke({ width: 2.2, color: 0xc4aaff, alpha: 0.95 });
      // 残影
      g.poly([32, 16, 46, 32, 32, 48, 18, 32]).stroke({ width: 1.4, color: 0xe0d4ff, alpha: 0.5 });
      eyes(g, 32, 32, 5, 2.4, 0xf6efff);
      break;
    }
    case Tex.Grub: {
      // 螺旋体节
      for (let i = 6; i >= 0; i--) {
        const r = 6 + i * 2.6;
        g.circle(32, 34, r).fill({ color: i % 2 ? 0xc78a4a : 0x8a5c2e, alpha: 0.92 });
      }
      g.circle(32, 34, 6).stroke({ width: 2, color: C.warn, alpha: 0.9 });
      g.circle(32, 34, 22).stroke({ width: 1.4, color: C.warn, alpha: 0.35 });
      eyes(g, 32, 32, 3, 1.8, 0x2a1806);
      break;
    }
    case Tex.Splinter: {
      // 多角分裂体
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = 32 + Math.cos(a) * 24;
        const y = 32 + Math.sin(a) * 24;
        g.poly([32, 32, x, y - 5, x + 5, y + 5]).fill({ color: 0xff7a3d, alpha: 0.85 });
      }
      g.circle(32, 32, 12).fill({ color: 0xffb020, alpha: 0.95 });
      g.circle(32, 32, 12).stroke({ width: 2, color: 0xffd9a0, alpha: 0.9 });
      g.moveTo(20, 32).lineTo(44, 32).stroke({ width: 2, color: C.void, alpha: 0.7 });
      break;
    }
    case Tex.Carapace: {
      // 六边形甲壳
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        pts.push(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26);
      }
      g.poly(pts).fill({ color: 0x55677f, alpha: 0.96 });
      g.poly(pts).stroke({ width: 2.4, color: 0xa9c4e0, alpha: 0.85 });
      // 护盾纹
      g.circle(32, 32, 15).stroke({ width: 1.6, color: 0xcfe4ff, alpha: 0.5 });
      g.circle(32, 32, 8).stroke({ width: 1.4, color: 0xcfe4ff, alpha: 0.35 });
      eyes(g, 32, 28, 6, 2.6, 0xdff0ff);
      break;
    }
    case Tex.Trickster: {
      // 尖角面具
      g.poly([32, 8, 20, 20, 8, 14, 14, 30, 32, 58, 50, 30, 56, 14, 44, 20]).fill({
        color: 0xc65cff,
        alpha: 0.9,
      });
      g.poly([32, 8, 20, 20, 8, 14, 14, 30, 32, 58, 50, 30, 56, 14, 44, 20]).stroke({
        width: 2,
        color: 0xefd4ff,
        alpha: 0.9,
      });
      eyes(g, 32, 30, 8, 3.4, 0x1a0a2e);
      // 笑口
      g.moveTo(22, 42).quadraticCurveTo(32, 50, 42, 42).stroke({ width: 2, color: 0x1a0a2e, alpha: 0.9 });
      break;
    }

    // ——————————————— Boss ———————————————
    case Tex.BossHerald: {
      glow(g, 32, 32, 30, C.arcane, 0.5);
      g.circle(32, 32, 24).fill({ color: 0x2a1a4d, alpha: 0.96 });
      g.circle(32, 32, 24).stroke({ width: 2.6, color: C.amber, alpha: 0.8 });
      // 多眼
      eyes(g, 32, 28, 9, 4, C.amber);
      g.circle(32, 40, 3.5).fill(C.amber);
      // 触须
      for (let i = -2; i <= 2; i++) {
        const a = Math.PI / 2 + i * 0.42;
        g.moveTo(32, 32)
          .quadraticCurveTo(
            32 + Math.cos(a) * 30,
            32 + Math.sin(a) * 30,
            32 + Math.cos(a) * 34 + i * 6,
            32 + Math.sin(a) * 34,
          )
          .stroke({ width: 2.4, color: C.arcane, alpha: 0.75 });
      }
      break;
    }
    case Tex.BossCalamity: {
      const pts: number[] = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = i % 2 ? 18 : 28;
        pts.push(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      g.poly(pts).fill({ color: 0x4a1220, alpha: 0.96 });
      g.poly(pts).stroke({ width: 2.6, color: C.bad, alpha: 0.92 });
      // 裂纹
      g.moveTo(32, 8).lineTo(26, 26).lineTo(36, 34).lineTo(28, 54).stroke({
        width: 2,
        color: C.warn,
        alpha: 0.85,
      });
      glow(g, 32, 32, 10, C.bad, 0.9);
      break;
    }
    case Tex.BossEndless: {
      g.circle(32, 32, 30).fill({ color: 0x05030a, alpha: 0.98 });
      g.circle(32, 32, 30).stroke({ width: 2, color: C.amber, alpha: 0.55 });
      g.circle(32, 32, 22).stroke({ width: 3, color: C.amber, alpha: 0.9 });
      g.circle(32, 32, 13).fill({ color: 0x000000, alpha: 1 });
      // 时之刻度
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.moveTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22)
          .lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28)
          .stroke({ width: 1.8, color: C.amber, alpha: 0.75 });
      }
      break;
    }

    // ——————————————— 投射物 ———————————————
    case Tex.OrbHalo: {
      glow(g, 32, 32, 22, C.amber, 1);
      g.circle(32, 32, 9).fill({ color: 0xfff2cc, alpha: 1 });
      break;
    }
    case Tex.OrbSeeker: {
      glow(g, 32, 32, 20, C.soul, 0.85);
      g.poly([32, 12, 50, 32, 32, 52, 14, 32]).fill({ color: 0xdff8ff, alpha: 0.95 });
      g.poly([32, 12, 50, 32, 32, 52, 14, 32]).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      break;
    }
    case Tex.Shard: {
      g.poly([32, 8, 46, 40, 32, 56, 18, 40]).fill({ color: 0xd6f4ff, alpha: 0.95 });
      g.poly([32, 8, 46, 40, 32, 56, 18, 40]).stroke({ width: 1.6, color: 0xffffff, alpha: 0.85 });
      g.circle(32, 34, 5).fill({ color: 0xffffff, alpha: 0.9 });
      break;
    }
    case Tex.Wave: {
      g.circle(32, 32, 28).stroke({ width: 5, color: C.soul, alpha: 0.75 });
      g.circle(32, 32, 20).stroke({ width: 3, color: 0xbdf1ff, alpha: 0.55 });
      g.circle(32, 32, 12).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
      break;
    }
    case Tex.Beam: {
      g.rect(24, 2, 16, 60).fill({ color: C.soul, alpha: 0.32 });
      g.rect(28, 2, 8, 60).fill({ color: 0xdff8ff, alpha: 0.85 });
      g.rect(31, 2, 2, 60).fill({ color: 0xffffff, alpha: 1 });
      break;
    }
    case Tex.Frost: {
      g.circle(32, 32, 28).fill({ color: 0x8fd8ff, alpha: 0.14 });
      g.circle(32, 32, 28).stroke({ width: 2, color: 0xa8e6ff, alpha: 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(32, 32)
          .lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24)
          .stroke({ width: 3, color: 0xdff4ff, alpha: 0.9 });
        g.moveTo(32 + Math.cos(a) * 16, 32 + Math.sin(a) * 16)
          .lineTo(32 + Math.cos(a + 0.6) * 22, 32 + Math.sin(a + 0.6) * 22)
          .stroke({ width: 2, color: 0xdff4ff, alpha: 0.7 });
      }
      break;
    }
    case Tex.Rift: {
      glow(g, 32, 32, 24, C.arcane, 0.6);
      g.moveTo(14, 12)
        .lineTo(26, 30)
        .lineTo(18, 40)
        .lineTo(32, 58)
        .lineTo(46, 40)
        .lineTo(38, 30)
        .lineTo(50, 12)
        .stroke({ width: 3, color: C.arcane, alpha: 0.95 });
      g.circle(32, 32, 6).fill({ color: 0xe0d4ff, alpha: 0.9 });
      break;
    }

    // ——————————————— 拾取物 ———————————————
    case Tex.GemXp: {
      glow(g, 32, 32, 20, C.soul, 0.55);
      g.poly([32, 14, 46, 32, 32, 50, 18, 32]).fill({ color: 0x8fe6ff, alpha: 0.95 });
      g.poly([32, 14, 46, 32, 32, 50, 18, 32]).stroke({ width: 1.6, color: 0xffffff, alpha: 0.7 });
      break;
    }
    case Tex.GemXpBig: {
      glow(g, 32, 32, 26, C.amber, 0.6);
      g.poly([32, 10, 48, 32, 32, 54, 16, 32]).fill({ color: 0xffd97a, alpha: 0.95 });
      g.poly([32, 10, 48, 32, 32, 54, 16, 32]).stroke({ width: 2, color: 0xfff6dd, alpha: 0.9 });
      break;
    }
    case Tex.Chest: {
      g.roundRect(12, 22, 40, 30, 4).fill({ color: 0x6b4423, alpha: 0.98 });
      g.roundRect(12, 22, 40, 30, 4).stroke({ width: 2, color: C.amber, alpha: 0.9 });
      g.roundRect(12, 14, 40, 12, 4).fill({ color: 0x8a5a2e, alpha: 1 });
      g.rect(28, 26, 8, 10).fill({ color: C.amber, alpha: 1 });
      g.circle(32, 34, 3).fill(C.void);
      break;
    }
    case Tex.Heart: {
      g.circle(24, 24, 13).fill(C.bad);
      g.circle(40, 24, 13).fill(C.bad);
      g.poly([10, 28, 32, 54, 54, 28]).fill(C.bad);
      g.circle(20, 20, 4).fill({ color: 0xffffff, alpha: 0.55 });
      break;
    }
    case Tex.Magnet: {
      g.moveTo(14, 44).lineTo(14, 26).quadraticCurveTo(32, 4, 50, 26).lineTo(50, 44).stroke({
        width: 10,
        color: C.bad,
        alpha: 0.95,
      });
      g.moveTo(14, 44).lineTo(14, 32).stroke({ width: 10, color: 0xdff4ff, alpha: 0.9 });
      g.moveTo(50, 44).lineTo(50, 32).stroke({ width: 10, color: 0xdff4ff, alpha: 0.9 });
      break;
    }

    // ——————————————— 特效 ———————————————
    case Tex.Spark: {
      glow(g, 32, 32, 26, 0xffffff, 0.9);
      break;
    }
    case Tex.Dust: {
      g.circle(32, 32, 8).fill({ color: C.mid, alpha: 0.22 });
      break;
    }
    case Tex.Ring: {
      g.circle(32, 32, 28).stroke({ width: 4, color: C.bad, alpha: 0.9 });
      g.circle(32, 32, 28).fill({ color: C.bad, alpha: 0.1 });
      break;
    }

    // ——————————————— 武器图标 ———————————————
    case Tex.IconRift: {
      glow(g, 32, 32, 28, C.arcane, 0.45);
      g.moveTo(12, 10)
        .lineTo(24, 30)
        .lineTo(16, 42)
        .lineTo(32, 56)
        .lineTo(48, 42)
        .lineTo(40, 30)
        .lineTo(52, 10)
        .stroke({ width: 4, color: C.arcane, alpha: 1 });
      break;
    }
    case Tex.IconHalo: {
      g.circle(32, 32, 24).stroke({ width: 5, color: C.amber, alpha: 0.95 });
      g.circle(32, 32, 9).fill({ color: 0xffecb8, alpha: 1 });
      g.circle(32, 8, 5).fill({ color: C.amber, alpha: 1 });
      g.circle(32, 56, 5).fill({ color: C.amber, alpha: 1 });
      break;
    }
    case Tex.IconSeeker: {
      g.circle(32, 32, 22).stroke({ width: 3, color: C.soul, alpha: 0.9 });
      g.circle(32, 32, 7).fill({ color: 0xdff8ff, alpha: 1 });
      g.moveTo(32, 4).lineTo(32, 16).stroke({ width: 3, color: C.soul, alpha: 1 });
      g.moveTo(32, 48).lineTo(32, 60).stroke({ width: 3, color: C.soul, alpha: 1 });
      g.moveTo(4, 32).lineTo(16, 32).stroke({ width: 3, color: C.soul, alpha: 1 });
      g.moveTo(48, 32).lineTo(60, 32).stroke({ width: 3, color: C.soul, alpha: 1 });
      break;
    }
    case Tex.IconShock: {
      for (let i = 0; i < 3; i++) {
        g.circle(32, 32, 10 + i * 9).stroke({ width: 3, color: C.soul, alpha: 1 - i * 0.26 });
      }
      g.circle(32, 32, 6).fill({ color: 0xffffff, alpha: 0.95 });
      break;
    }
    case Tex.IconShard: {
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.6;
        const x = 32 + Math.cos(a) * 16;
        const y = 32 + Math.sin(a) * 16;
        g.poly([x, y - 12, x + 7, y + 10, x - 7, y + 10]).fill({ color: 0xbdf1ff, alpha: 0.95 });
      }
      break;
    }
    case Tex.IconBeam: {
      g.rect(27, 2, 10, 60).fill({ color: C.soul, alpha: 0.5 });
      g.rect(30, 2, 4, 60).fill({ color: 0xffffff, alpha: 0.95 });
      g.poly([22, 12, 32, 2, 42, 12]).fill({ color: 0xdff8ff, alpha: 0.9 });
      break;
    }
    case Tex.IconFrost: {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(32, 32)
          .lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26)
          .stroke({ width: 4, color: 0xa8e6ff, alpha: 0.95 });
        g.moveTo(32 + Math.cos(a) * 15, 32 + Math.sin(a) * 15)
          .lineTo(32 + Math.cos(a + 0.7) * 22, 32 + Math.sin(a + 0.7) * 22)
          .stroke({ width: 3, color: 0xdff4ff, alpha: 0.8 });
      }
      g.circle(32, 32, 5).fill({ color: 0xffffff, alpha: 0.95 });
      break;
    }

    // ——————————————— 被动图标 ———————————————
    case Tex.IconHaste: {
      g.poly([36, 4, 16, 34, 30, 34, 26, 60, 48, 28, 33, 28]).fill({ color: C.amber, alpha: 0.95 });
      g.poly([36, 4, 16, 34, 30, 34, 26, 60, 48, 28, 33, 28]).stroke({
        width: 2,
        color: 0xfff2cc,
        alpha: 0.9,
      });
      break;
    }
    case Tex.IconBoots: {
      g.poly([18, 6, 32, 6, 32, 34, 52, 38, 52, 54, 18, 54]).fill({ color: 0x8a6a3a, alpha: 0.95 });
      g.poly([18, 6, 32, 6, 32, 34, 52, 38, 52, 54, 18, 54]).stroke({
        width: 2,
        color: C.amber,
        alpha: 0.8,
      });
      g.moveTo(6, 24).lineTo(16, 24).stroke({ width: 3, color: C.soul, alpha: 0.85 });
      g.moveTo(6, 36).lineTo(16, 36).stroke({ width: 3, color: C.soul, alpha: 0.6 });
      break;
    }
    case Tex.IconMirror: {
      g.roundRect(8, 10, 20, 44, 3).fill({ color: 0x9fd8ff, alpha: 0.85 });
      g.roundRect(8, 10, 20, 44, 3).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      g.roundRect(36, 10, 20, 44, 3).fill({ color: 0xc4aaff, alpha: 0.85 });
      g.roundRect(36, 10, 20, 44, 3).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
      break;
    }
    case Tex.IconRage: {
      g.poly([32, 6, 52, 26, 42, 54, 22, 54, 12, 26]).fill({ color: C.bad, alpha: 0.92 });
      g.poly([32, 6, 52, 26, 42, 54, 22, 54, 12, 26]).stroke({ width: 2, color: 0xffc2cc, alpha: 0.9 });
      g.poly([32, 18, 42, 32, 32, 46, 22, 32]).fill({ color: 0xfff0f3, alpha: 0.9 });
      break;
    }
    case Tex.IconLife: {
      g.circle(22, 24, 12).fill(C.good);
      g.circle(42, 24, 12).fill(C.good);
      g.poly([9, 28, 32, 56, 55, 28]).fill(C.good);
      g.circle(18, 20, 4).fill({ color: 0xffffff, alpha: 0.55 });
      break;
    }
    case Tex.IconArmor: {
      g.poly([32, 6, 54, 16, 50, 40, 32, 58, 14, 40, 10, 16]).fill({ color: 0x6b7f9e, alpha: 0.95 });
      g.poly([32, 6, 54, 16, 50, 40, 32, 58, 14, 40, 10, 16]).stroke({
        width: 2.4,
        color: 0xcfe4ff,
        alpha: 0.9,
      });
      g.moveTo(32, 14).lineTo(32, 50).stroke({ width: 3, color: 0xcfe4ff, alpha: 0.7 });
      g.moveTo(14, 28).lineTo(50, 28).stroke({ width: 3, color: 0xcfe4ff, alpha: 0.7 });
      break;
    }
    case Tex.IconWisdom: {
      g.roundRect(12, 16, 40, 32, 4).fill({ color: 0xf0e2c0, alpha: 0.95 });
      g.roundRect(12, 16, 40, 32, 4).stroke({ width: 2, color: 0x8a6a3a, alpha: 0.85 });
      g.circle(12, 20, 7).fill({ color: 0xd6c49c, alpha: 1 });
      g.circle(52, 20, 7).fill({ color: 0xd6c49c, alpha: 1 });
      for (let i = 0; i < 3; i++) {
        g.moveTo(20, 26 + i * 8).lineTo(44, 26 + i * 8).stroke({ width: 2, color: 0x8a6a3a, alpha: 0.7 });
      }
      break;
    }
    case Tex.IconCrit: {
      g.poly([32, 4, 40, 30, 46, 30, 34, 60, 36, 36, 28, 36, 30, 20]).fill({
        color: C.amber,
        alpha: 0.95,
      });
      g.poly([32, 4, 40, 30, 46, 30, 34, 60, 36, 36, 28, 36, 30, 20]).stroke({
        width: 1.8,
        color: 0xfff2cc,
        alpha: 0.9,
      });
      break;
    }
    default:
      g.circle(32, 32, 20).fill({ color: 0xff00ff, alpha: 0.6 });
      break;
  }
}

const COLS = 8;

export class TextureAtlas {
  readonly textures: Texture[] = [];
  private iconCache = new Map<number, HTMLCanvasElement>();
  private renderer: Renderer | null = null;

  get ready(): boolean {
    return this.textures.length === Tex.COUNT;
  }

  build(renderer: Renderer): void {
    if (this.ready) return;
    this.renderer = renderer;
    const rows = Math.ceil(Tex.COUNT / COLS);
    const scale = TEX_SIZE / 64;
    const container = new Container();
    for (let i = 0; i < Tex.COUNT; i++) {
      const g = new Graphics();
      drawTex(g, i);
      g.scale.set(scale);
      g.x = (i % COLS) * TEX_SIZE;
      g.y = ((i / COLS) | 0) * TEX_SIZE;
      container.addChild(g);
    }
    const rt = RenderTexture.create({
      width: COLS * TEX_SIZE,
      height: rows * TEX_SIZE,
      antialias: true,
      resolution: 1,
    });
    renderer.render({ container, target: rt, clear: true });

    for (let i = 0; i < Tex.COUNT; i++) {
      const x = (i % COLS) * TEX_SIZE;
      const y = ((i / COLS) | 0) * TEX_SIZE;
      this.textures.push(new Texture({ source: rt.source, frame: new Rectangle(x, y, TEX_SIZE, TEX_SIZE) }));
    }
    container.destroy({ children: true });
  }

  get(key: number): Texture {
    return this.textures[key];
  }

  /**
   * 供 DOM UI 使用的图标。
   * GPU 回读结果只做一次并缓存为源 canvas，之后每次返回一份拷贝——
   * 同一个 canvas 元素被 appendChild 到多处会被「移动」，必须各自持有副本。
   */
  icon(key: number, px = 40): HTMLCanvasElement {
    const out = document.createElement('canvas');
    const src = this.iconSource(key);
    out.width = src.width;
    out.height = src.height;
    out.getContext('2d')?.drawImage(src, 0, 0);
    out.style.width = `${px}px`;
    out.style.height = `${px}px`;
    return out;
  }

  private iconSource(key: number): HTMLCanvasElement {
    const cached = this.iconCache.get(key);
    if (cached) return cached;
    const empty = document.createElement('canvas');
    empty.width = TEX_SIZE;
    empty.height = TEX_SIZE;
    if (!this.renderer || !this.ready) return empty;
    const sprite = new Sprite(this.textures[key]);
    const out = this.renderer.extract.canvas(sprite) as unknown as HTMLCanvasElement;
    sprite.destroy();
    this.iconCache.set(key, out);
    return out;
  }
}

export const atlas = new TextureAtlas();
