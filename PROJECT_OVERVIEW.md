# ATLAS — نظام إدارة الأعمال المساحية
## توثيق شامل للمشروع

---

## 1. نظرة عامة

**ATLAS Surveying** هو تطبيق ويب تقدمي (PWA) متكامل مصمم لمهندسي المساحة وفرق العمل الميداني. يعمل التطبيق على الهاتف والمتصفح، ويدعم العمل دون اتصال بالإنترنت.

| البند | التفاصيل |
|-------|----------|
| الإصدار الحالي | 2.0.19 (Build 25) |
| اللغة | عربي (RTL) + إنجليزي |
| النشر | Cloudflare Pages |
| التخزين السحابي | Cloudflare KV + R2 |
| التطوير المحلي | Node.js على المنفذ 3000 |

---

## 2. الغرض من التطبيق

يهدف ATLAS إلى:

- توفير أدوات مساحية ميدانية على الهاتف المحمول.
- دعم سير العمل دون اتصال (offline-first) عبر تقنية PWA.
- إجراء حسابات مساحية متقدمة (ميزانية ترازية، إحداثيات، مقاطع واجهات).
- إدارة بيانات المواقع عبر شركات ومناطق وقطع أراضي.
- إدارة مشاريع قائمة على Workspaces مع مزامنة سحابية.
- دعم تعاون متعدد المستخدمين مع نظام صلاحيات.

---

## 3. التقنيات المستخدمة

### الواجهة الأمامية (Frontend)
| التقنية | الغرض |
|---------|--------|
| HTML5 / CSS3 / JavaScript (Vanilla) | البناء الأساسي بدون إطار عمل |
| CSS Variables + RTL | تصميم عربي وتخصيص الألوان |
| Service Worker | التخزين المؤقت والعمل دون اتصال |
| localStorage / IndexedDB | تخزين البيانات محلياً |
| Leaflet.js | عرض الخرائط التفاعلية |
| Proj4.js | تحويل الإحداثيات (DLTM / UTM / Lat-Lon) |
| Tesseract.js | استخراج النصوص والإحداثيات من الصور (OCR) |
| html2pdf / html-to-image | تصدير PDF والصور |
| html-docx / docxtemplater | تصدير ملفات Word |
| JSZip | ضغط الملفات |

### الواجهة الخلفية (Backend)
| التقنية | الغرض |
|---------|--------|
| Cloudflare Pages Functions | دوال serverless بـ Node.js / Workers |
| Cloudflare KV | قاعدة بيانات المفاتيح والقيم (مستخدمون، جلسات، مواقع) |
| Cloudflare R2 | تخزين الملفات والـ Workspaces |
| PBKDF2-SHA256 | تشفير كلمات المرور |
| Cookie-based Sessions | إدارة الجلسات (7 أيام) |

### أدوات البناء والجودة
| الأداة | الغرض |
|--------|--------|
| npm | إدارة الحزم |
| Node.js Build Scripts | بناء المشروع للنشر |
| Wrangler (Cloudflare CLI) | النشر على Cloudflare Pages |
| Puppeteer / QA Audit | اختبارات الجودة الآلية |

---

## 4. هيكل المشروع

```
ATLAS/
├── web/                              # التطبيق الرئيسي (PWA)
│   ├── index.html                    # الصفحة الرئيسية (App Shell)
│   ├── manifest.json                 # PWA Manifest
│   ├── sw.js                         # Service Worker
│   ├── version.json                  # تتبع الإصدارات والتحديثات
│   ├── package.json                  # التبعيات والسكريبتات
│   ├── wrangler.example.toml         # إعدادات Cloudflare
│   │
│   ├── shared/                       # الوحدات المشتركة
│   │   ├── app.js                    # منطق التطبيق الأساسي (2,231 سطر)
│   │   ├── auth.js                   # المصادقة وإدارة الجلسات (1,123 سطر)
│   │   ├── sites_data.js             # قاعدة بيانات المواقع (30,011 سطر)
│   │   ├── coordinates-export.js     # أدوات تحويل الإحداثيات
│   │   ├── workspace-memory.js       # مزامنة حالة Workspace
│   │   ├── home-page.js              # تحديثات PWA والإصدار
│   │   ├── dialogs.js                # مكونات النوافذ الحوارية
│   │   └── style.css                 # الأنماط العامة
│   │
│   ├── pages/                        # الصفحات الوظيفية (15 صفحة)
│   │   ├── login/                    # تسجيل الدخول
│   │   ├── new/                      # قائمة إدخال العمل الجديد
│   │   ├── check/                    # التحقق الميداني
│   │   ├── survey/                   # جمع بيانات المساحة
│   │   ├── point-staking/            # ترقيم النقاط
│   │   ├── new-level-mark/           # إنشاء علامة ترازية جديدة
│   │   ├── level-budget/             # الميزانية الترازية
│   │   ├── coordinates-extractor/    # استخراج الإحداثيات بـ OCR
│   │   ├── coordinates-proposal/     # اقتراح الإحداثيات
│   │   ├── coordinates-export/       # تصدير الإحداثيات
│   │   ├── facade-profile/           # تحويل مقطع الواجهة
│   │   ├── site-management/          # إدارة بيانات المواقع
│   │   ├── shared-file/              # مشاركة الملفات
│   │   └── admin/                    # لوحة المدير
│   │
│   ├── functions/api/                # Cloudflare Functions (API)
│   │   ├── bootstrap.js              # فحص إعدادات Cloudflare
│   │   ├── login.js                  # نقطة تسجيل الدخول
│   │   ├── logout.js                 # تسجيل الخروج
│   │   ├── me.js                     # بيانات المستخدم الحالي
│   │   ├── users.js                  # إدارة المستخدمين
│   │   ├── workspaces/               # API الـ Workspaces
│   │   ├── pages/                    # API رفع الصفحات
│   │   └── _utils.js                 # أدوات مساعدة (تشفير، جلسات...)
│   │
│   ├── LIP/                          # مكتبات خارجية
│   │   ├── vendor/leaflet/           # مكتبة الخرائط
│   │   ├── vendor/proj4/             # تحويل الإحداثيات
│   │   ├── vendor/tesseract/         # OCR (WASM)
│   │   ├── vendor/pdfjs/             # قراءة PDF
│   │   └── ...                       # مكتبات التصدير
│   │
│   └── tools/                        # أدوات البناء والجودة
│       ├── build-cloudflare-pages.js # سكريبت البناء
│       ├── check-js.js               # فحص صيغة JavaScript
│       ├── check-links.js            # فحص الروابط
│       └── qa-audit/                 # مجموعة اختبارات QA
│
├── facade-profile-tool/              # أداة مقطع الواجهة (مستقلة)
├── audit-artifacts/                  # تقارير وصور الاختبارات
└── server.js                         # خادم التطوير المحلي
```

---

## 5. الصفحات الوظيفية

| الصفحة | المسار | الغرض | الميزات الرئيسية |
|--------|--------|--------|-----------------|
| تسجيل الدخول | `/pages/login/` | المصادقة | إدارة الجلسة، وضع محلي |
| جديد | `/pages/new/` | قائمة الإدخال | رفع المستشار، علامات جديدة |
| فحص | `/pages/check/` | تحقق ميداني | قائمة فحص الموقع |
| مساحة | `/pages/survey/` | جمع البيانات | إدخال النقاط |
| ترقيم النقاط | `/pages/point-staking/` | تحديد المواقع | إحداثيات GPS |
| علامة ترازية | `/pages/new-level-mark/` | مرجع الارتفاع | إنشاء نقطة مرجعية |
| ميزانية ترازية | `/pages/level-budget/` | حسابات الترازية | طريقة HI، RL، فحص الإغلاق |
| استخراج إحداثيات | `/pages/coordinates-extractor/` | OCR | استخراج من الصور |
| اقتراح إحداثيات | `/pages/coordinates-proposal/` | شبكة تفاعلية | إدخال يدوي أو OCR |
| تصدير إحداثيات | `/pages/coordinates-export/` | التصدير | CSV/Excel/KML، خريطة، تحويل CRS |
| مقطع الواجهة | `/pages/facade-profile/` | تحويل المقطع | من رأسي إلى أفقي |
| إدارة المواقع | `/pages/site-management/` | CRUD البيانات | شركات، مناطق، قطع أراضي |
| ملف مشترك | `/pages/shared-file/` | المرفقات | رفع وإدارة الملفات |
| المدير | `/pages/admin/` | لوحة التحكم | مستخدمون، صلاحيات، مواقع، صفحات |

---

## 6. نقاط API

### المصادقة
| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/bootstrap` | فحص إعدادات Cloudflare |
| POST | `/api/login` | تسجيل الدخول |
| GET | `/api/logout` | تسجيل الخروج |
| GET | `/api/me` | بيانات المستخدم الحالي |

### إدارة المستخدمين (مدير فقط)
| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/users` | قائمة المستخدمين |
| POST | `/api/users` | إنشاء مستخدم جديد |
| GET | `/api/users/[id]` | تفاصيل مستخدم |
| PATCH | `/api/users/[id]` | تعديل مستخدم |

### مزامنة Workspaces
| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/workspaces` | قائمة الـ Workspaces |
| GET | `/api/workspaces/[id]` | حالة Workspace |
| PUT | `/api/workspaces/[id]` | استبدال كامل |
| PATCH | `/api/workspaces/[id]` | تحديث جزئي |
| DELETE | `/api/workspaces/[id]` | حذف Workspace |

### إدارة الملفات
| الطريقة | المسار | الوصف |
|---------|--------|-------|
| GET | `/api/workspaces/[id]/files` | قائمة الملفات |
| POST | `/api/workspaces/[id]/files` | رفع ملف |
| GET | `/api/workspaces/[id]/files/[fileId]` | تفاصيل ملف |
| DELETE | `/api/workspaces/[id]/files/[fileId]` | حذف ملف |

---

## 7. بنية البيانات

### المستخدم
```javascript
{
  id: "user-xxxx",
  username: "john_doe",
  full_name: "اسم المستخدم",
  password_hash: "pbkdf2-sha256$100000$...",
  is_admin: true,
  permissions: ["pages.new", "sites.write", "*"],
  created_at: "2026-01-01T00:00:00Z"
}
```

### Workspace
```javascript
{
  id: "workspace-id",
  title: "اسم المشروع",
  workspace_title: "الشركة - قطعة 123",
  created_at: "...",
  updated_at: "...",
  meta: {
    site: {
      id, company, plot, area, owner,
      consultant, project, contractor,
      survey_date, subject, surveyor
    }
  },
  pages: { "level-budget": { data: {} } },
  files: { "file-id": { name, size } }
}
```

### قاعدة بيانات المواقع (مدمجة)
```javascript
SITES_DB = {
  companies: [{
    id, name,
    areas: [{
      id, name,
      plots: [{ id, plot, owner, consultant, ... }]
    }]
  }]
}
```

---

## 8. التخزين السحابي

| المورد | النوع | الربط | الغرض |
|--------|------|-------|-------|
| ATLAS_DATA | KV | مستخدمون، مواقع مخصصة، صفحات |
| ATLAS_SESSIONS | KV | رموز الجلسة (TTL 7 أيام) |
| ATLAS_PAGES_BUCKET | R2 | صفحات مرفوعة وملفات Workspace |
| ATLAS_ADMIN_PASSWORD | Secret | كلمة مرور المدير الأولية |

---

## 9. الـ Service Worker

- **الاستراتيجية:** Network-first مع fallback للتخزين المؤقت.
- **Pre-caching:** جميع ملفات التطبيق الأساسية.
- **تخزين الملفات المشتركة:** Cache منفصل (حد أقصى 30 ملف).
- **إدارة الإصدار:** يتبع إصدارات الـ Cache من `/version.json`.
- **التحديثات التلقائية:** يُعلم المستخدم عند توفر إصدار جديد.

---

## 10. نظام المصادقة

- **تشفير كلمات المرور:** PBKDF2-SHA256 (100,000–200,000 تكرار).
- **إدارة الجلسة:** Cookie (ATLAS_SESSION) صالحة 7 أيام.
- **الوضع المحلي:** يمكن تفعيله بـ `ATLAS_ENABLE_LOCAL_MODE=1` للتطوير.
- **نظام الصلاحيات:** قائمة صلاحيات لكل مستخدم (مثل `pages.new`, `sites.write`, `*`).

---

## 11. التصميم والواجهة

### نظام الألوان
| المتغير | القيمة | الغرض |
|---------|--------|-------|
| Primary | `#0a7f8a` | الفيروزي الرئيسي |
| Accent | `#f1873e` | البرتقالي المميز |
| Background | `#f1f5f9` | خلفية رمادية فاتحة |
| Surface | `#ffffff` | سطح أبيض |
| Text | `#1e293b` | نص داكن |
| Muted | `#64748b` | نص خافت |

### الخطوط
- **Cairo:** للنصوص العربية
- **Outfit:** للنصوص الإنجليزية

### الاستجابة
- Mobile-first (الأولوية للهاتف)
- يدعم: هاتف، تابلت، سطح المكتب
- RTL كامل للعربية

---

## 12. اختبارات الجودة (QA)

**الموقع:** `web/tools/qa-audit/`

**ما يتم فحصه:**
- حالة HTTP (كشف 404 و500)
- أخطاء Console
- التصميم المتجاوب (سطح مكتب، تابلت، هاتف)
- منطق التوجيه (ضيف vs. مستخدم مسجل)
- أحجام نقاط اللمس (44px حد أدنى للموبايل)

**الأوامر:**
```bash
npm run qa:audit              # تشغيل جميع الاختبارات
npm run qa:audit:local        # اختبار محلي فقط
npm run check                 # فحص JS + الروابط
```

**النتائج الحالية:** جميع الاختبارات تنجح ✅

---

## 13. النشر

### خطوات ما قبل النشر
```bash
npm run check                    # فحص الصيغة والروابط
npm run build:cloudflare         # بناء المشروع
npm run deploy:cloudflare        # نشر عبر Wrangler
```

### ما يُستبعد من البناء
- `.git`, `node_modules`, `tools`, `README.md`, `package.json`, ملفات `.xlsx`

### أوضاع التشغيل

| الوضع | متى يُستخدم | الإعداد |
|-------|------------|---------|
| Local | التطوير والاختبار | `ATLAS_ENABLE_LOCAL_MODE=1` |
| Cloud | الإنتاج | Cloudflare KV + R2 |

---

## 14. أداة مقطع الواجهة المستقلة

**الموقع:** `/facade-profile-tool/`

- أداة HTML مستقلة لتحويل نقاط مساحة الواجهات.
- تحويل من نقاط رأسية إلى مقطع أفقي.
- يدعم: رفع CSV/SDR، تحويل بنقطتي تحكم، خيار عكس المحور X.
- تصدير بصيغة: COGO PENZD CSV، DXF لـ AutoCAD.

---

## 15. الملفات الرئيسية وأهميتها

| الملف | المسار | الأسطر | الأهمية |
|-------|--------|--------|---------|
| App Shell | `web/index.html` | 846 | هيكل التطبيق الكامل |
| منطق التطبيق | `web/shared/app.js` | 2,231 | الحالة والتوجيه والـ Workspace |
| المصادقة | `web/shared/auth.js` | 1,123 | تسجيل الدخول والجلسات |
| قاعدة المواقع | `web/shared/sites_data.js` | 30,011 | جميع بيانات المواقع |
| Service Worker | `web/sw.js` | 400+ | التخزين المؤقت والـ PWA |
| خادم محلي | `server.js` | 169 | التطوير المحلي |
| بناء Cloudflare | `web/tools/build-cloudflare-pages.js` | 91 | سكريبت البناء |
| حسابات الترازية | `web/pages/level-budget/index.html` | 1000+ | حسابات المساحة الأكثر تعقيداً |

---

## 16. التحديثات الأخيرة (من version.json)

آخر بناء (2026-05-22):
1. إصلاح استرداد جلسة الضيف ومنع طلبات API غير المصرح بها.
2. إضافة تخزين ملفات Workspace على Cloudflare R2 لكل مستخدم.
3. تحسين الأمان والصلاحيات والمزامنة.
4. إصلاح ازدواجية اختيار الموقع.
5. إضافة فحص تلقائي للملفات والروابط.
6. تحديث تقرير المستوى.
7. إضافة خيارات تصدير PDF/Word.
8. إصلاح تنسيق وشكل التقارير.
9. دعم كامل لتحديثات الإنترنت.

---

## 17. ملخص تنفيذي

ATLAS هو تطبيق مساحة هندسية احترافي متكامل يجمع بين:

- **واجهة مخصصة للهاتف** لمهندسي الميدان.
- **دعم قوي للعمل دون اتصال** عبر PWA / Service Worker.
- **مزامنة سحابية** عبر Cloudflare R2 + KV.
- **حسابات مساحية متقدمة** (ترازية، إحداثيات، واجهات).
- **دعم متعدد اللغات** (عربي RTL + إنجليزي).
- **نظام صلاحيات متكامل** للفرق.
- **اختبارات جودة آلية** وعملية نشر موثوقة.

التطبيق مبني بـ Vanilla JavaScript بدون إطار عمل، مما يجعله سريعاً وخفيفاً مع مرونة عالية. الكود منظم جيداً مع منطق واضح للأمان (PBKDF2، إدارة جلسات) وإمكانية وصول ممتازة على الهاتف.
