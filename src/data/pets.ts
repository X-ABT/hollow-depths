/** 宠物系统：纯数据 + 纯函数。改数值只需动这张表，UI 与局内战斗共用。 */

export type PetRarity = 'common' | 'rare' | 'legend';

export const RARITY_LABEL: Record<PetRarity, string> = {
  common: '普通',
  rare: '稀有',
  legend: '传说',
};

/** 抽奖内部概率（在 10% 的「出宠物」份额内再按稀有度分层；单抽总出宠物 = 10%） */
export const RARITY_CHANCE: Record<PetRarity, number> = {
  common: 0.095, // 普通 9.5%（6 只平分 → 每只约 1.58%）
  rare: 0.0049, // 稀有 0.49%（4 只平分 → 每只约 0.12%）
  legend: 0.0001, // 传说 0.01%（2 只平分 → 每只约 0.005%）
};

export interface PetDef {
  id: string;
  name: string;
  rarity: PetRarity;
  /** 程序绘制外观主色相（0-360），配合 bodyKind 区分 13 只 */
  hue: number;
  /** 体型族：0 团身系（圆身） / 1 兽系（四足/兽形） / 2 飞翼系（带翅） */
  bodyKind: number;
  /** 基础体积（面板起点；传说更高显得更庞大） */
  baseVol: number;
  /** 基础血量 */
  baseHp: number;
  /** 基础伤害（每口撕咬的基础值） */
  baseDmg: number;
  /** true = 基础赠送宠物（只可领取一次，不进入抽奖池/兑换池） */
  free?: boolean;
}

/** 每级体积成长幅度：稀有度越高长得越快（普通/稀有/传说 = 1 / 1.5 / 2） */
export const VOL_GROWTH: Record<PetRarity, number> = {
  common: 1,
  rare: 1.5,
  legend: 2,
};

export const PETS: readonly PetDef[] = [
  // ——— 普通（基础 体积6 / 血20 / 伤3）———
  { id: 'soulbat', name: '噬魂蝠', rarity: 'common', hue: 258, bodyKind: 2, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'rustbug', name: '锈壳虫', rarity: 'common', hue: 24, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'bonehound', name: '骨堆犬', rarity: 'common', hue: 205, bodyKind: 1, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'paperlamp', name: '纸灯灵', rarity: 'common', hue: 45, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'mistfrog', name: '雾蛙', rarity: 'common', hue: 268, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'sproutling', name: '腐芽精', rarity: 'common', hue: 132, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  // ——— 稀有（基础 体积8 / 血35 / 伤5）———
  { id: 'abysshound', name: '深渊猎犬', rarity: 'rare', hue: 252, bodyKind: 1, baseVol: 8, baseHp: 35, baseDmg: 5 },
  { id: 'crystalcoot', name: '晶甲龟', rarity: 'rare', hue: 198, bodyKind: 0, baseVol: 8, baseHp: 35, baseDmg: 5 },
  { id: 'glowmoth', name: '噬光蝶', rarity: 'rare', hue: 282, bodyKind: 2, baseVol: 8, baseHp: 35, baseDmg: 5 },
  { id: 'frostcat', name: '霜魇猫', rarity: 'rare', hue: 202, bodyKind: 1, baseVol: 8, baseHp: 35, baseDmg: 5 },
  // ——— 传说（基础 体积10 / 血60 / 伤8）———
  { id: 'drake', name: '幽域龙裔', rarity: 'legend', hue: 262, bodyKind: 1, baseVol: 10, baseHp: 60, baseDmg: 8 },
  { id: 'stareye', name: '星噬之眼', rarity: 'legend', hue: 356, bodyKind: 0, baseVol: 10, baseHp: 60, baseDmg: 8 },
  // ——— 基础赠送宠（绿色圆球，普通宠物一半属性，只可领取一次，不进抽奖/兑换池）———
  { id: 'budling', name: '翠芽团子', rarity: 'common', hue: 128, bodyKind: 0, baseVol: 3, baseHp: 10, baseDmg: 1.5, free: true },
];

export const PET_BY_ID: Record<string, PetDef> = Object.fromEntries(PETS.map((p) => [p.id, p]));

/** 抽奖 / 碎片兑换使用的宠物池（不含免费赠送宠） */
export const GACHA_PETS: readonly PetDef[] = PETS.filter((p) => !p.free);
/** 免费基础宠物定义 */
export const FREE_PET: PetDef = PET_BY_ID['budling'];

/** 碎片商店中把传说排在前面方便辨识（实际列表仍按稀有度排序） */
export const RARITY_RANK: Record<PetRarity, number> = { common: 0, rare: 1, legend: 2 };

// ——————————————————— 抽奖 ———————————————————
/** 每抽 90% 出宠物粮食，10% 出宠物 */
export const GACHA_FOOD_CHANCE = 0.9;
/** 单抽价格（灵魂） */
export const GACHA_SINGLE_COST = 200;
/** 十连价格（灵魂，九折） */
export const GACHA_TEN_COST = 1800;
/** 百连价格（灵魂，八折：200×100×0.8） */
export const GACHA_HUNDRED_COST = 16000;

/** 粮食掉袋数量及其权重（总和 100） */
export const FOOD_BAGS: readonly { count: number; weight: number }[] = [
  { count: 1, weight: 54 },
  { count: 5, weight: 20 },
  { count: 10, weight: 12 },
  { count: 20, weight: 8 },
  { count: 50, weight: 4.6 },
  { count: 100, weight: 1.4 },
];

export interface GachaFood {
  kind: 'food';
  /** 粮袋数量 */
  count: number;
}
export interface GachaPet {
  kind: 'pet';
  pet: PetDef;
}
export type GachaResult = GachaFood | GachaPet;

/** 按权重抽一档粮袋数量 */
function rollFoodBags(rngNext: () => number): number {
  let total = 0;
  for (const f of FOOD_BAGS) total += f.weight;
  let roll = rngNext() * total;
  for (const f of FOOD_BAGS) {
    roll -= f.weight;
    if (roll <= 0) return f.count;
  }
  return FOOD_BAGS[FOOD_BAGS.length - 1].count;
}

/**
 * 单次抽奖纯函数（rngNext() 应返回 0..1 的均匀随机数）。
 * 概率：90% 出粮袋（数量 1/5/10/20/50/100 按权重）；10% 出宠物，
 * 宠物内再按 RARITY_CHANCE 分层（普通 9.5% / 稀有 0.49% / 传说 0.01%）、同层内均分。
 */
export function rollGacha(rngNext: () => number): GachaResult {
  const r = rngNext();
  if (r < GACHA_FOOD_CHANCE) return { kind: 'food', count: rollFoodBags(rngNext) };
  // 宠物：在 10% 份额里按稀有度权重二段判定
  const total = RARITY_CHANCE.common + RARITY_CHANCE.rare + RARITY_CHANCE.legend; // =0.1
  let roll = (r - GACHA_FOOD_CHANCE) / total; // 归一到 0..1
  let rarity: PetRarity = 'common';
  if (roll >= RARITY_CHANCE.common / total) {
    roll -= RARITY_CHANCE.common / total;
    rarity = RARITY_CHANCE.rare / total > roll ? 'rare' : 'legend';
  }
  const pool = GACHA_PETS.filter((p) => p.rarity === rarity);
  const pick = pool[Math.min(pool.length - 1, Math.floor(rngNext() * pool.length))];
  return { kind: 'pet', pet: pick };
}

// ——————————————————— 属性与升级 ———————————————————
/** 当前体积（浮点，随稀有度成长幅度增长；面板展示用） */
export function volFor(def: PetDef, level: number): number {
  return def.baseVol + (level - 1) * VOL_GROWTH[def.rarity];
}
/** 当前血量（每级 +1） */
export function hpFor(def: PetDef, level: number): number {
  return def.baseHp + (level - 1);
}
/** 当前伤害（每级 +1） */
export function dmgFor(def: PetDef, level: number): number {
  return def.baseDmg + (level - 1);
}

/**
 * 局内视觉比例 = 当前体积 / 基础体积（≥1）。
 * 线性连续：每一级都在变大；不同稀有度基础体积不同，视觉起点也不同。
 */
export function visualScale(def: PetDef, level: number): number {
  return volFor(def, level) / def.baseVol;
}

/** 从 Lv → Lv+1 所需的粮袋数（5, 7, 9, 11…） */
export function foodToNext(level: number): number {
  return 5 + (level - 1) * 2;
}

/** 可上阵槽位数：默认 1，拥有 5 / 10 只时解锁第 2 / 3 槽 */
export function petSlotCount(ownedCount: number): number {
  return ownedCount >= 10 ? 3 : ownedCount >= 5 ? 2 : 1;
}

// ——————————————————— 碎片与碎片商店 ———————————————————
/** 重复宠物自动分解所得碎片（按稀有度） */
export const DUP_SHARDS: Record<PetRarity, number> = {
  common: 20,
  rare: 60,
  legend: 200,
};
/** 碎片商店兑换指定宠物的碎片价（变相保底） */
export const PET_SHOP_COST: Record<PetRarity, number> = {
  common: 150,
  rare: 400,
  legend: 1200,
};
/** 1 袋粮的碎片价格 */
export const FOOD_COST_SHARDS = 2;
/** 碎片商店整包特惠：100 碎片换 100 袋粮 */
export const FOOD_BULK_COUNT = 100;
export const FOOD_BULK_COST = 100;
