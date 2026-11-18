// أعداد صحيحة فقط: المبالغ بالقرش (×100) والكميات بالألف (×1000).
// لا كسور عائمة في التخزين أبداً؛ التحويل من/إلى النص هنا فقط.
import { RULES } from '../config/rules.js';

export const MONEY = RULES.scales.money;
export const QTY = RULES.scales.qty;

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٫]/g, '.')
    .replace(/[٬,\s]/g, '');
}

// تقريب نصف لأعلى بعيداً عن الصفر (متماثل للسالب).
export function roundHalfUp(x) {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

// نص/رقم ← وحدات صحيحة. null إذا كان غير صالح أو فيه خانات عشرية أكثر من المعامل.
export function parseUnits(input, scale) {
  if (input === null || input === undefined) return null;
  const s = normalizeDigits(input).trim();
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '-' || s === '.') return null;
  const neg = s.startsWith('-');
  const [ip, fp = ''] = (neg ? s.slice(1) : s).split('.');
  const decimals = String(scale).length - 1;
  if (fp.replace(/0+$/, '').length > decimals) return null;
  const units = Number(ip || '0') * scale + Number((fp + '000000').slice(0, decimals) || '0');
  if (!Number.isSafeInteger(units)) return null;
  return neg ? -units : units;
}

// رقم عائم من مصدر خارجي (الإكسيل) ← وحدات مع التقريب.
export const unitsFromFloat = (x, scale) => roundHalfUp(Number(x) * scale);

export function formatUnits(units, scale, { arabic = false, sign = false, decimals = null } = {}) {
  if (units === null || units === undefined || Number.isNaN(units)) return '—';
  let u = units;
  const maxDec = String(scale).length - 1;
  if (decimals !== null && decimals < maxDec) {
    const step = 10 ** (maxDec - decimals);
    u = roundHalfUp(u / step) * step;
  }
  const neg = u < 0;
  const abs = Math.abs(u);
  const ip = Math.floor(abs / scale);
  const fp = abs % scale;
  let out = String(ip).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (fp) out += '.' + String(fp).padStart(maxDec, '0').replace(/0+$/, '');
  if (neg && u !== 0) out = '-' + out;
  else if (sign && u > 0) out = '+' + out;
  if (arabic) out = out.replace(/\d/g, (d) => AR_DIGITS[d]).replace(/,/g, '٬').replace('.', '٫');
  return out;
}

export const parseMoney = (s) => parseUnits(s, MONEY);
export const parseQty = (s) => parseUnits(s, QTY);
export const fmtMoney = (u, o) => formatUnits(u, MONEY, o);
export const fmtQty = (u, o) => formatUnits(u, QTY, o);
export const isAmount = (x) => Number.isSafeInteger(x);

// round(a*b/c) بدقة كاملة (BigInt عند تجاوز المدى الآمن).
export function mulDiv(a, b, c) {
  if (c === 0) throw new Error('قسمة على صفر');
  const p = a * b;
  if (Number.isSafeInteger(p)) return roundHalfUp(p / c);
  const A = BigInt(a) * BigInt(b);
  const C = BigInt(c);
  const neg = A < 0n !== C < 0n;
  const absA = A < 0n ? -A : A;
  const absC = C < 0n ? -C : C;
  const q = (absA * 2n + absC) / (absC * 2n);
  return Number(neg ? -q : q);
}

// المبلغ = الكمية × سعر الوحدة (الكمية ×1000، السعر بالقرش) مقرَّباً لأقرب قرش.
export const lineAmount = (qtyUnits, priceUnits) => mulDiv(qtyUnits, priceUnits, QTY);

// تقسيم مبلغ بأوزان صحيحة: كل بند مقرَّب، وآخر بند ذو وزن يأخذ الباقي (المجموع محفوظ دائماً، سالباً أو موجباً).
export function splitByWeights(total, weights) {
  const W = weights.reduce((a, b) => a + b, 0);
  if (!(W > 0)) throw new Error('أوزان التقسيم غير صالحة');
  let last = -1;
  weights.forEach((w, i) => {
    if (w > 0) last = i;
  });
  const parts = weights.map((w) => (w > 0 ? mulDiv(total, w, W) : 0));
  const rest = total - parts.reduce((a, b) => a + b, 0);
  parts[last] += rest;
  return parts;
}

// نسبة مئوية لعرض فقط (عائم مسموح للعرض لا للتخزين).
export const ratio = (a, b) => (b ? a / b : null);
