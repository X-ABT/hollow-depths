export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** 平滑趋近，与帧率无关 */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

/** 角度最短路插值 */
export function angleLerp(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d < -Math.PI) d += TAU;
  return a + d * t;
}

/** 升级经验曲线「10 级后放缓」的起效等级（达到 10 级起，即 10→11 这一档开始生效） */
const XP_SOFTEN_LEVEL = 10;
/** 起效后指数递增项乘数：×1.15 ≈ 升级放缓约 15%（仅作用于指数递增部分，保持每级所需严格递增不倒退） */
const XP_SOFTEN_MUL = 1.15;

/** 指数增长的升级经验曲线；达到 10 级后（level>=10）指数递增项 ×1.15，升级放缓约 15% */
export function xpForLevel(level: number): number {
  let growth = Math.pow(level, 1.55) * 2.2;
  if (level >= XP_SOFTEN_LEVEL) growth *= XP_SOFTEN_MUL;
  return Math.floor(5 + level * 6 + growth);
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = (s / 60) | 0;
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function formatNum(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
  return String(Math.floor(n));
}

/** 灵魂显示：内部以 0.01 为单位，展示两位小数（100 = 1.00） */
export function formatSouls(cents: number): string {
  return (Math.floor(cents) / 100).toFixed(2);
}
