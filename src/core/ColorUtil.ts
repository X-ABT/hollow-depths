/**
 * 共享颜色工具（纯函数）。
 *
 * 从 render/Textures.ts 抽出，供「贴图程序化绘制」与「数据层宠物染色」等
 * 不同模块共用同一实现，避免跨层 import render（Textures 又依赖 data）造成循环依赖。
 */

/** HSL → 0xRRGGBB（s / l 用 0-100 的百分数传入） */
export function hslToRgb(h: number, s: number, l: number): number {
  const S = s / 100;
  const L = l / 100;
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = S * Math.min(L, 1 - L);
    const c = L - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  return ((f(0) & 0xff) << 16) | ((f(8) & 0xff) << 8) | (f(4) & 0xff);
}
