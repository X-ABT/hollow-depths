/**
 * 密集数组对象池：预分配固定容量，运行期零 `new`。
 *
 * 活跃实体始终位于 [0, count)，回收时用「末尾交换 + count--」保持密集，
 * 既保证遍历的缓存局部性，也让遍历中途删除安全（需倒序遍历）。
 */
export class Pool<T> {
  readonly items: T[];
  /** 活跃数量 */
  count = 0;
  readonly capacity: number;
  private readonly factory: () => T;

  constructor(capacity: number, factory: () => T) {
    this.capacity = capacity;
    this.factory = factory;
    this.items = new Array<T>(capacity);
    for (let i = 0; i < capacity; i++) this.items[i] = factory();
  }

  /** 取出一个对象（可能是复用对象，调用方必须完整初始化所有字段）。池满时返回 null。 */
  spawn(): T | null {
    if (this.count >= this.capacity) return null;
    return this.items[this.count++];
  }

  /** 回收第 i 个对象：与末尾交换后收缩 */
  releaseAt(i: number): void {
    const last = --this.count;
    if (i !== last) {
      const tmp = this.items[i];
      this.items[i] = this.items[last];
      this.items[last] = tmp;
    }
  }

  clear(): void {
    this.count = 0;
  }

  get free(): number {
    return this.capacity - this.count;
  }
}
