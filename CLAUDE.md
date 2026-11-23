# مساعدي — دليل المطوّر (اقرأه قبل أي تعديل)

PWA عربي RTL شخصي لمتابعة المشروعات والأموال: دواجن (المرحلة 1)، العربية (الصيانة والأعطال)، السلف والجمعيات والأمانات، ثم السيولة والممتلكات، الأرض والنخل، المنحل.
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
    modules/poultry/        index.js (الأنواع والتحقق والوصف والتذكيرات والمالية)، calc.js (التسوية والأرصدة والمؤشرات، سعر الوحدة ومراجعته، جرد العلف والاستهلاك اليومي، الطيور والإنتاج والنافق)، config.js (القوائم، `PRICE_CHECK`، `KG_PER_UNIT`)
    modules/car/            index.js (العربية، بنود الجدول، الأعطال، التعديلات، العداد، الشغل)، calc.js (آخر مرة والموعد الجاي، متوسط المشي، التكاليف)، schedule.js (جدول الصيانة الافتراضي)، config.js
    modules/money/          مشترك: config.js (العملات، العيارات، القوائم)، units.js (الوحدات والقيمة)، prices.js (السعر في تاريخ، مستوى التذكير)
    modules/loans/          index.js (السلفة، الأخذ، السداد، التحويل، الأسعار)، calc.js (الحركات، الباقي، القيمة، جدول الأقساط)
    modules/assoc/          index.js (الجمعية وأسهمها، القسط، القبض، فلوس صاحب سهم)، calc.js (الشهور، القبض، الأرصدة، الفلوس مع المدير)
    modules/trusts/         index.js (الأمانة وحاجاتها، الترجيع)، calc.js (الباقي، الوزن، القيمة)
    backup.js crypto-backup.js drive.js money.js util.js sha256.js migrations/
  src/storage/              store.js (فتح، ترحيل آمن، snapshots، استيراد)، idb.js، mirror.js، drive-sync.js
  src/ui/                   app.js (المسارات، القفل)، components.js، forms-common.js، widgets.js، privacy.js، screens/
    modules/index.js        سجل وحدات الواجهة ← أضف الوحدة هنا
    modules/poultry/        screens.js، forms.js، index.js (المسارات، بطاقة الرئيسية، أرصدة الشخص، تحرير القيود)
    modules/car/            screens.js، forms.js، fmt.js، index.js (+ entryDetails/entrySubtitle لشاشة القيد)
    modules/money/          fmt.js (الكمية بوحدتها بعزل الاتجاه، حقل الكمية حسب الوحدة)، plan.js (محرر الأقساط)، prices.js (شاشة ونموذج الأسعار)
    modules/{loans,assoc,trusts}/  index.js، screens.js، forms.js (+ canEdit لإخفاء «تعديل» لقيد لا يُعدَّل)
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
6. **الضيف (تربية مشتركة):** قيد `poultry.guest` يسري من تاريخ؛ يتحمّل `guestBirds/totalBirds` من كل مصروف تاريخه بعده (إلا `noGuest`). التاريخ المعتبر = `guestDate(e)`: التاريخ الفعلي محصوراً داخل شهر الحساب (قيد متأخر على حساب فترة التأسيس يُعامل كأنه صُرف وقتها). `guestBirds = 0` ⇒ انتهى.
7. **الدفعات حرة** (أي مبلغ لأي شريك في أي وقت، غير مقيدة بالإقفال ولا بالنسب)؛ `settlementPlan` يحسب دفعات التصفية التي تجعل الأرصدة صفراً.
8. **الكمية × السعر = الإجمالي:** الواجهة تقبل أي اتنين (`linkQPA` في `ui/modules/poultry/forms.js`). لو الأساس الإجمالي، سعر الوحدة يُشتق (الإجمالي ÷ الكمية) **ولا يُخزَّن**، والكمية تُخزَّن دائماً. البيض استثناء: السعر مطلوب فيُخزَّن المشتق بشرط التطابق التام. مراجعة السعر (`unitPriceStats`/`priceCheck`) استشارية ولا تمنع الحفظ.
9. **جرد العلف** (`poultry.count` بـ `item: 'feed'`): الاستهلاك بين جردين = الأول + المشترى بتاريخه الفعلي − الثاني (`feedUsage`). بلا جرد: تقريبي من المشتريات ÷ أيام الشهر داخل عمر الدورة (`r.days`).
10. **الأرصدة:** ناحية p عند المدير = دفعها للدورة − ما استلمته + نتائجها (هي وتابعوها) − نصيبها كضيف. التابع عند رأسه = ما دفعه له − ما استلمه منه + نتائجه. **المدير يحمل النقدية**: أي عجز أو زيادة عليه، فرصيده = النقدية − أرصدة الباقين.

## العربية (`modules/car`)

- **الجدول الفعلي** = بنود `SCHEDULE` المنطبقة على مواصفات العربية (`when`) + تعديلات المستخدم (`car.task` بمعرّف `${carId}:${key}`؛ `km/months: null` = الافتراضي، `0` = البُعد غير مستخدم) + بنود خاصة (`car.task` بلا `key`). مفاتيح `SCHEDULE` ثابتة للأبد (يشير إليها `car.work.tasks`).
- **الموعد الجاي** = آخر مرة + المدة، بالكيلو أو بالشهور أيهما أقرب. الكيلو الحالي تقديري من متوسط المشي. «آخر مرة» من قيود `car.work` السارية فقط.
- **`car.work.amount` = مجموع القطع + `labor` + `other`** دائماً، و`qty × price = amount` لكل قطعة فيها الاثنان.
- **العداد لا يرجع للخلف** (`checkKmOrder`) في `car.odometer` و`car.work`؛ `dateUnknown` (للسجل السابق فقط) يُستثنى من القراءات.
- حالة «اتصلح»/«اتعمل» للعطل والتعديل **مشتقة** من `faultIds`/`planIds` في الشغل الساري — لا تُخزَّن.
- الكيلومترات ليست أرصدة: العداد ومتوسط المشي يُعرضان بلا إخفاء (`plainStat` و`kv` بـ `secret: false`)، والمبالغ كلها بمجموعة الخصوصية `car`.

## السلف والجمعيات والأمانات (`modules/loans`، `assoc`، `trusts`، والمشترك `money`)

- **الوحدات** (`money/units.js`): `EGP` وعملات (`USD`…) ×100، ذهب بالجرام `g24/g21/g18` وجنيهات ذهب `gpound` وحاجة `item` ×1000. القيمة بالجنيه = `valueOf(qty, unit, price)` والسعر بالقرش لكل وحدة. لا تغيّر أكواد الوحدات (مخزّنة).
- **الأسعار** قيود `money.price {date, prices}` يكتبها المستخدم (لا اتصال خارجي). السعر في تاريخ = آخر قيد ساري ≤ التاريخ فيه المفتاح (`priceAt`). الاشتقاق من عيار 21 في الواجهة فقط (`deriveGold`).
- **السلفة** كيان `loan {dir: out|in, personId, unit, itemName?, plan}`؛ الحركات: `loan.draw` (+)، `loan.pay` (− ومنها `forgive`)، `loan.convert` (− من القديمة و+ في الجديدة، قيد واحد). **الباقي لا يصبح سالباً في أي يوم** (`firstNegative`)، والسداد بنفس النوع. السلفة المحوّلة مقفولة لأي قيد أو إلغاء حتى يُلغى التحويل. النوع والاتجاه ثابتان بعد أول حركة.
- **الخطة** `plan: once {due} | schedule {items[{due, qty}]} | open`، و`base` = المسدد قبل الخطة (جدول جديد للباقي). المسدد يغطي الأقساط الأقدم أولاً؛ الجدول مقصوص على المأخوذ.
- **الجمعية** `assoc {organizerId, monthly, months, start, payDay, shares[{id, ownerId, size{num,den}, turn?, payouts[{month, amount}]}]}`. إجمالي السهم = `mulDiv(monthly, num, den) × months` = مجموع `payouts` (لو موجودة). القيود: `assoc.pay` و`assoc.payout` (لا يتعديان إجمالي السهم)، و`assoc.transfer {dir}` لسهم حد تاني في جمعية أنا مش مديرها. `organizerId === 'me'` = مدير. السهم اللي عليه حركات لا يُشال.
- **الأمانة** `trust {dir: held|placed, personId, date, items[]}`، والترجيع `trust.return {items[{itemId, count|amount}]}` لا يتعدى الباقي. `held` تظهر في «وضعي المالي» بنوع `held` (خارج الصافي)، و`placed` = `receivable`.
- **التذكير** قبل الميعاد بـ `settings['money.remindDays']` (الافتراضي 7، `remindDaysOf`)؛ وتنبيه الأسعار لو سعر مفتاح مستخدم أقدم من `MONEY_RULES.priceStaleDays`.
- **العرض**: الكمية بوحدتها عبر `uq`/`egp` في `ui/modules/money/fmt.js` (تعزل الرقم LTR والوحدة RTL داخل خانات الأرقام). الاختبارات النصية تشيل علامات العزل (U+2066–2069).

## ما لا يجوز كسره

- **الثوابت** (`tests/unit/property.test.mjs`): مجموع التوزيع = صافي كل شهر؛ النقدية المحسوبة مع المدير = مجموع أرصدة النواحي والضيوف؛ مجموع الأرصدة الشخصية = مجموع النواحي؛ إجمالي شغل العربية = بنوده وتكاليفها = مجموع الشغل الساري والعداد لا يرجع؛ باقي السلفة = المأخوذ − المسدد ولا يصبح سالباً في أي يوم؛ مجموع أرصدة أسهم الجمعية = الفلوس مع المدير ولا سهم يتعدى إجماليه؛ إعادة البناء من السجل تعطي نفس النتيجة.
- **فصل الكود عن البيانات:** `DB_NAME` وأسماء المخازن ثابتة. `sw.js` لا يلمس IndexedDB. كاش الأصول يبدأ بـ `pa-assets-` ولا يبدأ به أي كاش آخر (المرآة `pa-mirror-v1`). كل مفاتيح localStorage تبدأ بـ `KEY_PREFIX` (التطبيق قد يشارك نطاق github.io مع تطبيقات أخرى).
- **لا تحذف وحدة ولا نوع كيان/قيد له بيانات منشورة**، ولا تغيّر معنى حقل مخزَّن. تغيير المعنى = ترحيل جديد في `core/migrations/` (لا تعدّل ترحيلاً منشوراً).
- **لا بيانات حقيقية في git:** لا أسماء ولا أرقام من الإكسيل في الكود أو الاختبارات أو التوثيق. `input/` و`output/` في `.gitignore`. `sw-assets.test.mjs` يفحص الأسماء (كلمة كاملة) إن وُجدت البيانات محلياً. الاختبارات ببيانات وهمية فقط.
- **كل المسارات نسبية** (`./`). لا CDN ولا مكتبات خارجية.
- **الأمان:** لا `innerHTML` ولا `eval` ولا كود/نمط مضمَّن (CSP في `index.html`). الأنماط عبر `el.style` أو CSS. الاتصال الخارجي الوحيد: `www.googleapis.com` (Drive الاختياري، عناوينه في `core/drive.js` فقط).
- **الخصوصية:** كل رقم معروض يمر من `row`/`stat`/`kv`/`table` ليخضع لإخفاء الأرصدة.
- **رسائل وواجهة بالعربية**، موبايل أولاً، حقول الإدخال ≥ 16px.
- **iPhone داخل النوافذ:** الاختيار داخل سطور متكررة بـ `pickButton`/`pickOption` أو `chips` لا `<select>` (عجلته تزحزح الصفحة فتقع اللمسات على زر مجاور). `openSheet` يثبّت الصفحة الخلفية (`body.sheet-open`) — لا تفتح نافذة بغيرها.

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
