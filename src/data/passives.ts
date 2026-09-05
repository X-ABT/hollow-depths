import { Tex } from '../render/TexKeys';

/** 玩家派生属性：每次 build 变化时由 base + 角色 + 全部被动重算 */
export interface Stats {
  speed: number;
  damageMul: number;
  /** 攻速倍率：实际冷却 = 基础冷却 / fireRateMul */
  fireRateMul: number;
  /** 额外投射物数量 */
  projBonus: number;
  xpMul: number;
  critChance: number;
  critMult: number;
  /** 固定减伤（每次受击扣减） */
  armor: number;
  /** 每秒回血 */
  regen: number;
  pickupRange: number;
  maxHp: number;
}

export interface PassiveDef {
  id: string;
  name: string;
  en: string;
  icon: number;
  maxLevel: number;
  /** 一句话说明（不含数值，数值由 lvlText 生成） */
  desc: string;
  /** 英文说明（缺省回退中文 desc） */
  enDesc?: string;
  /** 当前等级的效果文本 */
  lvlText: (lv: number) => string;
  /** 英文版效果文本（缺省回退 lvlText） */
  enLvlText?: (lv: number) => string;
  apply: (s: Stats, lv: number) => void;
}

export const PASSIVES: readonly PassiveDef[] = [
  {
    id: 'haste',
    name: '疾风符',
    en: 'Rune of Haste',
    icon: Tex.IconHaste,
    maxLevel: 5,
    desc: '缩短所有武器的冷却。',
    enDesc: 'Shortens the cooldown of all weapons.',
    lvlText: (lv) => `攻击速度 +${lv * 12}%`,
    enLvlText: (lv) => `Attack Speed +${lv * 12}%`,
    apply: (s, lv) => {
      s.fireRateMul += 0.12 * lv;
    },
  },
  {
    id: 'boots',
    name: '轻履靴',
    en: 'Feather Boots',
    icon: Tex.IconBoots,
    maxLevel: 5,
    desc: '提升移动速度，走位更从容。',
    enDesc: 'Increases movement speed for easier dodging.',
    lvlText: (lv) => `移动速度 +${lv * 8}%`,
    enLvlText: (lv) => `Move Speed +${lv * 8}%`,
    apply: (s, lv) => {
      s.speed *= 1 + 0.08 * lv;
    },
  },
  {
    id: 'mirror',
    name: '双面镜',
    en: 'Twin Mirror',
    icon: Tex.IconMirror,
    maxLevel: 5,
    desc: '强化每次攻击：额外多射一枚投射物，光束则贯穿更深。',
    enDesc: 'Empowers each attack: fire one extra projectile, and beams pierce deeper.',
    lvlText: (lv) => `投射物数量 +${lv}`,
    enLvlText: (lv) => `Projectiles +${lv}`,
    apply: (s, lv) => {
      s.projBonus += lv; // 每级 +1 投射物数量
    },
  },
  {
    id: 'rage',
    name: '狂怒石',
    en: 'Rage Stone',
    icon: Tex.IconRage,
    maxLevel: 5,
    desc: '提升全部伤害。',
    enDesc: 'Increases all damage dealt.',
    lvlText: (lv) => `伤害 +${lv * 10}%`,
    enLvlText: (lv) => `Damage +${lv * 10}%`,
    apply: (s, lv) => {
      s.damageMul += 0.1 * lv;
    },
  },
  {
    id: 'life',
    name: '生命符',
    en: 'Sigil of Life',
    icon: Tex.IconLife,
    maxLevel: 5,
    desc: '提高生命上限并持续回复。',
    enDesc: 'Raises max HP and regenerates over time.',
    lvlText: (lv) => `生命上限 +${lv * 20}，每秒回复 ${(lv * 0.3).toFixed(1)}`,
    enLvlText: (lv) => `Max HP +${lv * 20}, Regen ${(lv * 0.3).toFixed(1)}/s`,
    apply: (s, lv) => {
      s.maxHp += 20 * lv;
      s.regen += 0.3 * lv;
    },
  },
  {
    id: 'armor',
    name: '护心甲',
    en: 'Heartguard',
    icon: Tex.IconArmor,
    maxLevel: 5,
    desc: '每次受击固定减伤。',
    enDesc: 'Blocks a flat amount of damage from each hit.',
    lvlText: (lv) => `护甲 +${lv}（每次受击固定减伤）`,
    enLvlText: (lv) => `Armor +${lv} (flat reduction per hit)`,
    apply: (s, lv) => {
      s.armor += lv;
    },
  },
  {
    id: 'wisdom',
    name: '智慧卷轴',
    en: 'Scroll of Wisdom',
    icon: Tex.IconWisdom,
    maxLevel: 5,
    desc: '提升获得的经验。',
    enDesc: 'Increases experience gained.',
    lvlText: (lv) => `经验获取 +${lv * 8}%`,
    enLvlText: (lv) => `XP Gain +${lv * 8}%`,
    apply: (s, lv) => {
      s.xpMul += 0.08 * lv;
    },
  },
  {
    id: 'crit',
    name: '锐锋石',
    en: 'Keen Edge',
    icon: Tex.IconCrit,
    maxLevel: 5,
    desc: '提升暴击率与暴击伤害。',
    enDesc: 'Increases critical chance and critical damage.',
    lvlText: (lv) => `暴击率 +${lv * 5}%，暴击伤害 +${lv * 25}%`,
    enLvlText: (lv) => `Crit Rate +${lv * 5}%, Crit Damage +${lv * 25}%`,
    apply: (s, lv) => {
      s.critChance += 0.05 * lv;
      s.critMult += 0.25 * lv;
    },
  },
];

export const PASSIVE_BY_ID: Record<string, PassiveDef> = Object.fromEntries(
  PASSIVES.map((p) => [p.id, p]),
);
