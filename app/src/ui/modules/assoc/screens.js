// شاشات الجمعيات: القائمة، والجمعية (ملخص، الشهور، الأسهم، السجل).
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { badge, chips, empty, kv, list, openSheet, row, sectionTitle, stat } from '../../components.js';
import { entryList, signClass } from '../../widgets.js';
import { allAssocs, assocData, assocLabel, assocNext } from '../../../core/modules/assoc/calc.js';
import { PG, egp, levelBadge } from '../money/fmt.js';
import { assocForm, installmentsForm, ownerName, payoutForm, sizeLabel, transferForm } from './forms.js';

const st = (label, value, o = {}) => stat(label, value, { pg: PG, ...o });
const info = (k, v) => kv(k, v, '', { secret: false });
const late = (d) => d.shares.some((s) => s.months.some((m) => m.state === 'overdue'));

export function progressText(d) {
  if (d.status === 'done') return 'خلصت';
  if (d.monthIndex === 0) return `تبدأ ${F.month(d.assoc.start)}`;
  if (d.monthIndex > d.assoc.months) return 'الشهور خلصت';
  return `الشهر ${F.num(d.monthIndex)} من ${F.num(d.assoc.months)}`;
}

export function assocRow(d) {
  const a = d.assoc;
  const nx = assocNext(d);
  const payout = nx.payout && (d.organizer ? nx.payout : nx.payout.share.own || nx.payout.share.behalf) ? nx.payout : null;
  return row({
    title: assocLabel(a),
    subtitle: [d.organizer ? 'أنا المدير' : `المدير: ${ownerName(a.organizerId)}`, progressText(d), payout ? `${d.organizer ? `يقبض ${ownerName(payout.share.share.ownerId)}` : 'القبض'} ${F.month(payout.month)}` : ''].filter(Boolean).join(' · '),
    value: `${egp(d.myInstallment)}/شهر`,
    badge: d.status === 'done' ? badge('خلصت', 'ok') : a.archived ? badge('مؤرشفة') : late(d) ? badge('متأخر', 'bad') : payout && levelBadge(payout.state) ? badge('قبض قريب', 'warn') : null,
    cls: 'wrap',
    pg: PG,
    pk: `${PG}|assoc:${a.id}`,
    onclick: () => ctx.nav(`#/assoc/${a.id}`),
  });
}

export function assocsScreen() {
  const today = ctx.today();
  const rows = allAssocs(ctx.state, { archived: true }).map((a) => assocData(ctx.state, a.id, today));
  const active = rows.filter((d) => d.status !== 'done' && !d.assoc.archived);
  const done = rows.filter((d) => d.status === 'done' || d.assoc.archived);
  return {
    title: 'الجمعيات',
    body: h(
      'div',
      {},
      active.length ? list(active.map(assocRow)) : h('div', { class: 'card' }, h('p', { text: 'ضيف جمعية: القسط الشهري وعدد الشهور وأول شهر، وأسهمك (سهم ليك، أو لحد بيدفعلك وأنت بتوصّل) ومواعيد قبضك — مرة واحدة أو على مرتين. ولو أنت اللي بتلمّها اختار «أنا» مدير وضيف كل الأعضاء.' })),
      done.length ? [sectionTitle('خلصت / مؤرشفة'), list(done.map(assocRow))] : null,
    ),
    fab: { label: 'جمعية', onclick: () => assocForm() },
  };
}

const TABS = [
  { value: 'summary', label: 'ملخص' },
  { value: 'months', label: 'الشهور' },
  { value: 'shares', label: 'الأسهم' },
  { value: 'log', label: 'السجل' },
];

export function assocScreen({ id, tab }) {
  const d = assocData(ctx.state, id, ctx.today());
  if (!d) return { title: 'غير موجودة', body: empty('الجمعية غير موجودة') };
  const a = d.assoc;
  const body = h('div', {}, chips(TABS, tab, (v) => ctx.nav(`#/assoc/${id}/${v}`)));
  const tabs = { summary: summaryTab, months: monthsTab, shares: sharesTab, log: logTab };
  body.append((tabs[tab] || summaryTab)(d));
  return {
    title: assocLabel(a),
    subtitle: [d.organizer ? 'أنا المدير' : `المدير: ${ownerName(a.organizerId)}`, progressText(d)].join(' · '),
    body,
    fab: tab === 'log' || tab === 'months' ? { label: d.organizer ? 'تحصيل' : 'دفعت القسط', onclick: () => installmentsForm(id) } : null,
  };
}

function actions(d) {
  const id = d.assoc.id;
  const behalf = d.shares.filter((s) => s.behalf);
  return h(
    'div',
    { class: 'actions' },
    h('button', { class: 'action primary', onclick: () => installmentsForm(id) }, h('span', { class: 'emo', text: '💵' }), d.organizer ? 'تحصيل أقساط' : 'دفعت القسط'),
    h('button', { class: 'action', onclick: () => payoutForm(id) }, h('span', { class: 'emo', text: '💰' }), d.organizer ? 'سلّمت القبض' : 'قبضت'),
    behalf.length ? h('button', { class: 'action', onclick: () => behalfSheet(d, behalf[0]) }, h('span', { class: 'emo', text: '🤝' }), behalf.length === 1 ? `${ownerName(behalf[0].share.ownerId)}: دفعلي / سلّمته` : 'دفعلي / سلّمته') : null,
    h('button', { class: 'action', onclick: () => assocForm(d.assoc) }, h('span', { class: 'emo', text: '✏️' }), 'تعديل الجمعية'),
  );
}

// اختيار العملية لسهم حد تاني.
function behalfSheet(d, s0) {
  const behalf = d.shares.filter((s) => s.behalf);
  openSheet('سهم حد تاني', (body, close) => {
    for (const s of behalf.length > 1 ? behalf : [s0]) {
      const who = ownerName(s.share.ownerId);
      body.append(
        h('div', { class: 'card' }, info('صاحب السهم', who), kv('رصيده معايا', s.ownerBalance >= 0 ? `ليه ${egp(s.ownerBalance)}` : `عليه ${egp(-s.ownerBalance)}`, s.ownerBalance >= 0 ? '' : 'neg', { pg: PG }), h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', text: `${who} دفعلي`, onclick: () => (close(), transferForm(d.assoc.id, s.share.id, 'in')) }), h('button', { class: 'btn', text: `سلّمت ${who}`, onclick: () => (close(), transferForm(d.assoc.id, s.share.id, 'out')) }))),
      );
    }
  });
}

const MONTH_BADGE = { paid: ['اتدفع', 'ok'], partial: ['ناقص', 'warn'], overdue: ['متأخر', 'bad'], today: ['النهارده', 'warn'], upcoming: ['قريب', 'warn'] };
const PAYOUT_BADGE = { received: ['اتقبض', 'ok'], overdue: ['فات ميعاده', 'bad'], today: ['النهارده', 'warn'], upcoming: ['قريب', 'warn'] };

function summaryTab(d) {
  const a = d.assoc;
  const id = a.id;
  const nowIdx = Math.min(Math.max(d.monthIndex, 1), a.months) - 1;
  const focus = d.grid.find((g) => g.unpaid.length && g.due <= ctx.today()) || d.grid[nowIdx];
  const payouts = d.shares.flatMap((s) => s.payouts.map((p) => ({ ...p, s }))).sort((x, y) => (x.due < y.due ? -1 : 1));
  const behalf = d.shares.filter((s) => s.behalf);
  const stats = d.organizer
    ? [
        st('الفلوس معايا للجمعية', egp(d.pot), { cls: 'primary wide', valueClass: signClass(d.pot), hint: d.pot < 0 ? 'دفعت من جيبي (المسلَّم أكتر من المحصّل)' : `المحصّل ${egp(d.paid)} − المسلَّم ${egp(d.received)}` }),
        st('قسط الشهر (كل الأسهم)', egp(d.monthlyAll), { hint: `${F.num(d.shares.length)} سهم` }),
        d.mine.length ? st('سهمي', egp(d.myPosition), { valueClass: signClass(d.myPosition), hint: d.myPosition >= 0 ? 'دفعت أكتر ما قبضت' : 'عليّ أقساط بعد القبض' }) : null,
      ]
    : [
        st('قسطي في الشهر', egp(d.myInstallment), { cls: 'primary', hint: `${F.num(d.shares.length)} سهم · يوم ${F.num(a.payDay)}` }),
        st('دفعت', egp(d.paid), { hint: `من ${egp(d.shares.reduce((x, s) => x + s.total, 0))}` }),
        st('قبضت', egp(d.received)),
        d.mine.length ? st(d.myPosition >= 0 ? 'ليّ عند الجمعية' : 'عليّ أقساط', egp(Math.abs(d.myPosition)), { valueClass: d.myPosition >= 0 ? 'pos' : 'neg', hint: 'لأسهمي أنا' }) : null,
      ];
  return h(
    'div',
    {},
    h('div', { class: 'stats' }, stats),
    actions(d),
    focus
      ? [
          sectionTitle(`${F.month(focus.month)} (الشهر ${F.num(focus.n)}) — يوم ${F.date(focus.due)}`),
          list(
            d.shares.map((s) => {
              const m = s.months[focus.n - 1];
              return row({ title: `${ownerName(s.share.ownerId)}${s.share.size.den > 1 ? ` (${sizeLabel(s.share.size)})` : ''}`, subtitle: m.remaining ? `باقي ${egp(m.remaining)}` : '', value: egp(m.amount), badge: MONTH_BADGE[m.state] ? badge(...MONTH_BADGE[m.state]) : null, pg: PG, pk: `${PG}|assoc-month`, onclick: m.remaining ? () => installmentsForm(id, { month: focus.month }) : null });
            }),
          ),
        ]
      : null,
    payouts.length ? [sectionTitle('مواعيد القبض'), list(payouts.map((p) => row({ title: `${ownerName(p.s.share.ownerId)} — ${F.month(p.month)} (الشهر ${F.num(p.n)})`, subtitle: p.received && p.remaining ? `اتقبض ${egp(p.received)} · باقي ${egp(p.remaining)}` : '', value: egp(p.amount), badge: PAYOUT_BADGE[p.state] ? badge(...PAYOUT_BADGE[p.state]) : null, pg: PG, pk: `${PG}|assoc-payout`, onclick: p.remaining ? () => payoutForm(id, { shareId: p.s.share.id }) : null })))] : null,
    behalf.length
      ? [
          sectionTitle('أسهم لناس تانية (بوصّل عنهم)'),
          list(behalf.map((s) => row({ title: `سهم ${ownerName(s.share.ownerId)}`, subtitle: `دفعلي ${egp(s.tin)} · دفعت لسهمه ${egp(s.paid)} · قبضت له ${egp(s.received)} · سلّمته ${egp(s.tout)}`, value: s.ownerBalance > 0 ? `ليه ${egp(s.ownerBalance)}` : s.ownerBalance < 0 ? `عليه ${egp(-s.ownerBalance)}` : 'متسوي', valueClass: s.ownerBalance < 0 ? 'neg' : '', cls: 'wrap', pg: PG, pk: `${PG}|assoc-behalf`, onclick: () => behalfSheet(d, s) }))),
        ]
      : null,
    h('div', { class: 'card' }, info('قسط السهم الكامل', `${egp(a.monthly)} × ${F.num(a.months)} شهر = ${egp(a.monthly * a.months)}`), info('من', `${F.month(a.start)} لـ${F.month(d.months[d.months.length - 1])}`), a.note ? info('ملاحظة', a.note) : null),
  );
}

function monthsTab(d) {
  const now = ctx.nowMonth();
  return h(
    'div',
    {},
    h('p', { class: 'muted small', text: d.organizer ? 'كل شهر: المحصّل من كل الأسهم و💰 مين يقبض. اضغط الشهر تسجّل التحصيل.' : 'كل شهر: قسطك (كل أسهمك) و💰 لو فيه قبض. اضغط الشهر تسجّل الدفع.' }),
    h(
      'div',
      { class: 'months' },
      d.grid.map((g) =>
        h(
          'button',
          { class: `month ${g.state}${g.month === now ? ' now' : ''}`, onclick: () => installmentsForm(d.assoc.id, { month: g.month }) },
          h('span', { class: 'm', text: `${F.num(g.n)}. ${F.monthShort(g.month)}` }),
          h('span', { class: 'a num', text: g.state === 'paid' ? '✓' : g.paid ? `${F.money(g.paid)}/${F.money(g.amount)}` : F.money(g.amount) }),
          g.payouts.length ? h('span', { class: 'p', text: `💰 ${g.payouts.map((p) => ownerName(p.share.share.ownerId)).join('، ')}` }) : null,
        ),
      ),
    ),
    h('div', { class: 'legend' }, badge('اتدفع', 'ok'), badge('ناقص', 'warn'), badge('متأخر', 'bad'), badge('لسه')),
  );
}

function sharesTab(d) {
  return h(
    'div',
    {},
    list(
      d.shares.map((s) =>
        row({
          title: `${ownerName(s.share.ownerId)} — ${sizeLabel(s.share.size)}${s.share.turn ? ` · الترتيب ${F.num(s.share.turn)}` : ''}`,
          subtitle: [`قسطه ${egp(s.installment)}`, `دفع ${egp(s.paid)} من ${egp(s.total)}`, s.late ? `متأخر ${egp(s.late)}` : '', `القبض: ${s.payouts.map((p) => `${F.monthShort(p.month)} ${egp(p.amount)}${p.remaining === 0 ? ' ✓' : ''}`).join(' + ') || 'مش محدد'}`].filter(Boolean).join(' · '),
          value: egp(s.position),
          valueClass: signClass(s.position),
          badge: s.done ? badge('خلص', 'ok') : s.late ? badge('متأخر', 'bad') : null,
          cls: 'wrap',
          pg: PG,
          pk: `${PG}|assoc-share`,
          onclick: () => payoutForm(d.assoc.id, { shareId: s.share.id }),
        }),
      ),
    ),
    h('p', { class: 'muted small', text: 'الرقم = دفع − قبض: موجب = ليه عند الجمعية، سالب = قبض وعليه أقساط. لتغيير الأسهم أو مواعيد القبض: «تعديل الجمعية».' }),
  );
}

function logTab(d) {
  return entryList([...d.entries].reverse());
}
