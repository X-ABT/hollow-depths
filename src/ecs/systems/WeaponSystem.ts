import type { Build } from '../../core/Build';
import { MAX_WEAPON_SLOTS } from '../../core/Build';
import { Behavior, type Proj } from '../Components';
import type { World } from '../World';
import type { FireCtx, WeaponDef } from '../../data/weapons';

/**
 * 武器驱动：统一「冷却 → 开火」循环，具体生成什么由 data/weapons.ts 的 fire() 决定。
 *
 * 常驻型武器（环绕光环）不走冷却，而是用「签名比对」判断是否需要在等级/属性变化时重建，
 * 这样既避免了每帧生成，也不会在升级后留下旧数值的残留光球。
 */
export class WeaponSystem {
  private readonly cds = new Float64Array(MAX_WEAPON_SLOTS);
  private readonly sigs = new Float64Array(MAX_WEAPON_SLOTS);
  private readonly sigIds: string[] = new Array(MAX_WEAPON_SLOTS).fill('');
  private lastVersion = -1;

  reset(): void {
    this.cds.fill(0);
    this.sigs.fill(-1);
    this.sigIds.fill('');
    this.lastVersion = -1;
  }

  /** 清掉某个槽位的全部常驻投射物 */
  private clearPersistent(world: World, slot: number): void {
    const list = world.projs.items;
    for (let i = world.projs.count - 1; i >= 0; i--) {
      const pr = list[i];
      if (pr.behavior === Behavior.Orbit && (pr.srcId >> 4) === slot) {
        world.projs.releaseAt(i);
      }
    }
  }

  /** 属性变化后同步常驻投射物的数值（不重建，避免闪烁） */
  private syncPersistent(world: World, slot: number, ctx: FireCtx): void {
    const list = world.projs.items;
    for (let i = 0; i < world.projs.count; i++) {
      const pr: Proj = list[i];
      if (pr.behavior === Behavior.Orbit && (pr.srcId >> 4) === slot) {
        pr.damage = ctx.dmg;
        pr.critChance = ctx.critChance;
        pr.critMult = ctx.critMult;
      }
    }
  }

  update(world: World, build: Build, dt: number): void {
    const stats = build.stats;
    const p = world.player;
    const weapons = build.weapons;
    const n = Math.min(weapons.length, MAX_WEAPON_SLOTS);
    const versionChanged = this.lastVersion !== build.version;
    this.lastVersion = build.version;

    for (let s = 0; s < n; s++) {
      const owned = weapons[s];
      const def: WeaponDef = owned.def;
      const li = Math.min(owned.level, def.maxLevel) - 1;
      const ctx: FireCtx = {
        world,
        p,
        rng: world.rng,
        slot: s,
        srcId: s * 16,
        level: owned.level,
        dmg: def.dmg[li] * stats.damageMul,
        critChance: stats.critChance,
        critMult: stats.critMult,
        projBonus: stats.projBonus,
      };

      if (def.persistent) {
        const count = def.a[li] + stats.projBonus;
        const sig = owned.level * 1e6 + count * 1e3 + Math.round(def.b[li]);
        if (this.sigIds[s] !== def.id || this.sigs[s] !== sig) {
          this.clearPersistent(world, s);
          def.fire(def, ctx);
          this.sigIds[s] = def.id;
          this.sigs[s] = sig;
        } else if (versionChanged) {
          this.syncPersistent(world, s, ctx);
        }
        continue;
      }

      this.cds[s] -= dt;
      if (this.cds[s] <= 0) {
        def.fire(def, ctx);
        const cd = def.cd[li] / stats.fireRateMul;
        this.cds[s] = cd > 0.02 ? cd : 0.02;
      }
    }

    // 移除武器（进化替换）时清理残留常驻投射物
    for (let s = n; s < MAX_WEAPON_SLOTS; s++) {
      if (this.sigIds[s] !== '') {
        this.clearPersistent(world, s);
        this.sigIds[s] = '';
        this.sigs[s] = -1;
      }
    }
  }
}
