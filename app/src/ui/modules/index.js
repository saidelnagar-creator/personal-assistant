// سجل وحدات الواجهة (نظير core/modules/index.js). إضافة قطاع = ملف واجهة جديد + سطر هنا.
import poultry from './poultry/index.js';

export const UI_MODULES = [poultry];

// القطاعات المخطط لها (تظهر «قريباً» في شاشة القطاعات حتى تُبنى).
export const UPCOMING = [
  { id: 'money', name: 'السلف والأمانات والجمعيات والممتلكات', phase: 2, emoji: '💰' },
  { id: 'land', name: 'الأرض المؤجرة', phase: 3, emoji: '🌾' },
  { id: 'palms', name: 'النخل', phase: 3, emoji: '🌴' },
  { id: 'apiary', name: 'المنحل', phase: 4, emoji: '🐝' },
  { id: 'car', name: 'العربية', phase: 5, emoji: '🚗' },
];
