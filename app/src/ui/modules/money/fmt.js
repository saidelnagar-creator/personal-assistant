// أدوات العرض المشتركة للسلف والجمعيات والأمانات والأسعار: الكمية بوحدتها، حقل الإدخال المناسب للوحدة، قائمة الأنواع.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, moneyInput, qtyInput, selectInput } from '../../components.js';
import { MONEY, formatUnits, parseUnits } from '../../../core/money.js';
import { addMonths, daysInMonth } from '../../../core/util.js';
import { CURRENCIES, KARATS } from '../../../core/modules/money/config.js';
import { unitInfo } from '../../../core/modules/money/units.js';
import { priceAt } from '../../../core/modules/money/prices.js';

export const PG = 'money';

// رقم + وحدة عربية داخل خانة أرقام (اتجاهها LTR): نعزل الجملة RTL والرقم LTR فتُقرأ «15 جم عيار 21» صح.
const LRI = '\u2066';
const RLI = '\u2067';
const PDI = '\u2069';
export const isoNum = (s) => `${LRI}${s}${PDI}`;
export const rtl = (s) => `${RLI}${s}${PDI}`;

export const egp = (v) => (v === null || v === undefined ? '—' : rtl(`${isoNum(F.money(v))} ج`));

// «10.5 جم عيار 21» / «3,000 دولار» / «2 جنيه ذهب» / «4 كرسي».
export function uq(qty, unit, itemName = '') {
  const u = unitInfo(unit);
  if (!u) return String(qty);
  const n = isoNum(u.scale === MONEY ? F.money(qty) : F.qty(qty));
  if (u.kind === 'egp') return rtl(`${n} ج`);
  if (u.kind === 'cur') return rtl(`${n} ${u.short}`);
  if (u.kind === 'gold') return rtl(`${n} جم عيار ${isoNum(F.num(u.karat))}`);
  if (u.kind === 'gpound') return rtl(`${n} جنيه ذهب`);
  return rtl(`${n} ${itemName || 'قطعة'}`);
}

export const unitInput = (unit, value = null) => (unitInfo(unit)?.scale === MONEY ? moneyInput(value) : qtyInput(value));

// قائمة الأنواع مجمّعة: فلوس، ذهب، غير ذلك.
export function unitSelect(value = 'EGP', { exclude = [], noItem = false, moneyOnly = false } = {}) {
  const opt = (code) => ({ value: code, label: unitInfo(code).label });
  const groups = [{ group: 'فلوس', options: ['EGP', ...Object.keys(CURRENCIES)].filter((c) => !exclude.includes(c)).map(opt) }];
  if (!moneyOnly) {
    groups.push({ group: 'ذهب', options: [...KARATS.map((k) => `g${k}`), 'gpound'].filter((c) => !exclude.includes(c)).map(opt) });
    if (!noItem && !exclude.includes('item')) groups.push({ group: 'غير ذلك', options: [opt('item')] });
  }
  return selectInput(groups, value);
}

// سعر وحدة في تاريخ (لاقتراح القيمة وقتها) + نص التلميح.
export function priceHint(unit, date) {
  const u = unitInfo(unit);
  if (!u?.priceKey) return { price: null, text: '' };
  const p = priceAt(ctx.state, u.priceKey, date || ctx.today());
  return p ? { price: p.price, text: `بسعر ${F.money(p.price)} ج (${F.date(p.date)})` } : { price: null, text: 'مفيش سعر مكتوب — اكتب القيمة، أو سجّل الأسعار من «الأسعار»' };
}

const LEVEL_BADGE = { overdue: ['متأخر', 'bad'], today: ['النهارده', 'warn'], upcoming: ['قريب', 'warn'] };
export const levelBadge = (level) => (LEVEL_BADGE[level] ? badge(...LEVEL_BADGE[level]) : null);

// زر صغير لشاشة الأسعار.
export const pricesLink = () => h('button', { class: 'link', text: '💱 الأسعار', onclick: () => ctx.nav('#/prices') });

// حقل كمية يقرأ بمعامل الوحدة المختارة حالياً (جنيه/عملة ×100، جرامات/عدد ×1000).
export function unitAmountInput(getUnit, value = null) {
  const el = h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off', class: 'money', enterKeyHint: 'done' });
  const scale = () => unitInfo(getUnit())?.scale || MONEY;
  el.units = () => (el.value.trim() === '' ? null : parseUnits(el.value, scale()));
  el.setUnits = (u) => {
    el.value = u === null || u === undefined ? '' : formatUnits(u, scale()).replace(/,/g, '');
  };
  if (value !== null && value !== undefined) el.setUnits(value);
  el.addEventListener('focus', () => setTimeout(() => el.select(), 0));
  return el;
}

// تاريخ + عدد شهور (اليوم محصور في آخر الشهر).
export function addMonthsToDate(date, n) {
  const ym = addMonths(date.slice(0, 7), n);
  return `${ym}-${String(Math.min(Number(date.slice(8, 10)), daysInMonth(ym))).padStart(2, '0')}`;
}
