// شاشات السلف: القائمة (ليّ / عليّ / خلصت) وتفاصيل السلفة (الباقي، القيمة وقتها ودلوقتي، جدول السداد، الحركات).
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, chips, empty, kv, list, row, sectionTitle, stat } from '../../components.js';
import { entryList, signClass } from '../../widgets.js';
import { entity } from '../../../core/engine.js';
import { PLAN_TYPES } from '../../../core/modules/money/config.js';
import { loanData, loansOverview } from '../../../core/modules/loans/calc.js';
import { personName } from '../../forms-common.js';
import { PG, egp, levelBadge, pricesLink, uq } from '../money/fmt.js';
import { staleBanner } from '../money/prices.js';
import { convertForm, drawForm, loanEditForm, loanForm, payForm, planForm } from './forms.js';

const st = (label, value, o = {}) => stat(label, value, { pg: PG, ...o });
const info = (k, v) => kv(k, v, '', { secret: false });

export const loanTitle = (loan) => `${loan.dir === 'out' ? 'سلفة' : 'سلفة من'} ${personName(loan.personId)}${loan.title ? ` — ${loan.title}` : ''}`;

// سطر الحالة: الميعاد الجاي أو المتأخر.
export function dueText(d) {
  const L = d.loan;
  if (d.status === 'converted') return 'اتحولت لنوع تاني';
  if (d.status === 'settled') return `خلصت${d.forgiven ? ' (فيها مسامحة)' : ''}`;
  if (d.status === 'empty') return 'فاضية';
  if (d.overdueQty) return `متأخر ${uq(d.overdueQty, L.unit, L.itemName)}${d.overdueCount > 1 ? ` (${F.num(d.overdueCount)} أقساط)` : ''}`;
  if (d.next) return `${d.schedule.length > 1 ? `القسط ${F.num(d.next.n)}` : 'السداد'} ${F.date(d.next.due)}: ${uq(d.next.remaining, L.unit, L.itemName)}`;
  return 'من غير ميعاد';
}

function statusBadge(d) {
  if (d.status === 'converted') return badge('اتحولت', 'info');
  if (d.status === 'settled') return badge('خلصت', 'ok');
  if (d.loan.archived) return badge('مؤرشفة');
  return d.overdueQty ? badge('متأخر', 'bad') : levelBadge(d.next?.state);
}

export function loanRow(d) {
  const L = d.loan;
  return row({
    title: loanTitle(L),
    subtitle: [d.status === 'active' ? `الباقي ${uq(d.balance, L.unit, L.itemName)}` : '', dueText(d)].filter(Boolean).join(' · '),
    value: d.status === 'active' ? (d.valueNow === null ? '—' : egp(d.valueNow)) : '',
    valueClass: L.dir === 'out' ? 'pos' : 'neg',
    badge: statusBadge(d),
    cls: 'wrap',
    pg: PG,
    pk: `${PG}|loan:${L.id}`,
    onclick: () => ctx.nav(`#/loan/${L.id}`),
  });
}

const TABS = [
  { value: 'out', label: 'ليّ عند الناس' },
  { value: 'in', label: 'عليّ للناس' },
  { value: 'done', label: 'خلصت' },
];

export function loansScreen({ tab = 'out' }) {
  const today = ctx.today();
  const { rows, totals } = loansOverview(ctx.state, today);
  const active = (dir) => rows.filter((d) => d.loan.dir === dir && d.status === 'active' && !d.loan.archived);
  const shown = tab === 'done' ? rows.filter((d) => d.status !== 'active' || d.loan.archived) : active(tab);
  const net = totals.out - totals.in;
  const body = h(
    'div',
    {},
    staleBanner(),
    h(
      'div',
      { class: 'stats' },
      st('ليّ عند الناس', egp(totals.out), { valueClass: 'pos', hint: `${F.num(active('out').length)} سلفة${totals.outUnpriced ? ` · ${F.num(totals.outUnpriced)} بدون سعر` : ''}`, onclick: () => ctx.nav('#/loans/out') }),
      st('عليّ للناس', egp(totals.in), { valueClass: 'neg', hint: `${F.num(active('in').length)} سلفة${totals.inUnpriced ? ` · ${F.num(totals.inUnpriced)} بدون سعر` : ''}`, onclick: () => ctx.nav('#/loans/in') }),
      st('الفرق', egp(net), { cls: 'wide', valueClass: signClass(net), hint: 'بالقيمة الحالية (الذهب والعملات بآخر سعر)' }),
    ),
    chips(TABS, tab, (v) => ctx.nav(`#/loans/${v}`)),
    sectionTitle(TABS.find((t) => t.value === tab).label, pricesLink()),
    shown.length ? list(shown.map(loanRow)) : empty(tab === 'done' ? 'مفيش سلف خلصت' : 'مفيش سلف هنا'),
    h('p', { class: 'muted small', text: 'السلفة: فلوس أو ذهب أو دولار أو أي حاجة، بتاريخ، وتتسدد مرة واحدة أو بأقساط أو من غير ميعاد. كل ما يرجع جزء سجّله ويتخصم من الباقي. ولو أخدت من نفس الشخص تاني: «زيادة» على نفس السلفة أو سلفة جديدة بميعادها.' }),
  );
  return { title: 'السلف', subtitle: 'ليّ وعليّ', body, fab: { label: 'سلفة', onclick: () => loanForm({ dir: tab === 'in' ? 'in' : 'out' }) } };
}

function actions(d) {
  const id = d.loan.id;
  if (d.status === 'converted') return null;
  const out = d.loan.dir === 'out';
  return h(
    'div',
    { class: 'actions' },
    d.status === 'active' ? h('button', { class: 'action primary', onclick: () => payForm(id) }, h('span', { class: 'emo', text: '💵' }), out ? 'رجعلي جزء' : 'سددت جزء') : null,
    h('button', { class: 'action', onclick: () => drawForm(id) }, h('span', { class: 'emo', text: '➕' }), 'زيادة'),
    d.status === 'active' ? h('button', { class: 'action', onclick: () => planForm(id) }, h('span', { class: 'emo', text: '📅' }), 'الميعاد / الجدول') : null,
    d.status === 'active' ? h('button', { class: 'action', onclick: () => convertForm(id) }, h('span', { class: 'emo', text: '🔁' }), 'تحويل لنوع تاني') : null,
    h('button', { class: 'action', onclick: () => loanEditForm(id) }, h('span', { class: 'emo', text: '✏️' }), 'البيانات'),
  );
}

const SCHED_BADGE = { paid: ['اتسدد', 'ok'], overdue: ['متأخر', 'bad'], today: ['النهارده', 'warn'], upcoming: ['قريب', 'warn'] };

export function loanScreen({ id }) {
  const d = loanData(ctx.state, id, ctx.today());
  if (!d) return { title: 'غير موجودة', body: empty('السلفة غير موجودة') };
  const L = d.loan;
  const U = (q) => uq(q, L.unit, L.itemName);
  const priced = d.unit.kind !== 'egp';
  const toLoan = d.conversion ? entity(ctx.state, 'loan', d.conversion.toLoanId) : null;
  const fromLoan = d.convertedFrom ? entity(ctx.state, 'loan', d.convertedFrom.loanId) : null;
  const body = h(
    'div',
    {},
    toLoan ? h('div', { class: 'banner info' }, h('span', { class: 'grow', text: `اتحولت يوم ${F.date(d.conversion.date)}: ${U(d.conversion.fromQty)} ← ${uq(d.conversion.toQty, toLoan.unit, toLoan.itemName)}` }), h('button', { class: 'btn small', text: 'السلفة الجديدة', onclick: () => ctx.nav(`#/loan/${toLoan.id}`) })) : null,
    fromLoan ? h('div', { class: 'banner info' }, h('span', { class: 'grow', text: `محوّلة من سلفة ${uq(d.convertedFrom.fromQty, fromLoan.unit, fromLoan.itemName)} يوم ${F.date(d.convertedFrom.date)}` }), h('button', { class: 'btn small', text: 'الأصلية', onclick: () => ctx.nav(`#/loan/${fromLoan.id}`) })) : null,
    d.status === 'active' && priced && d.valueBasis !== 'price' ? staleBanner() : null,
    h(
      'div',
      { class: 'stats' },
      st('الباقي', U(d.balance), { cls: 'primary wide', hint: `${L.dir === 'out' ? 'ليّ عنده' : 'عليّ له'} · ${dueText(d)}` }),
      priced ? st('قيمته دلوقتي', egp(d.valueNow), { hint: d.valueBasis === 'price' ? `بسعر ${F.money(d.price.price)} (${F.date(d.price.date)})` : d.valueBasis === 'then' ? 'بقيمته وقت السلف (مفيش سعر)' : 'اكتب السعر', onclick: d.unit.priceKey ? () => ctx.nav('#/prices') : null }) : null,
      priced ? st('قيمته وقت السلف', egp(d.valueThen), { hint: `لـ${U(d.drawn)}` }) : null,
      st(L.dir === 'out' ? 'اتسلف' : 'استلفت', U(d.drawn), { hint: d.firstDate ? `من ${F.date(d.firstDate)}` : '' }),
      st(L.dir === 'out' ? 'رجعلي' : 'سددت', U(d.paid), { hint: d.forgiven ? `+ مسامحة ${U(d.forgiven)}` : d.lastPay ? `آخر مرة ${F.date(d.lastPay.date)}` : '' }),
    ),
    actions(d),
  );
  if (d.schedule.length) {
    body.append(
      sectionTitle(d.schedule.length > 1 ? 'جدول الأقساط' : 'ميعاد السداد'),
      list(
        d.schedule.map((s) =>
          row({
            title: d.schedule.length > 1 ? `القسط ${F.num(s.n)} — ${F.date(s.due)}` : F.date(s.due),
            subtitle: s.partial ? `اتسدد ${U(s.paid)} · باقي ${U(s.remaining)}` : '',
            value: U(s.qty),
            badge: SCHED_BADGE[s.state] ? badge(...SCHED_BADGE[s.state]) : null,
            pg: PG,
            pk: `${PG}|loan-sched`,
          }),
        ),
      ),
    );
  }
  if (d.unscheduled) body.append(h('p', { class: 'muted small', text: `باقي ${U(d.unscheduled)} من غير ميعاد.` }));
  body.append(
    sectionTitle('التفاصيل'),
    h(
      'div',
      { class: 'card' },
      info('الشخص', personName(L.personId)),
      info('النوع', `${d.unit.label}${L.itemName ? ` — ${L.itemName}` : ''}`),
      info('السداد', d.status === 'active' ? PLAN_TYPES[L.plan?.type || 'open'] : dueText(d)),
      L.note ? info('ملاحظة', L.note) : null,
      h('button', { class: 'link', text: `كل حسابات ${personName(L.personId)}`, onclick: () => ctx.nav(`#/person/${L.personId}`) }),
    ),
    sectionTitle('الحركات'),
    entryList([...d.moves].reverse().map((m) => m.e)),
  );
  return { title: loanTitle(L), subtitle: `${L.dir === 'out' ? 'ليّ' : 'عليّ'} · ${d.unit.label}`, body };
}
