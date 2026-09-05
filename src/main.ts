import './style.css';
import { Application } from 'pixi.js';
import { Game } from './core/Game';
import { currentLang, t } from './i18n';
import { ensureCrazySdk, isCrazygamesHost } from './ads/crazygames';

/** 首屏 boot 文案在模块加载即按已选语言渲染（在 app.init 完成前用户可能看到） */
function localizeBoot(): void {
  document.documentElement.lang = currentLang();
  const sub = document.querySelector('.boot-sub');
  if (sub) sub.textContent = t('boot.sub');
  const hint = document.querySelector('.boot-hint');
  if (hint) hint.textContent = t('boot.hint');
}

localizeBoot();

/** 预热 CrazyGames SDK：仅在平台 iframe 上加载（加载失败静默，广告层会回退 Mock） */
function warmupCrazySdk(): void {
  if (!isCrazygamesHost()) return;
  void ensureCrazySdk().catch(() => {
    /* 忽略：广告层已做降级 */
  });
}

warmupCrazySdk();

function showFatal(message: string): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.innerHTML = `
    <div class="boot-mark">
      <div class="boot-title">${t('fatal.title')}</div>
      <div class="boot-sub" style="letter-spacing:0.1em;margin-top:14px">${message}</div>
    </div>
  `;
}

async function boot(): Promise<void> {
  const mount = document.getElementById('stage');
  const uiRoot = document.getElementById('ui-root');
  if (!mount || !uiRoot) {
    showFatal(t('fatal.page'));
    return;
  }

  const app = new Application();
  try {
    await app.init({
      background: 0x0a0713,
      resizeTo: window,
      antialias: true,
      // 优先 WebGL；PixiJS v8 会在不支持时自动回退
      preference: 'webgl',
      // 高 DPI 屏幕上限制到 2×，避免移动端填充率过高掉帧
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      powerPreference: 'high-performance',
    });
  } catch {
    showFatal(t('fatal.webgl'));
    return;
  }

  mount.appendChild(app.canvas);

  const game = new Game(app, uiRoot);
  game.start();

  const bootEl = document.getElementById('boot');
  if (bootEl) {
    bootEl.classList.add('is-hidden');
    setTimeout(() => bootEl.remove(), 520);
  }
}

void boot();
