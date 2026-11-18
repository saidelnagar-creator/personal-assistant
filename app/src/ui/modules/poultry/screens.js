// شاشات الدواجن: الدورات، الدورة (ملخص/الشهور/الحركات/الشركاء/المؤشرات/الإعداد)، الشهر، كشف شريك.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, chips, empty, kv, list, monthSelect, row, sectionTitle, stat, table } from '../../components.js';
import { entryList, signClass, ui } from '../../widgets.js';
import { entity, listEntities } from '../../../core/engine.js';
import { QTY } from '../../../core/money.js';
import { addMonths } from '../../../core/util.js';
import { CYCLE_STATUS, PRODUCTS, EGGS_PER_TRAY } from '../../../core/modules/poultry/config.js';
import { aggregateMonths, cycleData, monthKpis, periodStats, personStatement } from '../../../core/modules/poultry/calc.js';
import { countForm, cycleForm, expenseForm, guestForm, logForm, monthBatchForm, paymentForm, saleForm, sharesForm, toggleMonthClose } from './forms.js';
import { personName } from '../../forms-common.js';

const PG = 'poultry';
const st = (label, value, o = {}) => stat(label, value, { pg: PG, ...o });
const statusBadge = (c) => badge(CYCLE_STATUS[c.status || 'active'], c.status === 'closed' ? '' : c.status === 'sold' ? 'warn' : 'ok');
const trays = (u) => `${F.qty(u, { decimals: 0 })} طبق`;
const perTray = (u) => (u === null ? '—' : `${F.money(u, { decimals: 2 })} ج/طبق`);

export function cyclesScreen() {
  const cycles = listEntities(ctx.state, 'poultry.cycle').sort((a, b) => b.startDate.localeCompare(a.startDate));
  const active = cycles.filter((c) => (c.status || 'active') === 'active');
  const other = cycles.filter((c) => (c.status || 'active') !== 'active');
  const card = (c) => {
    const d = cycleData(ctx.state, c.id);
    const me = d.people.get('me');
    const last = d.months.filter((r) => !r.pre && r.count).slice(-1)[0];
    return row({
      title: c.name,
      subtitle: [F.date(c.startDate), `${F.num(c.birds || 0)} طائر`, `عمر ${F.num(Math.floor(d.ageDays / 7))} أسبوع`, last ? `${F.month(last.month)}: ${F.money(last.opNet)}` : 'لم تبدأ التسوية'].join(' · '),
      value: me ? F.money(me.sideBalance) : '',
      valueClass: me ? signClass(me.sideBalance) : '',
      badge: statusBadge(c),
      onclick: () => ctx.nav(`#/poultry/cycle/${c.id}`),
      pk: `poultry|cycle:${c.id}`,
    });
  };
  return {
    title: 'الدواجن',
    subtitle: 'دورات إنتاج البيض',
    body: h(
      'div',
      {},
      !cycles.length ? h('div', { class: 'card' }, h('p', { text: 'ابدأ بإضافة أول دورة: اسمها، تاريخ بدايتها، عدد الطيور وعمرها، ثم حصص الشركاء.' })) : null,
      active.length ? sectionTitle('الدورات الشغالة') : null,
      active.length ? list(active.map(card)) : null,
      other.length ? sectionTitle('دورات سابقة') : null,
      other.length ? list(other.map(card)) : null,
      h('p', { class: 'muted small', text: 'الرقم بجانب كل دورة = رصيد ناحيتك عند المدير (موجب: لك، سالب: عليك).' }),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', text: 'المزارع', onclick: () => ctx.nav('#/poultry/farms') })),
    ),
    fab: { label: 'دورة جديدة', onclick: () => cycleForm() },
  };
}

export function farmsScreen() {
  const farms = listEntities(ctx.state, 'poultry.farm', { archived: true });
  return {
    title: 'المزارع',
    body: h('div', {}, farms.length ? list(farms.map((f) => row({ title: f.name, subtitle: f.archived ? 'مؤرشفة' : f.note || '', onclick: () => import('../../forms-common.js').then((m) => m.simpleEntityForm('poultry.farm', 'مزرعة', f)) }))) : empty('لا توجد مزارع')),
    fab: { label: 'مزرعة', onclick: () => import('../../forms-common.js').then((m) => m.simpleEntityForm('poultry.farm', 'مزرعة')) },
  };
}

const TABS = [
  { value: 'summary', label: 'ملخص' },
  { value: 'months', label: 'الشهور' },
  { value: 'entries', label: 'الحركات' },
  { value: 'partners', label: 'الشركاء' },
  { value: 'kpis', label: 'المؤشرات' },
  { value: 'setup', label: 'الإعداد' },
];

function actions(c, month = null) {
  return h(
    'div',
    { class: 'actions' },
    h('button', { class: 'action primary', onclick: () => monthBatchForm(c.id, { month }) }, h('span', { class: 'emo', text: '🗓️' }), 'إدخال شهر'),
    h('button', { class: 'action', onclick: () => saleForm(c.id, { month }) }, h('span', { class: 'emo', text: '🥚' }), 'بيع'),
    h('button', { class: 'action', onclick: () => expenseForm(c.id, { month }) }, h('span', { class: 'emo', text: '🧾' }), 'مصروف'),
    h('button', { class: 'action', onclick: () => paymentForm(c.id) }, h('span', { class: 'emo', text: '💵' }), 'دفعة'),
    h('button', { class: 'action', onclick: () => logForm(c.id, { month }) }, h('span', { class: 'emo', text: '🐔' }), 'نافق/إنتاج'),
    h('button', { class: 'action', onclick: () => countForm(c.id) }, h('span', { class: 'emo', text: '📋' }), 'جرد'),
  );
}

export function cycleScreen({ id, tab }) {
  const c = entity(ctx.state, 'poultry.cycle', id);
  if (!c) return { title: 'الدورة غير موجودة', body: empty('الدورة غير موجودة') };
  const d = cycleData(ctx.state, id);
  const me = d.people.get('me');
  const body = h('div', {});
  body.append(
    h(
      'div',
      { class: 'stats' },
      st('رصيد ناحيتي عند المدير', me ? F.money(me.sideBalance) : '—', { valueClass: me ? signClass(me.sideBalance) : '', hint: me ? (me.sideBalance >= 0 ? 'لك' : 'عليك') : 'لست شريكاً', cls: 'primary', onclick: () => ctx.nav(`#/poultry/cycle/${id}/person/me`) }),
      st('صافي الدورة حتى الآن', F.money(d.totals.net), { valueClass: signClass(d.totals.net), hint: `رأس مال ${F.money(-d.totals.capNet)}` }),
    ),
    chips(TABS, tab, (v) => ctx.nav(`#/poultry/cycle/${id}/${v}`)),
  );
  const tabs = { summary: summaryTab, months: monthsTab, entries: entriesTab, partners: partnersTab, kpis: kpisTab, setup: setupTab };
  body.append((tabs[tab] || summaryTab)(c, d));
  return { title: c.name, subtitle: [CYCLE_STATUS[c.status || 'active'], c.breed].filter(Boolean).join(' · '), body };
}

function summaryTab(c, d) {
  const k = d.kpis;
  const last = d.cashChecks[d.cashChecks.length - 1];
  const activeGuest = d.guests.length ? d.guests[d.guests.length - 1] : null;
  return h(
    'div',
    {},
    actions(c),
    d.unallocated ? h('div', { class: 'banner bad', text: 'توجد شهور بلا حصص شركاء — أضف الحصص من تبويب الشركاء.' }) : null,
    !d.shares.length ? h('div', { class: 'banner info' }, h('span', { class: 'grow', text: 'لم تُسجل حصص الشركاء بعد.' }), h('button', { class: 'btn small', text: 'إضافة الحصص', onclick: () => sharesForm(c.id) })) : null,
    !c.settleFrom ? h('div', { class: 'banner info', text: 'كل القيود الآن «تأسيس وتربية». عند بدء البيع حدّد «أول شهر في التسوية» من تبويب الإعداد.' }) : null,
    sectionTitle('الدورة'),
    h(
      'div',
      { class: 'card' },
      kv('البداية', F.date(c.startDate), '', { secret: false }),
      kv('مدة الدورة', `${F.num(d.days)} يوم`, '', { secret: false }),
      kv('عمر الطيور الآن', `${F.num(Math.floor(d.ageDays / 7))} أسبوع (${F.num(d.ageDays)} يوم)`, '', { secret: false }),
      kv('عدد الطيور', `${F.num(c.birds || 0)} عند الشراء · ${F.num(d.birds.now)} الآن تقريباً`, '', { secret: false }),
      c.layStart ? kv('البشاير', F.date(c.layStart), '', { secret: false }) : null,
      kv('أول شهر تسوية', c.settleFrom ? F.month(c.settleFrom) : 'لم يبدأ', '', { secret: false }),
      kv('المدير', c.managerId ? personName(c.managerId) : '—', '', { secret: false }),
      activeGuest ? kv('تربية مشتركة', activeGuest.guestBirds ? `${personName(activeGuest.personId)}: ${F.num(activeGuest.guestBirds)} من ${F.num(activeGuest.totalBirds)}` : `${personName(activeGuest.personId)} أخذ طيوره ${F.date(activeGuest.date)}`, '', { secret: false }) : null,
    ),
    sectionTitle('النتيجة'),
    h(
      'div',
      { class: 'card' },
      kv('تأسيس وتربية (رأس مال)', F.money(d.totals.capExpenses), '', { pg: PG }),
      d.totals.capRevenue ? kv('مبيعات أثناء التربية', F.money(d.totals.capRevenue), 'pos', { pg: PG }) : null,
      d.totals.guestCost ? kv('ما تحمّله الضيف', F.money(d.totals.guestCost), '', { pg: PG }) : null,
      d.totals.lay.months ? kv(`فترة البشاير (${periodLabel(d.totals.lay.from, d.totals.lay.to)})`, F.money(d.totals.lay.net), signClass(d.totals.lay.net), { pg: PG }) : null,
      kv('مبيعات الشهور المنتظمة', F.money(d.totals.regular.revenue), 'pos', { pg: PG }),
      kv('مصروفات الشهور المنتظمة', F.money(d.totals.regular.expenses + d.totals.regular.capExpenses), 'neg', { pg: PG }),
      kv('ربح الشهور المنتظمة', F.money(d.totals.regular.net), signClass(d.totals.regular.net), { pg: PG }),
      kv('صافي الدورة (بعد رأس المال)', F.money(d.totals.net), signClass(d.totals.net), { pg: PG }),
      kv('متوسط ربح الشهر المنتظم', k.avgMonthlyNet === null ? '—' : F.money(k.avgMonthlyNet), '', { pg: PG }),
      ...((c.status || 'active') === 'active'
        ? [
            k.monthlyReturn !== null ? kv('عائد الشهر على رأس المال', `${F.pct(k.monthlyReturn)} شهرياً · ${F.pct(k.monthlyReturn * 12)} سنوياً`, '', { pg: PG, secret: true }) : null,
            k.toRecover ? kv('المتبقي لاسترداد رأس المال', `${F.money(k.toRecover)}${k.monthsToRecover ? ` (~${F.num(Math.ceil(k.monthsToRecover))} شهر بالمتوسط، قبل بيع القطيع)` : ''}`, '', { pg: PG }) : null,
          ]
        : [kv('العائد على رأس المال (الدورة كاملة)', F.pct(k.roi), '', { pg: PG, secret: true }), k.annualRoi !== null ? kv('العائد السنوي', F.pct(k.annualRoi), '', { pg: PG, secret: true }) : null]),
      kv('نقطة الاتزان (أول شهر بيع ≥ تشغيل)', k.breakEven ? F.month(k.breakEven) : 'لم تصل', '', { secret: false }),
      kv('استرداد رأس المال', k.payback ? F.month(k.payback) : 'لم يُسترد بعد', '', { secret: false }),
    ),
    sectionTitle('النقدية مع المدير'),
    h(
      'div',
      { class: 'card' },
      kv('المفروض معه (محسوب)', F.money(d.cash.pool), '', { pg: PG }),
      last ? kv(`آخر جرد ${F.date(last.date)}`, `${F.money(last.reported)} (الفرق ${F.money(last.diff, { sign: true })})`, signClass(last.diff), { pg: PG }) : null,
      h('div', { class: 'muted small', text: 'المحسوب = الدفعات للدورة − المستلم منها + المبيعات − المصروفات. سالب يعني أن المدير غطّى العجز من عنده.' }),
    ),
    recentMonths(c, d),
  );
}

const periodLabel = (from, to) => (from === to ? F.month(from) : `${F.monthShort(from)} – ${F.month(to)}`);

function recentMonths(c, d) {
  const rows = d.months.filter((r) => r.phase === 'regular' && r.count).slice(-4).reverse();
  if (!rows.length) return null;
  return h('div', {}, sectionTitle('آخر الشهور', h('button', { class: 'link', text: 'كل الشهور', onclick: () => ctx.nav(`#/poultry/cycle/${c.id}/months`) })), monthsList(c, rows));
}

const sideOf = (r) => r.alloc.filter((a) => a.personId === 'me' || a.via === 'me').reduce((s, a) => s + a.op + a.cap, 0);

function monthRow(c, r) {
  const mine = sideOf(r);
  return row({
    title: F.month(r.month),
    subtitle: `مبيعات ${F.money(r.sales)} · مصروفات ${F.money(r.expensesOurs)}${r.alloc.length ? ` · ناحيتي ${F.money(mine)}` : ''}`,
    value: F.money(r.opNet + r.capNet),
    valueClass: signClass(r.opNet + r.capNet),
    badge: r.closed ? badge('مقفول', 'ok') : r.count ? null : badge('فارغ'),
    onclick: () => ctx.nav(`#/poultry/cycle/${c.id}/month/${r.month}`),
    pk: `poultry|month`,
  });
}

// فترة (تأسيس أو بشاير) كسطر واحد يفتح شاشة الفترة.
function periodRow(c, rows, title) {
  const a = aggregateMonths(rows);
  return row({
    title: `${title} (${periodLabel(a.from, a.to)})`,
    subtitle: `مبيعات ${F.money(a.sales)} · مصروفات ${F.money(a.expensesOurs)}${a.alloc.length ? ` · ناحيتي ${F.money(sideOf(a))}` : ''}`,
    value: F.money(a.opNet + a.capNet),
    valueClass: signClass(a.opNet + a.capNet),
    badge: a.closed ? badge('مقفول', 'ok') : null,
    onclick: () => ctx.nav(`#/poultry/cycle/${c.id}/period/${a.from}/${a.to}`),
    pk: `poultry|period`,
  });
}

function monthsList(c, rows) {
  return list(rows.map((r) => monthRow(c, r)));
}

function monthsTab(c, d) {
  const regular = d.months.filter((r) => r.phase === 'regular').reverse();
  const lay = d.months.filter((r) => r.phase === 'lay');
  const rearing = d.months.filter((r) => r.phase === 'rearing');
  const items = [...regular.map((r) => monthRow(c, r))];
  if (lay.length) items.push(periodRow(c, lay, '🐣 فترة البشاير'));
  if (rearing.length) items.push(periodRow(c, rearing, '🏗️ التأسيس والتربية'));
  return h(
    'div',
    {},
    h('p', { class: 'muted small', text: 'كل شهر بحسب «شهر الحساب». فترة البشاير (من أول البيض حتى انتظام الإنتاج) والتأسيس يظهر كل منهما ككتلة واحدة. اضغط لتفاصيله وإقفاله بعد التحاسب.' }),
    items.length ? list(items) : empty('لا توجد قيود بعد'),
  );
}

function entriesTab(c, d) {
  const f = ui(`poultry-entries-${c.id}`, { kind: 'all', month: '' });
  const kinds = [
    { value: 'all', label: 'الكل' },
    { value: 'poultry.sale', label: 'بيع' },
    { value: 'poultry.expense', label: 'مصروف' },
    { value: 'poultry.payment', label: 'دفعات' },
    { value: 'other', label: 'أخرى' },
  ];
  const all = ctx.state.entries.filter((e) => e.cycleId === c.id);
  const shown = all
    .filter((e) => (f.kind === 'all' ? true : f.kind === 'other' ? !['poultry.sale', 'poultry.expense', 'poultry.payment'].includes(e.kind) : e.kind === f.kind))
    .filter((e) => !f.month || e.month === f.month || (!e.month && e.date.slice(0, 7) === f.month))
    .sort((a, b) => b.date.localeCompare(a.date) || b.ts.localeCompare(a.ts));
  const months = [...new Set(all.map((e) => e.month || e.date.slice(0, 7)))].sort().reverse();
  const msel = h('select', { 'aria-label': 'الشهر' }, h('option', { value: '', text: 'كل الشهور' }), months.map((m) => h('option', { value: m, text: F.month(m) })));
  msel.value = f.month;
  msel.addEventListener('change', () => ((f.month = msel.value), ctx.refresh()));
  return h('div', {}, chips(kinds, f.kind, (v) => ((f.kind = v), ctx.refresh())), h('div', { class: 'field' }, msel), entryList(shown));
}

function partnersTab(c, d) {
  const out = h('div', {});
  const cur = d.currentShares;
  out.append(
    h('div', { class: 'btn-row' }, h('button', { class: 'btn small', text: cur ? 'تغيير الحصص' : 'إضافة الحصص', onclick: () => sharesForm(c.id) }), h('button', { class: 'btn small', text: '+ دفعة', onclick: () => paymentForm(c.id) })),
  );
  if (!cur) {
    out.append(empty('لم تُسجل حصص بعد'));
    return out;
  }
  out.append(
    sectionTitle(`الحصص الحالية (من ${F.month(cur.from)})`),
    list(cur.stakes.map((s) => row({ title: personName(s.personId), subtitle: s.via ? `تابع لـ ${personName(s.via)}` : s.personId === c.managerId ? 'شريك مباشر · المدير' : 'شريك مباشر', value: F.share(s), pk: `poultry|share`, pg: 'other' }))),
  );
  const tops = [...d.people.values()].filter((p) => p.isTop || p.isGuest || p.personId === c.managerId);
  out.append(
    sectionTitle('حسابات النواحي مع المدير'),
    list(
      tops.map((p) =>
        row({
          title: personName(p.personId) + (p.personId === c.managerId ? ' (المدير)' : '') + (p.isGuest ? ' (ضيف)' : ''),
          subtitle: p.personId === c.managerId ? 'حسابه يُعتبر مسوّى دائماً: أي عجز أو زيادة في النقدية عليه' : `دفع ${F.money(p.paidCycle)} · استلم ${F.money(p.receivedCycle)} · النتائج ${F.money(p.topResults + p.subsResults)}${p.guestCost ? ` · ضيف ${F.money(-p.guestCost)}` : ''}`,
          value: F.money(p.sideBalance),
          valueClass: signClass(p.sideBalance),
          onclick: () => ctx.nav(`#/poultry/cycle/${c.id}/person/${p.personId}`),
          pk: `poultry|side:${p.personId}`,
        }),
      ),
    ),
    h('div', { class: 'muted small', text: 'الرصيد = ما تدين به الدورة لهذه الناحية (موجب) أو ما عليها (سالب).' }),
  );
  for (const head of tops) {
    if (!head.subAccounts.length) continue;
    out.append(
      sectionTitle(`شركاء ${personName(head.personId)} التابعون`),
      list(
        head.subAccounts.map((s) =>
          row({
            title: personName(s.personId),
            subtitle: `دفع ${F.money(s.paid)} · استلم ${F.money(s.received)} · نصيبه ${F.money(s.results)}`,
            value: F.money(s.balance),
            valueClass: signClass(s.balance),
            onclick: () => ctx.nav(`#/poultry/cycle/${c.id}/person/${s.personId}/via/${head.personId}`),
            pk: `poultry|sub:${s.personId}`,
          }),
        ),
      ),
    );
    if (head.personId === 'me') {
      out.append(
        h(
          'div',
          { class: 'card' },
          kv('رصيد ناحيتي عند المدير', F.money(head.sideBalance), signClass(head.sideBalance), { pg: PG }),
          kv('منه لشركائي التابعين', F.money(head.owedToSubs), '', { pg: PG }),
          kv('صافي رصيدي أنا', F.money(head.ownBalance), signClass(head.ownBalance), { pg: PG }),
        ),
      );
    }
  }
  if (d.guests.length) out.append(sectionTitle('التربية المشتركة'), entryList(d.guests.slice().reverse()));
  return out;
}

function kpisTab(c, d) {
  const settled = d.months.filter((r) => r.phase === 'regular' && r.count);
  const withData = d.months.filter((r) => r.count);
  const f = ui(`poultry-kpi-${c.id}`, { from: settled[0]?.month || withData[0]?.month || ctx.nowMonth(), to: withData[withData.length - 1]?.month || ctx.nowMonth() });
  const fromSel = monthSelect(f.from);
  const toSel = monthSelect(f.to);
  fromSel.addEventListener('change', () => ((f.from = fromSel.value), ctx.refresh()));
  toSel.addEventListener('change', () => ((f.to = toSel.value), ctx.refresh()));
  const p = periodStats(d, f.from, f.to);
  const catTotal = Object.values(p.byCategory).reduce((s, x) => s + x, 0);
  const catRows = Object.entries(p.byCategory)
    .filter(([, v]) => v)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [entity(ctx.state, 'poultry.category', k)?.name || k, F.money(v), F.pct(catTotal ? v / catTotal : null)]);
  const monthRows = d.months
    .filter((r) => r.month >= f.from && r.month <= f.to && r.count)
    .map((r) => {
      const k = monthKpis(r);
      return [(r.lay ? '🐣 ' : r.pre ? '🏗️ ' : '') + F.monthShort(r.month) + ' ' + r.month.slice(2, 4), F.qty(k.trays, { decimals: 0 }), k.eggAvg === null ? '—' : F.money(k.eggAvg, { decimals: 1 }), k.costPerTray === null ? '—' : F.money(k.costPerTray, { decimals: 1 }), F.qty(k.feedQty, { decimals: 2 }), k.feedPerTray === null ? '—' : F.num(Math.round(k.feedPerTray * 100) / 100), F.money(r.opNet + r.capNet, { decimals: 0 })];
    });
  return h(
    'div',
    {},
    h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { text: 'من شهر' }), fromSel), h('div', { class: 'field' }, h('label', { text: 'إلى شهر' }), toSel)),
    h(
      'div',
      { class: 'stats' },
      st('الأطباق المباعة', F.qty(p.trays, { decimals: 0 }), { hint: p.traysPerDay ? `${F.num(Math.round(p.traysPerDay * 10) / 10)} طبق/يوم · إنتاج تقريبي ${F.num(Math.round(((p.traysPerDay * EGGS_PER_TRAY) / Math.max(1, d.birds.now || c.birds || 1)) * 1000) / 10)}%` : '' }),
      st('متوسط سعر الطبق (ج)', p.eggAvg === null ? '—' : F.money(p.eggAvg, { decimals: 2 })),
      st('تكلفة الطبق = التعادل (ج)', p.costPerTray === null ? '—' : F.money(p.costPerTray, { decimals: 2 }), { hint: p.eggAvg && p.costPerTray ? `الهامش ${F.money(p.eggAvg - p.costPerTray, { decimals: 2 })} ج/طبق` : '' }),
      st('العلف (طن)', F.qty(p.feedQty, { decimals: 2 }), { hint: p.feedAvg ? `متوسط ${F.money(p.feedAvg, { decimals: 0 })} ج/طن${p.feedPerTray ? ` · ${F.num(Math.round(p.feedPerTray * 100) / 100)} كجم/طبق` : ''}` : '' }),
      st('صافي الفترة', F.money(p.opNet + p.capNet, { decimals: 0 }), { valueClass: signClass(p.opNet + p.capNet), hint: p.avgMonthlyNet !== null ? `متوسط الشهر ${F.money(p.avgMonthlyNet, { decimals: 0 })} · ${F.num(p.months)} شهر` : '' }),
      st('المبيعات', F.money(p.sales, { decimals: 0 }), { hint: `المصروفات ${F.money(p.opExpenses, { decimals: 0 })}` }),
    ),
    Object.keys(p.byGrade).length
      ? h('div', {}, sectionTitle('البيض حسب النوع'), table([{ label: 'النوع' }, { label: 'أطباق', num: true }, { label: 'المبلغ', num: true }, { label: 'متوسط', num: true }], Object.entries(p.byGrade).map(([g, v]) => [entity(ctx.state, 'poultry.grade', g)?.name || g, F.qty(v.qty, { decimals: 0 }), F.money(v.amount, { decimals: 0 }), F.money(Math.round((v.amount * QTY) / v.qty), { decimals: 1 })]), { pg: PG }))
      : null,
    catRows.length ? h('div', {}, sectionTitle('المصروفات حسب البند (حصتنا)'), table([{ label: 'البند' }, { label: 'المبلغ', num: true }, { label: 'النسبة', num: true }], catRows, { pg: PG })) : null,
    monthRows.length ? h('div', {}, sectionTitle('شهر بشهر'), table([{ label: 'الشهر' }, { label: 'أطباق', num: true }, { label: 'سعر', num: true }, { label: 'تكلفة', num: true }, { label: 'علف طن', num: true }, { label: 'كجم/طبق', num: true }, { label: 'الصافي', num: true }], monthRows, { pg: PG })) : null,
    h('p', { class: 'muted small', text: 'تكلفة الطبق = مصروفات الشهر التشغيلية ÷ الأطباق المباعة = سعر التعادل. لو سعر البيع أعلى منها فالشهر مكسب.' }),
  );
}

function setupTab(c, d) {
  return h(
    'div',
    {},
    h('div', { class: 'btn-row' }, h('button', { class: 'btn', text: 'تعديل بيانات الدورة', onclick: () => cycleForm(c) }), h('button', { class: 'btn', text: 'الحصص', onclick: () => sharesForm(c.id) })),
    sectionTitle('سجل الحصص'),
    d.shares.length ? entryList(d.shares.slice().reverse()) : empty('لا توجد'),
    sectionTitle('التربية المشتركة (ضيف)', h('button', { class: 'link', text: '+ إضافة', onclick: () => guestForm(c.id) })),
    d.guests.length ? h('div', {}, entryList(d.guests.slice().reverse()), h('button', { class: 'btn small', text: 'الضيف أخذ طيوره', onclick: () => guestForm(c.id, { end: true, personId: d.guests[d.guests.length - 1].personId }) })) : h('p', { class: 'muted small', text: 'لو بدأتم بتربية طيور لشخص آخر مع طيوركم، سجّله هنا ليتحمّل نسبته من المصروف.' }),
    sectionTitle('الجرد'),
    entryList(d.entries.filter((e) => e.kind === 'poultry.count').reverse(), { emptyText: 'لا يوجد جرد' }),
  );
}

export const monthScreen = ({ id, month }) => periodScreen({ id, from: month, to: month });

export function periodScreen({ id, from, to }) {
  const c = entity(ctx.state, 'poultry.cycle', id);
  if (!c) return { title: 'غير موجود', body: empty('الدورة غير موجودة') };
  const d = cycleData(ctx.state, id);
  const single = from === to;
  const rows = d.months.filter((x) => x.month >= from && x.month <= to);
  if (!rows.length || !rows.some((x) => x.count)) return { title: c.name, subtitle: periodLabel(from, to), body: h('div', {}, empty('لا توجد قيود في هذه الفترة'), actions(c, to)) };
  const r = aggregateMonths(rows);
  const k = monthKpis(r);
  const entries = d.entries.filter((e) => e.month && e.month >= from && e.month <= to);
  const phaseName = r.pre ? 'التأسيس والتربية (رأس مال)' : r.lay ? 'فترة البشاير' : '';
  const salesRows = [];
  for (const [g, v] of Object.entries(r.eggs.byGrade)) salesRows.push([`بيض ${entity(ctx.state, 'poultry.grade', g)?.name || g}`, F.qty(v.qty, { decimals: 0 }), F.money(Math.round((v.amount * QTY) / v.qty), { decimals: 2 }), F.money(v.amount)]);
  for (const p of ['bags', 'manure', 'birds', 'other']) if (r[p].amount) salesRows.push([PRODUCTS[p].name, r[p].qty ? F.qty(r[p].qty, { decimals: 0 }) : '', '', F.money(r[p].amount)]);
  const expRows = Object.entries(r.byCategory).map(([cat, v]) => [entity(ctx.state, 'poultry.category', cat)?.name || cat, v.qty ? F.qty(v.qty, { decimals: 3 }) : '', F.money(v.gross), F.money(v.amount)]);
  return {
    title: c.name,
    subtitle: [single ? F.month(from) : periodLabel(from, to), phaseName, r.closed ? 'مقفول' : ''].filter(Boolean).join(' · '),
    body: h(
      'div',
      {},
      h(
        'div',
        { class: 'stats' },
        st('المبيعات', F.money(r.sales), { valueClass: 'pos', hint: r.eggs.qty ? `${trays(r.eggs.qty)} · ${perTray(k.eggAvg)}` : '' }),
        st('المصروفات (حصتنا)', F.money(r.expensesOurs), { valueClass: 'neg', hint: r.guestCost ? `الضيف ${F.money(r.guestCost)}` : k.costPerTray ? `تكلفة ${perTray(k.costPerTray)}` : '' }),
        st(r.pre ? 'صافي (رأس مال)' : r.lay ? 'صافي فترة البشاير' : 'ربح/خسارة الشهر', F.money(r.opNet + r.capNet), { valueClass: signClass(r.opNet + r.capNet), cls: 'wide', hint: r.capExpenses && !r.pre ? `منه رأسمالي ${F.money(-r.capExpenses)}` : '' }),
      ),
      r.lay ? h('p', { class: 'muted small', text: 'فترة البشاير: من أول البيض حتى انتظام الإنتاج. تُحاسَب ككتلة واحدة ولا تدخل متوسطات الشهور المنتظمة.' }) : null,
      r.closed ? h('div', { class: 'banner info', text: `${single ? 'الشهر' : 'الفترة'} مقفول${single ? '' : 'ة'} — لا يُعدَّل إلا بعد الفتح.` }) : actions(c, to),
      salesRows.length ? h('div', {}, sectionTitle('المبيعات'), table([{ label: 'الصنف' }, { label: 'العدد', num: true }, { label: 'متوسط', num: true }, { label: 'المبلغ', num: true }], salesRows, { totalRow: ['الإجمالي', '', '', F.money(r.sales)], pg: PG })) : null,
      expRows.length ? h('div', {}, sectionTitle('المصروفات'), table([{ label: 'البند' }, { label: 'الكمية', num: true }, { label: 'الإجمالي', num: true }, { label: 'حصتنا', num: true }], expRows, { totalRow: ['الإجمالي', '', F.money(r.expensesOurs + r.guestCost), F.money(r.expensesOurs)], pg: PG })) : null,
      r.alloc.length ? h('div', {}, sectionTitle('التوزيع على الشركاء'), table([{ label: 'الشريك' }, { label: 'النصيب', num: true }], r.alloc.map((a) => [personName(a.personId) + (a.via ? ` (تابع لـ ${personName(a.via)})` : ''), F.money(a.op + a.cap)]), { pg: PG })) : null,
      r.deaths || r.producedTrays ? h('div', { class: 'card' }, r.deaths ? kv('النافق المسجل', F.num(r.deaths), '', { secret: false }) : null, r.producedTrays ? kv('الإنتاج المسجل', trays(r.producedTrays), '', { secret: false }) : null) : null,
      sectionTitle('القيود'),
      entryList(entries.slice().reverse()),
      h('button', { class: `btn block ${r.closed ? '' : 'primary'}`, style: { marginTop: '12px' }, text: r.closed ? 'فتح للتعديل' : single ? 'إقفال الشهر (تم التحاسب)' : 'إقفال الفترة (تم التحاسب)', onclick: () => toggleMonthClose(id, r) }),
      single ? h('div', { class: 'btn-row', style: { marginTop: '8px' } }, h('button', { class: 'btn small', text: '‹ الشهر السابق', onclick: () => ctx.nav(`#/poultry/cycle/${id}/month/${addMonths(from, -1)}`) }), h('button', { class: 'btn small', text: 'الشهر التالي ›', onclick: () => ctx.nav(`#/poultry/cycle/${id}/month/${addMonths(from, 1)}`) })) : null,
    ),
  };
}

const LINE_LABEL = { paid: 'دفع', received: 'استلم', month: 'نصيب شهر', lay: 'نصيب فترة البشاير', capital: 'نصيب التأسيس', guest: 'نصيبه كضيف من المصروف' };

export function cyclePersonScreen({ id, personId, head }) {
  const c = entity(ctx.state, 'poultry.cycle', id);
  const d = c && cycleData(ctx.state, id);
  const p = d?.people.get(personId);
  if (!p) return { title: 'غير موجود', body: empty('لا توجد حسابات لهذا الشخص في الدورة') };
  const lines = personStatement(d, personId, { head });
  const bal = lines.length ? lines[lines.length - 1].balance : 0;
  const w = head ? p.withHeads.find((x) => x.head === head) : null;
  return {
    title: personName(personId),
    subtitle: head ? `حسابه مع ${personName(head)} · ${c.name}` : `كشف الناحية · ${c.name}`,
    body: h(
      'div',
      {},
      h('div', { class: 'stats' }, st(head ? `رصيده عند ${personName(head)}` : 'رصيد الناحية عند المدير', F.money(bal), { valueClass: signClass(bal), cls: 'wide primary', hint: bal >= 0 ? (head ? `${personName(head)} مدين له` : 'الدورة مدينة له') : 'عليه' })),
      w ? h('div', { class: 'card' }, kv('دفع لرأسه', F.money(w.paid), '', { pg: PG }), kv('استلم من رأسه', F.money(w.received), '', { pg: PG }), kv('نصيبه من النتائج', F.money(w.results), signClass(w.results), { pg: PG })) : null,
      !head && personId === 'me' && p.subAccounts.length ? h('div', { class: 'card' }, kv('منه لشركائي التابعين', F.money(p.owedToSubs), '', { pg: PG }), kv('صافي رصيدي أنا', F.money(p.ownBalance), signClass(p.ownBalance), { pg: PG })) : null,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn small', text: '+ دفعة', onclick: () => paymentForm(id, { personId, type: head ? (personId === 'me' ? 'subOut' : 'subIn') : 'in' }) })),
      sectionTitle('الكشف'),
      lines.length
        ? table(
            [{ label: 'التاريخ' }, { label: 'البيان' }, { label: 'المبلغ', num: true }, { label: 'الرصيد', num: true }],
            lines.map((l) => [l.month ? F.month(l.month) : F.date(l.date), LINE_LABEL[l.kind] + (l.entry?.note ? ` — ${l.entry.note}` : ''), F.money(l.amount, { sign: true }), F.money(l.balance)]),
            { pg: PG },
          )
        : empty('لا توجد حركات'),
      h('p', { class: 'muted small', text: 'دفع = يزيد ما له، استلم = ينقص، ونصيب الشهر = ربحه (+) أو خسارته (−) حسب حصته.' }),
    ),
  };
}
