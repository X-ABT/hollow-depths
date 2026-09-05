import { Container, Graphics, Rectangle, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { TEX_SIZE, Tex } from './TexKeys';
import { PETS, type PetDef } from '../data/pets';

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

/** HSL → 0xRRGGBB（s / l 用 0-100 的百分数传入） */
function hsl(h: number, s: number, l: number): number {
  const S = s / 100;
  const L = l / 100;
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = S * Math.min(L, 1 - L);
    const c = L - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return ((f(0) & 0xff) << 16) | ((f(8) & 0xff) << 8) | (f(4) & 0xff);
}

/** 幽域龙裔：蓝紫幼龙立绘（双翼张开 + 卷尾 + 龙角），专属绘制 */
function drawDrake(g: G, def: PetDef): void {
  const main = hsl(def.hue, 70, 56); // 亮蓝紫龙身
  const dark = hsl(def.hue, 76, 28); // 深紫描边/暗鳞
  const wing = hsl(def.hue, 62, 46); // 翼膜蓝紫
  const belly = hsl(def.hue, 50, 82); // 胸腹亮鳞
  const glint = hsl(def.hue, 55, 88);
  // 传说金环辉光
  g.circle(32, 32, 31).fill({ color: 0xf5c451, alpha: 0.09 });
  g.circle(32, 32, 31).stroke({ width: 1.8, color: C.amber, alpha: 0.7 });

  // —— 双翼（先画，压在身体之后呈张开状）——
  // 左翼
  g.poly([20, 32, 3, 8, 30, 14]).fill({ color: wing, alpha: 0.92 });
  g.poly([20, 32, 3, 8, 30, 14]).stroke({ width: 1.2, color: dark, alpha: 0.7 });
  g.moveTo(20, 31).lineTo(10, 18).stroke({ width: 1, color: glint, alpha: 0.6 }); // 翼指
  g.moveTo(20, 31).lineTo(20, 12).stroke({ width: 1, color: glint, alpha: 0.45 });
  // 右翼
  g.poly([44, 32, 61, 8, 34, 14]).fill({ color: wing, alpha: 0.92 });
  g.poly([44, 32, 61, 8, 34, 14]).stroke({ width: 1.2, color: dark, alpha: 0.7 });
  g.moveTo(44, 31).lineTo(54, 18).stroke({ width: 1, color: glint, alpha: 0.6 });
  g.moveTo(44, 31).lineTo(44, 12).stroke({ width: 1, color: glint, alpha: 0.45 });

  // —— 卷尾（从右下绕到右上，蓝紫色长尾）——
  g.moveTo(44, 46).quadraticCurveTo(60, 50, 57, 30).stroke({ width: 6.5, color: main, alpha: 0.98 });
  g.moveTo(44, 46).quadraticCurveTo(60, 50, 57, 30).stroke({ width: 2.2, color: dark, alpha: 0.6 });
  g.poly([54, 27, 62, 20, 61, 31]).fill({ color: glint, alpha: 0.95 }); // 尾端鳞片

  // —— 身体：正视坐姿龙躯 ——
  g.ellipse(32, 43, 15, 16).fill({ color: main, alpha: 0.98 });
  g.ellipse(32, 43, 15, 16).stroke({ width: 2, color: dark, alpha: 0.9 });
  g.ellipse(32, 48, 9, 9).fill({ color: belly, alpha: 0.85 }); // 亮胸腹
  // 前肢双爪（坐在画面下方）
  g.ellipse(22, 56, 5, 3.4).fill({ color: main, alpha: 1 });
  g.ellipse(42, 56, 5, 3.4).fill({ color: main, alpha: 1 });
  g.roundRect(19.5, 57.5, 6, 3.4, 1.4).fill({ color: dark, alpha: 0.9 });
  g.roundRect(38.5, 57.5, 6, 3.4, 1.4).fill({ color: dark, alpha: 0.9 });

  // —— 头颈（上部前倾）——
  g.poly([24, 34, 14, 20, 40, 20, 34, 34]).fill({ color: main, alpha: 0.98 });
  // 头
  g.ellipse(26, 18, 13, 11).fill({ color: main, alpha: 1 });
  g.ellipse(26, 18, 13, 11).stroke({ width: 1.8, color: dark, alpha: 0.85 });
  // 吻部（朝左下方）
  g.poly([12, 20, 3, 24, 13, 27]).fill({ color: main, alpha: 1 });
  g.circle(7, 24, 1.3).fill({ color: dark, alpha: 0.9 }); // 鼻孔
  // 双角：向后上方弯曲
  g.poly([17, 8, 12, 0, 23, 3]).fill({ color: dark, alpha: 0.98 });
  g.poly([31, 6, 33, 0, 38, 2]).fill({ color: dark, alpha: 0.85 });
  g.moveTo(17, 8).lineTo(19, 1).stroke({ width: 1.1, color: glint, alpha: 0.5 });
  g.moveTo(31, 6).lineTo(32, 1).stroke({ width: 1.1, color: glint, alpha: 0.5 });

  // —— 龙眼：竖瞳琥珀光 ——
  g.circle(17, 19, 2.7).fill({ color: C.amber, alpha: 1 });
  g.circle(17, 19, 1).fill({ color: 0xffffff, alpha: 0.9 });
  g.circle(32, 18, 2.6).fill({ color: C.amber, alpha: 0.95 });
  g.circle(32, 18, 0.95).fill({ color: 0xffffff, alpha: 0.85 });

  // 翼膜肋纹（层次）
  g.moveTo(20, 31).lineTo(15, 15).stroke({ width: 0.9, color: glint, alpha: 0.35 });
  g.moveTo(20, 31).lineTo(25, 14).stroke({ width: 0.9, color: glint, alpha: 0.3 });
  g.moveTo(44, 31).lineTo(49, 15).stroke({ width: 0.9, color: glint, alpha: 0.35 });
  g.moveTo(44, 31).lineTo(39, 14).stroke({ width: 0.9, color: glint, alpha: 0.3 });
  // 胸腹鳞列
  g.moveTo(24, 45).quadraticCurveTo(32, 49, 40, 45).stroke({ width: 1, color: dark, alpha: 0.35 });
  g.moveTo(26, 51).quadraticCurveTo(32, 54, 38, 51).stroke({ width: 1, color: dark, alpha: 0.3 });
  // 尾环
  g.moveTo(52, 44).lineTo(56, 40).stroke({ width: 1.6, color: dark, alpha: 0.4 });
  g.moveTo(55, 36).lineTo(59, 33).stroke({ width: 1.6, color: dark, alpha: 0.35 });

  // 龙鳞高光
  g.circle(27, 38, 1.3).fill({ color: glint, alpha: 0.8 });
  g.circle(37, 36, 1).fill({ color: glint, alpha: 0.7 });
  g.circle(24, 30, 1).fill({ color: glint, alpha: 0.7 });
}

/** 星噬之眼：浮空深渊之眼（星环 + 深邃球体 + 琥珀竖瞳） */
function drawStareye(g: G, def: PetDef): void {
  const voidC = 0x0b0622;
  const neb = hsl(262, 60, 16);
  const nebHi = hsl(262, 48, 30);
  // 传说金环辉光
  g.circle(32, 32, 31).fill({ color: 0xf5c451, alpha: 0.1 });
  g.circle(32, 32, 31).stroke({ width: 1.8, color: C.amber, alpha: 0.75 });

  // 外层星云晕（层次）
  g.circle(32, 32, 30).fill({ color: voidC, alpha: 0.35 });
  g.circle(32, 32, 29).stroke({ width: 1.2, color: 0x5b46b8, alpha: 0.5 });

  // 眼窝外圈（深紫晕）
  g.circle(32, 32, 27).fill({ color: neb, alpha: 1 });
  g.circle(32, 32, 27).stroke({ width: 2.2, color: 0x7c5cff, alpha: 0.85 });

  // 虹膜内环
  g.circle(32, 32, 21).fill({ color: hsl(264, 62, 12), alpha: 1 });
  g.circle(32, 32, 15).stroke({ width: 1.6, color: 0x9b7dff, alpha: 0.5 });

  // 垂直琥珀竖瞳 + 外层光晕
  g.roundRect(30.2, 18, 3.6, 28, 1.8).fill({ color: C.amber, alpha: 0.95 });
  g.circle(32, 32, 9).fill({ color: C.amber, alpha: 0.16 });
  g.circle(32, 32, 4).fill({ color: 0xffe9a8, alpha: 0.9 }); // 瞳心亮点
  // 眼眶高光弧（顶部）
  g.circle(26, 20, 4.5).fill({ color: nebHi, alpha: 0.5 });
  g.circle(24, 18, 2).fill({ color: 0xffffff, alpha: 0.16 });

  // 瞳孔四周的微型“星芒/吞噬”纹
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.circle(32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17, 0.9).fill({ color: 0xd9c8ff, alpha: 0.55 });
  }
  // 环绕运行的小星子（太空感）
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const rr = i % 2 === 0 ? 27.5 : 25.5;
    g.circle(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr, i === 1 ? 1.8 : 1.1).fill({
      color: i === 1 ? 0xf5c451 : 0xbfd8ff,
      alpha: 0.9,
    });
  }
  // 四向细短星芒
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x1 = 32 + Math.cos(a) * 31;
    const y1 = 32 + Math.sin(a) * 31;
    const x2 = 32 + Math.cos(a) * 35;
    const y2 = 32 + Math.sin(a) * 35;
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.1, color: 0x7c5cff, alpha: 0.9 });
  }
  // 虹膜细环 + 镜头光斑（精修层次）
  g.circle(32, 32, 18).stroke({ width: 0.9, color: 0xb9a6ff, alpha: 0.35 });
  g.circle(38, 26, 1.6).fill({ color: 0xffffff, alpha: 0.5 });
  void def;
}

/** 六边形晶体板顶点路径（晶甲龟壳面拼接用） */
function hexPath(cx: number, cy: number, r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}

/** 深渊猎犬：矫健犬形 + 背脊骨刺 + 深渊气息 + 发光獠牙与红紫凶瞳 */
function drawAbysshound(g: G, def: PetDef): void {
  const main = hsl(def.hue, 40, 32);
  const deep = hsl(def.hue, 58, 14);
  const belly = hsl(def.hue, 38, 52);
  const spike = hsl(def.hue, 58, 62);
  const aura = 0x7c5cff;

  // 身周深渊气息
  g.circle(32, 36, 27).fill({ color: aura, alpha: 0.14 });
  g.circle(32, 36, 20).fill({ color: aura, alpha: 0.1 });

  // 上扬长尾
  g.moveTo(46, 42).quadraticCurveTo(58, 38, 55, 23).stroke({ width: 5, color: main, alpha: 0.98 });
  g.moveTo(46, 42).quadraticCurveTo(58, 38, 55, 23).stroke({ width: 1.8, color: deep, alpha: 0.7 });

  // 四足（后腿压在身下）
  for (const x of [21, 27, 37, 43]) {
    g.roundRect(x - 2.3, 50, 4.6, 10, 2).fill({ color: deep, alpha: 0.95 });
    g.roundRect(x - 2.3, 57, 4.6, 2.6, 1.2).fill({ color: 0x9fe8ff, alpha: 0.32 });
  }

  // 躯干
  g.ellipse(32, 43, 17, 10.5).fill({ color: main, alpha: 0.98 });
  g.ellipse(32, 43, 17, 10.5).stroke({ width: 1.8, color: deep, alpha: 0.9 });
  g.ellipse(32, 47, 10, 5).fill({ color: belly, alpha: 0.55 });

  // 背脊骨刺
  g.poly([23, 34, 21, 24, 29, 32]).fill({ color: spike, alpha: 0.95 });
  g.poly([32, 33, 33, 22, 38, 32]).fill({ color: spike, alpha: 0.95 });
  g.poly([40, 34, 44, 25, 45, 35]).fill({ color: spike, alpha: 0.9 });

  // 头 + 前倾吻部
  g.ellipse(27, 29, 11.5, 10).fill({ color: main, alpha: 1 });
  g.ellipse(27, 29, 11.5, 10).stroke({ width: 1.7, color: deep, alpha: 0.9 });
  g.poly([18, 32, 7, 36, 18, 40]).fill({ color: hsl(def.hue, 36, 26), alpha: 1 });
  g.circle(11, 36, 1.3).fill({ color: 0x05030c, alpha: 0.9 });
  // 发光獠牙
  g.poly([15, 38, 16.5, 43, 18.5, 38]).fill({ color: 0xe8dcff, alpha: 0.95 });
  g.poly([21, 38, 22.5, 42, 24, 38]).fill({ color: 0xe8dcff, alpha: 0.88 });
  // 竖耳
  g.poly([18, 23, 13, 10, 27, 19]).fill({ color: deep, alpha: 0.95 });
  g.poly([35, 22, 41, 9, 42, 22]).fill({ color: deep, alpha: 0.9 });

  // 红紫凶瞳
  glow(g, 23, 30, 3.4, 0xff5470, 0.95);
  glow(g, 33, 29, 3.2, 0xff5470, 0.85);
  g.circle(23, 30, 1).fill({ color: 0xffe9ef, alpha: 0.95 });
  g.circle(33, 29, 0.9).fill({ color: 0xffe9ef, alpha: 0.9 });

  // 口前深渊吐息余烬
  g.circle(6, 38, 2.4).fill({ color: aura, alpha: 0.5 });
  g.circle(3, 40, 1.4).fill({ color: aura, alpha: 0.35 });
}

/** 晶甲龟：六边形晶体龟壳 + 甲缝冰蓝高光 + 短肢与壳下幼体 */
function drawCrystalcoot(g: G, def: PetDef): void {
  const shell = hsl(def.hue, 44, 60);
  const shellLo = hsl(def.hue, 50, 34);
  const shellHi = hsl(def.hue, 58, 86);
  const seam = 0x9fe8ff;
  const body = hsl(def.hue, 32, 40);

  // 下层暗壳
  g.ellipse(32, 36, 21, 15).fill({ color: shellLo, alpha: 0.98 });
  g.ellipse(32, 36, 21, 15).stroke({ width: 1.8, color: hsl(def.hue, 55, 22), alpha: 0.9 });

  // 四短肢 + 尾
  for (const x of [16, 26, 36, 45]) {
    g.roundRect(x, 47, 6, 8, 2.4).fill({ color: body, alpha: 0.98 });
  }
  g.poly([52, 36, 60, 33, 53, 41]).fill({ color: body, alpha: 0.95 });

  // 壳下探出的幼体头（左侧）
  g.ellipse(15, 40, 8, 7).fill({ color: body, alpha: 1 });
  g.ellipse(15, 40, 8, 7).stroke({ width: 1.4, color: shellLo, alpha: 0.9 });
  g.circle(12, 39, 1.7).fill({ color: 0x0a0713, alpha: 0.9 });
  g.circle(16, 39, 1.7).fill({ color: 0x0a0713, alpha: 0.9 });
  g.circle(12.6, 38.4, 0.6).fill({ color: 0xffffff, alpha: 0.85 });
  g.circle(16.6, 38.4, 0.6).fill({ color: 0xffffff, alpha: 0.85 });

  // 壳面晶体板拼接
  g.poly(hexPath(32, 36, 7)).fill({ color: shell, alpha: 0.98 });
  g.poly(hexPath(32, 36, 7)).stroke({ width: 1.2, color: seam, alpha: 0.8 });
  const plates: readonly [number, number, number][] = [
    [20, 32, 5.5],
    [44, 32, 5.5],
    [26, 45, 5],
    [38, 45, 5],
    [32, 24, 5],
    [46, 41, 4.4],
    [18, 41, 4.4],
  ];
  for (const [hx, hy, hr] of plates) {
    g.poly(hexPath(hx, hy, hr)).fill({ color: shell, alpha: 0.92 });
    g.poly(hexPath(hx, hy, hr)).stroke({ width: 1, color: seam, alpha: 0.55 });
  }

  // 甲缝高光弧 + 顶部晶体尖（剪影辨识）
  g.moveTo(14, 34).quadraticCurveTo(32, 20, 50, 34).stroke({ width: 1.6, color: shellHi, alpha: 0.75 });
  g.moveTo(18, 44).quadraticCurveTo(32, 50, 46, 44).stroke({ width: 1.2, color: shellHi, alpha: 0.45 });
  g.poly([32, 22, 28, 13, 36, 13]).fill({ color: shellHi, alpha: 0.9 });
  g.circle(29, 30, 1.6).fill({ color: 0xffffff, alpha: 0.5 });
}

/** 噬光蝶：羽状触角 + 眼斑宽翅 + 鳞粉微光 + 吸光暗紫渐变 */
function drawGlowmoth(g: G, def: PetDef): void {
  const wing = hsl(def.hue, 46, 44);
  const wingLo = hsl(def.hue, 60, 20);
  const wingHi = hsl(def.hue, 52, 74);
  const body = hsl(def.hue, 30, 26);
  const fur = hsl(def.hue, 34, 58);
  const dust = 0xd9c8ff;

  // 吸光感：外圈暗紫渐隐
  g.circle(32, 34, 27).fill({ color: wingLo, alpha: 0.22 });

  // 双翅（上宽下窄的蛾翅）
  g.poly([30, 36, 10, 12, 3, 34, 12, 48, 27, 43]).fill({ color: wing, alpha: 0.96 });
  g.poly([30, 36, 10, 12, 3, 34, 12, 48, 27, 43]).stroke({ width: 1.4, color: wingLo, alpha: 0.9 });
  g.poly([34, 36, 54, 12, 61, 34, 52, 48, 37, 43]).fill({ color: wing, alpha: 0.96 });
  g.poly([34, 36, 54, 12, 61, 34, 52, 48, 37, 43]).stroke({ width: 1.4, color: wingLo, alpha: 0.9 });

  // 翅脉
  for (const t of [0.35, 0.6, 0.85]) {
    g.moveTo(30, 36).lineTo(30 - 22 * t, 12 + 26 * t).stroke({ width: 0.9, color: wingHi, alpha: 0.45 });
    g.moveTo(34, 36).lineTo(34 + 22 * t, 12 + 26 * t).stroke({ width: 0.9, color: wingHi, alpha: 0.45 });
  }

  // 眼斑
  g.circle(15, 30, 5).fill({ color: wingHi, alpha: 0.9 });
  g.circle(15, 30, 2.4).fill({ color: 0x1a0f2e, alpha: 0.95 });
  g.circle(49, 30, 5).fill({ color: wingHi, alpha: 0.9 });
  g.circle(49, 30, 2.4).fill({ color: 0x1a0f2e, alpha: 0.95 });

  // 鳞粉微光
  const motes: readonly [number, number, number][] = [[9, 40, 1.3], [19, 45, 1], [43, 45, 1.1], [53, 40, 1.3], [32, 15, 1]];
  for (const [dx, dy, r] of motes) {
    g.circle(dx, dy, r).fill({ color: dust, alpha: 0.55 });
  }

  // 毛茸茸胸腹
  g.ellipse(32, 38, 6.5, 13).fill({ color: body, alpha: 0.98 });
  g.ellipse(32, 38, 6.5, 13).stroke({ width: 1.2, color: fur, alpha: 0.5 });
  for (let i = 0; i < 4; i++) {
    g.moveTo(28, 33 + i * 4).lineTo(36, 33 + i * 4).stroke({ width: 0.8, color: fur, alpha: 0.35 });
  }

  // 头 + 羽状触角
  g.circle(32, 26, 5.5).fill({ color: body, alpha: 1 });
  g.moveTo(30, 22).quadraticCurveTo(24, 12, 20, 8).stroke({ width: 1.8, color: fur, alpha: 0.9 });
  g.moveTo(34, 22).quadraticCurveTo(40, 12, 44, 8).stroke({ width: 1.8, color: fur, alpha: 0.9 });
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    g.moveTo(30 - 4 * t, 22 - 6 * t).lineTo(30 - 7 * t, 20 - 7 * t).stroke({ width: 0.7, color: fur, alpha: 0.6 });
    g.moveTo(34 + 4 * t, 22 - 6 * t).lineTo(34 + 7 * t, 20 - 7 * t).stroke({ width: 0.7, color: fur, alpha: 0.6 });
  }
  g.circle(30, 26, 1.5).fill({ color: 0x9fe8ff, alpha: 0.95 });
  g.circle(34, 26, 1.5).fill({ color: 0x9fe8ff, alpha: 0.95 });
}

/** 霜魇猫：猫耳长尾 + 脊背霜刺 + 冰蓝渐变 + 寒光竖瞳 */
function drawFrostcat(g: G, def: PetDef): void {
  const main = hsl(def.hue, 40, 66);
  const deep = hsl(def.hue, 50, 30);
  const belly = hsl(def.hue, 45, 88);
  const frost = 0xd9f4ff;
  const ice = 0x9fe8ff;

  // 寒气
  g.circle(32, 36, 26).fill({ color: ice, alpha: 0.13 });

  // 上卷长尾 + 尾尖霜簇
  g.moveTo(44, 46).quadraticCurveTo(60, 46, 57, 28).stroke({ width: 5.5, color: main, alpha: 0.98 });
  g.moveTo(44, 46).quadraticCurveTo(60, 46, 57, 28).stroke({ width: 1.8, color: deep, alpha: 0.6 });
  g.poly([52, 30, 60, 22, 60, 32]).fill({ color: frost, alpha: 0.95 });

  // 四足
  for (const x of [22, 28, 37, 43]) {
    g.roundRect(x - 2.3, 51, 4.6, 9.5, 2).fill({ color: deep, alpha: 0.95 });
  }

  // 躯干
  g.ellipse(32, 43, 16.5, 10.5).fill({ color: main, alpha: 0.98 });
  g.ellipse(32, 43, 16.5, 10.5).stroke({ width: 1.8, color: deep, alpha: 0.9 });
  g.ellipse(32, 47, 9, 4.6).fill({ color: belly, alpha: 0.7 });

  // 脊背霜刺
  g.poly([24, 34, 22, 25, 29, 32]).fill({ color: frost, alpha: 0.95 });
  g.poly([32, 33, 33, 23, 38, 32]).fill({ color: frost, alpha: 0.95 });
  g.poly([40, 35, 44, 27, 45, 36]).fill({ color: frost, alpha: 0.9 });

  // 头 + 猫耳
  g.ellipse(28, 29, 11, 9.5).fill({ color: main, alpha: 1 });
  g.ellipse(28, 29, 11, 9.5).stroke({ width: 1.7, color: deep, alpha: 0.9 });
  g.poly([19, 23, 15, 10, 27, 19]).fill({ color: main, alpha: 1 });
  g.poly([19, 23, 15, 10, 27, 19]).stroke({ width: 1.3, color: deep, alpha: 0.85 });
  g.poly([36, 22, 41, 9, 43, 22]).fill({ color: main, alpha: 1 });
  g.poly([36, 22, 41, 9, 43, 22]).stroke({ width: 1.3, color: deep, alpha: 0.85 });
  g.poly([20, 21, 18, 14, 24, 19]).fill({ color: 0xffc9e0, alpha: 0.55 });
  g.poly([37, 20, 40, 14, 41, 21]).fill({ color: 0xffc9e0, alpha: 0.5 });

  // 寒光竖瞳
  g.ellipse(24, 30, 2.6, 3.2).fill({ color: ice, alpha: 0.95 });
  g.ellipse(34, 30, 2.6, 3.2).fill({ color: ice, alpha: 0.95 });
  g.roundRect(23.3, 27.6, 1.4, 5, 0.7).fill({ color: 0x0a2b3a, alpha: 0.95 });
  g.roundRect(33.3, 27.6, 1.4, 5, 0.7).fill({ color: 0x0a2b3a, alpha: 0.95 });

  // 口鼻 + 胡须
  g.poly([25, 34, 28, 37, 31, 34]).fill({ color: 0xffc9e0, alpha: 0.7 });
  g.moveTo(21, 34).lineTo(12, 32).stroke({ width: 0.8, color: frost, alpha: 0.7 });
  g.moveTo(21, 36).lineTo(12, 37).stroke({ width: 0.8, color: frost, alpha: 0.6 });
  g.moveTo(35, 34).lineTo(44, 32).stroke({ width: 0.8, color: frost, alpha: 0.7 });
  g.moveTo(35, 36).lineTo(44, 37).stroke({ width: 0.8, color: frost, alpha: 0.6 });
}

/** 宠物身体：按体型族程序化绘制；传说加金环辉光（图鉴大头贴与局内共用同一张贴图） */
function drawPet(g: G, def: PetDef): void {
  // 专属传说形象优先（龙裔 / 星噬之眼各有定制立绘）
  if (def.id === 'drake') {
    drawDrake(g, def);
    return;
  }
  if (def.id === 'stareye') {
    drawStareye(g, def);
    return;
  }
  // 稀有专属形象（避免同体型只换色的单调）
  if (def.id === 'abysshound') {
    drawAbysshound(g, def);
    return;
  }
  if (def.id === 'crystalcoot') {
    drawCrystalcoot(g, def);
    return;
  }
  if (def.id === 'glowmoth') {
    drawGlowmoth(g, def);
    return;
  }
  if (def.id === 'frostcat') {
    drawFrostcat(g, def);
    return;
  }
  const main = hsl(def.hue, 44, 60);
  const deep = hsl(def.hue, 50, 34);
  const soft = hsl(def.hue, 38, 78);
  const eye = def.rarity === 'legend' ? C.amber : def.rarity === 'rare' ? 0x9fe8ff : C.void;
  if (def.rarity === 'legend') {
    g.circle(32, 32, 31).fill({ color: 0xf5c451, alpha: 0.08 });
    g.circle(32, 32, 31).stroke({ width: 1.8, color: C.amber, alpha: 0.7 });
  }
  switch (def.bodyKind) {
    case 0: {
      // 团身系：圆胖身体 + 头顶圆耳
      g.ellipse(32, 40, 19, 15).fill({ color: main, alpha: 0.98 });
      g.ellipse(32, 40, 19, 15).stroke({ width: 2, color: deep, alpha: 0.9 });
      g.circle(21, 27, 5.5).fill({ color: soft, alpha: 0.95 });
      g.circle(43, 27, 5.5).fill({ color: soft, alpha: 0.95 });
      g.circle(32, 27, 10).fill({ color: hsl(def.hue, 58, 76), alpha: 1 });
      g.ellipse(32, 46, 10, 5).fill({ color: soft, alpha: 0.55 });
      eyes(g, 32, 28, 3.6, 2.2, eye);
      break;
    }
    case 1: {
      // 兽系：四足 + 竖耳 + 卷尾
      g.ellipse(32, 47, 19, 11).fill({ color: main, alpha: 0.98 });
      g.ellipse(32, 47, 19, 11).stroke({ width: 2, color: deep, alpha: 0.9 });
      for (const x of [21, 28, 36, 43]) {
        g.roundRect(x - 2.4, 52, 5, 9, 2).fill({ color: deep, alpha: 0.95 });
      }
      g.circle(32, 26, 11.5).fill({ color: main, alpha: 1 });
      g.poly([21, 23, 15, 9, 28, 18]).fill({ color: deep, alpha: 0.9 });
      g.poly([43, 23, 49, 9, 36, 18]).fill({ color: deep, alpha: 0.9 });
      eyes(g, 32, 27, 4.2, 2.1, eye);
      g.moveTo(13, 47).quadraticCurveTo(4, 34, 10, 24).stroke({ width: 4, color: main, alpha: 0.95 });
      break;
    }
    default: {
      // 飞翼系：小圆身 + 大张双翼
      g.poly([22, 38, 5, 20, 7, 45]).fill({ color: deep, alpha: 0.95 });
      g.poly([42, 38, 59, 20, 57, 45]).fill({ color: deep, alpha: 0.95 });
      g.ellipse(32, 40, 13, 11).fill({ color: main, alpha: 0.98 });
      g.ellipse(32, 40, 13, 11).stroke({ width: 1.8, color: soft, alpha: 0.9 });
      g.circle(32, 40, 6).fill({ color: hsl(def.hue, 62, 76), alpha: 1 });
      eyes(g, 32, 40, 3, 1.9, eye);
      g.moveTo(27, 49).quadraticCurveTo(32, 58, 37, 49).stroke({ width: 2, color: deep, alpha: 0.7 });
      break;
    }
  }
}

/** 单个纹理的绘制（坐标系固定为 0..64，烘焙时统一缩放） */
export function drawTex(g: G, key: number): void {
  g.clear();
  // 宠物身体：Tex.Pet + 下标 0..N-1 依次对应 PETS 表
  const petIdx = key - Tex.Pet;
  if (petIdx >= 0 && petIdx < PETS.length) {
    drawPet(g, PETS[petIdx]);
    return;
  }
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
    case Tex.BossLament: {
      // 泣灵：幽蓝漩涡母体（螺旋旋臂 + 冰冷内核）
      glow(g, 32, 32, 30, 0x43e0ff, 0.5);
      g.circle(32, 32, 27).fill({ color: 0x0a2333, alpha: 0.92 });
      g.circle(32, 32, 27).stroke({ width: 2, color: hsl(198, 85, 60), alpha: 0.85 });
      g.circle(32, 32, 20).stroke({ width: 1.6, color: hsl(198, 80, 42), alpha: 0.6 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(32 + Math.cos(a) * 9, 32 + Math.sin(a) * 9)
          .quadraticCurveTo(
            32 + Math.cos(a + 0.9) * 20,
            32 + Math.sin(a + 0.9) * 20,
            32 + Math.cos(a + 1.8) * 28,
            32 + Math.sin(a + 1.8) * 28,
          )
          .stroke({ width: 3, color: hsl(198, 75, 68), alpha: 0.75 });
      }
      // 冰冷内核对眼（邪气）
      glow(g, 32, 32, 9, 0xbdf1ff, 0.9);
      g.circle(32, 32, 4.6).fill({ color: 0xeaffff, alpha: 0.95 });
      g.circle(32, 32, 1.6).fill({ color: 0x0a2333, alpha: 0.95 });
      break;
    }
    case Tex.BossMaw: {
      // 渊喉：黑洞巨口（吸积光点环 + 内黑口 + 利齿）
      glow(g, 32, 32, 30, 0x7c5cff, 0.4);
      g.circle(32, 32, 27).fill({ color: 0x0b0622, alpha: 0.98 });
      g.circle(32, 32, 27).stroke({ width: 2, color: 0x9b7dff, alpha: 0.8 });
      // 吸积光点
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + i * 0.7;
        const r = 21 + (i % 3) * 2;
        g.circle(32 + Math.cos(a) * r, 32 + Math.sin(a) * r, 1.6).fill({ color: 0xff8a5c, alpha: 0.85 });
      }
      g.circle(32, 32, 13).fill({ color: 0x000000, alpha: 1 });
      g.circle(32, 32, 13).stroke({ width: 1.8, color: 0xff5470, alpha: 0.9 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(32 + Math.cos(a) * 12, 32 + Math.sin(a) * 12)
          .lineTo(32 + Math.cos(a) * 17, 32 + Math.sin(a) * 17)
          .stroke({ width: 2.4, color: 0xffe9ef, alpha: 0.9 });
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
    case Tex.Gunner: {
      // 深渊炮手：环形炮台核心 + 一圈小炮管（区别于甲壳/面具）
      g.circle(32, 32, 24).fill({ color: 0x1e1636, alpha: 0.95 });
      g.circle(32, 32, 24).stroke({ width: 2, color: 0x6b6189, alpha: 0.9 });
      // 八根外伸炮管
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = 32 + Math.cos(a) * 20;
        const y = 32 + Math.sin(a) * 20;
        g.circle(x, y, 4).fill({ color: 0x7c5cff, alpha: 0.85 });
      }
      // 中央发光炮口
      glow(g, 32, 32, 16, C.bad, 0.9);
      g.circle(32, 32, 8).fill({ color: 0xff5470, alpha: 0.95 });
      g.circle(32, 32, 8).stroke({ width: 1.4, color: 0xffd9a0, alpha: 0.9 });
      break;
    }
    case Tex.PetFood: {
      // 宠物粮袋：束口小麻袋 + 高光
      g.ellipse(32, 39, 17, 15).fill({ color: 0xb98a52, alpha: 0.98 });
      g.ellipse(32, 39, 17, 15).stroke({ width: 2, color: 0x6e4a26, alpha: 0.9 });
      g.roundRect(23, 24, 18, 9, 3).fill({ color: 0x6e4a26, alpha: 0.95 });
      g.moveTo(32, 14).lineTo(32, 26).stroke({ width: 2.4, color: 0xe6d7ae, alpha: 0.9 });
      g.circle(32, 14, 3.4).fill({ color: 0xf2e2b8, alpha: 0.95 });
      g.circle(43, 32, 4.5).fill({ color: 0xfff2cc, alpha: 0.4 });
      break;
    }
    case Tex.PetClaw: {
      // 宠物爪击：三条醒目的竖直划痕（中心在 (32,32)）
      for (let i = -1; i <= 1; i++) {
        const x = 32 - 2 + i * 11;
        g.roundRect(x, 17, 4, 30, 2).fill({ color: 0xffffff, alpha: 0.98 });
        g.roundRect(x, 17, 4, 30, 2).stroke({ width: 1.6, color: 0x43e0ff, alpha: 0.75 });
        g.roundRect(x - 1.6, 17, 1.6, 30, 0.8).fill({ color: 0x9fd8ff, alpha: 0.5 });
      }
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
