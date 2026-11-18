// شاشات العربية: العربيات، العربية (ملخص/الصيانة/الأعطال/التعديلات/السجل/التكاليف/الإعداد)، بند الصيانة، قائمة الزيارة.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, chips, empty, kv, list, row, sectionTitle, stat, table, toast } from '../../components.js';
import { entryList, entryRow, ui } from '../../widgets.js';
import { activeEntries, entity, listEntities } from '../../../core/engine.js';
import { CAR_STATUS, ENGINES, FUELS, GEARBOXES, PRIORITY, SEVERITY, SYSTEMS, TASK_KINDS, WORK_TYPES } from '../../../core/modules/car/config.js';
import { carCosts, carData, needsAction } from '../../../core/modules/car/calc.js';
import { personName } from '../../forms-common.js';
import { carForm, faultForm, historyForm, odometerForm, planForm, taskForm, workForm } from './forms.js';
import { PG, daysText, dueText, everyText, km, lastText, statusBadge } from './fmt.js';

const st = (label, value, o = {}) => stat(label, value, { pg: PG, ...o });
// إحصائية غير سرية (العداد، المشي): لا تخضع لإخفاء الأرصدة.
const plainStat = (label, value, { hint = '', cls = '', onclick = null } = {}) => h(onclick ? 'button' : 'div', { class: `stat ${cls}`, onclick }, h('div', { class: 'label', text: label }), h('div', { class: 'value num', text: value }), hint ? h('div', { class: 'hint', text: hint }) : null);
const info = (k, v) => kv(k, v, '', { secret: false });
const sevBadge = (f) => badge(f.severity === 'urgent' ? 'خطر' : f.severity === 'watch' ? 'مراقبة' : 'قريب', f.severity === 'urgent' ? 'bad' : f.severity === 'watch' ? 'info' : 'warn');

export function taskRow(carId, t) {
  return row({ title: t.name, subtitle: [dueText(t), everyText(t), lastText(t)].filter(Boolean).join(' · '), badge: statusBadge(t), cls: 'wrap', onclick: () => ctx.nav(`#/car/${carId}/task/${t.id}`) });
}

function faultRow(carId, f) {
  return row({
    title: f.title,
    subtitle: [SYSTEMS[f.system || 'other'], `ظهر ${F.date(f.date)}`, f.km ? km(f.km) : '', f.state === 'fixed' ? `اتصلح ${F.date(f.fixedBy.date)}` : f.state === 'closed' ? `اتقفل${f.closeNote ? `: ${f.closeNote}` : ''}` : '', f.note || ''].filter(Boolean).join(' · '),
    badge: f.state === 'open' ? sevBadge(f) : f.state === 'fixed' ? badge('اتصلح', 'ok') : badge('اتقفل'),
    cls: 'wrap',
    onclick: () => faultForm(carId, f),
  });
}

function planRow(carId, p) {
  return row({
    title: p.title,
    subtitle: [PRIORITY[p.priority || 'normal'], p.targetDate ? `يوم ${F.date(p.targetDate)}` : '', p.targetKm ? `عند ${km(p.targetKm)}` : '', p.state === 'done' ? `اتعمل ${F.date(p.doneBy.date)}` : '', p.note || ''].filter(Boolean).join(' · '),
    value: p.state === 'done' ? F.money(p.doneBy.amount || 0) : p.estimate ? F.money(p.estimate) : '',
    badge: p.state === 'planned' ? (p.priority === 'high' ? badge('مهم', 'warn') : null) : p.state === 'done' ? badge('اتعمل', 'ok') : badge('اتلغى'),
    cls: 'wrap',
    onclick: () => planForm(carId, p),
    pk: `car|plan`,
  });
}

export function carsScreen() {
  const cars = listEntities(ctx.state, 'car.vehicle');
  const today = ctx.today();
  const card = (c) => {
    const d = carData(ctx.state, c.id, today);
    const now = d.tasks.filter(needsAction).length;
    const soon = d.tasks.filter((t) => t.status === 'soon').length;
    return row({ title: `🚗 ${c.name}`, subtitle: [c.model, c.year ? F.num(String(c.year)) : '', d.kmNow !== null ? `${d.estimated ? '≈ ' : ''}${km(d.kmNow)}` : ''].filter(Boolean).join(' · '), badge: (c.status || 'active') !== 'active' ? badge(CAR_STATUS[c.status]) : now ? badge(`${F.num(now)} مطلوب`, 'bad') : soon ? badge(`${F.num(soon)} قريب`, 'warn') : badge('تمام', 'ok'), onclick: () => ctx.nav(`#/car/${c.id}`) });
  };
  return {
    title: 'العربية',
    subtitle: 'الصيانة والأعطال والتصليحات',
    body: h(
      'div',
      {},
      cars.length
        ? list(cars.map(card))
        : h(
            'div',
            { class: 'card' },
            h('p', { text: 'ضيف عربيتك: النوع والمحرك والفتيس والعداد الحالي. التطبيق هيعمل لها جدول صيانة دورية (بالكيلو وبالوقت أيهما أقرب)، ويفكّرك بالمواعيد، ويسجّل الأعطال والتصليحات وقطع الغيار والمبالغ ومين عملها، والتعديلات اللي ناوي تعملها.' }),
          ),
    ),
    fab: { label: 'عربية جديدة', onclick: () => carForm() },
  };
}

const TABS = [
  { value: 'summary', label: 'ملخص' },
  { value: 'schedule', label: 'الصيانة' },
  { value: 'faults', label: 'الأعطال' },
  { value: 'plans', label: 'التعديلات' },
  { value: 'log', label: 'السجل' },
  { value: 'costs', label: 'التكاليف' },
  { value: 'setup', label: 'الإعداد' },
];

export function carScreen({ id, tab }) {
  const car = entity(ctx.state, 'car.vehicle', id);
  if (!car) return { title: 'العربية غير موجودة', body: empty('العربية غير موجودة') };
  // رابط تذكير العداد (?read=1) يفتح نموذج العداد مرة واحدة.
  if (/[?&]read=1/.test(location.hash)) {
    history.replaceState(null, '', location.hash.replace(/\?read=1/, ''));
    setTimeout(() => odometerForm(id), 60);
  }
  const d = carData(ctx.state, id, ctx.today());
  const body = h('div', {});
  body.append(
    h(
      'div',
      { class: 'stats' },
      plainStat('العداد الآن', d.kmNow !== null ? `${d.estimated ? '≈ ' : ''}${km(d.kmNow)}` : '—', { cls: 'primary', hint: d.last ? (d.estimated ? `تقديري · آخر قراءة ${km(d.last.km)} من ${daysText(d.since)}` : `آخر قراءة ${F.date(d.last.date)}`) : 'سجّل العداد', onclick: () => odometerForm(id) }),
      plainStat('متوسط المشي', d.rate ? `${F.num(Math.round(d.rate.perDay * 30.44))} كم/شهر` : '—', { hint: d.rate ? (d.rate.source === 'readings' ? 'من قراءاتك' : 'تقديرك — هيتحسب من القراءات') : 'يتحسب بعد قراءتين بينهم أسبوعين' }),
    ),
    chips(TABS, tab, (v) => ctx.nav(`#/car/${id}/${v}`)),
  );
  const tabs = { summary: summaryTab, schedule: scheduleTab, faults: faultsTab, plans: plansTab, log: logTab, costs: costsTab, setup: setupTab };
  body.append((tabs[tab] || summaryTab)(car, d));
  const fab = { faults: { label: 'عطل', onclick: () => faultForm(id) }, plans: { label: 'تعديل', onclick: () => planForm(id) }, log: { label: 'صيانة / تصليح', onclick: () => workForm(id) }, schedule: { label: 'صيانة', onclick: () => workForm(id) } }[tab] || null;
  return { title: car.name, subtitle: [car.model, car.year ? F.num(String(car.year)) : '', (car.status || 'active') !== 'active' ? CAR_STATUS[car.status] : ''].filter(Boolean).join(' · '), body, fab };
}

function actions(id) {
  return h(
    'div',
    { class: 'actions' },
    h('button', { class: 'action primary', onclick: () => odometerForm(id) }, h('span', { class: 'emo', text: '📟' }), 'سجّل العداد'),
    h('button', { class: 'action', onclick: () => workForm(id) }, h('span', { class: 'emo', text: '🔧' }), 'صيانة / تصليح'),
    h('button', { class: 'action', onclick: () => faultForm(id) }, h('span', { class: 'emo', text: '⚠️' }), 'عطل'),
    h('button', { class: 'action', onclick: () => planForm(id) }, h('span', { class: 'emo', text: '✨' }), 'تعديل عاوزه'),
    h('button', { class: 'action', onclick: () => ctx.nav(`#/car/${id}/visit`) }, h('span', { class: 'emo', text: '📋' }), 'قائمة الزيارة'),
    h('button', { class: 'action', onclick: () => workForm(id, { type: 'history' }) }, h('span', { class: 'emo', text: '🕘' }), 'سجل سابق'),
    h('button', { class: 'action', onclick: () => ctx.nav(`#/car/${id}/costs`) }, h('span', { class: 'emo', text: '💰' }), 'التكاليف'),
  );
}

function summaryTab(car, d) {
  const id = car.id;
  const now = d.tasks.filter(needsAction);
  const soon = d.tasks.filter((t) => t.status === 'soon');
  const unknown = d.tasks.filter((t) => t.status === 'unknown' && !t.critical);
  const openFaults = d.faults.filter((f) => f.state === 'open');
  const planned = d.plans.filter((p) => p.state === 'planned');
  const licenseLeft = car.licenseExpiry ? Math.round((Date.parse(car.licenseExpiry) - Date.parse(ctx.today())) / 86400000) : null;
  return h(
    'div',
    {},
    actions(id),
    now.length ? h('div', { class: 'banner bad' }, h('span', { class: 'grow', text: `${F.num(now.length)} بند صيانة مطلوب الآن` }), h('button', { class: 'btn small', text: 'قائمة الزيارة', onclick: () => ctx.nav(`#/car/${id}/visit`) })) : null,
    unknown.length ? h('div', { class: 'banner info' }, h('span', { class: 'grow', text: `${F.num(unknown.length)} بند مش معروف آخر مرة اتعمل. لو فاكر سجّله «سجل سابق»، وإلا افحصه في أول زيارة.` }), h('button', { class: 'btn small', text: 'سجل سابق', onclick: () => workForm(id, { type: 'history' }) })) : null,
    licenseLeft !== null && licenseLeft <= 30 ? h('div', { class: 'banner bad', text: licenseLeft < 0 ? `الرخصة خلصت ${F.date(car.licenseExpiry)}` : `الرخصة بتخلص ${F.date(car.licenseExpiry)} (باقي ${daysText(licenseLeft)})` }) : null,
    now.length || soon.length ? sectionTitle('المطلوب والقريب', h('button', { class: 'link', text: 'كل الجدول', onclick: () => ctx.nav(`#/car/${id}/schedule`) })) : null,
    now.length || soon.length ? list([...now, ...soon].slice(0, 8).map((t) => taskRow(id, t))) : h('div', { class: 'card' }, h('p', { text: '✅ مفيش صيانة مطلوبة أو قريبة دلوقتي.' })),
    openFaults.length ? sectionTitle('أعطال مفتوحة', h('button', { class: 'link', text: 'الكل', onclick: () => ctx.nav(`#/car/${id}/faults`) })) : null,
    openFaults.length ? list(openFaults.map((f) => faultRow(id, f))) : null,
    planned.length ? sectionTitle('تعديلات مخططة', h('button', { class: 'link', text: 'الكل', onclick: () => ctx.nav(`#/car/${id}/plans`) })) : null,
    planned.length ? list(planned.slice(0, 3).map((p) => planRow(id, p))) : null,
    d.works.length ? sectionTitle('آخر الشغل', h('button', { class: 'link', text: 'السجل', onclick: () => ctx.nav(`#/car/${id}/log`) })) : null,
    d.works.length ? entryList(d.works.slice(0, 3)) : null,
  );
}

function scheduleTab(car, d) {
  const id = car.id;
  const groups = [
    ['مطلوب الآن', d.tasks.filter(needsAction)],
    ['قريب', d.tasks.filter((t) => t.status === 'soon')],
    ['مش معروف آخر مرة', d.tasks.filter((t) => t.status === 'unknown' && !t.critical)],
    ['تمام', d.tasks.filter((t) => t.status === 'ok')],
    ['موقوف', d.tasks.filter((t) => t.status === 'off')],
  ];
  return h(
    'div',
    {},
    h('p', { class: 'muted small', text: 'كل بند له موعد بالكيلو وبالوقت — أيهما أقرب. الكيلو الحالي تقديري من متوسط مشيك لحد ما تسجّل العداد. اضغط أي بند تشوف هو إيه وليه، وتاريخه، وتعدّل مدته.' }),
    h(
      'div',
      { class: 'btn-row' },
      h('button', { class: 'btn primary', text: 'قائمة الزيارة', onclick: () => ctx.nav(`#/car/${id}/visit`) }),
      h('button', { class: 'btn', text: 'سجل سابق', onclick: () => workForm(id, { type: 'history' }) }),
      h('button', { class: 'btn', text: '+ بند خاص', onclick: () => taskForm(id) }),
    ),
    groups.filter(([, ts]) => ts.length).map(([label, ts]) => [sectionTitle(`${label} (${F.num(ts.length)})`), list(ts.map((t) => taskRow(id, t)))]),
  );
}

function faultsTab(car, d) {
  const open = d.faults.filter((f) => f.state === 'open');
  const done = d.faults.filter((f) => f.state !== 'open');
  return h(
    'div',
    {},
    h('p', { class: 'muted small', text: 'سجّل أي عطل أول ما يظهر (حتى لو هتصلحه بعدين). لما يتصلح سجّل التصليح من العطل نفسه، فيتقفل لوحده ويتربط بالقطع والمبالغ.' }),
    sectionTitle(`مفتوحة (${F.num(open.length)})`),
    open.length ? list(open.map((f) => faultRow(car.id, f))) : empty('مفيش أعطال مفتوحة'),
    done.length ? sectionTitle(`اتصلحت أو اتقفلت (${F.num(done.length)})`) : null,
    done.length ? list(done.map((f) => faultRow(car.id, f))) : null,
  );
}

function plansTab(car, d) {
  const planned = d.plans.filter((p) => p.state === 'planned');
  const rest = d.plans.filter((p) => p.state !== 'planned');
  const est = planned.reduce((a, p) => a + (p.estimate || 0), 0);
  return h(
    'div',
    {},
    h('p', { class: 'muted small', text: 'الحاجات اللي عاوز تعدّلها أو تحسّنها في العربية: بأولوية وموعد (تاريخ أو عداد) وتكلفة تقديرية. التطبيق يفكّرك قبل الموعد، ولما تتعمل سجّلها من التعديل نفسه.' }),
    planned.length ? h('div', { class: 'stats' }, st('التكلفة التقديرية للمخطط', F.money(est), { cls: 'wide', hint: `${F.num(planned.length)} تعديل` })) : null,
    sectionTitle(`مخطط (${F.num(planned.length)})`),
    planned.length ? list(planned.map((p) => planRow(car.id, p))) : empty('مفيش تعديلات مخططة'),
    rest.length ? sectionTitle('اتعمل أو اتلغى') : null,
    rest.length ? list(rest.map((p) => planRow(car.id, p))) : null,
  );
}

function logTab(car, d) {
  const f = ui(`car-log:${car.id}`, { kind: 'all' });
  const entries = activeEntries(ctx.state, (e) => e.carId === car.id && (f.kind === 'all' || (f.kind === 'work' ? e.kind === 'car.work' : e.kind === 'car.odometer')));
  const voided = ctx.state.entries.filter((e) => e.voided && e.carId === car.id && e.kind.startsWith('car.'));
  entries.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : (b.km ?? 0) - (a.km ?? 0)));
  return h(
    'div',
    {},
    chips(
      [
        { value: 'all', label: 'الكل' },
        { value: 'work', label: 'الشغل' },
        { value: 'odometer', label: 'العداد' },
      ],
      f.kind,
      (v) => ((f.kind = v), ctx.refresh()),
    ),
    entryList(entries, { emptyText: 'لا يوجد سجل بعد' }),
    voided.length ? h('details', { class: 'card help' }, h('summary', { text: `ملغى أو معدَّل (${F.num(voided.length)})` }), entryList(voided)) : null,
  );
}

function costsTab(car, d) {
  const c = carCosts(ctx.state, car.id, ctx.today());
  const f = ui(`car-parts:${car.id}`, { q: '' });
  const types = Object.keys(WORK_TYPES).filter((t) => c.totals[t]);
  const search = h('input', { class: 'search', type: 'search', placeholder: 'دوّر على قطعة (مثلاً: تيل، مساعد)…', value: f.q, 'aria-label': 'بحث في القطع' });
  const box = h('div', {});
  const draw = () => {
    f.q = search.value.trim();
    const shown = c.parts.filter((p) => !f.q || `${p.name} ${p.note || ''}`.includes(f.q)).slice(0, 200);
    box.replaceChildren(
      shown.length
        ? list(
            shown.map((p) =>
              row({
                title: `${p.name}${p.note ? ` (${p.note})` : ''}`,
                subtitle: [p.dateUnknown ? 'تاريخ غير معروف' : F.date(p.date), p.km !== null ? km(p.km) : '', p.qty && p.price !== undefined ? `${F.qty(p.qty)} × ${F.money(p.price)}` : '', p.mechanicId ? personName(p.mechanicId) : '', p.place].filter(Boolean).join(' · '),
                value: F.money(p.amount),
                onclick: () => ctx.nav(`#/entry/${p.entryId}`),
                pk: 'car|part',
              }),
            ),
          )
        : empty(c.parts.length ? 'مفيش قطعة بالاسم ده' : 'لم تُسجَّل قطع غيار بعد'),
    );
  };
  search.addEventListener('input', draw);
  draw();
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'stats' },
      st('إجمالي المسجّل', F.money(c.totals.total), { cls: 'wide primary', hint: 'كل الصيانة والتصليحات والتعديلات' }),
      st('السنة دي', F.money(c.thisYear)),
      st('آخر 12 شهر', F.money(c.last12)),
      c.per1000 ? st('تكلفة كل 1000 كم', F.money(c.per1000.amount), { cls: 'wide', hint: `على ${km(c.per1000.dist)} من ${F.date(c.per1000.from)}` }) : null,
    ),
    c.byYear.length
      ? [
          sectionTitle('بالسنة والنوع'),
          table(
            [{ label: 'السنة' }, ...types.map((t) => ({ label: WORK_TYPES[t], num: true })), { label: 'الإجمالي', num: true }],
            c.byYear.map(([y, r]) => [F.num(y), ...types.map((t) => F.money(r[t])), F.money(r.total)]),
            { totalRow: ['الكل', ...types.map((t) => F.money(c.totals[t])), F.money(c.totals.total)], pg: PG },
          ),
          h('div', { class: 'card' }, kv('قطع غيار', F.money(c.split.parts), '', { pg: PG }), kv('مصنعية', F.money(c.split.labor), '', { pg: PG }), kv('مصاريف تانية', F.money(c.split.other), '', { pg: PG })),
        ]
      : empty('لم يُسجَّل شغل بمبالغ بعد'),
    c.mechanics.length
      ? [
          sectionTitle('الميكانيكية والورش'),
          table(
            [{ label: 'الاسم' }, { label: 'مرات', num: true }, { label: 'الإجمالي', num: true }, { label: 'آخر مرة' }],
            c.mechanics.map((m) => [personName(m.personId), F.num(m.count), F.money(m.total), m.last ? F.date(m.last) : '—']),
            { pg: PG },
          ),
        ]
      : null,
    sectionTitle('قطع الغيار'),
    search,
    box,
  );
}

function setupTab(car, d) {
  const id = car.id;
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'card' },
      info('النوع', [car.model, car.year ? F.num(String(car.year)) : ''].filter(Boolean).join(' ') || '—'),
      info('المحرك', ENGINES[car.engine || '1.5-8v']),
      info('الفتيس', GEARBOXES[car.gearbox || 'manual']),
      info('الوقود', FUELS[car.fuel || 'petrol']),
      info('تكييف / باور', `${car.ac !== false ? 'فيها تكييف' : 'بدون تكييف'} · ${car.powerSteering !== false ? 'باور' : 'بدون باور'}`),
      car.plate ? info('اللوحة', car.plate) : null,
      info('انتهاء الرخصة', car.licenseExpiry ? F.date(car.licenseExpiry) : 'لم يُحدد'),
      info('تسجيل العداد', `كل ${daysText(car.readEveryDays || 7)}`),
      car.kmPerMonth ? info('تقديرك للمشي الشهري', km(car.kmPerMonth)) : null,
      car.value ? kv('القيمة التقديرية', F.money(car.value), '', { pg: PG }) : null,
      info('الحالة', CAR_STATUS[car.status || 'active']),
      car.note ? info('ملاحظة', car.note) : null,
      h('button', { class: 'btn small', text: 'تعديل بيانات العربية', onclick: () => carForm(car) }),
    ),
    sectionTitle('جدول الصيانة', h('button', { class: 'link', text: '+ بند خاص', onclick: () => taskForm(id) })),
    h('p', { class: 'muted small', text: 'المدد المقترحة متحفظة لظروف مصر (حر وتراب وزحمة) ولعربية كيلومتراتها عالية. غيّر أي مدة حسب نصيحة الميكانيكي أو نوع الزيت اللي بتستخدمه، أو أوقف بند مش محتاجه.' }),
    list(
      [...d.tasks]
        .sort((a, b) => Object.keys(SYSTEMS).indexOf(a.group) - Object.keys(SYSTEMS).indexOf(b.group))
        .map((t) => row({ title: t.name, subtitle: [SYSTEMS[t.group], TASK_KINDS[t.kind], everyText(t)].filter(Boolean).join(' · '), badge: t.off ? badge('موقوف') : t.custom ? badge('خاص', 'info') : t.changed ? badge('معدَّل', 'info') : null, onclick: () => taskForm(id, t) })),
    ),
  );
}

// ---------- بند صيانة ----------
export function taskScreen({ id, taskId }) {
  const car = entity(ctx.state, 'car.vehicle', id);
  const d = car ? carData(ctx.state, id, ctx.today()) : null;
  const t = d?.tasks.find((x) => x.id === taskId);
  if (!t) return { title: 'غير موجود', body: empty('البند غير موجود في جدول العربية') };
  const pct = Math.min(1, t.progress || 0);
  return {
    title: t.name,
    subtitle: `${SYSTEMS[t.group]} · ${TASK_KINDS[t.kind]}`,
    body: h(
      'div',
      {},
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'kv' }, h('span', { class: 'k', text: 'الحالة' }), statusBadge(t)),
        info('المدة', everyText(t)),
        info('آخر مرة', t.last ? `${t.last.date ? F.date(t.last.date) : 'تاريخ غير معروف'}${t.last.km !== null ? ` · ${km(t.last.km)}` : ''}` : 'مش معروف'),
        t.dueKm || t.dueDate ? info('الموعد الجاي', [t.dueKm ? `عند ${km(t.dueKm)}` : '', t.dueDate ? `يوم ${F.date(t.dueDate)}` : ''].filter(Boolean).join(' أو ')) : null,
        info('المتبقي', dueText(t)),
        t.last && t.status !== 'off' ? h('div', { class: 'bars' }, h('div', { class: 'bar' }, h('span', { text: 'المستهلك من المدة' }), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: `${Math.round(pct * 100)}%`, background: t.status === 'due' ? 'var(--bad)' : t.status === 'soon' ? 'var(--warn)' : 'var(--primary)' } })), h('span', { text: F.pct(Math.min(t.progress, 9.99), 0) }))) : null,
      ),
      t.note || t.userNote ? h('div', { class: 'card' }, t.note ? h('p', { text: t.note }) : null, t.userNote ? h('p', { class: 'muted', text: `ملاحظتك: ${t.userNote}` }) : null) : null,
      h('button', { class: 'btn primary block', text: 'اتعمل ← سجّل', onclick: () => workForm(id, { type: 'service', tasks: [t.id] }) }),
      h(
        'div',
        { class: 'btn-row', style: { marginTop: '8px' } },
        h('button', { class: 'btn', text: 'آخر مرة (قديم)', onclick: () => historyForm(id, t) }),
        h('button', { class: 'btn', text: 'تعديل المدة', onclick: () => taskForm(id, t) }),
      ),
      sectionTitle(`السجل (${F.num(t.history.length)})`),
      t.history.length ? list(t.history.map((r) => entryRow(ctx.state.entryById.get(r.entryId)))) : empty('لم يُسجَّل بعد'),
    ),
  };
}

// ---------- قائمة الزيارة الجاية (للميكانيكي) ----------
export function visitScreen({ id }) {
  const car = entity(ctx.state, 'car.vehicle', id);
  if (!car) return { title: 'غير موجود', body: empty('العربية غير موجودة') };
  const d = carData(ctx.state, id, ctx.today());
  const now = d.tasks.filter(needsAction);
  const soon = d.tasks.filter((t) => t.status === 'soon');
  const unknown = d.tasks.filter((t) => t.status === 'unknown' && !t.critical);
  const faults = d.faults.filter((f) => f.state === 'open');
  const plans = d.plans.filter((p) => p.state === 'planned' && (p.priority === 'high' || p.targetDate || p.targetKm));
  const block = (label, items) => (items.length ? [sectionTitle(`${label} (${F.num(items.length)})`), h('div', { class: 'list' }, items.map((x) => h('div', { class: 'row visit-item' }, h('div', { class: 'main' }, h('div', { class: 'title wrap', text: x.title }), x.sub ? h('div', { class: 'subtitle wrap', text: x.sub }) : null))))] : null);
  const T = (ts) => ts.map((t) => ({ title: t.name, sub: [dueText(t), t.note].filter(Boolean).join(' — ') }));
  const sections = [
    ['مطلوب الآن', T(now)],
    ['قريب — ممكن يتعمل في نفس الزيارة', T(soon)],
    ['مش معروف آخر مرة — يتفحص', T(unknown)],
    ['أعطال', faults.map((f) => ({ title: `${f.title} (${SEVERITY[f.severity || 'soon']})`, sub: f.note || '' }))],
    ['تعديلات', plans.map((p) => ({ title: p.title, sub: p.note || '' }))],
  ];
  const text = () =>
    [`${car.name}${car.model ? ` — ${car.model}` : ''}${car.year ? ` ${car.year}` : ''} · العداد ${d.kmNow ?? '—'} كم`, ...sections.filter(([, it]) => it.length).flatMap(([label, it]) => ['', `${label}:`, ...it.map((x) => `- ${x.title}`)])].join('\n');
  return {
    title: 'قائمة الزيارة',
    subtitle: car.name,
    body: h(
      'div',
      {},
      h('p', { class: 'muted small', text: 'اعرضها على الميكانيكي أو ابعتها له. بعد الزيارة اضغط «سجّل الزيارة» وعلّم اللي اتعمل بس، واكتب القطع والمبالغ.' }),
      sections.flatMap(([label, items]) => block(label, items) || []),
      !sections.some(([, it]) => it.length) ? empty('مفيش حاجة مطلوبة دلوقتي ✅') : null,
      h(
        'div',
        { class: 'btn-row' },
        h('button', { class: 'btn primary', text: 'سجّل الزيارة', onclick: () => workForm(id, { type: 'service', tasks: now.map((t) => t.id) }) }),
        h('button', {
          class: 'btn',
          text: 'مشاركة كنص',
          onclick: async () => {
            const t = text();
            try {
              if (navigator.share) await navigator.share({ title: 'قائمة الزيارة', text: t });
              else {
                await navigator.clipboard.writeText(t);
                toast('اتنسخت');
              }
            } catch (e) {
              if (e?.name !== 'AbortError') toast('لم تتم المشاركة', 'bad');
            }
          },
        }),
      ),
    ),
  };
}

