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

  attachVfx(vfx: Vfx): void {
    this.vfx = vfx;
  }

  update(world: World): void {
    const list = world.enemies.items;
    for (let i = world.enemies.count - 1; i >= 0; i--) {
      const e: Enemy = list[i];
      if (!e.dead) continue;

      world.kills++;

      if (e.isBoss) {
        // Boss：大爆炸 + 三个宝箱 + 全屏吸经验
        this.vfx?.explosion(e.x, e.y, 46, 0xf5c451);
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          spawnPickup(world, PickupKind.Chest, 1, e.x + Math.cos(a) * 46, e.y + Math.sin(a) * 46);
        }
        const plist = world.pickups.items;
        for (let k = 0; k < world.pickups.count; k++) {
          if (plist[k].kind === PickupKind.Xp) plist[k].magnet = true;
        }
        this.onBossKilled(e.bossIdx === 2 ? 'endless' : e.bossIdx === 1 ? 'calamity' : 'herald');
      } else if (ENEMY_BY_INDEX[e.defIdx].id === 'gunner') {
        // 深渊炮手：不给宝箱，爆一圈 4 颗经验宝石作为主要奖励
        this.vfx?.explosion(e.x, e.y, 20, 0x43e0ff);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          spawnPickup(world, PickupKind.Xp, 5, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
        }
      } else if (e.isElite) {
        this.vfx?.explosion(e.x, e.y, 18, 0xa97cff);
        spawnPickup(world, PickupKind.Chest, 1, e.x, e.y);
        spawnPickup(world, PickupKind.Xp, e.xp, e.x + 14, e.y);
      } else {
        this.vfx?.burst(e.x, e.y, 5, 0x9dfbc4);
        // 约 45% 概率掉落，价值按比例补偿，控制同屏拾取物总量
        if (world.rng.next() < 0.45) {
          spawnPickup(world, PickupKind.Xp, Math.max(1, Math.ceil(e.xp / 0.45)), e.x, e.y);
        }
      }

      world.enemies.releaseAt(i);
    }
  }
}
