/** 宠物系统：纯数据 + 纯函数。改数值只需动这张表，UI 与局内战斗共用。 */

export type PetRarity = 'common' | 'rare' | 'legend';

export const RARITY_LABEL: Record<PetRarity, string> = {
  common: '普通',
  rare: '稀有',
  legend: '传说',
};

/** 稀有度英文标签 */
export const RARITY_LABEL_EN: Record<PetRarity, string> = {
  common: 'Common',
  rare: 'Rare',
  legend: 'Legendary',
};

/** 抽奖内部概率（在 20% 的「出宠物」份额内再按稀有度分层；单抽总出宠物 = 20%） */
export const RARITY_CHANCE: Record<PetRarity, number> = {
  common: 0.19, // 普通 19%（6 只平分 → 每只约 3.17%）
  rare: 0.0091, // 稀有 0.91%（4 只平分 → 每只约 0.23%）
  legend: 0.0009, // 传说 0.09%（2 只平分 → 每只约 0.045%）
};

export interface PetDef {
  id: string;
  name: string;
  /** 英文名（缺省回退中文） */
  en?: string;
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
  { id: 'soulbat', name: '噬魂蝠', en: 'Soulbat', rarity: 'common', hue: 258, bodyKind: 2, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'rustbug', name: '锈壳虫', en: 'Rustbug', rarity: 'common', hue: 24, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'bonehound', name: '骨堆犬', en: 'Bonehound', rarity: 'common', hue: 205, bodyKind: 1, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'paperlamp', name: '纸灯灵', en: 'Paperlamp', rarity: 'common', hue: 45, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'mistfrog', name: '雾蛙', en: 'Mistfrog', rarity: 'common', hue: 268, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  { id: 'sproutling', name: '腐芽精', en: 'Sproutling', rarity: 'common', hue: 132, bodyKind: 0, baseVol: 6, baseHp: 20, baseDmg: 3 },
  // ——— 稀有（基础 体积8 / 血35 / 伤5）———
  { id: 'abysshound', name: '深渊猎犬', en: 'Abysshound', rarity: 'rare', hue: 252, bodyKind: 1, baseVol: 8, baseHp: 35, baseDmg: 5 },
  { id: 'crystalcoot', name: '晶甲龟', en: 'Crystalcoot', rarity: 'rare', hue: 198, bodyKind: 0, baseVol: 8, baseHp: 35, baseDmg: 5 },
  { id: 'glowmoth', name: '噬光蝶', en: 'Glowmoth', rarity: 'rare', hue: 282, bodyKind: 2, baseVol: 8, baseHp: 35, baseDmg: 5 },
  { id: 'frostcat', name: '霜魇猫', en: 'Frostcat', rarity: 'rare', hue: 202, bodyKind: 1, baseVol: 8, baseHp: 35, baseDmg: 5 },
  // ——— 传说（基础 体积10 / 血60 / 伤8）———
  { id: 'drake', name: '幽域龙裔', en: 'Netherdrake', rarity: 'legend', hue: 262, bodyKind: 1, baseVol: 10, baseHp: 60, baseDmg: 8 },
  { id: 'stareye', name: '星噬之眼', en: 'Stareye', rarity: 'legend', hue: 356, bodyKind: 0, baseVol: 10, baseHp: 60, baseDmg: 8 },
  // ——— 基础赠送宠（绿色圆球，普通宠物一半属性，只可领取一次，不进抽奖/兑换池）———
  { id: 'budling', name: '翠芽团子', en: 'Budling', rarity: 'common', hue: 128, bodyKind: 0, baseVol: 3, baseHp: 10, baseDmg: 1.5, free: true },
];

export const PET_BY_ID: Record<string, PetDef> = Object.fromEntries(PETS.map((p) => [p.id, p]));

/** 抽奖 / 碎片兑换使用的宠物池（不含免费赠送宠） */
export const GACHA_PETS: readonly PetDef[] = PETS.filter((p) => !p.free);
/** 免费基础宠物定义 */
export const FREE_PET: PetDef = PET_BY_ID['budling'];

/** 碎片商店中把传说排在前面方便辨识（实际列表仍按稀有度排序） */
export const RARITY_RANK: Record<PetRarity, number> = { common: 0, rare: 1, legend: 2 };

// ——————————————————— 抽奖 ———————————————————
/** 每抽 80% 出宠物粮食，20% 出宠物 */
export const GACHA_FOOD_CHANCE = 0.8;
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
 * 概率：80% 出粮袋（数量 1/5/10/20/50/100 按权重）；20% 出宠物，
 * 宠物内再按 RARITY_CHANCE 分层（普通 19% / 稀有 0.91% / 传说 0.09%）、同层内均分。
 */
export function rollGacha(rngNext: () => number): GachaResult {
  const r = rngNext();
  if (r < GACHA_FOOD_CHANCE) return { kind: 'food', count: rollFoodBags(rngNext) };
  // 宠物：在 20% 份额里按稀有度权重二段判定
  const total = RARITY_CHANCE.common + RARITY_CHANCE.rare + RARITY_CHANCE.legend; // =0.2
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
  common: 40,
  rare: 120,
  legend: 400,
};
/** 碎片商店兑换指定宠物的碎片价（变相保底） */
export const PET_SHOP_COST: Record<PetRarity, number> = {
  common: 150,
  rare: 400,
  legend: 1200,
};
/** 1 袋粮的碎片价格 */
export const FOOD_COST_SHARDS = 2;
/** 碎片商店整包特惠：100 碎片换 60 袋粮 */
export const FOOD_BULK_COUNT = 60;
export const FOOD_BULK_COST = 100;

// ——————————————————— 宠物远征：招牌技能 ———————————————————
import type { SaveData } from '../save/Storage';

export type SkillKind = 'beam' | 'nova' | 'heal' | 'dash';
export interface PetSkill {
  id: string;
  name: string;
  /** 英文技能名（缺省回退中文） */
  en?: string;
  kind: SkillKind;
  /** 冷却（秒） */
  cd: number;
  /** 技能伤害 = 英雄当前伤害 × dmgMul × (1 + 0.25 × 技能等级) */
  dmgMul: number;
  /** 作用半径（beam 为射线长度）；heal 类忽略 */
  radius: number;
  /** heal 类：恢复量占英雄最大生命比例 */
  heal?: number;
  /** dash 类：命中击退强度（像素/秒） */
  knock?: number;
}

/** 每只宠物的招牌技能（按 petId 查表；缺失时回退默认新星） */
const PET_SKILLS: Record<string, PetSkill> = {
  // ——— 普通 ———
  soulbat:   { id: 'soulbat',   name: '魂能爆发', en: 'Soul Nova', kind: 'nova', cd: 5, dmgMul: 4, radius: 140 },
  rustbug:   { id: 'rustbug',   name: '铁壳冲撞', en: 'Iron Ram', kind: 'dash', cd: 6, dmgMul: 3, radius: 200, knock: 260 },
  bonehound: { id: 'bonehound', name: '裂骨飞扑', en: 'Bone Pounce', kind: 'dash', cd: 6, dmgMul: 3, radius: 200, knock: 260 },
  paperlamp: { id: 'paperlamp', name: '灯焰新星', en: 'Lantern Nova', kind: 'nova', cd: 5, dmgMul: 4, radius: 140 },
  mistfrog:  { id: 'mistfrog',  name: '雾爆',     en: 'Mist Burst', kind: 'nova', cd: 5, dmgMul: 4, radius: 140 },
  sproutling:{ id: 'sproutling',name: '荆棘新星', en: 'Thorn Nova', kind: 'nova', cd: 5, dmgMul: 4, radius: 140 },
  // ——— 稀有 ———
  abysshound:{ id: 'abysshound',name: '深渊吐息', en: 'Abyssal Breath', kind: 'beam', cd: 4, dmgMul: 5, radius: 540 },
  crystalcoot:{ id: 'crystalcoot',name: '晶盾回响', en: 'Crystal Echo', kind: 'heal', cd: 7, dmgMul: 2, radius: 0, heal: 0.5 },
  glowmoth:  { id: 'glowmoth',  name: '噬光射线', en: 'Lightdevour Ray', kind: 'beam', cd: 4, dmgMul: 5, radius: 540 },
  frostcat:  { id: 'frostcat',  name: '霜刃突袭', en: 'Frostblade Rush', kind: 'dash', cd: 6, dmgMul: 3, radius: 200, knock: 260 },
  // ——— 传说 ———
  drake:     { id: 'drake',     name: '龙息焚天', en: 'Dragonbreath', kind: 'beam', cd: 4, dmgMul: 5, radius: 560 },
  stareye:   { id: 'stareye',   name: '星噬湮灭', en: 'Star Annihilation', kind: 'nova', cd: 5, dmgMul: 5, radius: 170 },
  // ——— 免费基础宠 ———
  budling:   { id: 'budling',   name: '翠芽治愈', en: 'Sprout Heal', kind: 'heal', cd: 7, dmgMul: 2, radius: 0, heal: 0.5 },
};

/** 取宠物招牌技能（缺失回退默认新星） */
export function skillFor(def: PetDef): PetSkill {
  return (
    PET_SKILLS[def.id] ?? { id: def.id, name: '新星', en: 'Nova', kind: 'nova', cd: 5, dmgMul: 4, radius: 140 }
  );
}

/** 招牌技能的效果说明文案（营地面板展示用，只读技能静态配置；不列倍率数字） */
export function skillEffectText(sk: PetSkill): string {
  return skillEffectTextFor(sk, false);
}

/** 招牌技能效果说明（英文） */
export function skillEffectTextEn(sk: PetSkill): string {
  return skillEffectTextFor(sk, true);
}

function skillEffectTextFor(sk: PetSkill, en: boolean): string {
  const cd = en ? `CD ${sk.cd}s` : `CD ${sk.cd} 秒`;
  const lvl = en ? '+25% damage per level' : '每级 +25% 伤害';
  switch (sk.kind) {
    case 'nova':
      return en
        ? `AoE burst: damages enemies within ${sk.radius} range · ${cd} · ${lvl}`
        : `范围爆发：对半径 ${sk.radius} 内敌人造成伤害 · ${cd} · ${lvl}`;
    case 'beam':
      return en
        ? `Horizontal beam: pierces enemies over ${sk.radius} range · ${cd} · ${lvl}`
        : `水平光束：贯穿前方 ${sk.radius} 射程内敌人 · ${cd} · ${lvl}`;
    case 'dash':
      return en
        ? `Dash forward: damages and knocks back enemies within ${sk.radius} · ${cd} · ${lvl}`
        : `向前冲击：对半径 ${sk.radius} 内敌人造成伤害并击退 · ${cd} · ${lvl}`;
    case 'heal':
      return en
        ? `Heal: instantly restores ${Math.round((sk.heal ?? 0) * 100)}% of max HP · ${cd} · +25% healing per level`
        : `治疗：立即回复最大生命的 ${Math.round((sk.heal ?? 0) * 100)}% · ${cd} · 每级 +25% 回复`;
  }
}

/** 读取某宠物当前的远征技能等级（缺省 0） */
export function skillLevel(save: SaveData, petId: string): number {
  return save.petSkillLevels[petId] ?? 0;
}

/** 技能升到下一级所需星币：20 × (当前等级 + 1)（Lv0→1 花 20，Lv1→2 花 40…） */
export function skillUpgradeCost(level: number): number {
  return 20 * (level + 1);
}

/**
 * 拥有的宠物列表排序：稀有度从高到低（传说 → 稀有 → 普通），
 * 同稀有度按等级从高到低，其余保持原有先后顺序。
 */
export function sortOwnedPets(ids: readonly string[], levels: Record<string, number>): string[] {
  return [...ids]
    .map((id, i) => ({ id, i }))
    .sort((a, b) => {
      const da = PET_BY_ID[a.id];
      const db = PET_BY_ID[b.id];
      if (!da || !db) return a.i - b.i;
      if (RARITY_RANK[db.rarity] !== RARITY_RANK[da.rarity]) {
        return RARITY_RANK[db.rarity] - RARITY_RANK[da.rarity];
      }
      const la = levels[a.id] ?? 1;
      const lb = levels[b.id] ?? 1;
      if (lb !== la) return lb - la;
      return a.i - b.i;
    })
    .map((x) => x.id);
}
