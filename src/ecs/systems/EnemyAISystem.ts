import { TAU } from '../../core/MathUtil';
import { Ai, type Enemy } from '../Components';
import { ENEMY_BY_INDEX } from '../../data/enemies';
import { spawnEnemy, spawnProj } from '../Spawn';
import { Behavior } from '../Components';
import type { World } from '../World';
import type { Vfx } from '../../render/Vfx';

/** 分离力强度：越大越不容易重叠成一坨 */
const SEP_FORCE = 240;
/** 分离目标缝隙（px）：怪与怪之间至少保持的间距，让潮水间留有可走位的缝 */
const SEP_GAP = 12;
/** Boss 受分离力的影响系数（Boss 质量大，不该被小怪推着走） */
const BOSS_SEP_MUL = 0.12;
/** Boss 技能前摇（蓄力警示）时长（秒） */
const CAST_WINDOW = 0.7;
/** 古神霜噬领域的落点警示时长（秒）：比通用前摇更长，给玩家留足走位反应时间 */
const HERALD_FIELD_WARN = 1.4;
/** Boss 技能释放后的安全间歇区间（秒） */
const SKILL_GAP: readonly [number, number] = [2.0, 3.0];
/** 终焉单轮无敌时长（秒）：期间不受伤害、边界固定 900，只能躲避环向弹幕 */
const ENDLESS_INVULN = 15;
/** 终焉破防窗口时长（秒）：窗口内可被击杀；超时未击杀则再次进入无敌（循环） */
const ENDLESS_OPEN = 30;

/**
 * 敌人 AI + 分离力 + 位移积分。
 *
 * 分离力复用碰撞用的同一份空间哈希（不额外构建），
 * 让怪潮既有「成群压过来」的压迫感，又不会全部重叠成一个点——
 * 后者会让命中判定变得难以阅读，也会浪费大量渲染开销。
 */
export class EnemyAISystem {
  private vfx: Vfx | null = null;

  attachVfx(vfx: Vfx): void {
    this.vfx = vfx;
  }

  /** Boss 技能安全间歇（秒），2~3s 随机 */
  private gap(rng: World['rng']): number {
    return SKILL_GAP[0] + rng.next() * (SKILL_GAP[1] - SKILL_GAP[0]);
  }
  update(world: World, dt: number): void {
    const list = world.enemies.items;
    const n = world.enemies.count;
    const p = world.player;
    const hash = world.hash;
    const qbuf = world.qbuf;
    const rng = world.rng;

    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.dead) continue;
      const def = ENEMY_BY_INDEX[e.defIdx];

      e.px = e.x;
      e.py = e.y;

      // ——— 计时器 ———
      if (e.flash > 0) e.flash -= dt;
      if (e.srcImmune > 0) e.srcImmune -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.hitCd > 0) e.hitCd -= dt;

      const speed = e.speed * (e.slowT > 0 ? e.slowF : 1);
      let dx = p.x - e.x;
      let dy = p.y - e.y;
      let d = Math.hypot(dx, dy) || 1;
      const nx = dx / d;
      const ny = dy / d;

      let vx = 0;
      let vy = 0;

      switch (e.ai) {
        case Ai.Chase:
        case Ai.Shielded:
        case Ai.Trickster: {
          vx = nx * speed;
          vy = ny * speed;
          break;
        }

        case Ai.Dash: {
          e.timer -= dt;
          if (e.state === 0) {
            // 蓄力：原地不动并锁定方向（蓄力期间不再缓慢逼近）
            vx = 0;
            vy = 0;
            if (e.timer <= 0) {
              e.state = 1;
              e.timer = 0.6; // 冲刺时长
              e.angle = Math.atan2(dy, dx);
            }
          } else {
            vx = Math.cos(e.angle) * speed * def.p1;
            vy = Math.sin(e.angle) * speed * def.p1;
            if (e.timer <= 0) {
              e.state = 0;
              e.timer = def.p0;
            }
          }
          break;
        }

        case Ai.Grow: {
          e.growT += dt;
          if (e.growT >= def.p0 && e.state < 6) {
            e.growT = 0;
            e.state++;
            const add = e.maxHp * def.p1;
            e.maxHp += add;
            e.hp += add;
            e.scale = 1 + e.state * 0.13;
            e.radius = def.radius * e.scale;
            // 伤害固定不成长（只长体型与血量）
          }
          // 被动型：未受到伤害时原地不动；挨过打（aggro）才开始追击玩家
          if (e.aggro > 0) {
            vx = nx * speed;
            vy = ny * speed;
          }
          break;
        }

        case Ai.Blink: {
          e.timer -= dt;
          if (e.timer <= 0) {
            e.timer = def.p0;
            const a = rng.next() * TAU;
            e.x += Math.cos(a) * def.p1;
            e.y += Math.sin(a) * def.p1;
          }
          vx = nx * speed;
          vy = ny * speed;
          break;
        }

        case Ai.Spiral: {
          e.angle += def.p0 * dt;
          const tx = -ny;
          const ty = nx;
          // 远时以径向为主（收拢），近时以切向为主（绕圈）
          const radial = d > 140 ? 1 : 0.32;
          const len = Math.hypot(radial, 1) || 1;
          vx = ((nx * radial + tx) / len) * speed;
          vy = ((ny * radial + ty) / len) * speed;
          break;
        }

        case Ai.Splitter: {
          e.timer -= dt;
          if (e.timer <= 0) {
            e.timer = def.p0;
            const gen = e.growT | 0;
            if (gen < 2) {
              const children = def.p1 | 0;
              for (let k = 0; k < children; k++) {
                const a = rng.next() * TAU;
                spawnEnemy(
                  world,
                  e.defIdx,
                  e.x + Math.cos(a) * e.radius,
                  e.y + Math.sin(a) * e.radius,
                  1,
                  1,
                  e.scale * 0.62,
                  gen + 1,
                );
              }
            }
          }
          vx = nx * speed;
          vy = ny * speed;
          break;
        }

        // ——————————————— Boss ———————————————
        case Ai.BossHerald: {
          const ratio = e.hp / e.maxHp;
          const phase = ratio > def.p0 ? 0 : ratio > def.p1 ? 1 : 2;
          if (phase !== e.phase) {
            e.phase = phase;
            e.timer = 1.2;
          }
          e.timer -= dt;
          // —— 阶段 0：周期召唤（带 0.7s 警示）——
          if (phase === 0) {
            vx = nx * speed;
            vy = ny * speed;
            if (e.cast > 0) {
              e.cast -= dt;
              if (e.cast <= 0) {
                e.cast = 0;
                // 蓄力结束，真正召唤 3 只骚扰怪（Boss 随从小怪血量 ×2 → hpMul 3.2）
                for (let k = 0; k < 3; k++) {
                  const a = rng.next() * TAU;
                  const s = spawnEnemy(world, 1, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 3.2, 1);
                  if (s) s.xp = 0.3; // 召唤的骚扰小怪几乎不给经验
                }
                this.vfx?.burst(e.x, e.y, 10, 0x7c5cff);
                this.vfx?.explosion(e.x, e.y, 8, 0x7c5cff);
                e.timer = this.gap(rng);
              }
            } else if (e.timer <= 0) {
              // 进入 0.7s 蓄力警示
              e.cast = CAST_WINDOW;
              e.tx = e.x;
              e.ty = e.y;
            }
          } else if (phase === 1) {
            // —— 阶段 1：玩家脚下落点伤害区（先 HERALD_FIELD_WARN 落点警示再落下）——
            vx = nx * speed * 0.7;
            vy = ny * speed * 0.7;
            if (e.cast > 0) {
              e.cast -= dt;
              if (e.cast <= 0) {
                e.cast = 0;
                // 在蓄力开始时锁定的落点留下伤害区
                spawnProj(world, (pr) => {
                  pr.behavior = Behavior.Field;
                  pr.hostile = 1;
                  pr.x = pr.px = e.tx;
                  pr.y = pr.py = e.ty;
                  pr.radius = 105;
                  pr.damage = 0;
                  pr.dotDps = 10; // 落点伤害区：持续伤害，逼迫玩家离开落点
                  pr.slowF = 1;
                  pr.life = pr.maxLife = 2.2;
                  pr.pierce = 9999;
                  pr.srcId = 900 + i;
                  pr.spriteKey = 17; // Tex.Frost
                  pr.scale = 1.15;
                  pr.rotSpeed = -0.4;
                });
                this.vfx?.burst(e.tx, e.ty, 12, 0x43e0ff);
                e.timer = this.gap(rng);
              }
            } else if (e.timer <= 0) {
              // 锁落点为玩家当前位置，进入更长的落点警示，给足走位反应时间
              e.cast = HERALD_FIELD_WARN;
              e.tx = p.x;
              e.ty = p.y;
            }
          } else {
            // —— 阶段 2：冲撞为主，期间间歇召唤（两者都带警示）——
            // 移动：冲撞用独立计时（e.sub 暂存冲刺剩余），召唤节奏走 e.timer/cast
            if (e.state === 0) {
              vx = nx * speed * 0.8;
              vy = ny * speed * 0.8;
              // 每轮循环：先蓄力警示（玩家可见警示），蓄力结束执行一次「冲撞」
              if (e.cast > 0) {
                e.cast -= dt;
                if (e.cast <= 0) {
                  e.cast = 0;
                  e.state = 1;
                  e.sub = 1; // 冲刺时长
                  e.angle = Math.atan2(p.y - e.y, p.x - e.x);
                  this.vfx?.burst(e.x, e.y, 8, 0xff5470);
                }
              } else if (e.timer <= 0) {
                e.timer = this.gap(rng);
                e.cast = CAST_WINDOW;
              }
            } else {
              // 冲刺中
              vx = Math.cos(e.angle) * speed * 3.2;
              vy = Math.sin(e.angle) * speed * 3.2;
              e.sub -= dt;
              if (e.sub <= 0) {
                e.state = 0;
                // 冲刺结束后不再召唤伴生小怪（数量较初版减 2 → 0）
                this.vfx?.burst(e.x, e.y, 8, 0x7c5cff);
              }
            }
          }
          break;
        }

        case Ai.BossCalamity: {
          vx = nx * speed;
          vy = ny * speed;
          if (e.cast > 0) {
            // 蓄力警示中：结束后释放三连落点圈（圈再预警 1.2s 后爆炸）
            e.cast -= dt;
            if (e.cast <= 0) {
              e.cast = 0;
              const shots = 3;
              for (let k = 0; k < shots; k++) {
                const ox = k === 0 ? 0 : rng.range(-200, 200);
                const oy = k === 0 ? 0 : rng.range(-200, 200);
                spawnProj(world, (pr) => {
                  pr.behavior = Behavior.Telegraph;
                  pr.hostile = 1;
                  pr.x = pr.px = e.tx + ox;
                  pr.y = pr.py = e.ty + oy;
                  pr.radius = 118;
                  pr.damage = def.damage;
                  pr.r0 = 118;
                  pr.r1 = 118;
                  pr.life = pr.maxLife = def.p1;
                  pr.pierce = 9999;
                  pr.srcId = 800 + i;
                  pr.spriteKey = 26; // Tex.Ring
                  pr.scale = 1.0;
                });
              }
              this.vfx?.burst(e.x, e.y, 8, 0xff5470);
              e.timer = this.gap(rng);
            }
          } else {
            e.timer -= dt;
            if (e.timer <= 0) {
              // 锁锚点为玩家当前位置，进入 0.7s 蓄力警示
              e.cast = CAST_WINDOW;
              e.tx = p.x;
              e.ty = p.y;
            }
          }
          break;
        }

        case Ai.BossEndless: {
          // 终焉：无敌 15s（环向弹幕、边界固定 900）↔ 破防 30s（近身锥形弹、可被击杀）循环
          if (e.state === 1) {
            // —— 无敌阶段：不受伤害（Damage 已拦截），只能躲避；边界固定 900 不再收缩 ——
            world.arenaR = 900;
            vx = nx * speed * 0.4;
            vy = ny * speed * 0.4;
            e.timer -= dt;
            if (e.timer <= 0) {
              // 破防：解除无敌与收缩，进入 30s 近身锥形弹窗口
              e.state = 0;
              e.timer = ENDLESS_OPEN;
              world.arenaR = 0;
              e.cast = 0;
              e.sub = 0;
              e.flash = 0.6;
              this.vfx?.burst(e.x, e.y, 10, 0xf5c451);
              break;
            }
            if (e.cast > 0) {
              e.cast -= dt;
              if (e.cast <= 0) {
                e.cast = 0;
                e.angle += 0.31;
                const shots = 16;
                for (let k = 0; k < shots; k++) {
                  const a = e.angle + (k / shots) * TAU;
                  spawnProj(world, (pr) => {
                    pr.behavior = Behavior.Linear;
                    pr.hostile = 1;
                    pr.x = pr.px = e.x;
                    pr.y = pr.py = e.y;
                    pr.vx = Math.cos(a) * 210;
                    pr.vy = Math.sin(a) * 210;
                    pr.radius = 11;
                    pr.damage = 22;
                    pr.life = pr.maxLife = 5;
                    pr.pierce = 1;
                    pr.srcId = 700 + k;
                    pr.spriteKey = 14; // Tex.Shard
                    pr.rot = a;
                    pr.rotSpeed = 3;
                  });
                }
                this.vfx?.burst(e.x, e.y, 6, 0x43e0ff);
                e.sub = this.gap(rng);
              }
            } else if (e.sub > 0) {
              e.sub -= dt;
            } else {
              // 进入下一轮弹幕的 0.7s 蓄力警示
              e.cast = CAST_WINDOW;
            }
          } else {
            // —— 破防阶段：近身锥形弹（每轮先 0.7s 蓄力警示），窗口内可被击杀 ——
            world.arenaR = 0;
            vx = nx * speed;
            vy = ny * speed;
            e.timer -= dt;
            if (e.timer <= 0) {
              // 30s 内未击败 → 再次进入 15s 无敌（循环，直到某次破防窗口内被击杀）
              e.state = 1;
              e.timer = ENDLESS_INVULN;
              world.arenaR = 900;
              e.cast = 0;
              e.sub = 0;
              e.flash = 0.6;
              this.vfx?.burst(e.x, e.y, 10, 0x43e0ff);
              break;
            }
            if (e.cast > 0) {
              e.cast -= dt;
              if (e.cast <= 0) {
                e.cast = 0;
                const shots = 8;
                const base = Math.atan2(dy, dx);
                for (let k = 0; k < shots; k++) {
                  const a = base + (k - (shots - 1) / 2) * 0.18;
                  spawnProj(world, (pr) => {
                    pr.behavior = Behavior.Linear;
                    pr.hostile = 1;
                    pr.x = pr.px = e.x;
                    pr.y = pr.py = e.y;
                    pr.vx = Math.cos(a) * 260;
                    pr.vy = Math.sin(a) * 260;
                    pr.radius = 11;
                    pr.damage = 20;
                    pr.life = pr.maxLife = 4;
                    pr.pierce = 1;
                    pr.srcId = 700 + k;
                    pr.spriteKey = 14; // Tex.Shard
                    pr.rot = a;
                    pr.rotSpeed = 3;
                  });
                }
                this.vfx?.burst(e.x, e.y, 6, 0xf5c451);
                e.sub = this.gap(rng);
              }
            } else if (e.sub > 0) {
              e.sub -= dt;
            } else {
              e.cast = CAST_WINDOW;
            }
          }
          break;
        }

        case Ai.Gunner: {
          // 深渊炮手：缓慢逼近，周期性朝玩家射出单发直线弹（带蓄力警示）
          vx = nx * speed;
          vy = ny * speed;
          if (e.cast > 0) {
            e.cast -= dt;
            if (e.cast <= 0) {
              e.cast = 0;
              const a = Math.atan2(dy, dx);
              spawnProj(world, (pr) => {
                pr.behavior = Behavior.Linear;
                pr.hostile = 1;
                pr.x = pr.px = e.x;
                pr.y = pr.py = e.y;
                pr.vx = Math.cos(a) * def.p1;
                pr.vy = Math.sin(a) * def.p1;
                pr.radius = 14; // 体积加大，配合发光造型，弹幕清晰可辨
                pr.damage = e.damage;
                pr.life = pr.maxLife = 4;
                pr.pierce = 1;
                pr.srcId = 650 + i;
                pr.spriteKey = 13; // Tex.OrbSeeker：发光菱形，明显区别于玩家弹幕
                pr.scale = 1.35;
                pr.rot = a;
                pr.rotSpeed = 5;
              });
              // 出膛口焰：在炮口打出高亮短脉冲，便于玩家定位弹道起点
              this.vfx?.explosion(e.x, e.y, 10, 0xff5470);
              e.timer = def.p0;
            }
          } else {
            e.timer -= dt;
            if (e.timer <= 0) {
              e.cast = CAST_WINDOW;
            }
          }
          break;
        }

        default:
          vx = nx * speed;
          vy = ny * speed;
          break;
      }

      // ——— 分离力（留缝版）：复用碰撞用的空间哈希 ———
      // 在目标间距 dst = r_e + r_o + SEP_GAP 内就柔和推开：既防重叠成一坨，
      // 又让怪群之间始终留出约 SEP_GAP 的缝，给玩家穿插走位的空间。
      let sx = 0;
      let sy = 0;
      const qr = e.radius + SEP_GAP + 28; // 覆盖"自身半径 + 常见大邻居(≤25) + 缝隙"
      const found = hash.query(e.x, e.y, qr, qbuf);
      for (let k = 0; k < found; k++) {
        const o = list[qbuf[k]];
        if (o === e || o.dead) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const d2 = ox * ox + oy * oy;
        const dst = e.radius + o.radius + SEP_GAP;
        if (d2 > 0.0001 && d2 < dst * dst) {
          const dd = Math.sqrt(d2);
          // 距目标越近推力越接近 1，在缝隙边缘趋近 0，平滑不抖
          const push = 1 - dd / dst;
          sx += (ox / dd) * push;
          sy += (oy / dd) * push;
        }
      }
      const sepMul = e.isBoss ? BOSS_SEP_MUL : 1;
      vx += sx * SEP_FORCE * sepMul;
      vy += sy * SEP_FORCE * sepMul;

      // ——— 击退衰减（指数衰减，与帧率无关） ———
      const decay = Math.exp(-9 * dt);
      e.knockX *= decay;
      e.knockY *= decay;

      e.x += (vx + e.knockX) * dt;
      e.y += (vy + e.knockY) * dt;
    }
  }
}

/** 供外部查询：目标是否为 Boss（HUD 血条用） */
export function findBoss(world: World): Enemy | null {
  const list = world.enemies.items;
  for (let i = 0; i < world.enemies.count; i++) {
    if (list[i].isBoss && !list[i].dead) return list[i];
  }
  return null;
}
