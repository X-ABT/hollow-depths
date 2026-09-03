import { TAU, lerp } from '../../core/MathUtil';
import { Behavior, type Proj } from '../Components';
import { damagePlayer, explode } from '../Damage';
import type { World } from '../World';

/**
 * 投射物推进与生命周期。
 * 所有行为共用同一套「先记上一帧位置（供渲染插值）→ 推进 → 到期处理」流程。
 */
export class ProjectileSystem {
  update(world: World, dt: number): void {
    const list = world.projs.items;
    const p = world.player;

    for (let i = world.projs.count - 1; i >= 0; i--) {
      const pr: Proj = list[i];
      pr.px = pr.x;
      pr.py = pr.y;
      pr.life -= dt;

      switch (pr.behavior) {
        case Behavior.Linear: {
          pr.x += pr.vx * dt;
          pr.y += pr.vy * dt;
          break;
        }

        case Behavior.Homing: {
          pr.retarget -= dt;
          if (pr.retarget <= 0) {
            pr.retarget = 0.18;
            pr.targetIdx = world.hash.queryNearest(pr.x, pr.y, 900);
          }
          if (pr.targetIdx >= 0 && pr.targetIdx < world.enemies.count) {
            const e = world.enemies.items[pr.targetIdx];
            if (!e.dead) {
              const tx = e.x - pr.x;
              const ty = e.y - pr.y;
              const tl = Math.hypot(tx, ty) || 1;
              const sp = Math.hypot(pr.vx, pr.vy) || 1;
              // 朝目标方向做有限角速度转向（保留一点惯性，手感更自然）
              const cur = Math.atan2(pr.vy, pr.vx);
              let diff = Math.atan2(ty, tx) - cur;
              while (diff > Math.PI) diff -= TAU;
              while (diff < -Math.PI) diff += TAU;
              const maxTurn = pr.turn * dt;
              const na = cur + (diff > 0 ? Math.min(diff, maxTurn) : Math.max(diff, -maxTurn));
              pr.vx = Math.cos(na) * sp;
              pr.vy = Math.sin(na) * sp;
            } else {
              pr.targetIdx = -1;
            }
          }
          pr.x += pr.vx * dt;
          pr.y += pr.vy * dt;
          break;
        }

        case Behavior.Orbit: {
          pr.orbitAngle += pr.orbitSpeed * dt;
          pr.x = p.x + Math.cos(pr.orbitAngle) * pr.orbitRadius;
          pr.y = p.y + Math.sin(pr.orbitAngle) * pr.orbitRadius;
          break;
        }

        case Behavior.Aoe: {
          const t = 1 - pr.life / pr.maxLife;
          pr.radius = lerp(pr.r0, pr.r1, t < 0 ? 0 : t > 1 ? 1 : t);
          break;
        }

        case Behavior.Beam: {
          // 光束锚定在发射点，短促存在
          break;
        }

        case Behavior.Field: {
          if (pr.follow) {
            pr.x = p.x;
            pr.y = p.y;
          }
          break;
        }

        case Behavior.Mark: {
          // 落点固定，到期爆发
          break;
        }

        case Behavior.Telegraph: {
          // 预警圈：静止，到期由下方统一处理
          break;
        }

        default:
          break;
      }

      if (pr.rotSpeed !== 0) pr.rot += pr.rotSpeed * dt;

      // ——— 生命周期结束 ———
      if (pr.life <= 0) {
        if (pr.behavior === Behavior.Mark) {
          explode(
            world,
            pr.x,
            pr.y,
            pr.r1,
            pr.damage,
            pr.srcId,
            pr.hostile ? -1 : pr.srcId >> 4,
            pr.critChance,
            pr.critMult,
            pr.knockback,
            0,
          );
        } else if (pr.behavior === Behavior.Telegraph) {
          // 预警结束 → 对玩家结算
          const dx = p.x - pr.x;
          const dy = p.y - pr.y;
          if (dx * dx + dy * dy <= (pr.radius + p.radius) * (pr.radius + p.radius)) {
            damagePlayer(world, pr.damage);
          }
        }
        world.projs.releaseAt(i);
      }
    }
  }
}
