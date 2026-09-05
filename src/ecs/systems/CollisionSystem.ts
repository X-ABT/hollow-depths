import { Behavior, type Enemy, type Proj } from '../Components';
import { damageEnemy, damagePlayer, explode, immuneFor, lastCrit } from '../Damage';
import type { World } from '../World';
import type { Vfx } from '../../render/Vfx';

/**
 * 碰撞与伤害结算。
 *
 * 宽相全部走空间哈希（只查目标周围的格），窄相按投射物行为分四种：
 * 圆-圆（子弹 / 环绕）、圆-范围（冲击波 / 领域 / 落点印记）、
 * 线段-圆（光束）、点-圆（敌方弹幕与预警圈打玩家）。
 */
export class CollisionSystem {
  private vfx: Vfx | null = null;

  attachVfx(vfx: Vfx): void {
    this.vfx = vfx;
  }

  update(world: World, dt: number): void {
    const projs = world.projs.items;
    const enemies = world.enemies.items;
    const p = world.player;
    const qbuf = world.qbuf;

    // ————————— 1. 投射物 vs 敌人 / 玩家 —————————
    for (let i = world.projs.count - 1; i >= 0; i--) {
      const pr: Proj = projs[i];

      // ——— 敌方投射物打玩家 ———
      if (pr.hostile) {
        if (pr.behavior === Behavior.Field) {
          // 地面持续伤害区
          pr.tickT -= dt;
          if (pr.tickT <= 0) {
            pr.tickT = 0.5;
            const dx = p.x - pr.x;
            const dy = p.y - pr.y;
            if (dx * dx + dy * dy <= (pr.radius + p.radius) * (pr.radius + p.radius)) {
              damagePlayer(world, pr.dotDps * 0.5, 0.25);
            }
          }
          continue;
        }
        const dx = p.x - pr.x;
        const dy = p.y - pr.y;
        const rr = pr.radius + p.radius;
        if (dx * dx + dy * dy <= rr * rr && pr.behavior !== Behavior.Telegraph) {
          const dealt = damagePlayer(world, pr.damage);
          if (dealt > 0) {
            this.vfx?.burst(pr.x, pr.y, 6, 0xff5470);
            world.projs.releaseAt(i);
          }
        }
        continue;
      }

      const slot = pr.srcId >= 0 ? pr.srcId >> 4 : -1;
      const imm = immuneFor(pr.behavior);

      switch (pr.behavior) {
        case Behavior.Linear:
        case Behavior.Homing:
        case Behavior.Orbit: {
          const found = world.hash.query(pr.x, pr.y, pr.radius + 30, qbuf);
          for (let k = 0; k < found; k++) {
            if (pr.behavior !== Behavior.Orbit && pr.pierce <= 0) break;
            const idx = qbuf[k];
            const e: Enemy = enemies[idx];
            if (e.dead) continue;
            const dx = e.x - pr.x;
            const dy = e.y - pr.y;
            const rr = pr.radius + e.radius;
            if (dx * dx + dy * dy > rr * rr) continue;

            const d = Math.hypot(dx, dy) || 1;
            const dealt = damageEnemy(
              world,
              e,
              pr.damage,
              pr.srcId,
              slot,
              imm,
              pr.critChance,
              pr.critMult,
              pr.knockback > 0 ? (dx / d) * pr.knockback : 0,
              pr.knockback > 0 ? (dy / d) * pr.knockback : 0,
            );
            if (dealt <= 0) continue;

            this.vfx?.hit(pr.x, pr.y, dealt, lastCrit);
            this.vfx?.burst(pr.x, pr.y, lastCrit ? 8 : 4, lastCrit ? 0xf5c451 : 0x43e0ff);

            // 溅射（猎杀连锁进化）：explode 内部会再做哈希查询，
            // 必须用独立缓冲 qbuf2，避免覆盖外层正在消费的 qbuf 命中结果
            if (pr.splash > 0) {
              explode(world, pr.x, pr.y, pr.splash, pr.damage * 0.6, pr.srcId + 8, slot, 0, 1, 0, 0, world.qbuf2);
            }

            if (pr.behavior !== Behavior.Orbit) {
              pr.pierce--;
              if (pr.pierce <= 0) {
                world.projs.releaseAt(i);
                break;
              }
            }
          }
          break;
        }

        case Behavior.Aoe: {
          const found = world.hash.query(pr.x, pr.y, pr.radius, qbuf);
          for (let k = 0; k < found; k++) {
            const idx = qbuf[k];
            const e: Enemy = enemies[idx];
            if (e.dead) continue;
            const dx = e.x - pr.x;
            const dy = e.y - pr.y;
            const rr = pr.radius + e.radius;
            if (dx * dx + dy * dy > rr * rr) continue;
            const d = Math.hypot(dx, dy) || 1;
            const dealt = damageEnemy(
              world,
              e,
              pr.damage,
              pr.srcId,
              slot,
              imm,
              pr.critChance,
              pr.critMult,
              pr.knockback > 0 ? (dx / d) * pr.knockback : 0,
              pr.knockback > 0 ? (dy / d) * pr.knockback : 0,
            );
            if (dealt > 0) {
              this.vfx?.hit(e.x, e.y, dealt, lastCrit);
            }
          }
          break;
        }

        case Behavior.Field: {
          const found = world.hash.query(pr.x, pr.y, pr.radius, qbuf);
          for (let k = 0; k < found; k++) {
            const idx = qbuf[k];
            const e: Enemy = enemies[idx];
            if (e.dead) continue;
            const dx = e.x - pr.x;
            const dy = e.y - pr.y;
            const rr = pr.radius + e.radius;
            if (dx * dx + dy * dy > rr * rr) continue;
            e.slowT = 0.35;
            e.slowF = pr.slowF;
            const dealt = damageEnemy(world, e, pr.dotDps * 0.4, pr.srcId, slot, imm, 0, 1);
            if (dealt > 0) this.vfx?.hit(e.x, e.y - e.radius, dealt, false);
          }
          break;
        }

        case Behavior.Beam: {
          // 线段-圆：把敌人投影到光束轴上，超出长度或偏离宽度即判未命中
          const cos = Math.cos(pr.angle);
          const sin = Math.sin(pr.angle);
          const half = pr.length * 0.5;
          const cx = pr.x + cos * half;
          const cy = pr.y + sin * half;
          const found = world.hash.query(cx, cy, half + pr.width, qbuf);
          let hits = 0;
          for (let k = 0; k < found; k++) {
            if (hits >= pr.pierce) break;
            const idx = qbuf[k];
            const e: Enemy = enemies[idx];
            if (e.dead) continue;
            const rx = e.x - pr.x;
            const ry = e.y - pr.y;
            const along = rx * cos + ry * sin;
            if (along < -e.radius || along > pr.length + e.radius) continue;
            const perp = Math.abs(-rx * sin + ry * cos);
            if (perp > pr.width * 0.5 + e.radius) continue;
            const dealt = damageEnemy(world, e, pr.damage, pr.srcId, slot, imm, pr.critChance, pr.critMult);
            if (dealt > 0) {
              hits++;
              this.vfx?.hit(e.x, e.y, dealt, lastCrit);
              this.vfx?.burst(e.x, e.y, 5, 0x43e0ff);
            }
          }
          break;
        }

        default:
          break;
      }
    }

    // ————————— 2. 敌人接触伤害 vs 玩家 —————————
    if (p.iframe <= 0) {
      const found = world.hash.query(p.x, p.y, p.radius + 34, qbuf);
      let total = 0;
      for (let k = 0; k < found; k++) {
        const e: Enemy = enemies[qbuf[k]];
        if (e.dead || e.hitCd > 0) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const rr = p.radius + e.radius;
        if (dx * dx + dy * dy > rr * rr) continue;
        total += e.damage;
        e.hitCd = 0.5;
        // 接触后轻微弹开，避免玩家被卡在怪堆中心连续掉血
        const d = Math.hypot(dx, dy) || 1;
        e.knockX -= (dx / d) * 120;
        e.knockY -= (dy / d) * 120;
      }
      if (total > 0) {
        const dealt = damagePlayer(world, total);
        if (dealt > 0) this.vfx?.burst(p.x, p.y, 10, 0xff5470);
      }
    }
  }
}
