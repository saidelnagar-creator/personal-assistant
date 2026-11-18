// سجل الوحدات (القطاعات). إضافة قطاع جديد = ملف وحدة جديد + سطر هنا (ونظيره في ui/modules/index.js).
// لا تحذف وحدة لها بيانات: الأحداث المخزّنة تحتاج تعريف أنواعها لتُقرأ.
import common from './common.js';
import poultry from './poultry/index.js';
import car from './car/index.js';
import loans from './loans/index.js';
import assoc from './assoc/index.js';
import trusts from './trusts/index.js';

export const MODULES = [common, poultry, car, loans, assoc, trusts];
export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;
