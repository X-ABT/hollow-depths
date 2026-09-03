import { TAU } from '../../core/MathUtil';
import {
  BOSS_TIMES,
  ELITE_FIRST,
  ELITE_INTERVAL,
  ELITE_TABLE,
  MAX_ALIVE,
  SPAWN_MARGIN,
  SPAWN_TABLE,
  GRACE_SECONDS,
  damageScale,
  densityMul,
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
const GUNNER_MAX = 5;

/**
 * 波次生成：按时间轴决定「生成什么、生成多快、多强」。
 * 生成点始终在视口外一圈，玩家永远看不到敌人凭空出现。
 */
export class SpawnSystem {
  private acc = 0;
  private eliteT = ELITE_FIRST;
  private nextBoss = 0;
  private bossAnnounce: ((name: string) => void) | null = null;
  /** 古神是否已被击败（击败后才允许周期刷深渊炮手） */
  private postHerald = false;
  /** 深渊炮手刷新倒计时 */
  private gunnerT = 0;
  /** 首次是否一次性批量 3 只（之后每次 1 只） */
  private gunnerFirst = true;

  onBoss(cb: (name: string) => void): void {
    this.bossAnnounce = cb;
  }

  /** 古神被击败：开启深渊炮手的周期刷新（首次立即批量刷 3 只） */
  onHeraldDown(): void {
    this.postHerald = true;
    this.gunnerT = 0;
    this.gunnerFirst = true;
  }

  reset(): void {
    this.acc = 0;
    this.eliteT = ELITE_FIRST;
    this.nextBoss = 0;
    this.postHerald = false;
    this.gunnerT = 0;
    this.gunnerFirst = true;
  }

  update(world: World, dt: number, viewW: number, viewH: number): void {
    const t = world.time;
    const p = world.player;

    // ——— Boss ———
    while (this.nextBoss < BOSS_TIMES.length && t >= BOSS_TIMES[this.nextBoss].t) {
      const entry = BOSS_TIMES[this.nextBoss];
      this.nextBoss++;
      const idx = IDX.get(entry.id) ?? -1;
      if (idx >= 0) {
        const a = world.rng.next() * TAU;
        const dist = Math.max(viewW, viewH) * 0.42 + 120;
        const e = spawnEnemy(
          world,
          idx,
          p.x + Math.cos(a) * dist,
          p.y + Math.sin(a) * dist,
          hpScale(t),
          damageScale(t),
        );
        if (e) {
          world.arenaX = e.x;
          world.arenaY = e.y;
          this.bossAnnounce?.(ENEMY_BY_INDEX[idx].name);
        }
      }
    }

    // ——— 深渊炮手：古神死后周期刷新（Boss 存活期间不刷，同屏最多 5 只） ———
    if (this.postHerald && GUNNER_IDX >= 0 && !this.hasLiveBoss(world)) {
      this.gunnerT -= dt;
      if (this.gunnerT <= 0) {
        this.gunnerT = GUNNER_INTERVAL;
        // 清点场上存活的深渊炮手
        let alive = 0;
        const elist = world.enemies.items;
        for (let i = 0; i < world.enemies.count; i++) {
          const g = elist[i];
          if (!g.dead && g.defIdx === GUNNER_IDX) alive++;
        }
        if (alive < GUNNER_MAX) {
          // 首次一次性补到 3 只，之后每批 1 只；均受同屏上限约束
          const batch = this.gunnerFirst ? 3 : 1;
          this.gunnerFirst = false;
          const hp = hpScale(t);
          const dmg = damageScale(t);
          const r = Math.max(viewW, viewH) * 0.5 + SPAWN_MARGIN;
          for (let b = 0; b < batch && alive + b < GUNNER_MAX; b++) {
            const a = world.rng.next() * TAU;
            spawnEnemy(
              world,
              GUNNER_IDX,
              p.x + Math.cos(a) * r,
              p.y + Math.sin(a) * r,
              hp,
              dmg,
            );
          }
        }
      }
    }

    // ——— 精英 ———
    if (t >= ELITE_FIRST) {
      this.eliteT -= dt;
      if (this.eliteT <= 0) {
        this.eliteT = ELITE_INTERVAL;
        const pick = this.pickWeighted(world, ELITE_TABLE, t);
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
    let rate = spawnRate(t) * densityMul(t);
    if (this.hasLiveBoss(world)) rate *= 0.12;
    this.acc += rate * dt;
    const half = Math.max(viewW, viewH) * 0.5 + SPAWN_MARGIN;
    let guard = 64; // 单步生成上限，防止极端掉帧后一次性铺满
    const hp = hpScale(t);
    const dmg = damageScale(t);
    while (this.acc >= 1 && guard-- > 0) {
      this.acc -= 1;
      const pick = this.pickWeighted(world, SPAWN_TABLE, t);
      if (pick < 0) break;
      const a = world.rng.next() * TAU;
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
