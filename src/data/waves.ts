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
/** 无尽幽墟 Boss 循环（5 只，每 4 分钟固定刷一只，可并存） */
export const ENDLESS_ORDER: readonly string[] = ['herald', 'calamity', 'lament', 'maw', 'endless'];
/** 首个 Boss（古神）出现的延迟（秒） */
export const FIRST_BOSS_AT = 300;
/** 无尽模式首只 Boss 出现时间（秒） */
export const ENDLESS_FIRST_BOSS_AT = 240;
/** 击败一个 Boss 后，下一个 Boss 出现的间隔（秒）；无尽模式同样用它做固定刷怪间隔 */
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

/**
 * 快杀激励（挑战成长）：Boss 被击杀得越快，下一只 Boss 的血量越厚。
 * @param killSec 上一只 Boss 从刷出到被击杀的耗时（秒）
 * @returns 下一只 Boss 血量倍率（≥1）。命中多个档位时按最快档（更高倍率）结算；超过 2 分钟无加成。
 */
export function bossHpMulByKillTime(killSec: number): number {
  if (killSec <= 15) return 10; // 15 秒内 → ×10
  if (killSec <= 30) return 5; // 30 秒内 → ×5
  if (killSec <= 60) return 4; // 1 分钟内 → ×4
  if (killSec <= 90) return 3; // 1.5 分钟内 → ×3
  if (killSec <= 120) return 2; // 2 分钟内 → ×2
  return 1;
}

// ————————————————————————————————————————————————————————————————
// 无尽幽墟专属难度（仅 world.endless 分支读取；标准一局完全不受影响）
//
// 需求：后期挑战要持续拉高、手感平滑无断点——
//   1. 普通小怪血量/攻击：从开局即按指数缓慢加速，约每 5 分钟强度 ×2（永不封顶）；
//      此规则只作用于普通小怪，精英/Boss 不套用。
//   2. 精英：首刷更早、间隔更短，全程更频繁（强度仍走 hpScale/damageScale）。
//   3. 深渊炮手：现状无尽模式因 postHerald 永不置位实际从不刷新 → 改为约 300s 起按时间周期刷新。
//   4. Boss：刷新间隔随轮次逐步缩短；血量/移速/技能频率随轮次逐轮强化。
// 所有旋钮集中于此，试玩后只需改顶部常数即可微调，无需动生成逻辑。
// ————————————————————————————————————————————————————————————————

/** 普通小怪血量翻倍周期（秒）：每 300s 血量 ×2 */
export const ENDLESS_MINION_HP_DOUBLE_SEC = 300;
/** 普通小怪攻击翻倍周期（秒）：每 300s 攻击 ×2 */
export const ENDLESS_MINION_DMG_DOUBLE_SEC = 300;

/** 无尽普通小怪血量倍率：t=0 为 1，平滑指数加速（每 5 分钟 ×2） */
export function endlessMinionHpMul(t: number): number {
  return Math.pow(2, t / ENDLESS_MINION_HP_DOUBLE_SEC);
}

/** 无尽普通小怪攻击倍率：t=0 为 1，平滑指数加速（每 5 分钟 ×2） */
export function endlessMinionDmgMul(t: number): number {
  return Math.pow(2, t / ENDLESS_MINION_DMG_DOUBLE_SEC);
}

/**
 * 无尽普通怪表：高危怪（幻影/漩涡虫）比标准局更早解锁；
 * 同一 id 可重复出现多行 = 该怪在对应时间后获得额外权重，实现「后期高危占比随时间加重」。
 */
export const ENDLESS_SPAWN_TABLE: readonly SpawnEntry[] = [
  { id: 'swarmling', from: 0, weight: 28 },
  { id: 'wraith', from: 0, weight: 22 },
  { id: 'slime', from: 40, weight: 12 },
  { id: 'grub', from: 80, weight: 12 }, // 标准 from:180 → 提前
  { id: 'phantom', from: 60, weight: 6 }, // 标准 from:120 → 提前
  // 后期（10 分钟起）高危怪二次增权，幻影/漩涡虫占比明显加重
  { id: 'grub', from: 600, weight: 10 },
  { id: 'phantom', from: 600, weight: 7 },
];

/** 无尽精英出场时间轴（比标准更早解锁） */
export const ENDLESS_ELITE_TABLE: readonly SpawnEntry[] = [
  { id: 'splinter', from: 80, weight: 40 },
  { id: 'carapace', from: 150, weight: 30 },
  { id: 'trickster', from: 210, weight: 30 },
];
/** 无尽首只精英出现时间（秒）：标准 240 → 80 */
export const ENDLESS_ELITE_FIRST = 80;
/** 无尽精英刷新间隔（秒）：标准 26 → 14，中后期精英密度明显更高 */
export const ENDLESS_ELITE_INTERVAL = 14;

/** 无尽深渊炮手开始周期刷新时间（秒）：约 5 分钟 */
export const ENDLESS_GUNNER_FROM = 300;
/** 无尽炮手批量刷新间隔（秒） */
export const ENDLESS_GUNNER_INTERVAL = 20;
/** 无尽炮手同屏上限 */
export const ENDLESS_GUNNER_MAX = 3;
/** 无尽炮手首次一次性补几只（之后每批 1 只） */
export const ENDLESS_GUNNER_FIRST_BATCH = 2;

/** Boss 轮次：每刷一只轮次 +1（第 1 轮 = 首只，系数均从 1 起步、逐轮递增） */
/** 无尽 Boss 每轮额外血量倍率（基础 hpScale(t) 之上再乘）：第 r 轮 = 1+0.5×(r-1) */
export function endlessBossHpMul(round: number): number {
  return 1 + 0.5 * (round - 1);
}
/** 无尽 Boss 每轮移速倍率（像素/秒基数 ×）：上限 1.6，防后期数值失控 */
export function endlessBossSpeedMul(round: number): number {
  return Math.min(1.6, 1 + 0.05 * (round - 1));
}
/** 无尽 Boss 每轮技能加速系数（技能安全间歇 ÷ 该值）：上限 2.5，警示前摇时长不变 */
export function endlessBossCastMul(round: number): number {
  return Math.min(2.5, 1 + 0.15 * (round - 1));
}
/** 无尽 Boss 相邻两轮出场间隔（秒）：轮次越高间隔越短，floor 150s（第 1 轮即 240s） */
export function endlessBossGap(round: number): number {
  return Math.max(150, 240 - 15 * (round - 1));
}
