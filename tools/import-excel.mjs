#!/usr/bin/env node
// يحوّل شيت دورة دواجن من الإكسيل إلى نسخة احتياطية جاهزة للاستيراد في التطبيق (المزيد ← النسخ الاحتياطي ← استيراد).
//   الإدخال:  input/farm-extracted.json (من tools/excel_extract.py) + input/import-config.json (اختياري: الأسماء)
//   الناتج:   output/personal-assistant-import.json + output/import-report.md
// كل شيء محلي وخارج git. التحويل يقرأ بنية الشيت (مواضع العناوين والمعادلات) لا أرقاماً مكتوبة في الكود.
//
// بنية الشيت المتوقعة (كما في ملف المزرعة):
//   A1 «البداية» و A2 تاريخ البداية · «دفعت» ثم مبالغ الدفعات حتى SUM · «العدد» ثم عدد الطيور
//   «نسبتي في البداية» ثم نسبتي · «نسبة الأسر» ثم نسبة الشريك التابع · نسبة الناحية من معادلة الشهر (*0.5)
//   عمود A من «مصروفات التربية»: دفعات تنتهي كل منها بخلية SUM، وتاريخ الدفعة (إن وُجد) في عمود D بنفس الصف،
//   ونصيبنا من كل دفعة من عمود B (القسمة على الضيف بمعادلة مثل /2)
//   كل شهر كتلة من 4 أعمدة: صف 1 «شهر N» + السنة، جدول البيع (العدد، السعر، الإجمالي) من صف 4، وجدول المصروف من صف 18.
//   الكتلة الأولى («البداية») = فترة البشاير حتى انتظام الإنتاج؛ مصروفاتها داخلة أيضاً في دفعات التربية (الشيت يطرحها
//   من رأس المال)، فتُستبعد من آخر دفعات التربية حتى لا تُحسب مرتين.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Book } from '../app/src/core/book.js';
import { exportDoc } from '../app/src/core/backup.js';
import { computeCycle } from '../app/src/core/modules/poultry/calc.js';
import { MONEY, QTY, unitsFromFloat, roundHalfUp } from '../app/src/core/money.js';
import { addDays, addMonths, daysBetween, lastDayOf, ymOf } from '../app/src/core/util.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-11-18T00:00:00.000Z';
const opts = { now: NOW };
const m = (x) => unitsFromFloat(x, MONEY);
const colName = (c) => {
  let s = '';
  for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export function sheetApi(sheet) {
  const at = (c, r) => sheet.cells[`${colName(c)}${r}`] || null;
  const v = (c, r) => at(c, r)?.v ?? null;
  const findText = (re, col = null) => Object.values(sheet.cells).find((x) => typeof x.v === 'string' && re.test(x.v.trim()) && (col === null || x.c === col)) || null;
  return { at, v, findText, cells: sheet.cells };
}

// اختيار الشيت: من الإعداد، وإلا أحدث دورة (A1 = البداية).
function pickSheet(extracted, config) {
  if (config.sheet) {
    const s = extracted.sheets.find((x) => x.name.trim() === config.sheet.trim());
    if (!s) throw new Error(`الشيت غير موجود: ${config.sheet}`);
    return s;
  }
  const cycles = extracted.sheets.filter((s) => String(s.cells.A1?.v || '').trim() === 'البداية' && s.cells.A2?.v);
  cycles.sort((a, b) => String(b.cells.A2.v).localeCompare(String(a.cells.A2.v)));
  if (!cycles.length) throw new Error('لا يوجد شيت دورة (A1 = البداية)');
  return cycles[0];
}

export function parseCycleSheet(sheet) {
  const S = sheetApi(sheet);
  const warnings = [];
  const startDate = S.v(1, 2);
  const numsBelow = (cell, stopAtFormula = true) => {
    const out = [];
    for (let r = cell.r + 1; r < cell.r + 200; r++) {
      const x = S.at(cell.c, r);
      if (!x) break;
      if (x.f && stopAtFormula && /SUM/i.test(x.f)) break;
      if (typeof x.v === 'number' && !x.f) out.push({ r, v: x.v });
      else if (typeof x.v === 'number' && x.f && /^=\d+$/.test(x.f)) out.push({ r, v: x.v });
      else break;
    }
    return out;
  };
  const paidLbl = S.findText(/^دفعت$/, 1);
  const payments = paidLbl ? numsBelow(paidLbl).map((x) => x.v) : [];
  const birdsLbl = S.findText(/^العدد$/, 1);
  const birds = birdsLbl ? S.v(1, birdsLbl.r + 1) : null;
  const myLbl = S.findText(/^نسبتي في البداية$/, 1);
  const subLbl = S.findText(/^نسبة الأسر$/, 1);
  const myShare = myLbl ? S.v(1, myLbl.r + 1) : null;
  const subShare = subLbl ? S.v(1, subLbl.r + 1) : null;

  // كتل الشهور
  const blocks = [];
  for (let c = 3; c < 200; c += 4) {
    const head = S.at(c, 1);
    const yearCell = S.at(c + 1, 1);
    const resCell = S.at(c + 2, 1);
    if (!head && !yearCell) break;
    const mon = c === 3 ? Number(head?.v) : Number(String(head?.v || '').replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const year = Number(yearCell?.v);
    const factor = resCell?.f ? Number((resCell.f.match(/\*\s*([\d.]+)\s*$/) || [])[1] || (/\/\s*2\)?\s*$/.test(resCell.f) ? 0.5 : NaN)) : NaN;
    const sales = [];
    for (let r = 4; r <= 13; r++) {
      const cnt = S.v(c, r);
      const price = S.v(c + 1, r);
      if (typeof cnt === 'number' && typeof price === 'number' && cnt * price) sales.push({ r, count: cnt, price });
    }
    const expenses = [];
    for (let r = 18; r < 120; r++) {
      const x = S.at(c + 1, r);
      if (x?.f && /SUBTOTAL/i.test(x.f)) break;
      if (x && typeof x.v === 'number' && x.v) expenses.push({ r, amount: x.v, formula: x.f || null });
    }
    blocks.push({ col: c, mon, year, factor, result: resCell?.v ?? null, sales, expenses });
  }
  // تصحيح السنوات: الشهور متتالية (خطأ شائع: «شهر 12» مكتوب بسنة لاحقة)
  let prev = null;
  for (const b of blocks) {
    let ym = `${b.year}-${String(b.mon).padStart(2, '0')}`;
    if (prev) {
      const exp = addMonths(prev, 1);
      if (ym !== exp && Number(exp.slice(5, 7)) === b.mon) {
        warnings.push(`كتلة «شهر ${b.mon}» مكتوبة بسنة ${b.year} — صُححت إلى ${exp.slice(0, 4)} لأن الشهور متتالية`);
        ym = exp;
      }
    }
    b.month = ym;
    prev = ym;
  }
  const used = blocks.filter((b) => b.sales.length || b.expenses.length);
  for (const b of blocks.filter((x) => !used.includes(x))) if (b.result) warnings.push(`كتلة ${b.month} فارغة لكن نتيجتها ${b.result} (تعديل يدوي في الشيت؟) — تُتجاهل`);

  // دفعات مصروفات التربية في عمود A حتى آخر SUM، ونصيبنا من عمود B
  const batches = [];
  const birdsRow = birdsLbl ? birdsLbl.r + 1 : 16;
  let cur = [];
  for (let r = (subLbl ? subLbl.r + 2 : birdsRow + 1); r < 400; r++) {
    const x = S.at(1, r);
    if (!x) {
      if (cur.length && !S.at(1, r + 1)) break;
      continue;
    }
    if (typeof x.v !== 'number') continue;
    if (x.f && /SUM\(/i.test(x.f)) {
      const dv = S.v(4, r);
      batches.push({ endRow: r, items: cur, total: x.v, date: typeof dv === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dv) ? dv : null });
      cur = [];
    } else if (!x.f || /^=\d+$/.test(x.f)) cur.push(x.v);
  }
  // نصيبنا: عمود B تراكمي (B ينتهي بصف SUM أو بعده). نحسب نسبة كل دفعة من الفرق بين قيم B المتتالية.
  const bVals = Object.values(S.cells).filter((x) => x.c === 2 && typeof x.v === 'number' && x.r > birdsRow).sort((a, b) => a.r - b.r);
  const cumB = []; // [{ row, value, formula }]
  for (const b of bVals) cumB.push({ row: b.r, value: b.v, formula: b.f || '' });
  // لكل خلية B: هل هي تراكمية (تحتوي +B) أم نصيب دفعة/دفعات؟ نبني نسبة نصيبنا لكل دفعة.
  const ours = new Array(batches.length).fill(null);
  for (const b of cumB) {
    const refs = [...b.formula.matchAll(/A(\d+)/g)].map((x) => Number(x[1]));
    const covered = batches.map((bt, i) => (refs.includes(bt.endRow) || (refs.length && refs.some((rr) => rr === bt.endRow)) ? i : -1)).filter((i) => i >= 0);
    // خلية من نوع =A..+A.. ⇒ نصيب مشترك لدفعتين
    const sumCell = refs.length === 1 ? S.at(1, refs[0]) : null;
    let idx = covered;
    if (sumCell?.f && /^=A\d+\+A\d+$/i.test(sumCell.f.replace(/\s/g, ''))) idx = [...sumCell.f.matchAll(/A(\d+)/g)].map((x) => batches.findIndex((bt) => bt.endRow === Number(x[1]))).filter((i) => i >= 0);
    const cumulative = /B\d+/.test(b.formula);
    if (!idx.length) continue;
    const gross = idx.reduce((s, i) => s + batches[i].total, 0);
    const own = cumulative ? null : b.value;
    if (own !== null) for (const i of idx) ours[i] = own / gross;
  }
  for (let i = 0; i < ours.length; i++) if (ours[i] === null) ours[i] = 1;
  return { name: sheet.name, startDate, payments, birds, myShare, subShare, blocks: used, allBlocks: blocks, batches, ours, warnings };
}

// تصنيف أسطر البيع: بيض عادي/دبل، سبلة، شكاير (مبلغ إجمالي).
export function classifySale(row, normalPrices) {
  const { count, price } = row;
  if (count === 1 && price >= 10000) return { product: 'manure' };
  if (count === 1) return { product: 'bags' };
  if (price >= 60 && price <= 400) {
    const med = normalPrices.length ? normalPrices.sort((a, b) => a - b)[Math.floor(normalPrices.length / 2)] : price;
    if (count < 30 && price > med) return { product: 'eggs', grade: 'double' };
    return { product: 'eggs', grade: 'normal' };
  }
  return { product: 'bags', perUnit: true };
}

export function buildImport(extracted, config = {}) {
  const sheet = pickSheet(extracted, config);
  const p = parseCycleSheet(sheet);
  const report = [...p.warnings.map((w) => `⚠️ ${w}`)];
  const b = Book.seeded();
  const names = { manager: config.managerName || 'المدير', sub: config.subName || 'الأسر', guest: config.guestName || 'صاحب الطيور الضيف' };
  b.upsert('person', { id: 'p_manager', name: names.manager }, opts);
  b.upsert('person', { id: 'p_sub', name: names.sub, note: 'شريك تابع لي في دورة الدواجن' }, opts);
  const layBlock = p.blocks[0] || null;
  const layMonth = layBlock?.month || null;
  const settleFrom = p.blocks[1]?.month || null;
  const cycleId = 'cy_import1';
  b.upsert('poultry.cycle', { id: cycleId, name: config.cycleName || p.name, startDate: p.startDate, birds: p.birds || 0, ageDays: config.ageDays ?? 0, breed: config.breed || 'أبيض', layStart: layMonth ? `${layMonth}-01` : null, settleFrom, managerId: 'p_manager', status: 'active', note: `مستورد من الإكسيل (شيت ${p.name})` }, opts);
  if (layMonth) report.push(`فترة البشاير: ${layMonth}${settleFrom ? ` · أول شهر منتظم: ${settleFrom}` : ''}`);
  // الحصص: نسبتي، التابع لي، والباقي للمدير (نسبة الناحية من معادلة الشهر)
  const toFrac = (x) => {
    for (const d of [2, 3, 4, 5, 6, 8, 10, 12, 20, 100]) {
      const n = Math.round(x * d);
      if (Math.abs(n / d - x) < 1e-9) return { num: n, den: d };
    }
    throw new Error(`نسبة غير مفهومة: ${x}`);
  };
  const side = p.blocks.find((x) => Number.isFinite(x.factor))?.factor ?? 0.5;
  const me = toFrac(p.myShare ?? side);
  const sub = p.subShare ? toFrac(p.subShare) : null;
  const mgr = toFrac(1 - side);
  b.addEntry({ id: 'imp_shares', kind: 'poultry.shares', cycleId, date: p.startDate, from: ymOf(p.startDate), stakes: [{ personId: 'me', ...me, via: null }, ...(sub ? [{ personId: 'p_sub', ...sub, via: 'me' }] : []), { personId: 'p_manager', ...mgr, via: null }], note: 'من الإكسيل' }, opts);
  report.push(`الحصص: أنا ${me.num}/${me.den}${sub ? ` · ${names.sub} ${sub.num}/${sub.den} (تابع لي)` : ''} · ${names.manager} ${mgr.num}/${mgr.den}`);

  // تواريخ دفعات التربية: المعروف من عمود D، والباقي موزّع بالتساوي بين البداية وأول تاريخ معروف.
  const known = p.batches.map((x) => x.date);
  const firstKnown = known.findIndex(Boolean);
  const batchDates = p.batches.map((bt, i) => {
    if (bt.date) return bt.date;
    const end = firstKnown >= 0 ? known[firstKnown] : addDays(p.startDate, 120);
    const span = daysBetween(p.startDate, end);
    const n = firstKnown >= 0 ? firstKnown + 1 : p.batches.length;
    return addDays(p.startDate, Math.max(1, Math.round(((i + 1) * span) / n) - 1));
  });
  // الضيف: نسبة نصيبنا < 1 ⇒ ضيف بعدد طيور = طيورنا × (1/نسبتنا − 1)
  let guestOpen = false;
  const ourBirds = p.birds || 0;
  let prevRatio = 1;
  p.batches.forEach((bt, i) => {
    const r = p.ours[i];
    if (Math.abs(r - prevRatio) > 1e-9) {
      const date = i === 0 ? p.startDate : addDays(batchDates[i - 1], 1);
      if (!guestOpen) b.upsert('person', { id: 'p_guest', name: names.guest }, opts);
      const total = r < 1 ? Math.round(ourBirds / r) : ourBirds;
      b.addEntry({ id: `imp_guest_${i}`, kind: 'poultry.guest', cycleId, date, personId: 'p_guest', guestBirds: r < 1 ? total - ourBirds : 0, totalBirds: r < 1 ? total : ourBirds + 1, note: 'مستنتج من نسب القسمة في الإكسيل' }, opts);
      report.push(r < 1 ? `تربية مشتركة من ${date}: الضيف ${total - ourBirds} من ${total} طائر (نصيبنا ${r.toFixed(4)})` : `الضيف أخذ طيوره ${date}`);
      guestOpen = r < 1;
      prevRatio = r;
    }
  });
  if (guestOpen) report.push('⚠️ الضيف لم يُسجَّل خروجه في الشيت');

  const firstOp = layMonth || settleFrom;
  const preMonth = firstOp ? addMonths(firstOp, -1) : null;
  // رأس المال (نصيبنا) = مجموع دفعات التربية − مصروفات فترة البشاير المسجلة تفصيلاً (كما يفعل الشيت).
  const layExp = m(layBlock ? layBlock.expenses.reduce((a, x) => a + x.amount, 0) : 0);
  const oursTotal = p.batches.reduce((a, bt, i) => a + bt.items.reduce((x, amt) => x + m(amt) * p.ours[i], 0), 0);
  const budget = Math.round(oursTotal - layExp);
  let cum = 0;
  let cut = 0;
  const rearing = [];
  p.batches.forEach((bt, i) => {
    const date = batchDates[i];
    const month = firstOp && ymOf(date) >= firstOp ? preMonth : ymOf(date);
    const ratio = p.ours[i];
    bt.items.forEach((amt, j) => {
      const gross = m(amt);
      const ours = gross * ratio;
      let take = gross;
      if (cum + ours > budget + 0.5) take = Math.max(0, Math.round((budget - cum) / ratio));
      cut += gross - take;
      cum += take * ratio;
      if (take > 0) rearing.push({ id: `imp_rear_${i}_${j}`, kind: 'poultry.expense', cycleId, date, month, category: 'unclassified', amount: take, note: `تربية — دفعة ${i + 1} من الإكسيل${bt.date ? '' : ' (تاريخ تقريبي)'}${take < gross ? ` (جزء؛ الباقي ضمن فترة البشاير)` : ''}` });
    });
  });
  b.addEntries(rearing, opts);
  report.push(`مصروفات التأسيس والتربية: ${p.batches.length} دفعات، ${rearing.length} سطراً`);
  if (cut) report.push(`استُبعد من آخر دفعات التربية ${cut / MONEY} لأنه مسجل تفصيلاً في فترة البشاير`);

  // دفع الضيف لنصيبه (المستخدم: «يشيل فراخه ويكون دافع نصيبه»)
  if (b.state.entities.get('person').has('p_guest')) {
    const d0 = computeCycle(b.state, cycleId, NOW.slice(0, 10));
    const g = d0.people.get('p_guest');
    if (g?.guestCost) {
      const lastGuest = d0.guests[d0.guests.length - 1];
      b.addEntry({ id: 'imp_guest_paid', kind: 'poultry.payment', cycleId, date: lastGuest.date, from: 'p_guest', to: 'cycle', amount: g.guestCost, note: 'افتراض: الضيف دفع نصيبه كاملاً عند أخذ طيوره' }, opts);
      report.push(`افتراض: الضيف دفع نصيبه ${g.guestCost / MONEY}`);
    }
  }

  // دفعاتي للمدير (بلا تواريخ في الشيت)
  b.addEntries(p.payments.map((amt, i) => ({ id: `imp_pay_${i}`, kind: 'poultry.payment', cycleId, date: p.startDate, from: 'me', to: 'cycle', amount: m(amt), note: `دفعة ${i + 1} من الإكسيل (بدون تاريخ)` })), opts);
  report.push(`دفعاتي للمدير: ${p.payments.length} دفعة بمجموع ${p.payments.reduce((s, x) => s + x, 0)}`);

  // دفعة الشريك التابع (الأسر) لي — من الإعداد المحلي
  if (config.subPaid) {
    b.addEntry({ id: 'imp_sub_paid', kind: 'poultry.payment', cycleId, date: p.startDate, from: 'p_sub', to: 'me', amount: m(config.subPaid), note: 'دفعة الشريك التابع لنصيبه (التاريخ غير محدد في الشيت)' }, opts);
    report.push(`دفعة ${names.sub} لي: ${config.subPaid}`);
  }

  // الشهور
  const normalPrices = p.blocks.flatMap((x) => x.sales.filter((s) => s.count >= 30 && s.price >= 60 && s.price <= 400).map((s) => s.price));
  for (const blk of p.blocks) {
    const date = lastDayOf(blk.month) < NOW.slice(0, 10) ? lastDayOf(blk.month) : NOW.slice(0, 10);
    const es = [];
    blk.sales.forEach((s, i) => {
      const k = classifySale(s, normalPrices.slice());
      const id = `imp_sale_${blk.month}_${i}`;
      if (k.product === 'eggs') es.push({ id, kind: 'poultry.sale', cycleId, date, month: blk.month, product: 'eggs', grade: k.grade, qty: s.count * QTY, price: m(s.price), amount: roundHalfUp(s.count * m(s.price)), note: 'من الإكسيل' });
      else if (k.perUnit) es.push({ id, kind: 'poultry.sale', cycleId, date, month: blk.month, product: k.product, qty: s.count * QTY, price: m(s.price), amount: roundHalfUp(s.count * m(s.price)), note: 'من الإكسيل' });
      else es.push({ id, kind: 'poultry.sale', cycleId, date, month: blk.month, product: k.product, amount: m(s.count * s.price), note: 'من الإكسيل' });
    });
    blk.expenses.forEach((x, i) => es.push({ id: `imp_exp_${blk.month}_${i}`, kind: 'poultry.expense', cycleId, date, month: blk.month, category: 'unclassified', amount: m(x.amount), note: `من الإكسيل${x.formula ? ` (${x.formula})` : ''}` }));
    b.addEntries(es, opts);
  }
  report.push(`الشهور المستوردة: ${p.blocks.map((x) => x.month).join('، ')}`);
  // شهور الشيت تحاسبتم عليها بالفعل: تُقفل (يمكن فتحها بسبب من التطبيق).
  if (config.closeImported !== false) {
    const scope = `poultry:${cycleId}`;
    const ms = new Set();
    for (const r of computeCycle(b.state, cycleId, NOW.slice(0, 10)).months) if (r.month <= p.blocks[p.blocks.length - 1].month) ms.add(r.month);
    b.dispatchAll([...ms].sort().map((mo) => ['month.close', { scope, month: mo, totals: {}, note: 'مستورد من الإكسيل' }]), opts);
    report.push(`أُقفلت الشهور المستوردة حتى ${p.blocks[p.blocks.length - 1].month}`);
  }
  return { book: b, parsed: p, report, cycleId, layExp, oursTotal };
}

const layBlockSales = (parsed) => (parsed.blocks[0] ? parsed.blocks[0].sales.reduce((a, x) => a + x.count * x.price, 0) : 0);

// مقارنة بأرقام الإكسيل نفسه.
export function reconcile(extracted, config = {}) {
  const { book, parsed, cycleId, layExp, oursTotal } = buildImport(extracted, config);
  const d = computeCycle(book.state, cycleId, NOW.slice(0, 10));
  const checks = [];
  // التسامح: قرش لكل سطر حين يُقسم كل مصروف على الضيف ويُقرَّب منفرداً.
  const add = (label, app, excel, tol = 0.001) => checks.push({ label, app, excel, ok: Math.abs(app - excel) <= tol });
  for (const blk of parsed.blocks) {
    const r = d.months.find((x) => x.month === blk.month);
    add(`مبيعات ${blk.month}`, r.sales / MONEY, blk.sales.reduce((s, x) => s + x.count * x.price, 0));
    add(`مصروفات ${blk.month}`, r.expensesOurs / MONEY, blk.expenses.reduce((s, x) => s + x.amount, 0));
    const mine = r.alloc.filter((a) => a.personId === 'me' || a.via === 'me').reduce((s, a) => s + a.op + a.cap, 0);
    if (Number.isFinite(blk.result)) add(`نصيب ناحيتي ${blk.month}`, mine / MONEY, blk.result);
  }
  add('دفعاتي للمدير', d.people.get('me').paidCycle / MONEY, parsed.payments.reduce((s, x) => s + x, 0));
  const tol = parsed.batches.reduce((s, bt) => s + bt.items.length, 0) * 0.01;
  add('التربية (نصيبنا) = دفعات التربية − فترة البشاير', -d.totals.rearing.net / MONEY, (oursTotal - layExp) / MONEY, tol);
  add('التأسيس = التربية + صافي البشاير = كل دفعات التربية', d.totals.establishment / MONEY, oursTotal / MONEY - (layBlockSales(parsed) || 0), tol);
  if (config.subPaid && parsed.subShare) add('دفعة الشريك التابع = نصيبه من التربية قبل البشاير', config.subPaid, ((oursTotal - layExp) / MONEY) * parsed.subShare, 5);
  return { checks, d, parsed };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = join(ROOT, 'input/farm-extracted.json');
  if (!existsSync(src)) {
    console.error('شغّل أولاً: python3 -I tools/excel_extract.py input/farm.xlsx input/farm-extracted.json');
    process.exit(1);
  }
  const extracted = JSON.parse(readFileSync(src, 'utf8'));
  const cfgPath = join(ROOT, 'input/import-config.json');
  const config = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
  const { book, report } = buildImport(extracted, config);
  const { checks, d } = reconcile(extracted, config);
  mkdirSync(join(ROOT, 'output'), { recursive: true });
  const doc = exportDoc(book.events, { now: NOW, note: 'استيراد من الإكسيل' });
  writeFileSync(join(ROOT, 'output/personal-assistant-import.json'), JSON.stringify(doc));
  const lines = ['# تقرير استيراد الإكسيل', '', ...report.map((x) => `- ${x}`), '', '## المطابقة مع أرقام الإكسيل', '', '| البند | التطبيق | الإكسيل | |', '|---|---:|---:|---|', ...checks.map((c) => `| ${c.label} | ${c.app.toFixed(2)} | ${c.excel.toFixed(2)} | ${c.ok ? '✓' : '✗'} |`), '', `التأسيس (نصيبنا): ${(d.totals.establishment / MONEY).toFixed(2)} · صافي الدورة: ${(d.totals.net / MONEY).toFixed(2)} · رصيد ناحيتي: ${(d.people.get('me').sideBalance / MONEY).toFixed(2)}`];
  writeFileSync(join(ROOT, 'output/import-report.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}
