/**
 * 统一输入：桌面键盘 + 移动端虚拟摇杆，对外只暴露一个归一化方向向量。
 *
 * 移动端摇杆采用「半固定」：平时常显一个半透明底座在屏幕底部中央，
 * 方便玩家定位；手指在下方操作区按下时底座跟随到手指处并高亮，松手后
 * 回到底部中央常显。摇杆元素作为 ui-root 直接子元素，用视口坐标定位，
 * 保证横竖屏、任意分辨率下位置都准确。
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
  /** 底座在底部中央的停留位置（松手后回到这里） */
  private homeX = 0;
  private homeY = 0;
  /** 回弹动画中的当前还原计时（给一次 transition 时间） */
  private returnT = 0;
  /** 摇杆是否当前可用：仅对局中(playing)开放，标题/升级/结算时关闭以免抢走按钮点击 */
  private _enabled = false;

  /**
   * 开关摇杆的可用性：
   *  - enabled=true（对局中）：捕获层拦截触摸作为移动、底座可见可定位。
   *  - enabled=false（标题/升级/结算）：捕获层不拦截触摸、底座隐藏，
   *    把下方内容（按钮/卡片）的点击归还给它们。
   */
  setEnabled(on: boolean): void {
    this._enabled = on;
    if (!on) {
      this.stickId = -1;
      this.stickDx = 0;
      this.stickDy = 0;
    }
    this.zoneEl?.classList.toggle('enabled', on);
    this.stickEl?.classList.toggle('enabled', on);
    if (on) this.homeStick();
  }

  attach(root: HTMLElement): void {
    this.isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
    if (this.isTouch) document.body.classList.add('is-touch');

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    if (this.isTouch) {
      this.buildStick(root);
      window.addEventListener('resize', this.onResize);
    }
  }

  private onResize = (): void => {
    // 视口变化时重算底部中央停留点
    this.updateHome();
    this.homeStick();
  };

  /** 计算底部中央的摇杆停留点（避开底部 HUD / 安全区，保留操作空间） */
  private updateHome(): void {
    const safe = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0;
    const small = Math.min(window.innerWidth, window.innerHeight) < 480;
    this.homeX = window.innerWidth / 2;
    // 底部中央，略微上抬给最底部 HUD/安全区留白；小屏适当下移贴近拇指
    this.homeY = window.innerHeight - (small ? 92 : 112) - safe;
  }

  /** 把底座移回底部中央停留点 */
  private homeStick(): void {
    if (!this.stickEl) return;
    this.stickEl.style.transition = 'left 0.18s ease, top 0.18s ease, opacity 0.15s ease, transform 0.18s cubic-bezier(0.2,0.9,0.3,1.2)';
    this.stickEl.style.left = `${this.homeX}px`;
    this.stickEl.style.top = `${this.homeY}px`;
    this.stickEl.classList.remove('is-on');
    const knob = this.stickEl.firstElementChild as HTMLElement | null;
    if (knob) {
      knob.style.transition = 'transform 0.18s cubic-bezier(0.2,0.9,0.3,1.2)';
      knob.style.transform = 'translate(0px, 0px)';
    }
  }

  private buildStick(root: HTMLElement): void {
    // 事件捕获区：覆盖屏幕下方中央的操作区（不含左右最边缘，避免误触）
    const zone = document.createElement('div');
    zone.className = 'stick-zone touch-only';
    root.appendChild(zone);
    this.zoneEl = zone;

    // 视觉底座：直接挂 ui-root（视口坐标），常显半透明
    const stick = document.createElement('div');
    stick.className = 'stick touch-only';
    const knob = document.createElement('div');
    knob.className = 'stick-knob';
    stick.appendChild(knob);
    root.appendChild(stick);
    this.stickEl = stick;

    this.updateHome();
    this.homeStick();

    zone.addEventListener('pointerdown', this.onStickDown);
    zone.addEventListener('pointermove', this.onStickMove);
    zone.addEventListener('pointerup', this.onStickUp);
    zone.addEventListener('pointercancel', this.onStickUp);
    zone.addEventListener('lostpointercapture', this.onStickUp);
  }

  private onStickDown = (e: PointerEvent): void => {
    if (!this._enabled) return;
    if (this.stickId !== -1) return;
    this.stickId = e.pointerId;
    this.stickOx = e.clientX;
    this.stickOy = e.clientY;
    this.stickDx = 0;
    this.stickDy = 0;
    if (this.stickEl) {
      // 跟手：底座移到按下位置并高亮（平滑过渡关掉避免拖动迟滞）
      this.stickEl.style.transition = '';
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.classList.add('is-on');
      const knob = this.stickEl.firstElementChild as HTMLElement | null;
      if (knob) knob.style.transition = '';
    }
    // 捕获指针以便在 zone 外继续跟随（真实指针才有效，包 try 兜底）
    try {
      this.zoneEl?.setPointerCapture(e.pointerId);
    } catch {
      /* 捕获失败（如非真实指针）不阻断摇杆 */
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
    // 松手：底座回到底部中央常显
    this.homeStick();
    void e;
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
