// وحدة الدواجن في الواجهة: المسارات، بطاقة الرئيسية، ملخص القطاع، أرصدة الشخص، تحرير القيود.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { row, list } from '../../components.js';
import { listEntities } from '../../../core/engine.js';
import { cycleData } from '../../../core/modules/poultry/calc.js';
import { cyclesScreen, cycleScreen, monthScreen, periodScreen, cyclePersonScreen, farmsScreen } from './screens.js';
import { editPoultryEntry } from './forms.js';
import { signClass } from '../../widgets.js';

const T = 'sectors';
export default {
  id: 'poultry',
  name: 'الدواجن',
  emoji: '🐔',
  href: '#/poultry',
  routes: [
    [/^\/poultry$/, cyclesScreen, T, 'poultry'],
    [/^\/poultry\/farms$/, farmsScreen, T, 'poultry'],
    [/^\/poultry\/cycle\/([^/]+)(?:\/(summary|months|entries|partners|kpis|setup))?$/, (m) => cycleScreen({ id: m[1], tab: m[2] || 'summary' }), T, 'poultry'],
    [/^\/poultry\/cycle\/([^/]+)\/month\/(\d{4}-\d{2})$/, (m) => monthScreen({ id: m[1], month: m[2] }), T, 'poultry'],
    [/^\/poultry\/cycle\/([^/]+)\/period\/(\d{4}-\d{2})\/(\d{4}-\d{2})$/, (m) => periodScreen({ id: m[1], from: m[2], to: m[3] }), T, 'poultry'],
    [/^\/poultry\/cycle\/([^/]+)\/person\/([^/]+)(?:\/via\/([^/]+))?$/, (m) => cyclePersonScreen({ id: m[1], personId: m[2], head: m[3] || null }), T, 'poultry'],
  ],
  editEntry: (e) => (e.kind.startsWith('poultry.') ? editPoultryEntry(e) : null),
  summary(state) {
    const cycles = listEntities(state, 'poultry.cycle');
    const active = cycles.filter((c) => (c.status || 'active') === 'active');
    return `${F.num(active.length)} دورة شغالة${cycles.length > active.length ? ` · ${F.num(cycles.length - active.length)} سابقة` : ''}`;
  },
  // بطاقات الدورات الشغالة في الرئيسية.
  homeRows(state) {
    return listEntities(state, 'poultry.cycle')
      .filter((c) => (c.status || 'active') === 'active')
      .map((c) => {
        const d = cycleData(state, c.id);
        const me = d.people.get('me');
        const last = d.months.filter((r) => !r.pre && r.count).slice(-1)[0];
        return row({ title: `🐔 ${c.name}`, subtitle: last ? `${F.month(last.month)}: ${F.money(last.opNet)}` : 'لم تبدأ التسوية', value: me ? F.money(me.sideBalance) : '', valueClass: me ? signClass(me.sideBalance) : '', onclick: () => ctx.nav(`#/poultry/cycle/${c.id}`), pg: 'home', pk: `home|cycle:${c.id}` });
      });
  },
  // أرصدة شخص في كل الدورات (لشاشة الشخص).
  personRows(state, personId) {
    const out = [];
    for (const c of listEntities(state, 'poultry.cycle', { archived: true })) {
      const d = cycleData(state, c.id);
      const p = d?.people.get(personId);
      if (!p) continue;
      if (p.isTop || p.isGuest || p.personId === c.managerId) out.push(row({ title: `${c.name} — ناحيته عند المدير`, subtitle: p.personId === c.managerId ? 'المدير' : '', value: F.money(p.sideBalance), valueClass: signClass(p.sideBalance), onclick: () => ctx.nav(`#/poultry/cycle/${c.id}/person/${personId}`) }));
      for (const w of p.withHeads) out.push(row({ title: `${c.name} — حسابه مع رأسه`, subtitle: 'موجب: له عند رأسه', value: F.money(w.balance), valueClass: signClass(w.balance), onclick: () => ctx.nav(`#/poultry/cycle/${c.id}/person/${personId}/via/${w.head}`) }));
    }
    return out.length ? list(out) : null;
  },
};
export { h };
