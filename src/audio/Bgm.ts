/**
 * 程序化 BGM（WebAudio 合成，零素材文件）——「滴滴/铃音」轻快旋律风。
 *
 * 目标听感：像手机铃声、八音盒或木琴那类"叮叮咚咚"的清脆悦耳，不是重低音氛围垫。
 * 做法：
 *   1. 去掉低音 drone 与长音 pad（那是"阴沉厚重"的来源）。
 *   2. 用 bell/木琴音色（三角波 + 高八度正弦泛音，快速指数衰减），短促无延音，
 *      每个音都像被敲一下——清脆的"滴"。
 *   3. 驱动一个明亮大调（C 大调）的音符序列：主旋律 + 低八度伴奏，节奏分明，
 *      循环播放，像一段听不腻的小调。
 *   4. 加一点高八度的闪烁泛音与极轻的低音根音做打底温暖，但都短促、不厚。
 *
 * 对外 API 不变：start()/stop()/setMuted()/playing。
 */

/** 一拍时长（秒）。BPM≈92，一拍 0.65s，更从容，一循环 16 拍约 10.4s */
const STEP = 0.65;
/** 主旋律音阶（C 大调，相对 C4 的半音数），空值=休止符 */
const MELODY: (number | null)[] = [
  0, 0, 4, 7, 4, 7, 9, 7, 4, 7, 4, 2, 0, null, 2, 0,
  0, 4, 7, 9, 7, 9, 12, 9, 7, 9, 7, 4, 2, null, 0, 2,
];
/** 低八度伴奏（每拍一个根音移动），同样 16 步，与旋律同长 */
const BASS_PATTERN: number[] = [
  -12, -12, -12, -12, -5, -5, -5, -5, -7, -7, -7, -7, -9, -9, -9, -9,
  -12, -12, -12, -12, -5, -5, -5, -5, -7, -7, -7, -7, -9, -9, -9, -9,
];
/** C4 基频 */
const C4 = 261.6256;

export class Bgm {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _playing = false;
  private _muted = false;
  /** 当前循环播放到第几步 */
  private step = 0;
  /** 下一个音符排定时间（绝对 ctx time） */
  private nextTime = 0;
  private loopTimer: number | null = null;
  /** 停止时已调度的节点，统一停掉 */
  private scheduled: { osc: OscillatorNode; stopAt: number }[] = [];

  private readonly MASTER_GAIN = 0.9;
  /** 旋律音量 / 伴奏音量 / 泛音音量 / 次低音音量 */
  private readonly MEL_GAIN = 0.5;
  private readonly BAS_GAIN = 0.3;
  private readonly OVR_GAIN = 0.14;
  private readonly SUB_GAIN = 0.14;

  get playing(): boolean {
    return this._playing;
  }

  get muted(): boolean {
    return this._muted;
  }

  /** 是否已持有上下文（首次 start 后才为 true） */
  get hasContext(): boolean {
    return this.ctx !== null;
  }

  /**
   * 恢复音频上下文（iOS 中断 / 自动播放策略导致 suspended/interrupted 时使用）。
   * 必须在用户手势（pointerdown / touchend / keydown）中调用。
   * 调用无副作用，可安全挂在全局手势监听上。
   */
  async resume(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    try {
      await ctx.resume();
    } catch {
      /* 恢复失败静默：下次手势再试 */
    }
  }

  /** 创建并启动。须在用户手势内调用；重复调用无害。 */
  start(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this.MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    if (this._playing) return;
    this._playing = true;
    if (this.master) this.master.gain.value = this._muted ? 0 : this.MASTER_GAIN;

    this.step = 0;
    this.nextTime = ctx.currentTime + 0.06; // 轻微预排，避免卡顿
    this.scheduleAhead();
    this.loopTimer = window.setInterval(() => this.scheduleAhead(), 100);
  }

  /** 停止并断开所有发声 */
  stop(): void {
    if (!this._playing) return;
    this._playing = false;
    if (this.loopTimer !== null) clearInterval(this.loopTimer);
    this.loopTimer = null;
    // 停掉所有已调度的音
    const now = this.ctx ? this.ctx.currentTime : 0;
    for (const s of this.scheduled) {
      try {
        if (s.osc && s.osc.stop && now < s.stopAt) s.osc.stop(s.stopAt);
      } catch {
        /* ignore */
      }
    }
    this.scheduled = [];
    if (this.master && this.ctx) {
      const ctx = this.ctx;
      try {
        this.master.gain.cancelScheduledValues(ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      } catch {
        /* ignore */
      }
    }
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      try {
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.linearRampToValueAtTime(m ? 0 : this.MASTER_GAIN, t + 0.08);
      } catch {
        /* ignore */
      }
    }
  }

  // ——————————————————— 排程 ———————————————————

  /** 每次预排 ~1.6s 的音符，制造持续流畅的旋律 */
  private scheduleAhead(): void {
    if (!this.playing || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const horizon = ctx.currentTime + 1.6;
    while (this.nextTime < horizon) {
      this.scheduleStep(this.step, this.nextTime);
      this.step = (this.step + 1) % MELODY.length;
      this.nextTime += STEP;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const mel = MELODY[step];
    const bas = BASS_PATTERN[step];
    // 主旋律铃音
    if (mel !== null) this.pluck(C4 * Math.pow(2, mel / 12), t, this.MEL_GAIN, true);
    // 低八度伴奏根音（短促、柔和，非重低音）
    this.pluck(C4 * Math.pow(2, bas / 12), t, this.BAS_GAIN, false);
    // 小节强拍（每 4 拍第 1 拍）加一点点次低音，提供低频厚度与层次，不抢戏
    if (step % 4 === 0) this.subBass(C4 * Math.pow(2, bas / 12) * 0.5, t);
  }

  /** 很轻的低频正弦长音，柔和起止，只给"一点点重低音"的厚度感 */
  private subBass(freq: number, t: number): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.SUB_GAIN, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    const stopAt = t + 0.95;
    o.stop(stopAt);
    this.scheduled.push({ osc: o, stopAt });
  }

  /**
   * 敲一个清脆的"滴"——bell/木琴：
   *   - 三角波基频
   *   - 正弦波高八度泛音叠在上面，制造金属/玻璃清亮感
   *   - 极快指数衰减（无延音、无长 drone），音符一响即收
   */
  private pluck(freq: number, t: number, vol: number, bright: boolean): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    // 主音：三角波（比纯正弦更亮更"木琴"）
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // 极短起音，模拟敲击感
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + 0.004);
    // 快衰减收尾（bell 响度≈ e^-t/0.3）
    g.gain.exponentialRampToValueAtTime(0.0001, t + (bright ? 0.5 : 0.35));
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    const stopAt = t + 0.55;
    o.stop(stopAt);
    this.scheduled.push({ osc: o, stopAt });

    // 清亮泛音：高两个八度的正弦，很轻，赋予"叮"的金属感
    if (bright) {
      const ov = ctx.createOscillator();
      ov.type = 'sine';
      ov.frequency.value = freq * 4;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(Math.max(this.OVR_GAIN, 0.0002), t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      ov.connect(og);
      og.connect(this.master);
      ov.start(t);
      ov.stop(t + 0.35);
      this.scheduled.push({ osc: ov, stopAt: t + 0.35 });
    }
  }
}
