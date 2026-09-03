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
  /** 当前等级的效果文本 */
  lvlText: (lv: number) => string;
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
    lvlText: (lv) => `攻击速度 +${lv * 12}%`,
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
    lvlText: (lv) => `移动速度 +${lv * 8}%`,
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
    desc: '每次攻击额外生成投射物或分身。',
    lvlText: (lv) => `投射物数量 +${Math.floor((lv + 1) / 2)}`,
    apply: (s, lv) => {
      s.projBonus += Math.floor((lv + 1) / 2);
    },
  },
  {
    id: 'rage',
    name: '狂怒石',
    en: 'Rage Stone',
    icon: Tex.IconRage,
    maxLevel: 5,
    desc: '提升全部伤害。',
    lvlText: (lv) => `伤害 +${lv * 10}%`,
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
    lvlText: (lv) => `生命上限 +${lv * 20}，每秒回复 ${(lv * 0.3).toFixed(1)}`,
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
    lvlText: (lv) => `护甲 +${lv}（每次受击固定减伤）`,
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
    lvlText: (lv) => `经验获取 +${lv * 8}%`,
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
    lvlText: (lv) => `暴击率 +${lv * 5}%，暴击伤害 +${lv * 25}%`,
    apply: (s, lv) => {
      s.critChance += 0.05 * lv;
      s.critMult += 0.25 * lv;
    },
  },
];

export const PASSIVE_BY_ID: Record<string, PassiveDef> = Object.fromEntries(
  PASSIVES.map((p) => [p.id, p]),
);
