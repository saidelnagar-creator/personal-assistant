// وحدة العربية في الواجهة: المسارات، بطاقة الرئيسية، ملخص القطاع، شغل الميكانيكي في شاشة الشخص، تفاصيل القيد وتعديله.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, kv, list, row, sectionTitle, table } from '../../components.js';
import { entryRow } from '../../widgets.js';
import { entity, listEntities } from '../../../core/engine.js';
import { WORK_TYPES } from '../../../core/modules/car/config.js';
import { carData, mechanicWorks, needsAction, taskName } from '../../../core/modules/car/calc.js';
import { personName } from '../../forms-common.js';
import { carScreen, carsScreen, taskScreen, visitScreen } from './screens.js';
import { editCarEntry } from './forms.js';
import { PG, km } from './fmt.js';

const T = 'sectors';
const active = (state) => listEntities(state, 'car.vehicle').filter((c) => (c.status || 'active') === 'active');

export default {
  id: 'car',
  name: 'العربية',
  emoji: '🚗',
  href: '#/car',
  routes: [
    [/^\/car$/, carsScreen, T, PG],
    [/^\/car\/([^/]+)(?:\/(summary|schedule|faults|plans|log|costs|setup))?$/, (m) => carScreen({ id: m[1], tab: m[2] || 'summary' }), T, PG],
    [/^\/car\/([^/]+)\/task\/([^/]+)$/, (m) => taskScreen({ id: m[1], taskId: m[2] }), T, PG],
    [/^\/car\/([^/]+)\/visit$/, (m) => visitScreen({ id: m[1] }), T, PG],
  ],
  editEntry: (e) => (e.kind.startsWith('car.') ? editCarEntry(e) : null),
  entrySubtitle: (e) => entity(ctx.state, 'car.vehicle', e.carId)?.name || '',
  // تفاصيل الشغل في شاشة القيد: البنود والأعطال والتعديلات والقطع والمصنعية.
  entryDetails(e) {
    if (e.kind !== 'car.work') return null;
    const s = ctx.state;
    const names = (ids, f) => (ids || []).map(f).filter(Boolean);
    const tasks = names(e.tasks, (id) => taskName(s, id));
    const faults = names(e.faultIds, (id) => entity(s, 'car.fault', id)?.title);
    const plans = names(e.planIds, (id) => entity(s, 'car.plan', id)?.title);
    const parts = e.parts || [];
    return h(
      'div',
      {},
      h(
        'div',
        { class: 'card' },
        kv('النوع', WORK_TYPES[e.type] || '', '', { secret: false }),
        Number.isSafeInteger(e.km) ? kv('العداد', km(e.km), '', { secret: false }) : null,
        e.title ? kv('الشغل', e.title, '', { secret: false }) : null,
        e.mechanicId ? kv('عمله', personName(e.mechanicId), '', { secret: false }) : null,
        e.place ? kv('المكان', e.place, '', { secret: false }) : null,
      ),
      tasks.length ? [sectionTitle('بنود الجدول'), list(tasks.map((t) => row({ title: `✓ ${t}` })))] : null,
      faults.length ? [sectionTitle('أعطال اتصلحت'), list(faults.map((t) => row({ title: `🔧 ${t}` })))] : null,
      plans.length ? [sectionTitle('تعديلات اتعملت'), list(plans.map((t) => row({ title: `✨ ${t}` })))] : null,
      parts.length
        ? [
            sectionTitle('قطع الغيار'),
            table(
              [{ label: 'القطعة' }, { label: 'الكمية', num: true }, { label: 'السعر', num: true }, { label: 'المبلغ', num: true }],
              parts.map((p) => [`${p.name}${p.note ? ` (${p.note})` : ''}`, p.qty ? F.qty(p.qty) : '', p.price !== undefined && p.qty ? F.money(p.price) : '', F.money(p.amount)]),
              { totalRow: ['القطع', '', '', F.money(parts.reduce((a, p) => a + p.amount, 0))], pg: PG },
            ),
          ]
        : null,
      e.labor || e.other ? h('div', { class: 'card' }, e.labor ? kv('المصنعية', F.money(e.labor), '', { pg: PG }) : null, e.other ? kv('مصاريف تانية', F.money(e.other), '', { pg: PG }) : null) : null,
    );
  },
  summary(state) {
    const cars = active(state);
    if (!cars.length) return 'الصيانة الدورية والأعطال والتصليحات';
    const n = cars.reduce((a, c) => a + carData(state, c.id, ctx.today()).tasks.filter(needsAction).length, 0);
    return `${F.num(cars.length)} عربية${n ? ` · ${F.num(n)} بند صيانة مطلوب` : ' · الصيانة تمام'}`;
  },
  homeRows(state) {
    return active(state).map((c) => {
      const d = carData(state, c.id, ctx.today());
      const now = d.tasks.filter(needsAction).length;
      const soon = d.tasks.filter((t) => t.status === 'soon').length;
      const open = d.faults.filter((f) => f.state === 'open').length;
      return row({
        title: `🚗 ${c.name}`,
        subtitle: [d.kmNow !== null ? `${d.estimated ? '≈ ' : ''}${km(d.kmNow)}` : '', now ? `${F.num(now)} مطلوب` : '', soon ? `${F.num(soon)} قريب` : '', open ? `${F.num(open)} عطل مفتوح` : '', !now && !soon && !open ? 'الصيانة تمام' : ''].filter(Boolean).join(' · '),
        badge: now ? badge('صيانة', 'bad') : soon ? badge('قريب', 'warn') : null,
        onclick: () => ctx.nav(`#/car/${c.id}`),
      });
    });
  },
  // في شاشة الشخص: الشغل اللي عمله في العربية (للميكانيكي أو الورشة).
  personRows(state, personId) {
    const works = mechanicWorks(state, personId);
    if (!works.length) return null;
    const total = works.reduce((a, w) => a + (w.amount || 0), 0);
    return h('div', {}, list(row({ title: `🔧 شغل في العربية (${F.num(works.length)} مرة)`, subtitle: `آخر مرة ${F.date(works[0].date)}`, value: F.money(total), pg: 'people' })), list(works.slice(0, 5).map((w) => entryRow(w))));
  },
};
