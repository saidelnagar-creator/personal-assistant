// وحدة الأمانات في الواجهة: المسارات، ملخص القطاع، بطاقة الرئيسية، أمانات الشخص، تعديل الترجيع.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { list, row } from '../../components.js';
import { entity } from '../../../core/engine.js';
import { trustsOverview } from '../../../core/modules/trusts/calc.js';
import { PG } from '../money/fmt.js';
import { trustRow, trustScreen, trustsScreen, trustTitle } from './screens.js';
import { returnForm } from './forms.js';

const T = 'sectors';

export default {
  id: 'trusts',
  name: 'الأمانات',
  emoji: '🔐',
  href: '#/trusts',
  routes: [
    [/^\/trusts(?:\/(held|placed|done))?$/, (m) => trustsScreen({ tab: m[1] || 'held' }), T, PG],
    [/^\/trust\/([^/]+)$/, (m) => trustScreen({ id: m[1] }), T, PG],
  ],
  editEntry: (e) => (e.kind === 'trust.return' ? returnForm(e.trustId, e) : null),
  entrySubtitle: (e) => {
    const t = entity(ctx.state, 'trust', e.trustId);
    return t ? trustTitle(t) : '';
  },
  entryDetails: (e) => h('div', {}, e.receivedBy ? h('div', { class: 'card', text: `استلم: ${e.receivedBy}` }) : null, h('button', { class: 'btn small', text: 'افتح الأمانة', onclick: () => ctx.nav(`#/trust/${e.trustId}`) })),
  summary(state) {
    const o = trustsOverview(state, ctx.today());
    return o.held.length || o.placed.length ? `${F.num(o.held.length)} عندي · ${F.num(o.placed.length)} ليّ عند غيري` : 'ذهب وفلوس وورق: من مين، امتى، وفين';
  },
  homeRows(state) {
    const o = trustsOverview(state, ctx.today());
    if (!o.held.length && !o.placed.length) return [];
    return [row({ title: '🔐 الأمانات', subtitle: `${F.num(o.held.length)} عندي لغيري · ${F.num(o.placed.length)} أمانتي عند غيري`, pg: PG, onclick: () => ctx.nav('#/trusts') })];
  },
  personRows(state, personId) {
    const rows = trustsOverview(state, ctx.today()).rows.filter((d) => d.trust.personId === personId);
    return rows.length ? h('div', {}, list(rows.map(trustRow))) : null;
  },
};
