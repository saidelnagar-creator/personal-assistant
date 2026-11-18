# مساعدي

تطبيق ويب تقدّمي (PWA) عربي شخصي لمتابعة المشروعات والأموال: دورات الدواجن (الشركاء، التسوية الشهرية، المؤشرات)، العربية (الصيانة والأعطال)، السلف والجمعيات والأمانات (فلوس وذهب وعملات بقيمتها)، ثم السيولة والممتلكات، الأرض والنخل، المنحل.

- يُثبَّت على iPhone من Safari ويعمل بدون إنترنت.
- **البيانات على هاتفك فقط** (IndexedDB) + نسخ احتياطي لـ Google Drive بيدك أو تلقائياً. هذا المستودع فيه **الكود فقط** ولا يحتوي أي بيانات.

| | |
|---|---|
| دليل الاستخدام | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) |
| إضافة قطاع أو تعديل | [docs/EXTENDING.md](docs/EXTENDING.md) |
| التثبيت على iPhone | [docs/INSTALL_IPHONE.md](docs/INSTALL_IPHONE.md) |
| النشر | [docs/DEPLOY.md](docs/DEPLOY.md) |
| الأمان وحماية البيانات | [docs/SECURITY.md](docs/SECURITY.md) |
| المراحل | [docs/ROADMAP.md](docs/ROADMAP.md) |
| القرارات والافتراضات | [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) |
| دليل المطوّر | [CLAUDE.md](CLAUDE.md) |

```bash
npm install
npm run serve        # http://127.0.0.1:8080
npm run test:unit && npm run test:e2e
```
