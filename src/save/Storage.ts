const KEY = 'hollow-depths.save.v1';

/** 新玩家默认解锁（进入每局升级随机池）：武器＝裂地印记(角色自带)＋贯穿光束；被动＝智慧卷轴 */
export const DEFAULT_UNLOCKED_WEAPONS: readonly string[] = ['rift', 'beam'];
export const DEFAULT_UNLOCKED_PASSIVES: readonly string[] = ['wisdom'];

export interface SaveData {
  bestTime: number;
  bestKills: number;
  bestLevel: number;
  runs: number;
  wins: number;
  /** 跨局永久「灵魂」，单位为 0.01（1 灵魂 = 100） */
  soulCents: number;
  /** 商店历史购买次数：当前购买价 = 3 + purchases（首件 3，逐次 +1） */
  purchases: number;
  /** 已永久解锁、可进入每局升级池的基础武器 id */
  unlockedWeapons: string[];
  /** 已永久解锁、可进入每局升级池的被动 id */
  unlockedPassives: string[];
  /** 永久升级后的武器起始等级（id → 起始等级，缺省视作 1） */
  weaponLevels: Record<string, number>;
  /** 永久升级后的被动起始等级 */
  passiveLevels: Record<string, number>;
  /** 已获得的宠物 id（顺序即图鉴/列表顺序，去重） */
  petsOwned: string[];
  /** petId → 宠物等级（缺省视作 1） */
  petLevels: Record<string, number>;
  /** 宠物粮袋数量（整数） */
  petFood: number;
  /** 宠物碎片（宠物商店通用货币，整数） */
  petShards: number;
  /** 本局上阵的宠物 id（长度不超过槽位数） */
  petLoadout: string[];
  /** 局内「紧凑模式」：隐藏超大宠物巨兽本体，避免遮挡走位/弹幕视野 */
  petCompact: boolean;
  /** 是否已领取饲养园的免费基础宠物（一生一次） */
  freePetClaimed: boolean;
  /** 已生效的一次性调试码（每档存档各只生效一次，清除数据后重置） */
  usedCodes: string[];
}

const DEFAULT: SaveData = {
  bestTime: 0,
  bestKills: 0,
  bestLevel: 1,
  runs: 0,
  wins: 0,
  soulCents: 0,
  purchases: 0,
  unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS],
  unlockedPassives: [...DEFAULT_UNLOCKED_PASSIVES],
  weaponLevels: {},
  passiveLevels: {},
  petsOwned: [],
  petLevels: {},
  petFood: 0,
  petShards: 0,
  petLoadout: [],
  petCompact: false,
  freePetClaimed: false,
  usedCodes: [],
};

/** localStorage 读写：任何异常都不应影响游戏进行（无痕模式 / 禁用存储） */
export class Storage {
  /** 深拷贝一份默认存档（数组/对象各自复制，避免跨存档共享引用） */
  private static freshDefault(): SaveData {
    return {
      ...DEFAULT,
      unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS],
      unlockedPassives: [...DEFAULT_UNLOCKED_PASSIVES],
      weaponLevels: {},
      passiveLevels: {},
      petsOwned: [],
      petLevels: {},
      petLoadout: [],
      usedCodes: [],
    };
  }

  static load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return this.freshDefault();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      // 数组/对象字段一律复制，避免跨存档共享引用后被 push 污染；老存档缺字段时回退默认
      const merged: SaveData = {
        ...DEFAULT,
        ...parsed,
        unlockedWeapons: Array.isArray(parsed.unlockedWeapons)
          ? [...parsed.unlockedWeapons]
          : [...DEFAULT_UNLOCKED_WEAPONS],
        unlockedPassives: Array.isArray(parsed.unlockedPassives)
          ? [...parsed.unlockedPassives]
          : [...DEFAULT_UNLOCKED_PASSIVES],
        weaponLevels:
          parsed.weaponLevels && typeof parsed.weaponLevels === 'object'
            ? { ...parsed.weaponLevels }
            : {},
        passiveLevels:
          parsed.passiveLevels && typeof parsed.passiveLevels === 'object'
            ? { ...parsed.passiveLevels }
            : {},
        petsOwned: Array.isArray(parsed.petsOwned) ? [...parsed.petsOwned] : [],
        petLevels:
          parsed.petLevels && typeof parsed.petLevels === 'object'
            ? { ...parsed.petLevels }
            : {},
        petFood: typeof parsed.petFood === 'number' && Number.isFinite(parsed.petFood) ? Math.max(0, Math.floor(parsed.petFood)) : 0,
        petShards: typeof parsed.petShards === 'number' && Number.isFinite(parsed.petShards) ? Math.max(0, Math.floor(parsed.petShards)) : 0,
        petLoadout: Array.isArray(parsed.petLoadout) ? [...parsed.petLoadout] : [],
        petCompact: parsed.petCompact === true,
        freePetClaimed: parsed.freePetClaimed === true,
        usedCodes: Array.isArray(parsed.usedCodes) ? [...parsed.usedCodes] : [],
      };
      return merged;
    } catch {
      return this.freshDefault();
    }
  }

  static save(data: SaveData): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* 忽略：存储不可用时静默降级为不持久化 */
    }
  }

  static reset(): void {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* 忽略 */
    }
  }
}
