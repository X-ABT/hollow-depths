import { Ai, Behavior, type Enemy } from './Components';
import { ENEMY_BY_INDEX } from '../data/enemies';
import type { World } from './World';

/** 上次伤害是否暴击（供飘字使用，避免为单次调用分配对象） */
export let lastCrit = false;
/** 上次实际造成的伤害 */
export let lastDamage = 0;

export function resetHitInfo(): void {
  lastCrit = false;
  lastDamage = 0;
}

/**
 * 对单个敌人造成伤害。
 *
 * @param srcId   伤害来源 id；同一来源在 `immune` 秒内不会重复命中同一目标，
 *                这既实现了「环绕/领域每 N 秒跳一次伤害」，也防止快速子弹在
 *                连续几帧里对同一敌人反复命中。
 * @param slot    武器槽位（用于结算页伤害统计），非武器来源传 -1
 * @returns 实际造成的伤害（0 表示被免疫）
 */
export function damageEnemy(
  world: World,
  e: Enemy,
  amount: number,
  srcId: number,
  slot: number,
  immune: number,
  critChance: number,
  critMult: number,
  knockX = 0,
  knockY = 0,
): number {
  lastCrit = false;
  lastDamage = 0;
  if (e.dead) return 0;

  // 终焉在无敌阶段不受伤害
  if (e.ai === Ai.BossEndless && e.state === 1) return 0;

  if (e.srcId === srcId && e.srcImmune > 0) return 0;
  e.srcId = srcId;
  e.srcImmune = immune;

  const def = ENEMY_BY_INDEX[e.defIdx];
  let dmg = amount;

  if (critChance > 0 && world.rng.next() < critChance) {
    lastCrit = true;
    dmg *= critMult;
  }
  // 甲壳兽护盾：高血量时大额减伤
  if (e.ai === Ai.Shielded && e.hp > e.maxHp * def.p0) dmg *= 1 - def.p1;

  dmg = Math.max(1, dmg - e.armor);
  e.hp -= dmg;
  e.flash = 0.12;
  e.knockX += knockX;
  e.knockY += knockY;
  if (slot >= 0) world.dmgByWeapon[slot] += dmg;
  lastDamage = dmg;

  // 欺诈者：受击后有几率闪现到玩家背后
  if (e.ai === Ai.Trickster && e.hp > 0 && world.rng.next() < def.p0) {
    const p = world.player;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.x = p.x + (dx / len) * def.p1;
    e.y = p.y + (dy / len) * def.p1;
    e.px = e.x;
    e.py = e.y;
  }

  if (e.hp <= 0) {
    e.hp = 0;
    e.dead = true;
  }
  return dmg;
}

/** 范围爆发（Mark 到期、溅射、Boss 预警圈） */
export function explode(
  world: World,
  x: number,
  y: number,
  radius: number,
  damage: number,
  srcId: number,
  slot: number,
  critChance: number,
  critMult: number,
  knock = 0,
  onPlayer: number = 0,
): number {
  let total = 0;
  if (onPlayer) {
    const p = world.player;
    const d2 = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d2 <= radius * radius) damagePlayer(world, damage);
    return 0;
  }
  const found = world.hash.query(x, y, radius, world.qbuf);
  const list = world.enemies.items;
  for (let i = 0; i < found; i++) {
    const idx = world.qbuf[i];
    const e = list[idx];
    if (e.dead) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > radius + e.radius) continue;
    // 距离衰减：边缘伤害为 60%
    const falloff = 1 - 0.4 * Math.min(1, d / (radius + e.radius));
    total += damageEnemy(
      world,
      e,
      damage * falloff,
      srcId,
      slot,
      1.0,
      critChance,
      critMult,
      knock > 0 ? (dx / d) * knock : 0,
      knock > 0 ? (dy / d) * knock : 0,
    );
  }
  return total;
}

export interface PlayerHitEvent {
  amount: number;
}

/** 对玩家造成伤害（含护甲减伤与无敌帧） */
export function damagePlayer(world: World, amount: number, iframe = 0.6): number {
  const p = world.player;
  if (p.iframe > 0) return 0;
  const dmg = Math.max(1, amount - p.armor);
  p.hp -= dmg;
  p.iframe = iframe;
  world.onPlayerHurt?.(dmg);
  return dmg;
}

/** 命中后给敌人施加的同类免疫时长（按投射物行为区分） */
export function immuneFor(behavior: Behavior): number {
  switch (behavior) {
    case Behavior.Orbit:
      return 0.35;
    case Behavior.Aoe:
      return 1.0;
    case Behavior.Beam:
      return 0.3;
    case Behavior.Field:
      return 0.4;
    case Behavior.Mark:
      return 1.0;
    default:
      return 0.2;
  }
}
