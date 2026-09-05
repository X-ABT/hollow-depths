import { ensureCrazySdk, isCrazygamesHost, type CrazySdk } from './crazygames';
import { MockAdService } from './MockAdService';
import type { AdOutcome, AdPlacement, AdService } from './types';

/**
 * CrazyGames SDK 激励视频实现。
 *
 * 环境分级（防线上白嫖）：
 * - CrazyGames 平台 iframe（host 命中 + environment === 'crazygames'）→ 真广告（SDK rewarded）；
 * - 本地开发（import.meta.env.DEV）→ 回退 MockAdService 模拟浮层，便于开发/体验；
 * - 生产构建但非 CrazyGames 环境（如 Render 自托管线上）→ 直接返回 error，**不发奖励**。
 *
 * 这样生产线上不存在"等 3 秒模拟浮层白拿奖励"的漏洞——广告位只会在平台真正变现，
 * 本地开发仍可完整验证三条激励链路。
 *
 * CrazyGames rewarded 的取消语义：平台没有独立的 canceled 回调，
 * 只有完整看完（adFinished）才视为 rewarded，其余（adError / 超时）按 error 处理。
 */
export class CrazyGamesAdService implements AdService {
  readonly provider = 'crazygames';
  private readonly fallback = new MockAdService();
  /** 结果最长等待：激励视频通常 ≤ 60s，超出按 error 兜底（防互斥锁卡死） */
  private static readonly AD_TIMEOUT_MS = 60_000;

  private async realSdk(): Promise<CrazySdk | null> {
    if (!isCrazygamesHost()) return null;
    const sdk = await ensureCrazySdk();
    if (!sdk || sdk.environment !== 'crazygames') return null;
    return sdk;
  }

  showRewardedAd(placement: AdPlacement): Promise<AdOutcome> {
    return this.realSdk().then((sdk) => {
      if (sdk) return this.playRewarded(sdk);
      // 非平台环境：仅本地开发允许模拟浮层；生产构建静默失败（不发奖励，UI 走 error 还原）
      if (import.meta.env.DEV) return this.fallback.showRewardedAd(placement);
      return Promise.resolve('error' as AdOutcome);
    });
  }

  /** 用 SDK 播放一次激励视频：回调式 requestAd → 契约 Promise */
  private playRewarded(sdk: CrazySdk): Promise<AdOutcome> {
    return new Promise<AdOutcome>((resolve) => {
      let settled = false;
      const finish = (out: AdOutcome): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(out);
      };

      // 兜底超时：平台异常未回调任何结果时按 error 结算，避免把 UI busy 永久锁死
      const timer = window.setTimeout(() => finish('error'), CrazyGamesAdService.AD_TIMEOUT_MS);

      try {
        const result = sdk.ad.requestAd('rewarded', {
          adStarted: () => {
            /* 广告开始：调用方无需在此处理（游戏已由 UI busy 态保护） */
          },
          adFinished: () => finish('rewarded'),
          adError: () => finish('error'),
        });
        // v3 同时支持 Promise 风格（无回调传入时）；若回调缺失则走 Promise 结果
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(
            () => finish('rewarded'),
            () => finish('error'),
          );
        }
      } catch {
        finish('error');
      }
    });
  }
}
