/** 波次时间轴：纯数据，改动节奏只需改这张表 */

/** 一局总时长（秒）：10 分钟 Boss 战 + 2 分钟收尾，12 分钟结算 */
export const RUN_SECONDS = 720;
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

/** Boss 出场时间轴 */
export const BOSS_TIMES: readonly { t: number; id: string }[] = [
  { t: 300, id: 'herald' },
  { t: 480, id: 'calamity' },
  { t: 600, id: 'endless' },
];

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
