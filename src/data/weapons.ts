import { TAU } from '../core/MathUtil';
import type { Rng } from '../core/Rng';
import { Behavior, type Enemy, type Player } from '../ecs/Components';
import { spawnProj } from '../ecs/Spawn';
import type { World } from '../ecs/World';
import { Tex } from '../render/TexKeys';

/** 开火上下文：由 WeaponSystem 组装，武器实现只需读取并生成投射物 */
export interface FireCtx {
  world: World;
  p: Player;
  rng: Rng;
  /** 武器槽位 0..5 */
  slot: number;
  /** 伤害来源 id（槽位 × 16），用于同类来源的命中间隔判定 */
  srcId: number;
  /** 1-based 等级 */
  level: number;
  /** 已应用伤害加成的最终基础伤害 */
  dmg: number;
  critChance: number;
  critMult: number;
  projBonus: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  en: string;
  desc: string;
  /** 英文描述（缺省回退中文 desc） */
  enDesc?: string;
  icon: number;
  maxLevel: number;
  /** 常驻型武器（如环绕光环）：开火仅用于生成/重建，不走冷却 */
  persistent?: boolean;
  /** 每级冷却（秒） */
  cd: number[];
  /** 每级基础伤害 */
  dmg: number[];
  /** 每级参数 A */
  a: number[];
  /** 每级参数 B */
  b: number[];
  aName: string;
  bName: string;
  fire: (d: WeaponDef, ctx: FireCtx) => void;
  /** 进化所需被动 id */
  evolveWith?: string;
  /** 进化后的武器 id */
  evolved?: string;
  isEvolved?: boolean;
}

const lv = (level: number): number => Math.min(level, 12) - 1;

/** 取最近敌人（null 表示场上无敌人） */
function nearestEnemy(world: World, x: number, y: number, r: number): Enemy | null {
  const idx = world.hash.queryNearest(x, y, r);
  if (idx < 0) return null;
  return world.enemies.items[idx];
}

// ——————————————————— 1. 裂地印记（起始武器） ———————————————————
function fireRift(d: WeaponDef, ctx: FireCtx): void {
  const { world, p, level } = ctx;
  const i = lv(level);
  const radius = d.a[i];
  const targets = d.b[i] + ctx.projBonus;

  // 标记「离玩家最近」的一批敌人（空间哈希 query 无序，须自行按距离挑近的），
  // 让敌人尽量死在玩家脚边：既构成贴身保护，掉落也便于拾取。
  const found = world.hash.query(p.x, p.y, 640, world.qbuf);
  const n = Math.min(found, targets);
  if (n > 0) {
    const list = world.enemies.items;
    // 选择排序取前 n 个最近的（n 通常 1-5，开销可忽略）
    const idx = world.qbuf;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < found; b++) {
        const ea = list[idx[a]];
        const eb = list[idx[b]];
        const da = (ea.x - p.x) ** 2 + (ea.y - p.y) ** 2;
        const db = (eb.x - p.x) ** 2 + (eb.y - p.y) ** 2;
        if (db < da) {
          const tmp = idx[a];
          idx[a] = idx[b];
          idx[b] = tmp;
        }
      }
    }
    for (let k = 0; k < n; k++) {
      const e = list[idx[k]];
      spawnProj(world, (pr) => {
        pr.behavior = Behavior.Mark;
        pr.x = pr.px = e.x;
        pr.y = pr.py = e.y;
        pr.radius = radius;
        pr.r0 = 16;
        pr.r1 = radius;
        pr.damage = ctx.dmg;
        pr.life = pr.maxLife = 0.6;
        pr.pierce = 9999;
        pr.srcId = ctx.srcId + k;
        pr.critChance = d.isEvolved ? 1 : ctx.critChance;
        pr.critMult = ctx.critMult;
        pr.spriteKey = Tex.Rift;
        pr.scale = radius / 56;
        pr.rotSpeed = 1.2;
      });
    }
  } else {
    // 场上无敌人：落在附近随机点，避免开局干等
    const ang = ctx.rng.next() * TAU;
    const dist = 160 + ctx.rng.next() * 120;
    spawnProj(world, (pr) => {
      pr.behavior = Behavior.Mark;
      pr.x = pr.px = p.x + Math.cos(ang) * dist;
      pr.y = pr.py = p.y + Math.sin(ang) * dist;
      pr.radius = radius;
      pr.r0 = 16;
      pr.r1 = radius;
      pr.damage = ctx.dmg;
      pr.life = pr.maxLife = 0.6;
      pr.pierce = 9999;
      pr.srcId = ctx.srcId;
      pr.critChance = d.isEvolved ? 1 : ctx.critChance;
      pr.critMult = ctx.critMult;
      pr.spriteKey = Tex.Rift;
      pr.scale = radius / 56;
      pr.rotSpeed = 1.2;
    });
  }
}

// ——————————————————— 2. 圣环（环绕） ———————————————————
function fireHalo(d: WeaponDef, ctx: FireCtx): void {
  const i = lv(ctx.level);
  const count = d.a[i] + ctx.projBonus;
  const radius = d.b[i];
  const orbR = 15 + ctx.level * 0.8;
  // 进化「双生圣环」：内外两圈反向旋转
  const rings = d.isEvolved
    ? [
        { r: radius, dir: 1, n: Math.max(2, Math.ceil(count / 2)) },
        { r: radius * 0.6, dir: -1, n: Math.max(2, Math.floor(count / 2)) },
      ]
    : [{ r: radius, dir: 1, n: count }];
  let seq = 0;
  for (const ring of rings) {
    for (let k = 0; k < ring.n; k++) {
      const idx = seq++;
      spawnProj(ctx.world, (pr) => {
        pr.behavior = Behavior.Orbit;
        pr.x = pr.px = ctx.p.x;
        pr.y = pr.py = ctx.p.y;
        pr.orbitAngle = (k / ring.n) * TAU;
        pr.orbitRadius = ring.r;
        pr.orbitSpeed = 2.3 * ring.dir;
        pr.radius = orbR;
        pr.damage = ctx.dmg;
        pr.life = pr.maxLife = 1e9;
        pr.pierce = 9999;
        pr.srcId = ctx.srcId + idx;
        pr.critChance = ctx.critChance;
        pr.critMult = ctx.critMult;
        pr.knockback = 60;
        pr.spriteKey = Tex.OrbHalo;
        pr.scale = 0.9;
      });
    }
  }
}

// ——————————————————— 3. 追猎印记（追踪） ———————————————————
function fireSeeker(d: WeaponDef, ctx: FireCtx): void {
  const i = lv(ctx.level);
  const n = d.a[i] + ctx.projBonus;
  const speed = d.b[i];
  const base = ctx.rng.next() * TAU;
  for (let k = 0; k < n; k++) {
    const ang = base + (k / n) * TAU;
    spawnProj(ctx.world, (pr) => {
      pr.behavior = Behavior.Homing;
      pr.x = pr.px = ctx.p.x;
      pr.y = pr.py = ctx.p.y;
      pr.vx = Math.cos(ang) * speed;
      pr.vy = Math.sin(ang) * speed;
      pr.radius = 9;
      pr.damage = ctx.dmg;
      pr.life = pr.maxLife = 3.2;
      pr.pierce = 1;
      pr.srcId = ctx.srcId + k;
      pr.critChance = ctx.critChance;
      pr.critMult = ctx.critMult;
      pr.turn = 7.5;
      pr.knockback = 40;
      pr.splash = d.isEvolved ? 82 : 0;
      pr.spriteKey = Tex.OrbSeeker;
      pr.rotSpeed = 6;
    });
  }
}

// ——————————————————— 4. 震击波（爆发 + 击退） ———————————————————
function fireShock(d: WeaponDef, ctx: FireCtx): void {
  const i = lv(ctx.level);
  const radius = d.a[i];
  const knock = d.b[i];
  spawnProj(ctx.world, (pr) => {
    pr.behavior = Behavior.Aoe;
    pr.x = pr.px = ctx.p.x;
    pr.y = pr.py = ctx.p.y;
    pr.radius = 24;
    pr.r0 = 24;
    pr.r1 = radius;
    pr.damage = ctx.dmg;
    pr.life = pr.maxLife = 0.38;
    pr.pierce = 9999;
    pr.srcId = ctx.srcId;
    pr.critChance = ctx.critChance;
    pr.critMult = ctx.critMult;
    pr.knockback = knock;
    pr.spriteKey = Tex.Wave;
    pr.scale = radius / 90;
  });
}

// ——————————————————— 5. 碎星弹（弹幕） ———————————————————
function fireShard(d: WeaponDef, ctx: FireCtx): void {
  const i = lv(ctx.level);
  const n = d.a[i] + ctx.projBonus;
  const speed = d.b[i];
  const base = ctx.rng.next() * TAU;
  for (let k = 0; k < n; k++) {
    const ang = base + (k / n) * TAU + ctx.rng.range(-0.16, 0.16);
    spawnProj(ctx.world, (pr) => {
      pr.behavior = Behavior.Linear;
      pr.x = pr.px = ctx.p.x;
      pr.y = pr.py = ctx.p.y;
      pr.vx = Math.cos(ang) * speed;
      pr.vy = Math.sin(ang) * speed;
      pr.radius = 7;
      pr.damage = ctx.dmg;
      pr.life = pr.maxLife = 1.5;
      pr.pierce = 1;
      pr.srcId = ctx.srcId + k;
      pr.critChance = ctx.critChance;
      pr.critMult = ctx.critMult;
      pr.rot = ang + Math.PI / 2;
      pr.spriteKey = Tex.Shard;
    });
  }
}

// ——————————————————— 6. 贯穿光束 ———————————————————
function fireBeam(d: WeaponDef, ctx: FireCtx): void {
  const i = lv(ctx.level);
  const len = d.a[i];
  const pierce = d.b[i] + ctx.projBonus;
  const target = nearestEnemy(ctx.world, ctx.p.x, ctx.p.y, 700);
  const baseAng = target
    ? Math.atan2(target.y - ctx.p.y, target.x - ctx.p.x)
    : ctx.p.face > 0
      ? 0
      : Math.PI;
  // 进化「苍穹裂光」：双向光柱
  const shots = d.isEvolved ? 2 : 1;
  for (let s = 0; s < shots; s++) {
    const ang = baseAng + s * Math.PI;
    spawnProj(ctx.world, (pr) => {
      pr.behavior = Behavior.Beam;
      pr.x = pr.px = ctx.p.x;
      pr.y = pr.py = ctx.p.y;
      pr.angle = ang;
      pr.length = len;
      pr.width = 30;
      pr.radius = len * 0.5;
      pr.damage = ctx.dmg;
      pr.life = pr.maxLife = 0.24;
      pr.pierce = pierce;
      pr.srcId = ctx.srcId + s;
      pr.critChance = ctx.critChance;
      pr.critMult = ctx.critMult;
      pr.spriteKey = Tex.Beam;
    });
  }
}

// ——————————————————— 7. 霜噬领域 ———————————————————
function fireFrost(d: WeaponDef, ctx: FireCtx): void {
  const i = lv(ctx.level);
  const radius = d.a[i];
  const dur = d.b[i];
  spawnProj(ctx.world, (pr) => {
    pr.behavior = Behavior.Field;
    pr.x = pr.px = ctx.p.x;
    pr.y = pr.py = ctx.p.y;
    pr.radius = radius;
    pr.damage = ctx.dmg;
    pr.dotDps = ctx.dmg;
    pr.slowF = 0.6;
    pr.life = pr.maxLife = dur;
    pr.pierce = 9999;
    pr.srcId = ctx.srcId;
    pr.critChance = 0; // 持续伤害不暴击，避免数值爆炸
    pr.follow = d.isEvolved ? 1 : 0;
    pr.spriteKey = Tex.Frost;
    pr.scale = radius / 90;
    pr.rotSpeed = 0.5;
  });
}

const LV12 = 12;

export const WEAPONS: readonly WeaponDef[] = [
  {
    id: 'rift',
    name: '裂地印记',
    en: 'Rift Mark',
    desc: '撕裂最近敌人脚下的大地，短暂延迟后爆发；每处 12 点基础伤害，可标记多名敌人。',
    enDesc: 'Tears the earth under nearby enemies, erupting after a short delay for 12 base damage per mark. Can mark several foes at once.',
    icon: Tex.IconRift,
    maxLevel: LV12,
    cd: [2.4, 2.27, 2.14, 2.03, 1.92, 1.82, 1.73, 1.63, 1.53, 1.44, 1.35, 1.25],
    dmg: [12, 14, 17, 20, 23, 27, 31, 35, 41, 47, 55, 62],
    a: [56, 58, 62, 65, 68, 71, 75, 79, 85, 91, 97, 104],
    b: [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 5],
    aName: '爆发半径',
    bName: '印记数量',
    fire: fireRift,
    evolveWith: 'crit',
    evolved: 'rift_abyss',
  },
  {
    id: 'halo',
    name: '圣环',
    en: 'Halo Ward',
    desc: '光球环绕身边旋转，灼烧并轻微击退靠近的敌人；每次接触造成 8 点伤害。',
    enDesc: 'Orbs orbit around you, searing and lightly knocking back approaching foes; each contact deals 8 damage.',
    icon: Tex.IconHalo,
    maxLevel: LV12,
    persistent: true,
    cd: [999],
    dmg: [8, 10, 11, 13, 15, 16, 20, 22, 25, 29, 33, 38],
    a: [1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 4, 6],
    b: [70, 72, 75, 78, 81, 85, 89, 93, 97, 103, 109, 116],
    aName: '光球数量',
    bName: '环绕半径',
    fire: fireHalo,
    evolveWith: 'armor',
    evolved: 'halo_twin',
  },
  {
    id: 'seeker',
    name: '追猎印记',
    en: 'Seeker Sigil',
    desc: '自动锁定最近的敌人，射出追踪符文追击；每发造成 10 点基础伤害。',
    enDesc: 'Auto-locks the nearest enemy and fires homing runes in pursuit; each bolt deals 10 base damage.',
    icon: Tex.IconSeeker,
    maxLevel: LV12,
    cd: [1.6, 1.53, 1.47, 1.41, 1.35, 1.28, 1.22, 1.15, 1.09, 1.03, 0.97, 0.9],
    dmg: [10, 12, 14, 16, 18, 21, 24, 27, 31, 36, 41, 48],
    a: [1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 5],
    b: [300, 310, 319, 328, 338, 348, 357, 367, 378, 389, 402, 415],
    aName: '符文数量',
    bName: '飞行速度',
    fire: fireSeeker,
    evolveWith: 'rage',
    evolved: 'seeker_chain',
  },
  {
    id: 'shock',
    name: '震击波',
    en: 'Shockwave',
    desc: '以自身为中心炸开冲击波并强力击退敌人；每次命中造成 18 点伤害。',
    enDesc: 'Blasts a shockwave from your position with strong knockback; each hit deals 18 damage.',
    icon: Tex.IconShock,
    maxLevel: LV12,
    cd: [3.2, 3.07, 2.94, 2.82, 2.69, 2.57, 2.43, 2.31, 2.18, 2.06, 1.93, 1.8],
    dmg: [18, 20, 24, 27, 30, 34, 39, 43, 49, 55, 63, 72],
    a: [110, 117, 124, 131, 139, 147, 156, 164, 174, 185, 197, 210],
    b: [260, 273, 286, 298, 311, 323, 337, 349, 362, 376, 395, 420],
    aName: '爆发半径',
    bName: '击退力度',
    fire: fireShock,
    evolveWith: 'haste',
    evolved: 'shock_instant',
  },
  {
    id: 'shard',
    name: '碎星弹',
    en: 'Shard Volley',
    desc: '向四周散射星屑弹幕，专治成群的敌人；每颗造成 10 点基础伤害。',
    enDesc: 'Scatters star-shard projectiles in all directions, shredding crowds; each shard deals 10 base damage.',
    icon: Tex.IconShard,
    maxLevel: LV12,
    cd: [0.55, 0.52, 0.49, 0.47, 0.44, 0.42, 0.38, 0.36, 0.33, 0.31, 0.28, 0.26],
    // 单发伤害整体抬升：Lv1 单颗即可一发秒亡魂(9 HP)
    dmg: [10, 11, 12, 13, 14, 15, 17, 18, 20, 22, 25, 27],
    a: [2, 3, 3, 3, 3, 4, 4, 5, 5, 5, 6, 8],
    b: [400, 413, 426, 438, 451, 463, 477, 489, 502, 516, 535, 560],
    aName: '碎片数量',
    bName: '飞行速度',
    fire: fireShard,
    evolveWith: 'boots',
    evolved: 'shard_rain',
  },
  {
    id: 'beam',
    name: '贯穿光束',
    en: 'Piercing Beam',
    desc: '朝最近的敌人射出一道贯穿光柱，扫过沿途所有敌人；每道 16 点基础伤害。',
    enDesc: 'Fires a piercing beam toward the nearest enemy, cutting through everything along its path; each beam deals 16 base damage.',
    icon: Tex.IconBeam,
    maxLevel: LV12,
    cd: [2.6, 2.47, 2.34, 2.22, 2.09, 1.97, 1.88, 1.78, 1.68, 1.59, 1.5, 1.4],
    dmg: [16, 18, 22, 25, 28, 32, 37, 41, 47, 53, 61, 70],
    a: [300, 319, 338, 357, 376, 395, 415, 434, 453, 474, 502, 540],
    b: [3, 4, 5, 5, 5, 6, 7, 8, 9, 11, 12, 14],
    aName: '光柱长度',
    bName: '最大穿透',
    fire: fireBeam,
    evolveWith: 'mirror',
    evolved: 'beam_twin',
  },
  {
    id: 'frost',
    name: '霜噬领域',
    en: 'Frost Field',
    desc: '在原地凝出寒霜领域，减速闯入的敌人并持续侵蚀，每秒约 6 点伤害。',
    enDesc: 'Conjures a frost field that slows and continuously erodes enemies within, about 6 damage per second.',
    icon: Tex.IconFrost,
    maxLevel: LV12,
    cd: [4.5, 4.31, 4.16, 4, 3.84, 3.65, 3.45, 3.26, 3.07, 2.88, 2.69, 2.5],
    dmg: [6, 8, 9, 10, 12, 13, 16, 18, 21, 23, 27, 31],
    a: [90, 95, 100, 105, 111, 118, 124, 132, 139, 147, 157, 168],
    b: [2.5, 2.63, 2.76, 2.9, 3.06, 3.23, 3.37, 3.54, 3.73, 3.93, 4.18, 4.5],
    aName: '领域半径',
    bName: '持续秒数',
    fire: fireFrost,
    evolveWith: 'wisdom',
    evolved: 'frost_follow',
  },
];

/**
 * 由基础武器派生进化形态：以「满级 Lv12 行」为数值锚点 × 进化系数，再替换开火逻辑。
 * 进化是终局质变（单层，maxLevel=1），因此数值绝不能低于满级基础，
 * 否则等于没收玩家已投入的升级；机制强的形态（必暴/溅射/双向…）数值系数会适当下调。
 */
function derive(
  base: WeaponDef,
  over: Partial<WeaponDef> & { id: string; name: string; en: string },
  mul: { dmg?: number; cd?: number; a?: number; b?: number },
): WeaponDef {
  // 取基础武器满级行的数值（进化开火时 level=1，只用数组第 0 项）
  const top = (arr: number[]): number => arr[arr.length - 1];
  return {
    ...base,
    ...over,
    isEvolved: true,
    evolveWith: undefined,
    evolved: undefined,
    maxLevel: 1,
    cd: mul.cd ? [top(base.cd) * mul.cd] : [999],
    dmg: [top(base.dmg) * (mul.dmg ?? 1)],
    a: [top(base.a) * (mul.a ?? 1)],
    b: [top(base.b) * (mul.b ?? 1)],
  };
}

export const EVOLVED: readonly WeaponDef[] = [
  derive(
    WEAPONS[0],
    {
      id: 'rift_abyss',
      name: '深渊裂隙',
      en: 'Abyssal Rift',
      desc: '进化·裂地：印记更大更频繁且必定暴击；单次基础约 45 点伤害。',
      enDesc: 'Evolved Rift: marks are larger, more frequent, and always critical; about 45 base damage per mark.',
      icon: Tex.IconRift,
    },
    // 机制「必定暴击」≈ 稳定 ×1.5~2.75 伤害，故单发伤害适当下调补偿
    { dmg: 0.72, a: 1.15, b: 1, cd: 0.9 },
  ),
  derive(
    WEAPONS[1],
    {
      id: 'halo_twin',
      name: '双生圣环',
      en: 'Twin Halo',
      desc: '进化·圣环：内外两圈光球反向环绕，范围与伤害大增；每次接触约 44 点伤害。',
      enDesc: 'Evolved Halo: inner and outer rings of orbs spin in opposite directions, with far greater reach and damage; about 44 damage per contact.',
      icon: Tex.IconHalo,
    },
    // 机制「双圈反向」不改变光球数量，伤害与环绕半径小幅提升即可
    { dmg: 1.15, a: 1, b: 1.1 },
  ),
  derive(
    WEAPONS[2],
    {
      id: 'seeker_chain',
      name: '猎杀连锁',
      en: 'Hunting Chain',
      desc: '进化·追猎：符文命中后引爆，对周围敌人造成溅射；本体每发约 43 点伤害。',
      enDesc: 'Evolved Seeker: runes explode on impact, splashing nearby enemies; about 43 base damage per bolt.',
      icon: Tex.IconSeeker,
    },
    // 机制「每发命中都溅射 82」补群伤，单体伤害略微下调补偿
    { dmg: 0.9, a: 1, b: 1.15, cd: 0.85 },
  ),
  derive(
    WEAPONS[3],
    {
      id: 'shock_instant',
      name: '瞬息震荡',
      en: 'Instant Quake',
      desc: '进化·震击：冷却大幅缩短，范围与击退更强；每发约 61 点伤害。',
      enDesc: 'Evolved Shockwave: cooldown greatly reduced with stronger range and knockback; about 61 damage per blast.',
      icon: Tex.IconShock,
    },
    // 机制「高频震波」靠 CD ×0.7 实现，单发伤害略降保持总 DPS 略高于满级
    { dmg: 0.85, a: 1.1, b: 1.1, cd: 0.7 },
  ),
  derive(
    WEAPONS[4],
    {
      id: 'shard_rain',
      name: '星陨暴雨',
      en: 'Starfall Rain',
      desc: '进化·碎星：单轮散射弹数与射速大增，清潮更猛；每颗约 20 点伤害。',
      enDesc: 'Evolved Shards: far more shards per volley and faster fire rate, shredding hordes; about 20 damage per shard.',
      icon: Tex.IconShard,
    },
    // 弹幕数量 ×1.5 + 射速提升，单发略降补偿，清潮总量更高
    { dmg: 0.75, a: 1.5, b: 1, cd: 0.9 },
  ),
  derive(
    WEAPONS[5],
    {
      id: 'beam_twin',
      name: '苍穹裂光',
      en: 'Fissure of the Sky',
      desc: '进化·光束：同时射出双向贯穿光柱，更长更透；每道约 60 点伤害。',
      enDesc: 'Evolved Beam: fires twin piercing beams in both directions, longer and more penetrative; about 60 damage per beam.',
      icon: Tex.IconBeam,
    },
    // 机制「双向光柱」= 覆盖翻倍，单条光束伤害略降补偿
    { dmg: 0.85, a: 1.2, b: 1.2, cd: 0.85 },
  ),
  derive(
    WEAPONS[6],
    {
      id: 'frost_follow',
      name: '寒霜随行',
      en: 'Following Frost',
      desc: '进化·霜噬：领域跟随自身移动，持续减速侵蚀沿途敌人；每秒约 37 点伤害。',
      enDesc: 'Evolved Frost: the field follows you, slowing and eroding enemies along your path; about 37 damage per second.',
      icon: Tex.IconFrost,
    },
    // 跟随机制让领域持续覆盖移动路径，范围/时长/伤害小幅提升
    { dmg: 1.2, a: 1.15, b: 1.1, cd: 0.85 },
  ),
];

export const ALL_WEAPONS: readonly WeaponDef[] = [...WEAPONS, ...EVOLVED];
export const WEAPON_BY_ID: Record<string, WeaponDef> = Object.fromEntries(
  ALL_WEAPONS.map((w) => [w.id, w]),
);

/** 升级池中出现的武器（不含进化形态） */
export const POOL_WEAPONS: readonly WeaponDef[] = WEAPONS;
