// سياق الواجهة المشترك: المخزن، التنسيق، التنقل. يُملأ في app.js.
import { fmtMoney, fmtQty } from '../core/money.js';
import { formatShare } from '../core/shares.js';
import { monthLabel, todayISO, ymOf } from '../core/util.js';

export const ctx = {
  store: null,
  pgroup: 'other', // مجموعة الخصوصية للشاشة المعروضة
  get state() {
    return this.store.state;
  },
  get arabic() {
    return this.state.settings.digits === 'arab';
  },
  today: () => todayISO(),
  nowMonth: () => ymOf(todayISO()),
  nav(path) {
    location.hash = path;
  },
  back() {
    if (history.length > 1) history.back();
    else location.hash = '#/';
  },
  refresh: () => {},
};

const digits = (s) => (ctx.store && ctx.arabic ? String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : String(s));

export const F = {
  money: (u, o = {}) => fmtMoney(u, { arabic: ctx.arabic, ...o }),
  egp: (u, o = {}) => `${fmtMoney(u, { arabic: ctx.arabic, ...o })} ج`,
  qty: (u, o = {}) => fmtQty(u, { arabic: ctx.arabic, ...o }),
  num: (n) => digits(typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n),
  pct: (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : digits(`${(x * 100).toFixed(d)}%`)),
  share: (s) => formatShare(s, { arabic: ctx.arabic }),
  date: (iso) => (iso ? digits(`${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`) : ''),
  month: (ym, o) => (ym ? digits(monthLabel(ym, o)) : '—'),
  monthShort: (ym) => monthLabel(ym, { short: true }),
  dateTime: (ts) => {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return digits(`${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`);
  },
};
