// نصوص العرض المشتركة لشاشات ونماذج العربية: المدة، المتبقي، شارة الحالة.
import { ctx, F } from '../../ctx.js';
import { badge } from '../../components.js';

export const PG = 'car';
export const km = (n) => (n === null || n === undefined ? '—' : `${F.num(n)} كم`);

export function monthsText(n) {
  if (n === 1) return 'شهر';
  if (n === 2) return 'شهرين';
  if (n === 12) return 'سنة';
  if (n === 24) return 'سنتين';
  if (n % 12 === 0) return `${F.num(n / 12)} سنين`;
  return n <= 10 ? `${F.num(n)} شهور` : `${F.num(n)} شهر`;
}

export const daysText = (d) => (d < 60 ? `${F.num(d)} يوم` : monthsText(Math.round(d / 30.44)));

// «كل 5,000 كم أو 6 شهور»
export function everyText(t) {
  const a = t.km > 0 ? `${F.num(t.km)} كم` : '';
  const b = t.months > 0 ? monthsText(t.months) : '';
  if (!a && !b) return 'بدون مدة';
  return `كل ${[a, b].filter(Boolean).join(' أو ')}${a && b ? ' (أيهما أقرب)' : ''}`;
}

export function lastText(t) {
  if (!t.last) return '';
  return `آخر مرة ${t.last.date ? F.date(t.last.date) : '(تاريخ غير معروف)'}${t.last.km !== null ? ` عند ${km(t.last.km)}` : ''}`;
}

// المتبقي أو المتأخر بالكيلو والوقت + التاريخ المتوقع.
export function dueText(t) {
  if (t.status === 'off') return 'موقوف';
  if (t.status === 'unknown') return t.partial ? 'سجل آخر مرة ناقص (العداد أو التاريخ)' : t.critical ? 'مش معروف آخر مرة — اعمله في أول زيارة' : 'مش معروف آخر مرة';
  const parts = [];
  if (t.remainingKm !== null && t.remainingKm !== undefined) parts.push(t.remainingKm <= 0 ? `فات ${F.num(-t.remainingKm)} كم` : `باقي ${F.num(t.remainingKm)} كم`);
  if (t.remainingDays !== null && t.remainingDays !== undefined) parts.push(t.remainingDays < 0 ? `فات ${daysText(-t.remainingDays)}` : t.remainingDays === 0 ? 'النهارده' : `باقي ${daysText(t.remainingDays)}`);
  if (t.status !== 'due' && t.dueAt) parts.push(`≈ ${F.date(t.dueAt)}`);
  return parts.join(' · ');
}

export function statusBadge(t) {
  switch (t.status) {
    case 'due':
      return badge('مطلوب', 'bad');
    case 'soon':
      return badge('قريب', 'warn');
    case 'unknown':
      return t.critical ? badge('مش معروف · مهم', 'bad') : badge('مش معروف');
    case 'off':
      return badge('موقوف');
    default:
      return badge('تمام', 'ok');
  }
}

export const today = () => ctx.today();
