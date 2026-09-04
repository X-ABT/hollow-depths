import { Ai } from '../ecs/Components';
import { Tex } from '../render/TexKeys';

export interface EnemyDef {
  id: string;
  name: string;
  sprite: number;
  hp: number;
  /** 像素/秒 */
  speed: number;
  damage: number;
  radius: number;
  /** 掉落经验（宝石价值） */
  xp: number;
  ai: Ai;
  armor: number;
  elite: boolean;
  boss: boolean;
  /** AI 行为参数：不同 AI 含义不同 */
  p0: number;
  p1: number;
}

/** 普通怪：数值为「第 0 分钟」基准，实际生成会按时间成长（见 waves.ts） */
export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'swarmling',
    name: '蚁群',
    sprite: Tex.Swarmling,
    hp: 4,
    speed: 62,
    damage: 4,
    radius: 9,
    xp: 1,
    ai: Ai.Chase,
    armor: 0,
    elite: false,
    boss: false,
    p0: 0,
    p1: 0,
  },
  {
    id: 'wraith',
    name: '亡魂',
    sprite: Tex.Wraith,
    hp: 9,
    speed: 82,
    damage: 8,
    radius: 13,
    xp: 2,
    ai: Ai.Dash,
    armor: 0,
    elite: false,
    boss: false,
    // 蓄力 1.1s → 冲刺 0.5s（速度 ×3.1）
    p0: 1.1,
    p1: 3.1,
  },
  {
    id: 'slime',
    name: '史莱姆',
    sprite: Tex.Slime,
    hp: 60, // 被动型怪：不主动逼近、血偏厚，作为"软障碍"
    speed: 44,
    damage: 4,
    radius: 17,
    xp: 4,
    ai: Ai.Grow,
    armor: 0,
    elite: false,
    boss: false,
    // 每 6s 体型与血量 +18%，最多叠 6 层
    p0: 6,
    p1: 0.18,
  },
  {
    id: 'phantom',
    name: '幻影',
    sprite: Tex.Phantom,
    hp: 12,
    speed: 104,
    damage: 6,
    radius: 12,
    xp: 3,
    ai: Ai.Blink,
    armor: 0,
    elite: false,
    boss: false,
    // 每 3s 瞬移 120px：瞬移更少（少贴脸骚扰），但单次瞬得更远更难命中
    p0: 3,
    p1: 120,
  },
  {
    id: 'grub',
    name: '漩涡虫',
    sprite: Tex.Grub,
    hp: 18,
    speed: 96,
    damage: 9,
    radius: 14,
    xp: 3,
    ai: Ai.Spiral,
    armor: 0,
    elite: false,
    boss: false,
    // 螺旋角速度 1.5 rad/s，切向/径向速度比
    p0: 1.5,
    p1: 0.62,
  },
];

/** 精英：掉宝箱 */
export const ELITES: readonly EnemyDef[] = [
  {
    id: 'splinter',
    name: '分裂魔',
    sprite: Tex.Splinter,
    hp: 130,
    speed: 70,
    damage: 14,
    radius: 21,
    xp: 24,
    ai: Ai.Splitter,
    armor: 0,
    elite: true,
    boss: false,
    // 每 8s 分裂 2 个（半血半体型），最多分裂 2 代
    p0: 8,
    p1: 2,
  },
  {
    id: 'carapace',
    name: '甲壳兽',
    sprite: Tex.Carapace,
    hp: 210,
    speed: 50,
    damage: 19,
    radius: 25,
    xp: 32,
    ai: Ai.Shielded,
    armor: 6,
    elite: true,
    boss: false,
    // 血量高于 70% 时减伤 60%
    p0: 0.7,
    p1: 0.6,
  },
  {
    id: 'trickster',
    name: '欺诈者',
    sprite: Tex.Trickster,
    hp: 95,
    speed: 124,
    damage: 12,
    radius: 16,
    xp: 28,
    ai: Ai.Trickster,
    armor: 0,
    elite: true,
    boss: false,
    // 受击后 30% 概率闪现到玩家背后 90px
    p0: 0.3,
    p1: 90,
  },
  {
    id: 'gunner',
    name: '深渊炮手',
    sprite: Tex.Gunner,
    hp: 60,
    speed: 46,
    damage: 18,
    radius: 20,
    xp: 0, // 不靠 xp 单宝石；死亡走精英统一掉落（5~7 颗黄经验，见 CleanupSystem）
    ai: Ai.Gunner,
    armor: 0,
    elite: true,
    boss: false,
    // 射击间隔（秒，较初版翻倍避免太频繁；另有 0.7s 蓄力前摇）/ 弹速
    p0: 4.4,
    p1: 300,
  },
];

/** Boss */
export const BOSSES: readonly EnemyDef[] = [
  {
    id: 'herald',
    name: '古神',
    sprite: Tex.BossHerald,
    hp: 1500,
    speed: 66,
    damage: 24,
    radius: 46,
    xp: 220,
    ai: Ai.BossHerald,
    armor: 3,
    elite: false,
    boss: true,
    // 阶段血量阈值
    p0: 0.66,
    p1: 0.33,
  },
  {
    id: 'calamity',
    name: '灾厄',
    sprite: Tex.BossCalamity,
    hp: 3000,
    speed: 58,
    damage: 28,
    radius: 52,
    xp: 380,
    ai: Ai.BossCalamity,
    armor: 6,
    elite: false,
    boss: true,
    // 每 3.4s 一次预警 AOE，预警 1.2s
    p0: 3.4,
    p1: 1.2,
  },
  {
    id: 'endless',
    name: '终焉',
    sprite: Tex.BossEndless,
    hp: 6000,
    speed: 46,
    damage: 32,
    radius: 58,
    xp: 700,
    ai: Ai.BossEndless,
    armor: 10,
    elite: false,
    boss: true,
    // 无敌倒计时 30s（期间只能躲避），结束后破防
    p0: 30,
    p1: 0.55,
  },
];

export const ALL_ENEMY_DEFS: readonly EnemyDef[] = [...ENEMIES, ...ELITES, ...BOSSES];
export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(
  ALL_ENEMY_DEFS.map((e) => [e.id, e]),
);
/** defIdx → EnemyDef（实体只存下标，避免对象引用与额外内存） */
export const ENEMY_BY_INDEX = ALL_ENEMY_DEFS;
/** ENEMIES / ELITES / BOSSES 在总表中的起始下标 */
export const IDX_ELITE_START = ENEMIES.length;
export const IDX_BOSS_START = ENEMIES.length + ELITES.length;
