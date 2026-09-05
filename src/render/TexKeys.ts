/**
 * 图集纹理索引（全部由代码程序化绘制后烘焙进单张 RenderTexture）。
 *
 * 为什么不用外部素材：
 *   · 零网络请求、零版权风险、首屏体积 < 200KB（远低于 3MB 预算）；
 *   · 单张 atlas + 单一 BaseTexture ⇒ PixiJS 可以把所有精灵合进极少的 draw call。
 */
export const enum Tex {
  Player = 0,
  Wraith = 1,
  Swarmling = 2,
  Slime = 3,
  Phantom = 4,
  Grub = 5,
  Splinter = 6,
  Carapace = 7,
  Trickster = 8,
  BossHerald = 9,
  BossCalamity = 10,
  BossEndless = 11,

  OrbHalo = 12,
  OrbSeeker = 13,
  Shard = 14,
  Wave = 15,
  Beam = 16,
  Frost = 17,
  Rift = 18,

  GemXp = 19,
  GemXpBig = 20,
  Chest = 21,
  Heart = 22,
  Magnet = 23,

  Spark = 24,
  Dust = 25,
  Ring = 26,

  IconRift = 27,
  IconHalo = 28,
  IconSeeker = 29,
  IconShock = 30,
  IconShard = 31,
  IconBeam = 32,
  IconFrost = 33,

  IconHaste = 34,
  IconBoots = 35,
  IconMirror = 36,
  IconRage = 37,
  IconLife = 38,
  IconArmor = 39,
  IconWisdom = 40,
  IconCrit = 41,
  Gunner = 42,

  /** 宠物粮袋图标 */
  PetFood = 43,
  /** 宠物身体贴图：Pet + 下标 0..N-1 依次对应 pets.ts 的 PETS 表（当前 13 只） */
  Pet = 44,

  /** 宠物爪击特效：三条竖线 */
  PetClaw = 57,

  /** 泣灵 Boss（无尽幽墟） */
  BossLament = 58,
  /** 渊喉 Boss（无尽幽墟） */
  BossMaw = 59,

  /** 暴击星芒：四向光芒 + 发光核（白色主体，运行期 tint） */
  SparkStar = 60,
  /** 命中冲击环：中空扩散环带柔光（白色主体，运行期 tint） */
  HitRing = 61,
  /** 宠物横扫弧：横向月牙弧（飞翼系/扫击专用，白色主体，运行期 tint） */
  PetSlash = 62,

  COUNT = 63,
}

export const TEX_SIZE = 64;
