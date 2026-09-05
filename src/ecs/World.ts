import { Pool } from '../core/ObjectPool';
import { SpatialHash } from '../core/SpatialHash';
import { Rng } from '../core/Rng';
import type { Enemy, Pickup, PickupKind, Player, Proj } from './Components';
import { Ai, Behavior } from './Components';

/** 压测目标：同屏 2000+ 敌人仍保持 60fps，池容量按此上浮留余量 */
export const MAX_ENEMIES = 2600;
export const MAX_PROJ = 1600;
export const MAX_PICKUPS = 1100;
/** 上阵宠物最多 3 只，池留余量 */
export const MAX_PETS = 8;
/** 格边长 ≈ 2× 最大普通敌人半径（普通怪最大 r≈26），保证只查 3×3 邻格即可覆盖 */
export const HASH_CELL = 64;

function makeEnemy(): Enemy {
  return {
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    radius: 10, scale: 1,
    hp: 1, maxHp: 1, damage: 1, armor: 0, speed: 60, xp: 1,
    defIdx: 0, ai: Ai.Chase, isElite: false, isBoss: false, bossIdx: -1,
    timer: 0, state: 0, phase: 0, growT: 0, angle: 0,
    cast: 0, castMul: 1, sub: 0, tx: 0, ty: 0,
    flash: 0, slowT: 0, slowF: 1, knockX: 0, knockY: 0,
    srcId: -1, srcImmune: 0, hitCd: 0, aggro: 0, dead: false,
    spriteKey: 0, rot: 0,
  };
}

function makeProj(): Proj {
  return {
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    radius: 6, damage: 1, behavior: Behavior.Linear,
    life: 1, maxLife: 1, pierce: 1, srcId: -1, hitCd: 0,
    critChance: 0, critMult: 2, knockback: 0,
    retarget: 0, targetIdx: -1, turn: 8,
    orbitAngle: 0, orbitRadius: 60, orbitSpeed: 3,
    r0: 0, r1: 0,
    width: 10, length: 300, angle: 0,
    slowF: 1, dotDps: 0, tickT: 0,
    follow: 0, splash: 0, hostile: 0,
    spriteKey: 0, rot: 0, rotSpeed: 0, scale: 1, tintOverride: -1,
  };
}

function makePickup(): Pickup {
  return {
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    kind: 0, value: 1, radius: 6, life: 60, magnet: false, bob: 0,
  };
}

/** 局内宠物运行时数据（由 PetSystem 驱动，仅供渲染读取；不进入敌人哈希/掉落流程） */
export interface Pet {
  /** PETS 表下标 */
  petIdx: number;
  level: number;
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  /** 当前血量 / 上限 / 单口基础伤害 */
  hp: number; maxHp: number; dmg: number;
  /** 受击判定半径（随体积增长但封顶，避免满屏敌人摸到巨兽） */
  radius: number;
  /** 视觉比例 = 当前体积 / 基础体积（渲染宽 = 基准宽 × scale） */
  scale: number;
  /** 0 出战 / 1 灰心逃跑（期间无敌） */
  state: number;
  /** 逃跑剩余时间等通用计时 */
  timer: number;
  /** 攻击冷却 */
  atkCd: number;
  /** 受击冷却 */
  hurtCd: number;
  /** 受击闪白 */
  flash: number;
  /** 上阵槽位 0..2（影响跟随偏移与渲染优先级） */
  slot: number;
}

function makePet(): Pet {
  return {
    petIdx: 0, level: 1,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    hp: 1, maxHp: 1, dmg: 1,
    radius: 13, scale: 1,
    state: 0, timer: 0, atkCd: 0, hurtCd: 0, flash: 0,
    slot: 0,
  };
}

function makePlayer(): Player {
  return {
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
    radius: 13, hp: 100, maxHp: 100, iframe: 0,
    speed: 190, damageMul: 1, fireRateMul: 1, projBonus: 0,
    xpMul: 1, critChance: 0.05, critMult: 2, armor: 0, regen: 0,
    pickupRange: 60,
    level: 1, xp: 0, xpNext: 10, pendingLevels: 0, face: 1,
  };
}

export class World {
  readonly enemies = new Pool<Enemy>(MAX_ENEMIES, makeEnemy);
  readonly projs = new Pool<Proj>(MAX_PROJ, makeProj);
  readonly pickups = new Pool<Pickup>(MAX_PICKUPS, makePickup);
  readonly pets = new Pool<Pet>(MAX_PETS, makePet);
  readonly hash = new SpatialHash(MAX_ENEMIES, HASH_CELL);
  readonly rng = new Rng();

  player: Player = makePlayer();

  /** 局内累计时间（秒） */
  time = 0;
  kills = 0;
  /** 本局赚取灵魂（单位 0.01，整数累计避免浮点误差）：普通怪 +1、精英 +10、Boss +1000 */
  soulCents = 0;
  /** 各武器累计伤害，用于结算页「最高伤害武器」 */
  dmgByWeapon = new Float64Array(32);
  /** 战斗区域半径（终焉收缩边界用），0 表示无限制 */
  arenaR = 0;
  /** 战斗区域圆心（终焉所在位置） */
  arenaX = 0;
  arenaY = 0;
  /** 运行模式：true = 无尽幽墟（Boss 定时刷新 / 击杀不清屏 / 无胜利目标）。每次 startRun 设置，reset 后归 false */
  endless = false;
  /** 玩家受伤回调（供 HUD 做受击闪白与震屏） */
  onPlayerHurt: ((amount: number) => void) | null = null;

  /** 查询缓冲：全局复用，避免热路径分配 */
  readonly qbuf = new Int32Array(1024);
  /**
   * 第二查询缓冲：供「在 qbuf 消费循环体内再发起的查询」使用（如溅射 explode），
   * 避免内层查询覆盖外层尚未消费完的 qbuf 结果（别名污染）。
   */
  readonly qbuf2 = new Int32Array(1024);

  reset(seed?: number): void {
    this.enemies.clear();
    this.projs.clear();
    this.pickups.clear();
    this.pets.clear();
    this.hash.clear();
    this.player = makePlayer();
    this.time = 0;
    this.kills = 0;
    this.soulCents = 0;
    this.dmgByWeapon.fill(0);
    // 竞技场/模式状态必须随局清零：否则上一局（如标准局终焉收缩圈）会残留，
    // 经 Game.ts 的 arena clamp 把下一局玩家吸到旧圆心、相机瞬移。
    this.arenaR = 0;
    this.arenaX = 0;
    this.arenaY = 0;
    this.endless = false;
    if (seed !== undefined) this.rng.reseed(seed);
  }

  /** 把所有敌人插入空间哈希并构建（每逻辑步一次） */
  buildHash(): void {
    const hash = this.hash;
    hash.clear();
    const list = this.enemies.items;
    const n = this.enemies.count;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (!e.dead) hash.insert(e.x, e.y, i);
    }
    hash.build();
  }
}

export type { Enemy, Proj, Pickup, Player, PickupKind };
