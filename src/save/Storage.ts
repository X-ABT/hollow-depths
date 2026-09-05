/**
 * 存档持久化（v2：混淆 + 带盐签名 + 数值钳制）。
 *
 * v1（明文 JSON）已废弃但保留一次性无损迁移：首次读取到 v1 明文档时，
 * 经 sanitize 清洗后自动编码落 v2 并删除 v1 旧 key，老玩家进度不丢。
 *
 * 安全模型（诚实声明）：
 * - 纯前端无法防住「会逆向的人」，目标是挡住「F12 改一下数字就无敌」的普通玩家；
 * - 混淆使明文不可直接读改；带盐 FNV 签名使「改了数据重存」会校验失败；
 * - 校验失败不销毁进度，而是持久化作弊标记（标题页展示），并对内容做钳制，
 *   防止畸形数值破坏平衡；
 * - 数字钳制在任何路径（load 后 / save 前）都会执行，作为纵深防线。
 */

/** 语言偏好是独立 key（src/i18n/lang.ts 管理），不在本模块职责内，勿改动。 */

const KEY = 'hollow-depths.save.v2';
/** v1 明文旧档 key：仅用于一次性迁移 */
const KEY_LEGACY = 'hollow-depths.save.v1';
/** 作弊标记独立 key（不随存档序列化，防「改完数据顺手删掉标记」的自洽作弊） */
const KEY_TAMPER = 'hollow-depths.tamper.v1';

/** 两段盐：刻意拆分、不出现在同一行注释里，避免一眼被抄。 */
const SALT_A = 'hD:rng' + '·' + 'aK7!';
const SALT_B = '幽墟' + 'SALT' + String.fromCharCode(55, 57);

/** XOR 混淆轮转表（与盐无关，仅做「非明文」目的；安全靠签名，不靠它） */
const XOR_TABLE = [0x1f, 0xa7, 0x4c, 0x62, 0xd5, 0x0b, 0x8e, 0x39, 0x73, 0xc1, 0x56, 0x2a, 0x90, 0xe4];

/** 分隔符（payload 与签名） */
const SEP = '.';

/** 新玩家默认解锁（进入每局升级随机池）：武器＝裂地印记(角色自带)＋贯穿光束；被动＝智慧卷轴 */
export const DEFAULT_UNLOCKED_WEAPONS: readonly string[] = ['rift', 'beam'];
export const DEFAULT_UNLOCKED_PASSIVES: readonly string[] = ['wisdom'];

/**
 * 合法 id 白名单与等级上限（静态快照，与 data/*.ts 保持同步）。
 * 刻意不 import data 模块：weapons/passives 顶层会拉起 ecs/Spawn、图集等运行时依赖，
 * Storage 作为最底层设施引入它们会污染依赖方向并带来潜在循环。
 */
const WEAPON_MAX_LV: Readonly<Record<string, number>> = {
  rift: 8, halo: 8, seeker: 8, shock: 8, shard: 8, beam: 8, frost: 8,
  rift_abyss: 1, halo_twin: 1, seeker_chain: 1, shock_instant: 1, shard_rain: 1, beam_twin: 1, frost_follow: 1,
};
const PASSIVE_MAX_LV: Readonly<Record<string, number>> = {
  haste: 5, boots: 5, mirror: 5, rage: 5, life: 5, armor: 5, wisdom: 5, crit: 5,
};
/** 全部宠物 id（含免费宠 budling） */
const PET_IDS: ReadonlySet<string> = new Set([
  'soulbat', 'rustbug', 'bonehound', 'paperlamp', 'mistfrog', 'sproutling',
  'abysshound', 'crystalcoot', 'glowmoth', 'frostcat',
  'drake', 'stareye', 'budling',
]);

// ———————————————— 数值上限（钳制，防畸形值破坏平衡）——————————————
/** 灵魂（单位 0.01）。1e9 cents = 1000 万灵魂，远超正常可玩累计量级一个数量级 */
const MAX_SOUL_CENTS = 1e9;
const MAX_PURCHASES = 999;
const MAX_RUNS = 10_000_000;
const MAX_SECONDS = 86_400; // 单局最长 24h（防超长虚报）
const MAX_CURRENCY = 10_000_000; // petFood / petShards / starCoins
const MAX_PET_LEVEL = 999;
const MAX_SKILL_LEVEL = 100;
const MAX_EXP_STAGE = 6000; // 6 的倍数；正常打完需要极其漫长
const MAX_USED_CODES = 64;

export interface SaveData {
  bestTime: number;
  bestKills: number;
  bestLevel: number;
  runs: number;
  wins: number;
  /** 跨局永久「灵魂」，单位为 0.01（1 灵魂 = 100） */
  soulCents: number;
  /** 商店历史购买次数：当前购买价 = 3 + purchases（首件 3，逐次 +1） */
  purchases: number;
  /** 已永久解锁、可进入每局升级池的基础武器 id */
  unlockedWeapons: string[];
  /** 已永久解锁、可进入每局升级池的被动 id */
  unlockedPassives: string[];
  /** 永久升级后的武器起始等级（id → 起始等级，缺省视作 1） */
  weaponLevels: Record<string, number>;
  /** 永久升级后的被动起始等级 */
  passiveLevels: Record<string, number>;
  /** 已获得的宠物 id（顺序即图鉴/列表顺序，去重） */
  petsOwned: string[];
  /** petId → 宠物等级（缺省视作 1） */
  petLevels: Record<string, number>;
  /** 宠物粮袋数量（整数） */
  petFood: number;
  /** 宠物碎片（宠物商店通用货币，整数） */
  petShards: number;
  /** 宠物远征专属货币「星币」（仅用于升级宠物技能等级与兑换宠物碎片，独立于 petShards） */
  starCoins: number;
  /** 宠物远征存档点：上次击败的最高 Boss 关号（0=从未击败，仅 6 的倍数）；再次进入从其下一关开始 */
  expBossStage: number;
  /** petId → 宠物远征技能等级（缺省视作 0） */
  petSkillLevels: Record<string, number>;
  /** 本局上阵的宠物 id（长度不超过槽位数） */
  petLoadout: string[];
  /** 局内「紧凑模式」：隐藏超大宠物巨兽本体，避免遮挡走位/弹幕视野 */
  petCompact: boolean;
  /** 是否已领取饲养园的免费基础宠物（一生一次） */
  freePetClaimed: boolean;
  /** 已生效的一次性调试码（每档存档各只生效一次，清除数据后重置） */
  usedCodes: string[];
}

const DEFAULT: SaveData = {
  bestTime: 0,
  bestKills: 0,
  bestLevel: 1,
  runs: 0,
  wins: 0,
  soulCents: 0,
  purchases: 0,
  unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS],
  unlockedPassives: [...DEFAULT_UNLOCKED_PASSIVES],
  weaponLevels: {},
  passiveLevels: {},
  petsOwned: [],
  petLevels: {},
  petFood: 0,
  petShards: 0,
  /** 宠物远征专属货币「星币」 */
  starCoins: 0,
  /** 宠物远征存档点（0=尚未击败过 Boss） */
  expBossStage: 0,
  /** petId → 远征技能等级 */
  petSkillLevels: {},
  petLoadout: [],
  petCompact: false,
  freePetClaimed: false,
  usedCodes: [],
};

// ———————————————— 编码 / 签名工具 ————————————————

/**
 * XOR 逐字节混淆。输入/输出均为 Latin-1 码点（0-255）字符串：
 * encode 侧输入是 encodeURIComponent 归一后的纯 ASCII；decode 侧输入来自 atob 的 Latin-1。
 * XOR 自反：同一张表可编可解。
 */
function xorCodec(latin1: string): string {
  let out = '';
  for (let i = 0; i < latin1.length; i++) {
    out += String.fromCharCode(latin1.charCodeAt(i) ^ XOR_TABLE[i % XOR_TABLE.length]);
  }
  return out;
}

function encodePayload(json: string): string {
  // JSON → UTF-8 安全 ASCII → XOR → Latin-1 → base64（btoa 只收 0-255）
  return btoa(xorCodec(encodeURIComponent(json)));
}

function decodePayload(b64: string): string {
  const xored = xorCodec(atob(b64)); // 还原为 encodeURIComponent 串
  return decodeURIComponent(xored);
}

/** FNV-1a 单通道摘要（32 位，转 base36 缩短） */
function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 双通道加盐签名：不同 seed 对「盐+内容」「内容+盐」各算一次，拼 base36 */
function sign(rawJson: string): string {
  const a = fnv1a(SALT_A + rawJson, 0x811c9dc5).toString(36);
  const b = fnv1a(rawJson + SALT_B, 0x9e3779b9).toString(36);
  return a + b;
}

function verify(rawJson: string, sig: string): boolean {
  if (!sig || sig.length < 8) return false;
  return sig === sign(rawJson);
}

/** 读取 key 内的 v2 串，返回「载荷 | 签名 | 是否存在」 */
function readV2(): { raw: string | null; ok: boolean } | null {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return null;
    const idx = stored.indexOf(SEP);
    if (idx < 0) return { raw: null, ok: false };
    const payload = stored.slice(0, idx);
    const sig = stored.slice(idx + 1);
    const json = decodePayload(payload);
    return { raw: json, ok: verify(json, sig) };
  } catch {
    return { raw: null, ok: false };
  }
}

/** 尝试读取旧 v1 明文（兼容迁移）。返回 null 表示不存在或已损坏 */
function readLegacy(): Partial<SaveData> | null {
  try {
    const raw = localStorage.getItem(KEY_LEGACY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// ———————————————— 作弊标记 ————————————————

/** 是否带作弊标记（标题页据此显示警示标签） */
export function isTampered(): boolean {
  try {
    return localStorage.getItem(KEY_TAMPER) === '1';
  } catch {
    return false;
  }
}

function markTampered(): void {
  try {
    localStorage.setItem(KEY_TAMPER, '1');
  } catch {
    /* 存储不可用则仅内存态由下次 load 再判 */
  }
}

function clearTampered(): void {
  try {
    localStorage.removeItem(KEY_TAMPER);
  } catch {
    /* 忽略 */
  }
}

// ———————————————— 数值钳制 / 清洗 ————————————————

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : min;
  return Math.min(max, Math.max(min, n));
}

/** 过滤未知 id 并逐项钳制到上限 */
function clampLevels(
  src: unknown,
  maxBy: Readonly<Record<string, number>>,
  min: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (src && typeof src === 'object') {
    for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
      const cap = maxBy[id];
      if (cap === undefined) continue; // 未知 id 直接丢弃
      out[id] = clampInt(v, min, cap);
    }
  }
  return out;
}

function clampRecord(src: unknown, allowed: ReadonlySet<string>, min: number, max: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (src && typeof src === 'object') {
    for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
      if (!allowed.has(id)) continue;
      out[id] = clampInt(v, min, max);
    }
  }
  return out;
}

function filterIds(src: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(src)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of src) {
    if (typeof x === 'string' && allowed.has(x) && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function sanitize(d: Partial<SaveData>): SaveData {
  const s: SaveData = {
    ...DEFAULT,
    bestTime: clampInt(d.bestTime, 0, MAX_SECONDS),
    bestKills: clampInt(d.bestKills, 0, MAX_RUNS),
    bestLevel: clampInt(d.bestLevel, 1, 999),
    runs: clampInt(d.runs, 0, MAX_RUNS),
    wins: clampInt(d.wins, 0, MAX_RUNS),
    soulCents: clampInt(d.soulCents, 0, MAX_SOUL_CENTS),
    purchases: clampInt(d.purchases, 0, MAX_PURCHASES),
    unlockedWeapons: (() => {
      const known = new Set(Object.keys(WEAPON_MAX_LV));
      const f = filterIds(d.unlockedWeapons, known);
      // 确保默认解锁武器始终在池中，避免玩家把商店买到的最后一把也弄丢到无法开局
      for (const id of DEFAULT_UNLOCKED_WEAPONS) if (!f.includes(id)) f.push(id);
      return f;
    })(),
    unlockedPassives: (() => {
      const known = new Set(Object.keys(PASSIVE_MAX_LV));
      const f = filterIds(d.unlockedPassives, known);
      for (const id of DEFAULT_UNLOCKED_PASSIVES) if (!f.includes(id)) f.push(id);
      return f;
    })(),
    weaponLevels: clampLevels(d.weaponLevels, WEAPON_MAX_LV, 1),
    passiveLevels: clampLevels(d.passiveLevels, PASSIVE_MAX_LV, 1),
    petsOwned: filterIds(d.petsOwned, PET_IDS),
    petLevels: clampRecord(d.petLevels, PET_IDS, 1, MAX_PET_LEVEL),
    petFood: clampInt(d.petFood, 0, MAX_CURRENCY),
    petShards: clampInt(d.petShards, 0, MAX_CURRENCY),
    starCoins: clampInt(d.starCoins, 0, MAX_CURRENCY),
    // 存档点为 6 的倍数；非法值向下取整到最近的 6 倍数
    expBossStage: (() => {
      const v = clampInt(d.expBossStage, 0, MAX_EXP_STAGE);
      return Math.floor(v / 6) * 6;
    })(),
    petSkillLevels: clampRecord(d.petSkillLevels, PET_IDS, 0, MAX_SKILL_LEVEL),
    petLoadout: filterIds(d.petLoadout, new Set(filterIds(d.petsOwned, PET_IDS))).slice(0, 3),
    petCompact: d.petCompact === true,
    freePetClaimed: d.freePetClaimed === true,
    usedCodes: (Array.isArray(d.usedCodes) ? d.usedCodes : []).filter((x) => typeof x === 'string').slice(0, MAX_USED_CODES),
  };
  return s;
}

function encode(save: SaveData): string {
  const json = JSON.stringify(sanitize(save));
  return encodePayload(json) + SEP + sign(json);
}

/** localStorage 读写：任何异常都不应影响游戏进行（无痕模式 / 禁用存储） */
export class Storage {
  /** 深拷贝一份默认存档（数组/对象各自复制，避免跨存档共享引用） */
  private static freshDefault(): SaveData {
    return {
      ...DEFAULT,
      unlockedWeapons: [...DEFAULT_UNLOCKED_WEAPONS],
      unlockedPassives: [...DEFAULT_UNLOCKED_PASSIVES],
      weaponLevels: {},
      passiveLevels: {},
      petsOwned: [],
      petLevels: {},
      starCoins: 0,
      expBossStage: 0,
      petSkillLevels: {},
      petLoadout: [],
      usedCodes: [],
    };
  }

  /** 从 v2 读出的原始 JSON 与默认档合并，再做防御性深拷贝（字段结构可能与当前版本有出入） */
  private static mergeParsed(rawJson: string): SaveData {
    const parsed = JSON.parse(rawJson) as Partial<SaveData>;
    // 数组/对象字段一律复制，避免跨存档共享引用后被 push 污染；老存档缺字段时回退默认
    const merged: SaveData = sanitize(parsed);
    return merged;
  }

  static load(): SaveData {
    // 1) 尝试 v2
    try {
      const v2 = readV2();
      if (v2 === null) {
        // 2) 无 v2 → 尝试一次性迁移 v1 明文（老档视为合法历史，不标记作弊）
        const legacy = readLegacy();
        if (legacy) {
          const migrated = sanitize(legacy);
          const json = JSON.stringify(migrated);
          try {
            localStorage.setItem(KEY, encodePayload(json) + SEP + sign(json));
            localStorage.removeItem(KEY_LEGACY);
          } catch {
            /* 迁移写回失败：至少本次以内存档运行 */
          }
          return migrated;
        }
        return this.freshDefault();
      }
      if (!v2.ok) {
        // 3) 签名不匹配 → 判定作弊；但仍尽力解码内容（不为空时）钳制后返回，不销毁进度
        markTampered();
        if (v2.raw) {
          try {
            return this.mergeParsed(v2.raw);
          } catch {
            /* 内容也损坏 → 落默认档 */
          }
        }
        return this.freshDefault();
      }
      // 4) 正常 v2 → 合并 + sanitize
      return this.mergeParsed(v2.raw as string);
    } catch {
      return this.freshDefault();
    }
  }

  static save(data: SaveData): void {
    try {
      localStorage.setItem(KEY, encode(data));
    } catch {
      /* 忽略：存储不可用时静默降级为不持久化 */
    }
  }

  static reset(): void {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(KEY_LEGACY);
      clearTampered();
    } catch {
      /* 忽略 */
    }
  }
}
