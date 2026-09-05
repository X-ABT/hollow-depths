/**
 * 实体组件（扁平结构体，全部字段预分配）。
 *
 * 设计取舍：没有采用「实体 id + 分散组件表」的经典 ECS，而是把同类实体的全部字段
 * 内联在同一个对象中，配合 Pool 做密集存储。效果是等价的——
 * 遍历时内存连续、缓存友好、运行期零分配，但避免了跨表跳转与 id 映射的复杂度。
 */

/** 敌人 AI 行为 */
export const enum Ai {
  Chase = 0, // 直线追击
  Dash = 1, // 蓄力冲刺
  Grow = 2, // 持续成长
  Blink = 3, // 随机瞬移
  Spiral = 4, // 螺旋接近
  Splitter = 5, // 定期分裂（精英）
  Shielded = 6, // 护盾减伤（精英）
  Trickster = 7, // 受击闪现（精英）
  BossHerald = 8, // 古神：召唤 / 地面伤害区 / 冲撞
  BossCalamity = 9, // 灾厄：全屏预警 AOE
  BossEndless = 10, // 终焉：边界收缩 + 弹幕
  Gunner = 11, // 深渊炮手（精英）：朝玩家周期发射弹幕
  BossLament = 12, // 泣灵（无尽）：螺旋弹幕 + 地面伤害区
  BossMaw = 13, // 渊喉（无尽）：全屏脉冲 + 召唤幻影
}

/** 投射物行为 */
export const enum Behavior {
  Linear = 0, // 直线飞行
  Homing = 1, // 追踪
  Orbit = 2, // 环绕玩家
  Aoe = 3, // 扩散冲击波
  Beam = 4, // 穿透光束
  Field = 5, // 持续领域
  Mark = 6, // 延迟落点爆炸（裂地印记）
  Telegraph = 7, // 预警圈（Boss AOE，倒计时结束后爆发）
}

/** 拾取物类型 */
export const enum PickupKind {
  Xp = 0,
  Chest = 1,
  Heal = 2,
  Magnet = 3,
}

export interface Enemy {
  // —— 变换 ——
  x: number;
  y: number;
  px: number; // 上一逻辑步位置，用于渲染插值
  py: number;
  vx: number;
  vy: number;
  radius: number;
  scale: number;

  // —— 战斗 ——
  hp: number;
  maxHp: number;
  damage: number;
  armor: number;
  speed: number;
  xp: number;

  // —— 分类 ——
  defIdx: number; // enemies 表下标
  ai: Ai;
  isElite: boolean;
  isBoss: boolean;
  bossIdx: number;

  // —— AI 状态 ——
  timer: number; // 通用计时
  state: number; // 通用状态机
  phase: number; // Boss 阶段
  growT: number; // 成长累积（Grow）
  angle: number; // 螺旋角 / Boss 弹幕角
  cast: number; // Boss 施法蓄力剩余秒（>0 = 正在蓄力警示，0 = 空闲）
  /** 技能频率系数：>1 = 技能释放更频繁（无尽 Boss 随轮次放大；普通怪/精英恒为 1） */
  castMul: number;
  sub: number; // Boss 阶段内辅助倒计时（冲刺时长等，不占用 phase）
  tx: number; // Boss 技能落点 x（蓄力时锁定，释放后在该处生效）
  ty: number; // Boss 技能落点 y

  // —— 受击与状态 ——
  flash: number; // 受击闪白剩余时间
  slowT: number; // 减速剩余时间
  slowF: number; // 减速系数
  knockX: number; // 击退速度
  knockY: number;
  srcId: number; // 最近一次伤害来源（用于同类来源命中间隔）
  srcImmune: number; // 该来源的免疫剩余时间
  hitCd: number; // 对玩家的接触伤害冷却
  /** 激怒标记：>0 表示已被玩家伤害（史莱姆等「被动型」怪据此才开始追击） */
  aggro: number;
  dead: boolean;

  // —— 渲染 ——
  spriteKey: number;
  rot: number;
}

export interface Proj {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  behavior: Behavior;

  life: number; // 剩余寿命
  maxLife: number;
  pierce: number; // 剩余穿透次数
  srcId: number; // 伤害来源 id（武器槽位 hash）
  hitCd: number; // 命中同一目标后的冷却（轨道/领域用）
  critChance: number;
  critMult: number;
  knockback: number;

  // Homing
  retarget: number;
  targetIdx: number;
  turn: number;

  // Orbit / Spiral
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;

  // Aoe / Mark
  r0: number;
  r1: number;

  // Beam
  width: number;
  length: number;
  angle: number;

  // Field
  slowF: number;
  dotDps: number;
  tickT: number;

  /** 1 = 跟随玩家移动（「寒霜随行」进化） */
  follow: number;
  /** 命中后溅射半径，0 表示无溅射（「猎杀连锁」进化） */
  splash: number;
  /** 1 = 敌方投射物（Boss 弹幕 / 地面伤害区），0 = 玩家投射物 */
  hostile: number;

  // 渲染
  spriteKey: number;
  rot: number;
  rotSpeed: number;
  scale: number;
  tintOverride: number;
}

export interface Pickup {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  kind: PickupKind;
  value: number;
  radius: number;
  life: number;
  magnet: boolean;
  bob: number;
}

/** 玩家 —— 全局唯一，不进池 */
export interface Player {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  iframe: number;

  // 派生属性（每次 build 变化时重算）
  speed: number;
  damageMul: number;
  fireRateMul: number;
  projBonus: number;
  xpMul: number;
  critChance: number;
  critMult: number;
  armor: number;
  regen: number;
  pickupRange: number;

  // 进度
  level: number;
  xp: number;
  xpNext: number;
  pendingLevels: number;

  face: number; // 朝向（用于渲染翻转）
}

/** 伤害飘字 / 粒子（渲染层专用，见 render/Vfx.ts） */
export const enum AiKindCount {
  _ = 0,
}
