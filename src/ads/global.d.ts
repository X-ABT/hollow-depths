/**
 * 全局类型扩展：CrazyGames SDK v3。
 * 官方脚本：https://sdk.crazygames.com/crazygames-sdk-v3.js（见 src/ads/crazygames.ts 动态注入）
 * 结构以 docs.crazygames.com/sdk 为准，此处声明本游戏用到的子集。
 */
declare global {
  interface Window {
    /** CrazyGames SDK v3 命名空间（脚本加载后注入） */
    CrazyGames?: {
      SDK?: {
        /** 手动初始化（必须 await 完成才可使用其它模块） */
        init(): Promise<void>;
        /**
         * 环境判定：
         * - 'local'      本地调试（localhost / 127.0.0.1）
         * - 'crazygames' 正式嵌入 CrazyGames（可展示真实广告）
         * - 'disabled'   其它站点（SDK 方法会抛错，须回退模拟层）
         */
        environment: 'local' | 'crazygames' | 'disabled';
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
          /** 玩家正式开始/恢复游玩时调用 */
          gameplayStart(): void;
          /** 游戏暂停/结束/切后台时调用 */
          gameplayStop(): void;
          /** 高光时刻（击败 Boss / 通关 / 高分） */
          happyTime(): void;
          /** 可选：加载开始/结束事件 */
          loadingStart?(): void;
          loadingStop?(): void;
        };
      };
    };
  }
}

export {};
