// وحدة الجمعيات: جمعية {name, organizerId, monthly, months, start, payDay, shares[]}.
// كل سهم: صاحبه (أنا أو حد بيدفعلي)، حجمه (كامل/نص/…)، ترتيبه، ومواعيد قبضه ومبالغها (مجموعها = إجمالي أقساطه).
// القيود: قسط لسهم (assoc.pay)، قبض لسهم (assoc.payout)، وفلوس بيني وبين صاحب سهم مش بتاعي (assoc.transfer).
import { entity } from '../../engine.js';
import { fmtMoney } from '../../money.js';
import { isShare } from '../../shares.js';
import { check, isId, isMonth, nonEmpty, todayISO } from '../../util.js';
import { ME } from '../common.js';
import { MONEY_RULES } from '../money/config.js';
import { dueLevel } from '../money/prices.js';
import { allAssocs, assocData, assocLabel, assocMonthList, dueUntil, isOrganizer, shareInstallment, shareSums, soonLimit } from './calc.js';

const posInt = (x) => Number.isSafeInteger(x) && x > 0;
const shortText = (s, max) => s === undefined || s === null || (typeof s === 'string' && s.length <= max);
const money = (u) => `${fmtMoney(u)} ج`;
const personName = (s, id) => (id === ME ? 'أنا' : entity(s, 'person', id)?.name || '؟');
const monthNo = (a, m) => assocMonthList(a).indexOf(m) + 1;

function assocOf(s, e) {
  const a = entity(s, 'assoc', e.assocId);
  check(a, 'الجمعية غير موجودة');
  const sh = (a.shares || []).find((x) => x.id === e.shareId);
  check(sh, 'السهم غير موجود في الجمعية');
  return { a, sh };
}

function validateAssoc(s, x, prev) {
  check(nonEmpty(x.name) && x.name.trim().length <= 80, 'اكتب اسم الجمعية');
  check(entity(s, 'person', x.organizerId), 'اختر مين بيلمّ الجمعية (أو أنا)');
  check(posInt(x.monthly), 'اكتب قسط السهم في الشهر');
  check(Number.isInteger(x.months) && x.months >= 1 && x.months <= MONEY_RULES.maxAssocMonths, 'عدد الشهور غير صالح');
  check(isMonth(x.start), 'اختر شهر البداية');
  check(Number.isInteger(x.payDay) && x.payDay >= 1 && x.payDay <= 31, 'يوم الدفع من 1 إلى 31');
  check(shortText(x.note, 500), 'الملاحظة طويلة');
  const shares = x.shares || [];
  check(Array.isArray(shares) && shares.length >= 1 && shares.length <= MONEY_RULES.maxAssocShares, 'ضيف سهم واحد على الأقل');
  check(new Set(shares.map((h) => h.id)).size === shares.length, 'أسهم مكررة');
  const months = new Set(assocMonthList(x));
  for (const sh of shares) {
    check(isId(sh.id), 'سهم غير صالح');
    const who = personName(s, sh.ownerId);
    check(entity(s, 'person', sh.ownerId), 'اختر صاحب كل سهم');
    check(isShare(sh.size) && sh.size.den <= 12, `حجم سهم ${who} غير صالح`);
    check(sh.turn === undefined || sh.turn === null || (Number.isInteger(sh.turn) && sh.turn >= 1 && sh.turn <= x.months), `ترتيب ${who} لازم من 1 إلى ${x.months}`);
    check(shortText(sh.note, 200), 'الملاحظة طويلة');
    const payouts = sh.payouts || [];
    check(Array.isArray(payouts) && payouts.length <= x.months, 'مواعيد القبض غير صالحة');
    for (const p of payouts) {
      check(p && months.has(p.month), `ميعاد قبض ${who} لازم يكون من شهور الجمعية`);
      check(posInt(p.amount), `مبلغ قبض ${who} غير صالح`);
    }
    const total = shareInstallment(x, sh) * x.months;
    const planned = payouts.reduce((t, p) => t + p.amount, 0);
    if (payouts.length) check(planned === total, `مجموع قبض ${who} (${money(planned)}) لازم يساوي إجمالي أقساطه (${money(total)})`);
    if (prev) {
      const got = shareSums(s, x.id, sh.id);
      check(got.paid <= total && got.received <= total, `المدفوع أو المقبوض لسهم ${who} أكبر من إجمالي أقساطه بعد التعديل`);
      const old = (prev.shares || []).find((h) => h.id === sh.id);
      if (old && old.ownerId !== sh.ownerId) check(!got.tin && !got.tout, `سهم ${personName(s, old.ownerId)} عليه حركات معاه — مينفعش تغيّر صاحبه`);
    }
  }
  if (prev) {
    for (const old of prev.shares || []) if (!shares.some((h) => h.id === old.id)) check(!shareSums(s, x.id, old.id).count, `سهم ${personName(s, old.ownerId)} عليه حركات — مينفعش يتشال`);
    if (prev.organizerId !== x.organizerId) check((isOrganizer(prev) === isOrganizer(x)) || !s.entries.some((e) => !e.voided && e.assocId === x.id), 'مينفعش تغيّر إنك المدير بعد التسجيل');
  }
}

// القسط/القبض لا يتعدى إجمالي السهم.
function checkCap(s, e, field) {
  const { a, sh } = assocOf(s, e);
  check(posInt(e.amount), 'اكتب المبلغ');
  check(isMonth(e.month) && monthNo(a, e.month) > 0, 'الشهر لازم يكون من شهور الجمعية');
  const total = shareInstallment(a, sh) * a.months;
  const sums = shareSums(s, a.id, sh.id);
  check(sums[field] + e.amount <= total, `${field === 'paid' ? 'الأقساط' : 'القبض'} لسهم ${personName(s, sh.ownerId)} هتبقى ${money(sums[field] + e.amount)} — أكبر من إجمالي السهم (${money(total)})`);
  return { a, sh };
}

export default {
  id: 'assoc',
  name: 'الجمعيات',
  entities: {
    assoc: { label: 'جمعية', validate: validateAssoc },
  },
  entries: {
    'assoc.pay': {
      label: 'قسط جمعية',
      validate: (s, e) => checkCap(s, e, 'paid'),
      describe: (s, e) => {
        const a = entity(s, 'assoc', e.assocId);
        const sh = a?.shares?.find((x) => x.id === e.shareId);
        if (!a || !sh) return { title: 'قسط جمعية', amount: e.amount, sign: 0 };
        const n = monthNo(a, e.month);
        const who = sh.ownerId === ME ? '' : ` (سهم ${personName(s, sh.ownerId)})`;
        if (isOrganizer(a)) return { title: sh.ownerId === ME ? `قسطي في ${assocLabel(a)} — شهر ${n}` : `${personName(s, sh.ownerId)} دفع قسط ${assocLabel(a)} — شهر ${n}`, amount: e.amount, sign: sh.ownerId === ME ? -1 : 1, tag: 'assoc' };
        return { title: `قسط ${assocLabel(a)} — شهر ${n}${who}`, amount: e.amount, sign: -1, tag: 'assoc' };
      },
    },
    'assoc.payout': {
      label: 'قبض جمعية',
      validate: (s, e) => checkCap(s, e, 'received'),
      describe: (s, e) => {
        const a = entity(s, 'assoc', e.assocId);
        const sh = a?.shares?.find((x) => x.id === e.shareId);
        if (!a || !sh) return { title: 'قبض جمعية', amount: e.amount, sign: 0 };
        if (isOrganizer(a) && sh.ownerId !== ME) return { title: `سلّمت ${personName(s, sh.ownerId)} قبض ${assocLabel(a)}`, amount: e.amount, sign: -1, tag: 'assoc' };
        return { title: `قبض ${assocLabel(a)}${sh.ownerId === ME ? '' : ` (سهم ${personName(s, sh.ownerId)})`}`, amount: e.amount, sign: 1, tag: 'assoc' };
      },
    },
    // سهم مش بتاعي في جمعية أنا عضو فيها: صاحبه دفعلي (in) أو سلّمته (out).
    'assoc.transfer': {
      label: 'فلوس سهم جمعية',
      validate: (s, e) => {
        const { a, sh } = assocOf(s, e);
        check(!isOrganizer(a) && sh.ownerId !== ME, 'ده لسهم حد تاني في جمعية أنا مش مديرها');
        check(e.dir === 'in' || e.dir === 'out', 'اختر: دفعلي ولا سلّمته');
        check(posInt(e.amount), 'اكتب المبلغ');
      },
      describe: (s, e) => {
        const a = entity(s, 'assoc', e.assocId);
        const sh = a?.shares?.find((x) => x.id === e.shareId);
        const who = personName(s, sh?.ownerId);
        return { title: e.dir === 'in' ? `${who} دفعلي ل${assocLabel(a)}` : `سلّمت ${who} من ${assocLabel(a)}`, amount: e.amount, sign: e.dir === 'in' ? 1 : -1, tag: 'assoc' };
      },
    },
  },

  reminders(state, today) {
    const out = [];
    const limit = soonLimit(state, today);
    for (const a of allAssocs(state)) {
      const d = assocData(state, a.id, today);
      if (d.status === 'done') continue;
      const href = `#/assoc/${a.id}`;
      const lvl = (due) => dueLevel(due, today, 3650) || 'upcoming';
      // الأقساط: كعضو أدفعها للمدير، وكمدير أحصّلها من الأعضاء.
      const late = d.shares.filter((s) => s.months.some((m) => m.remaining > 0 && m.due <= limit));
      if (late.length) {
        const first = late.flatMap((s) => s.months.filter((m) => m.remaining > 0)).sort((x, y) => (x.due < y.due ? -1 : 1))[0];
        const amount = dueUntil(late, first.due < today ? today : first.due);
        if (d.organizer) {
          const names = late.map((s) => personName(state, s.share.ownerId));
          out.push({ id: `assoc-collect-${a.id}-${first.due}`, due: first.due, title: `حصّل أقساط ${assocLabel(a)}: ${late.length} سهم لسه (${names.slice(0, 3).join('، ')}${names.length > 3 ? '…' : ''}) — ${money(amount)}`, level: lvl(first.due), href });
        } else out.push({ id: `assoc-pay-${a.id}-${first.due}`, due: first.due, title: `${first.due < today ? 'متأخر: ' : ''}قسط ${assocLabel(a)} (شهر ${first.n}): ${money(amount)} — لـ${personName(state, a.organizerId)}`, level: lvl(first.due), href });
      }
      // القبض.
      for (const s of d.shares) {
        for (const p of s.payouts) {
          if (p.remaining <= 0 || p.due > limit) continue;
          const who = personName(state, s.share.ownerId);
          const title = d.organizer ? (s.own ? `قبضي من ${assocLabel(a)}: ${money(p.remaining)}` : `سلّم قبض ${assocLabel(a)} لـ${who}: ${money(p.remaining)}`) : `${p.due < today ? 'سجّل لو قبضت: ' : 'هتقبض '}${assocLabel(a)}${s.own ? '' : ` (سهم ${who})`}: ${money(p.remaining)}`;
          out.push({ id: `assoc-payout-${a.id}-${s.share.id}-${p.month}`, due: p.due, title, level: lvl(p.due), href });
        }
        // سهم لحد تاني: سلّمه قبضه، أو حصّل منه أقساطه.
        if (s.behalf && s.received > s.tout && s.ownerBalance > 0) out.push({ id: `assoc-handover-${a.id}-${s.share.id}`, due: today, title: `سلّم ${personName(state, s.share.ownerId)} فلوس قبض ${assocLabel(a)}: ${money(s.ownerBalance)}`, level: 'today', href });
        else if (s.behalf && s.ownerLate > 0) out.push({ id: `assoc-owner-${a.id}-${s.share.id}`, due: today, title: `${personName(state, s.share.ownerId)} متأخر ${money(s.ownerLate)} ل${assocLabel(a)} (دفعته من عندك)`, level: 'upcoming', href });
      }
    }
    return out;
  },

  // عضو: سهمي = دفعت − قبضت (ليّ عند الجمعية أو عليّ أقساط بعد القبض)؛ سهم حد تاني = رصيده معايا.
  // مدير: سهمي بنفس الطريقة + اللي دفعته من جيبي لو المحصّل أقل من المسلَّم.
  finance(state, today = todayISO()) {
    const out = [];
    for (const a of allAssocs(state)) {
      const d = assocData(state, a.id, today);
      const href = `#/assoc/${a.id}`;
      if (d.myPosition) out.push({ section: 'الجمعيات', label: d.myPosition > 0 ? `${assocLabel(a)} (دفعت ولسه مقبضتش)` : `${assocLabel(a)} (أقساط باقية بعد القبض)`, kind: d.myPosition > 0 ? 'receivable' : 'payable', amount: Math.abs(d.myPosition), href });
      if (d.organizer && d.pot < 0) out.push({ section: 'الجمعيات', label: `${assocLabel(a)} (دفعت من جيبي للمقبوض)`, kind: 'receivable', amount: -d.pot, href });
      for (const s of d.shares) {
        if (!s.behalf || !s.ownerBalance) continue;
        const who = personName(state, s.share.ownerId);
        out.push({ section: 'الجمعيات', label: s.ownerBalance > 0 ? `فلوس ${who} في ${assocLabel(a)} معايا` : `${who} عليه ل${assocLabel(a)}`, kind: s.ownerBalance > 0 ? 'payable' : 'receivable', amount: Math.abs(s.ownerBalance), href, personId: s.share.ownerId });
      }
    }
    return out;
  },
};
