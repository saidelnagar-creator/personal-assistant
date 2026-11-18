// شاشات الأمانات: القائمة (عندي لغيري / أمانتي عند غيري / رجعت) وتفاصيل الأمانة.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, chips, empty, kv, list, row, sectionTitle, stat } from '../../components.js';
import { entryList } from '../../widgets.js';
import { TRUST_DIRS } from '../../../core/modules/money/config.js';
import { itemText } from '../../../core/modules/trusts/index.js';
import { trustData, trustsOverview } from '../../../core/modules/trusts/calc.js';
import { personName } from '../../forms-common.js';
import { PG, egp, isoNum, pricesLink, rtl, uq } from '../money/fmt.js';
import { staleBanner } from '../money/prices.js';
import { returnForm, trustForm } from './forms.js';

const st = (label, value, o = {}) => stat(label, value, { pg: PG, ...o });
const info = (k, v) => kv(k, v, '', { secret: false });

export const trustTitle = (t) => (t.dir === 'placed' ? `أمانتي عند ${personName(t.personId)}` : `أمانة ${personName(t.personId)}`);
const summaryOf = (items) => {
  const names = items.map((x) => itemText(x, { count: x.type === 'money' ? null : x.remainingCount, amount: x.type === 'money' ? x.remainingAmount : null }));
  return names.length > 3 ? `${names.slice(0, 3).join('، ')} +${F.num(names.length - 3)}` : names.join('، ');
};

export function trustRow(d) {
  const t = d.trust;
  return row({
    title: trustTitle(t),
    subtitle: [summaryOf(d.status === 'returned' ? d.items : d.left), `من ${F.date(t.date)}`, t.place || '', t.dueDate && d.status !== 'returned' ? `ترجع ${F.date(t.dueDate)}` : ''].filter(Boolean).join(' · '),
    value: d.valueNow ? egp(d.valueNow) : '',
    badge: d.status === 'returned' ? badge('رجعت', 'ok') : d.status === 'partial' ? badge('رجع جزء', 'info') : t.archived ? badge('مؤرشفة') : null,
    cls: 'wrap',
    pg: PG,
    pk: `${PG}|trust:${t.id}`,
    onclick: () => ctx.nav(`#/trust/${t.id}`),
  });
}

const TABS = [
  { value: 'held', label: 'عندي لغيري' },
  { value: 'placed', label: 'أمانتي عند غيري' },
  { value: 'done', label: 'رجعت' },
];

export function trustsScreen({ tab = 'held' }) {
  const o = trustsOverview(ctx.state, ctx.today());
  const shown = tab === 'done' ? o.rows.filter((d) => d.status === 'returned' || d.trust.archived) : o[tab];
  const total = (ds) => ds.reduce((a, d) => a + d.valueNow, 0);
  return {
    title: 'الأمانات',
    body: h(
      'div',
      {},
      staleBanner(),
      h('div', { class: 'stats' }, st('عندي لغيري', egp(total(o.held)), { hint: `${F.num(o.held.length)} أمانة · مش داخلة في حسابي`, onclick: () => ctx.nav('#/trusts/held') }), st('أمانتي عند غيري', egp(total(o.placed)), { valueClass: 'pos', hint: `${F.num(o.placed.length)} أمانة`, onclick: () => ctx.nav('#/trusts/placed') })),
      chips(TABS, tab, (v) => ctx.nav(`#/trusts/${v}`)),
      sectionTitle(TABS.find((t) => t.value === tab).label, pricesLink()),
      shown.length ? list(shown.map(trustRow)) : empty('مفيش أمانات هنا'),
      h('p', { class: 'muted small', text: 'الأمانة: ذهب (غويشة، خاتم، سلسلة، سبيكة، جنيه ذهب… بالعيار والوزن أو بالوصف)، فلوس، ورق (عقد، قايمة، شيك…) أو أي حاجة — من مين واتحفظت امتى وفين. ولما ترجع كلها أو جزء سجّل «رجعت». القيمة بآخر أسعار الذهب والعملات.' }),
    ),
    fab: { label: 'أمانة', onclick: () => trustForm({ dir: tab === 'placed' ? 'placed' : 'held' }) },
  };
}

export function trustScreen({ id }) {
  const d = trustData(ctx.state, id, ctx.today());
  if (!d) return { title: 'غير موجودة', body: empty('الأمانة غير موجودة') };
  const t = d.trust;
  const gold = Object.entries(d.goldByKarat);
  const body = h(
    'div',
    {},
    d.left.some((x) => x.needsPrice) ? staleBanner() : null,
    h(
      'div',
      { class: 'stats' },
      st('قيمتها دلوقتي', egp(d.valueNow), { cls: 'primary', hint: d.unvalued ? `${F.num(d.unvalued)} حاجة بدون سعر أو وزن` : 'بآخر الأسعار' }),
      gold.length ? st('الذهب الباقي (وزن)', rtl(gold.map(([k, w]) => `${isoNum(F.qty(w))} جم${k === '0' ? '' : ` عيار ${isoNum(F.num(Number(k)))}`}`).join(' + '))) : null,
    ),
    d.status !== 'returned'
      ? h(
          'div',
          { class: 'actions' },
          h('button', { class: 'action primary', onclick: () => returnForm(id) }, h('span', { class: 'emo', text: '↩️' }), t.dir === 'placed' ? 'استرجعت' : 'رجّعت'),
          h('button', { class: 'action', onclick: () => trustForm({ trust: t }) }, h('span', { class: 'emo', text: '✏️' }), 'تعديل / إضافة حاجات'),
        )
      : h('div', { class: 'banner info', text: `رجعت كلها ${d.lastReturn ? F.date(d.lastReturn.date) : ''}` }),
    sectionTitle('الحاجات'),
    list(
      d.items.map((x) =>
        row({
          title: itemText(x),
          subtitle: x.done ? 'رجعت' : x.type === 'money' ? (x.returnedAmount ? `رجع ${uq(x.returnedAmount, x.unit || 'EGP')} · باقي ${uq(x.remainingAmount, x.unit || 'EGP')}` : '') : x.returnedCount ? `رجع ${F.num(x.returnedCount)} · باقي ${F.num(x.remainingCount)}` : '',
          value: x.value ? egp(x.value) : '',
          badge: x.done ? badge('رجعت', 'ok') : null,
          cls: 'wrap',
          pg: PG,
          pk: `${PG}|trust-item`,
        }),
      ),
    ),
    sectionTitle('التفاصيل'),
    h('div', { class: 'card' }, info('النوع', TRUST_DIRS[t.dir]), info(t.dir === 'placed' ? 'عند' : 'صاحبها', personName(t.personId)), info('اتحفظت', F.date(t.date)), t.place ? info('المكان', t.place) : null, t.dueDate ? info('ميعاد الرجوع', F.date(t.dueDate)) : null, t.note ? info('ملاحظة', t.note) : null),
    d.returns.length ? [sectionTitle('الترجيع'), entryList([...d.returns].reverse())] : null,
  );
  return { title: trustTitle(t), subtitle: TRUST_DIRS[t.dir], body };
}
