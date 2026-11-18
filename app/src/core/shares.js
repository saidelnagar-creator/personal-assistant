// الحصص ككسور صحيحة (بسط/مقام) حتى تكون ١/٣ و ١/٦ دقيقة تماماً بلا تقريب.
// الإدخال: «1/3» كسر، أو رقم عادي = نسبة مئوية («50» أو «33.33%»).
import { normalizeDigits, splitByWeights } from './money.js';

const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};
const lcm = (a, b) => (a / gcd(a, b)) * b;

export function reduce(num, den) {
  const g = gcd(num, den) || 1;
  return { num: num / g, den: den / g };
}

export function parseShare(input) {
  if (input === null || input === undefined) return null;
  const s = normalizeDigits(String(input)).replace(/[٪%]/g, '').replace('÷', '/').trim();
  if (!s) return null;
  if (s.includes('/')) {
    const [a, b] = s.split('/');
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return null;
    const num = Number(a);
    const den = Number(b);
    if (!den || num <= 0 || num > den) return null;
    return reduce(num, den);
  }
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  const [ip, fp = ''] = s.split('.');
  const den = 100 * 10 ** fp.length;
  const num = Number(ip) * 10 ** fp.length + Number(fp || '0');
  if (num <= 0 || num > den) return null;
  return reduce(num, den);
}

export const isShare = (x) => !!x && Number.isSafeInteger(x.num) && Number.isSafeInteger(x.den) && x.num > 0 && x.den > 0 && x.num <= x.den;

// مجموع كسور بدقة كاملة: { num, den } مختصر.
export function sumShares(list) {
  let num = 0n;
  let den = 1n;
  for (const s of list) {
    num = num * BigInt(s.den) + BigInt(s.num) * den;
    den = den * BigInt(s.den);
    const g = bgcd(num, den);
    num /= g;
    den /= g;
  }
  return { num: Number(num), den: Number(den) };
}
function bgcd(a, b) {
  a = a < 0n ? -a : a;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}
export const isWhole = (s) => s.num === s.den;
export const addShares = (a, b) => sumShares([a, b]);

// أوزان صحيحة متناسبة مع الكسور (للتقسيم بلا كسور عائمة).
export function weightsOf(list) {
  const L = list.reduce((acc, s) => lcm(acc, s.den), 1);
  return list.map((s) => s.num * (L / s.den));
}

// تقسيم مبلغ على حصص: يعيد مصفوفة مبالغ بنفس الترتيب ومجموعها = المبلغ.
export const allocate = (amount, shares) => (shares.length ? splitByWeights(amount, weightsOf(shares)) : []);

export const shareToPercent = (s) => (s.num * 100) / s.den;

export function formatShare(s, { arabic = false } = {}) {
  if (!s) return '—';
  const pct = shareToPercent(s);
  const pctText = (Math.round(pct * 100) / 100).toString();
  const frac = s.den <= 12 && s.num !== s.den ? `${s.num}/${s.den} · ` : '';
  const out = `${frac}${pctText}%`;
  return arabic ? out.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]).replace('.', '٫') : out;
}
