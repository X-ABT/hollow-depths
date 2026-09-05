/** 语言偏好独立于存档的 localStorage key（不随「清除数据」被清掉，避免玩家被语言锁定重来） */
const KEY = 'hollow-depths.lang.v1';

export type Lang = 'zh' | 'en';

/** 模块加载时锁定一次：本项目语言切换采用整页 reload，无需运行时响应式 */
const CURRENT: Lang = detect();

/**
 * 探测当前语言：优先已保存的手动偏好；无偏好时**默认英文**（面向国际/海外发行）。
 * 刻意不跟随浏览器语言自动切中文，保证国际版玩家首见即英文。
 */
function detect(): Lang {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* 存储不可用：走默认英文 */
  }
  return saved === 'zh' || saved === 'en' ? saved : 'en';
}

export function currentLang(): Lang {
  return CURRENT;
}

export function isEn(): boolean {
  return CURRENT === 'en';
}

/** 切换语言：先持久化再整页重载，让所有 UI 以一致语言重建 */
export function setLang(l: Lang): void {
  if (l === CURRENT) return;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* 存储不可用：本次会话内仍切换 */
  }
  location.reload();
}
