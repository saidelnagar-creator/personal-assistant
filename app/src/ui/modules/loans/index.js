// وحدة السلف في الواجهة: المسارات (والأسعار)، ملخص القطاع، بطاقة الرئيسية، سلف الشخص، تفاصيل القيود وتعديلها.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, kv, list, row } from '../../components.js';
import { entity } from '../../../core/engine.js';
import { unitInfo } from '../../../core/modules/money/units.js';
import { loansOverview, personLoans } from '../../../core/modules/loans/calc.js';
import { PG, egp, uq } from '../money/fmt.js';
import { priceForm, pricesScreen } from '../money/prices.js';
import { loanRow, loanScreen, loansScreen } from './screens.js';
import { drawForm, payForm } from './forms.js';

const T = 'sectors';

export default {
  id: 'loans',
  name: 'السلف',
  emoji: '🤝',
  href: '#/loans',
  routes: [
    [/^\/loans(?:\/(out|in|done))?$/, (m) => loansScreen({ tab: m[1] || 'out' }), T, PG],
    [/^\/loan\/([^/]+)$/, (m) => loanScreen({ id: m[1] }), T, PG],
    [/^\/prices$/, pricesScreen, 'more', PG],
  ],
  canEdit: (e) => e.kind !== 'loan.convert',
  editEntry: (e) => (e.kind === 'loan.draw' ? drawForm(e.loanId, e) : e.kind === 'loan.pay' ? payForm(e.loanId, e) : e.kind === 'money.price' ? priceForm(e) : null),
  entrySubtitle: (e) => {
    const l = entity(ctx.state, 'loan', e.loanId);
    return l ? `${l.dir === 'out' ? 'ليّ' : 'عليّ'} · ${unitInfo(l.unit).label}` : '';
  },
  entryDetails(e) {
    if (e.kind === 'money.price') return null;
    const l = entity(ctx.state, 'loan', e.loanId);
    if (!l) return null;
    return h(
      'div',
      { class: 'card' },
      e.given ? kv('اللي اتسلم فعلاً', `${uq(e.given.qty, e.given.unit)}${e.given.desc ? ` — ${e.given.desc}` : ''}`, '', { pg: PG, secret: true }) : null,
      e.desc ? kv('الوصف', e.desc, '', { secret: false }) : null,
      e.value ? kv('القيمة يومها', egp(e.value), '', { pg: PG }) : null,
      h('button', { class: 'btn small', text: 'افتح السلفة', onclick: () => ctx.nav(`#/loan/${l.id}`) }),
    );
  },
  summary(state) {
    const active = loansOverview(state, ctx.today()).rows.filter((d) => d.status === 'active' && !d.loan.archived);
    if (!active.length) return 'ليّ وعليّ: فلوس أو ذهب أو دولار، بميعاد أو أقساط';
    const n = (dir) => active.filter((d) => d.loan.dir === dir).length;
    const late = active.filter((d) => d.overdueQty).length;
    return [`${F.num(n('out'))} ليّ`, `${F.num(n('in'))} عليّ`, late ? `${F.num(late)} متأخر` : ''].filter(Boolean).join(' · ');
  },
  homeRows(state) {
    const { rows, totals } = loansOverview(state, ctx.today());
    const active = rows.filter((d) => d.status === 'active' && !d.loan.archived);
    if (!active.length) return [];
    const late = active.filter((d) => d.overdueQty).length;
    return [row({ title: '🤝 السلف', subtitle: `ليّ ${egp(totals.out)} · عليّ ${egp(totals.in)}`, value: egp(totals.out - totals.in), valueClass: totals.out - totals.in >= 0 ? 'pos' : 'neg', badge: late ? badge(`${F.num(late)} متأخر`, 'bad') : null, pg: PG, pk: `${PG}|home-loans`, onclick: () => ctx.nav('#/loans') })];
  },
  personRows(state, personId) {
    const rows = personLoans(state, personId, ctx.today());
    if (!rows.length) return null;
    return h('div', {}, list(rows.map(loanRow)));
  },
};
