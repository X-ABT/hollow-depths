/**
 * 程序化 BGM（WebAudio 合成，零素材文件）。
 *
 * 用多个 Oscillator + Gain 实时合成一层「暗黑地牢求生」氛围音景，
 * 分层叠加：
 *   1. Drone 低音    —— 根音 + 五度低频持续，铺垫空旷地牢的空间感
 *   2. Pad 黑暗和声  —— D 多利亚暗色色块，detuned 三角波 + 低通 + 慢起伏
 *   3. Heartbeat 脉冲—— 规律的低频心跳，制造「孤身求存」的压迫与计时感
 *
 * 全部为持续振荡器 + 少量定时器，不加载任何音频文件；整体音量压低，
 * 不喧宾夺主地盖过玩法。所有入口在用户手势内调用以满足自动播放策略。
 */

const PAD_SEMITONES = [0, 3, 5, 7, 10, 12]; // D F G A C D → Dm(add9)
const HEARTBEAT_MS = 682; // ~88 BPM 双拍心跳

export class Bgm {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private heartbeatTimer: number | null = null;
  private persistent: AudioNode[] = [];
  private _playing = false;
  private _muted = false;

  private readonly BASE_GAIN = 0.45;

  get playing(): boolean {
    return this._playing;
  }

  get muted(): boolean {
    return this._muted;
  }

  /**
   * 创建并启动音景。必须在一次用户手势内调用（如点击「进入幽墟」），
   * 以满足浏览器自动播放策略；重复调用无害。
   */
  start(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return; // 环境不支持 WebAudio：静默跳过
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : this.BASE_GAIN;
      this.master.connect(this.ctx.destination);
    }
    const ctx = this.ctx;
    if (ctx.state === 'suspended') void ctx.resume();
    if (this._playing) return;
    this._playing = true;

    this.persistent.push(this.master!);
    this.addDrone();
    this.addPad();
    this.scheduleHeartbeat();
  }

  /** 停止全部发声（回标题 / 结算时调用） */
  stop(): void {
    if (!this._playing) return;
    this._playing = false;
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    // 先淡出再断开，避免爆音
    if (this.master && this.ctx) {
      const ctx = this.ctx;
      try {
        this.master.gain.cancelScheduledValues(ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      } catch {
        /* ignore */
      }
    }
    // 停掉并断开所有常驻振荡器
    for (const n of this.persistent) {
      try {
        if (n instanceof OscillatorNode) n.stop();
        n.disconnect();
      } catch {
        /* 已断开则忽略 */
      }
    }
    this.persistent = [];
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      try {
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.linearRampToValueAtTime(m ? 0 : this.BASE_GAIN, t + 0.12);
      } catch {
        /* ignore */
      }
    }
  }

  // ——————————————————— 分层合成 ———————————

  /** 层 1：低频 drone（A1 根音 + E2 五度，双 detune 产生不安拍频） */
  private addDrone(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    g.connect(this.master!);

    const spawn = (freq: number, type: OscillatorType, det: number): void => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(g);
      o.start();
      this.persistent.push(o);
    };
    spawn(55, 'sine', 0); // A1
    spawn(82.4, 'sine', 5); // E2 五度
    spawn(55, 'sine', -5); // 轻微 detune → 缓慢拍频的不安
  }

  /** 层 2：黑暗 pad（中音区色块，detuned 三角波 + 低通 + 慢 LFO） */
  private addPad(): void {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 720;
    lp.Q.value = 0.6;
    const pg = ctx.createGain();
    pg.gain.value = 0.05;
    lp.connect(pg);
    pg.connect(this.master!);

    // 缓慢 LFO 让声部起伏（呼吸感）
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.028;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();
    this.persistent.push(lfo);

    // D2 起始（58.3Hz），往上叠加音程构成暗色 chord
    for (const st of PAD_SEMITONES) {
      const freq = 58.3 * Math.pow(2, st / 12);
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(lp);
        o.start();
        this.persistent.push(o);
      }
    }
  }

  /** 层 3：心跳（低频短促双拍 blip，营造计时压迫感） */
  private scheduleHeartbeat(): void {
    const ctx = this.ctx!;
    const pulse = (gainPeak: number, f0: number, f1: number, dur: number): void => {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gainPeak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master!);
      o.start(t);
      o.stop(t + dur + 0.02);
    };

    const beat = (): void => {
      if (!this._playing || !this.master) return;
      pulse(0.16, 72, 42, 0.13); // 第一拍
      window.setTimeout(() => {
        if (!this._playing) return;
        pulse(0.11, 70, 45, 0.1); // 第二拍（较弱的回拍）
      }, HEARTBEAT_MS * 0.52);
    };
    this.heartbeatTimer = window.setInterval(beat, HEARTBEAT_MS);
  }
}
