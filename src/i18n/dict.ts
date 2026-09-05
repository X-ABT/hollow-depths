/**
 * 全局 UI 文案字典：key → { zh, en }。
 *
 * key 约定：`模块.段落.子项` 点分命名（如 'title.start'、'levelup.reroll'）。
 * zh 为空表示该文案仅在英文语境出现；en 为空表示暂无英文（此时英文回退中文）。
 *
 * 文案按模块分区组织，迁移哪个 UI 就在对应分区补 key，保持文件可读。
 */

export interface DictEntry {
  zh: string;
  en: string;
}

export const DICT: Record<string, DictEntry> = {
  // —————————————————— 通用 / index.html ——————————————————
  'boot.sub': { zh: '幽墟幸存者', en: 'Survive the Hollow Depths' },
  'boot.hint': { zh: '正在点亮幽墟……', en: 'Igniting the depths…' },
  'noscript.tip': { zh: '本游戏需要启用 JavaScript 才能运行。', en: 'This game requires JavaScript to run.' },
  'fatal.page': { zh: '页面结构异常，请刷新重试。', en: 'Unexpected page structure. Please refresh.' },
  'fatal.webgl': {
    zh: '当前浏览器不支持 WebGL，建议使用最新版 Chrome / Edge / Safari。',
    en: 'WebGL is not supported by this browser. Please use the latest Chrome / Edge / Safari.',
  },

  // —————————————————— 升级选项（Build.rollOptions）——————————————————
  'build.evolution': { zh: '武器进化', en: 'Weapon Evolution' },
  'build.newWeapon': { zh: '新武器', en: 'New Weapon' },
  'build.newWeaponAt': { zh: '新武器　起始 Lv{lv}', en: 'New Weapon · starts at Lv {lv}' },
  'build.newGear': { zh: '新装备', en: 'New Gear' },
  'build.wepUp': { zh: 'Lv {from} → {to}　伤害 {dmgFrom} → {dmgTo}', en: 'Lv {from} → {to} · DMG {dmgFrom} → {dmgTo}' },
  'build.pasUp': { zh: 'Lv {from} → {to}', en: 'Lv {from} → {to}' },
  'build.healTitle': { zh: '治疗药剂', en: 'Healing Potion' },
  'build.healDesc': { zh: '立即恢复 30 点生命。', en: 'Instantly restores 30 HP.' },
  'build.fallback': { zh: '兜底奖励', en: 'Fallback Reward' },
  'build.kindWeapon': { zh: '武器', en: 'Weapon' },

  // —————————————————— 广告（Mock 模拟浮层 / 广告位名）——————————————————
  'ad.place.levelup_reroll': { zh: '重摇升级选项', en: 'Reroll Choices' },
  'ad.place.pet_free_ten': { zh: '免费宠物十连', en: 'Free 10-Pet Draw' },
  'ad.place.gameover_double_soul': { zh: '本局灵魂翻倍', en: 'Double This Run&apos;s Souls' },
  'ad.mockBadge': { zh: '激励视频 · 模拟', en: 'Rewarded Ad · Simulation' },
  'ad.mockWatchFull': { zh: '完整观看后发放，中途退出不发放', en: 'Reward granted after full watch; quitting early grants nothing' },
  'ad.mockSeconds': { zh: '{n} 秒后可领取', en: '{n}s until claim' },
  'ad.mockReady': { zh: '奖励已就绪', en: 'Reward ready' },
  'ad.mockClaim': { zh: '立即领取', en: 'Claim' },
  'ad.mockCancel': { zh: '取消', en: 'Cancel' },
  'ad.mockGo': { zh: 'GO', en: 'GO' },
  'build.kindPassive': { zh: '装备', en: 'Gear' },
  'build.kindEvolve': { zh: '进化', en: 'Evolution' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.on': { zh: '开', en: 'On' },
  'common.off': { zh: '关', en: 'Off' },

  // —————————————————— 标题页 ——————————————————
  'title.sub': { zh: '幽墟幸存者', en: 'Survive the Hollow Depths' },
  'title.soul': { zh: '灵魂', en: 'Souls' },
  'title.start': { zh: '进入幽墟', en: 'Descend' },
  'title.shop': { zh: '商店', en: 'Shop' },
  'title.pet': { zh: '饲养园', en: 'Pet Ranch' },
  'title.expedition': { zh: '宠物远征', en: 'Pet Expedition' },
  'title.park': { zh: '宠物园', en: 'Pet Park' },
  'title.help': { zh: '玩法说明', en: 'How to Play' },
  'title.clear': { zh: '清除数据', en: 'Erase Data' },
  'title.welcome': { zh: '欢迎进入幽墟，祝你游玩愉快', en: 'Welcome to the Hollow. Good luck!' },
  'title.tamperBadge': { zh: '检测到存档异常 · 已标记', en: 'Save data anomaly detected · flagged' },
  'title.tamperHint': {
    zh: '存档内容与预期不符，可能已被修改。请勿篡改本地存档。',
    en: 'Save data does not match expectations and may have been modified. Please do not tamper with local saves.',
  },
  'title.best': {
    zh: '最佳记录　存活 <b>{time}</b>　击杀 <b>{kills}</b>　等级 <b>{level}</b>',
    en: 'Best Run · Survived <b>{time}</b> · Kills <b>{kills}</b> · Level <b>{level}</b>',
  },
  'title.clearTitle': { zh: '是否清除数据？', en: 'Erase all data?' },
  'title.clearWarn': {
    zh: '将清空全部进度（灵魂 / 宠物 / 解锁 / 设置），不可恢复。',
    en: 'This wipes all progress (souls / pets / unlocks / settings). This cannot be undone.',
  },
  'title.clearOk': { zh: '确定清除', en: 'Erase' },
  'title.modeTitle': { zh: '选择幽墟模式', en: 'Choose Your Run' },
  'title.modeStandard': { zh: '标准一局', en: 'Standard Run' },
  'title.modeStandardDesc': { zh: '击败最终 Boss「终焉」逃出幽墟', en: 'Defeat the final boss, the Endless, and escape the Hollow.' },
  'title.modeEndless': { zh: '无尽幽墟', en: 'Endless Hollow' },
  'title.modeEndlessDesc': { zh: 'Boss 定时刷新 · 无终点 · 战至倒下', en: 'Bosses on a timer · no end · fight until you fall.' },
  'title.back': { zh: '返回', en: 'Back' },
  'title.langLabel': { zh: '语言', en: 'Language' },
  'title.helpLines': {
    zh:
      '<div>用 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键移动，武器自动开火（移动端左半屏按住拖动）</div>' +
      '<div>击杀敌人积攒经验升级三选一构筑流派；每杀 100 只怪凝结 1.00 灵魂</div>' +
      '<div>灵魂跨局永久累积，在主界面「商店」解锁新武器与装备，解锁后才会进入升级卡池</div>' +
      '<div>胜利条件：击败最终 Boss「终焉」即获胜；若超时未击败则失败</div>' +
      '<div>5:00 古神现身，每击败一个 Boss，4 分钟后迎来下一场 Boss 战</div>' +
      '<div>Boss 被击杀越快，挑战越强：2分钟内×2 / 1分30秒内×3 / 1分钟内×4 / 30秒内×5 / 15秒内×10</div>' +
      '<div>下一只 Boss 血量按上表提高；普通小怪刷新永久提速（每次快杀累乘，不会回落）</div>' +
      '<div>「饲养园」用灵魂抽宠物/粮食，投喂升级属性随等级成长，出战宠物跟随你自动战斗</div>' +
      '<div><kbd>Esc</kbd> 或 <kbd>P</kbd> 暂停</div>',
    en:
      '<div>Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys. Weapons fire automatically (drag on the left half on mobile).</div>' +
      '<div>Kill enemies for XP and choose upgrades; every 100 kills forges 1.00 Soul.</div>' +
      '<div>Souls persist across runs — unlock new weapons and gear in the Shop so they can appear in your upgrade pool.</div>' +
      '<div>Win by defeating the final boss, the Endless. Failing to do so in time is defeat.</div>' +
      '<div>The Herald arrives at 5:00; each boss defeated brings the next one 4 minutes later.</div>' +
      '<div>The faster you slay a boss, the harder it gets: &lt;2min ×2 / &lt;1m30 ×3 / &lt;1min ×4 / &lt;30s ×5 / &lt;15s ×10.</div>' +
      '<div>The next boss HP scales by the table above; minion spawns permanently speed up after quick kills.</div>' +
      '<div>In the Pet Ranch, draw pets and food with Souls, feed them to grow, and deploy pets that fight alongside you.</div>' +
      '<div>Press <kbd>Esc</kbd> or <kbd>P</kbd> to pause.</div>',
  },

  // —————————————————— HUD / 暂停 ——————————————————
  'hud.kills': { zh: '{n} 击杀', en: '{n} kills' },
  'hud.endless': { zh: '无尽幽墟', en: 'ENDLESS' },
  'hud.zoomIn': { zh: '放大视野', en: 'Zoom in' },
  'hud.zoomOut': { zh: '缩小视野', en: 'Zoom out' },
  'hud.zoomReset': { zh: '重置视野', en: 'Reset zoom' },
  'pause.btnAria': { zh: '暂停', en: 'Pause' },
  'pause.tipIdle': { zh: 'Esc / P 暂停', en: 'Esc / P Pause' },
  'pause.tipPaused': { zh: '已暂停 · Esc / P 继续', en: 'Paused · Esc / P Resume' },
  'pause.tipActive': { zh: '已暂停', en: 'Paused' },
  'pause.title': { zh: '已暂停', en: 'Paused' },
  'pause.subPre': { zh: '本局凝聚的灵魂 ', en: 'Souls banked this run ' },
  'pause.subPost': { zh: ' 退出时仍会入账', en: ' will still be saved when you quit' },
  'pause.compact': { zh: '宠物紧凑显示：{state}', en: 'Compact pets: {state}' },
  'pause.resume': { zh: '继续战斗', en: 'Resume' },
  'pause.quit': { zh: '退出到主界面', en: 'Quit to Title' },
  'pause.compactOn': { zh: '宠物紧凑显示：开', en: 'Compact pets: On' },
  'pause.compactOff': { zh: '宠物紧凑显示：关', en: 'Compact pets: Off' },
  'code.redeemAria': { zh: '兑换码入口', en: 'Redeem code entry' },
  'code.placeholder': { zh: '输入兑换码', en: 'Enter code' },

  // —————————————————— 升级三选一 ——————————————————
  'levelup.title': { zh: '等级提升', en: 'Level Up' },
  'levelup.sub': { zh: 'Lv {level} · 选择你的强化', en: 'Lv {level} · choose your power-up' },
  'levelup.rerollBtn': { zh: '看广告重摇', en: 'Watch Ad to Reroll' },
  'levelup.rerollHint': { zh: '三选一不满意？看一次广告重新随机', en: 'Not happy with the picks? Watch an ad to reroll' },
  'levelup.adPlaying': { zh: '广告播放中… 请完整观看', en: 'Ad playing… please watch in full' },

  // —————————————————— 结算页 ——————————————————
  'gameover.win': { zh: '逃出幽墟', en: 'You Escaped the Hollow' },
  'gameover.lose': { zh: '葬身幽墟', en: 'You Fell in the Hollow' },
  'gameover.newBest': { zh: '新纪录', en: 'New Record' },
  'gameover.statTime': { zh: '存活时间', en: 'Survived' },
  'gameover.statKills': { zh: '击杀', en: 'Kills' },
  'gameover.statLevel': { zh: '等级', en: 'Level' },
  'gameover.statTop': { zh: '最高伤害', en: 'Top Weapon' },
  'gameover.buildTitle': { zh: '本 局 构 筑', en: 'R U N  B U I L D' },
  'gameover.soulBankedPre': { zh: '本局凝聚灵魂 ', en: 'Souls gathered this run ' },
  'gameover.soulBankedPost': { zh: '　已存入永久账户', en: ' · banked permanently' },
  'gameover.doubleBtn': { zh: '看广告 · 灵魂翻倍', en: 'Watch Ad · Double Souls' },
  'gameover.doubleHint': { zh: '完整观看后本局灵魂翻倍', en: 'Watch in full to double this run&apos;s souls' },
  'gameover.restart': { zh: '再来一局', en: 'Play Again' },
  'gameover.toTitle': { zh: '返回标题', en: 'Back to Title' },
  'gameover.copy': { zh: '复制战绩', en: 'Copy Result' },
  'gameover.doubleClaimed': { zh: '已翻倍', en: 'Doubled' },
  'gameover.dmgParen': { zh: '（{n}）', en: ' ({n})' },
  'gameover.copyHeader': { zh: '【Hollow Depths 幽墟幸存者】', en: '[Hollow Depths]' },
  'gameover.copyLine': { zh: '{result}　存活 {time}s　击杀 {kills}　等级 {level}', en: '{result} · survived {time}s · kills {kills} · level {level}' },
  'gameover.copySoul': { zh: '本局凝聚灵魂 +{soul}', en: 'Souls gathered +{soul}' },
  'gameover.copyWeapons': { zh: '构筑：', en: 'Build: ' },
  'gameover.copyGear': { zh: '装备：', en: 'Gear: ' },

  // —————————————————— 宠物远征（横幅/过渡）——————————————————
  'exp.stageClear': {
    zh: '第 {stage} 关通过 · 获得 ★{reward} · 自动进入第 {next} 关',
    en: 'Stage {stage} cleared · +★{reward} · auto-starting stage {next}',
  },
  'exp.wave': { zh: '第 {stage} 关', en: 'Stage {stage}' },
  'exp.quit': { zh: '撤退', en: 'Retreat' },
  'exp.stage': { zh: '第 <b>{stage}</b> 关{boss}<span class="exp-remain">剩余 {n}</span>', en: 'Stage <b>{stage}</b>{boss}<span class="exp-remain">{n} left</span>' },
  'exp.bossTag': { zh: ' · BOSS', en: ' · BOSS' },
  'exp.failTitle': { zh: '挑战失败', en: 'Challenge Failed' },
  'exp.failNote': { zh: '你的宠物在第 {stage} 关倒下了。再战将从第 {resume} 关开始。', en: 'Your pet fell at stage {stage}. The next attempt will resume at stage {resume}.' },
  'exp.backToCamp': { zh: '返回营地', en: 'Back to Camp' },

  // —————————————————— 灵魂商店 ——————————————————
  'shop.title': { zh: '灵魂商店', en: 'Soul Shop' },
  'shop.close': { zh: '关闭商店', en: 'Close shop' },
  'shop.balance': { zh: '余额', en: 'Balance' },
  'shop.priceThis': { zh: '本件', en: 'This one' },
  'shop.note': {
    zh: '解锁后才会进入每局升级三选一的卡池 · 已解锁项可花灵魂永久提升「起始等级」，升级后在本局刷到即从此等级起算（价格翻倍：30/60/120…）',
    en: 'Unlocked items enter each run&apos;s upgrade pool. Owned items can be raised to a permanent starting level with Souls — price doubles per level (30/60/120…).',
  },
  'shop.weapons': { zh: '武 器', en: 'W E A P O N S' },
  'shop.gear': { zh: '装 备', en: 'G E A R' },
  'shop.tagWeapon': { zh: '武器', en: 'Weapon' },
  'shop.tagGear': { zh: '装备', en: 'Gear' },
  'shop.itemDesc': { zh: '{desc} · 满级 Lv{max} · 起始 Lv{base}', en: '{desc} · Max Lv {max} · Start Lv {base}' },
  'shop.ownedMax': { zh: '已解锁 · 满级起始 Lv{lv}', en: 'Owned · Max starting Lv {lv}' },
  'shop.upgradeBtn': { zh: '升起始 Lv{from}→{to}', en: 'Raise start Lv {from}→{to}' },
  'shop.soulUnit': { zh: '{n} 灵魂', en: '{n} Souls' },

  // —————————————————— 宠物通用（标签/稀有度/属性）——————————————————
  'rarity.common': { zh: '普通', en: 'Common' },
  'rarity.rare': { zh: '稀有', en: 'Rare' },
  'rarity.legend': { zh: '传说', en: 'Legendary' },
  'pet.statHp': { zh: '血量', en: 'HP' },
  'pet.statDmg': { zh: '伤害', en: 'DMG' },
  'pet.statSize': { zh: '体型比例', en: 'Size Ratio' },
  'pet.lv': { zh: 'Lv {lv}', en: 'Lv {lv}' },
  'pet.food': { zh: '粮袋', en: 'Food' },
  'pet.shards': { zh: '碎片', en: 'Shards' },
  'pet.starCoins': { zh: '星币', en: 'Star Coins' },
  'pet.adFreeDraw': { zh: '看广告 · 免费十连', en: 'Watch Ad · Free x10' },
  'pet.adBusy': { zh: '广告播放中…<br><span class="pet-cost">请完整观看</span>', en: 'Ad playing…<br><span class="pet-cost">watch in full</span>' },

  // —————————————————— 宠物中心（抽奖/饲养/碎片商店）——————————————————
  'pet.center': { zh: '饲养园', en: 'Pet Ranch' },
  'pet.close': { zh: '关闭宠物中心', en: 'Close pet center' },
  'pet.resFood': { zh: '粮袋', en: 'Food' },
  'pet.resShards': { zh: '碎片', en: 'Shards' },
  'pet.tabGacha': { zh: '抽奖', en: 'Gacha' },
  'pet.tabFarm': { zh: '饲养', en: 'Raise' },
  'pet.tabShop': { zh: '碎片商店', en: 'Shard Shop' },
  'pet.draw1': { zh: '单抽', en: 'Draw 1' },
  'pet.draw10': { zh: '十连', en: 'Draw 10' },
  'pet.draw100': { zh: '百连', en: 'Draw 100' },
  'pet.souls': { zh: '{n} 灵魂', en: '{n} Souls' },
  'pet.souls10': { zh: '{n} 灵魂（9折）', en: '{n} Souls (10% off)' },
  'pet.souls100': { zh: '{n} 灵魂（8折）', en: '{n} Souls (20% off)' },
  'pet.free10': { zh: '免费十连', en: 'Free x10' },
  'pet.free10Hint': { zh: '看广告 · 不扣灵魂', en: 'Watch ad · no Souls' },
  'pet.gachaNote': {
    zh: '出宠物 {pet}%（普通 {c}% · 稀有 {r}% · 传说 {l}%）；其余 {food}% 为粮袋，单袋数量 1/5/10/20/50/100 按概率。重复宠物自动分解为碎片',
    en: 'Pets drop at {pet}% (Common {c}% · Rare {r}% · Legendary {l}%); the rest ({food}%) is food bags of 1/5/10/20/50/100. Duplicate pets auto-convert to shards.',
  },
  'pet.freeBanner': { zh: '基础宠物（普通宠一半属性）', en: 'Starter pet (half of a Common pet)' },
  'pet.claimFree': { zh: '免费领取', en: 'Claim Free' },
  'pet.noOwned': { zh: '还没有宠物——先去「抽奖」带一只回来吧。', en: 'No pets yet — head to Gacha to bring one home!' },
  'pet.onBattle': { zh: '上阵', en: 'Deploy' },
  'pet.offBattle': { zh: '下阵', en: 'Recall' },
  'pet.emptySlot': { zh: '空槽位', en: 'Empty' },
  'pet.slotTip': {
    zh: '可上阵 {a}/{b} 只 · 拥有 5 只开第 2 槽 · 拥有 10 只开第 3 槽',
    en: 'Deployed {a}/{b} · 5 pets unlock slot 2 · 10 pets unlock slot 3',
  },
  'pet.feedNeed': { zh: '投喂 1 级（需 {n} 袋粮）', en: 'Feed 1 level ({n} food)' },
  'pet.moveOut': { zh: '移出上阵', en: 'Recall' },
  'pet.fightNow': { zh: '上阵出战', en: 'Deploy' },
  'pet.noDetail': { zh: '还没有宠物可看详情。', en: 'Select a pet to see details.' },
  'pet.growRule': {
    zh: '每升 1 级：体积 +{v} · 血量 +1 · 伤害 +1',
    en: 'Per level: Size +{v} · HP +1 · DMG +1',
  },
  'pet.statVol': { zh: '体积', en: 'Size' },
  'pet.drawResultFood': { zh: '宠物粮 ×{n}', en: 'Pet Food ×{n}' },
  'pet.drawResultNew': { zh: '{name}（新获得！）', en: '{name} (NEW!)' },
  'pet.drawResultDup': { zh: '{name} ×{n}（重复 → +{s} 碎片）', en: '{name} ×{n} (duplicate → +{s} shards)' },
  'pet.exchangePets': { zh: '兑换宠物', en: 'Exchange Pets' },
  'pet.exchangeFood': { zh: '兑换粮袋', en: 'Exchange Food' },
  'pet.owned': { zh: '已拥有', en: 'Owned' },
  'pet.baseStats': {
    zh: '基础 体积{v} · 血量{hp} · 伤害{d}',
    en: 'Base Size {v} · HP {hp} · DMG {d}',
  },
  'pet.shardCost': { zh: '{n} 碎片', en: '{n} shards' },
  'pet.bags': { zh: '{n} 袋粮', en: '{n} food bags' },
  'pet.bulkTag': { zh: '{n} 袋粮（特惠）', en: '{n} food bags (BULK)' },
  'pet.bulkSub': { zh: '{count} 袋 · {cost} 碎片', en: '{count} bags · {cost} shards' },

  // —————————————————— 宠物园（绿地展示）——————————————————
  'park.back': { zh: '← 返回', en: '← Back' },
  'park.backAria': { zh: '返回主界面', en: 'Back to title' },
  'park.hint': { zh: '按住拖拽 · 滚轮/按钮缩放 · 点击宠物查看', en: 'Drag to pan · zoom with wheel/buttons · click a pet to inspect' },
  'park.fit': { zh: '适应全部', en: 'Fit All' },
  'park.close': { zh: '关闭', en: 'Close' },

  // —————————————————— 宠物远征（营地/战斗）——————————————————
  'exp.title': { zh: '宠物远征', en: 'Pet Expedition' },
  'exp.noPetNote': {
    zh: '需要先拥有一只宠物才能出战。去「饲养园」抽一只或免费领取基础宠物吧。',
    en: 'You need a pet to deploy. Head to the Pet Ranch to draw one or claim the free starter pet.',
  },
  'exp.toTitle': { zh: '返回标题', en: 'Back to Title' },
  'exp.starLabel': { zh: '★ 星币', en: '★ Star Coins' },
  'exp.introNote': {
    zh: '单宠驻守、自动平A；点技能按钮手动放大招。通关得星币，星币可升技能 / 兑碎片。',
    en: 'One pet holds the line and attacks automatically; press the skill button for its ultimate. Clear stages for star coins to level skills or exchange shards.',
  },
  'exp.startAt': { zh: '开始挑战（第 {n} 关）', en: 'Start (stage {n})' },
  'exp.skillLine': { zh: '招牌技能：<b>{name}</b> · 等级 <b class="exp-skill-lv">{lv}</b>', en: 'Signature Skill: <b>{name}</b> · Lv <b class="exp-skill-lv">{lv}</b>' },
  'exp.upgradeSkill': { zh: '升级技能（{cost} 星币）', en: 'Upgrade ({cost} coins)' },
  'exp.exLabel': { zh: '星币兑碎片', en: 'Coins to Shards' },
  'exp.exRate': { zh: '{n} 星币 = 1 碎片', en: '{n} coins = 1 shard' },
  'exp.exWant': { zh: '{n} 碎片', en: '{n} shards' },
  'exp.exAll': { zh: '全部', en: 'All' },
  'exp.exGo': { zh: '兑换 {n} 星币', en: 'Exchange {n} coins' },
  'exp.exNoStar': {
    zh: '星币不足：先闯关赚星币，或把星币留给升技能',
    en: 'Not enough coins — clear stages for more, or save them for skill upgrades.',
  },
};
