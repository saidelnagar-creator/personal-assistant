// التذكيرات: المحسوبة من القطاعات (مثل شهور التسوية المفتوحة) + تذكيرات يدوية بتكرار.
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, checkbox, dateInput, empty, errorBox, field, list, openSheet, row, sectionTitle, selectInput, textArea, textInput, toast } from '../components.js';
import { allReminders } from '../../core/overview.js';
import { listEntities } from '../../core/engine.js';
import { REPEATS } from '../../core/modules/common.js';
import { saveButton } from '../forms-common.js';
import { reminderRow } from './home.js';

export function reminderForm(item = null) {
  openSheet(item ? 'تعديل تذكير' : 'تذكير جديد', (body, close) => {
    const err = errorBox();
    const title = textInput(item?.title || '', 'مثال: تجديد ترخيص العربية');
    const date = dateInput(item?.date);
    const repeat = selectInput(Object.entries(REPEATS).map(([value, label]) => ({ value, label })), item?.repeat || 'none');
    const note = textArea(item?.note || '');
    const archived = checkbox('إيقاف هذا التذكير', !!item?.archived);
    body.append(
      err,
      field('العنوان', title),
      h('div', { class: 'grid2' }, field('أول موعد', date), field('التكرار', repeat)),
      field('ملاحظة', note),
      item ? archived : null,
      saveButton(
        'حفظ',
        async () => {
          await ctx.store.run((b) => b.upsert('reminder', { ...(item ? { id: item.id } : {}), title: title.value.trim(), date: date.value, repeat: repeat.value, note: note.value.trim() || undefined, archived: archived.input.checked || undefined }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

export function remindersScreen() {
  const rem = allReminders(ctx.state, ctx.today());
  const custom = listEntities(ctx.state, 'reminder', { archived: true });
  const body = h('div', {});
  if (rem.length)
    body.append(
      sectionTitle('المستحق والقادم'),
      list(
        rem.map((r) => {
          const el = reminderRow(r);
          if (r.custom) {
            const done = h('button', { class: 'btn small', text: 'تم', onclick: async (ev) => (ev.stopPropagation(), await ctx.store.run((b) => b.dispatch('reminder.done', { reminderId: r.reminderId, due: r.due })), toast('تم')) });
            el.querySelector('.end')?.append(done);
          }
          return el;
        }),
      ),
    );
  else body.append(empty('لا توجد تذكيرات مستحقة'));
  body.append(
    sectionTitle('تذكيراتي'),
    custom.length ? list(custom.map((r) => row({ title: r.title, subtitle: `${F.date(r.date)} · ${REPEATS[r.repeat || 'none']}${r.archived ? ' · موقوف' : ''}`, badge: r.archived ? badge('موقوف') : null, onclick: () => reminderForm(r) }))) : h('p', { class: 'muted small', text: 'أضف أي موعد متكرر (صيانة، تجديد، تحصيل إيجار…) ويظهر هنا وفي الرئيسية قبل موعده بـ30 يوماً.' }),
    h('p', { class: 'muted small', text: 'التذكيرات تظهر داخل التطبيق عند فتحه. الآيفون لا يسمح لتطبيق ويب بإشعار وهو مغلق بدون خادم؛ يمكن لاحقاً ربطها بتقويم Google.' }),
  );
  return { title: 'التذكيرات', body, fab: { label: 'تذكير', onclick: () => reminderForm() } };
}
