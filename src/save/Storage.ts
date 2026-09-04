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
  perfVisible: boolean;
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
}

const DEFAULT: SaveData = {
  bestTime: 0,
  bestKills: 0,
  bestLevel: 1,
  runs: 0,
  wins: 0,
  perfVisible: false,
  soulCents: 0,
  purchases: 0,
  unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS],
  unlockedPassives: [...DEFAULT_UNLOCKED_PASSIVES],
  weaponLevels: {},
  passiveLevels: {},
};

/** localStorage 读写：任何异常都不应影响游戏进行（无痕模式 / 禁用存储） */
export class Storage {
  static load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT, unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS], unlockedPassives: [...DEFAULT_UNLOCKED_PASSIVES] };
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      // 数组字段一律复制，避免跨存档共享引用后被 push 污染
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
      };
      return merged;
    } catch {
      return { ...DEFAULT, unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS], unlockedPassives: [...DEFAULT_UNLOCKED_PASSIVES] };
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
