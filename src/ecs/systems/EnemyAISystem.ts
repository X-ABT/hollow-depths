import { TAU } from '../../core/MathUtil';
import { Ai, type Enemy } from '../Components';
import { ENEMY_BY_INDEX } from '../../data/enemies';
import { spawnEnemy, spawnProj } from '../Spawn';
import { Behavior } from '../Components';
import type { World } from '../World';

/** 分离力强度：越大越不容易重叠成一坨 */
const SEP_FORCE = 240;
/** Boss 受分离力的影响系数（Boss 质量大，不该被小怪推着走） */
const BOSS_SEP_MUL = 0.12;

/**
 * 敌人 AI + 分离力 + 位移积分。
 *
 * 分离力复用碰撞用的同一份空间哈希（不额外构建），
 * 让怪潮既有「成群压过来」的压迫感，又不会全部重叠成一个点——
 * 后者会让命中判定变得难以阅读，也会浪费大量渲染开销。
 */
export class EnemyAISystem {
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
            // 蓄力：缓慢逼近并锁定方向
            vx = nx * speed * 0.72;
            vy = ny * speed * 0.72;
            if (e.timer <= 0) {
              e.state = 1;
              e.timer = 0.5;
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
            e.damage *= 1 + def.p1 * 0.5;
          }
          vx = nx * speed;
          vy = ny * speed;
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
            e.timer = 0.6;
          }
          e.timer -= dt;
          if (phase === 0) {
            vx = nx * speed;
            vy = ny * speed;
            if (e.timer <= 0) {
              e.timer = 3.2;
              for (let k = 0; k < 3; k++) {
                const a = rng.next() * TAU;
                spawnEnemy(world, 1, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 1.6, 1);
              }
            }
          } else if (phase === 1) {
            vx = nx * speed * 0.7;
            vy = ny * speed * 0.7;
            if (e.timer <= 0) {
              e.timer = 2.4;
              // 在玩家脚下留下持续伤害区域
              spawnProj(world, (pr) => {
                pr.behavior = Behavior.Field;
                pr.hostile = 1;
                pr.x = pr.px = p.x;
                pr.y = pr.py = p.y;
                pr.radius = 120;
                pr.damage = 0;
                pr.dotDps = 14;
                pr.slowF = 1;
                pr.life = pr.maxLife = 4;
                pr.pierce = 9999;
                pr.srcId = 900 + i;
                pr.spriteKey = 17; // Tex.Frost
                pr.scale = 1.15;
                pr.rotSpeed = -0.4;
              });
            }
          } else {
            // 冲撞 + 召唤
            if (e.state === 0) {
              vx = nx * speed * 0.8;
              vy = ny * speed * 0.8;
              if (e.timer <= 0) {
                e.state = 1;
                e.timer = 0.7;
                e.angle = Math.atan2(dy, dx);
              }
            } else {
              vx = Math.cos(e.angle) * speed * 3.2;
              vy = Math.sin(e.angle) * speed * 3.2;
              if (e.timer <= 0) {
                e.state = 0;
                e.timer = 1.6;
              }
            }
            if (e.timer <= 0 && e.state === 0) {
              e.timer = 2.2;
              for (let k = 0; k < 2; k++) {
                const a = rng.next() * TAU;
                spawnEnemy(world, 4, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70, 1.5, 1);
              }
            }
          }
          break;
        }

        case Ai.BossCalamity: {
          vx = nx * speed;
          vy = ny * speed;
          e.timer -= dt;
          if (e.timer <= 0) {
            e.timer = def.p0;
            // 三连预警圈：给玩家 1.2s 走位时间
            const shots = 3;
            for (let k = 0; k < shots; k++) {
              const ox = k === 0 ? 0 : rng.range(-160, 160);
              const oy = k === 0 ? 0 : rng.range(-160, 160);
              spawnProj(world, (pr) => {
                pr.behavior = Behavior.Telegraph;
                pr.hostile = 1;
                pr.x = pr.px = p.x + ox;
                pr.y = pr.py = p.y + oy;
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
          }
          break;
        }

        case Ai.BossEndless: {
          if (e.state === 1) {
            // 无敌倒计时：边界收缩 + 环向弹幕，只能躲
            e.timer -= dt;
            e.phase -= dt;
            world.arenaR = Math.max(260, 900 - (1 - e.timer / def.p0) * 620);
            if (e.phase <= 0) {
              e.phase = 0.8;
              e.angle += 0.31;
              const shots = 14;
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
            }
            if (e.timer <= 0) {
              // 破防
              e.state = 0;
              world.arenaR = 0;
              e.flash = 0.6;
            }
            vx = nx * speed * 0.4;
            vy = ny * speed * 0.4;
          } else {
            vx = nx * speed;
            vy = ny * speed;
            e.phase -= dt;
            if (e.phase <= 0) {
              e.phase = 1.6;
              const shots = 6;
              for (let k = 0; k < shots; k++) {
                const a = Math.atan2(dy, dx) + (k - (shots - 1) / 2) * 0.18;
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
                  pr.spriteKey = 14;
                  pr.rot = a;
                  pr.rotSpeed = 3;
                });
              }
            }
          }
          break;
        }

        default:
          vx = nx * speed;
          vy = ny * speed;
          break;
      }

      // ——— 分离力：复用碰撞用的空间哈希 ———
      let sx = 0;
      let sy = 0;
      const qr = e.radius * 2 + 4;
      const found = hash.query(e.x, e.y, qr, qbuf);
      for (let k = 0; k < found; k++) {
        const o = list[qbuf[k]];
        if (o === e || o.dead) continue;
        const ox = e.x - o.x;
        const oy = e.y - o.y;
        const d2 = ox * ox + oy * oy;
        const minD = e.radius + o.radius;
        if (d2 > 0.0001 && d2 < minD * minD) {
          const dd = Math.sqrt(d2);
          const push = (minD - dd) / minD;
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
