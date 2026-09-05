import { Ai, Behavior, PickupKind, type Pickup, type Proj, type Enemy } from './Components';
import { ENEMY_BY_ID, ENEMY_BY_INDEX, IDX_BOSS_START } from '../data/enemies';
import { PETS } from '../data/pets';
import { dmgFor, hpFor, visualScale } from '../data/pets';
import type { Pet, World } from './World';

/** 把一个复用出来的投射物重置为默认状态，再交给调用方按需覆盖 */
function reset(p: Proj): void {
  p.x = p.y = p.px = p.py = 0;
  p.vx = p.vy = 0;
  p.radius = 6;
  p.damage = 1;
  p.behavior = Behavior.Linear;
  p.life = 1;
  p.maxLife = 1;
  p.pierce = 1;
  p.srcId = -1;
  p.hitCd = 0;
  p.critChance = 0;
  p.critMult = 2;
  p.knockback = 0;
  p.retarget = 0;
  p.targetIdx = -1;
  p.turn = 7;
  p.orbitAngle = 0;
  p.orbitRadius = 60;
  p.orbitSpeed = 2.4;
  p.r0 = 0;
  p.r1 = 0;
  p.width = 12;
  p.length = 300;
  p.angle = 0;
  p.slowF = 1;
  p.dotDps = 0;
  p.tickT = 0;
  p.follow = 0;
  p.splash = 0;
  p.hostile = 0;
  p.spriteKey = 0;
  p.rot = 0;
  p.rotSpeed = 0;
  p.scale = 1;
  p.tintOverride = -1;
}

/** 从池中取一个投射物并初始化。池满时返回 null（静默丢弃，绝不抛错）。 */
export function spawnProj(world: World, init: (p: Proj) => void): Proj | null {
  const p = world.projs.spawn();
  if (!p) return null;
  reset(p);
  init(p);
  return p;
}

/**
 * 生成敌人。
 * @param scale 体型缩放（史莱姆成长、分裂魔分身）
 * @param gen   分裂代数（分裂魔分身用，限制无限滚雪球）
 */
export function spawnEnemy(
  world: World,
  defIdx: number,
  x: number,
  y: number,
  hpMul = 1,
  dmgMul = 1,
  scale = 1,
  gen = 0,
): Enemy | null {
  const def = ENEMY_BY_INDEX[defIdx];
  const e = world.enemies.spawn();
  if (!e) return null;

  e.defIdx = defIdx;
  e.x = e.px = x;
  e.y = e.py = y;
  e.vx = 0;
  e.vy = 0;
  e.radius = def.radius * scale;
  e.scale = scale;
  e.maxHp = def.hp * hpMul * scale;
  e.hp = e.maxHp;
  e.damage = def.damage * dmgMul;
  // 史莱姆伤害固定 3：不随战斗时间成长
  if (def.id === 'slime') e.damage = 3;
  e.speed = def.speed;
  e.armor = def.armor;
  e.xp = def.xp;
  e.ai = def.ai;
  e.isElite = def.elite;
  e.isBoss = def.boss;
  e.bossIdx = def.boss ? defIdx - IDX_BOSS_START : -1;

  e.timer = def.ai === Ai.Dash ? def.p0 : 0;
  e.state = 0;
  e.phase = 0;
  e.growT = gen;
  e.angle = 0;
  e.cast = 0;
  e.castMul = 1; // 技能频率系数：池复用重置，防上一只无尽 Boss 的加速残留到普通怪
  e.sub = 0;
  e.tx = 0;
  e.ty = 0;
  e.flash = 0;
  e.slowT = 0;
  e.slowF = 1;
  e.knockX = 0;
  e.knockY = 0;
  e.srcId = -1;
  e.srcImmune = 0;
  e.hitCd = 0;
  e.aggro = 0;
  e.dead = false;
  e.spriteKey = def.sprite;
  e.rot = 0;

  // 终焉：开局进入无敌倒计时（无尽幽墟不做无敌开场，保持可被击杀）
  if (def.ai === Ai.BossEndless) {
    if (world.endless) {
      e.state = 0;
    } else {
      e.state = 1;
      e.timer = def.p0;
    }
  }
  return e;
}

export function spawnEnemyById(
  world: World,
  id: string,
  x: number,
  y: number,
  hpMul = 1,
  dmgMul = 1,
  scale = 1,
): Enemy | null {
  const def = ENEMY_BY_ID[id];
  if (!def) return null;
  return spawnEnemy(world, ENEMY_BY_INDEX.indexOf(def), x, y, hpMul, dmgMul, scale);
}

/**
 * 生成一局中的出战宠物：挂在玩家身边起始位置，所有战斗属性由等级即时换算。
 * @param petIdx PETS 表下标
 * @param level  宠物当前等级
 * @param slot   上阵槽位（决定跟随偏移的相位，0..2）
 */
export function spawnPet(world: World, petIdx: number, level: number, slot: number): Pet | null {
  const def = PETS[petIdx];
  const p = world.pets.spawn();
  if (!p || !def) return null;
  const p0 = world.player;
  const scale = visualScale(def, level);
  const ang = (slot / 3) * Math.PI * 2 + 0.6;
  p.petIdx = petIdx;
  p.level = level;
  p.x = p.px = p0.x + Math.cos(ang) * 46;
  p.y = p.py = p0.y + Math.sin(ang) * 46;
  p.vx = 0;
  p.vy = 0;
  p.maxHp = hpFor(def, level);
  p.hp = p.maxHp;
  p.dmg = dmgFor(def, level);
  p.scale = scale;
  // 受击判定半径随体积增长但封顶，避免巨型宠物被全屏敌人都摸到
  p.radius = Math.min(88, 12 + scale * 9);
  p.state = 0;
  p.timer = 0;
  p.atkCd = 0.6;
  p.hurtCd = 0;
  p.flash = 0;
  p.slot = slot;
  return p;
}

export function spawnPickup(
  world: World,
  kind: PickupKind,
  value: number,
  x: number,
  y: number,
): Pickup | null {
  const p = world.pickups.spawn();
  if (!p) return null;
  p.x = p.px = x;
  p.y = p.py = y;
  p.vx = 0;
  p.vy = 0;
  p.kind = kind;
  p.value = value;
  p.radius = kind === PickupKind.Chest ? 14 : 9;
  // 经验宝石掉落后 6 分钟内未拾取自动清除（防止长期堆积）；宝箱与其他保持原样
  p.life = kind === PickupKind.Chest ? 120 : kind === PickupKind.Xp ? 360 : 150;
  // 经验宝石生成即「磁吸」：自动飞向玩家，取消走近才吸附的范围限制（仅对 Xp）
  p.magnet = kind === PickupKind.Xp;
  p.bob = world.rng.range(0, Math.PI * 2);
  return p;
}
