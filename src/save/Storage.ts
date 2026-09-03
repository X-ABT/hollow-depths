const KEY = 'hollow-depths.save.v1';

export interface SaveData {
  bestTime: number;
  bestKills: number;
  bestLevel: number;
  runs: number;
  wins: number;
  perfVisible: boolean;
}

const DEFAULT: SaveData = {
  bestTime: 0,
  bestKills: 0,
  bestLevel: 1,
  runs: 0,
  wins: 0,
  perfVisible: false,
};

/** localStorage 读写：任何异常都不应影响游戏进行（无痕模式 / 禁用存储） */
export class Storage {
  static load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...DEFAULT };
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return { ...DEFAULT, ...parsed };
    } catch {
      return { ...DEFAULT };
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
