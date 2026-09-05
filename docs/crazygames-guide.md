# CrazyGames 上架与 SDK 接入指南

> Hollow Depths 的国际版已适配 CrazyGames 平台：内置中英双语切换、接入官方 SDK v3（激励视频 + 平台事件打点）。本文记录平台要求、接入点与上线步骤，便于后续维护或二次上架。

---

## 一、平台要求（对照自查）

| 要求 | 本项目状态 |
| --- | --- |
| 支持英文 | ✅ 全站中英双语（默认跟随浏览器，标题页可手动切换） |
| 浏览器兼容（Chrome/Edge/Chromebook 4GB） | ✅ WebGL + DOM，低端机有自适应降档 |
| 包体限制（总量 ≤250MB、初始可玩 ≤50MB） | ✅ dist 约 650KB 未压缩 |
| 引用使用相对路径 | ✅ `vite.config.ts` 生产 `base: './'` |
| 移动端长按/双击系统菜单 | ✅ `style.css` 含 `user-select:none` |
| iOS 音频中断恢复 | ✅ `Bgm.resume()` + 全局手势监听（见下） |
| SDK Full Integration（gameplay 事件） | ✅ 已接入，见「SDK 事件」 |
| 不收集个人数据 / 无隐私弹窗 | ✅ 仅 localStorage 存档，无任何网络上报 |
| 游戏开头无广告打断 | ✅ 广告仅出现在玩家主动点击的 3 个激励点 |

---

## 二、SDK 接入架构

SDK 脚本**动态注入、按需加载**，不阻塞首屏：

```
src/ads/
├── types.ts              广告契约（AdPlacement / AdOutcome / AdService）
├── index.ts              全局单例（SingleFlight 互斥，杜绝双播）
├── crazygames.ts         [核心] SDK v3 动态加载 + init + environment 判定 + 平台事件封装
├── CrazyGamesAdService.ts  激励视频实现：平台环境走真广告，否则回退 Mock
└── MockAdService.ts        网页模拟浮层（本地开发 / 非平台域名）
```

### 加载与初始化（`crazygames.ts`）

```ts
const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
await ensureCrazySdk(); // 动态插入 script → 等加载 → 等 SDK.init()（5s 超时）
```

- `main.ts` 启动时调用 `warmupCrazySdk()` **预热**（仅在 `.crazygames.com` 域名下注入脚本）；
- 其余任何模块调用都走 `ensureCrazySdk()` 单例缓存，不重复加载。

### 环境判定

SDK init 后 `environment` 取值：

- `'crazygames'` → 真广告（只有它才会发起 `requestAd('rewarded')`）
- `'local'` / `'disabled'` / 加载失败 → `CrazyGamesAdService` 回退 `MockAdService`（模拟浮层）

> 因此在本地 `npm run dev` 中广告位会弹「模拟浮层」，不产生真实广告请求，可完整调试三选一重摇 / 宠物十连 / 结算双倍三条链路。

---

## 三、SDK 事件（`src/ads/crazygames.ts` → `Game.ts` 状态机打点）

| 事件 | 触发时机 |
| --- | --- |
| `gameplayStart()` | `startRun`（开局）、`resumeFromPause`（继续）、远征开战 |
| `gameplayStop()` | `endRun`（死亡/超时结算）、`showTitle`（回标题）、`quitToTitle`、弹暂停弹窗、远征回营地 |
| `happyTime()` | 任意 Boss 被击杀（含无尽模式；回调在 `cleanup.onBossKilled`） |
| iOS 音频恢复 | `bindAudioResume()`：全局 `pointerdown / keydown / touchend` 里调用 `bgm.resume()` |

> 打点全部「安全调用」：非平台域名 / SDK 未就绪时静默跳过，绝不抛错影响主流程。用 `cgPlaying` 标志去重，暂停→恢复不会重复 start/stop。

---

## 四、激励视频（Rewarded）点位

| 广告位 `AdPlacement` | 入口 | 奖励 |
| --- | --- | --- |
| `levelup_reroll` | 升级三选一弹窗「看广告重摇」 | 重新随机三张升级卡（取消/失败保留原卡） |
| `pet_free_ten` | 宠物饲养园「免费十连」 | 免费十连抽（不扣灵魂） |
| `gameover_double_soul` | 结算页「看广告 · 灵魂翻倍」 | 本局已入账灵魂 ×2（每局限领一次，防重复） |

调用方（UI/Game）只依赖 `AdService` 契约：

```ts
import { ads } from '../ads/index';
const out = await ads.showRewardedAd('levelup_reroll');
if (out === 'rewarded') { /* 发奖励 */ }
```

- **只有 `'rewarded'` 才发奖**；`'canceled'` / `'error'` 一律不发。
- 全局 `SingleFlightAdService` 保证同一时刻只允许一个广告在播（并发请求直接判 canceled）。
- CrazyGames 的 rewarded 没有独立「取消」回调：仅 `adFinished` → rewarded，`adError` / 60s 超时 → error。

### 广告时长/冷却提示

- CrazyGames 对广告请求有平台侧频控（如 midgame 一般 3 分钟间隔，rewarded 会一并计入）。
- 当前游戏仅用 rewarded（玩家主动点击），若未来加 midgame 插屏，请勿在开局 / 结算后立刻请求，且需在 `gameplayStop` 期间展示。

---

## 五、语言切换（i18n）

- 语言 key：`localStorage['hollow-depths.lang.v1']`（**独立于存档**，清除存档不清语言）。
- 默认：浏览器 `zh*` → 中文，否则英文。
- 标题页右下有 `中文 / English` 切换按钮，切完整页 reload 一致应用（项目加载快，零订阅成本）。
- 文案字典在 `src/i18n/dict.ts`（`t('key', vars)` 查表），数据层名/描述用 `i18nName(def)` / `i18nDesc(def)`（英文缺省回退中文）。
- 新增文案一律走 dict，不要硬编码。

---

## 六、上线流程

1. 仓库已无国内版（已删除 android/、Capacitor、穿山甲代码与文档）。
2. 确保 `main` 分支最新，在 [CrazyGames 开发者门户](https://developer.crazygames.com/) 注册 → New Game。
3. 提交方式二选一：
   - **外链托管**：提供可公开访问的 HTTPS 游戏地址（Render 静态站即可），需能被 iframe 嵌入；
   - **上传 zip**：`npm run build` 后打包 `dist/`（注意文件引用已是相对路径）。
4. 填写元数据：游戏名、分类、英文截图与描述（本项目提供 `game1.png` 截图素材）。
5. QA 审核：会重点检查「英文支持、首局无广告、Boss 击杀/暂停是否产生 gameplay 事件、激励奖励是否只发一次」。
6. 通过后进入审核/发布队列；广告变现默认启用 rewarded。

### 本地验证清单

```bash
npm run typecheck   # 类型
npm run build       # 产物 dist/
npm run dev         # 本地：切中英、验证三个广告位弹模拟浮层、双倍灵魂只入账一次
```

**存档防作弊自测**（v2 混淆 + 盐签名 + 钳制）：

1. 正常玩两局 → F12 → `localStorage` 里 `hollow-depths.save.v2` 应为不可读的 `base64.X.签名` 串（非明文 JSON）；
2. 手工把该 value 改坏（改一位）→ 刷新 → 标题页出现红点「检测到存档异常 · 已标记」警示标签；切中/英标签随语言切换；
3. 把某把武器等级字段改成 9999 → 刷新 → 数值被钳回合法上限且存档重新落盘；
4. 首次加载会检测旧 `hollow-depths.save.v1` 明文档并**自动无损迁移**（老玩家进度保留，迁移后 v1 key 被删除）；
5. 「清除数据」后作弊标签一并消失（重置会清 v2 存档与作弊标记 key）。

> 说明：前端只能挡「改本地数据」，无法防「逆向算法者」——这属于服务端权威校验范畴（未来排行榜接入时再考虑）。

在 CrazyGames 审核用域名（`.crazygames.com`）下 QA 会看到真广告；如需在本地验证真广告回调，可临时注释 `CrazyGamesAdService.realSdk()` 中的环境门槛（**不入库**）。

---

## 七、常见问题

- **本地看不到真广告**：正常。`environment !== 'crazygames'` 一律走 Mock。真广告只会在平台 iframe 出现。
- **广告点了没反应**：检查是否已有广告在播（SingleFlight 返回 canceled）或 SDK init 超时（会回退 Mock，应仍能弹模拟浮层）。
- **iOS 切后台回来没声音**：已绑定全局手势 resume；若仍有问题，确认手势发生在 `Bgm.start()` 之后（首次创建 AudioContext 必须在用户点击内）。
