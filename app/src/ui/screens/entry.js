// تفاصيل أي قيد: البيانات، سجل التعديل/الإلغاء، وأزرار التعديل والإلغاء.
import { h } from '../dom.js';
import { ctx, F } from '../ctx.js';
import { badge, empty, kv, sectionTitle } from '../components.js';
import { describeEntry, ENTRY_KINDS } from '../../core/engine.js';
import { QTY } from '../../core/money.js';
import { UI_MODULES } from '../modules/index.js';
import { voidEntryFlow } from '../forms-common.js';
import { entryRow } from '../widgets.js';

export function entryScreen({ id }) {
  const e = ctx.state.entryById.get(id);
  if (!e) return { title: 'غير موجود', body: empty('القيد غير موجود') };
  const d = describeEntry(ctx.state, e);
  const mod = UI_MODULES.find((m) => ENTRY_KINDS.get(e.kind)?.module === m.id);
  const replaced = e.voided?.replacedBy ? ctx.state.entryById.get(e.voided.replacedBy) : null;
  const original = e.replaces ? ctx.state.entryById.get(e.replaces) : null;
  const cycle = e.cycleId ? ctx.state.entities.get('poultry.cycle')?.get(e.cycleId) : null;
  return {
    title: d.label,
    subtitle: cycle ? cycle.name : mod?.entrySubtitle?.(e) || '',
    body: h(
      'div',
      {},
      e.voided ? h('div', { class: 'banner bad', text: `ملغى ${F.date(e.voided.date || e.voided.ts.slice(0, 10))}: ${e.voided.reason}${replaced ? ' (حلّ محله قيد معدَّل)' : ''}` }) : null,
      h(
        'div',
        { class: 'card' },
        kv('البيان', d.title, '', { secret: false }),
        d.amount ? kv('المبلغ', F.money(d.amount), d.sign > 0 ? 'pos' : d.sign < 0 ? 'neg' : '', { pg: 'entries' }) : null,
        kv('التاريخ الفعلي', e.dateUnknown ? 'غير معروف' : F.date(e.date), '', { secret: false }),
        e.month ? kv('على حساب شهر', F.month(e.month), '', { secret: false }) : null,
        e.qty && e.kind.startsWith('poultry.') && e.kind !== 'poultry.count' ? kv('الكمية', F.qty(e.qty), '', { secret: false }) : null,
        e.weight ? kv('الوزن (كجم)', F.qty(e.weight), '', { secret: false }) : null,
        e.price ? kv('سعر الوحدة', F.money(e.price), '', { pg: 'entries' }) : null,
        e.capital ? kv('رأسمالي', 'نعم', '', { secret: false }) : null,
        e.noGuest ? kv('خاص بنا (بلا ضيف)', 'نعم', '', { secret: false }) : null,
        e.note ? kv('ملاحظة', e.note, '', { secret: false }) : null,
        kv('سُجّل في', F.dateTime(e.ts), '', { secret: false }),
        e.qty && e.kind === 'poultry.count' ? kv('العدد', F.num(e.qty / QTY), '', { secret: false }) : null,
      ),
      mod?.entryDetails?.(e) || null,
      original ? h('div', {}, sectionTitle('القيد الأصلي قبل التعديل'), entryRow(original)) : null,
      replaced ? h('div', {}, sectionTitle('القيد بعد التعديل'), entryRow(replaced)) : null,
      e.voided
        ? null
        : h(
            'div',
            { class: 'btn-row' },
            mod?.editEntry ? h('button', { class: 'btn primary', text: 'تعديل', onclick: () => mod.editEntry(e) }) : null,
            h('button', { class: 'btn danger', text: 'إلغاء القيد', onclick: async () => (await voidEntryFlow(e)) && ctx.refresh() }),
          ),
      e.replaces ? badge('هذا قيد معدَّل', 'info') : null,
    ),
  };
}
