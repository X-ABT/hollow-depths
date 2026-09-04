import { TAU } from '../../core/MathUtil';
import { damageEnemy } from '../Damage';
import type { Pet, World } from '../World';
import type { Vfx } from '../../render/Vfx';

/**
 * 出战宠物的 AI（独立于敌人/投射物体系）：
 * - 跟随玩家；附近有敌人时冲向最近的敌人；
 * - 攻击是**单体爪击**：只对最近目标造成一次伤害，命中处闪现「三条竖线」爪痕；
 * - 被敌人接触会掉血，血归零不死亡：灰心逃回玩家身边数秒后满血回归（期间无敌）。
 */
const PET_CHASE = 205;
const PET_FLEE = 300;
/** 攻击基础冷却（秒），巨型宠因范围大而略微放慢 */
const PET_ATK_BASE = 0.85;
const PET_ATK_PER_SCALE = 0.055;
/** 撕咬基础范围（体积比例 =1 时） */
const PET_REACH_BASE = 34;
/** 撕咬范围上限（约半个屏的量级） */
const PET_REACH_MAX = 460;
/** 恢复（逃跑）时长 */
const PET_RECOVER = 3.2;
/** 受击结算间隔（秒） */
const PET_HURT_CD = 0.6;
/** 无敌人时回归的跟随半径（绕玩家一圈） */
const PET_FORM_R = 52;
/** 宠物专属伤害来源（3000 + 槽位），避免与武器投射物 srcId 冲突 */
const PET_SRC_BASE = 3000;

export class PetSystem {
  private vfx: Vfx | null = null;

  attachVfx(vfx: Vfx): void {
    this.vfx = vfx;
  }

  update(world: World, dt: number): void {
    const p0 = world.player;
    const list = world.pets.items;
    for (let i = world.pets.count - 1; i >= 0; i--) {
      const pet: Pet = list[i];
      if (pet.flash > 0) pet.flash -= dt;

      const reach = Math.min(PET_REACH_MAX, PET_REACH_BASE * pet.scale);

      // 跟随锚点：绕玩家一圈，按槽位错开相位
      const ang = (pet.slot / 3) * TAU + 0.6;
      const ax = p0.x + Math.cos(ang) * PET_FORM_R;
      const ay = p0.y + Math.sin(ang) * PET_FORM_R;

      pet.px = pet.x;
      pet.py = pet.y;

      if (pet.state === 1) {
        // ——— 灰心逃跑：无敌、加速回到玩家身边，计时结束后满血回归 ———
        pet.timer -= dt;
        const dx = ax - pet.x;
        const dy = ay - pet.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = d < 20 ? 0 : PET_FLEE;
        pet.vx = (dx / d) * sp;
        pet.vy = (dy / d) * sp;
        if (pet.timer <= 0) {
          pet.hp = pet.maxHp;
          pet.state = 0;
          pet.atkCd = 0.5;
          pet.flash = 0.2;
        }
      } else {
        pet.atkCd -= dt;
        pet.hurtCd -= dt;

        // 索敌：优先看撕咬可达范围内是否有敌人（巨型宠直接原地一口）
        const scan = Math.max(PET_REACH_BASE, reach + 120);
        const idx = world.hash.queryNearest(pet.x, pet.y, scan);
        let moved = false;
        if (idx >= 0) {
          const e = world.enemies.items[idx];
          if (e && !e.dead) {
            const dx = e.x - pet.x;
            const dy = e.y - pet.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d <= reach + e.radius) {
              pet.vx = 0;
              pet.vy = 0;
              moved = true;
              if (pet.atkCd <= 0) {
                pet.atkCd = PET_ATK_BASE + Math.min(0.9, pet.scale * PET_ATK_PER_SCALE);
                pet.flash = 0.14;
                // 单体爪击：只打最近这个目标，命中位置亮「三条竖线」
                const dealt = damageEnemy(
                  world,
                  e,
                  pet.dmg,
                  PET_SRC_BASE + pet.slot,
                  -1,
                  0.45,
                  0,
                  1,
                );
                if (dealt > 0) {
                  this.vfx?.claw(e.x, e.y);
                  this.vfx?.hit(e.x, e.y - 10, dealt, false);
                }
              }
            } else {
              pet.vx = (dx / d) * PET_CHASE;
              pet.vy = (dy / d) * PET_CHASE;
              moved = true;
            }
          }
        }
        if (!moved) {
          // 无目标：回归队形
          const dx = ax - pet.x;
          const dy = ay - pet.y;
          const d = Math.hypot(dx, dy) || 1;
          pet.vx = d < 14 ? 0 : (dx / d) * PET_CHASE;
          pet.vy = d < 14 ? 0 : (dy / d) * PET_CHASE;
        }

        // ——— 受击：只在宠物自身判定半径内被敌人碰到才会掉血 ———
        if (pet.hurtCd <= 0) {
          const hurtR = pet.radius + 30;
          const found = world.hash.query(pet.x, pet.y, hurtR, world.qbuf);
          for (let k = 0; k < found; k++) {
            const e = world.enemies.items[world.qbuf[k]];
            if (!e || e.dead) continue;
            const dx = e.x - pet.x;
            const dy = e.y - pet.y;
            const rr = pet.radius + e.radius;
            if (dx * dx + dy * dy > rr * rr) continue;
            pet.hp -= e.damage;
            pet.hurtCd = PET_HURT_CD;
            pet.flash = 0.16;
            if (pet.hp <= 0) {
              pet.hp = 0;
              pet.state = 1;
              pet.timer = PET_RECOVER;
              pet.vx = 0;
              pet.vy = 0;
            }
            break; // 每个结算间隔只吃一次伤害，避免被围殴瞬间融化
          }
        }
      }

      pet.x += pet.vx * dt;
      pet.y += pet.vy * dt;
    }
  }
}
