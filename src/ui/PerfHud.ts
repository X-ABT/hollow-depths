/**
 * 性能面板：FPS / 实体数 / 可见精灵 / draw call / 池占用。
 * 既是调试工具，也是面试演示时的「性能优化证据」。
 */
export class PerfHud {
  readonly el: HTMLDivElement;
  private acc = 0;

  constructor(root: HTMLElement) {
    const el = document.createElement('div');
    el.className = 'perf';
    el.hidden = true;
    root.appendChild(el);
    this.el = el;
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  update(dt: number, data: {
    fps: number;
    enemies: number;
    projs: number;
    pickups: number;
    visible: number;
    drawCalls: number;
    steps: number;
  }): void {
    this.acc += dt;
    if (this.acc < 0.2) return; // 5Hz 更新，避免 DOM 写入影响帧率
    this.acc = 0;

    const fpsCls = data.fps >= 55 ? '' : data.fps >= 40 ? 'warn' : 'bad';
    const html =
      `FPS <b class="${fpsCls}">${data.fps.toFixed(0)}</b>  step ${data.steps}\n` +
      `敌人 <b>${data.enemies}</b> / 弹 <b>${data.projs}</b>\n` +
      `掉落 <b>${data.pickups}</b>  可见 <b>${data.visible}</b>\n` +
      `draw <b>${data.drawCalls}</b>`;
    this.el.textContent = html;
  }
}
