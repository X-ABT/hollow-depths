import { Tex } from '../render/TexKeys';

export interface CharacterDef {
  id: string;
  name: string;
  en: string;
  /** 一句话定位 */
  tagline: string;
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
    sprite: Tex.Player,
    icon: Tex.Player,
    base: {
      hp: 100,
      speed: 190,
      pickupRange: 150,
      critChance: 0.05,
      critMult: 2,
      armor: 0,
      regen: 0,
    },
    startWeapon: 'rift',
    perkName: '拾荒者',
    perkDesc: '拾取范围 +20%',
    perk: (s) => {
      s.pickupRange *= 1.2;
    },
  },
];

export const DEFAULT_CHARACTER = CHARACTERS[0];
