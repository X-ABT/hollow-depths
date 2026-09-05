import { PickupKind, type Enemy } from '../Components';
import { spawnPickup } from '../Spawn';
import { ENEMY_BY_INDEX } from '../../data/enemies';
import type { World } from '../World';
import type { Vfx } from '../../render/Vfx';

/**
 * 帧末统一回收：死亡敌人 → 掉落 → 回池。
 *
 * 为什么不在造成伤害时立刻回收：伤害发生在遍历敌人的循环里，
 * 立刻 swap-remove 会打乱正在进行的迭代。统一延后到帧末处理，
 * 逻辑更简单也不会漏掉掉落。
 */
export class CleanupSystem {
  private vfx: Vfx | null = null;
  onBossKilled: (name: string) => void = () => {};
  /** 本帧是否有 Boss 死亡：若是，帧末清空场上其余敌人 */
  private wipeAfterBoss = false;

  attachVfx(vfx: Vfx): void {
    this.vfx = vfx;
  }

  update(world: World): void {
    this.wipeAfterBoss = false;
    const list = world.enemies.items;
    for (let i = world.enemies.count - 1; i >= 0; i--) {
      const e: Enemy = list[i];
      if (!e.dead) continue;

      world.kills++;
      // 灵魂入账（跨局货币，单位 0.01）：普通 +0.01 / 精英 +0.1 / Boss +10
      world.soulCents += e.isBoss ? 1000 : e.isElite ? 10 : 1;

      if (e.isBoss) {
        // Boss：大爆炸 + 五个技能宝箱 + 全屏吸经验；无尽模式不再清空其余小怪
        this.vfx?.explosion(e.x, e.y, 46, 0xf5c451);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          spawnPickup(world, PickupKind.Chest, 1, e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46);
        }
        const plist = world.pickups.items;
        for (let k = 0; k < world.pickups.count; k++) {
          if (plist[k].kind === PickupKind.Xp) plist[k].magnet = true;
        }
        if (!world.endless) this.wipeAfterBoss = true;
        // 击杀名直接取自敌人定义表（支持 5+ 只 Boss 而不依赖 bossIdx 硬映射）
        const defName = ENEMY_BY_INDEX[e.defIdx]?.id ?? '';
        this.onBossKilled(defName);
      } else if (e.isElite) {
        // 精英（含深渊炮手）：不给宝箱，爆 5~7 颗黄色经验宝石（value>6 → 大经验渲染）
        this.vfx?.explosion(e.x, e.y, 18, 0xffd97a);
        const n = 5 + ((world.rng.next() * 3) | 0); // 5..7
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          spawnPickup(world, PickupKind.Xp, 7, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
        }
      } else {
        this.vfx?.burst(e.x, e.y, 5, 0x9dfbc4);
        // 约 45% 概率掉落，价值按比例补偿，控制同屏拾取物总量
        if (world.rng.next() < 0.45) {
          spawnPickup(world, PickupKind.Xp, Math.max(1, Math.ceil(e.xp / 0.45)), e.x, e.y);
        }
      }

      world.enemies.releaseAt(i);
    }

    // ——— Boss 死亡后清场：把场上仍在的敌人全部移除（不给掉落，直接清屏） ———
    if (this.wipeAfterBoss) {
      for (let i = world.enemies.count - 1; i >= 0; i--) {
        world.enemies.releaseAt(i);
      }
    }
  }
}
