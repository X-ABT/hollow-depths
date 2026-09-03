/**
 * 固定步长主循环：逻辑恒以 60Hz 推进，渲染帧用 alpha 对位置插值。
 *
 * 1) 保证 60 / 120 / 144Hz 显示器上的移动速度、CD、弹道完全一致；
 * 2) 保证性能数据可复现（压测时逻辑步数恒定）；
 * 3) 切后台/掉帧时钳制追帧步数，避免"死亡螺旋"。
 */
export class Loop {
  static readonly STEP = 1 / 60;
  /** 单帧最多补的逻辑步数，超出直接丢弃时间（防止卡顿雪崩） */
  static readonly MAX_STEPS = 5;

  private acc = 0;
  private last = 0;
  private rafId = 0;
  private running = false;
  private paused = false;

  /** 实时 FPS（滑动平均），供性能面板显示 */
  fps = 60;
  /** 上一帧中执行的逻辑步数 */
  stepsLastFrame = 1;

  onFixed: (dt: number) => void = () => {};
  onRender: (alpha: number, frameDt: number) => void = () => {};

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    document.addEventListener('visibilitychange', this.onVisibility);
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    // 恢复时重置时间基准，避免累积后台时间
    if (!p) {
      this.last = performance.now();
      this.acc = 0;
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private onVisibility = (): void => {
    // 切回前台：丢弃离开期间累积的时间
    if (!document.hidden) {
      this.last = performance.now();
      this.acc = 0;
    }
  };

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    let frameDt = (now - this.last) / 1000;
    this.last = now;
    // 掉帧保护：单帧最多按 250ms 计
    if (frameDt > 0.25) frameDt = 0.25;
    if (frameDt > 0) this.fps += ((1 / frameDt) - this.fps) * 0.12;

    if (this.paused) {
      // 暂停时仍然渲染（UI 覆盖层动画需要），但不推进逻辑
      this.onRender(1, 0);
      return;
    }

    this.acc += frameDt;
    let steps = 0;
    while (this.acc >= Loop.STEP && steps < Loop.MAX_STEPS) {
      this.onFixed(Loop.STEP);
      this.acc -= Loop.STEP;
      steps++;
    }
    // 追不上就丢弃余量，宁可慢放也不要雪崩
    if (this.acc > Loop.STEP * Loop.MAX_STEPS) this.acc = 0;
    this.stepsLastFrame = steps || this.stepsLastFrame;

    this.onRender(this.acc / Loop.STEP, frameDt);
  };
}
