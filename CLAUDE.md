# مساعدي — دليل المطوّر (اقرأه قبل أي تعديل)

PWA عربي RTL شخصي لمتابعة المشروعات والأموال: دواجن (المرحلة 1)، ثم السلف والأمانات والممتلكات، الأرض والنخل، المنحل، العربية.
يعمل أوفلاين على iPhone، بلا backend، والبيانات في IndexedDB على الجهاز فقط. بلا خطوة بناء: ملفات `app/` تُنشر كما هي (ES modules).

## الأوامر

```bash
npm install                 # مرة واحدة (اعتماد تطوير واحد: fake-indexeddb)
npm run serve               # خادم محلي http://127.0.0.1:8080
npm run test:unit           # منطق + تخزين + خواص عشوائية + مستورد الإكسيل + فحص الخصوصية (Node، ثوانٍ)
npm run test:e2e            # متصفح بمحاكاة iPhone (Playwright/Chromium، ~دقيقة)
npm run test:reconcile      # مطابقة الإكسيل الحقيقي (فقط إن وُجد input/farm-extracted.json، وإلا تُتخطى)
npm run sw:assets           # ← بعد أي تعديل داخل app/ (قائمة الأوفلاين وبصمة sw.js)
npm run import:excel        # input/farm.xlsx → output/personal-assistant-import.json + تقرير المطابقة
```

المهمة لا تُعتبر منتهية قبل نجاح `test:unit` و`test:e2e`.

## المعمارية

```
app/                        كل ما يُنشر (لا شيء غيره)
  src/config/               version.js (APP_VERSION، DB_NAME لا يتغير أبداً، KEY_PREFIX)، rules.js (المعاملات، الإعدادات العامة)
  src/core/                 منطق خالص: لا DOM ولا IndexedDB، يعمل في Node
    engine.js               الحالة = fold(الأحداث). 6 أنواع أحداث عامة فقط (انظر أدناه)
    validate.js             التحقق العام + استدعاء تحقق الوحدة لكل نوع
    book.js                 Book: dispatch، addEntry/addEntries، voidEntry، replaceEntry، upsert، أحداث الزرع
    shares.js               الحصص ككسور صحيحة (1/3 بالضبط)، التقسيم بلا كسور عائمة
    overview.js             تجميع عبر الوحدات: التذكيرات و«وضعي المالي»
    modules/index.js        سجل الوحدات ← أضف الوحدة الجديدة هنا
    modules/common.js       الأشخاص، المجموعات، التذكيرات اليدوية
    modules/poultry/        index.js (الأنواع والتحقق والوصف والتذكيرات والمالية)، calc.js (التسوية والأرصدة والمؤشرات)، config.js
    backup.js crypto-backup.js drive.js money.js util.js sha256.js migrations/
  src/storage/              store.js (فتح، ترحيل آمن، snapshots، استيراد)، idb.js، mirror.js، drive-sync.js
  src/ui/                   app.js (المسارات، القفل)، components.js، forms-common.js، widgets.js، privacy.js، screens/
    modules/index.js        سجل وحدات الواجهة ← أضف الوحدة هنا
    modules/poultry/        screens.js، forms.js، index.js (المسارات، بطاقة الرئيسية، أرصدة الشخص، تحرير القيود)
tests/unit tests/e2e tests/reconcile tests/fixtures (بيانات وهمية فقط)
tools/                      serve، gen-sw-assets، make-icons، excel_extract.py، import-excel.mjs، build-site
docs/                       USER_GUIDE، EXTENDING، INSTALL_IPHONE، DEPLOY، SECURITY، ASSUMPTIONS، ROADMAP، CHANGELOG
input/ output/              بيانات حقيقية — خارج git دائماً
```

**تدفق البيانات:** الواجهة ← `store.run(book => …)` ← `Book.dispatch` (تحقق) ← إلحاق في IndexedDB ← `applyEvent` ← إعادة رسم.
الواجهة لا تحسب أرصدة ولا تكتب في IndexedDB مباشرة؛ كل حساب في `core/`.

### الأحداث (لا تُضف نوع حدث جديداً — أضف «نوع كيان» أو «نوع قيد» داخل وحدة)

| الحدث | المعنى |
|---|---|
| `entity.upsert {kind, item}` | إنشاء/تعديل كيان (شخص، مجموعة، دورة، بند…). الحقول المرسلة تحل محل القديمة، والتاريخ كله في السجل |
| `entry.add {entry}` | قيد مالي/تشغيلي له `kind` و`date` (و`month` = شهر الحساب إن لزم). لا يُعدَّل أبداً |
| `entry.void {entryId, reason, date, replacedBy?}` | إلغاء. التعديل = إلغاء + قيد جديد يحمل `replaces` |
| `month.close / month.reopen {scope, month}` | إقفال شهر لنطاق (مثل `poultry:<cycleId>`) — يمنع إضافة/إلغاء قيود ذلك الشهر |
| `settings.set {key, value}` | إعداد عام |
| `reminder.done {reminderId, due}` | إنجاز موعد تذكير يدوي |

## قواعد المحاسبة

1. **سجل append-only.** لا حدث يُعدَّل ولا يُحذف. لا رصيد مخزَّن: كل رقم يُحسب من القيود.
2. **أعداد صحيحة فقط.** المبالغ بالقرش (×100)، الكميات ×1000 (أطباق، أطنان، كيلو). التحويل من/إلى النص في `money.js` فقط. `lineAmount(qty, price)` للكمية × السعر. التقسيم بـ `allocate`/`splitByWeights`: آخر بند يأخذ الباقي فالمجموع محفوظ.
3. **الحصص كسور** `{num, den}` من الدورة كلها، بنسخ تسري من شهر (`from`). `via = null` شريك مباشر مع المدير (رأس ناحية)، `via = رأس` شريك تابع يتعامل مع رأسه فقط. المجموع = 1 بالضبط.
4. **شهر الحساب** (`month`) يحدد دخول القيد في التسوية، مستقلاً عن التاريخ الفعلي.
5. **المراحل بشهر الحساب** (`phase` في `calc.js`): قبل شهر `layStart` = `rearing` (تربية)؛ من `layStart` حتى قبل `settleFrom` = `lay` (فترة البشاير: صرفها ودخلها معاً، والصافي يُضاف للتربية؛ تُعرض وتُقفل ككتلة واحدة، خارج متوسطات الشهور المنتظمة). التربية + البشاير = **التأسيس** (رأس المال، `totals.establishment`)؛ من `settleFrom` = `regular` (ربح الشهر = مبيعاته − مصروفاته التشغيلية). بلا `layStart`: كل ما قبل `settleFrom` رأس مال. القيد `capital: true` رأسمالي في أي مرحلة. `aggregateMonths` يجمع شهوراً متتالية بشكل الشهر.
6. **الضيف (تربية مشتركة):** قيد `poultry.guest` يسري من تاريخ؛ يتحمّل `guestBirds/totalBirds` من كل مصروف تاريخه بعده (إلا `noGuest`). `guestBirds = 0` ⇒ انتهى.
7. **الدفعات حرة** (أي مبلغ لأي شريك في أي وقت، غير مقيدة بالإقفال ولا بالنسب)؛ `settlementPlan` يحسب دفعات التصفية التي تجعل الأرصدة صفراً.
8. **الأرصدة:** ناحية p عند المدير = دفعها للدورة − ما استلمته + نتائجها (هي وتابعوها) − نصيبها كضيف. التابع عند رأسه = ما دفعه له − ما استلمه منه + نتائجه. **المدير يحمل النقدية**: أي عجز أو زيادة عليه، فرصيده = النقدية − أرصدة الباقين.

## ما لا يجوز كسره

- **الثوابت** (`tests/unit/property.test.mjs`): مجموع التوزيع = صافي كل شهر؛ النقدية المحسوبة مع المدير = مجموع أرصدة النواحي والضيوف؛ مجموع الأرصدة الشخصية = مجموع النواحي؛ إعادة البناء من السجل تعطي نفس النتيجة.
- **فصل الكود عن البيانات:** `DB_NAME` وأسماء المخازن ثابتة. `sw.js` لا يلمس IndexedDB. كاش الأصول يبدأ بـ `pa-assets-` ولا يبدأ به أي كاش آخر (المرآة `pa-mirror-v1`). كل مفاتيح localStorage تبدأ بـ `KEY_PREFIX` (التطبيق قد يشارك نطاق github.io مع تطبيقات أخرى).
- **لا تحذف وحدة ولا نوع كيان/قيد له بيانات منشورة**، ولا تغيّر معنى حقل مخزَّن. تغيير المعنى = ترحيل جديد في `core/migrations/` (لا تعدّل ترحيلاً منشوراً).
- **لا بيانات حقيقية في git:** لا أسماء ولا أرقام من الإكسيل في الكود أو الاختبارات أو التوثيق. `input/` و`output/` في `.gitignore`. `sw-assets.test.mjs` يفحص الأسماء (كلمة كاملة) إن وُجدت البيانات محلياً. الاختبارات ببيانات وهمية فقط.
- **كل المسارات نسبية** (`./`). لا CDN ولا مكتبات خارجية.
- **الأمان:** لا `innerHTML` ولا `eval` ولا كود/نمط مضمَّن (CSP في `index.html`). الأنماط عبر `el.style` أو CSS. الاتصال الخارجي الوحيد: `www.googleapis.com` (Drive الاختياري، عناوينه في `core/drive.js` فقط).
- **الخصوصية:** كل رقم معروض يمر من `row`/`stat`/`kv`/`table` ليخضع لإخفاء الأرصدة.
- **رسائل وواجهة بالعربية**، موبايل أولاً، حقول الإدخال ≥ 16px.

## إضافة قطاع (وحدة) جديد — التفاصيل في docs/EXTENDING.md

1. `app/src/core/modules/<id>/index.js`: `{ id, name, entities: {kind: {label, validate}}, entries: {kind: {label, validate, describe, scopeOf?, monthsOf?, validateVoid?}}, seeds?, reminders?, finance? }` + منطقه الخالص في ملف `calc.js` + اختبار وحدة.
2. سطر في `core/modules/index.js`.
3. الواجهة: `app/src/ui/modules/<id>/index.js` (`routes`، `summary`، `homeRows?`، `personRows?`، `editEntry?`) + شاشات ونماذج، وسطر في `ui/modules/index.js`، واحذفه من `UPCOMING`.
4. `finance(state)` تعيد بنوداً `{label, kind: cash|receivable|asset|expected|payable, amount, href, personId?}` فتظهر تلقائياً في «وضعي المالي» والرئيسية.
5. `reminders(state, today)` تعيد `{id, title, due, level: overdue|today|upcoming, href}` فتظهر في التذكيرات.
6. `npm run sw:assets` ثم `npm run test:unit && npm run test:e2e`، وحدّث `docs/CHANGELOG.md` وارفع `APP_VERSION`. القرارات الغامضة في `docs/ASSUMPTIONS.md`.

## النشر

- GitHub Actions (`.github/workflows/pages.yml`) ينشر مجلد `app/` على GitHub Pages عند كل دفع لـ `main`. الريبو عام لكنه **كود فقط**.
- التحديث على الجهاز: العامل الجديد ينتظر، والواجهة تعرض «تحديث الآن». البيانات لا تتأثر.
- **تغيير رابط التطبيق = مخزن بيانات جديد فارغ على الهاتف.** لا تغيّر اسم الريبو ولا المستخدم بعد التثبيت إلا بنسخة احتياطية.

## بيئة الاختبار

- E2E: Playwright المثبت عالمياً + Chromium بمحاكاة iPhone 14 على مسار فرعي `/personal-assistant/` (مثل Pages). WebKit غير مثبت.
- التخزين في Node عبر `fake-indexeddb`.
