/**
 * 统一输入：桌面键盘 + 移动端虚拟摇杆，对外只暴露一个归一化方向向量。
 *
 * 移动端摇杆不固定在屏幕某点，而是在「左半屏任意位置按下」处生成，
 * 这样横屏/竖屏、大屏/小屏都能自然贴合拇指位置。
 */
export class Input {
  /** 归一化移动方向（长度 ≤ 1） */
  dx = 0;
  dy = 0;
  isTouch = false;

  onPause: () => void = () => {};

  private keys = new Set<string>();
  private stickEl: HTMLDivElement | null = null;
  private zoneEl: HTMLDivElement | null = null;
  private stickId = -1;
  private stickOx = 0;
  private stickOy = 0;
  private stickDx = 0;
  private stickDy = 0;
  private readonly maxR = 46;

  attach(root: HTMLElement): void {
    this.isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('is-touch');

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    if (this.isTouch) this.buildStick(root);
  }

  private buildStick(root: HTMLElement): void {
    const zone = document.createElement('div');
    zone.className = 'stick-zone touch-only';
    const stick = document.createElement('div');
    stick.className = 'stick';
    const knob = document.createElement('div');
    knob.className = 'stick-knob';
    stick.appendChild(knob);
    zone.appendChild(stick);
    root.appendChild(zone);
    this.zoneEl = zone;
    this.stickEl = stick;

    zone.addEventListener('pointerdown', this.onStickDown);
    zone.addEventListener('pointermove', this.onStickMove);
    zone.addEventListener('pointerup', this.onStickUp);
    zone.addEventListener('pointercancel', this.onStickUp);
    zone.addEventListener('lostpointercapture', this.onStickUp);
  }

  private onStickDown = (e: PointerEvent): void => {
    if (this.stickId !== -1) return;
    this.stickId = e.pointerId;
    this.zoneEl?.setPointerCapture(e.pointerId);
    this.stickOx = e.clientX;
    this.stickOy = e.clientY;
    this.stickDx = 0;
    this.stickDy = 0;
    if (this.stickEl) {
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.classList.add('is-on');
    }
    e.preventDefault();
  };

  private onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    let vx = e.clientX - this.stickOx;
    let vy = e.clientY - this.stickOy;
    const len = Math.hypot(vx, vy);
    if (len > this.maxR) {
      const k = this.maxR / len;
      vx *= k;
      vy *= k;
    }
    this.stickDx = vx / this.maxR;
    this.stickDy = vy / this.maxR;
    if (this.stickEl) {
      const knob = this.stickEl.firstElementChild as HTMLElement | null;
      if (knob) knob.style.transform = `translate(${vx}px, ${vy}px)`;
    }
    e.preventDefault();
  };

  private onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    this.stickId = -1;
    this.stickDx = 0;
    this.stickDy = 0;
    if (this.stickEl) {
      this.stickEl.classList.remove('is-on');
      const knob = this.stickEl.firstElementChild as HTMLElement | null;
      if (knob) knob.style.transform = 'translate(0px, 0px)';
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      this.onPause();
      return;
    }
    this.keys.add(k);
    // 阻止方向键/空格滚动页面
    if (
      k === ' ' ||
      k === 'arrowup' ||
      k === 'arrowdown' ||
      k === 'arrowleft' ||
      k === 'arrowright'
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.dx = 0;
    this.dy = 0;
  };

  /** 每逻辑步调用一次，刷新方向向量 */
  update(): void {
    let x = this.stickDx;
    let y = this.stickDy;

    if (x === 0 && y === 0) {
      const k = this.keys;
      let kx = 0;
      let ky = 0;
      if (k.has('a') || k.has('arrowleft')) kx -= 1;
      if (k.has('d') || k.has('arrowright')) kx += 1;
      if (k.has('w') || k.has('arrowup')) ky -= 1;
      if (k.has('s') || k.has('arrowdown')) ky += 1;
      x = kx;
      y = ky;
      // 斜向归一化，避免对角线移动更快
      if (kx !== 0 && ky !== 0) {
        const inv = Math.SQRT1_2;
        x *= inv;
        y *= inv;
      }
    }
    this.dx = x;
    this.dy = y;
  }

  reset(): void {
    this.keys.clear();
    this.stickDx = 0;
    this.stickDy = 0;
    this.dx = 0;
    this.dy = 0;
  }
}
