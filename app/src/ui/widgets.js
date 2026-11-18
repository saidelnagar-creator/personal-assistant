// عناصر عرض مشتركة بين الشاشات.
import { h } from './dom.js';
import { ctx, F } from './ctx.js';
import { row, badge, list, empty } from './components.js';
import { describeEntry } from '../core/engine.js';

const uiState = new Map();
// حالة واجهة تبقى بين إعادة الرسم (فلاتر، فترة مختارة).
export function ui(key, defaults) {
  if (!uiState.has(key)) uiState.set(key, { ...defaults });
  return uiState.get(key);
}

export const collator = new Intl.Collator('ar', { numeric: true });

export function entryRow(e, { showMonth = true } = {}) {
  const d = describeEntry(ctx.state, e);
  const amount = d.amount ? (d.sign > 0 ? F.money(d.amount, { sign: true }) : d.sign < 0 ? F.money(-d.amount) : F.money(d.amount)) : '';
  const sub = [F.date(e.date), showMonth && e.month && e.month !== e.date.slice(0, 7) ? `على حساب ${F.month(e.month)}` : '', e.note].filter(Boolean).join(' · ');
  return row({
    title: d.title,
    subtitle: sub,
    value: amount,
    valueClass: e.voided ? '' : d.sign > 0 ? 'pos' : d.sign < 0 ? 'neg' : '',
    cls: e.voided ? 'voided' : '',
    badge: e.voided ? badge('ملغى', 'bad') : e.replaces ? badge('معدَّل', 'info') : null,
    onclick: () => ctx.nav(`#/entry/${e.id}`),
    pg: 'entries',
    pk: 'entries|rows',
    maskSub: false,
  });
}

export function entryList(entries, { emptyText = 'لا توجد حركات', limit = 300 } = {}) {
  if (!entries.length) return empty(emptyText);
  const el = list(entries.slice(0, limit).map((e) => entryRow(e)));
  if (entries.length > limit) el.append(h('div', { class: 'empty small', text: `يُعرض ${F.num(limit)} من ${F.num(entries.length)}` }));
  return el;
}

export const signClass = (u) => (u > 0 ? 'pos' : u < 0 ? 'neg' : '');
