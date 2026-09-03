import './style.css';
import { Application } from 'pixi.js';
import { Game } from './core/Game';

function showFatal(message: string): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.innerHTML = `
    <div class="boot-mark">
      <div class="boot-title">无法启动</div>
      <div class="boot-sub" style="letter-spacing:0.1em;margin-top:14px">${message}</div>
    </div>
  `;
}

async function boot(): Promise<void> {
  const mount = document.getElementById('stage');
  const uiRoot = document.getElementById('ui-root');
  if (!mount || !uiRoot) {
    showFatal('页面结构异常，请刷新重试。');
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
    showFatal('当前浏览器不支持 WebGL，建议使用最新版 Chrome / Edge / Safari。');
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
