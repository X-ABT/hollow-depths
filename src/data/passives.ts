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

const LV7 = 7;

/** 各被动 Lv1→Lv7 的累计数值表（满级总效果 = 原 5 级满级；护心甲每级 +1 属小幅加强） */
const HASTE = [8, 16, 25, 33, 42, 51, 60]; // 攻速 %，满级 +60
const BOOTS = [6, 12, 18, 24, 30, 35, 40]; // 移速 %，满级 +40
const MIRROR = [0, 1, 1, 2, 2, 3, 5]; // 投射物，满级 +5（Lv2/4/6 各 +1，Lv7 直接 +2）
const RAGE = [7, 14, 21, 28, 35, 43, 50]; // 伤害 %，满级 +50
const LIFE_HP = [14, 28, 42, 57, 71, 86, 100]; // 生命上限，满级 +100
const LIFE_REG = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.1]; // 每秒回复，满级 2.1
const WISDOM = [6, 12, 18, 24, 30, 35, 40]; // 经验 %，满级 +40
const CRIT_RATE = [4, 8, 12, 15, 19, 22, 25]; // 暴击率 %，满级 +25
const CRIT_MULT = [18, 36, 54, 71, 89, 107, 125]; // 暴击伤害 %，满级 +125

export const PASSIVES: readonly PassiveDef[] = [
  {
    id: 'haste',
    name: '疾风符',
    en: 'Rune of Haste',
    icon: Tex.IconHaste,
    maxLevel: LV7,
    desc: '缩短所有武器的冷却。',
    enDesc: 'Shortens the cooldown of all weapons.',
    lvlText: (lv) => `攻击速度 +${HASTE[lv - 1]}%`,
    enLvlText: (lv) => `Attack Speed +${HASTE[lv - 1]}%`,
    apply: (s, lv) => {
      s.fireRateMul += HASTE[lv - 1] / 100;
    },
  },
  {
    id: 'boots',
    name: '轻履靴',
    en: 'Feather Boots',
    icon: Tex.IconBoots,
    maxLevel: LV7,
    desc: '提升移动速度，走位更从容。',
    enDesc: 'Increases movement speed for easier dodging.',
    lvlText: (lv) => `移动速度 +${BOOTS[lv - 1]}%`,
    enLvlText: (lv) => `Move Speed +${BOOTS[lv - 1]}%`,
    apply: (s, lv) => {
      s.speed *= 1 + BOOTS[lv - 1] / 100;
    },
  },
  {
    id: 'mirror',
    name: '双面镜',
    en: 'Twin Mirror',
    icon: Tex.IconMirror,
    maxLevel: LV7,
    desc: '强化每次攻击：额外多射一枚投射物，光束则贯穿更深。',
    enDesc: 'Empowers each attack: fire one extra projectile, and beams pierce deeper.',
    lvlText: (lv) => {
      const n = MIRROR[lv - 1];
      return n > 0 ? `投射物数量 +${n}` : '双面镜尚未生效（Lv2/4/6 各 +1，Lv7 直接 +2）';
    },
    enLvlText: (lv) => {
      const n = MIRROR[lv - 1];
      return n > 0 ? `Projectiles +${n}` : 'No effect yet (Lv2/4/6 +1 each, Lv7 +2)';
    },
    apply: (s, lv) => {
      s.projBonus += MIRROR[lv - 1];
    },
  },
  {
    id: 'rage',
    name: '狂怒石',
    en: 'Rage Stone',
    icon: Tex.IconRage,
    maxLevel: LV7,
    desc: '提升全部伤害。',
    enDesc: 'Increases all damage dealt.',
    lvlText: (lv) => `伤害 +${RAGE[lv - 1]}%`,
    enLvlText: (lv) => `Damage +${RAGE[lv - 1]}%`,
    apply: (s, lv) => {
      s.damageMul += RAGE[lv - 1] / 100;
    },
  },
  {
    id: 'life',
    name: '生命符',
    en: 'Sigil of Life',
    icon: Tex.IconLife,
    maxLevel: LV7,
    desc: '提高生命上限并持续回复。',
    enDesc: 'Raises max HP and regenerates over time.',
    lvlText: (lv) => `生命上限 +${LIFE_HP[lv - 1]}，每秒回复 ${LIFE_REG[lv - 1].toFixed(1)}`,
    enLvlText: (lv) => `Max HP +${LIFE_HP[lv - 1]}, Regen ${LIFE_REG[lv - 1].toFixed(1)}/s`,
    apply: (s, lv) => {
      s.maxHp += LIFE_HP[lv - 1];
      s.regen += LIFE_REG[lv - 1];
    },
  },
  {
    id: 'armor',
    name: '护心甲',
    en: 'Heartguard',
    icon: Tex.IconArmor,
    maxLevel: LV7,
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
    maxLevel: LV7,
    desc: '提升获得的经验。',
    enDesc: 'Increases experience gained.',
    lvlText: (lv) => `经验获取 +${WISDOM[lv - 1]}%`,
    enLvlText: (lv) => `XP Gain +${WISDOM[lv - 1]}%`,
    apply: (s, lv) => {
      s.xpMul += WISDOM[lv - 1] / 100;
    },
  },
  {
    id: 'crit',
    name: '锐锋石',
    en: 'Keen Edge',
    icon: Tex.IconCrit,
    maxLevel: LV7,
    desc: '提升暴击率与暴击伤害。',
    enDesc: 'Increases critical chance and critical damage.',
    lvlText: (lv) => `暴击率 +${CRIT_RATE[lv - 1]}%，暴击伤害 +${CRIT_MULT[lv - 1]}%`,
    enLvlText: (lv) => `Crit Rate +${CRIT_RATE[lv - 1]}%, Crit Damage +${CRIT_MULT[lv - 1]}%`,
    apply: (s, lv) => {
      s.critChance += CRIT_RATE[lv - 1] / 100;
      s.critMult += CRIT_MULT[lv - 1] / 100;
    },
  },
];

export const PASSIVE_BY_ID: Record<string, PassiveDef> = Object.fromEntries(
  PASSIVES.map((p) => [p.id, p]),
);
