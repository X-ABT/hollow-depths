import { t } from '../i18n';
import type { AdOutcome, AdPlacement, AdService } from './types';

/** 模拟倒计时时长（秒）：与真实激励视频「看完才能领」的心理模型对齐 */
const COUNTDOWN_SECONDS = 3;

/**
 * 网页 / 开发环境的模拟激励视频：
 * 弹一个置顶模拟浮层，展示 3 秒倒计时后可「立即领取」，期间可「取消」。
 * 只有点「立即领取」才 resolve('rewarded')，取消 resolve('canceled')。
 * 文案随当前语言（i18n dict）。
 */
export class MockAdService implements AdService {
  readonly provider = 'mock';

  showRewardedAd(placement: AdPlacement): Promise<AdOutcome> {
    return new Promise<AdOutcome>((resolve) => {
      const title = t(`ad.place.${placement}`);
      const overlay = document.createElement('div');
      overlay.className = 'ads-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="ads-panel">
          <div class="ads-badge"><span class="ads-dot"></span>${t('ad.mockBadge')}</div>
          <div class="ads-title">${title}</div>
          <div class="ads-desc">${t('ad.mockWatchFull')}</div>
          <div class="ads-count"><b class="ads-count-num">${COUNTDOWN_SECONDS}</b><span class="ads-count-tip">${t('ad.mockSeconds', { n: COUNTDOWN_SECONDS })}</span></div>
          <div class="ads-actions">
            <button class="btn btn--ghost ads-cancel" type="button">${t('ad.mockCancel')}</button>
            <button class="btn btn--primary ads-claim" type="button" disabled>${t('ad.mockClaim')}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const num = overlay.querySelector<HTMLElement>('.ads-count-num');
      const tip = overlay.querySelector<HTMLElement>('.ads-count-tip');
      const claim = overlay.querySelector<HTMLButtonElement>('.ads-claim');
      const cancel = overlay.querySelector<HTMLButtonElement>('.ads-cancel');

      let settled = false;
      let left = COUNTDOWN_SECONDS;
      // 每 1 秒倒数一次；归零后放行「立即领取」
      const timer = window.setInterval(() => {
        left -= 1;
        if (left <= 0) {
          window.clearInterval(timer);
          if (num) num.textContent = t('ad.mockGo');
          if (tip) tip.textContent = t('ad.mockReady');
          if (claim) {
            claim.disabled = false;
            claim.classList.add('is-ready');
          }
        } else if (num) {
          num.textContent = String(left);
        }
      }, 1000);

      // 只结算一次：清定时器、移除浮层、resolve
      const finish = (out: AdOutcome): void => {
        if (settled) return;
        settled = true;
        window.clearInterval(timer);
        overlay.remove();
        resolve(out);
      };

      cancel?.addEventListener('click', () => finish('canceled'));
      claim?.addEventListener('click', () => finish('rewarded'));
    });
  }
}
