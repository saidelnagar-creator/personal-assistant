// إصدار الكود (يتغير مع كل نشر) — مستقل تماماً عن إصدار هيكل البيانات (SCHEMA_VERSION في core/migrations).
export const APP_VERSION = '0.1.2';
export const APP_ID = 'personal-assistant';
export const APP_NAME = 'مساعدي';
// اسم قاعدة البيانات ثابت للأبد: تغييره = بيانات فارغة. لا تغيّره.
export const DB_NAME = 'personal-assistant';
// بادئة كل مفاتيح التخزين المحلي والكاش: التطبيق قد يشارك نفس النطاق (github.io) مع تطبيقات أخرى.
export const KEY_PREFIX = 'pa';
