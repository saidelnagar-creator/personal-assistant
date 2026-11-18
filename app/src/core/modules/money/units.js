// وحدات «اللي اتسلف أو اتحفظ»: جنيه، عملة أجنبية، جرامات ذهب بعيار، جنيهات ذهب، أو حاجة تانية.
// الجنيه والعملات ×100، والجرامات والعدد ×1000. القيمة بالجنيه = الكمية × سعر الوحدة (بالقرش).
import { MONEY, QTY, formatUnits, mulDiv } from '../../money.js';
import { CURRENCIES, KARATS, MONEY_RULES } from './config.js';

export function unitInfo(code) {
  if (code === 'EGP') return { code, kind: 'egp', scale: MONEY, label: 'جنيه مصري', short: 'ج', priceKey: null };
  if (typeof code === 'string' && Object.hasOwn(CURRENCIES, code)) return { code, kind: 'cur', scale: MONEY, label: CURRENCIES[code], short: CURRENCIES[code], priceKey: code };
  const g = /^g(24|21|18)$/.exec(code || '');
  if (g) return { code, kind: 'gold', scale: QTY, karat: Number(g[1]), label: `ذهب عيار ${g[1]} (بالجرام)`, short: `جم ذهب ${g[1]}`, priceKey: code };
  if (code === 'gpound') return { code, kind: 'gpound', scale: QTY, label: 'جنيهات ذهب (بالعدد)', short: 'جنيه ذهب', priceKey: 'gpound' };
  if (code === 'item') return { code, kind: 'item', scale: QTY, label: 'حاجة تانية', short: '', priceKey: null };
  return null;
}
export const isUnit = (code) => !!unitInfo(code);
export const UNIT_CODES = Object.freeze(['EGP', ...Object.keys(CURRENCIES), ...KARATS.map((k) => `g${k}`), 'gpound', 'item']);

// مفاتيح الأسعار: سعر جرام كل عيار، الجنيه الذهب، وكل عملة (بالقرش).
export const PRICE_KEYS = Object.freeze([...KARATS.map((k) => `g${k}`), 'gpound', ...Object.keys(CURRENCIES)]);
export function priceLabel(key) {
  if (/^g\d+$/.test(key)) return `جرام عيار ${key.slice(1)}`;
  if (key === 'gpound') return 'الجنيه الذهب';
  return CURRENCIES[key] || key;
}

// نص الكمية بوحدتها (أرقام لاتينية؛ الواجهة لها منسّقها).
export function qtyText(qty, code, itemName = '') {
  const u = unitInfo(code);
  if (!u) return String(qty);
  const n = formatUnits(qty, u.scale);
  if (u.kind === 'egp') return `${n} ج`;
  if (u.kind === 'cur') return `${n} ${u.short}`;
  if (u.kind === 'gold') return `${n} جم عيار ${u.karat}`;
  if (u.kind === 'gpound') return `${n} جنيه ذهب`;
  return `${n} ${itemName || 'قطعة'}`.trim();
}

// القيمة بالجنيه (قرش) لكمية بسعر وحدتها. null لو لا يوجد سعر (أو حاجة بلا سعر).
export function valueOf(qty, code, price) {
  const u = unitInfo(code);
  if (!u) return null;
  if (u.kind === 'egp') return qty;
  if (price === null || price === undefined || u.kind === 'item') return null;
  return mulDiv(qty, price, u.scale);
}

// الكمية المقابلة لقيمة بالجنيه (للتحويل بين الأنواع).
export function qtyForValue(value, code, price) {
  const u = unitInfo(code);
  if (!u) return null;
  if (u.kind === 'egp') return value;
  if (!price || u.kind === 'item') return null;
  return mulDiv(value, u.scale, price);
}

// أسعار العيارات والجنيه الذهب المشتقة من عيار 21 (الواجهة تقترحها ويمكن تعديلها).
export function deriveGold(g21) {
  return { g24: mulDiv(g21, 24, 21), g18: mulDiv(g21, 18, 21), gpound: mulDiv(g21, MONEY_RULES.goldPoundMilligrams, QTY) };
}
