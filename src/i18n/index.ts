import { DICT } from './dict';
import { currentLang, isEn, setLang } from './lang';
import { PET_BUFF_DICT_KEY, petBuffDisplayValue, petBuffFor } from '../data/pets';
import type { Lang } from './lang';

export type { Lang };
export { currentLang, isEn, setLang };

/** {name} / {n} 占位替换 */
function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (raw, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : raw,
  );
}

/**
 * 按当前语言取 UI 文案。key 缺失时回退中文键名（便于开发期发现缺 key）。
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const e = DICT[key];
  if (!e) return key;
  const raw = isEn() && e.en ? e.en : e.zh;
  return fill(raw, vars);
}

/**
 * 数据层双语契约：展示型 Def 对象统一声明可选英文字段。
 * name/en 是名称；desc/enDesc 是描述。实施中逐数据文件补全。
 */
export interface LocalizedDef {
  name: string;
  en?: string;
  desc?: string;
  enDesc?: string;
}

/** 取名称：英文模式且存在 en 时返回英文，否则中文兜底 */
export function i18nName<T extends LocalizedDef>(def: T): string {
  return isEn() && def.en ? def.en : def.name;
}

/** 取描述：英文模式且存在 enDesc 时返回英文，否则中文兜底 */
export function i18nDesc<T extends LocalizedDef>(def: T): string {
  return isEn() && def.enDesc ? def.enDesc : (def.desc ?? '');
}

/** 数字格式：中文千分位不受影响；为英文统一追加千分位逗号（可选使用） */
export function fmtN(n: number): string {
  return n.toLocaleString(isEn() ? 'en-US' : 'zh-CN');
}

/** 宠物稀有度标签（common/rare/legend → 当前语言） */
export function rarityLabel(rarity: 'common' | 'rare' | 'legend'): string {
  return t(`rarity.${rarity}`);
}

/**
 * 宠物「上阵增益」每级文案（如「伤害 +0.5%/级」）。
 * 供饲养园/图鉴/远征营地共用的展示入口。
 */
export function petBuffText(def: { id: string }): string | null {
  const b = petBuffFor(def as Parameters<typeof petBuffFor>[0]);
  if (!b) return null;
  return t(PET_BUFF_DICT_KEY[b.kind], { p: petBuffDisplayValue(b) });
}
