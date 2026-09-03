import { Application } from 'pixi.js';
import { Loop } from './Loop';
import { Input } from './Input';
import { Build } from './Build';
import { World } from '../ecs/World';
import type { Enemy } from '../ecs/Components';
import { SpawnSystem } from '../ecs/systems/SpawnSystem';
import { EnemyAISystem, findBoss } from '../ecs/systems/EnemyAISystem';
import { WeaponSystem } from '../ecs/systems/WeaponSystem';
import { ProjectileSystem } from '../ecs/systems/ProjectileSystem';
import { CollisionSystem } from '../ecs/systems/CollisionSystem';
import { PickupSystem } from '../ecs/systems/PickupSystem';
import { CleanupSystem } from '../ecs/systems/CleanupSystem';
import { Camera } from '../render/Camera';
import { WorldRenderer } from '../render/Renderer';
import { Vfx } from '../render/Vfx';
import { atlas } from '../render/Textures';
import { Hud } from '../ui/Hud';
import { TitleScreen } from '../ui/TitleScreen';
import { LevelUpModal } from '../ui/LevelUpModal';
import { GameOverScreen, type RunResult } from '../ui/GameOverScreen';
import { PerfHud } from '../ui/PerfHud';
import { Storage, type SaveData } from '../save/Storage';
import { Bgm } from '../audio/Bgm';
import { DEFAULT_CHARACTER } from '../data/characters';
import { ENEMY_BY_INDEX } from '../data/enemies';
import { RUN_SECONDS } from '../data/waves';

export type GameState = 'title' | 'playing' | 'levelup' | 'gameover';

/**
 * 游戏总装：状态机 + 系统编排。
 *
 * 系统执行顺序是固定的（见 fixed()），其中 buildHash 会执行两次：
 * 第一次供 AI 的分离力使用（可以容忍上一帧的位置），
 * 第二次在所有位移完成后重建，保证碰撞判定用的是本帧最终位置。
 */
export class Game {
  private readonly app: Application;
  private readonly loop = new Loop();
  private readonly input = new Input();
  private readonly world = new World();
  private readonly camera = new Camera();
  private readonly renderer = new WorldRenderer();
  private readonly vfx = new Vfx();

  private readonly spawn = new SpawnSystem();
  private readonly ai = new EnemyAISystem();
  private readonly weapon = new WeaponSystem();
  private readonly projectiles = new ProjectileSystem();
  private readonly collision = new CollisionSystem();
  private readonly pickup = new PickupSystem();
  private readonly cleanup = new CleanupSystem();

  private readonly hud: Hud;
  private readonly title = new TitleScreen();
  private readonly levelUp = new LevelUpModal();
  private readonly gameOver = new GameOverScreen();
  private readonly perf: PerfHud;

  private readonly bgm = new Bgm();
  private musicBtn: HTMLButtonElement | null = null;
  private build = new Build(DEFAULT_CHARACTER);
  private state: GameState = 'title';
  private save: SaveData = Storage.load();
  private manualPause = false;
  private pauseTip: HTMLElement | null = null;
  private bossTimer = 0;

  private readonly uiRoot: HTMLElement;

  constructor(app: Application, uiRoot: HTMLElement) {
    this.app = app;
    this.uiRoot = uiRoot;
    this.hud = new Hud(uiRoot);
    this.hud.onZoomIn = () => this.renderer.setZoom(this.renderer.zoom + 0.15);
    this.hud.onZoomOut = () => this.renderer.setZoom(this.renderer.zoom - 0.15);
    this.hud.onZoomReset = () => this.renderer.setZoom(1);
    this.hud.setZoomLabel(this.renderer.zoom);
    this.perf = new PerfHud(uiRoot);

    atlas.build(app.renderer);
    this.renderer.init(app.renderer);
    this.renderer.resize(app.screen.width, app.screen.height);
    app.stage.addChild(this.renderer.root);
    app.stage.addChild(this.vfx.container);
    this.collision.attachVfx(this.vfx);
    this.cleanup.attachVfx(this.vfx);
    this.ai.attachVfx(this.vfx);

    this.input.attach(uiRoot);
    this.input.onPause = () => this.togglePause();
    this.pickup.onChest = (times) => {
      this.world.player.pendingLevels += times;
    };
    this.spawn.onBoss(() => {
      this.camera.addShake(14);
      this.bossTimer = 3.2;
    });
    this.cleanup.onBossKilled = () => {
      this.camera.addShake(22);
    };
    this.world.onPlayerHurt = (amount) => {
      if (amount >= 0) this.camera.addShake(4 + Math.min(10, amount * 0.3));
    };

    this.loop.onFixed = (dt) => this.fixed(dt);
    this.loop.onRender = (alpha, frameDt) => this.render(alpha, frameDt);

    app.renderer.on('resize', (w: number, h: number) => {
      this.renderer.resize(w, h);
    });

    this.buildPauseButton();
    this.hud.setVisible(false);

    // 隐藏只读调试钩子：仅用于开发验证，不影响玩法
    const w = window as unknown as {
      __HD?: () => object;
    };
    w.__HD = () => {
      const pk = this.world.pickups.items[0];
      const p = this.world.player;
      return {
        state: this.state,
        time: Math.round(this.world.time),
        kills: this.world.kills,
        xp: this.world.player.xp,
        xpNext: this.world.player.xpNext,
        level: this.world.player.level,
        pending: this.world.player.pendingLevels,
        enemies: this.world.enemies.count,
        projs: this.world.projs.count,
        pickups: this.world.pickups.count,
        hp: Math.round(this.world.player.hp),
        range: Math.round(this.world.player.pickupRange),
        // 若场上第一颗拾取物存在，返回其与玩家的距离（诊断用）
        pDist: pk
          ? Math.round(Math.hypot(pk.x - p.x, pk.y - p.y))
          : -1,
        pMag: pk ? pk.magnet : false,
      };
    };
  }

  private buildPauseButton(): void {
    const btn = document.createElement('button');
    btn.className = 'btn btn--ghost btn-pause touch-only';
    btn.textContent = '‖';
    btn.setAttribute('aria-label', '暂停');
    btn.addEventListener('click', () => this.togglePause());
    this.uiRoot.appendChild(btn);

    const tip = document.createElement('div');
    tip.className = 'hud-pause-tip';
    tip.textContent = 'Esc 暂停';
    this.uiRoot.appendChild(tip);
    this.pauseTip = tip;

    // —— 背景音乐开关（常驻右上角，标题页与对局中都可切换）——
    const music = document.createElement('button');
    music.className = 'music-toggle';
    music.setAttribute('aria-label', '音乐开关');
    music.textContent = '♪';
    music.addEventListener('click', () => {
      this.bgm.setMuted(!this.bgm.muted);
      this.refreshMusicBtn();
    });
    this.uiRoot.appendChild(music);
    this.musicBtn = music;
    this.refreshMusicBtn();
  }

  /** 更新音乐按钮的外观（静音态置灰 + 划横线） */
  private refreshMusicBtn(): void {
    if (!this.musicBtn) return;
    this.musicBtn.classList.toggle('is-off', this.bgm.muted);
    this.musicBtn.textContent = this.bgm.muted ? '♪̶' : '♪';
  }

  // ——————————————————— 生命周期 ———————————————————

  start(): void {
    this.loop.start();
    this.showTitle();
  }

  private showTitle(): void {
    this.state = 'title';
    // 清理可能残留的结算页 / 升级弹窗 DOM，避免它们叠在标题页之下
    this.gameOver.hide();
    this.levelUp.hide();
    this.hud.setVisible(false);
    this.perf.setVisible(this.save.perfVisible);
    // 标题页/结算页不播战斗 BGM
    this.bgm.stop();
    this.title.show(this.uiRoot, this.save, {
      onStart: () => this.startRun(),
      onTogglePerf: () => {
        this.save.perfVisible = !this.save.perfVisible;
        this.perf.setVisible(this.save.perfVisible);
        Storage.save(this.save);
      },
      onTogglePause: () => this.togglePause(),
    });
  }

  startRun(): void {
    this.title.hide();
    this.gameOver.hide();
    this.levelUp.hide();

    // 进入战斗即开始 BGM（此处在用户点击手势内，满足自动播放）
    this.bgm.start();

    this.world.reset((Math.random() * 0xffffffff) >>> 0);
    this.build = new Build(DEFAULT_CHARACTER);
    this.build.addWeapon(DEFAULT_CHARACTER.startWeapon);
    this.weapon.reset();
    this.spawn.reset();
    this.pickup.reset();
    this.vfx.reset();
    this.hud.reset();
    this.hud.setVisible(true);
    this.perf.setVisible(this.save.perfVisible);
    // 每局重置视野缩放到默认 1×
    this.renderer.setZoom(1);
    this.hud.setZoomLabel(1);

    const p = this.world.player;
    p.maxHp = this.build.stats.maxHp;
    p.hp = p.maxHp;
    p.xpNext = 10;
    // 出生短暂无敌，避免第一帧就被围殴
    p.iframe = 1.6;

    this.camera.reset(p.x, p.y);
    this.input.reset();
    this.manualPause = false;
    this.state = 'playing';
    this.loop.setPaused(false);
  }

  private togglePause(): void {
    if (this.state !== 'playing') return;
    this.manualPause = !this.manualPause;
    this.loop.setPaused(this.manualPause);
    if (this.pauseTip) this.pauseTip.textContent = this.manualPause ? '已暂停 · Esc 继续' : 'Esc 暂停';
  }

  private showLevelUp(): void {
    if (this.state !== 'playing') return;
    this.state = 'levelup';
    this.loop.setPaused(true);
    const p = this.world.player;
    const options = this.build.rollOptions(this.world.rng, 3);
    this.levelUp.show(this.uiRoot, options, this.build, p.level, (opt) => {
      this.build.applyOption(opt);
      // 属性变化后同步到玩家实体
      const stats = this.build.stats;
      const pl = this.world.player;
      const prevMax = pl.maxHp;
      pl.maxHp = stats.maxHp;
      pl.hp += Math.max(0, stats.maxHp - prevMax);
      if (opt.id === '__heal') pl.hp = Math.min(pl.maxHp, pl.hp + 30);
      this.hud.syncBuild(this.build);
      this.levelUp.hide();
      p.pendingLevels--;
      this.state = 'playing';
      if (p.pendingLevels > 0) {
        // 连续升级：下一帧继续弹
        this.showLevelUp();
      } else {
        this.loop.setPaused(false);
      }
    });
  }

  private endRun(win: boolean): void {
    if (this.state === 'gameover') return;
    this.state = 'gameover';
    this.loop.setPaused(true);
    // 对局结束停止战斗 BGM
    this.bgm.stop();
    this.levelUp.hide();
    this.hud.setVisible(false);

    const p = this.world.player;
    const dmg = this.world.dmgByWeapon;
    let topSlot = -1;
    let topVal = 0;
    for (let i = 0; i < this.build.weapons.length; i++) {
      if (dmg[i] > topVal) {
        topVal = dmg[i];
        topSlot = i;
      }
    }
    const topWeaponName =
      topSlot >= 0 ? `${this.build.weapons[topSlot].def.name}（${Math.round(topVal)}）` : '—';

    const newBest = this.world.time > this.save.bestTime;
    const result: RunResult = {
      win,
      time: this.world.time,
      kills: this.world.kills,
      level: p.level,
      build: this.build,
      damageByWeapon: dmg,
      topWeaponName,
      newBest,
    };

    this.save.bestTime = Math.max(this.save.bestTime, this.world.time);
    this.save.bestKills = Math.max(this.save.bestKills, this.world.kills);
    this.save.bestLevel = Math.max(this.save.bestLevel, p.level);
    this.save.runs++;
    if (win) this.save.wins++;
    Storage.save(this.save);

    this.gameOver.show(
      this.uiRoot,
      result,
      () => this.startRun(),
      () => this.showTitle(),
      () => this.copyResult(result),
    );
  }

  private copyResult(r: RunResult): void {
    const text =
      `【Hollow Depths 幽墟幸存者】\n` +
      `${r.win ? '逃出幽墟' : '葬身幽墟'}　存活 ${Math.floor(r.time)}s　击杀 ${r.kills}　等级 ${r.level}\n` +
      `构筑：${r.build.weapons.map((w) => `${w.def.name} Lv${w.level}`).join('、')}\n` +
      `装备：${r.build.passives.map((p) => `${p.def.name} Lv${p.level}`).join('、')}`;
    navigator.clipboard?.writeText(text).catch(() => {
      /* 剪贴板不可用时忽略 */
    });
  }

  // ——————————————————— 每逻辑步 ———————————————————

  private fixed(dt: number): void {
    if (this.state !== 'playing') return;

    const world = this.world;
    const p = world.player;
    world.time += dt;

    // ——— 玩家 ———
    this.input.update();
    p.px = p.x;
    p.py = p.y;
    const stats = this.build.stats;
    p.speed = stats.speed;
    p.armor = stats.armor;
    p.regen = stats.regen;
    p.damageMul = stats.damageMul;
    p.critChance = stats.critChance;
    p.critMult = stats.critMult;
    p.xpMul = stats.xpMul;
    p.pickupRange = stats.pickupRange;

    let mx = this.input.dx;
    let my = this.input.dy;
    p.x += mx * p.speed * dt;
    p.y += my * p.speed * dt;
    if (mx !== 0) p.face = mx > 0 ? 1 : -1;

    // 终焉收缩边界：把玩家钳制在竞技圈内
    if (world.arenaR > 0) {
      const dx = p.x - world.arenaX;
      const dy = p.y - world.arenaY;
      const d = Math.hypot(dx, dy);
      const limit = world.arenaR - p.radius;
      if (d > limit && d > 0) {
        p.x = world.arenaX + (dx / d) * limit;
        p.y = world.arenaY + (dy / d) * limit;
      }
    }

    if (p.iframe > 0) p.iframe -= dt;
    if (p.regen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    // ——— 系统：生成 → 第一次建立空间哈希 → AI ———
    this.spawn.update(world, dt, this.app.screen.width, this.app.screen.height);
    world.buildHash();
    this.ai.update(world, dt);

    // ——— 位移结束后重建哈希，供命中判定使用 ———
    world.buildHash();

    this.weapon.update(world, this.build, dt);
    this.projectiles.update(world, dt);
    this.collision.update(world, dt);
    this.pickup.update(world, dt);
    this.cleanup.update(world);
    this.vfx.update(dt);

    this.camera.update(p.x, p.y, dt);
    if (this.bossTimer > 0) this.bossTimer -= dt;

    // ——— 结束条件 ———
    if (p.hp <= 0) {
      p.hp = 0;
      this.camera.addShake(26);
      this.endRun(false);
      return;
    }
    if (world.time >= RUN_SECONDS) {
      this.endRun(true);
      return;
    }

    // ——— 升级弹窗（在逻辑步末尾触发，避免在遍历中切状态） ———
    if (p.pendingLevels > 0) this.showLevelUp();
  }

  // ——————————————————— 每渲染帧 ———————————————————

  private render(alpha: number, frameDt: number): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.renderer.sync(this.world, alpha, this.camera, w, h);
    this.vfx.render(alpha);

    if (this.state === 'playing' || this.state === 'levelup') {
      const p = this.world.player;
      this.hud.update(p.hp, p.maxHp, p.xp, p.xpNext, p.level, this.world.time, this.world.kills);
      this.hud.syncBuild(this.build);
      this.hud.setZoomLabel(this.renderer.zoom);

      const boss: Enemy | null = findBoss(this.world);
      if (boss) {
        this.hud.setBoss(ENEMY_BY_INDEX[boss.defIdx].name, boss.hp / boss.maxHp);
      } else {
        this.hud.setBoss(null, 0);
      }
    }

    if (this.perf.visible) {
      this.perf.update(frameDt, {
        fps: this.loop.fps,
        enemies: this.world.enemies.count,
        projs: this.world.projs.count,
        pickups: this.world.pickups.count,
        visible: this.renderer.visibleCount,
        drawCalls: this.drawCalls(),
        steps: this.loop.stepsLastFrame,
      });
    }
  }

  /**
   * draw call 数：PixiJS v8 未暴露稳定的公开统计接口，
   * 这里从批处理管线读取当前批次数，取不到时降级为 0（不影响任何游戏逻辑）。
   */
  private drawCalls(): number {
    try {
      const r = this.app.renderer as unknown as {
        renderPipes?: { batch?: { batches?: unknown[] } };
      };
      return r.renderPipes?.batch?.batches?.length ?? 0;
    } catch {
      return 0;
    }
  }

}
