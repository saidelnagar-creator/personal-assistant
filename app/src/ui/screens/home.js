// الرئيسية: التذكيرات، تنبيه النسخ الاحتياطي، القطاعات الشغالة، ولمحة من الوضع المالي.
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, list, row, sectionTitle, stat } from '../components.js';
import { allReminders, financeOverview } from '../../core/overview.js';
import { UI_MODULES } from '../modules/index.js';
import { APP_NAME } from '../../config/version.js';
import { signClass } from '../widgets.js';

const LEVEL = { overdue: ['متأخر', 'bad'], today: ['اليوم', 'warn'], upcoming: ['قادم', 'info'] };

export function reminderRow(r) {
  const [label, kind] = LEVEL[r.level];
  return row({ title: r.title, subtitle: [F.date(r.due), r.note].filter(Boolean).join(' · '), badge: badge(label, kind), onclick: () => ctx.nav(r.href || '#/reminders') });
}

export function homeScreen() {
  const store = ctx.store;
  const rem = allReminders(ctx.state, ctx.today());
  const urgent = rem.filter((r) => r.level !== 'upcoming');
  const fin = financeOverview(ctx.state);
  const unsaved = store.unsavedChanges();
  const body = h('div', {});
  if (store.backupDue())
    body.append(h('div', { class: 'banner bad' }, h('span', { class: 'grow', text: `${F.num(unsaved)} تغيير لم يُنسخ خارج الهاتف بعد.` }), h('button', { class: 'btn small', text: 'نسخ احتياطي', onclick: () => ctx.nav('#/backup') })));
  else if (unsaved) body.append(h('div', { class: 'muted small backup-hint', text: `${F.num(unsaved)} تغيير منذ آخر نسخة احتياطية` }));
  body.append(
    h(
      'div',
      { class: 'stats' },
      stat('صافي وضعي المالي', F.money(fin.net), { valueClass: signClass(fin.net), cls: 'primary', hint: `لي ${F.money(fin.assets)} · عليّ ${F.money(fin.liabilities)}`, onclick: () => ctx.nav('#/finance'), pg: 'home' }),
      stat('التذكيرات', F.num(urgent.length), { hint: rem.length > urgent.length ? `و${F.num(rem.length - urgent.length)} قادمة` : 'لا شيء قادم', onclick: () => ctx.nav('#/reminders'), pg: 'other' }),
    ),
  );
  if (rem.length) body.append(sectionTitle('مطلوب منك', h('button', { class: 'link', text: 'الكل', onclick: () => ctx.nav('#/reminders') })), list(rem.slice(0, 5).map(reminderRow)));
  const rows = UI_MODULES.flatMap((m) => (m.homeRows ? m.homeRows(ctx.state) : []));
  body.append(sectionTitle('الشغال الآن', h('button', { class: 'link', text: 'كل القطاعات', onclick: () => ctx.nav('#/sectors') })), rows.length ? list(rows) : h('div', { class: 'card' }, h('p', { text: 'ابدأ من «القطاعات» ← الدواجن ← دورة جديدة.' })));
  return { title: APP_NAME, subtitle: F.date(ctx.today()), root: true, body };
}
