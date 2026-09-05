import { Ai } from '../Components';
import type { Enemy, Pet, World } from '../World';
import { PETS, dmgFor, hpFor, skillFor, visualScale, type PetDef, type PetSkill } from '../../data/pets';
import { stagePlan, type StagePlan } from '../../data/expedition';
import { spawnEnemyById } from '../Spawn';
import { damageEnemy, explode } from '../Damage';
import { ENEMY_BY_INDEX } from '../../data/enemies';
import type { Vfx } from '../../render/Vfx';

/** 爪击伤害来源 id（避开武器 0..31 与宠物 3000+），与技能免疫键分离 */
const HERO_SRC = 9001;
/** nova/dash 等范围技能的伤害来源：独立免疫键，技能命中免疫不会吞掉随后的爪击 */
const SKILL_SRC = 9002;
/** beam 射线技能的伤害来源 */
const BEAM_SRC = 9003;
/** 英雄驻守世界坐标（左侧） */
const HERO_X = 0;
const HERO_Y = 0;
/** 敌宠从右侧屏外涌入的出生 x（配合相机偏移，位于可见区右侧外） */
const SPAWN_X = 920;
/**
 * 英雄血量倍率：站桩承伤是「每 0.6s 吃一次接触伤害」，
 * 且战斗期间会持续贴身，故需要比主局跟随宠物高得多的血量缓冲。
 */
const EXP_HP_MUL = 6;
/** 远征爪击节奏（比主局 0.9s 略快，利于清群） */
const EXP_ATK_INTERVAL = 0.6;
/** 英雄索敌/平A 半径（屏幕内最近敌人均可打到） */
const EXP_REACH = 600;
/** 敌宠出生间隔（秒）；Boss 关仅 1 只，间隔无意义 */
const SPAWN_GAP = 0.95;
/** 技能等级每级增益（伤害 ×(1 + 0.25×等级)） */
const SKILL_LV_MUL = 0.25;

const SKILL_COLOR: Record<string, number> = {
  beam: 0xfff0a0,
  nova: 0x43e0ff,
  heal: 0x34d399,
  dash: 0xa855f7,
};

const DEFAULT_SKILL: PetSkill = { id: '', name: '新星', kind: 'nova', cd: 5, dmgMul: 4, radius: 140 };

export interface ExpeditionState {
  stage: number;
  isBoss: boolean;
  total: number;
  remaining: number;
  heroHp: number;
  heroMaxHp: number;
  skillName: string;
  skillCd: number;
  skillCdMax: number;
  /** Boss 关顶部血条用；普通关为 null/0 */
  bossName: string | null;
  bossHp: number;
  bossMaxHp: number;
  cleared: boolean;
  failed: boolean;
}

/**
 * 宠物远征战斗系统：完全接管远征内的战斗逻辑。
 * - 英雄宠物原地驻守左侧，自动平A 最近的敌宠；
 * - 敌宠从右侧匀速左移、抵达英雄处停下并造成接触伤害；
 * - 玩家点按释放招牌技能（受 CD 限制）；
 * - 清空本关所有敌宠即过关；英雄阵亡即失败。
 * 不依赖主局 EnemyAISystem/WeaponSystem/SpawnSystem/CleanupSystem，避免回归风险。
 */
export class ExpeditionSystem {
  private vfx: Vfx | null = null;
  private world: World | null = null;
  private plan: StagePlan | null = null;
  private skill: PetSkill = DEFAULT_SKILL;
  private skillLevel = 0;
  private heroDmg = 3;
  private hero: Pet | null = null;

  private stage = 1;
  private queue: string[] = [];
  private spawnTimer = 0;
  private skillCd = 0;
  private cleared = false;
  private failed = false;

  attachVfx(vfx: Vfx): void {
    this.vfx = vfx;
  }

  /** 开战：重置世界、生成英雄与出战宠物、按关卡布置敌宠队列 */
  start(world: World, def: PetDef, petLevel: number, skillLevel: number, stage: number): void {
    world.reset();
    this.world = world;
    this.plan = stagePlan(stage);
    this.stage = stage;
    this.skill = skillFor(def);
    this.skillLevel = skillLevel;
    this.heroDmg = dmgFor(def, petLevel);

    // 英雄宠物
    const scale = visualScale(def, petLevel);
    const petIdx = Math.max(0, PETS.findIndex((p) => p.id === def.id));
    const p = world.pets.spawn();
    if (p) {
      p.petIdx = petIdx;
      p.level = petLevel;
      p.x = p.px = HERO_X;
      p.y = p.py = HERO_Y;
      p.vx = 0;
      p.vy = 0;
      p.maxHp = hpFor(def, petLevel) * EXP_HP_MUL;
      p.hp = p.maxHp;
      p.dmg = this.heroDmg;
      p.scale = scale;
      p.radius = Math.min(88, 12 + scale * 9);
      p.state = 0;
      p.timer = 0;
      p.atkCd = 0;
      p.hurtCd = 0;
      p.flash = 0;
      p.slot = 0;
      this.hero = p;
    } else {
      this.hero = null;
    }

    // 相机锚点（玩家实体仅用于居中，不参与战斗）
    world.player.x = HERO_X;
    world.player.y = HERO_Y;
    world.player.hp = world.player.maxHp = 99999;

    this.queue = [...this.plan.enemyIds];
    this.spawnTimer = 0.6;
    this.skillCd = 0;
    this.cleared = false;
    this.failed = false;
  }

  /** 玩家触发技能（受 CD 限制）；CD 中或英雄已失则忽略 */
  castSkill(world: World): void {
    const hero = this.hero;
    if (!hero || this.skillCd > 0 || this.cleared || this.failed) return;
    const sk = this.skill;
    const mul = 1 + SKILL_LV_MUL * this.skillLevel;
    const dmg = this.heroDmg * sk.dmgMul * mul;
    const color = SKILL_COLOR[sk.kind] ?? 0x43e0ff;
    switch (sk.kind) {
      case 'nova': {
        const total = explode(world, hero.x, hero.y, sk.radius, dmg, SKILL_SRC, -1, 0.1, 2, 0);
        this.vfx?.explosion(hero.x, hero.y, 34, color);
        if (total > 0) this.vfx?.hit(hero.x, hero.y - 40, total, false, true);
        break;
      }
      case 'beam': {
        // 向右的水平光束：命中 hero.x..hero.x+length 且纵向贴近的所有敌宠
        const list = world.enemies.items;
        const n = world.enemies.count;
        for (let i = 0; i < n; i++) {
          const e: Enemy = list[i];
          if (e.dead) continue;
          if (e.x >= hero.x - 24 && e.x <= hero.x + sk.radius && Math.abs(e.y - hero.y) <= 80) {
            const dealt = damageEnemy(world, e, dmg, BEAM_SRC, -1, 0.3, 0.1, 2);
            if (dealt > 0) this.vfx?.hit(e.x, e.y - 10, dealt, false, true);
          }
        }
        this.vfx?.explosion(hero.x + sk.radius * 0.5, hero.y, 20, color);
        break;
      }
      case 'dash': {
        // 向前冲击波（带击退）
        const cx = hero.x + 140;
        const total = explode(world, cx, hero.y, sk.radius, dmg, SKILL_SRC, -1, 0.1, 2, sk.knock ?? 220);
        this.vfx?.explosion(cx, hero.y, 28, color);
        if (total > 0) this.vfx?.hit(cx, hero.y - 40, total, false, true);
        break;
      }
      case 'heal': {
        const heal = hero.maxHp * (sk.heal ?? 0.5);
        hero.hp = Math.min(hero.maxHp, hero.hp + heal);
        this.vfx?.burst(hero.x, hero.y, 20, color);
        break;
      }
    }
    this.skillCd = sk.cd;
  }

  update(world: World, dt: number): void {
    this.world = world;
    const hero = this.hero;
    if (this.cleared || this.failed) return;

    // ——— 出生敌宠（从右侧屏外依次涌入）———
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.queue.length > 0 && this.plan) {
      const id = this.queue.shift()!;
      const e = spawnEnemyById(world, id, SPAWN_X, HERO_Y, this.plan.hpMul, this.plan.dmgMul);
      // 终焉开局无敌机制在远征内无意义，直接解除使其可受击
      if (e && e.ai === Ai.BossEndless) e.state = 0;
      this.spawnTimer = SPAWN_GAP;
    }

    // ——— 敌宠匀速左移 + 抵达英雄处停下 ———
    const list = world.enemies.items;
    const n = world.enemies.count;
    const stopX = hero ? HERO_X + hero.radius : HERO_X;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.px = e.x;
      e.py = e.y;
      // 递减主局 EnemyAISystem 负责的通用计时（远征不跑 AI，需自行补齐）：
      // 否则同源爪击的命中免疫 srcImmune 与受击白闪 flash 永不归零，同一只怪只能被打第一口
      if (e.flash > 0) e.flash -= dt;
      if (e.srcImmune > 0) e.srcImmune -= dt;
      e.x += (-e.speed + e.knockX) * dt;
      e.knockX *= Math.exp(-6 * dt);
      e.y += (HERO_Y - e.y) * Math.min(1, 3 * dt) + e.knockY * dt;
      e.knockY *= Math.exp(-6 * dt);
      if (e.x < stopX + e.radius) e.x = stopX + e.radius;
    }

    // ——— 英雄自动平A 最近敌宠 ———
    if (hero) {
      hero.atkCd -= dt;
      if (hero.atkCd <= 0) {
        let best = -1;
        let bestD = EXP_REACH * EXP_REACH;
        for (let i = 0; i < n; i++) {
          const e = list[i];
          if (e.dead) continue;
          const dx = e.x - hero.x;
          const dy = e.y - hero.y;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        if (best >= 0) {
          const e = list[best];
          const dealt = damageEnemy(world, e, hero.dmg, HERO_SRC, -1, 0.45, 0, 1);
          if (dealt > 0) {
            this.vfx?.claw(e.x, e.y);
            this.vfx?.hit(e.x, e.y - 10, dealt, false, true);
          }
          hero.atkCd = EXP_ATK_INTERVAL;
        }
      }

      // ——— 接触伤害（0.6s 内只吃一次，避免被围殴瞬间融化）———
      hero.hurtCd -= dt;
      if (hero.hurtCd <= 0) {
        for (let i = 0; i < n; i++) {
          const e = list[i];
          if (e.dead) continue;
          const dx = e.x - hero.x;
          const dy = e.y - hero.y;
          const rr = hero.radius + e.radius;
          if (dx * dx + dy * dy <= rr * rr) {
            hero.hp -= e.damage;
            hero.hurtCd = 0.6;
            hero.flash = 0.16;
            this.vfx?.burst(hero.x, hero.y, 6, 0xff7777);
            if (hero.hp <= 0) {
              hero.hp = 0;
              this.failed = true;
            }
            break;
          }
        }
      }
    }

    // ——— 技能 CD 递减 ———
    if (this.skillCd > 0) this.skillCd = Math.max(0, this.skillCd - dt);

    // ——— 回收死亡敌宠（远征内不掉落/不计灵魂，仅释放回池）———
    for (let i = world.enemies.count - 1; i >= 0; i--) {
      const e = world.enemies.items[i];
      if (e.dead) {
        this.vfx?.burst(e.x, e.y, 5, 0x9dfbc4);
        world.enemies.releaseAt(i);
      }
    }
    // 补建空间哈希：nova/dash 等范围技能经 explode() 依赖哈希索敌，而主局每帧 buildHash
    // 的 EnemyAISystem 分支在远征不运行。必须放在回收之后，确保哈希只指向存活敌宠，
    // 不残留已释放的池槽位索引（避免逻辑步之间点技能时命中被复用槽位）。
    world.buildHash();

    // ——— 过关判定：队列空且场上无活敌 ———
    if (this.queue.length === 0 && world.enemies.count === 0) {
      this.cleared = true;
    }
  }

  getState(): ExpeditionState {
    const hero = this.hero;
    const world = this.world;
    const live = world ? world.enemies.count : 0;
    let bossName: string | null = null;
    let bossHp = 0;
    let bossMaxHp = 0;
    if ((this.plan?.isBoss ?? false) && world) {
      // Boss 关场上仅 1 只敌宠：取当前存活那只的实时血量供顶部血条
      const list = world.enemies.items;
      for (let i = 0; i < world.enemies.count; i++) {
        const e = list[i];
        if (!e.dead) {
          bossName = ENEMY_BY_INDEX[e.defIdx].name;
          bossHp = e.hp;
          bossMaxHp = e.maxHp;
          break;
        }
      }
    }
    return {
      stage: this.stage,
      isBoss: this.plan?.isBoss ?? false,
      total: this.plan?.enemyIds.length ?? 0,
      remaining: this.queue.length + live,
      heroHp: hero ? hero.hp : 0,
      heroMaxHp: hero ? hero.maxHp : 1,
      skillName: this.skill.name,
      skillCd: this.skillCd,
      skillCdMax: this.skill.cd,
      bossName,
      bossHp,
      bossMaxHp,
      cleared: this.cleared,
      failed: this.failed,
    };
  }
}
