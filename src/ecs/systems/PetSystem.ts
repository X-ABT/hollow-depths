import { TAU } from '../../core/MathUtil';
import { damageEnemy, explode } from '../Damage';
import { PETS, petAtkFor, petFxColor } from '../../data/pets';
import type { Pet, World } from '../World';
import type { Vfx } from '../../render/Vfx';

/**
 * 出战宠物的 AI（独立于敌人/投射物体系）：
 * - 跟随玩家；索敌采用「近距 + 当前血量」加权评分，在扫描半径内选又近、血又厚的敌人追击/爪击；
 * - 攻击是**单体爪击**：只对选定的目标造成一次伤害，命中处闪现「三条竖线」爪痕；
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
/** sweep 扇形半角（弧度）：横扫覆盖主目标朝向两侧的范围 */
const SWEEP_HALF_ANGLE = 0.95;
/** sweep 扫击额外范围（相对 reach 的延伸） */
const SWEEP_RANGE_EXTRA = 110;
/** sweep 副目标伤害折算（主目标满伤，群怪收益在数量上） */
const SWEEP_SUB_DMG = 0.6;
/** smash 爆震半径相对 reach 的比例 */
const SMASH_RADIUS_RATIO = 0.9;
/** smash 最小半径（小体型宠保底，避免贴脸无圈） */
const SMASH_RADIUS_MIN = 34;
/** 横扫弧的基础视觉尺寸（随宠物体积微调，超巨兽不至于盖屏） */
function slashSize(scale: number): number {
  return Math.min(2.1, 0.9 + scale * 0.06);
}

export class PetSystem {
  private vfx: Vfx | null = null;
  /** 索敌候选缓冲（复用，避免热路径分配；巨型宠扫描半径大，容量需足够） */
  private readonly qbuf = new Int32Array(2048);

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

        // 索敌：扫描半径内按「当前血量 × 就近衰减」评分选最优目标，
        // 倾向又近、血又厚的敌人（Boss/精英被优先照顾，输出不浪费在残血小怪上）；
        // 巨型宠扫描半径大，可直接朝远处高价值目标奔袭
        const scan = Math.max(PET_REACH_BASE, reach + 120);
        const found = world.hash.query(pet.x, pet.y, scan, this.qbuf);
        let bestIdx = -1;
        let bestD = 0;
        let bestScore = -1;
        for (let k = 0; k < found; k++) {
          const e = world.enemies.items[this.qbuf[k]];
          if (!e || e.dead) continue;
          const dx = e.x - pet.x;
          const dy = e.y - pet.y;
          const d = Math.hypot(dx, dy) || 1;
          // 评分 = 当前血量 × (1 − 距离/扫描半径)：d→0 得分≈血量，d→扫描半径 得分→0
          const score = e.hp * (1 - d / scan);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = this.qbuf[k];
            bestD = d;
          }
        }
        let moved = false;
        if (bestIdx >= 0) {
          const e = world.enemies.items[bestIdx];
          const d = bestD;
          if (d <= reach + e.radius) {
            pet.vx = 0;
            pet.vy = 0;
            moved = true;
            if (pet.atkCd <= 0) {
              pet.atkCd = PET_ATK_BASE + Math.min(0.9, pet.scale * PET_ATK_PER_SCALE);
              pet.flash = 0.14;
              const def = PETS[pet.petIdx] ?? PETS[0];
              const fxColor = petFxColor(def);
              const src = PET_SRC_BASE + pet.slot;
              const atk = petAtkFor(def);
              if (atk === 'sweep') {
                // —— 扇形横扫：主目标满伤，横扫范围内朝向一致的敌人 0.6 ——
                const dealt = damageEnemy(world, e, pet.dmg, src, -1, 0.45, 0, 1);
                if (dealt > 0) {
                  // 沿宠物→主目标方向亮出月牙弧
                  const ang = Math.atan2(e.y - pet.y, e.x - pet.x);
                  this.vfx?.slash(e.x, e.y, ang, fxColor, slashSize(pet.scale));
                  this.vfx?.hit(e.x, e.y - 10, dealt, false);
                }
                // 扇形副目标判定：扫击沿宠物指向主目标方向的锥区（主目标已满伤，其余 0.6）
                {
                  const range = reach + SWEEP_RANGE_EXTRA;
                  const found2 = world.hash.query(pet.x, pet.y, range, this.qbuf);
                  const base = Math.atan2(e.y - pet.y, e.x - pet.x);
                  for (let k = 0; k < found2; k++) {
                    const o = world.enemies.items[this.qbuf[k]];
                    if (!o || o.dead || o === e) continue;
                    const ox = o.x - pet.x;
                    const oy = o.y - pet.y;
                    const od = Math.hypot(ox, oy) || 1;
                    if (od > range + o.radius) continue;
                    // 角度差归一化后判断是否落在横扫锥区
                    let diff = Math.atan2(oy, ox) - base;
                    while (diff > Math.PI) diff -= TAU;
                    while (diff < -Math.PI) diff += TAU;
                    if (Math.abs(diff) > SWEEP_HALF_ANGLE) continue;
                    const dealt2 = damageEnemy(world, o, pet.dmg * SWEEP_SUB_DMG, src, -1, 0.45, 0, 1);
                    if (dealt2 > 0) this.vfx?.hit(o.x, o.y - 10, dealt2, false);
                  }
                }
              } else if (atk === 'smash') {
                // —— 小范围拍击：以主目标为中心爆震（距离衰减由 explode 自带）——
                const rad = Math.max(SMASH_RADIUS_MIN, reach * SMASH_RADIUS_RATIO);
                const total = explode(world, e.x, e.y, rad, pet.dmg, src, -1, 0, 1, 0, 0, world.qbuf2);
                if (total > 0) {
                  this.vfx?.ring(e.x, e.y, fxColor, rad * 2);
                  this.vfx?.burst(e.x, e.y, 6, fxColor);
                  this.vfx?.hit(e.x, e.y - 10, total, false);
                }
              } else {
                // —— 单体撕咬（bite）：只打最优目标，命中位置亮染色「三条竖线」——
                const dealt = damageEnemy(world, e, pet.dmg, src, -1, 0.45, 0, 1);
                if (dealt > 0) {
                  this.vfx?.claw(e.x, e.y, fxColor);
                  this.vfx?.hit(e.x, e.y - 10, dealt, false);
                }
              }
            }
          } else {
            pet.vx = ((e.x - pet.x) / d) * PET_CHASE;
            pet.vy = ((e.y - pet.y) / d) * PET_CHASE;
            moved = true;
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
