import { damp } from '../core/MathUtil';

/**
 * 相机：平滑跟随 + 震屏。
 * 震屏用衰减的随机偏移实现，逻辑步更新（与固定步长一致），保证不同帧率下抖动幅度相同。
 */
export class Camera {
  x = 0;
  y = 0;
  /** 震动强度（像素） */
  shake = 0;
  offX = 0;
  offY = 0;

  private shakeT = 0;

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.shake = 0;
    this.offX = 0;
    this.offY = 0;
    this.shakeT = 0;
  }

  addShake(v: number): void {
    this.shake = Math.min(28, this.shake + v);
  }

  update(tx: number, ty: number, dt: number): void {
    // 轻微平滑：既跟手又不会在急速变向时晃眼
    this.x = damp(this.x, tx, 14, dt);
    this.y = damp(this.y, ty, 14, dt);

    if (this.shake > 0.05) {
      this.shakeT += dt * 46;
      this.offX = Math.sin(this.shakeT * 1.7) * this.shake;
      this.offY = Math.cos(this.shakeT * 2.3) * this.shake;
      this.shake *= Math.exp(-7 * dt);
    } else {
      this.shake = 0;
      this.offX = 0;
      this.offY = 0;
    }
  }

  /** 实际渲染用的相机位置（含震动） */
  get viewX(): number {
    return this.x + this.offX;
  }

  get viewY(): number {
    return this.y + this.offY;
  }
}
