// نماذج العربية: العربية، قراءة العداد، الشغل (صيانة/تصليح/تعديل/سجل سابق) بقطعه ومبالغه، آخر مرة لبند،
// العطل، التعديل المخطط، وتعديل مدة بند في الجدول أو إضافة بند خاص.
import { h } from '../../dom.js';
import { ctx, F } from '../../ctx.js';
import { checkbox, chips, confirmDialog, dateInput, errorBox, field, intInput, moneyInput, openSheet, qtyInput, selectInput, textArea, textInput, toast } from '../../components.js';
import { commitEntry, personPicker, saveButton } from '../../forms-common.js';
import { entity } from '../../../core/engine.js';
import { lineAmount, QTY } from '../../../core/money.js';
import { ValidationError, newId } from '../../../core/util.js';
import { CAR_RULES, CAR_STATUS, ENGINES, FUELS, GEARBOXES, PRIORITY, QUICK_CHECKS, SEVERITY, SYSTEMS, TASK_KINDS, WORK_TYPES } from '../../../core/modules/car/config.js';
import { carData, needsAction, overrideId, taskName } from '../../../core/modules/car/calc.js';
import { dueText, everyText, km, statusBadge } from './fmt.js';

const need = (cond, msg) => {
  if (!cond) throw new ValidationError(msg);
};
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const opts = (obj) => Object.entries(obj).map(([value, label]) => ({ value, label }));
const optDate = (v) => h('input', { type: 'date', value: v || '' });
const dataOf = (carId) => carData(ctx.state, carId, ctx.today());
// رقم صحيح اختياري: null لو فاضي، ويرفض غير الصالح.
function optIntOf(el, msg) {
  const v = el.int();
  need(el.value.trim() === '' || Number.isInteger(v), msg);
  return el.value.trim() === '' ? null : v;
}
function optMoneyOf(el, msg) {
  if (el.value.trim() === '') return null;
  const v = el.units();
  need(v !== null && v >= 0, msg);
  return v;
}
// قراءة أبعد بكتير من المتوقع (رقم زيادة مثلاً) تحتاج تأكيد.
async function jumpOk(d, date, v) {
  if (!d.last || date < d.last.date) return true;
  const limit = d.last.km + Math.max(5000, CAR_RULES.jumpKmPerDay * Math.max(1, Math.round((Date.parse(date) - Date.parse(d.last.date)) / 86400000)));
  if (v <= limit) return true;
  return confirmDialog({ title: 'متأكد من العداد؟', message: `${km(v)} أكبر بكتير من آخر قراءة (${km(d.last.km)} يوم ${F.date(d.last.date)}). ممكن يكون فيه رقم زيادة.`, okText: 'أيوه صح' });
}
const lastHint = (d) => (d.last ? `آخر قراءة ${km(d.last.km)} يوم ${F.date(d.last.date)}${d.estimated ? ` · المتوقع الآن ≈ ${km(d.kmNow)}` : ''}` : '');

// قائمة اختيار بعلامات (للبنود والأعطال والتعديلات).
function checkRows(items, selected) {
  return items.map((it) => {
    const cb = h('input', { type: 'checkbox', checked: selected.has(it.id) });
    cb.setAttribute('aria-label', it.title);
    return { id: it.id, cb, el: h('label', { class: 'row' }, cb, h('div', { class: 'main' }, h('div', { class: 'title', text: it.title }), it.subtitle ? h('div', { class: 'subtitle', text: it.subtitle }) : null), it.badge || null) };
  });
}

// ---------- العربية ----------
export function carForm(car = null) {
  openSheet(car ? 'تعديل بيانات العربية' : 'عربية جديدة', (body, close) => {
    const err = errorBox();
    const name = textInput(car?.name ?? 'العربية', 'اسم تعرفها بيه');
    const model = textInput(car?.model ?? 'دايو لانوس', 'الماركة والموديل');
    const year = intInput(car?.year ?? (car ? '' : 2002));
    const engine = selectInput(opts(ENGINES), car?.engine || '1.5-8v');
    const gearbox = selectInput(opts(GEARBOXES), car?.gearbox || 'manual');
    const fuel = selectInput(opts(FUELS), car?.fuel || 'petrol');
    const ac = checkbox('فيها تكييف', car ? car.ac !== false : true);
    const ps = checkbox('دركسيون هيدروليك (باور)', car ? car.powerSteering !== false : true);
    const kmNow = intInput('');
    const plate = textInput(car?.plate || '', 'اختياري');
    const license = optDate(car?.licenseExpiry);
    const value = moneyInput(car?.value ?? null);
    const perMonth = intInput(car?.kmPerMonth ?? '');
    const readEvery = selectInput(
      [
        { value: '7', label: 'كل أسبوع' },
        { value: '14', label: 'كل أسبوعين' },
        { value: '30', label: 'كل شهر' },
      ],
      String(car?.readEveryDays || 7),
    );
    const status = selectInput(opts(CAR_STATUS), car?.status || 'active');
    const note = textArea(car?.note || '');
    body.append(
      err,
      field('الاسم', name),
      h('div', { class: 'grid2' }, field('النوع', model), field('سنة الصنع', year)),
      h('div', { class: 'grid2' }, field('المحرك', engine), field('الفتيس', gearbox)),
      field('الوقود', fuel),
      ac,
      ps,
      h('p', { class: 'muted small', text: 'المحرك والفتيس والوقود والتكييف بيحددوا بنود جدول الصيانة (مثلاً زيت الفتيس العادي أو الأوتوماتيك).' }),
      car ? null : field('العداد الآن (كم)', kmNow, 'من تابلوه العربية النهارده'),
      field('متوسط المشي في الشهر (تقريبي، اختياري)', perMonth, 'يُستخدم لحد ما التطبيق يحسب متوسطك من قراءات العداد'),
      field('تسجيل العداد', readEvery, 'التطبيق يفكّرك تسجّل العداد وتعمل فحص سريع كل المدة دي'),
      field('تاريخ انتهاء الرخصة', license, 'يفكّرك قبلها بشهر'),
      field('القيمة التقديرية لو اتباعت (اختياري)', value, 'تظهر ضمن ممتلكاتك في «وضعي المالي»'),
      field('رقم اللوحة', plate),
      car ? field('الحالة', status) : null,
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const y = optIntOf(year, 'سنة الصنع غير صالحة');
          const pm = optIntOf(perMonth, 'متوسط المشي غير صالح');
          const v = optMoneyOf(value, 'القيمة غير صالحة');
          const item = { id: car?.id || newId('car_'), name: name.value.trim(), model: model.value.trim() || null, year: y, engine: engine.value, gearbox: gearbox.value, fuel: fuel.value, ac: ac.input.checked, powerSteering: ps.input.checked, plate: plate.value.trim() || null, licenseExpiry: license.value || null, value: v, kmPerMonth: pm, readEveryDays: Number(readEvery.value), status: car ? status.value : 'active', note: note.value.trim() || null };
          if (car) {
            await ctx.store.run((b) => b.upsert('car.vehicle', item));
            toast('تم الحفظ');
            close();
            return;
          }
          const k = kmNow.int();
          need(Number.isInteger(k), 'اكتب العداد الحالي');
          await ctx.store.run((b) =>
            b.dispatchAll([
              ['entity.upsert', { kind: 'car.vehicle', item }],
              ['entry.add', { entry: { id: newId('n'), kind: 'car.odometer', carId: item.id, date: ctx.today(), km: k } }],
            ]),
          );
          toast('تم إضافة العربية');
          close();
          ctx.nav(`#/car/${item.id}`);
        },
        err,
      ),
    );
  });
}

// ---------- العداد ----------
export function odometerForm(carId, { entry = null } = {}) {
  const d = dataOf(carId);
  openSheet(entry ? 'تعديل قراءة العداد' : 'تسجيل العداد', (body, close) => {
    const err = errorBox();
    const k = intInput(entry?.km ?? '');
    k.placeholder = d.kmNow !== null ? String(d.kmNow) : '';
    const date = dateInput(entry?.date);
    const note = textInput(entry?.note || '', 'اختياري');
    body.append(
      err,
      field('قراءة العداد (كم)', k, entry ? '' : lastHint(d)),
      field('التاريخ', date),
      entry ? null : h('div', { class: 'card' }, h('div', { class: 'muted small', text: 'فحص سريع (دقيقتين):' }), h('ul', { class: 'small' }, QUICK_CHECKS.map((x) => h('li', { text: x })))),
      field('ملاحظة', note, 'لو لقيت حاجة في الفحص سجّلها «عطل»'),
      saveButton(
        'حفظ',
        async () => {
          const v = k.int();
          need(Number.isInteger(v), 'اكتب قراءة العداد');
          if (!(await jumpOk(d, date.value || ctx.today(), v))) return;
          await commitEntry(clean({ kind: 'car.odometer', carId, date: date.value || ctx.today(), km: v, note: note.value.trim() }), entry);
          toast('تم تسجيل العداد');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- الشغل: صيانة / تصليح / تعديل / سجل سابق ----------
const TYPE_HINTS = {
  service: 'علّم بنود الجدول اللي اتعملت — مواعيدها الجاية بتتحسب من العداد والتاريخ دول.',
  repair: 'علّم العطل اللي اتصلح (بيتقفل لوحده) واكتب اللي اتعمل والقطع والمبالغ.',
  upgrade: 'علّم التعديل المخطط اللي اتعمل (بيتقفل لوحده) واكتب التفاصيل والمبالغ.',
  history: 'لشغل اتعمل قبل ما تبدأ التسجيل هنا: علّم البنود واكتب العداد أو التاريخ اللي فاكره. المبالغ اختيارية.',
};

export function workForm(carId, { entry = null, type = 'service', tasks = [], faultIds = [], planIds = [] } = {}) {
  const d = dataOf(carId);
  openSheet(entry ? 'تعديل الشغل' : 'صيانة / تصليح', (body, close) => {
    const err = errorBox();
    let kind = entry?.type || type;
    const date = dateInput(entry?.date);
    const dateField = field('التاريخ', date);
    const unknownDate = checkbox('مش فاكر التاريخ (فاكر العداد بس)', !!entry?.dateUnknown);
    const kmIn = intInput(entry?.km ?? '');
    kmIn.placeholder = d.kmNow !== null ? String(d.kmNow) : '';
    const hint = h('div', { class: 'banner info small' });

    // بنود الجدول: المطلوب والقريب والمختار أولاً، والباقي تحت «باقي البنود».
    const selT = new Set(entry?.tasks || tasks);
    const all = d.tasks.filter((t) => !t.off || selT.has(t.id)).map((t) => ({ id: t.id, title: t.name, subtitle: dueText(t), badge: statusBadge(t), top: needsAction(t) || t.status === 'soon' || t.status === 'unknown' || selT.has(t.id) }));
    for (const id of selT) if (!all.some((x) => x.id === id)) all.push({ id, title: taskName(ctx.state, id), subtitle: 'لم يعد في الجدول', top: true });
    const taskRows = checkRows(all, selT);
    const topRows = taskRows.filter((r, i) => all[i].top);
    const restRows = taskRows.filter((r, i) => !all[i].top);

    const selF = new Set(entry?.faultIds || faultIds);
    const faultRows = checkRows(
      d.faults.filter((f) => f.state === 'open' || selF.has(f.id)).map((f) => ({ id: f.id, title: f.title, subtitle: [SYSTEMS[f.system || 'other'], F.date(f.date)].join(' · ') })),
      selF,
    );
    const selP = new Set(entry?.planIds || planIds);
    const planRows = checkRows(
      d.plans.filter((p) => p.state === 'planned' || selP.has(p.id)).map((p) => ({ id: p.id, title: p.title, subtitle: PRIORITY[p.priority || 'normal'] })),
      selP,
    );

    const title = textInput(entry?.title || '', 'مثلاً: تغيير مساعدين أمامي + جلب مقصات');
    const mech = personPicker(entry?.mechanicId || '', { placeholder: 'اختر (اختياري)' });
    const places = [...new Set(d.works.map((w) => w.place).filter(Boolean))];
    const place = textInput(entry?.place || '', 'اسم الورشة أو المكان (اختياري)');
    place.setAttribute('list', 'car-places');

    // قطع الغيار: الاسم، الكمية × سعر الوحدة = المبلغ (أو المبلغ على طول).
    const partNames = [...new Set(d.works.flatMap((w) => (w.parts || []).map((p) => p.name)))];
    const linesBox = h('div', { class: 'lines' });
    const lines = [];
    const labor = moneyInput(entry?.labor ?? null);
    const other = moneyInput(entry?.other ?? null);
    const totalEl = h('div', { class: 'line-summary' });
    const partAmount = (r) => {
      const qu = r.q.units();
      const pu = r.pr.value.trim() === '' ? null : r.pr.units();
      return qu && pu !== null ? lineAmount(qu, pu) : r.am.units();
    };
    const total = () => {
      const t = lines.reduce((a, r) => a + (partAmount(r) || 0), 0) + (labor.units() || 0) + (other.units() || 0);
      totalEl.textContent = `الإجمالي: ${F.money(t)} ج`;
    };
    const addLine = (p = {}) => {
      const name = textInput(p.name || '', 'اسم القطعة');
      name.setAttribute('list', 'car-parts');
      name.setAttribute('aria-label', 'اسم القطعة');
      const q = qtyInput(p.qty ?? QTY);
      const pr = moneyInput(p.price ?? null);
      const am = moneyInput(p.amount ?? null);
      q.setAttribute('aria-label', 'الكمية');
      pr.setAttribute('aria-label', 'سعر الوحدة');
      am.setAttribute('aria-label', 'مبلغ القطعة');
      pr.placeholder = 'سعر الوحدة';
      am.placeholder = 'المبلغ';
      const pnote = textInput(p.note || '', 'الماركة / أصلي / المحل (اختياري)');
      const r = { name, q, pr, am, pnote };
      const recalc = () => {
        const qu = q.units();
        const pu = pr.value.trim() === '' ? null : pr.units();
        if (qu && pu !== null) {
          am.setUnits(lineAmount(qu, pu));
          am.readOnly = true;
        } else am.readOnly = false;
        total();
      };
      q.addEventListener('input', recalc);
      pr.addEventListener('input', recalc);
      am.addEventListener('input', total);
      const line = h('div', { class: 'line' }, name, h('div', { class: 'grid3' }, q, pr, am), pnote, h('button', { type: 'button', class: 'rm', 'aria-label': 'حذف القطعة', text: '×', onclick: () => (lines.splice(lines.indexOf(r), 1), line.remove(), total()) }));
      lines.push(r);
      linesBox.append(line);
      recalc();
    };
    for (const p of entry?.parts || []) addLine(p);
    labor.addEventListener('input', total);
    other.addEventListener('input', total);
    total();
    const note = textArea(entry?.note || '');

    const typeChips = chips(opts(WORK_TYPES), kind, (v) => {
      kind = v;
      sync();
    });
    const sync = () => {
      hint.textContent = TYPE_HINTS[kind];
      unknownDate.style.display = kind === 'history' ? '' : 'none';
      dateField.style.display = kind === 'history' && unknownDate.input.checked ? 'none' : '';
    };
    unknownDate.input.addEventListener('change', sync);
    sync();

    const section = (label, rows, extra = null) => (rows.length || extra ? h('div', { class: 'field' }, h('div', { class: 'label', text: label }), rows.length ? h('div', { class: 'list pick-list' }, rows.map((r) => r.el)) : null, extra) : null);
    body.append(
      err,
      typeChips,
      hint,
      dateField,
      unknownDate,
      field('العداد وقت الشغل (كم)', kmIn, lastHint(d)),
      section('بنود الجدول اللي اتعملت', topRows, restRows.length ? h('details', { class: 'more-tasks' }, h('summary', { text: `باقي البنود (${F.num(restRows.length)})` }), h('div', { class: 'list pick-list' }, restRows.map((r) => r.el))) : null),
      section('أعطال اتصلحت', faultRows),
      section('تعديلات اتعملت', planRows),
      field('وصف الشغل', title, 'لو الشغل مش من بنود الجدول اكتبه هنا'),
      field('مين عمل الشغل', mech),
      field('المكان / الورشة', place),
      h('datalist', { id: 'car-places' }, places.map((x) => h('option', { value: x }))),
      h('datalist', { id: 'car-parts' }, partNames.map((x) => h('option', { value: x }))),
      h('div', { class: 'field' }, h('div', { class: 'label', text: 'قطع الغيار' }), h('div', { class: 'hint', text: 'لكل قطعة: الاسم، ثم الكمية × سعر الوحدة (أو المبلغ على طول).' }), linesBox, h('button', { type: 'button', class: 'btn small', text: '+ قطعة', onclick: () => addLine() })),
      h('div', { class: 'grid2' }, field('المصنعية', labor), field('مصاريف تانية (ونش، نقل…)', other)),
      totalEl,
      field('ملاحظة', note, 'الضمان، نصيحة الميكانيكي، حاجة يتعمل بعدين…'),
      saveButton(
        'حفظ',
        async () => {
          const k = optIntOf(kmIn, 'العداد غير صالح');
          if (k !== null && !(kind === 'history' && unknownDate.input.checked) && !(await jumpOk(d, date.value || ctx.today(), k))) return;
          const parts = lines
            .filter((r) => r.name.value.trim() || r.am.value.trim() || r.pr.value.trim())
            .map((r) => {
              const n = r.name.value.trim();
              need(n, 'اكتب اسم كل قطعة');
              const qu = r.q.units();
              need(r.q.value.trim() === '' || (qu !== null && qu > 0), `كمية «${n}» غير صالحة`);
              const pu = r.pr.value.trim() === '' ? null : r.pr.units();
              need(r.pr.value.trim() === '' || (pu !== null && pu >= 0), `سعر «${n}» غير صالح`);
              const amount = qu && pu !== null ? lineAmount(qu, pu) : r.am.units();
              need(amount !== null && amount >= 0, `اكتب مبلغ «${n}»`);
              return clean({ name: n, qty: qu || undefined, price: qu ? pu : undefined, amount, note: r.pnote.value.trim() });
            });
          const lab = optMoneyOf(labor, 'المصنعية غير صالحة');
          const oth = optMoneyOf(other, 'المصاريف غير صالحة');
          const amount = parts.reduce((a, p) => a + p.amount, 0) + (lab || 0) + (oth || 0);
          const pick = (rows) => rows.filter((r) => r.cb.checked).map((r) => r.id);
          const ts = pick(taskRows);
          const fs = pick(faultRows);
          const ps = pick(planRows);
          const e = clean({
            kind: 'car.work',
            carId,
            type: kind,
            date: date.value || ctx.today(),
            dateUnknown: kind === 'history' && unknownDate.input.checked ? true : undefined,
            km: k,
            tasks: ts.length ? ts : undefined,
            faultIds: fs.length ? fs : undefined,
            planIds: ps.length ? ps : undefined,
            title: title.value.trim(),
            mechanicId: mech.value || undefined,
            place: place.value.trim(),
            parts: parts.length ? parts : undefined,
            labor: lab || undefined,
            other: oth || undefined,
            amount,
            note: note.value.trim(),
          });
          const saved = await commitEntry(e, entry);
          if (!saved) return;
          toast('تم الحفظ');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- آخر مرة اتعمل بند (سجل سابق سريع) ----------
export function historyForm(carId, task) {
  openSheet(`آخر مرة: ${task.name}`, (body, close) => {
    const err = errorBox();
    const date = dateInput();
    const dateField = field('التاريخ (تقريبي يكفي)', date);
    const unknownDate = checkbox('مش فاكر التاريخ', false);
    unknownDate.input.addEventListener('change', () => (dateField.style.display = unknownDate.input.checked ? 'none' : ''));
    const k = intInput('');
    const mech = personPicker('', { placeholder: 'اختر (اختياري)' });
    const note = textInput('', 'اختياري');
    body.append(
      err,
      h('p', { class: 'muted small', text: 'سجّل اللي فاكره عن آخر مرة البند ده اتعمل، والتطبيق يحسب الموعد الجاي منه. لو مش فاكر خالص سيبه — هيفضل «مش معروف» لحد ما تعمله.' }),
      dateField,
      unknownDate,
      field('العداد وقتها (كم)', k, task.km > 0 ? 'الموعد الجاي بالكيلو بيتحسب منه' : 'اختياري'),
      field('مين عمله', mech),
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const v = optIntOf(k, 'العداد غير صالح');
          need(!unknownDate.input.checked || v !== null, 'لو مش فاكر التاريخ لازم تكتب العداد');
          await commitEntry(clean({ kind: 'car.work', carId, type: 'history', date: date.value || ctx.today(), dateUnknown: unknownDate.input.checked ? true : undefined, km: v, tasks: [task.id], mechanicId: mech.value || undefined, amount: 0, note: note.value.trim() }));
          toast('تم التسجيل');
          close();
        },
        err,
      ),
    );
  });
}

// ---------- العطل ----------
export function faultForm(carId, fault = null) {
  const d = dataOf(carId);
  const raw = fault ? entity(ctx.state, 'car.fault', fault.id) : null;
  const st = fault ? d.faults.find((f) => f.id === fault.id) : null;
  openSheet(fault ? 'العطل' : 'عطل جديد', (body, close) => {
    const err = errorBox();
    const title = textInput(raw?.title || '', 'مثلاً: صوت طقطقة من العجلة اليمين في المطبات');
    const date = dateInput(raw?.date);
    const k = intInput(raw?.km ?? '');
    k.placeholder = d.kmNow !== null ? String(d.kmNow) : '';
    const system = selectInput(opts(SYSTEMS), raw?.system || 'engine');
    const severity = selectInput(opts(SEVERITY), raw?.severity || 'soon');
    const note = textArea(raw?.note || '', 'الأعراض: امتى بيظهر، صوت، ريحة، لمبة في التابلوه…');
    const status = selectInput(
      [
        { value: 'open', label: 'مفتوح' },
        { value: 'closed', label: 'اتقفل بدون تصليح (اختفى / قررت أسيبه)' },
      ],
      raw?.status || 'open',
    );
    const closeNote = textInput(raw?.closeNote || '', 'السبب (اختياري)');
    body.append(
      err,
      st?.state === 'fixed' ? h('div', { class: 'banner info' }, h('span', { class: 'grow', text: `اتصلح ${F.date(st.fixedBy.date)}` }), h('button', { class: 'btn small', text: 'التصليح', onclick: () => (close(), ctx.nav(`#/entry/${st.fixedBy.id}`)) })) : null,
      field('العطل', title),
      h('div', { class: 'grid2' }, field('ظهر يوم', date), field('العداد وقتها', k)),
      h('div', { class: 'grid2' }, field('الجزء', system), field('الخطورة', severity)),
      field('الأعراض والتفاصيل', note),
      fault && st?.state !== 'fixed' ? h('div', { class: 'grid2' }, field('الحالة', status), field('سبب القفل', closeNote)) : null,
      saveButton(
        'حفظ',
        async () => {
          const v = optIntOf(k, 'العداد غير صالح');
          await ctx.store.run((b) => b.upsert('car.fault', { ...(raw ? { id: raw.id } : {}), carId, title: title.value.trim(), date: date.value || ctx.today(), km: v, system: system.value, severity: severity.value, note: note.value.trim() || null, status: fault ? status.value : 'open', closeNote: closeNote.value.trim() || null }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
      fault && st?.state === 'open'
        ? h('button', {
            class: 'btn block',
            style: { marginTop: '8px' },
            text: '🔧 اتصلح ← سجّل التصليح',
            onclick: () => {
              close();
              workForm(carId, { type: 'repair', faultIds: [fault.id] });
            },
          })
        : null,
      fault ? deleteButton('car.fault', raw, close, 'حذف العطل (اتسجل بالغلط)') : null,
    );
  });
}

function deleteButton(kind, raw, close, text) {
  return h('button', {
    class: 'btn danger block',
    style: { marginTop: '8px' },
    text,
    onclick: async () => {
      if (!(await confirmDialog({ title: text, message: 'هيختفي من القوائم. لو مذكور في شغل متسجل هيفضل اسمه ظاهر هناك.', okText: 'حذف', danger: true }))) return;
      await ctx.store.run((b) => b.upsert(kind, { id: raw.id, archived: true }));
      toast('تم الحذف');
      close();
    },
  });
}

// ---------- التعديل المخطط ----------
export function planForm(carId, plan = null) {
  const d = dataOf(carId);
  const raw = plan ? entity(ctx.state, 'car.plan', plan.id) : null;
  const st = plan ? d.plans.find((p) => p.id === plan.id) : null;
  openSheet(plan ? 'التعديل' : 'تعديل عاوز تعمله', (body, close) => {
    const err = errorBox();
    const title = textInput(raw?.title || '', 'مثلاً: تركيب حساسات ركن / تغيير فرش الكراسي');
    const system = selectInput(opts(SYSTEMS), raw?.system || 'body');
    const priority = selectInput(opts(PRIORITY), raw?.priority || 'normal');
    const target = optDate(raw?.targetDate);
    const tkm = intInput(raw?.targetKm ?? '');
    const est = moneyInput(raw?.estimate ?? null);
    const note = textArea(raw?.note || '', 'التفاصيل، الأسعار اللي سألت عليها، المكان…');
    const status = selectInput(
      [
        { value: 'planned', label: 'مخطط' },
        { value: 'cancelled', label: 'اتلغى' },
      ],
      raw?.status || 'planned',
    );
    body.append(
      err,
      st?.state === 'done' ? h('div', { class: 'banner info' }, h('span', { class: 'grow', text: `اتعمل ${F.date(st.doneBy.date)}` }), h('button', { class: 'btn small', text: 'الشغل', onclick: () => (close(), ctx.nav(`#/entry/${st.doneBy.id}`)) })) : null,
      field('التعديل', title),
      h('div', { class: 'grid2' }, field('الجزء', system), field('الأولوية', priority)),
      h('div', { class: 'grid2' }, field('ناوي تعمله يوم (اختياري)', target), field('أو عند عداد (اختياري)', tkm)),
      field('التكلفة التقديرية (اختياري)', est),
      field('التفاصيل', note),
      plan && st?.state !== 'done' ? field('الحالة', status) : null,
      saveButton(
        'حفظ',
        async () => {
          const v = optIntOf(tkm, 'العداد غير صالح');
          const e = optMoneyOf(est, 'التكلفة غير صالحة');
          await ctx.store.run((b) => b.upsert('car.plan', { ...(raw ? { id: raw.id } : {}), carId, title: title.value.trim(), system: system.value, priority: priority.value, targetDate: target.value || null, targetKm: v, estimate: e, note: note.value.trim() || null, status: plan ? status.value : 'planned' }));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
      plan && st?.state === 'planned'
        ? h('button', {
            class: 'btn block',
            style: { marginTop: '8px' },
            text: '✅ اتعمل ← سجّل الشغل',
            onclick: () => {
              close();
              workForm(carId, { type: 'upgrade', planIds: [plan.id] });
            },
          })
        : null,
      plan ? deleteButton('car.plan', raw, close, 'حذف التعديل') : null,
    );
  });
}

// ---------- بند في الجدول: تعديل المدة لبند من القالب، أو بند خاص ----------
export function taskForm(carId, t = null) {
  const tpl = t && !t.custom;
  const raw = t ? entity(ctx.state, 'car.task', tpl ? overrideId(carId, t.key) : t.id) : null;
  openSheet(tpl ? 'تعديل مدة البند' : t ? 'تعديل بند خاص' : 'بند صيانة خاص', (body, close) => {
    const err = errorBox();
    const name = textInput(t?.name || '', 'مثلاً: تشحيم الكوالين');
    const group = selectInput(opts(SYSTEMS), t?.group || 'other');
    const kind = selectInput(opts(TASK_KINDS), t?.kind || 'check');
    const kmIn = intInput(t ? t.km || '' : '');
    const mIn = intInput(t ? t.months || '' : '');
    const critical = checkbox('بند مهم (لو مش معروف آخر مرة يعتبر مطلوب)', !!t?.critical);
    const off = checkbox('إيقاف البند (مش محتاجه للعربية دي)', !!t?.off);
    const note = textArea(t?.userNote || '', 'ملاحظتك (الماركة اللي بتستخدمها، النوع…)');
    body.append(
      err,
      tpl ? h('div', { class: 'card' }, h('div', { class: 'title', text: t.name }), h('div', { class: 'muted small', text: `الافتراضي: ${everyText(t.defaults)}` })) : field('اسم البند', name),
      tpl ? null : h('div', { class: 'grid2' }, field('الجزء', group), field('النوع', kind)),
      h('div', { class: 'grid2' }, field('كل كام كيلو', kmIn, 'فاضي = بالوقت بس'), field('كل كام شهر', mIn, 'فاضي = بالكيلو بس')),
      h('p', { class: 'muted small', text: 'الموعد الجاي = آخر مرة + المدة، بالكيلو أو بالشهور أيهما أقرب.' }),
      tpl ? null : critical,
      off,
      field('ملاحظة', note),
      saveButton(
        'حفظ',
        async () => {
          const k = optIntOf(kmIn, 'الكيلومترات غير صالحة') || 0;
          const m = optIntOf(mIn, 'الشهور غير صالحة') || 0;
          const item = tpl
            ? { id: overrideId(carId, t.key), carId, key: t.key, km: k === t.defaults.km ? null : k, months: m === t.defaults.months ? null : m, off: off.input.checked, note: note.value.trim() || null }
            : { ...(raw ? { id: raw.id } : {}), carId, name: name.value.trim(), group: group.value, kind: kind.value, km: k, months: m, critical: critical.input.checked, off: off.input.checked, note: note.value.trim() || null };
          await ctx.store.run((b) => b.upsert('car.task', item));
          toast('تم الحفظ');
          close();
        },
        err,
      ),
      tpl && raw
        ? h('button', {
            class: 'btn block',
            style: { marginTop: '8px' },
            text: 'رجوع للمدة الافتراضية',
            onclick: async () => {
              await ctx.store.run((b) => b.upsert('car.task', { id: raw.id, carId, key: t.key, km: null, months: null, off: false }));
              toast('رجع للافتراضي');
              close();
            },
          })
        : null,
      t && !tpl ? deleteButton('car.task', raw, close, 'حذف البند') : null,
    );
  });
}

// تعديل قيد عربية بنموذجه.
export function editCarEntry(e) {
  if (e.kind === 'car.odometer') return odometerForm(e.carId, { entry: e });
  if (e.kind === 'car.work') return workForm(e.carId, { entry: e });
  return null;
}
