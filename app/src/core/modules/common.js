// الوحدة المشتركة: الأشخاص، المجموعات (التصنيفات)، التذكيرات اليدوية.
import { listEntities } from '../engine.js';
import { RULES } from '../../config/rules.js';
import { addDays, addMonths, check, isDate, nonEmpty } from '../util.js';

export const ME = 'me';
export const REPEATS = { none: 'مرة واحدة', weekly: 'كل أسبوع', monthly: 'كل شهر', yearly: 'كل سنة' };

const validName = (x, what) => check(nonEmpty(x.name) && x.name.trim().length <= 80, `اكتب اسم ${what}`);

// مواعيد التذكير المستحقة: المتأخرة (غير المنجزة، آخر 3 فقط للمتكرر) والقادمة خلال المدة.
export function reminderOccurrences(r, today, horizon = RULES.reminderHorizonDays) {
  const until = addDays(today, horizon);
  if (r.repeat === 'none' || !r.repeat) return r.date <= until ? [r.date] : [];
  const out = [];
  let d = r.date;
  let n = 0;
  const day = Number(r.date.slice(8, 10));
  while (d <= until && n < 1000) {
    out.push(d);
    n++;
    if (r.repeat === 'weekly') d = addDays(r.date, 7 * n);
    else {
      const ym = addMonths(r.date.slice(0, 7), r.repeat === 'yearly' ? 12 * n : n);
      const last = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
      d = `${ym}-${String(Math.min(day, last)).padStart(2, '0')}`;
    }
  }
  const past = out.filter((x) => x < today).slice(-3);
  return [...past, ...out.filter((x) => x >= today)];
}

export default {
  id: 'common',
  name: 'عام',
  entities: {
    person: {
      label: 'شخص',
      validate: (s, x) => validName(x, 'الشخص'),
    },
    group: {
      label: 'مجموعة',
      validate: (s, x) => validName(x, 'المجموعة'),
    },
    reminder: {
      label: 'تذكير',
      validate: (s, x) => {
        check(nonEmpty(x.title), 'اكتب عنوان التذكير');
        check(isDate(x.date), 'تاريخ التذكير غير صالح');
        check(Object.keys(REPEATS).includes(x.repeat || 'none'), 'التكرار غير صالح');
      },
    },
  },
  entries: {},
  seeds: () => [['person', { id: ME, name: 'أنا' }]],
  reminders(state, today) {
    const out = [];
    for (const r of listEntities(state, 'reminder')) {
      for (const due of reminderOccurrences(r, today)) {
        if (state.remindersDone.has(`${r.id}|${due}`)) continue;
        out.push({ id: `${r.id}|${due}`, reminderId: r.id, due, title: r.title, note: r.note || '', level: due < today ? 'overdue' : due === today ? 'today' : 'upcoming', href: `#/reminders`, custom: true });
      }
    }
    return out;
  },
};
