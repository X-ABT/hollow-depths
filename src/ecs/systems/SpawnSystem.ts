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
/** 深渊炮手单次批量间隔（秒）与同屏上限 */
const GUNNER_INTERVAL = 5;
const GUNNER_MAX = 3;
/** 普通怪按方向轮换刷新的主方向（顺时针：上 → 右 → 下 → 左），每个方向持续时长（秒） */
const SPAWN_DIR_SECONDS = 5;
/** 每个主方向刷怪扇区的半宽（弧度）：既有方向性又不至于完全单向 */
const SPAWN_DIR_SECTOR = 0.9;
const SPAWN_DIR_ANGLES: readonly number[] = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

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

  onBoss(cb: (name: string) => void): void {
    this.bossAnnounce = cb;
  }

  /** 古神被击败：生成倍率升到 70% + 开启深渊炮手的周期刷新（首次立即批量刷 3 只） */
  onHeraldDown(): void {
    this.postHerald = true;
    this.gunnerT = 0;
    this.gunnerFirst = true;
    this.earlySpawnMul = 0.7;
  }

  /**
   * 上一只 Boss 已被击败：按「击杀耗时」结算下一只 Boss 的血量倍率，
   * 并安排它在 4 分钟后出现。若无后续 Boss（终焉被击杀）则不再调度。
   */
  scheduleNextBoss(now: number): void {
    if (this.nextBoss >= BOSS_ORDER.length) return;
    const mul = bossHpMulByKillTime(now - this.bossBornAt);
    this.nextBossHpMul = mul; // 下一只 Boss 血量：按击杀耗时档位
    this.minionRushMul *= mul; // 快杀 → 普通小怪刷新永久提速（慢杀为 ×1，不影响；不设回退）
    this.bossSpawnAt = now + NEXT_BOSS_GAP;
  }

  /** 下一次 Boss 倒计时信息（含血量倍率）；标准局中 Boss 正在场时返回 null，无尽模式常显 */
  nextBossInfo(world: World): { defIdx: number; remain: number; mul: number } | null {
    const bossOrder = world.endless ? ENDLESS_ORDER : BOSS_ORDER;
    if (this.nextBoss >= bossOrder.length) return null;
    if (!world.endless && this.hasLiveBoss(world)) return null;
    if (!Number.isFinite(this.bossSpawnAt)) return null;
    const remain = this.bossSpawnAt - world.time;
    if (remain <= 0) return null;
    const defIdx = IDX.get(bossOrder[this.nextBoss]) ?? -1;
    if (defIdx < 0) return null;
    return { defIdx, remain, mul: this.nextBossHpMul };
  }

  reset(world?: World): void {
    const endless = world?.endless === true;
    this.acc = 0;
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
  }

  update(world: World, dt: number, viewW: number, viewH: number): void {
    const t = world.time;
    const p = world.player;

    // ——— Boss：标准局事件驱动（古神 5:00 出场，之后每击败一个隔 4 分钟出下一只）；
    // 无尽幽墟按时间定时刷一只（可多只并存），5 只 Boss 无限循环；
    // 无尽 Boss 逐轮强化：血量/移速/技能频率随轮次递增，出场间隔随轮次逐步缩短 ———
    const bossOrder = world.endless ? ENDLESS_ORDER : BOSS_ORDER;
    if (
      this.nextBoss < bossOrder.length &&
      t >= this.bossSpawnAt &&
      (world.endless || !this.hasLiveBoss(world))
    ) {
      const id = bossOrder[this.nextBoss];
      if (world.endless) {
        // 无尽：按当前轮次强化刷出，并排定下一只（轮次 +1 → 间隔随之变短）
        const round = this.endlessRound;
        this.endlessRound++;
        this.nextBoss = (this.nextBoss + 1) % bossOrder.length;
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
    let rate = spawnRate(t) * densityMul(t) * this.earlySpawnMul * this.minionRushMul;
    // 标准局 Boss 战聚焦本体；无尽模式 Boss 定时并存，普通怪继续按密度刷新
    if (!world.endless && this.hasLiveBoss(world)) rate *= 0.12;
    this.acc += rate * dt;

    // 方向轮换：普通怪不四面八方同时涌来，而是按「上 → 右 → 下 → 左」顺时针，
    // 每 SPAWN_DIR_SECONDS 秒换一个主方向刷新；同屏四面围堵压力因此缓解，留出走位方向。
    this.spawnDirT += dt;
    if (this.spawnDirT >= SPAWN_DIR_SECONDS) {
      this.spawnDirT = 0;
      this.spawnDir = (this.spawnDir + 1) % SPAWN_DIR_ANGLES.length;
    }

    const half = Math.max(viewW, viewH) * 0.5 + SPAWN_MARGIN;
    const dirCenter = SPAWN_DIR_ANGLES[this.spawnDir];
    let guard = 64; // 单步生成上限，防止极端掉帧后一次性铺满
    // 无尽幽墟：普通小怪用专属指数曲线（每 5 分钟 ×2），标准局用线性成长
    const hp = world.endless ? endlessMinionHpMul(t) : hpScale(t);
    const dmg = world.endless ? endlessMinionDmgMul(t) : damageScale(t);
    const table = world.endless ? ENDLESS_SPAWN_TABLE : SPAWN_TABLE;
    while (this.acc >= 1 && guard-- > 0) {
      this.acc -= 1;
      const pick = this.pickWeighted(world, table, t);
      if (pick < 0) break;
      // 在当前方向扇区内随机取角，怪潮从同一个大方向压来但带些散布
      const a = dirCenter + (world.rng.next() * 2 - 1) * SPAWN_DIR_SECTOR;
      const x = p.x + Math.cos(a) * half;
      const y = p.y + Math.sin(a) * half;
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
