// نماذج الدواجن: دورة، حصص، ضيف، مصروف، بيع، دفعة، نافق/إنتاج، جرد، وإدخال شهر كامل دفعة واحدة.
import { h, clear } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { checkbox, chips, dateInput, errorBox, field, intInput, moneyInput, monthSelect, openSheet, pickButton, pickOption, qtyInput, selectInput, textArea, textInput, toast, confirmDialog } from '../../components.js';
import { commitEntry, personName, personPicker, saveButton, simpleEntityForm } from '../../forms-common.js';
import { entity, isClosed, listEntities } from '../../../core/engine.js';
import { lineAmount, mulDiv, QTY } from '../../../core/money.js';
import { parseShare, sumShares, formatShare } from '../../../core/shares.js';
import { ValidationError, ymOf, lastDayOf, addMonths, monthsRange } from '../../../core/util.js';
import { BREEDS, CYCLE_STATUS, PRICE_CHECK, PRODUCTS } from '../../../core/modules/poultry/config.js';
import { cycleData, guestAt, priceCheck, unitPriceStats } from '../../../core/modules/poultry/calc.js';

const cats = () => listEntities(ctx.state, 'poultry.category').sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
const grades = () => listEntities(ctx.state, 'poultry.grade').sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
const cycleOf = (id) => entity(ctx.state, 'poultry.cycle', id);
const need = (cond, msg) => {
  if (!cond) throw new ValidationError(msg);
};

// الفترات التي يُضاف عليها قيد في الدورة: التأسيس (التربية)، البشاير، أو شهر منتظم — كل منها بشهوره.
// include: شهر يجب أن يظهر (عند تعديل قيد قديم أو شهر بعيد).
export function cyclePeriods(c, { include = null, today = ctx.today() } = {}) {
  let now = ymOf(today);
  if (include && include > now) now = include;
  const start = include && include < ymOf(c.startDate) ? include : ymOf(c.startDate);
  const lay = c.layStart ? ymOf(c.layStart) : null;
  const settle = c.settleFrom || null;
  const hasLay = !!lay && (!settle || lay < settle);
  const firstOp = hasLay ? lay : settle;
  const out = [];
  const rearingEnd = firstOp ? addMonths(firstOp, -1) : now > start ? now : start;
  if (rearingEnd >= start) out.push({ kind: 'rearing', short: 'التأسيس', months: monthsRange(start, rearingEnd), hint: 'يُضاف لتكلفة التأسيس ويوزَّع بحصص الشركاء في الشهر المختار (ويتحمّل الضيف نسبته لو كان موجوداً وقتها).' });
  if (hasLay) out.push({ kind: 'lay', short: 'البشاير', months: monthsRange(lay, settle ? addMonths(settle, -1) : now > lay ? now : lay), hint: 'يُحسب ضمن فترة البشاير (صرفها ودخلها معاً)، وصافيها يُضاف للتأسيس ويوزَّع بالحصص.' });
  if (settle) out.push({ kind: 'month', short: 'شهر منتظم', months: monthsRange(settle, addMonths(now > settle ? now : settle, 2)), hint: 'يدخل في حساب هذا الشهر ويوزَّع بحصص الشركاء فيه.' });
  return out;
}

// التاريخ الفعلي + «الحساب على»: فترة التأسيس، أو فترة البشاير، أو شهر منتظم محدد.
// الشهور المقفولة تظهر بقفل، مع زر لفتحها بسبب. onTarget: يُستدعى عند تغيير الشهر المستهدف.
function dateTarget(cycleId, date, month, { onTarget = null, dateLabel = 'التاريخ الفعلي' } = {}) {
  const c = cycleOf(cycleId);
  const scope = `poultry:${cycleId}`;
  const d = dateInput(date);
  const periods = cyclePeriods(c, { include: month || null });
  const kindOf = (mo) => periods.find((p) => p.months.includes(mo))?.kind || null;
  let kind = (month && kindOf(month)) || kindOf(ymOf(d.value)) || periods[periods.length - 1].kind;
  let touched = !!month;
  let sel = null;
  const selBox = h('div', {});
  const info = h('div', { class: 'hint' });
  const closed = (mo) => isClosed(ctx.state, scope, mo);
  const status = () => {
    clear(info);
    const p = periods.find((x) => x.kind === kind);
    info.append(p.hint);
    if (!closed(sel.value)) return;
    const months = kind === 'month' ? [sel.value] : p.months.filter(closed);
    info.append(
      h('div', { class: 'closed-note' }, `🔒 ${kind === 'month' ? 'الشهر' : 'الفترة'} مقفول${kind === 'month' ? '' : 'ة'} — لن يُقبل القيد إلا بعد الفتح. `),
      h('button', {
        type: 'button',
        class: 'btn small',
        text: 'فتح للإضافة',
        onclick: async () => {
          const reason = await confirmDialog({ title: 'فتح للإضافة', message: 'بعد الإضافة يمكنك إقفالها مرة أخرى من شاشة الشهور.', okText: 'فتح', input: { label: 'السبب', required: true, value: 'إضافة قيد متأخر' } });
          if (!reason) return;
          await ctx.store.run((b) => b.dispatchAll(months.map((mo) => ['month.reopen', { scope, month: mo, reason }])));
          build(sel.value);
          toast('تم الفتح');
        },
      }),
    );
  };
  const build = (keep) => {
    const p = periods.find((x) => x.kind === kind);
    const def = keep && p.months.includes(keep) ? keep : kind === 'month' && p.months.includes(ymOf(d.value)) ? ymOf(d.value) : p.months[p.months.length - 1];
    sel = selectInput(p.months.slice().reverse().map((mo) => ({ value: mo, label: `${F.month(mo)}${closed(mo) ? ' 🔒' : ''}` })), def);
    sel.setAttribute('aria-label', 'الشهر');
    sel.addEventListener('change', () => {
      touched = true;
      status();
      onTarget?.(sel.value);
    });
    clear(selBox);
    selBox.append(sel);
    status();
    onTarget?.(sel.value);
  };
  const kinds = chips(periods.map((p) => ({ value: p.kind, label: p.short })), kind, (v) => {
    kind = v;
    touched = true;
    build();
  });
  d.addEventListener('change', () => {
    const k = kindOf(ymOf(d.value));
    if (touched || !k || !d.value) return;
    kind = k;
    kinds.querySelectorAll('.chip').forEach((b, i) => b.classList.toggle('on', periods[i].kind === k));
    build(ymOf(d.value));
  });
  build(month || ymOf(d.value));
  const box = h('div', { class: 'target' }, kinds, selBox, info);
  return { d, m: { get value() { return sel.value; } }, fields: [field(dateLabel, d), h('div', { class: 'field' }, h('label', { text: 'الحساب على' }), box)] };
}

// كمية × سعر = إجمالي: اكتب أي اتنين والتالت يتحسب لوحده. بين السعر والإجمالي، آخر واحد كتبته هو الأساس:
//  • الأساس السعر ⇒ الإجمالي = الكمية × السعر (ويُخزَّن السعر).
//  • الأساس الإجمالي ⇒ سعر الوحدة = الإجمالي ÷ الكمية يظهر محسوباً، ولا يُخزَّن (يُشتق من القيد دائماً).
// الحقل المحسوب عليه علامة «auto» ويمكن الكتابة فيه فيصبح هو الأساس.
function linkQPA(q, p, a, { mode = 'price', onChange = null } = {}) {
  let autoA = false;
  let autoP = false;
  const recalc = () => {
    const qu = q.units();
    a.classList.remove('auto');
    p.classList.remove('auto');
    if (mode === 'price') {
      const pu = p.units();
      autoP = false;
      if (qu && pu) {
        a.setUnits(lineAmount(qu, pu));
        a.classList.add('auto');
        autoA = true;
      } else if (autoA) {
        a.value = '';
        autoA = false;
      }
    } else {
      const au = a.units();
      autoA = false;
      if (qu && au) {
        p.setUnits(mulDiv(au, QTY, qu));
        p.classList.add('auto');
        autoP = true;
      } else if (autoP) {
        p.value = '';
        autoP = false;
      }
    }
    onChange?.();
  };
  q.addEventListener('input', recalc);
  p.addEventListener('input', () => {
    autoP = false;
    if (p.value.trim()) mode = 'price';
    recalc();
  });
  a.addEventListener('input', () => {
    autoA = false;
    if (a.value.trim()) mode = 'total';
    recalc();
  });
  recalc();
  const parsed = () => ({ qu: q.units(), pu: p.units(), au: a.units() });
  return {
    recalc,
    get mode() {
      return mode;
    },
    // سعر الوحدة الفعلي (المكتوب أو المحسوب) أو null.
    unitPrice() {
      const { qu, pu, au } = parsed();
      if (!qu) return null;
      if (mode === 'price') return pu || null;
      return au ? mulDiv(au, QTY, qu) : null;
    },
    // المبلغ النهائي أو null (بلا رسائل خطأ) — للمجاميع أثناء الكتابة.
    amount() {
      const { qu, pu, au } = parsed();
      return mode === 'price' && qu && pu ? lineAmount(qu, pu) : au;
    },
    isEmpty: () => !q.value.trim() && !p.value.trim() && !a.value.trim(),
    // exactPrice: السعر مطلوب ومخزَّن (البيض): لو الأساس الإجمالي يُشتق السعر بشرط أن يطلع الإجمالي بالظبط.
    read({ prefix = '', withQty = true, exactPrice = false, priceMsg = 'أدخل الكمية والسعر' } = {}) {
      const { qu, pu, au } = parsed();
      if (withQty) {
        need(q.value.trim() === '' || qu !== null, `${prefix}الكمية غير صالحة`);
        need(p.value.trim() === '' || autoP || pu !== null, `${prefix}السعر غير صالح`);
      }
      need(a.value.trim() === '' || autoA || au !== null, `${prefix}المبلغ غير صالح`);
      if (!withQty) {
        need(au && au > 0, `${prefix}أدخل المبلغ`);
        return { amount: au };
      }
      if (mode === 'price' && qu && pu) return { qty: qu, price: pu, amount: lineAmount(qu, pu) };
      if (exactPrice) {
        need(qu && au, `${prefix}${priceMsg}`);
        const price = mulDiv(au, QTY, qu);
        need(price > 0 && lineAmount(qu, price) === au, `${prefix}اكتب السعر (الإجمالي مش بيتقسم على العدد بالظبط)`);
        return { qty: qu, price, amount: au };
      }
      need(au && au > 0, `${prefix}أدخل المبلغ (أو الكمية والسعر)`);
      return { qty: qu || undefined, amount: au };
    },
  };
}

const initialMode = (e) => (e && !e.price && (e.qty || e.weight) && e.amount ? 'total' : 'price');

// سطر «كمية × سعر = إجمالي» مع حساب تلقائي، أو مبلغ إجمالي فقط.
function qtyPriceAmount({ qty = null, price = null, amount = null, qtyLabel = 'الكمية', priceLabel = 'سعر الوحدة', showQty = true, mode = 'price', onChange = null }) {
  const q = qtyInput(qty);
  const p = moneyInput(price);
  const a = moneyInput(amount);
  const hint = h('div', { class: 'hint' });
  let link;
  const update = () => {
    hint.textContent = !showQty ? '' : link?.mode === 'total' && q.units() && a.units() ? `${priceLabel} محسوب = الإجمالي ÷ الكمية` : q.units() && p.units() ? 'الإجمالي = الكمية × السعر' : 'اكتب أي اتنين من الكمية والسعر والإجمالي، والتالت يتحسب لوحده';
    onChange?.();
  };
  link = linkQPA(q, p, a, { mode, onChange: update });
  update();
  const els = showQty ? [h('div', { class: 'grid2' }, field(qtyLabel, q), field(priceLabel, p)), field('الإجمالي', a), hint] : [field('المبلغ', a)];
  return {
    els,
    link,
    unitPrice: () => (showQty ? link.unitPrice() : null),
    qtyUnits: () => (showQty ? q.units() : null),
    read: (o = {}) => link.read({ withQty: showQty, ...o }),
  };
}

// مراجعة سعر الوحدة وقت الإدخال: يقارن بمتوسط مشتريات نفس البند في آخر شهور وبآخر مرة، وينبّه لو الفرق كبير.
function priceReview({ excludeId = null } = {}) {
  const el = h('div', { class: 'price-review', role: 'status' });
  el.style.display = 'none';
  el.update = ({ category, unitPrice, date }) => {
    clear(el);
    const cat = entity(ctx.state, 'poultry.category', category);
    if (!cat?.unit || !unitPrice || !date) {
      el.style.display = 'none';
      return;
    }
    const st = unitPriceStats(ctx.state, category, date, { excludeId });
    const ref = st.avg ?? st.last?.price ?? null;
    const chk = priceCheck(unitPrice, ref);
    const pct = (x) => `${x > 0 ? '+' : ''}${F.num(Math.round(x * 1000) / 10)}%`;
    el.className = `price-review ${chk?.warn ? 'warn' : ''}`;
    el.append(h('div', { class: 'big', text: `سعر ال${cat.unit}: ${F.egp(unitPrice)}` }));
    if (st.avg !== null) el.append(h('div', { text: `متوسط آخر ${F.num(st.months)} شهور: ${F.egp(st.avg)}${chk && st.avg === ref ? ` (${pct(chk.diff)})` : ''}` }));
    else el.append(h('div', { text: `مفيش مشتريات ${cat.name} في آخر ${F.num(st.months)} شهور للمقارنة` }));
    if (st.last) el.append(h('div', { text: `آخر مرة (${F.date(st.last.date)}): ${F.egp(st.last.price)}${st.avg === null && chk ? ` (${pct(chk.diff)})` : ''}` }));
    if (chk?.warn) el.append(h('div', { class: 'warn-line', text: `⚠️ الفرق أكبر من ${F.num(PRICE_CHECK.warnPct)}% — راجع الكمية والإجمالي` }));
    el.style.display = '';
  };
  return el;
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

// ---------- الدورة ----------
export function cycleForm(cycle = null) {
  openSheet(cycle ? 'تعديل الدورة' : 'دورة جديدة', (body, close) => {
    const err = errorBox();
    const name = textInput(cycle?.name || '', 'مثال: مزرعتنا-مايو-2026-أبيض');
    const farms = () => listEntities(ctx.state, 'poultry.farm').map((f) => ({ value: f.id, label: f.name }));
    let farm = selectInput(farms(), cycle?.farmId || '', { placeholder: 'بدون' });
    const farmWrap = h('div', { class: 'picker' }, farm, h('button', { type: 'button', class: 'btn small', text: '+ مزرعة', onclick: () => simpleEntityForm('poultry.farm', 'مزرعة', null, { onSaved: (f) => { const n = selectInput(farms(), f.id, { placeholder: 'بدون' }); farm.replaceWith(n); farm = n; } }) }));
    const breed = selectInput(BREEDS.map((b) => ({ value: b, label: b })), cycle?.breed || BREEDS[0]);
    const start = dateInput(cycle?.startDate);
    const birds = intInput(cycle?.birds ?? '');
    const age = intInput(cycle?.ageDays ?? '1');
    const lay = h('input', { type: 'date', value: cycle?.layStart || '' });
    const settle = monthSelect(cycle?.settleFrom || '', {});
    settle.prepend(h('option', { value: '', text: 'لم ينتظم الإنتاج بعد' }));
    settle.value = cycle?.settleFrom || '';
    const manager = personPicker(cycle?.managerId || '', { placeholder: 'اختر المدير' });
    const groups = listEntities(ctx.state, 'group').map((g) => ({ value: g.id, label: g.name }));
    const group = selectInput(groups, cycle?.groupId || '', { placeholder: 'بدون' });
    const status = selectInput(Object.entries(CYCLE_STATUS).map(([value, label]) => ({ value, label })), cycle?.status || 'active');
    const end = h('input', { type: 'date', value: cycle?.endDate || '' });
    const note = textArea(cycle?.note || '');
    body.append(
      err,
      field('اسم مميز للدورة', name, 'الشهر والسنة + ما يميزها (المزرعة، السلالة) حتى لا تختلط الدورات الشغالة معاً'),
      field('المزرعة', farmWrap),
      h('div', { class: 'grid2' }, field('السلالة', breed), field('تاريخ البداية', start)),
      h('div', { class: 'grid2' }, field('عدد الطيور عند الشراء', birds), field('عمر الطائر عند الشراء (يوم)', age)),
      field('بداية البيض (البشاير)', lay, 'قبل شهر البشاير: تأسيس وتربية (رأس مال). من البشاير حتى أول شهر منتظم: «فترة البشاير» تُحاسَب ككتلة واحدة.'),
      field('أول شهر منتظم في التسوية', settle, 'من هذا الشهر: حساب مكسب/خسارة كل شهر على حدة (بعد انتظام الإنتاج).'),
      field('المدير (السيولة في يده)', manager, 'أي عجز أو زيادة في النقدية يُحسب عليه'),
      h('div', { class: 'grid2' }, field('الحالة', status), field('تاريخ النهاية', end)),
      groups.length ? field('المجموعة', group) : null,
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const b = birds.int();
          const a = age.int();
          need(b !== null && !Number.isNaN(b), 'أدخل عدد الطيور');
          need(a === null || !Number.isNaN(a), 'العمر غير صالح');
          const data = clean({ id: cycle?.id, name: name.value.trim(), farmId: farm.value || null, breed: breed.value, startDate: start.value, birds: b, ageDays: a ?? 0, layStart: lay.value || null, settleFrom: settle.value || null, managerId: manager.value || null, groupId: group.value || null, status: status.value, endDate: end.value || null, note: note.value.trim() });
          for (const k of ['farmId', 'layStart', 'settleFrom', 'managerId', 'groupId', 'endDate']) if (!(k in data)) data[k] = null;
          const { result } = await ctx.store.run((bk) => bk.upsert('poultry.cycle', data));
          toast('تم حفظ الدورة');
          close();
          if (!cycle) {
            ctx.nav(`#/poultry/cycle/${result.id}/partners`);
            setTimeout(() => sharesForm(result.id), 50);
          }
        },
        err,
      ),
    );
  });
}

// ---------- الحصص ----------
export function sharesForm(cycleId, { base = null } = {}) {
  const c = cycleOf(cycleId);
  const data = cycleData(ctx.state, cycleId);
  const prev = base || data.currentShares;
  openSheet('حصص الشركاء', (body, close) => {
    const err = errorBox();
    const from = monthSelect(prev ? ctx.nowMonth() : ymOf(c.startDate));
    const rowsBox = h('div', { class: 'lines' });
    const total = h('div', { class: 'line-summary' });
    const rows = [];
    const directIds = () => rows.filter((r) => r.via.value === '').map((r) => r.person.value).filter(Boolean);
    const refreshVia = () => {
      for (const r of rows) {
        const cur = r.via.value;
        clear(r.via);
        r.via.append(h('option', { value: '', text: 'شريك مباشر مع المدير' }));
        for (const id of directIds()) if (id !== r.person.value) r.via.append(h('option', { value: id, text: `تابع لـ ${personName(id)}` }));
        r.via.value = [...r.via.options].some((o) => o.value === cur) ? cur : '';
      }
    };
    const recalc = () => {
      const parsed = rows.map((r) => parseShare(r.share.value)).filter(Boolean);
      const s = parsed.length ? sumShares(parsed) : { num: 0, den: 1 };
      const pct = (s.num * 100) / s.den;
      total.textContent = `المجموع: ${F.num(Math.round(pct * 100) / 100)}% ${s.num === s.den ? '✓' : `(المتبقي ${F.num(Math.round((100 - pct) * 100) / 100)}%)`}`;
      total.className = `line-summary ${s.num === s.den ? 'pos' : 'neg'}`;
    };
    const addRow = (st = {}) => {
      const person = personPicker(st.personId || '', { placeholder: 'الشريك' });
      const share = textInput(st.num ? `${st.num}/${st.den}` : '', '1/3 أو 50');
      share.inputMode = 'decimal';
      const via = h('select', {});
      via.append(h('option', { value: '', text: 'شريك مباشر مع المدير' }));
      const r = { person, share, via };
      const line = h('div', { class: 'line' }, h('div', { class: 'grid' }, person, share), via, h('button', { type: 'button', class: 'rm', 'aria-label': 'حذف', text: '×', onclick: () => (rows.splice(rows.indexOf(r), 1), line.remove(), refreshVia(), recalc()) }));
      rows.push(r);
      rowsBox.append(line);
      person.onChange(() => refreshVia());
      share.addEventListener('input', recalc);
      refreshVia();
      if (st.via) {
        refreshVia();
        via.value = st.via;
      }
    };
    if (prev) for (const st of prev.stakes) addRow(st);
    else {
      addRow({ personId: 'me' });
      if (c.managerId) addRow({ personId: c.managerId });
    }
    refreshVia();
    if (prev) prev.stakes.forEach((st, i) => (rows[i].via.value = st.via || ''));
    recalc();
    body.append(
      err,
      h('p', { class: 'muted small', text: 'كل حصة نسبة من الدورة كلها. اكتب كسراً مثل 1/3 أو نسبة مئوية مثل 50. الشريك «التابع» يدفع لرأسه ويستلم منه، وحساباته تظهر منفصلة.' }),
      field('تسري من شهر', from, prev ? 'الشهور السابقة تبقى بالحصص القديمة' : ''),
      rowsBox,
      h('button', { type: 'button', class: 'btn small', text: '+ شريك', onclick: () => addRow() }),
      total,
      saveButton(
        'حفظ الحصص',
        async () => {
          const stakes = rows.map((r) => {
            need(r.person.value, 'اختر كل الشركاء');
            const s = parseShare(r.share.value);
            need(s, `حصة ${personName(r.person.value)} غير صالحة — اكتب مثل 1/3 أو 50`);
            return { personId: r.person.value, num: s.num, den: s.den, via: r.via.value || null };
          });
          await commitEntry({ kind: 'poultry.shares', cycleId, date: `${from.value}-01`, from: from.value, stakes });
          toast('تم حفظ الحصص');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- التربية المشتركة (ضيف) ----------
export function guestForm(cycleId, { end = false, personId = '' } = {}) {
  const c = cycleOf(cycleId);
  openSheet(end ? 'الضيف أخذ طيوره' : 'تربية مشتركة مع ضيف', (body, close) => {
    const err = errorBox();
    const person = personPicker(personId, { placeholder: 'صاحب الطيور الضيف' });
    const date = dateInput();
    const g = intInput('');
    const t = intInput(c.birds ? String(c.birds * 2) : '');
    body.append(
      err,
      h('p', { class: 'muted small', text: end ? 'من هذا التاريخ لا يتحمّل الضيف أي مصروف.' : 'أحياناً نبدأ بتربية طيور لنا وطيور لشخص آخر معاً؛ يتحمّل الضيف نسبة طيوره من كل مصروف بعد هذا التاريخ حتى يأخذ طيوره. لو تغيّر العدد سجّل نسخة جديدة بتاريخها.' }),
      field('الضيف', person),
      field('من تاريخ', date),
      end ? null : h('div', { class: 'grid2' }, field('عدد طيور الضيف', g), field('إجمالي الطيور (لنا + له)', t)),
      saveButton(
        'حفظ',
        async () => {
          need(person.value, 'اختر الضيف');
          const gb = end ? 0 : g.int();
          const tb = end ? c.birds || 1 : t.int();
          need(Number.isInteger(gb) && Number.isInteger(tb), 'أدخل الأعداد');
          await commitEntry({ kind: 'poultry.guest', cycleId, date: date.value, personId: person.value, guestBirds: gb, totalBirds: Math.max(tb, gb + 1) });
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- المصروف ----------
const catOptions = () => cats().filter((x) => !x.archived).map((x) => ({ value: x.id, label: x.name, hint: x.unit ? `بال${x.unit}` : '' }));

export function expenseForm(cycleId, { month = null, entry = null } = {}) {
  const c = cycleOf(cycleId);
  openSheet(entry ? 'تعديل مصروف' : 'مصروف', (body, close) => {
    const err = errorBox();
    const opts = catOptions();
    if (entry && !opts.some((o) => o.value === entry.category)) opts.push({ value: entry.category, label: entity(ctx.state, 'poultry.category', entry.category)?.name || entry.category });
    const cat = pickButton(opts, entry?.category || 'feed', { title: 'البند', label: 'البند' });
    const dm = dateTarget(cycleId, entry?.date, entry?.month || month);
    const qpBox = h('div', {});
    const review = priceReview({ excludeId: entry?.id || null });
    let qp;
    const refresh = () => review.update({ category: cat.value, unitPrice: qp?.unitPrice(), date: dm.d.value });
    const build = () => {
      const k = entity(ctx.state, 'poultry.category', cat.value);
      const same = entry?.category === cat.value;
      qp = qtyPriceAmount({ qty: same ? entry?.qty : null, price: same ? entry?.price : null, amount: entry?.amount ?? null, qtyLabel: k?.unit ? `الكمية (${k.unit})` : 'الكمية', priceLabel: k?.unit ? `سعر ال${k.unit}` : 'سعر الوحدة', showQty: !!k?.unit, mode: same ? initialMode(entry) : 'price', onChange: () => refresh() });
      clear(qpBox);
      qpBox.append(...qp.els);
      refresh();
    };
    cat.addEventListener('change', build);
    dm.d.addEventListener('change', refresh);
    build();
    const capital = checkbox('رأسمالي (تجهيز/معدّة لا تدخل حساب الشهر، تُحسب على الدورة)', !!entry?.capital);
    const noGuest = checkbox('خاص بنا فقط (لا يتحمّل الضيف منه شيئاً)', !!entry?.noGuest);
    const hasGuest = cycleData(ctx.state, cycleId).guests.length > 0;
    const note = textArea(entry?.note || '', 'تفاصيل (اختياري)');
    body.append(
      err,
      field('البند', cat),
      qpBox,
      review,
      ...dm.fields,
      c.settleFrom ? capital : null,
      hasGuest ? noGuest : null,
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const v = qp.read();
          const e = clean({ kind: 'poultry.expense', cycleId, category: cat.value, date: dm.d.value, month: dm.m.value, ...v, capital: capital.input.checked || undefined, noGuest: noGuest.input.checked || undefined, note: note.value.trim() });
          await commitEntry(e, entry);
          toast('تم حفظ المصروف');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- البيع ----------
export function saleForm(cycleId, { month = null, entry = null, product = 'eggs' } = {}) {
  openSheet(entry ? 'تعديل بيع' : 'بيع', (body, close) => {
    const err = errorBox();
    let prod = entry?.product || product;
    const box = h('div', {});
    const dm = dateTarget(cycleId, entry?.date, entry?.month || month);
    const note = textArea(entry?.note || '');
    let reader = null;
    const same = (p) => (entry && entry.product === p ? entry : {});
    const build = () => {
      clear(box);
      const e = same(prod);
      if (prod === 'eggs') {
        // نوع البيض بأزرار (لا <select> وعجلته على iPhone).
        let grade = e.grade || 'normal';
        const gradeChips = chips(grades().map((g) => ({ value: g.id, label: g.name })), grade, (v) => (grade = v));
        const qp = qtyPriceAmount({ qty: e.qty, price: e.price, amount: e.amount, qtyLabel: 'عدد الأطباق', priceLabel: 'سعر الطبق' });
        box.append(h('div', { class: 'field' }, h('label', { text: 'نوع البيض' }), gradeChips), ...qp.els);
        reader = () => ({ grade, ...qp.read({ exactPrice: true, priceMsg: 'أدخل عدد الأطباق وسعر الطبق' }) });
      } else if (prod === 'birds') {
        const count = qtyInput(e.qty);
        const qp = qtyPriceAmount({ qty: e.weight, price: e.price, amount: e.amount, qtyLabel: 'الوزن الإجمالي (كجم)', priceLabel: 'سعر الكيلو', mode: initialMode(e) });
        box.append(field('عدد الطيور المباعة', count, 'يُخصم من عدد القطيع'), ...qp.els);
        reader = () => {
          const v = qp.read();
          return { qty: count.units() || undefined, weight: v.qty, price: v.price, amount: v.amount };
        };
      } else {
        const p = PRODUCTS[prod];
        const qp = qtyPriceAmount({ qty: e.qty, price: e.price, amount: e.amount, qtyLabel: `العدد (${p.unit || 'وحدة'})`, priceLabel: p.priceLabel, showQty: prod !== 'other', mode: initialMode(e) });
        box.append(...qp.els);
        reader = () => qp.read();
      }
    };
    const kinds = chips(Object.entries(PRODUCTS).map(([value, p]) => ({ value, label: p.name })), prod, (v) => {
      prod = v;
      build();
    });
    build();
    body.append(
      err,
      entry ? null : kinds,
      box,
      ...dm.fields,
      field('ملاحظة', note, prod === 'other' ? 'اكتب نوع الإيراد' : ''),
      saveButton(
        'حفظ',
        async () => {
          const v = reader();
          if (prod === 'other') need(note.value.trim(), 'اكتب نوع الإيراد في الملاحظة');
          await commitEntry(clean({ kind: 'poultry.sale', cycleId, product: prod, date: dm.d.value, month: dm.m.value, ...v, note: note.value.trim() }), entry);
          toast('تم حفظ البيع');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- الدفعات ----------
const PAY_TYPES = [
  { value: 'in', label: 'دفعة للدورة' },
  { value: 'out', label: 'استلام من الدورة' },
  { value: 'subIn', label: 'تابع دفع لرأسه' },
  { value: 'subOut', label: 'رأس دفع لتابعه' },
];

export function paymentForm(cycleId, { entry = null, type = null, personId = null } = {}) {
  const data = cycleData(ctx.state, cycleId);
  const direct = [...data.people.values()].filter((p) => p.isTop || p.isGuest || p.personId === data.cycle.managerId).map((p) => p.personId);
  const subs = [...data.people.values()].filter((p) => p.isSub);
  const initType = entry ? (entry.to === 'cycle' ? 'in' : entry.from === 'cycle' ? 'out' : subs.some((s) => s.personId === entry.from) ? 'subIn' : 'subOut') : type || 'in';
  openSheet(entry ? 'تعديل دفعة' : 'دفعة', (body, close) => {
    const err = errorBox();
    let kind = initType;
    const box = h('div', {});
    const amount = moneyInput(entry?.amount ?? null);
    const date = dateInput(entry?.date);
    const note = textArea(entry?.note || '');
    let read = null;
    const build = () => {
      clear(box);
      if (kind === 'in' || kind === 'out') {
        const cur = entry ? (kind === 'in' ? entry.from : entry.to) : personId || (direct.includes('me') ? 'me' : direct[0] || '');
        const p = personPicker(cur, { ids: direct.slice(), allowNew: false, placeholder: 'الشريك' });
        box.append(field(kind === 'in' ? 'الدافع (للمدير)' : 'المستلم (من المدير)', p, 'الشركاء المباشرون والضيوف فقط؛ التابع يتعامل مع رأسه'));
        read = () => {
          need(p.value, 'اختر الشخص');
          return kind === 'in' ? { from: p.value, to: 'cycle' } : { from: 'cycle', to: p.value };
        };
      } else {
        const sub = personPicker(entry ? (kind === 'subIn' ? entry.from : entry.to) : personId || subs[0]?.personId || '', { ids: subs.map((s) => s.personId), allowNew: false, placeholder: 'الشريك التابع' });
        const headOf = (id) => [...(data.people.get(id)?.heads || [])];
        const headLabel = h('div', { class: 'hint' });
        const upd = () => (headLabel.textContent = sub.value ? `رأسه: ${headOf(sub.value).map(personName).join('، ')}` : '');
        sub.onChange(upd);
        upd();
        box.append(field('الشريك التابع', sub), headLabel);
        read = () => {
          need(sub.value, 'اختر الشريك التابع');
          const head = headOf(sub.value)[0];
          return kind === 'subIn' ? { from: sub.value, to: head } : { from: head, to: sub.value };
        };
      }
    };
    const types = chips(PAY_TYPES.filter((t) => subs.length || !t.value.startsWith('sub')), kind, (v) => {
      kind = v;
      build();
    });
    build();
    body.append(
      err,
      types,
      box,
      field('المبلغ', amount, 'أي مبلغ — لا يلزم أن يساوي النصيب؛ الفرق يظهر في الرصيد ويُسوّى في التصفية'),
      field('التاريخ', date),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const a = amount.units();
          need(a && a > 0, 'أدخل المبلغ');
          await commitEntry(clean({ kind: 'poultry.payment', cycleId, date: date.value, amount: a, ...read(), note: note.value.trim() }), entry);
          toast('تم حفظ الدفعة');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- نافق / إنتاج / ملاحظة ----------
export function logForm(cycleId, { entry = null, month = null } = {}) {
  openSheet(entry ? 'تعديل' : 'نافق / إنتاج / حدث', (body, close) => {
    const err = errorBox();
    const dm = dateTarget(cycleId, entry?.date, entry?.month || month);
    const deaths = intInput(entry?.deaths ?? '');
    const trays = qtyInput(entry?.trays ?? null);
    const note = textArea(entry?.note || '', 'مثال: مرض تنفسي، كشف بيطري…');
    body.append(
      err,
      h('p', { class: 'muted small', text: 'اختياري وبأي فترة: يوم أو أسبوع أو شهر كامل. الإنتاج يُحسب من المبيعات تلقائياً حتى لو لم تسجله هنا.' }),
      h('div', { class: 'grid2' }, field('عدد النافق', deaths), field('الإنتاج (أطباق)', trays)),
      ...dm.fields,
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const d = deaths.int();
          need(d === null || !Number.isNaN(d), 'عدد النافق غير صالح');
          const t = trays.units();
          need(trays.value.trim() === '' || t !== null, 'عدد الأطباق غير صالح');
          await commitEntry(clean({ kind: 'poultry.log', cycleId, date: dm.d.value, month: dm.m.value, deaths: d || undefined, trays: t || undefined, note: note.value.trim() }), entry);
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- الجرد ----------
export function countForm(cycleId, { entry = null, item = 'birds' } = {}) {
  openSheet('جرد', (body, close) => {
    const err = errorBox();
    let kind = entry?.item || item;
    const box = h('div', {});
    const date = dateInput(entry?.date);
    const note = textArea(entry?.note || '');
    let read;
    const build = () => {
      clear(box);
      if (kind === 'birds') {
        const n = intInput(entry?.item === 'birds' ? entry.qty / QTY : '');
        box.append(field('عدد الطيور الحية فعلاً', n, 'يصبح هذا هو العدد من تاريخه، ويُخصم منه النافق والمباع بعده'));
        read = () => {
          const v = n.int();
          need(Number.isInteger(v), 'أدخل العدد');
          return { qty: v * QTY };
        };
      } else if (kind === 'feed') {
        const unit = entity(ctx.state, 'poultry.category', 'feed')?.unit || '';
        const n = qtyInput(entry?.item === 'feed' ? entry.qty : null);
        box.append(field(`العلف الموجود في المخزن${unit ? ` (${unit})` : ''}`, n, 'سجّله من وقت للتاني (مثلاً أول كل شهر). من جردين ورا بعض + المشتريات بينهم يتحسب الاستهلاك اليومي الفعلي.'));
        read = () => {
          const v = n.units();
          need(v !== null && v >= 0, 'أدخل الكمية');
          return { qty: v };
        };
      } else {
        const a = moneyInput(entry?.item === 'cash' ? entry.amount : null);
        box.append(field('النقدية الموجودة فعلاً مع المدير', a, 'يظهر الفرق عن المحسوب؛ أي عجز أو زيادة على المدير'));
        read = () => {
          const v = a.units();
          need(v !== null, 'أدخل المبلغ');
          return { amount: v };
        };
      }
    };
    const kinds = chips(
      [
        { value: 'birds', label: 'عدد الطيور' },
        { value: 'feed', label: 'العلف في المخزن' },
        { value: 'cash', label: 'النقدية مع المدير' },
      ],
      kind,
      (v) => {
        kind = v;
        build();
      },
    );
    build();
    body.append(
      err,
      entry ? null : kinds,
      box,
      field('التاريخ', date),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          await commitEntry(clean({ kind: 'poultry.count', cycleId, date: date.value, item: kind, ...read(), note: note.value.trim() }), entry);
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- إدخال شهر كامل (زي جدول الإكسيل) ----------
// كل سطر: زر البند (قائمة أزرار، لا <select> وعجلته على iPhone)، ثم الكمية والسعر والإجمالي (أي اتنين والتالت يتحسب).
// البند بلا وحدة: الإجمالي بس. «+ سطر» يسأل عن البند الأول، ولو فيه سطر فاضي يستخدمه بدل ما يزوّد سطر.
const SALE_KINDS = () => [
  ...grades().map((g) => ({ value: `eggs:${g.id}`, label: `بيض ${g.name}`, labels: ['عدد الأطباق', 'سعر الطبق'], exact: true })),
  { value: 'bags', label: 'شكاير فارغة', labels: ['العدد', 'سعر الشيكارة'] },
  { value: 'manure', label: 'سبلة', labels: ['العدد (نقلة)', 'السعر'] },
  { value: 'birds', label: 'طيور (لحم) بالكيلو', labels: ['الوزن (كجم)', 'سعر الكيلو'] },
  { value: 'other', label: 'إيراد آخر', labels: null },
];
const EXP_KINDS = () =>
  catOptions().map((o) => {
    const unit = entity(ctx.state, 'poultry.category', o.value)?.unit;
    return { ...o, labels: unit ? [`الكمية (${unit})`, `سعر ال${unit}`] : null };
  });

export function monthBatchForm(cycleId, { month = null } = {}) {
  openSheet('إدخال حسابات شهر أو فترة', (body, close) => {
    const err = errorBox();
    const sales = [];
    const exps = [];
    const defDate = (ym) => (lastDayOf(ym) < ctx.today() ? lastDayOf(ym) : ctx.today());
    let dateTouched = false;
    let date = null;
    const tgt = dateTarget(cycleId, null, month || null, {
      dateLabel: 'تاريخ التسجيل',
      onTarget: (ym) => {
        if (date && !dateTouched) date.value = defDate(ym);
        reviewAll();
      },
    });
    date = tgt.d;
    date.value = defDate(tgt.m.value);
    date.addEventListener('change', () => {
      dateTouched = true;
      reviewAll();
    });
    const m = tgt.m;
    const salesBox = h('div', { class: 'lines' });
    const expBox = h('div', { class: 'lines' });
    const summary = h('div', { class: 'line-summary' });
    function reviewAll() {
      for (const r of exps) r.review?.();
    }
    const recalc = () => {
      let s = 0;
      let x = 0;
      for (const r of sales) s += r.link.amount() || 0;
      for (const r of exps) x += r.link.amount() || 0;
      summary.textContent = `المبيعات ${F.money(s)} − المصروفات ${F.money(x)} = ${F.money(s - x)}`;
      summary.className = `line-summary ${s - x >= 0 ? 'pos' : 'neg'}`;
    };
    const lineFor = (list, boxEl, kinds, value, { title, isExpense }) => {
      const q = qtyInput();
      const p = moneyInput();
      const a = moneyInput();
      q.classList.add('q');
      p.classList.add('p');
      a.classList.add('a');
      const note = textInput('', 'ملاحظة');
      const labels = h('div', { class: 'grid3 labels' });
      const review = isExpense ? priceReview() : null;
      const kindOf = () => kinds.find((k) => k.value === r.kind.value);
      const r = { q, p, a, note };
      r.kind = pickButton(kinds, value, { title, label: isExpense ? 'البند' : 'النوع' });
      r.link = linkQPA(q, p, a, {
        onChange: () => {
          recalc();
          r.review?.();
        },
      });
      if (review) r.review = () => review.update({ category: r.kind.value, unitPrice: kindOf()?.labels ? r.link.unitPrice() : null, date: date.value });
      const line = h('div', { class: 'line' });
      const layout = () => {
        const k = kindOf();
        line.classList.toggle('no-qty', !k?.labels);
        clear(labels);
        if (k?.labels) {
          labels.append(h('span', { text: k.labels[0] }), h('span', { text: k.labels[1] }), h('span', { text: 'الإجمالي' }));
          q.placeholder = k.labels[0];
          p.placeholder = k.labels[1];
        } else {
          labels.append(h('span', { text: 'المبلغ' }));
          if (q.value || p.value) {
            q.value = '';
            p.value = '';
            r.link.recalc();
          }
        }
        a.placeholder = k?.labels ? 'الإجمالي' : 'المبلغ';
        r.review?.();
      };
      r.kind.addEventListener('change', layout);
      r.focus = () => (kindOf()?.labels ? q : a).focus();
      r.isEmpty = () => r.link.isEmpty() && !note.value.trim();
      line.append(r.kind, labels, h('div', { class: 'grid3' }, q, p, a), review, note, h('button', { type: 'button', class: 'rm', 'aria-label': 'حذف السطر', text: '×', onclick: () => (list.splice(list.indexOf(r), 1), line.remove(), recalc()) }));
      layout();
      list.push(r);
      boxEl.append(line);
      return r;
    };
    // «+ سطر»: اختر البند أولاً، ثم سطر فاضي موجود أو سطر جديد، والتركيز على أول خانة.
    const addLine = async (list, boxEl, kinds, opts) => {
      const v = await pickOption(kinds, null, opts.title);
      if (v === null) return;
      const empty = list.find((r) => r.isEmpty());
      let r = empty;
      if (r) {
        r.kind.value = v;
        r.kind.dispatchEvent(new Event('change'));
      } else r = lineFor(list, boxEl, kinds, v, opts);
      r.focus();
    };
    const saleOpts = { title: 'نوع البيع', isExpense: false };
    const expOpts = { title: 'بند المصروف', isExpense: true };
    lineFor(sales, salesBox, SALE_KINDS(), 'eggs:normal', saleOpts);
    lineFor(exps, expBox, EXP_KINDS(), 'feed', expOpts);
    recalc();
    body.append(
      err,
      h('p', { class: 'muted small', text: 'سجّل كل مبيعات ومصروفات شهر (أو فترة التأسيس أو البشاير) مرة واحدة. في كل سطر اكتب أي اتنين من الكمية والسعر والإجمالي والتالت يتحسب لوحده، أو الإجمالي بس. الأسطر الفاضية مش بتتحفظ.' }),
      ...tgt.fields,
      h('h3', { class: 'section-title', text: 'المبيعات' }),
      salesBox,
      h('button', { type: 'button', class: 'btn small', text: '+ سطر بيع', onclick: () => addLine(sales, salesBox, SALE_KINDS(), saleOpts) }),
      h('h3', { class: 'section-title', text: 'المصروفات' }),
      expBox,
      h('button', { type: 'button', class: 'btn small', text: '+ سطر مصروف', onclick: () => addLine(exps, expBox, EXP_KINDS(), expOpts) }),
      summary,
      saveButton(
        'حفظ كل الأسطر',
        async () => {
          const out = [];
          const base = { cycleId, date: date.value, month: m.value };
          sales.forEach((r, i) => {
            if (r.link.isEmpty()) return;
            const prefix = `سطر البيع ${i + 1}: `;
            const [prod, grade] = r.kind.value.split(':');
            const k = SALE_KINDS().find((x) => x.value === r.kind.value);
            const v = r.link.read({ prefix, withQty: !!k?.labels, exactPrice: !!k?.exact, priceMsg: 'البيض يحتاج عدد الأطباق وسعر الطبق' });
            const e = { kind: 'poultry.sale', ...base, product: prod, amount: v.amount, note: r.note.value.trim() || undefined };
            if (prod === 'eggs') Object.assign(e, { grade, qty: v.qty, price: v.price });
            else if (prod === 'birds') Object.assign(e, { weight: v.qty, price: v.price });
            else Object.assign(e, { qty: v.qty, price: v.price });
            if (prod === 'other') need(e.note, `${prefix}اكتب نوع الإيراد في الملاحظة`);
            out.push(clean(e));
          });
          exps.forEach((r, i) => {
            if (r.link.isEmpty()) return;
            const k = EXP_KINDS().find((x) => x.value === r.kind.value);
            const v = r.link.read({ prefix: `سطر المصروف ${i + 1}: `, withQty: !!k?.labels });
            out.push(clean({ kind: 'poultry.expense', ...base, category: r.kind.value, ...v, note: r.note.value.trim() || undefined }));
          });
          need(out.length, 'لا توجد أسطر للحفظ');
          await ctx.store.run((b) => b.addEntries(out));
          toast(`تم حفظ ${out.length} سطر`);
          close();
        },
        err,
      ),
    );
    reviewAll();
  });
}

// تعديل أي قيد دواجن بنموذجه.
export function editPoultryEntry(e) {
  const map = {
    'poultry.expense': () => expenseForm(e.cycleId, { entry: e }),
    'poultry.sale': () => saleForm(e.cycleId, { entry: e }),
    'poultry.payment': () => paymentForm(e.cycleId, { entry: e }),
    'poultry.log': () => logForm(e.cycleId, { entry: e }),
    'poultry.count': () => countForm(e.cycleId, { entry: e }),
    'poultry.shares': () => sharesForm(e.cycleId, { base: e }),
  };
  return map[e.kind] ? map[e.kind]() : null;
}

// إقفال/فتح شهر أو فترة (كل شهورها معاً).
export async function toggleMonthClose(cycleId, r) {
  const scope = `poultry:${cycleId}`;
  const months = r.months || [r.month];
  const label = months.length > 1 ? `الفترة ${F.month(months[0])} – ${F.month(months[months.length - 1])}` : `شهر ${F.month(months[0])}`;
  if (r.closed) {
    const reason = await confirmDialog({ title: `فتح ${label}`, message: 'الفتح يسمح بتعديل القيود. سجّل السبب.', okText: 'فتح', input: { label: 'السبب', required: true } });
    if (!reason) return;
    const closed = new Set(ctx.state.closed.get(scope)?.keys() || []);
    await ctx.store.run((b) => b.dispatchAll(months.filter((m) => closed.has(m)).map((m) => ['month.reopen', { scope, month: m, reason }])));
    toast('تم الفتح');
    return;
  }
  const ok = await confirmDialog({ title: `إقفال ${label}`, message: `الإقفال للحسابات فقط: لا يُضاف ولا يُعدَّل بيع أو مصروف على حسابها. الدفعات والاستلام تُسجَّل في أي وقت.\nالمبيعات ${F.money(r.sales)} · المصروفات ${F.money(r.expensesOurs)} · الصافي ${F.money(r.opNet + r.capNet)}`, okText: 'إقفال' });
  if (!ok) return;
  const closed = new Set(ctx.state.closed.get(scope)?.keys() || []);
  const data = cycleData(ctx.state, cycleId);
  await ctx.store.run((b) =>
    b.dispatchAll(
      months
        .filter((m) => !closed.has(m))
        .map((m) => {
          const x = data.months.find((y) => y.month === m);
          return ['month.close', { scope, month: m, totals: x ? { sales: x.sales, expenses: x.expensesOurs, opNet: x.opNet, capNet: x.capNet, alloc: x.alloc } : {} }];
        }),
    ),
  );
  toast('تم الإقفال');
}

// تسجيل التصفية: دفعة لكل سطر من الخطة بتاريخ اليوم.
export async function recordSettlement(cycleId, plan) {
  const ok = await confirmDialog({ title: 'تسجيل التصفية', message: `سيُسجَّل ${plan.transfers.length} دفعة بتاريخ اليوم فتصبح كل الأرصدة صفراً. يمكن إلغاء أي منها لاحقاً.`, okText: 'تسجيل' });
  if (!ok) return;
  const date = ctx.today();
  await ctx.store.run((b) => b.addEntries(plan.transfers.map((t) => ({ kind: 'poultry.payment', cycleId, date, from: t.from, to: t.to, amount: t.amount, note: 'تصفية' }))));
  toast('تم تسجيل التصفية');
}

export { formatShare };
