// نماذج الجمعيات: الجمعية وأسهمها ومواعيد قبض كل سهم، دفع/تحصيل أقساط شهر، القبض/تسليمه، وفلوس صاحب سهم مش بتاعي.
import { h, clear } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { dateInput, errorBox, field, intInput, moneyInput, monthOptions, monthSelect, openSheet, selectInput, textArea, textInput, toast } from '../../components.js';
import { commitEntry, personName, personPicker, saveButton } from '../../forms-common.js';
import { entity } from '../../../core/engine.js';
import { mulDiv } from '../../../core/money.js';
import { ValidationError, newId, ymOf } from '../../../core/util.js';
import { SHARE_SIZES } from '../../../core/modules/money/config.js';
import { assocData, assocMonthList, shareSums } from '../../../core/modules/assoc/calc.js';
import { egp } from '../money/fmt.js';

const need = (c, m) => {
  if (!c) throw new ValidationError(m);
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const sizeKey = (s) => `${s.num}/${s.den}`;
export const sizeLabel = (s) => SHARE_SIZES.find((x) => x.num === s.num && x.den === s.den)?.label || `${s.num}/${s.den} سهم`;
export const ownerName = (id) => (id === 'me' ? 'أنا' : personName(id));
const dataOf = (id) => assocData(ctx.state, id, ctx.today());

// ---------- الجمعية والأسهم ----------
export function assocForm(a = null) {
  openSheet(a ? 'تعديل الجمعية' : 'جمعية جديدة', (body, close) => {
    const err = errorBox();
    const name = textInput(a?.name || '', 'مثلاً: جمعية الشغل');
    const organizer = personPicker(a?.organizerId || '', { placeholder: 'اختر…' });
    const monthly = moneyInput(a?.monthly ?? null);
    const months = intInput(String(a?.months ?? 10));
    const start = monthSelect(a?.start || ctx.nowMonth(), { back: 60, ahead: 24 });
    const payDay = intInput(String(a?.payDay ?? 1));
    const note = textArea(a?.note || '');
    const linesBox = h('div', { class: 'lines' });
    const lines = [];
    const cfg = () => ({ monthly: monthly.units() || 0, months: months.int() || 0, start: start.value });
    const monthsList = () => {
      const c = cfg();
      return c.months > 0 && c.months <= 240 ? assocMonthList(c) : [];
    };
    const totalOf = (sizeV) => {
      const [num, den] = sizeV.split('/').map(Number);
      const c = cfg();
      return mulDiv(c.monthly, num, den) * c.months;
    };

    const addLine = (sh = null) => {
      const L = { id: sh?.id || newId('sh_'), auto: !sh || !(sh.payouts || []).length || (sh.payouts.length === 1 && sh.turn), payouts: [] };
      const owner = personPicker(sh?.ownerId || (lines.length ? '' : 'me'), { placeholder: 'صاحب السهم…' });
      owner.select.setAttribute('aria-label', 'صاحب السهم');
      const size = selectInput(SHARE_SIZES.map((x) => ({ value: sizeKey(x), label: x.label })), sh ? sizeKey(sh.size) : '1/1');
      size.setAttribute('aria-label', 'حجم السهم');
      const turn = intInput(sh?.turn ?? '');
      turn.placeholder = 'الترتيب';
      turn.setAttribute('aria-label', 'ترتيب القبض');
      const sub = h('div', { class: 'sub-lines' });
      const sumEl = h('div', { class: 'muted small' });
      const head = h('div', { class: 'line-head' });
      const refresh = () => {
        const t = totalOf(size.value);
        const s = L.payouts.reduce((x, p) => x + (p.amount.units() || 0), 0);
        sumEl.textContent = `إجمالي أقساطه ${egp(t)}${L.payouts.length ? ` · القبض ${egp(s)}${s !== t ? ' ⚠️ لازم يساوي الإجمالي' : ''}` : ' · ميعاد القبض لسه مش معروف'}`;
        head.textContent = `سهم ${F.num(lines.indexOf(L) + 1)}`;
      };
      const addPayout = (p = {}) => {
        const ms = monthsList();
        const m = selectInput(monthOptions(ms[0] || ctx.nowMonth(), ms[ms.length - 1] || ctx.nowMonth()), p.month || ms[0]);
        m.setAttribute('aria-label', 'شهر القبض');
        const amount = moneyInput(p.amount ?? null, '');
        amount.setAttribute('aria-label', 'مبلغ القبض');
        const P = { m, amount };
        const el = h('div', { class: 'sub-line' }, m, amount, h('button', { type: 'button', class: 'rm', 'aria-label': 'حذف ميعاد القبض', text: '×', onclick: () => (L.payouts.splice(L.payouts.indexOf(P), 1), el.remove(), (L.auto = false), refresh()) }));
        P.el = el;
        amount.addEventListener('input', () => ((L.auto = false), refresh()));
        m.addEventListener('change', () => (L.auto = false));
        L.payouts.push(P);
        sub.insertBefore(el, addBtn);
        refresh();
        return P;
      };
      const addBtn = h('button', {
        type: 'button',
        class: 'btn small',
        text: '+ ميعاد قبض',
        onclick: () => {
          L.auto = false;
          const t = totalOf(size.value);
          const done = L.payouts.reduce((x, p) => x + (p.amount.units() || 0), 0);
          addPayout({ amount: Math.max(0, t - done) || null });
        },
      });
      sub.append(addBtn);
      // الترتيب يحدد شهر القبض والمبلغ كله (لحد ما تقسّمه بإيدك).
      L.autoFill = () => {
        if (!L.auto) return refresh();
        for (const p of [...L.payouts]) p.el.remove();
        L.payouts.length = 0;
        const n = turn.int();
        const ms = monthsList();
        if (Number.isInteger(n) && n >= 1 && n <= ms.length) addPayout({ month: ms[n - 1], amount: totalOf(size.value) || null });
        L.auto = true;
        refresh();
      };
      L.rebuildMonths = () => {
        const ms = monthsList();
        for (const p of L.payouts) {
          const v = p.m.value;
          const fresh = selectInput(monthOptions(ms[0] || ctx.nowMonth(), ms[ms.length - 1] || ctx.nowMonth()), ms.includes(v) ? v : ms[0]);
          fresh.setAttribute('aria-label', 'شهر القبض');
          fresh.addEventListener('change', () => (L.auto = false));
          p.m.replaceWith(fresh);
          p.m = fresh;
        }
      };
      turn.addEventListener('input', () => {
        if (!L.payouts.length) L.auto = true;
        L.autoFill();
      });
      size.addEventListener('change', () => L.autoFill());
      const line = h(
        'div',
        { class: 'line' },
        head,
        h('div', { class: 'grid2' }, owner, size),
        h('div', { class: 'grid2' }, turn, h('div', { class: 'muted small', text: 'الترتيب = الشهر اللي هيقبض فيه' })),
        sub,
        sumEl,
        h('button', {
          type: 'button',
          class: 'rm',
          'aria-label': 'حذف السهم',
          text: '×',
          onclick: () => {
            if (a && shareSums(ctx.state, a.id, L.id).count) return err.show('السهم ده عليه حركات — مينفعش يتشال');
            lines.splice(lines.indexOf(L), 1);
            line.remove();
            lines.forEach((x) => x.refresh());
          },
        }),
      );
      Object.assign(L, { owner, size, turn, refresh, line });
      lines.push(L);
      linesBox.append(line);
      for (const p of sh?.payouts || []) addPayout(p);
      L.auto = !sh || !(sh.payouts || []).length;
      if (!sh) L.autoFill();
      refresh();
    };
    for (const sh of a?.shares || []) addLine(sh);
    if (!a) addLine();
    const onCfg = () => {
      for (const L of lines) {
        L.rebuildMonths();
        L.autoFill();
      }
    };
    for (const el of [monthly, months]) el.addEventListener('input', onCfg);
    start.addEventListener('change', onCfg);

    body.append(
      err,
      field('اسم الجمعية', name),
      field('مين بيلمّها (المدير)', organizer, 'اختار «أنا» لو أنت اللي بتلمّها — هتتابع كل الأعضاء ومين دفع ومين قبض'),
      h('div', { class: 'grid2' }, field('قسط السهم في الشهر', monthly), field('عدد الشهور', months)),
      h('div', { class: 'grid2' }, field('أول شهر', start), field('يوم الدفع في الشهر', payDay)),
      h('div', { class: 'field' }, h('div', { class: 'label', text: 'الأسهم' }), h('div', { class: 'hint', text: 'عضو: أسهمك (وأي سهم لحد بيدفعلك وأنت بتوصّل). مدير: كل أسهم الجمعية. لكل سهم صاحبه وحجمه وترتيبه — ولو هيقبض على أكتر من مرة اضغط «+ ميعاد قبض» وقسّم المبلغ.' }), linesBox, h('button', { type: 'button', class: 'btn small', text: '+ سهم', onclick: () => addLine() })),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          need(organizer.value, 'اختر مين بيلمّ الجمعية (أو أنا)');
          const m = months.int();
          need(Number.isInteger(m) && m >= 1, 'عدد الشهور غير صالح');
          const pd = payDay.int();
          const shares = lines.map((L, i) => {
            need(L.owner.value, `اختر صاحب السهم ${F.num(i + 1)}`);
            const [num, den] = L.size.value.split('/').map(Number);
            const t = L.turn.int();
            need(L.turn.value.trim() === '' || Number.isInteger(t), `ترتيب السهم ${F.num(i + 1)} غير صالح`);
            const payouts = L.payouts.map((p) => {
              const v = p.amount.units();
              need(v > 0, `اكتب مبلغ القبض للسهم ${F.num(i + 1)}`);
              return { month: p.m.value, amount: v };
            });
            const old = a?.shares?.find((x) => x.id === L.id);
            return clean({ id: L.id, ownerId: L.owner.value, size: { num, den }, turn: Number.isInteger(t) ? t : undefined, payouts, note: old?.note });
          });
          const item = clean({ id: a?.id || newId('as_'), name: name.value.trim(), organizerId: organizer.value, monthly: monthly.units(), months: m, start: start.value, payDay: Number.isInteger(pd) ? pd : 1, shares, note: note.value.trim() || null });
          await ctx.store.run((b) => b.upsert('assoc', item));
          toast('تم الحفظ');
          close();
          if (!a) ctx.nav(`#/assoc/${item.id}`);
        },
        err,
      ),
      a
        ? h('button', {
            class: 'btn block',
            style: { marginTop: '8px' },
            text: a.archived ? 'إلغاء الأرشفة' : 'أرشفة (إخفاء من القوائم والحساب)',
            onclick: async () => {
              await ctx.store.run((b) => b.upsert('assoc', { id: a.id, archived: !a.archived }));
              toast('تم');
              close();
            },
          })
        : null,
    );
  });
}

// أول شهر فيه قسط ناقص لأي سهم (أو الشهر الحالي).
export function firstOpenMonth(d) {
  const open = d.grid.find((g) => g.unpaid.length);
  const now = ymOf(ctx.today());
  return open ? open.month : d.months.includes(now) ? now : d.months[0];
}

// ---------- دفع (عضو) / تحصيل (مدير) أقساط شهر ----------
export function installmentsForm(id, { month = null } = {}) {
  const d = dataOf(id);
  const a = d.assoc;
  openSheet(d.organizer ? 'تحصيل أقساط' : 'دفعت القسط', (body, close) => {
    const err = errorBox();
    const m = selectInput(monthOptions(d.months[0], d.months[d.months.length - 1]), month || firstOpenMonth(d));
    const date = dateInput();
    const box = h('div', { class: 'list pick-list' });
    let rows = [];
    const draw = () => {
      clear(box);
      const i = d.months.indexOf(m.value);
      rows = d.shares.map((s) => {
        const rem = s.months[i]?.remaining || 0;
        const cb = h('input', { type: 'checkbox', checked: rem > 0 });
        const amount = moneyInput(rem || s.installment);
        const who = ownerName(s.share.ownerId);
        cb.setAttribute('aria-label', who);
        amount.setAttribute('aria-label', `مبلغ ${who}`);
        box.append(h('label', { class: 'row' }, cb, h('div', { class: 'main' }, h('div', { class: 'title', text: `${who}${s.share.size.den > 1 ? ` (${sizeLabel(s.share.size)})` : ''}` }), h('div', { class: 'subtitle', text: rem ? `باقي للشهر ده ${egp(rem)}` : 'الشهر ده مدفوع' })), amount));
        return { s, cb, amount };
      });
    };
    m.addEventListener('change', draw);
    draw();
    body.append(
      err,
      h('p', { class: 'muted small', text: d.organizer ? 'علّم اللي دفعلك قسط الشهر ده (والمبلغ لو ناقص أو زيادة).' : `علّم الأسهم اللي دفعت قسطها لـ${ownerName(a.organizerId)}.` }),
      field('الشهر', m),
      box,
      field('التاريخ', date),
      saveButton(
        'حفظ',
        async () => {
          const list = rows.filter((r) => r.cb.checked);
          need(list.length, 'علّم سهم واحد على الأقل');
          const entries = list.map((r) => {
            const v = r.amount.units();
            need(v > 0, `اكتب مبلغ ${ownerName(r.s.share.ownerId)}`);
            return ['entry.add', { entry: { id: newId('n'), kind: 'assoc.pay', assocId: id, shareId: r.s.share.id, month: m.value, amount: v, date: date.value || ctx.today() } }];
          });
          await ctx.store.run((b) => b.dispatchAll(entries));
          toast('تم التسجيل');
          close();
        },
        err,
      ),
    );
  });
}

// تعديل قسط واحد.
export function installmentEditForm(entry) {
  const a = entity(ctx.state, 'assoc', entry.assocId);
  const ms = assocMonthList(a);
  openSheet('تعديل القسط', (body, close) => {
    const err = errorBox();
    const m = selectInput(monthOptions(ms[0], ms[ms.length - 1]), entry.month);
    const amount = moneyInput(entry.amount);
    const date = dateInput(entry.date);
    body.append(
      err,
      field('الشهر', m),
      field('المبلغ', amount),
      field('التاريخ', date),
      saveButton(
        'حفظ',
        async () => {
          const v = amount.units();
          need(v > 0, 'اكتب المبلغ');
          if (await commitEntry({ kind: 'assoc.pay', assocId: a.id, shareId: entry.shareId, month: m.value, amount: v, date: date.value || ctx.today() }, entry)) {
            toast('تم الحفظ');
            close();
          }
        },
        err,
      ),
    );
  });
}

// ---------- القبض (عضو: قبضت / مدير: سلّمت القبض) ----------
export function payoutForm(id, { shareId = null, entry = null } = {}) {
  const d = dataOf(id);
  const a = d.assoc;
  openSheet(entry ? 'تعديل القبض' : d.organizer ? 'تسليم القبض' : 'قبضت', (body, close) => {
    const err = errorBox();
    const next = d.shares.map((s) => (s.nextPayout ? { s, p: s.nextPayout } : null)).filter(Boolean).sort((x, y) => (x.p.due < y.p.due ? -1 : 1))[0];
    const sid = entry?.shareId || shareId || next?.s.share.id || d.shares[0].share.id;
    const share = selectInput(d.shares.map((s) => ({ value: s.share.id, label: `${ownerName(s.share.ownerId)}${s.share.size.den > 1 ? ` (${sizeLabel(s.share.size)})` : ''}` })), sid);
    const m = selectInput(monthOptions(d.months[0], d.months[d.months.length - 1]), entry?.month || d.shares.find((s) => s.share.id === sid)?.nextPayout?.month || ymOf(ctx.today()));
    const amount = moneyInput(entry?.amount ?? null);
    const date = dateInput(entry?.date);
    const hint = h('div', { class: 'muted small' });
    const sync = () => {
      const s = d.shares.find((x) => x.share.id === share.value);
      const p = s.payouts.find((x) => x.month === m.value);
      hint.textContent = `قبض السهم: ${s.payouts.map((x) => `${F.month(x.month)} ${egp(x.amount)}${x.remaining === 0 ? ' ✓' : ''}`).join(' + ') || 'مش محدد'} · اتقبض ${egp(s.received)} من ${egp(s.total)}`;
      if (!entry && p && p.remaining > 0) amount.setUnits(p.remaining);
    };
    share.addEventListener('change', () => {
      const s = d.shares.find((x) => x.share.id === share.value);
      if (s.nextPayout) m.value = s.nextPayout.month;
      sync();
    });
    m.addEventListener('change', sync);
    body.append(
      err,
      field(d.organizer ? 'سلّمت لـ' : 'السهم', share),
      hint,
      field('على حساب شهر', m),
      field('المبلغ', amount),
      field('التاريخ', date),
      saveButton(
        'حفظ',
        async () => {
          const v = amount.units();
          need(v > 0, 'اكتب المبلغ');
          if (await commitEntry({ kind: 'assoc.payout', assocId: a.id, shareId: share.value, month: m.value, amount: v, date: date.value || ctx.today() }, entry)) {
            toast('تم التسجيل');
            close();
          }
        },
        err,
      ),
    );
    sync();
  });
}

// ---------- سهم لحد تاني: دفعلي / سلّمته ----------
export function transferForm(id, shareId, dir, entry = null) {
  const d = dataOf(id);
  const s = d.shares.find((x) => x.share.id === shareId);
  const who = ownerName(s.share.ownerId);
  openSheet(entry ? 'تعديل' : dir === 'in' ? `${who} دفعلي` : `سلّمت ${who}`, (body, close) => {
    const err = errorBox();
    const suggest = dir === 'in' ? s.ownerLate || s.installment : Math.max(0, s.ownerBalance);
    const amount = moneyInput(entry?.amount ?? (suggest || null));
    const date = dateInput(entry?.date);
    const note = textInput(entry?.note || '', 'اختياري');
    body.append(
      err,
      h('p', { class: 'muted small', text: `رصيده معاك دلوقتي: ${s.ownerBalance >= 0 ? `ليه ${egp(s.ownerBalance)}` : `عليه ${egp(-s.ownerBalance)}`} (دفعلك ${egp(s.tin)} · دفعت لسهمه ${egp(s.paid)} · قبضت لسهمه ${egp(s.received)} · سلّمته ${egp(s.tout)})` }),
      field('المبلغ', amount),
      field('التاريخ', date),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const v = amount.units();
          need(v > 0, 'اكتب المبلغ');
          if (await commitEntry(clean({ kind: 'assoc.transfer', assocId: id, shareId, dir: entry?.dir || dir, amount: v, date: date.value || ctx.today(), note: note.value.trim() }), entry)) {
            toast('تم التسجيل');
            close();
          }
        },
        err,
      ),
    );
  });
}

