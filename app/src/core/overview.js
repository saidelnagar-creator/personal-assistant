// تجميع عبر القطاعات: التذكيرات و«وضعي المالي». كل وحدة تساهم بدالتها، والواجهة لا تحسب شيئاً.
import { MODULES } from './modules/index.js';
import { todayISO, cmp } from './util.js';

export function allReminders(state, today = todayISO()) {
  const out = [];
  for (const m of MODULES) if (m.reminders) for (const r of m.reminders(state, today)) out.push({ module: m.id, ...r });
  const rank = { overdue: 0, today: 1, upcoming: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level] || cmp(a.due, b.due));
}

export const FIN_KINDS = {
  cash: 'سيولة معي',
  receivable: 'ليّ عند الغير',
  asset: 'ممتلكات قابلة للبيع',
  expected: 'دخل متوقع',
  payable: 'عليّ للغير',
  held: 'أمانات عندي لغيري (خارج الحساب)',
};

// يجمع بنود الوضع المالي من كل الوحدات. الأصول = سيولة + ما لي + ممتلكات؛ الالتزامات = ما عليّ.
// «أمانات عندي لغيري» للعرض فقط: ليست ملكي ولا ديناً عليّ (محفوظة كما هي)، فلا تدخل الصافي.
export function financeOverview(state, today = todayISO()) {
  const items = [];
  for (const m of MODULES) if (m.finance) for (const it of m.finance(state, today)) items.push({ module: m.id, ...it });
  const totals = Object.fromEntries(Object.keys(FIN_KINDS).map((k) => [k, 0]));
  for (const it of items) totals[it.kind] += it.amount;
  const assets = totals.cash + totals.receivable + totals.asset;
  return { items, totals, assets, liabilities: totals.payable, net: assets - totals.payable, netWithExpected: assets + totals.expected - totals.payable };
}
