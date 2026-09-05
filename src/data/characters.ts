import { Tex } from '../render/TexKeys';

export interface CharacterDef {
  id: string;
  name: string;
  en: string;
  /** 一句话定位 */
  tagline: string;
  /** 英文一句话定位（缺省回退中文） */
  enTagline?: string;
  sprite: number;
  icon: number;
  base: {
    hp: number;
    speed: number;
    pickupRange: number;
    critChance: number;
    critMult: number;
    armor: number;
    regen: number;
  };
  startWeapon: string;
  /** 角色固有被动 */
  perkName: string;
  perkDesc: string;
  /** 英文固有被动名（缺省回退中文） */
  enPerkName?: string;
  /** 英文固有被动描述（缺省回退中文） */
  enPerkDesc?: string;
  /** 应用于属性重算（在被动之前执行） */
  perk: (s: {
    maxHp: number;
    speed: number;
    pickupRange: number;
    critChance: number;
    critMult: number;
    armor: number;
    regen: number;
  }) => void;
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'ranger',
    name: '游侠',
    en: 'Ranger',
    tagline: '在幽墟深处独自求生的孤独猎手',
    enTagline: 'A lone hunter surviving the depths of the Hollow',
    sprite: Tex.Player,
    icon: Tex.Player,
    base: {
      hp: 100,
      // 基础移速 +10%（方便走位闪避）
      speed: 209,
      // 经验吸取/磁吸范围：设为较大值，Boss 战清怪时经验自动涌入，无需冒死走过去捡
      pickupRange: 300,
      critChance: 0.05,
      critMult: 2,
      armor: 0,
      regen: 0,
    },
    startWeapon: 'rift',
    perkName: '拾荒者',
    perkDesc: '拾取范围 +20%',
    enPerkName: 'Scavenger',
    enPerkDesc: 'Pickup Range +20%',
    perk: (s) => {
      s.pickupRange *= 1.2;
    },
  },
];

export const DEFAULT_CHARACTER = CHARACTERS[0];
