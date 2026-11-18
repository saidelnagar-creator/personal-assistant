// قوائم الدواجن الافتراضية (تُزرع نسخةً أولى؛ التعديل والإضافة من الواجهة: المزيد ← القوائم).
// المعرّفات ثابتة للأبد (يُشار إليها من القيود). الأسماء قابلة للتعديل.

export const EXPENSE_CATEGORIES = [
  { id: 'feed', name: 'علف', unit: 'طن', order: 1 },
  { id: 'labor', name: 'أجرة العمال', order: 2 },
  { id: 'power', name: 'كهرباء', order: 3 },
  { id: 'vet', name: 'بيطري وأدوية وتحصينات', order: 4 },
  { id: 'litter', name: 'نشارة', order: 5 },
  { id: 'maint', name: 'صيانة وأعطال', order: 6 },
  { id: 'rent', name: 'إيجار المزرعة', order: 7 },
  { id: 'birds', name: 'شراء طيور', unit: 'طائر', order: 8 },
  { id: 'setup', name: 'تجهيزات ومعدات', order: 9 },
  { id: 'transport', name: 'نقل', order: 10 },
  { id: 'fuel', name: 'سولار وغاز', order: 11 },
  { id: 'water', name: 'مياه', order: 12 },
  { id: 'misc', name: 'مصروفات أخرى', order: 13 },
  { id: 'unclassified', name: 'غير مصنف', order: 99 },
];

export const EGG_GRADES = [
  { id: 'normal', name: 'عادي', order: 1 },
  { id: 'double', name: 'دبل', order: 2 },
];

// منتجات البيع ثابتة في الكود لأن لكل منها طريقة حساب.
export const PRODUCTS = {
  eggs: { name: 'بيض', unit: 'طبق', priceLabel: 'سعر الطبق' },
  manure: { name: 'سبلة', unit: 'نقلة', priceLabel: 'السعر' },
  bags: { name: 'شكاير فارغة', unit: 'شيكارة', priceLabel: 'سعر الشيكارة' },
  birds: { name: 'بيع طيور (لحم)', unit: 'كيلو', priceLabel: 'سعر الكيلو' },
  other: { name: 'إيراد آخر', unit: '', priceLabel: 'السعر' },
};

export const BREEDS = ['أبيض', 'بلدي', 'أحمر', 'أخرى'];

export const CYCLE_STATUS = { active: 'شغالة', sold: 'اتباع القطيع', closed: 'مقفولة' };

export const EGGS_PER_TRAY = 30;
