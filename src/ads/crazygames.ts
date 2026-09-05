/** CrazyGames SDK v3 官方脚本地址 */
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/** 加载 + 初始化超时（秒）：超时按不可用回退 Mock，避免卡死广告入口 */
const INIT_TIMEOUT_MS = 5000;

/** 我们实际用到的 SDK 形状（与 global.d.ts 中的 Window.CrazyGames.SDK 对应） */
export interface CrazySdk {
  /** 手动初始化（必须完成才可使用其它模块） */
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: {
    requestAd(
      type: 'rewarded' | 'midgame',
      callbacks?: {
        adStarted?: () => void;
        adFinished?: () => void;
        adError?: (error?: { code?: string; message?: string }) => void;
      },
    ): void | Promise<unknown>;
  };
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    happyTime(): void;
    loadingStart?(): void;
    loadingStop?(): void;
  };
}

let sdkPromise: Promise<CrazySdk | null> | null = null;

function sdkFromWindow(): CrazySdk | null {
  return window.CrazyGames?.SDK ?? null;
}

/** 动态注入官方 SDK 脚本并等待加载完成（只注入一次） */
function loadScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('CrazyGames SDK script load failed'));
    document.head.appendChild(s);
  });
}

/**
 * 获取已就绪的 SDK 单例：
 * - 已加载则复用；脚本加载失败 / init 失败 / 超时一律 resolve(null)（调用方回退 Mock）。
 * 结果缓存，不会重复加载。
 */
export function ensureCrazySdk(): Promise<CrazySdk | null> {
  if (!sdkPromise) {
    sdkPromise = (async (): Promise<CrazySdk | null> => {
      try {
        let sdk = sdkFromWindow();
        if (!sdk) {
          await loadScript();
          sdk = sdkFromWindow();
        }
        if (!sdk) return null;
        // init 可能因环境(disabled)/网络长期挂起，用竞速超时保护
        await Promise.race([
          sdk.init(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('SDK init timeout')), INIT_TIMEOUT_MS),
          ),
        ]);
        return sdk;
      } catch {
        return null;
      }
    })();
  }
  return sdkPromise;
}

/** 是否运行在 CrazyGames 平台域名（用于决定是否值得去 init SDK / 打点） */
export function isCrazygamesHost(): boolean {
  const h = typeof location !== 'undefined' ? location.hostname : '';
  return h === 'crazygames.com' || h.endsWith('.crazygames.com');
}

/** 平台环境才返回 true：需要已 init 且 environment === 'crazygames' */
export async function isCrazygamesEnv(): Promise<boolean> {
  const sdk = await ensureCrazySdk();
  return sdk?.environment === 'crazygames';
}

// ——————————————————— 生命周期打点（安全调用，SDK 缺失时静默跳过）———————————————————

/** 统一入口：拿到 SDK 后立即执行，任何异常吞掉，绝不抛给游戏主流程 */
async function withSdk(fn: (sdk: CrazySdk) => void): Promise<void> {
  if (!isCrazygamesHost()) return;
  try {
    const sdk = await ensureCrazySdk();
    if (!sdk || sdk.environment !== 'crazygames') return;
    fn(sdk);
  } catch {
    /* 打点失败不影响玩法 */
  }
}

/** 游戏正式开始 / 从暂停恢复 */
export function gameplayStart(): void {
  void withSdk((sdk) => sdk.game.gameplayStart());
}

/** 游戏暂停 / 结束 / 退出到标题 */
export function gameplayStop(): void {
  void withSdk((sdk) => sdk.game.gameplayStop());
}

/** 高光时刻：击败 Boss / 通关 / 高分 */
export function happyTime(): void {
  void withSdk((sdk) => sdk.game.happyTime());
}
