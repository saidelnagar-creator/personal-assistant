// أسعار الذهب والعملات: قيود «money.price» بتاريخها يكتبها المستخدم (التطبيق أوفلاين ولا يكلّم أي موقع).
// السعر في تاريخ = آخر قيد ساري تاريخه ≤ التاريخ وفيه هذا المفتاح.
import { MONEY_RULES } from './config.js';
import { addDays, cmp, daysBetween } from '../../util.js';

const cache = new WeakMap();
// قيود الأسعار السارية من الأحدث للأقدم (ذاكرة مؤقتة بإصدار الحالة).
export function priceEntries(state) {
  const c = cache.get(state);
  if (c && c.version === state.version) return c.list;
  const list = state.entries.filter((e) => !e.voided && e.kind === 'money.price').sort((a, b) => cmp(b.date, a.date) || cmp(b.ts, a.ts));
  cache.set(state, { version: state.version, list });
  return list;
}

export function priceAt(state, key, date) {
  for (const e of priceEntries(state)) if (e.date <= date && Number.isSafeInteger(e.prices?.[key])) return { price: e.prices[key], date: e.date, entryId: e.id };
  return null;
}

// آخر سعر معروف لكل مفتاح حتى تاريخ.
export function latestPrices(state, date) {
  const out = {};
  for (const e of priceEntries(state)) {
    if (e.date > date) continue;
    for (const [k, v] of Object.entries(e.prices || {})) if (!out[k]) out[k] = { price: v, date: e.date, entryId: e.id };
  }
  return out;
}

export const remindDaysOf = (state) => (Number.isInteger(state.settings['money.remindDays']) ? state.settings['money.remindDays'] : MONEY_RULES.remindDays);

// مستوى التذكير لميعاد: متأخر / النهارده / قادم (خلال المدة) / null (بعيد).
export function dueLevel(due, today, days) {
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  return due <= addDays(today, days) ? 'upcoming' : null;
}

// المفاتيح المحتاجة اللي سعرها قديم أو مش موجود.
export function stalePriceKeys(state, keys, today) {
  const latest = latestPrices(state, today);
  return [...keys].filter((k) => !latest[k] || daysBetween(latest[k].date, today) > MONEY_RULES.priceStaleDays).map((k) => ({ key: k, last: latest[k] || null }));
}
