// سجل وحدات الواجهة (نظير core/modules/index.js). إضافة قطاع = ملف واجهة جديد + سطر هنا.
import poultry from './poultry/index.js';
import car from './car/index.js';
import loans from './loans/index.js';
import assoc from './assoc/index.js';
import trusts from './trusts/index.js';

export const UI_MODULES = [poultry, car, loans, assoc, trusts];

// القطاعات المخطط لها (تظهر «قريباً» في شاشة القطاعات حتى تُبنى).
export const UPCOMING = [
  { id: 'assets', name: 'السيولة (كاش، بنك، محافظ) والممتلكات', phase: 2, emoji: '💰' },
  { id: 'land', name: 'الأرض المؤجرة', phase: 3, emoji: '🌾' },
  { id: 'palms', name: 'النخل', phase: 3, emoji: '🌴' },
  { id: 'apiary', name: 'المنحل', phase: 4, emoji: '🐝' },
];
