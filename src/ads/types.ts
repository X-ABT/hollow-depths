/**
 * 广告激励层 —— 跨模块核心契约。
 *
 * 设计目标：UI 层只依赖这里的接口与共享单例（src/ads/index.ts），
 * 完全不知道底层是「网页模拟」还是「CrazyGames SDK」，从而在上架/换平台时零业务改动。
 */

/** 广告位：每个「看广告换奖励」的入口一个独立标识（便于真广告时区分代码位/埋点） */
export type AdPlacement = 'levelup_reroll' | 'pet_free_ten' | 'gameover_double_soul';

/**
 * 激励视频播放结果：
 * - rewarded：用户完整看完，可发放奖励（唯一放行态）
 * - canceled：用户中途取消 / 未看完
 * - error：播放失败（断网、无填充、环境不支持等）
 */
export type AdOutcome = 'rewarded' | 'canceled' | 'error';

/** 统一激励视频服务接口 */
export interface AdService {
  /** 提供商标识：'mock'（网页模拟）｜'crazygames'（CrazyGames SDK） */
  readonly provider: string;
  /**
   * 播放一次激励视频。调用方必须：
   * 1) 仅在 resolve('rewarded') 后才发放奖励；
   * 2) 播放期间维持自身的 busy / 互斥，避免连点。
   */
  showRewardedAd(placement: AdPlacement): Promise<AdOutcome>;
}
