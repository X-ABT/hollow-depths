import type { CharacterDef } from '../data/characters';
import { PASSIVES, type PassiveDef, type Stats } from '../data/passives';
import { POOL_WEAPONS, WEAPON_BY_ID, type WeaponDef } from '../data/weapons';
import { i18nDesc, i18nName, isEn, t } from '../i18n';

/** 被动当前等级的文案（语言相关，英文未提供时回退中文函数） */
function passiveText(def: PassiveDef, lv: number): string {
  return isEn() && def.enLvlText ? def.enLvlText(lv) : def.lvlText(lv);
}

export const MAX_WEAPON_SLOTS = 6;
export const MAX_PASSIVE_SLOTS = 6;

/** sub 中「前缀 + 细节」的分隔：中文用全角空格（视觉等宽），英文用间隔点 */
const SUB_SEP = isEn() ? ' · ' : '　';

export interface OwnedWeapon {
  def: WeaponDef;
  level: number;
}
export interface OwnedPassive {
  def: PassiveDef;
  level: number;
}

export interface UpgradeOption {
  kind: 'weapon' | 'passive' | 'evolve';
  id: string;
  title: string;
  desc: string;
  sub: string;
  icon: number;
  /** 进化目标武器 id（kind === 'evolve' 时有效） */
  evolveTo?: string;
}

/** 本局升级随机池的可用范围：未解锁的「新武器/新被动」不出现；已持有的升级不受限 */
export interface PoolFilter {
  weapons?: ReadonlySet<string>;
  passives?: ReadonlySet<string>;
}

function emptyStats(char: CharacterDef): Stats {
  return {
    speed: char.base.speed,
    damageMul: 1,
    fireRateMul: 1,
    projBonus: 0,
    xpMul: 1,
    critChance: char.base.critChance,
    critMult: char.base.critMult,
    armor: char.base.armor,
    regen: char.base.regen,
    pickupRange: char.base.pickupRange,
    maxHp: char.base.hp,
  };
}

/**
 * 玩家本局的 build：武器/被动槽位 + 派生属性 + 升级选项生成。
 *
 * 属性采用「每次变动整体重算」而非增量累加，避免浮点误差与移除时的回滚复杂度；
 * 重算只在升级时发生（一局最多几十次），完全不在热路径上。
 */
export class Build {
  readonly weapons: OwnedWeapon[] = [];
  readonly passives: OwnedPassive[] = [];
  char: CharacterDef;
  stats: Stats;
  /** 属性版本号：武器系统据此判断是否需要刷新常驻投射物的数值 */
  version = 0;
  /** 跨局永久升级后的起始等级表（id → 起始等级，缺省 1） */
  private startWeapons: Record<string, number>;
  private startPassives: Record<string, number>;

  constructor(
    char: CharacterDef,
    startLevels?: { weapons: Record<string, number>; passives: Record<string, number> },
  ) {
    this.char = char;
    this.startWeapons = startLevels?.weapons ?? {};
    this.startPassives = startLevels?.passives ?? {};
    this.stats = emptyStats(char);
    this.recompute();
  }

  /** 武器/被动的永久起始等级（受满级上限约束，至少 1） */
  startLevel(id: string, maxLevel: number, kind: 'weapon' | 'passive'): number {
    const map = kind === 'weapon' ? this.startWeapons : this.startPassives;
    const raw = map[id];
    const lv = typeof raw === 'number' && raw >= 1 ? Math.floor(raw) : 1;
    return Math.min(lv, maxLevel);
  }

  recompute(): void {
    const s = emptyStats(this.char);
    this.char.perk(s);
    for (let i = 0; i < this.passives.length; i++) {
      const p = this.passives[i];
      p.def.apply(s, p.level);
    }
    this.stats = s;
    this.version++;
  }

  weaponById(id: string): OwnedWeapon | undefined {
    for (let i = 0; i < this.weapons.length; i++) if (this.weapons[i].def.id === id) return this.weapons[i];
    return undefined;
  }

  passiveById(id: string): OwnedPassive | undefined {
    for (let i = 0; i < this.passives.length; i++) if (this.passives[i].def.id === id) return this.passives[i];
    return undefined;
  }

  hasWeapon(id: string): boolean {
    return this.weaponById(id) !== undefined;
  }

  addWeapon(id: string): 'added' | 'leveled' | 'full' {
    const def = WEAPON_BY_ID[id];
    if (!def) return 'full';
    const owned = this.weaponById(id);
    if (owned) {
      if (owned.level >= owned.def.maxLevel) return 'full';
      owned.level++;
      this.recompute();
      return 'leveled';
    }
    if (this.weapons.length >= MAX_WEAPON_SLOTS) return 'full';
    this.weapons.push({ def, level: this.startLevel(id, def.maxLevel, 'weapon') });
    this.recompute();
    return 'added';
  }

  addPassive(id: string): 'added' | 'leveled' | 'full' {
    const def = PASSIVES.find((p) => p.id === id);
    if (!def) return 'full';
    const owned = this.passiveById(id);
    if (owned) {
      if (owned.level >= def.maxLevel) return 'full';
      owned.level++;
      this.recompute();
      return 'leveled';
    }
    if (this.passives.length >= MAX_PASSIVE_SLOTS) return 'full';
    this.passives.push({ def, level: this.startLevel(id, def.maxLevel, 'passive') });
    this.recompute();
    return 'added';
  }

  /** 当前可进化的武器（武器满级 + 持有指定被动） */
  pendingEvolutions(): { from: string; to: string }[] {
    const out: { from: string; to: string }[] = [];
    for (const w of this.weapons) {
      if (w.def.isEvolved) continue;
      if (!w.def.evolveWith || !w.def.evolved) continue;
      if (w.level < w.def.maxLevel) continue;
      if (!this.passiveById(w.def.evolveWith)) continue;
      if (this.hasWeapon(w.def.evolved)) continue;
      out.push({ from: w.def.id, to: w.def.evolved });
    }
    return out;
  }

  applyEvolution(from: string, to: string): void {
    const idx = this.weapons.findIndex((w) => w.def.id === from);
    if (idx < 0) return;
    const def = WEAPON_BY_ID[to];
    if (!def) return;
    this.weapons[idx] = { def, level: 1 };
    this.recompute();
  }

  /** 生成三选一（进化优先，其次新武器/武器升级，再被动） */
  rollOptions(rng: { next(): number }, count = 3, pool?: PoolFilter): UpgradeOption[] {
    const opts: UpgradeOption[] = [];

    // 1) 进化（最高优先级，单独占一个位置）
    const evo = this.pendingEvolutions();
    if (evo.length > 0) {
      const pick = evo[(rng.next() * evo.length) | 0];
      const to = WEAPON_BY_ID[pick.to];
      opts.push({
        kind: 'evolve',
        id: pick.from,
        evolveTo: pick.to,
        title: i18nName(to),
        desc: i18nDesc(to),
        sub: t('build.evolution'),
        icon: to.icon,
      });
    }

    // 2) 武器：新武器 + 已有武器升级
    const weaponPool: UpgradeOption[] = [];
    for (const def of POOL_WEAPONS) {
      // 已进化过的武器不再重复提供：该基础武器的进化形态已被持有，
      // 说明它已升级满并合成到进化形态，不应再让玩家拿到第二把原版。
      if (def.evolved && this.hasWeapon(def.evolved)) continue;
      const owned = this.weaponById(def.id);
      if (!owned) {
        if (this.weapons.length >= MAX_WEAPON_SLOTS) continue;
        if (pool?.weapons && !pool.weapons.has(def.id)) continue;
        const sl = this.startLevel(def.id, def.maxLevel, 'weapon');
        weaponPool.push({
          kind: 'weapon',
          id: def.id,
          title: i18nName(def),
          desc: i18nDesc(def),
          sub: sl > 1 ? t('build.newWeaponAt', { lv: sl }) : t('build.newWeapon'),
          icon: def.icon,
        });
      } else if (owned.level < owned.def.maxLevel) {
        const i = owned.level - 1;
        weaponPool.push({
          kind: 'weapon',
          id: def.id,
          title: i18nName(def),
          desc: i18nDesc(def),
          sub: t('build.wepUp', {
            from: owned.level,
            to: owned.level + 1,
            dmgFrom: owned.def.dmg[i],
            dmgTo: owned.def.dmg[i + 1],
          }),
          icon: def.icon,
        });
      }
    }

    // 3) 被动
    const passivePool: UpgradeOption[] = [];
    for (const def of PASSIVES) {
      const owned = this.passiveById(def.id);
      if (!owned) {
        if (this.passives.length >= MAX_PASSIVE_SLOTS) continue;
        if (pool?.passives && !pool.passives.has(def.id)) continue;
        const sl = this.startLevel(def.id, def.maxLevel, 'passive');
        passivePool.push({
          kind: 'passive',
          id: def.id,
          title: i18nName(def),
          desc: i18nDesc(def),
          sub: t('build.newGear') + SUB_SEP + passiveText(def, sl),
          icon: def.icon,
        });
      } else if (owned.level < def.maxLevel) {
        passivePool.push({
          kind: 'passive',
          id: def.id,
          title: i18nName(def),
          desc: i18nDesc(def),
          sub: t('build.pasUp', { from: owned.level, to: owned.level + 1 }) + SUB_SEP + passiveText(def, owned.level + 1),
          icon: def.icon,
        });
      }
    }

    const pick = <T>(arr: T[]): T | undefined =>
      arr.length ? arr.splice((rng.next() * arr.length) | 0, 1)[0] : undefined;

    // 武器与被动大致 1:1 混合，保证 build 均衡
    while (opts.length < count) {
      const wantWeapon = opts.length % 2 === 1;
      const first = pick(wantWeapon ? weaponPool : passivePool);
      const second = pick(wantWeapon ? passivePool : weaponPool);
      if (first) opts.push(first);
      else if (second) opts.push(second);
      else break;
    }

    // 池子全空时的兜底：回血（实际生效效果由 Game 处理：立即恢复 30 点生命）
    while (opts.length < count) {
      opts.push({
        kind: 'passive',
        id: '__heal',
        title: t('build.healTitle'),
        desc: t('build.healDesc'),
        sub: t('build.fallback'),
        icon: 38,
      });
    }

    return opts.slice(0, count);
  }

  applyOption(opt: UpgradeOption): void {
    if (opt.kind === 'evolve' && opt.evolveTo) {
      this.applyEvolution(opt.id, opt.evolveTo);
      return;
    }
    if (opt.kind === 'weapon') {
      this.addWeapon(opt.id);
      return;
    }
    // __heal（兜底治疗）不产生 build 属性变化，恢复效果由 Game 单独应用；
    // 落到 addPassive 会因被动表内不存在该 id 而安全 no-op
    this.addPassive(opt.id);
  }
}
