// قواعد وقوائم السلف والجمعيات والأمانات والأسعار (جداول لا منطق).
export const MONEY_RULES = Object.freeze({
  remindDays: 7, // التذكير قبل ميعاد السداد أو قسط الجمعية أو القبض (يتغير من الإعدادات: money.remindDays)
  priceStaleDays: 7, // تنبيه «حدّث الأسعار» لو آخر سعر لذهب/عملة مستخدمة أقدم من كده
  goldPoundMilligrams: 8000, // الجنيه الذهب = 8 جرام عيار 21 (×1000)
  maxInstallments: 240,
  maxAssocMonths: 240,
  maxAssocShares: 200,
  maxTrustItems: 100,
});

// العملات الأجنبية (الكود ← الاسم). المبالغ بها ×100 مثل الجنيه، وسعرها بالقرش لكل وحدة.
export const CURRENCIES = Object.freeze({ USD: 'دولار', EUR: 'يورو', SAR: 'ريال سعودي', AED: 'درهم إماراتي', KWD: 'دينار كويتي', GBP: 'جنيه إسترليني' });
export const KARATS = Object.freeze([24, 21, 18]);

export const LOAN_DIRS = Object.freeze({ out: 'سلّفت (ليّ عنده)', in: 'استلفت (عليّ له)' });
export const PLAN_TYPES = Object.freeze({ once: 'مرة واحدة في ميعاد', schedule: 'أقساط بجدول', open: 'من غير ميعاد' });

export const TRUST_DIRS = Object.freeze({ held: 'أمانة عندي لحد', placed: 'أمانتي عند حد' });
export const TRUST_TYPES = Object.freeze({ gold: 'ذهب', money: 'فلوس', doc: 'ورق / مستند', other: 'حاجة تانية' });
// اقتراحات (يُكتب غيرها عادي).
export const GOLD_PIECES = Object.freeze(['غويشة', 'خاتم', 'دبلة', 'محبس', 'سلسلة', 'حلق', 'كوليه', 'انسيال', 'تعليقة', 'خلخال', 'سبيكة', 'جنيه ذهب', 'نص جنيه ذهب', 'ربع جنيه ذهب']);
export const DOC_TYPES = Object.freeze(['عقد', 'قايمة منقولات', 'شيك', 'إيصال أمانة', 'كمبيالة', 'توكيل', 'مستند شخصي']);

// أحجام سهم الجمعية.
export const SHARE_SIZES = Object.freeze([
  { num: 1, den: 1, label: 'سهم كامل' },
  { num: 1, den: 2, label: 'نص سهم' },
  { num: 1, den: 3, label: 'تلت سهم' },
  { num: 1, den: 4, label: 'ربع سهم' },
]);
