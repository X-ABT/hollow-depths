import { PickupKind, type Pickup } from '../Components';
import { xpForLevel } from '../../core/MathUtil';
import type { World } from '../World';

/** 磁吸加速度 */
const PULL = 700;

/**
 * 拾取物：磁吸 → 收集 → 结算升级。
 * 距离判定不进空间哈希——拾取物只会朝玩家移动，直接遍历比维护第二份网格更省。
 */
export class PickupSystem {
  /** 本次收集获得的经验（已乘经验加成） */
  collectedXp = 0;
  /** 本次收集触发的宝箱次数（由外部转成升级弹窗） */
  chests = 0;
  onChest: (times: number) => void = () => {};
  onLevelUp: () => void = () => {};

  reset(): void {
    this.collectedXp = 0;
    this.chests = 0;
  }

  update(world: World, dt: number): void {
    const p = world.player;
    const list = world.pickups.items;
    const range = p.pickupRange;
    const range2 = range * range;

    for (let i = world.pickups.count - 1; i >= 0; i--) {
      const k: Pickup = list[i];
      k.px = k.x;
      k.py = k.y;
      k.life -= dt;
      if (k.life <= 0) {
        world.pickups.releaseAt(i);
        continue;
      }

      const dx = p.x - k.x;
      const dy = p.y - k.y;
      const d2 = dx * dx + dy * dy;

      // 磁吸：进入拾取范围后，宝石迅速加速奔向玩家。
      // 用「目标速度 = 朝玩家方向、速度上限随距离增大」保证能追上移动中的玩家，
      // 而不是只在玩家静止时才能吸到。
      if (k.magnet || d2 < range2) {
        k.magnet = true;
        const d = Math.sqrt(d2) || 1;
        const nvx = (dx / d) * PULL;
        const nvy = (dy / d) * PULL;
        // 指数趋近目标速度（响应更快，且不会因累加而发散）
        const ease = 1 - Math.exp(-14 * dt);
        k.vx += (nvx - k.vx) * ease;
        k.vy += (nvy - k.vy) * ease;
      } else {
        // 未磁吸：逐渐停下
        const dec = Math.exp(-6 * dt);
        k.vx *= dec;
        k.vy *= dec;
      }

      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.bob += dt * 6;

      // 收集判定：磁吸时用插值后位置，避免高速掠过时漏判
      const ex = p.x - k.x;
      const ey = p.y - k.y;
      const er = k.radius + p.radius;
      if (ex * ex + ey * ey <= er * er) {
        this.collect(world, k);
        world.pickups.releaseAt(i);
      }
    }
  }

  private collect(world: World, k: Pickup): void {
    const p = world.player;
    switch (k.kind) {
      case PickupKind.Xp: {
        const gain = k.value * p.xpMul;
        p.xp += gain;
        this.collectedXp += gain;
        while (p.xp >= p.xpNext) {
          p.xp -= p.xpNext;
          p.level++;
          p.xpNext = xpForLevel(p.level);
          p.pendingLevels++;
          this.onLevelUp();
        }
        break;
      }
      case PickupKind.Chest: {
        this.chests += k.value;
        this.onChest(k.value);
        break;
      }
      case PickupKind.Heal: {
        p.hp = Math.min(p.maxHp, p.hp + k.value);
        break;
      }
      case PickupKind.Magnet: {
        // 吸取场上全部经验宝石
        const list = world.pickups.items;
        for (let i = 0; i < world.pickups.count; i++) {
          if (list[i].kind === PickupKind.Xp) list[i].magnet = true;
        }
        break;
      }
      default:
        break;
    }
  }
}
