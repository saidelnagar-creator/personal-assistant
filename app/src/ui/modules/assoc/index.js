// وحدة الجمعيات في الواجهة: المسارات، ملخص القطاع، بطاقة الرئيسية، أسهم الشخص، تعديل القيود.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { list } from '../../components.js';
import { entity } from '../../../core/engine.js';
import { allAssocs, assocData, assocLabel } from '../../../core/modules/assoc/calc.js';
import { PG } from '../money/fmt.js';
import { assocRow, assocScreen, assocsScreen } from './screens.js';
import { installmentEditForm, payoutForm, transferForm } from './forms.js';

const T = 'sectors';
const active = (state) =>
  allAssocs(state)
    .map((a) => assocData(state, a.id, ctx.today()))
    .filter((d) => d.status !== 'done');

export default {
  id: 'assoc',
  name: 'الجمعيات',
  emoji: '🔄',
  href: '#/assoc',
  routes: [
    [/^\/assoc$/, assocsScreen, T, PG],
    [/^\/assoc\/([^/]+)(?:\/(summary|months|shares|log))?$/, (m) => assocScreen({ id: m[1], tab: m[2] || 'summary' }), T, PG],
  ],
  editEntry: (e) => (e.kind === 'assoc.pay' ? installmentEditForm(e) : e.kind === 'assoc.payout' ? payoutForm(e.assocId, { entry: e }) : e.kind === 'assoc.transfer' ? transferForm(e.assocId, e.shareId, e.dir, e) : null),
  entrySubtitle: (e) => assocLabel(entity(ctx.state, 'assoc', e.assocId)),
  entryDetails: (e) => h('button', { class: 'btn small', text: 'افتح الجمعية', onclick: () => ctx.nav(`#/assoc/${e.assocId}`) }),
  summary(state) {
    const ds = active(state);
    return ds.length ? `${F.num(ds.length)} جمعية شغالة` : 'القسط الشهري، الترتيب، ومواعيد القبض';
  },
  homeRows: (state) => active(state).map(assocRow),
  personRows(state, personId) {
    const ds = allAssocs(state, { archived: true })
      .map((a) => assocData(state, a.id, ctx.today()))
      .filter((d) => d.assoc.organizerId === personId || d.shares.some((s) => s.share.ownerId === personId));
    return ds.length ? h('div', {}, list(ds.map(assocRow))) : null;
  },
};
