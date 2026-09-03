/**
 * 可 seed 的伪随机数发生器（mulberry32）。
 * 保证同一 seed 下波次与掉落完全可复现，便于压测与复盘。
 */
export class Rng {
  private s: number;

  constructor(seed: number = (Math.random() * 0xffffffff) >>> 0) {
    this.s = seed >>> 0;
  }

  /** [0,1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [a,b) */
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  /** [0,n) 整数 */
  int(n: number): number {
    return (this.next() * n) | 0;
  }

  /** 随机布尔 */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[(this.next() * arr.length) | 0];
  }

  /** 单位圆内随机方向，写入 out 避免分配 */
  dir(out: { x: number; y: number }): void {
    const a = this.next() * Math.PI * 2;
    out.x = Math.cos(a);
    out.y = Math.sin(a);
  }

  reseed(seed: number): void {
    this.s = seed >>> 0;
  }
}

export const rng = new Rng();
