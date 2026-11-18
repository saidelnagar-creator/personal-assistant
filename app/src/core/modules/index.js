// سجل الوحدات (القطاعات). إضافة قطاع جديد = ملف وحدة جديد + سطر هنا (ونظيره في ui/modules/index.js).
// لا تحذف وحدة لها بيانات: الأحداث المخزّنة تحتاج تعريف أنواعها لتُقرأ.
import common from './common.js';
import poultry from './poultry/index.js';

export const MODULES = [common, poultry];
export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;
