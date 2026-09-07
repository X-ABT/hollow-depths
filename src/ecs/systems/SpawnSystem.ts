import { TAU } from '../../core/MathUtil';
import {
  BOSS_ORDER,
  ELITE_FIRST,
  ELITE_INTERVAL,
  ELITE_TABLE,
  ENDLESS_ELITE_FIRST,
  ENDLESS_ELITE_INTERVAL,
  ENDLESS_ELITE_TABLE,
  ENDLESS_FIRST_BOSS_AT,
  ENDLESS_GUNNER_FIRST_BATCH,
  ENDLESS_GUNNER_FROM,
  ENDLESS_GUNNER_INTERVAL,
  ENDLESS_GUNNER_MAX,
  ENDLESS_ORDER,
  ENDLESS_SPAWN_TABLE,
  STAGE3_GUNNER_FIRST_BATCH,
  STAGE3_GUNNER_FROM,
  STAGE3_GUNNER_INTERVAL,
  STAGE3_GUNNER_MAX,
  STAGE3_ORDER,
  FIRST_BOSS_AT,
  MAX_ALIVE,
  NEXT_BOSS_GAP,
  SPAWN_MARGIN,
  SPAWN_TABLE,
  GRACE_SECONDS,
  bossHpMulByKillTime,
  damageScale,
  densityMul,
  endlessBossCastMul,
  endlessBossGap,
  endlessBossHpMul,
  endlessBossSpeedMul,
  endlessMinionDmgMul,
  endlessMinionHpMul,
  hpScale,
  spawnRate,
} from '../../data/waves';
import { ENEMY_BY_INDEX } from '../../data/enemies';
import { spawnEnemy } from '../Spawn';
import type { World } from '../World';

/** id → 敌人总表下标（启动时构建一次，避免热路径里反复 findIndex） */
const IDX = new Map<string, number>(ENEMY_BY_INDEX.map((d, i) => [d.id, i]));
/** 深渊炮手总表下标（古神死后周期性刷新用） */
const GUNNER_IDX = ENEMY_BY_INDEX.findIndex((d) => d.id === 'gunner');
/** 巢母总表下标（判定「巢母在场是否解除 Boss 战小怪压制」用；巢母只出现在关卡3） */
const NEST_IDX = ENEMY_BY_INDEX.findIndex((d) => d.id === 'nest');
/** 深渊炮手单次批量间隔（秒）与同屏上限 */
const GUNNER_INTERVAL = 5;
const GUNNER_MAX = 3;
/** 普通怪按上/下/左/右四边随机刷新的主边，每条边持续时长（秒）：1s 换一次边 */
const SPAWN_SIDE_SECONDS = 1;
/** 特殊关卡：首波 / 批间隔（秒）与每批同种 Boss 数量 */
const SPECIAL_FIRST_WAVE_AT = 180;
const SPECIAL_WAVE_GAP = 180;
const SPECIAL_BATCH = 3;

/**
 * 波次生成：按时间轴决定「生成什么、生成多快、多强」。
 * 生成点始终在视口外一圈，玩家永远看不到敌人凭空出现。
 */
export class SpawnSystem {
  private acc = 0;
  private eliteT = ELITE_FIRST;
  /** BOSS_ORDER 中「下一个要出现的 Boss」下标 */
  private nextBoss = 0;
  /** 该 Boss 计划出现的绝对时间；Infinity 表示「等上一只 Boss 死亡后再排」 */
  private bossSpawnAt = FIRST_BOSS_AT;
  /** 当前这只 Boss 实际刷出的游戏时刻（击杀后用于计算战斗耗时） */
  private bossBornAt = 0;
  /** 下一只 Boss 的血量倍率：由上一只 Boss 的击杀耗时决定（快杀则更肉，默认 1） */
  private nextBossHpMul = 1;
  /** 当前模式的 Boss 出场顺序（无尽→ENDLESS_ORDER / 关卡3→STAGE3_ORDER / 其余→BOSS_ORDER）；reset 时按 world 标志确定 */
  private bossOrder: readonly string[] = BOSS_ORDER;
  /** 普通小怪刷新永久倍率：每次快杀 Boss 累乘对应档位，永不回退（仅普通怪，精英/炮手不受影响） */
  private minionRushMul = 1;
  private bossAnnounce: ((name: string) => void) | null = null;
  /** 古神是否已被击败（击败后才允许周期刷深渊炮手） */
  private postHerald = false;
  /** 深渊炮手刷新倒计时 */
  private gunnerT = 0;
  /** 首次是否一次性批量 3 只（之后每次 1 只） */
  private gunnerFirst = true;
  /** 击败首个 Boss 前普通怪生成倍率：减半让开局更从容；击败古神后升到 0.7（仍少于满额） */
  private earlySpawnMul = 0.5;
  /** 无尽幽墟：当前 Boss 出场轮次（从 1 起，每刷一只 +1；用于逐轮强化血量/移速/技能频率） */
  private endlessRound = 1;
  /** 方向轮换刷新计时 */
  private spawnDirT = 0;
  private spawnDir = 0;
  /** 特殊关卡 Boss 状态（与标准/无尽单 Boss 流程完全隔离） */
  private specialSeq = 0; // BOSS_ORDER 下标：0古神 / 1灾厄 / 2终焉
  private specialWaveAt = Number.POSITIVE_INFINITY; // 下一批刷出时刻（首波 180s）
  private specialBornAt = 0; // 本批刷出时刻（用于「全灭耗时」结算激励）
  private specialKills = 0; // 本批已击杀数（满 SPECIAL_BATCH 才结算）
  private specialPendingMul = 1; // 下一批 Boss 血量倍率（消费后归 1）
  private specialDone = false;
  private specialCleared: (() => void) | null = null;

  onBoss(cb: (name: string) => void): void {
    this.bossAnnounce = cb;
  }

  /** 特殊关卡：3×终焉全灭后的通关回调（由 Game 触发 endRun(true)） */
  onSpecialCleared(cb: () => void): void {
    this.specialCleared = cb;
  }

  /** 古神被击败：生成倍率升到 70% + 开启深渊炮手的周期刷新（首次立即批量刷 3 只） */
  onHeraldDown(): void {
    this.postHerald = true;
    this.gunnerT = 0;
    this.gunnerFirst = true;
    this.earlySpawnMul = 0.7;
  }

  /** 关卡3：击败首只 Boss（泣灵）后普通怪生成基础倍率升满 1.0（关卡3 无古神解锁流程，节奏对齐关卡1 后期） */
  onStage3BossDown(): void {
    this.earlySpawnMul = 1;
  }

  /**
   * 上一只 Boss 已被击败：按「击杀耗时」结算下一只 Boss 的血量倍率，
   * 并安排它在 4 分钟后出现。若无后续 Boss（终焉被击杀）则不再调度。
   */
  scheduleNextBoss(now: number): void {
    if (this.nextBoss >= this.bossOrder.length) return;
    const mul = bossHpMulByKillTime(now - this.bossBornAt);
    this.nextBossHpMul = mul; // 下一只 Boss 血量：按击杀耗时档位
    this.minionRushMul *= mul; // 快杀 → 普通小怪刷新永久提速（慢杀为 ×1，不影响；不设回退）
    this.bossSpawnAt = now + NEXT_BOSS_GAP;
  }

  /**
   * 特殊关卡：一批同种 Boss 中的一只被击杀。
   * 累计满 SPECIAL_BATCH(3) 才按「本批全灭耗时」结算快杀激励并推进；
   * 终焉批全灭 → 置 specialDone 并回调 Game 通关。
   */
  onSpecialBossKilled(now: number): void {
    if (this.specialDone) return;
    this.specialKills++;
    if (this.specialKills < SPECIAL_BATCH) return;
    this.specialKills = 0;
    const mul = bossHpMulByKillTime(now - this.specialBornAt);
    this.minionRushMul *= mul; // 快杀激励：与关卡1/2 同规则，普通怪刷新永久提速、不设回退
    if (this.specialSeq >= BOSS_ORDER.length - 1) {
      // 3×终焉全灭 → 通关
      this.specialDone = true;
      this.specialCleared?.();
      return;
    }
    this.specialSeq++;
    this.specialPendingMul = mul;
    this.specialWaveAt = now + SPECIAL_WAVE_GAP;
  }

  /** 下一次 Boss 倒计时信息（含血量倍率）；标准局中 Boss 正在场时返回 null，无尽模式常显 */
  nextBossInfo(world: World): { defIdx: number; remain: number; mul: number } | null {
    // 特殊关卡：三连批倒计时（Boss 在场或已完成时返回 null）
    if (world.special) {
      if (this.specialDone || this.hasLiveBoss(world)) return null;
      if (!Number.isFinite(this.specialWaveAt)) return null;
      const remain = this.specialWaveAt - world.time;
      if (remain <= 0) return null;
      const defIdx = IDX.get(BOSS_ORDER[this.specialSeq]) ?? -1;
      if (defIdx < 0) return null;
      return { defIdx, remain, mul: this.specialPendingMul };
    }
    if (this.nextBoss >= this.bossOrder.length) return null;
    if (!world.endless && this.hasLiveBoss(world)) return null;
    if (!Number.isFinite(this.bossSpawnAt)) return null;
    const remain = this.bossSpawnAt - world.time;
    if (remain <= 0) return null;
    const defIdx = IDX.get(this.bossOrder[this.nextBoss]) ?? -1;
    if (defIdx < 0) return null;
    return { defIdx, remain, mul: this.nextBossHpMul };
  }

  reset(world?: World): void {
    const endless = world?.endless === true;
    this.acc = 0;
    // 出场顺序按模式确定：无尽→ENDLESS_ORDER / 关卡3→STAGE3_ORDER / 其余（关卡1/2/特殊/远征）→BOSS_ORDER
    this.bossOrder = endless ? ENDLESS_ORDER : world?.stage3 === true ? STAGE3_ORDER : BOSS_ORDER;
    // 精英倒计时只在 t >= 首次阈值后才走动：标准局初始化为 ELITE_FIRST 会造成「首刷 ≈ 2×阈值」，
    // 无尽模式刻意初始化为 0，让首只在刚过 ENDLESS_ELITE_FIRST 时立即刷出（更快进入高频精英节奏）。
    this.eliteT = endless ? 0 : ELITE_FIRST;
    this.nextBoss = 0;
    this.bossSpawnAt = endless ? ENDLESS_FIRST_BOSS_AT : FIRST_BOSS_AT;
    this.bossBornAt = 0;
    this.nextBossHpMul = 1;
    this.minionRushMul = 1;
    this.postHerald = false;
    this.gunnerT = 0;
    this.gunnerFirst = true;
    this.earlySpawnMul = 0.5;
    this.spawnDirT = 0;
    this.spawnDir = 0;
    this.endlessRound = 1;
    // 特殊关卡：三连批状态（与无尽/标准互斥；非特殊关保持空闲）
    const special = world?.special === true;
    this.specialSeq = 0;
    this.specialWaveAt = special ? SPECIAL_FIRST_WAVE_AT : Number.POSITIVE_INFINITY;
    this.specialBornAt = 0;
    this.specialKills = 0;
    this.specialPendingMul = 1;
    this.specialDone = false;
  }

  update(world: World, dt: number, viewW: number, viewH: number): void {
    const t = world.time;
    const p = world.player;

    // ——— Boss：标准局事件驱动（古神 5:00 出场，之后每击败一个隔 4 分钟出下一只）；
    // 无尽幽墟按时间定时刷一只（可多只并存），5 只 Boss 无限循环；
    // 无尽 Boss 逐轮强化：血量/移速/技能频率随轮次递增，出场间隔随轮次逐步缩短 ———
    if (
      !world.special && // 特殊关卡走下方独立三连批调度，避免与单 Boss 流程双重刷怪
      this.nextBoss < this.bossOrder.length &&
      t >= this.bossSpawnAt &&
      (world.endless || !this.hasLiveBoss(world))
    ) {
      const id = this.bossOrder[this.nextBoss];
      if (world.endless) {
        // 无尽：按当前轮次强化刷出，并排定下一只（轮次 +1 → 间隔随之变短）
        const round = this.endlessRound;
        this.endlessRound++;
        this.nextBoss = (this.nextBoss + 1) % this.bossOrder.length;
        // 间隔以「本轮」计算：第 1 只后仍等 240s（与旧版一致），第 2 只后 225s，逐轮递减至下限 150s
        this.bossSpawnAt = t + endlessBossGap(round);
        const idx = IDX.get(id) ?? -1;
        if (idx >= 0) {
          const a = world.rng.next() * TAU;
          const dist = Math.max(viewW, viewH) * 0.42 + 120;
          const e = spawnEnemy(
            world,
            idx,
            p.x + Math.cos(a) * dist,
            p.y + Math.sin(a) * dist,
            // 基础随时间成长 × 无尽逐轮强化
            hpScale(t) * endlessBossHpMul(round),
            damageScale(t),
          );
          if (e) {
            // 逐轮强化落地：移速 × 、技能释放间隔 ÷（castMul）
            const def = ENEMY_BY_INDEX[idx];
            e.speed = def.speed * endlessBossSpeedMul(round);
            e.castMul = endlessBossCastMul(round);
            world.arenaX = e.x;
            world.arenaY = e.y;
            this.bossAnnounce?.(def.name);
          }
        }
      } else {
        this.nextBoss++;
        this.bossSpawnAt = Number.POSITIVE_INFINITY; // 出完后等击败再排下一只
        const idx = IDX.get(id) ?? -1;
        if (idx >= 0) {
          const a = world.rng.next() * TAU;
          const dist = Math.max(viewW, viewH) * 0.42 + 120;
          const e = spawnEnemy(
            world,
            idx,
            p.x + Math.cos(a) * dist,
            p.y + Math.sin(a) * dist,
            // 快杀激励：上一只 Boss 击杀耗时越短，这一只血量越厚
            hpScale(t) * this.nextBossHpMul,
            damageScale(t),
          );
          if (e) {
            world.arenaX = e.x;
            world.arenaY = e.y;
            this.bossBornAt = world.time; // 记录刷出时刻，供本次击杀耗时计算
            this.nextBossHpMul = 1; // 本次倍率已消费，等下一只被击败后再由击杀耗时决定
            this.bossAnnounce?.(ENEMY_BY_INDEX[idx].name);
          }
        }
      }
    }

    // ——— 特殊关卡：每 180s 同种 Boss×3（古神→灾厄→终焉）———
    // 首波 180s；本批 3 只全灭后才由 onSpecialBossKilled 排下一批（批间隔 180s）；
    // 击败一轮 3 只终焉 → specialCleared 触发 Game 通关。小怪/精英/炮手仍走关卡1 逻辑。
    if (world.special) {
      const idx = IDX.get(BOSS_ORDER[this.specialSeq]) ?? -1;
      if (!this.specialDone && idx >= 0 && !this.hasLiveBoss(world) && t >= this.specialWaveAt) {
        this.specialWaveAt = Number.POSITIVE_INFINITY; // 等本批全灭后再由击杀结算排下一批
        this.specialBornAt = t;
        const dist = Math.max(viewW, viewH) * 0.42 + 120;
        const base = world.rng.next() * TAU;
        let announced = false;
        for (let k = 0; k < SPECIAL_BATCH; k++) {
          const a = base + (k / SPECIAL_BATCH) * TAU;
          const e = spawnEnemy(
            world,
            idx,
            p.x + Math.cos(a) * dist,
            p.y + Math.sin(a) * dist,
            // 快杀激励：上一批全灭越快，这一批 Boss 越肉
            hpScale(t) * this.specialPendingMul,
            damageScale(t),
          );
          if (e && !announced) {
            announced = true;
            world.arenaX = e.x;
            world.arenaY = e.y;
            this.bossAnnounce?.(ENEMY_BY_INDEX[idx].name);
          }
        }
        this.specialPendingMul = 1; // 本次倍率已消费
      }
    }

    // ——— 深渊炮手 ———
    // 标准局：古神死后周期刷新（Boss 存活期间不刷，同屏最多 GUNNER_MAX 只）
    // 无尽幽墟：约 5 分钟起按时间驱动周期刷新（Boss 并存照刷，用无尽独立的上限与间隔）
    if (GUNNER_IDX >= 0) {
      if (world.endless) {
        // 无尽：到点才开始、周期刷新；首次一次性补到上限附近，之后每批 1 只
        if (t >= ENDLESS_GUNNER_FROM) {
          this.gunnerT -= dt;
          if (this.gunnerT <= 0) {
            this.gunnerT = ENDLESS_GUNNER_INTERVAL;
            const alive = this.countGunners(world);
            if (alive < ENDLESS_GUNNER_MAX) {
              const batch = this.gunnerFirst ? ENDLESS_GUNNER_FIRST_BATCH : 1;
              this.gunnerFirst = false;
              const hp = hpScale(t);
              const dmg = damageScale(t);
              const r = Math.max(viewW, viewH) * 0.5 + SPAWN_MARGIN;
              for (let b = 0; b < batch && alive + b < ENDLESS_GUNNER_MAX; b++) {
                const a = world.rng.next() * TAU;
                spawnEnemy(world, GUNNER_IDX, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, hp, dmg);
              }
            }
          }
        }
      } else if (world.stage3) {
        // 关卡3：约 3:00 起固定周期刷新（与 Boss 是否在场无关；同屏上限/首批/间隔走关卡3独立常量）
        if (t >= STAGE3_GUNNER_FROM) {
          this.gunnerT -= dt;
          if (this.gunnerT <= 0) {
            this.gunnerT = STAGE3_GUNNER_INTERVAL;
            const alive = this.countGunners(world);
            if (alive < STAGE3_GUNNER_MAX) {
              const batch = this.gunnerFirst ? STAGE3_GUNNER_FIRST_BATCH : 1;
              this.gunnerFirst = false;
              const hp = hpScale(t);
              const dmg = damageScale(t);
              const r = Math.max(viewW, viewH) * 0.5 + SPAWN_MARGIN;
              for (let b = 0; b < batch && alive + b < STAGE3_GUNNER_MAX; b++) {
                const a = world.rng.next() * TAU;
                spawnEnemy(world, GUNNER_IDX, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, hp, dmg);
              }
            }
          }
        }
      } else if (this.postHerald && !this.hasLiveBoss(world)) {
        this.gunnerT -= dt;
        if (this.gunnerT <= 0) {
          this.gunnerT = GUNNER_INTERVAL;
          const alive = this.countGunners(world);
          if (alive < GUNNER_MAX) {
            // 首次一次性补到 3 只，之后每批 1 只；均受同屏上限约束
            const batch = this.gunnerFirst ? 3 : 1;
            this.gunnerFirst = false;
            const hp = hpScale(t);
            const dmg = damageScale(t);
            const r = Math.max(viewW, viewH) * 0.5 + SPAWN_MARGIN;
            for (let b = 0; b < batch && alive + b < GUNNER_MAX; b++) {
              const a = world.rng.next() * TAU;
              spawnEnemy(world, GUNNER_IDX, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, hp, dmg);
            }
          }
        }
      }
    }

    // ——— 精英 ———
    // 无尽：首刷更早、间隔更短、解锁表提前（强度仍走 hpScale/damageScale，不套小怪指数曲线）
    if (t >= (world.endless ? ENDLESS_ELITE_FIRST : ELITE_FIRST)) {
      this.eliteT -= dt;
      if (this.eliteT <= 0) {
        this.eliteT = world.endless ? ENDLESS_ELITE_INTERVAL : ELITE_INTERVAL;
        const pick = this.pickWeighted(world, world.endless ? ENDLESS_ELITE_TABLE : ELITE_TABLE, t);
        if (pick >= 0) {
          const a = world.rng.next() * TAU;
          const r = Math.max(viewW, viewH) * 0.5 + SPAWN_MARGIN;
          spawnEnemy(
            world,
            pick,
            p.x + Math.cos(a) * r,
            p.y + Math.sin(a) * r,
            hpScale(t),
            damageScale(t),
          );
        }
      }
    }

    // ——— 普通怪 ———
    // 开局缓冲期内不生成，给玩家从容开局的时间
    if (t < GRACE_SECONDS) return;
    if (world.enemies.count >= MAX_ALIVE) {
      this.acc = 0;
      return;
    }
    // Boss 战：场上存活的怪大多是 Boss 附近的伴生怪，让玩家难以安全清怪。
    // 大幅降低普通怪的补充刷新，让 Boss 战聚焦在 Boss 本体与其主动召唤物上，
    // 避免「Boss 带着铺天盖地的小怪」同时追着玩家。
    // 例外：巢母（关卡3 最终 Boss）是「指挥小怪的母体」，其狂潮需要普通怪正常/爆发刷出，
    // 因此巢母在场时解除该压制，并把「狂潮 ×N」乘进速率（狂潮乘数由巢母 AI 逐帧维护）。
    const nestLive = this.hasNestBoss(world);
    let rate =
      spawnRate(t) * densityMul(t) * this.earlySpawnMul * this.minionRushMul * (nestLive ? world.minionBurstMul : 1);
    // 标准局 Boss 战聚焦本体；无尽模式 Boss 定时并存，普通怪继续按密度刷新
    if (!world.endless && this.hasLiveBoss(world) && !nestLive) rate *= 0.12;
    this.acc += rate * dt;

    // 上下左右随机选边：每秒随机换一条主边（0 上 / 1 右 / 2 下 / 3 左），
    // 怪潮沿所选整条边平铺生成（垂直方向固定在视口外、水平方向沿边随机均布），
    // 量大时也能摊开成一条线逼近，而不是挤在一个扇形里。
    this.spawnDirT += dt;
    if (this.spawnDirT >= SPAWN_SIDE_SECONDS) {
      this.spawnDirT = 0;
      this.spawnDir = (world.rng.next() * 4) | 0;
    }
    const side = this.spawnDir;
    const halfW = viewW * 0.5 + SPAWN_MARGIN;
    const halfH = viewH * 0.5 + SPAWN_MARGIN;
    let guard = 64; // 单步生成上限，防止极端掉帧后一次性铺满
    // 无尽幽墟：普通小怪用专属指数曲线（每 5 分钟 ×2），标准局用线性成长
    const hp = world.endless ? endlessMinionHpMul(t) : hpScale(t);
    const dmg = world.endless ? endlessMinionDmgMul(t) : damageScale(t);
    const table = world.endless ? ENDLESS_SPAWN_TABLE : SPAWN_TABLE;
    while (this.acc >= 1 && guard-- > 0) {
      this.acc -= 1;
      const pick = this.pickWeighted(world, table, t);
      if (pick < 0) break;
      // 沿当前主边平铺：垂直方向固定在视口外较远处，水平方向沿整条边随机均布
      const along = world.rng.next() * 2 - 1;
      let x = 0;
      let y = 0;
      if (side === 0) {
        // 上
        x = p.x + along * (viewW * 0.5);
        y = p.y - halfH;
      } else if (side === 1) {
        // 右
        x = p.x + halfW;
        y = p.y + along * (viewH * 0.5);
      } else if (side === 2) {
        // 下
        x = p.x + along * (viewW * 0.5);
        y = p.y + halfH;
      } else {
        // 左
        x = p.x - halfW;
        y = p.y + along * (viewH * 0.5);
      }
      spawnEnemy(world, pick, x, y, hp, dmg);
    }
  }

  /** 场上是否有存活 Boss */
  private hasLiveBoss(world: World): boolean {
    const list = world.enemies.items;
    for (let i = 0; i < world.enemies.count; i++) {
      if (list[i].isBoss && !list[i].dead) return true;
    }
    return false;
  }

  /** 场上是否有存活的巢母（关卡3：在场时解除 Boss 战小怪压制并允许狂潮刷怪） */
  private hasNestBoss(world: World): boolean {
    if (NEST_IDX < 0) return false;
    const list = world.enemies.items;
    for (let i = 0; i < world.enemies.count; i++) {
      if (!list[i].dead && list[i].defIdx === NEST_IDX) return true;
    }
    return false;
  }

  /** 场上存活的深渊炮手数量（标准/无尽两条刷新链共用） */
  private countGunners(world: World): number {
    const list = world.enemies.items;
    let alive = 0;
    for (let i = 0; i < world.enemies.count; i++) {
      const g = list[i];
      if (!g.dead && g.defIdx === GUNNER_IDX) alive++;
    }
    return alive;
  }

  /** 按权重随机挑选一个「已到出场时间」的敌人表项，返回总表下标 */
  private pickWeighted(world: World, table: readonly { id: string; from: number; weight: number }[], t: number): number {
    let total = 0;
    for (let i = 0; i < table.length; i++) {
      if (t >= table[i].from) total += table[i].weight;
    }
    if (total <= 0) return -1;
    let r = world.rng.next() * total;
    for (let i = 0; i < table.length; i++) {
      const e = table[i];
      if (t < e.from) continue;
      r -= e.weight;
      if (r <= 0) return IDX.get(e.id) ?? -1;
    }
    return -1;
  }
}
