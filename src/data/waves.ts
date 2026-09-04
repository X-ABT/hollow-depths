/** 波次时间轴：纯数据，改动节奏只需改这张表 */

/**
 * 宽限时间上限（秒）：通关条件是击败最终 Boss「终焉」，不再是存活满时长。
 * 此值作为防止无限拖局的兜底——若玩家撑到 30 分钟仍未击败终焉，判为失败。
 */
export const RUN_SECONDS = 1800;
/** 同屏敌人软上限：超过后暂停生成，保证帧率优先 */
export const MAX_ALIVE = 1500;
/** 生成环半径（相对视口对角线的一半） */
export const SPAWN_MARGIN = 90;
/** 开局缓冲：前几秒不刷怪，给玩家时间熟悉环境与走位 */
export const GRACE_SECONDS = 4;

export interface SpawnEntry {
  /** 敌人 id */
  id: string;
  /** 从第几秒开始出现 */
  from: number;
  /** 权重（越大越常见） */
  weight: number;
}

/** 普通怪出场时间轴与权重 */
export const SPAWN_TABLE: readonly SpawnEntry[] = [
  { id: 'swarmling', from: 0, weight: 34 },
  { id: 'wraith', from: 0, weight: 26 },
  { id: 'slime', from: 60, weight: 16 },
  // 幻影是唯一会瞬移的高速怪，单只威胁大，刻意压低权重让它是「点缀」而非主力
  { id: 'phantom', from: 120, weight: 6 },
  { id: 'grub', from: 180, weight: 16 },
];

/** 精英出场时间轴与权重 */
export const ELITE_TABLE: readonly SpawnEntry[] = [
  { id: 'splinter', from: 240, weight: 40 },
  { id: 'carapace', from: 300, weight: 30 },
  { id: 'trickster', from: 360, weight: 30 },
];

/** 密度倍率（按时间点阶梯提升） */
export const DENSITY_STEPS: readonly { t: number; mul: number }[] = [
  { t: 0, mul: 1 },
  { t: 120, mul: 1.5 },
  { t: 360, mul: 2 },
  { t: 540, mul: 2.5 },
  { t: 660, mul: 3 },
];

/**
 * Boss 出场规则：古神于开局 5:00 出现；之后每击败一个 Boss，隔 4:00 才出现下一个。
 * 剩余时间由 SpawnSystem 维护并在 HUD 左上角实时倒计时。
 */
export const BOSS_ORDER: readonly string[] = ['herald', 'calamity', 'endless'];
/** 首个 Boss（古神）出现的延迟（秒） */
export const FIRST_BOSS_AT = 300;
/** 击败一个 Boss 后，下一个 Boss 出现的间隔（秒） */
export const NEXT_BOSS_GAP = 240;

/** 精英刷新间隔（秒）：从 4:00 起每隔一段时间刷一只 */
export const ELITE_INTERVAL = 26;
export const ELITE_FIRST = 240;

/** 基础每秒生成数量：随时间线性增长（开局从 0.6/s 起步，后期逼近上限） */
export function spawnRate(t: number): number {
  return Math.min(34, 0.6 + t * 0.052);
}

/** 当前密度倍率 */
export function densityMul(t: number): number {
  let mul = 1;
  for (let i = 0; i < DENSITY_STEPS.length; i++) {
    if (t >= DENSITY_STEPS[i].t) mul = DENSITY_STEPS[i].mul;
    else break;
  }
  return mul;
}

/** 敌人血量/伤害随时间的成长系数（每分钟 +35%） */
export function hpScale(t: number): number {
  return 1 + (t / 60) * 0.35;
}

export function damageScale(t: number): number {
  return 1 + (t / 60) * 0.18;
}
