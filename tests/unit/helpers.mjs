// أدوات اختبار مشتركة: دفتر مزروع بأشخاص ودورة تجريبية (أسماء وأرقام وهمية فقط).
import { Book } from '../../app/src/core/book.js';

export const NOW = '2025-12-20T10:00:00.000Z';
export const opts = { now: NOW };

export function seededBook() {
  return Book.seeded();
}

// دفتر بأشخاص: المدير، شريك تابع، ضيف، ودورة تبدأ 2025-05-05 والتسوية من 2025-10.
export function demoBook({ settleFrom = '2025-10' } = {}) {
  const b = Book.seeded();
  b.upsert('person', { id: 'mgr', name: 'المدير التجريبي' }, opts);
  b.upsert('person', { id: 'sub', name: 'شريك تابع' }, opts);
  b.upsert('person', { id: 'gst', name: 'ضيف' }, opts);
  b.upsert('poultry.cycle', { id: 'c1', name: 'دورة تجريبية', startDate: '2025-05-05', birds: 5000, ageDays: 1, settleFrom, managerId: 'mgr', status: 'active', breed: 'أبيض' }, opts);
  b.addEntry({ kind: 'poultry.shares', cycleId: 'c1', date: '2025-05-05', from: '2025-05', stakes: [
    { personId: 'me', num: 1, den: 3, via: null },
    { personId: 'sub', num: 1, den: 6, via: 'me' },
    { personId: 'mgr', num: 1, den: 2, via: null },
  ] }, opts);
  return b;
}

export const exp = (cycleId, date, month, category, amount, extra = {}) => ({ kind: 'poultry.expense', cycleId, date, month, category, amount, ...extra });
export const eggs = (cycleId, date, month, trays, price, grade = 'normal') => ({ kind: 'poultry.sale', cycleId, date, month, product: 'eggs', grade, qty: trays * 1000, price, amount: (trays * price) });
export const pay = (cycleId, date, from, to, amount) => ({ kind: 'poultry.payment', cycleId, date, from, to, amount });
