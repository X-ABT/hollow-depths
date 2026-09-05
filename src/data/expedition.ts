/**
 * 宠物远征关卡配置（纯数据 + 纯函数）。
 *
 * 关键设计：敌宠的「小/中/大」档位只决定**外观与招式**，不直接决定难度曲线。
 * 真实难度由「本关目标总血量」归一化后反推 hpMul，从而消除
 * 小怪(4~12) / 中怪(18~130) / 大怪(60~210) 基础血量相差近 10 倍造成的断崖。
 *
 * 伤害成长刻意比血量慢：英雄站桩时接触伤害是「每 0.6s 吃一次」，
 * 等效每秒承伤 = 敌人伤害 ÷ 0.6，若伤害随关数快速膨胀会让任何宠物都撑不过几秒。
 */
import { ENEMY_BY_ID } from './enemies';

/** 小怪档（复用现有怪物 id） */
export const SMALL = ['swarmling', 'wraith', 'phantom'] as const;
/** 中怪档 */
export const MID = ['slime', 'grub', 'splinter'] as const;
/** 大怪档 */
export const BIG = ['carapace', 'gunner', 'trickster'] as const;
/** Boss 循环（每 6 关取一个，越后越强） */
export const BOSS_CYCLE = ['herald', 'calamity', 'endless'] as const;

export type EnemyId = string;

export interface StagePlan {
  stage: number;
  isBoss: boolean;
  /** 本关要生成的敌宠 id 列表（按出生顺序；Boss 关仅 1 个） */
  enemyIds: EnemyId[];
  /** 敌宠血量缩放（由目标总血量反推，保证难度平滑） */
  hpMul: number;
  /** 敌宠伤害缩放 */
  dmgMul: number;
  /** 通关奖励「星币」 */
  starReward: number;
}

// ——————————————————— 难度旋钮（集中在此，便于手感微调）———————————————————
/** 第 1 关的敌宠总血量 */
const BASE_TOTAL_HP = 60;
/** 每关总血量成长倍率 */
const TOTAL_HP_GROWTH = 1.35;
/** Boss 关总血量在曲线基础上再乘一档（单只高血量目标） */
const BOSS_TOTAL_MUL = 2.2;
/** 单关敌宠数量上限（避免后期数量爆炸） */
const MAX_COUNT = 18;
/** 接触伤害随关数成长（刻意远慢于血量） */
const DMG_GROWTH = 0.1;
/** Boss 首次遭遇的接触伤害（与它自身超高的基础伤害解耦，否则会秒杀英雄） */
const BOSS_BASE_DMG = 8;
/** Boss 每重复出现一轮，接触伤害增量 */
const BOSS_DMG_PER_ROUND = 3;

/** 确定性地从档位里取 n 个（按 stage 作种子，保证同关每次组成一致） */
function pick<T>(arr: readonly T[], n: number, seed: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[(seed + i) % arr.length]);
  return out;
}

/** 本关的目标总血量（平滑曲线） */
function targetTotalHp(stage: number, isBoss: boolean): number {
  const t = BASE_TOTAL_HP * Math.pow(TOTAL_HP_GROWTH, stage - 1);
  return isBoss ? t * BOSS_TOTAL_MUL : t;
}

/**
 * 推导第 stage 关的配置。
 * - 档位循环：小(1~2) / 中(3~4) / 大(5~6)，每 6 关一轮；仅影响外观与基础招式。
 * - 每 6 关（stage % 6 === 0）为 Boss 关，Boss 在 BOSS_CYCLE 中循环、越后越强。
 */
export function stagePlan(stage: number): StagePlan {
  const isBoss = stage % 6 === 0;
  const count = isBoss ? 1 : Math.min(4 + stage, MAX_COUNT);

  let ids: string[];
  if (isBoss) {
    const round = Math.floor(stage / 6) - 1;
    ids = [BOSS_CYCLE[((round % BOSS_CYCLE.length) + BOSS_CYCLE.length) % BOSS_CYCLE.length]];
  } else {
    const tier = [SMALL, MID, BIG][Math.floor(((stage - 1) % 6) / 2)];
    ids = pick(tier, count, stage);
  }

  // 血量归一化：让本关实际总血量等于目标曲线
  const baseSum = ids.reduce((s, id) => s + (ENEMY_BY_ID[id]?.hp ?? 10), 0) || 1;
  const hpMul = targetTotalHp(stage, isBoss) / baseSum;

  // 伤害：常规怪随关数温和成长；Boss 用独立的低档固定值
  const baseDmg = ENEMY_BY_ID[ids[0]]?.damage || 1;
  const dmgMul = isBoss
    ? (BOSS_BASE_DMG + BOSS_DMG_PER_ROUND * (Math.floor(stage / 6) - 1)) / baseDmg
    : 1 + DMG_GROWTH * (stage - 1);

  return {
    stage,
    isBoss,
    enemyIds: ids,
    hpMul,
    dmgMul,
    starReward: isBoss ? Math.round(80 + 8 * stage) : Math.round(20 + 5 * stage),
  };
}

// ——————————————————— 星币经济 ———————————————————
/** 星币兑换碎片比例：每 STAR_PER_SHARD 星币换 1 碎片 */
export const STAR_PER_SHARD = 100;

/** 用星币兑换碎片：返回实际换得的碎片数（向下取整），并扣减花费 */
export function exchangeStarsToShards(
  starCoins: number,
  wantShards: number,
): { spend: number; got: number } {
  const affordable = Math.min(wantShards, Math.floor(starCoins / STAR_PER_SHARD));
  return { spend: affordable * STAR_PER_SHARD, got: affordable };
}
