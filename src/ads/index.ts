import { MockAdService } from './MockAdService';
import { CrazyGamesAdService } from './CrazyGamesAdService';
import type { AdOutcome, AdPlacement, AdService } from './types';

export type { AdOutcome, AdPlacement, AdService };

/**
 * 选择底层实现（自动探测，无需手动开关）：
 * - CrazyGames 平台 iframe：CrazyGamesAdService 内部判定环境 → 真广告；非平台环境自动回退其内置 Mock
 * - 纯网页 / 开发环境：MockAdService（本地模拟浮层）
 */
function pickProvider(): AdService {
  if (typeof window === 'undefined') return new MockAdService();
  return new CrazyGamesAdService();
}

/** 互斥包装：同一时刻只允许一个激励视频在播，防并发双播/重复发放 */
class SingleFlightAdService implements AdService {
  readonly provider: string;
  private readonly inner: AdService;
  private playing = false;

  constructor(inner: AdService) {
    this.inner = inner;
    this.provider = inner.provider;
  }

  async showRewardedAd(placement: AdPlacement): Promise<AdOutcome> {
    if (this.playing) return 'canceled'; // 已有广告在播：拒绝并发
    this.playing = true;
    try {
      return await this.inner.showRewardedAd(placement);
    } catch {
      return 'error';
    } finally {
      this.playing = false;
    }
  }
}

/** 全局共享激励视频单例：UI 层统一从这里取，不感知具体实现 */
export const ads: AdService = new SingleFlightAdService(pickProvider());
