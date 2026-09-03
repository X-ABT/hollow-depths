/**
 * 空间哈希网格（均匀网格 + 桶哈希 + 计数排序），每帧可处理数千实体。
 *
 * 关键点：
 *  1. 全部使用预分配的 TypedArray，运行期零 `new`、零 GC；
 *  2. 采用「桶哈希」而非二维 Map：内存固定（不随世界范围增长），clear 只是一次 fill；
 *  3. 构建用计数排序（两趟 O(n)），比 `Map<number, Entity[]>` 快一个量级；
 *  4. 查询只遍历半径覆盖的格（通常 2×2 ~ 3×3），把 2000 实体的碰撞从 O(n²) 降到近 O(n)；
 *  5. `stamp` 标记避免不同格哈希到同一桶时重复返回同一实体。
 */
const BUCKET_BITS = 12;
const BUCKETS = 1 << BUCKET_BITS; // 4096
const BUCKET_MASK = BUCKETS - 1;

export class SpatialHash {
  readonly cell: number;
  private readonly cap: number;

  // 插入缓冲（按插入顺序）
  private readonly insX: Float32Array;
  private readonly insY: Float32Array;
  private readonly insKey: Int32Array;
  private readonly insItem: Int32Array;

  // 排序后（按桶顺序，三者同序）
  private readonly sortedItem: Int32Array;
  private readonly sortedX: Float32Array;
  private readonly sortedY: Float32Array;

  private readonly counts = new Int32Array(BUCKETS + 1);
  private readonly starts = new Int32Array(BUCKETS + 1);
  private readonly cursor = new Int32Array(BUCKETS);
  private readonly stamp: Int32Array;
  private curStamp = 0;
  private n = 0;

  /** 查询临时缓冲（复用，避免分配） */
  private readonly qbuf = new Int32Array(2048);
  /** 实体下标 → 排序后槽位（build 时反向填充，供 queryNearest 取坐标） */
  private readonly slotOf: Int32Array;

  constructor(capacity: number, cell: number) {
    this.cap = capacity;
    this.cell = cell;
    this.insX = new Float32Array(capacity);
    this.insY = new Float32Array(capacity);
    this.insKey = new Int32Array(capacity);
    this.insItem = new Int32Array(capacity);
    this.sortedItem = new Int32Array(capacity);
    this.sortedX = new Float32Array(capacity);
    this.sortedY = new Float32Array(capacity);
    this.stamp = new Int32Array(capacity);
    this.slotOf = new Int32Array(capacity);
  }

  clear(): void {
    this.n = 0;
    this.counts.fill(0);
  }

  private static keyOfCell(cx: number, cy: number): number {
    return (Math.imul(cx, 92837111) ^ Math.imul(cy, 689287499)) & BUCKET_MASK;
  }

  insert(x: number, y: number, index: number): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    this.insX[i] = x;
    this.insY[i] = y;
    this.insKey[i] = SpatialHash.keyOfCell(cx, cy);
    this.insItem[i] = index;
    this.counts[this.insKey[i]]++;
  }

  /** 插入完毕后调用：计数排序，构建桶 → 实体的有序索引 */
  build(): void {
    const counts = this.counts;
    const starts = this.starts;
    let sum = 0;
    for (let b = 0; b < BUCKETS; b++) {
      starts[b] = sum;
      this.cursor[b] = sum;
      sum += counts[b];
    }
    starts[BUCKETS] = sum;

    for (let i = 0; i < this.n; i++) {
      const p = this.cursor[this.insKey[i]]++;
      const ent = this.insItem[i];
      this.sortedItem[p] = ent;
      this.sortedX[p] = this.insX[i];
      this.sortedY[p] = this.insY[i];
      this.slotOf[ent] = p;
    }
  }

  /**
   * 查询圆形范围内的实体下标（粗筛，已按距离过滤），写入 out，返回数量。
   * out 由调用方预分配；容量不足时截断（不抛错）。
   */
  query(x: number, y: number, r: number, out: Int32Array): number {
    if (this.n === 0) return 0;
    const c = this.cell;
    const minCx = Math.floor((x - r) / c);
    const maxCx = Math.floor((x + r) / c);
    const minCy = Math.floor((y - r) / c);
    const maxCy = Math.floor((y + r) / c);

    const stamp = ++this.curStamp;
    const starts = this.starts;
    const stampArr = this.stamp;
    const sItem = this.sortedItem;
    const sX = this.sortedX;
    const sY = this.sortedY;
    const r2 = r * r;
    const outCap = out.length;
    let found = 0;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const k = SpatialHash.keyOfCell(cx, cy);
        const s = starts[k];
        const e = starts[k + 1];
        for (let p = s; p < e; p++) {
          if (stampArr[p] === stamp) continue;
          stampArr[p] = stamp;
          const dx = sX[p] - x;
          const dy = sY[p] - y;
          if (dx * dx + dy * dy <= r2) {
            if (found >= outCap) return found;
            out[found++] = sItem[p];
          }
        }
      }
    }
    return found;
  }

  /** 查询范围内最近的一个实体下标，没有则 -1 */
  queryNearest(x: number, y: number, r: number): number {
    const found = this.query(x, y, r, this.qbuf);
    if (found === 0) return -1;
    const sX = this.sortedX;
    const sY = this.sortedY;
    const slotOf = this.slotOf;
    let best = this.qbuf[0];
    let bp = slotOf[best];
    let bestD = (sX[bp] - x) * (sX[bp] - x) + (sY[bp] - y) * (sY[bp] - y);
    for (let i = 1; i < found; i++) {
      const e = this.qbuf[i];
      const p = slotOf[e];
      const dx = sX[p] - x;
      const dy = sY[p] - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  get size(): number {
    return this.n;
  }
}
