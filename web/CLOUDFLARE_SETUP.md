# Cloudflare Pages Setup

هذا المشروع جاهز للنشر على Cloudflare Pages، لكن النشر الفعلي يحتاج ضبط المشروع من لوحة Cloudflare وربط الموارد المطلوبة.

المستودع المرفوع:

- `https://github.com/tahershawki1/ATLAS.git`

## مهم قبل البدء

المشروع الفعلي الذي يجب اعتباره Root Directory داخل Cloudflare هو:

- `web`

السبب:

- ملفات الموقع الجاهزة موجودة داخل `web/`
- مجلد `functions/` الخاص بـ Pages Functions موجود داخل `web/functions/`
- Cloudflare يشترط أن يكون مجلد `functions` عند جذر مشروع Pages

بحسب وثائق Cloudflare الرسمية:

- عند نشر موقع Static HTML على Pages يمكن استخدام:
  - Build command: `exit 0`
  - Build output directory: مجلد الموقع نفسه
- وعند استخدام `functions/` يجب أن يكون داخل جذر مشروع Pages

المصادر الرسمية:

- Static HTML deployment:
  - https://developers.cloudflare.com/pages/framework-guides/deploy-anything/
- Pages Functions configuration:
  - https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Bindings:
  - https://developers.cloudflare.com/pages/functions/bindings/
- R2 with Pages:
  - https://developers.cloudflare.com/pages/tutorials/use-r2-as-static-asset-storage-for-pages/

## إعداد مشروع Cloudflare Pages

من لوحة Cloudflare:

1. افتح:
   - `Workers & Pages`
2. اختر:
   - `Create application`
3. اختر:
   - `Pages`
4. اختر:
   - `Import an existing Git repository`
5. اربط GitHub وحدد هذا المستودع:
   - `tahershawki1/ATLAS`

## إعدادات البناء الصحيحة

في صفحة إعداد المشروع استخدم القيم التالية:

- Production branch:
  - `main`
- Root directory:
  - `web`
- Build command:
  - `exit 0`
- Build output directory:
  - `.`

هذه النقطة مهمة جدًا:

- لا تضع `ATLAS-main`
- لا تضع `web` كـ output directory إذا كنت قد اخترت `web` أصلًا كـ Root Directory
- لأن Cloudflare وقتها سيبحث داخل `web/web`

## الموارد المطلوبة

حتى تعمل لوحة الإدارة وتسجيل الدخول ورفع الصفحات، أنشئ هذه الموارد داخل Cloudflare:

### 1. KV Namespace للمستخدمين والبيانات

أنشئ Namespace باسم مناسب مثل:

- `atlas-data`

ثم اربطه بالاسم:

- `ATLAS_DATA`

الاستخدام:

- المستخدمون
- بيانات المواقع المخصصة
- Manifest الصفحات المرفوعة

### 2. KV Namespace للجلسات

أنشئ Namespace باسم مناسب مثل:

- `atlas-sessions`

ثم اربطه بالاسم:

- `ATLAS_SESSIONS`

الاستخدام:

- جلسات تسجيل الدخول

### 3. R2 Bucket للصفحات المرفوعة

أنشئ Bucket باسم مناسب مثل:

- `atlas-pages-bucket`

ثم اربطه بالاسم:

- `ATLAS_PAGES_BUCKET`

الاستخدام:

- ملفات HTML / CSS / JS للصفحات أو المجلدات التي يتم رفعها من لوحة الإدارة

## أين تضيف الـ Bindings

بعد إنشاء مشروع Pages:

1. افتح المشروع
2. اذهب إلى:
   - `Settings`
3. ثم:
   - `Functions`
4. أضف:
   - KV bindings
   - R2 bucket bindings

بالأسماء نفسها حرفيًا:

- `ATLAS_DATA`
- `ATLAS_SESSIONS`
- `ATLAS_PAGES_BUCKET`

## المسارات المهمة داخل المشروع

### صفحات الواجهة

- الصفحة الرئيسية:
  - `/index.html`
- صفحة تسجيل الدخول:
  - `/pages/login/`
- لوحة الإدارة:
  - `/pages/admin/`

### Pages Functions

هذه الملفات موجودة بالفعل:

- `web/functions/api/bootstrap.js`
- `web/functions/api/login.js`
- `web/functions/api/logout.js`
- `web/functions/api/me.js`
- `web/functions/api/users.js`
- `web/functions/api/users/[id].js`
- `web/functions/api/sites.js`
- `web/functions/api/pages.js`
- `web/functions/api/pages/[slug].js`
- `web/functions/published/[[path]].js`

## وضع التشغيل

### Cloudflare mode

إذا كانت الـ bindings مضبوطة:

- تسجيل الدخول يعمل عبر KV
- إدارة المستخدمين تعمل عبر KV
- حفظ المواقع الجديدة أو المعدلة يعمل عبر KV
- رفع صفحات جديدة يعمل عبر R2
- الصفحات المرفوعة تُفتح من:
  - `/published/<slug>/`

### Local mode

إذا لم تضف الـ bindings:

- النظام سيعمل محليًا داخل المتصفح
- المستخدمون والمواقع سيُحفظون في `localStorage`
- رفع الصفحات الديناميكي سيظل معطلًا

## بيانات الدخول الافتراضية

أول تشغيل ينشئ مستخدمًا افتراضيًا:

- Username:
  - `admin`
- Password:
  - `admin123`

بعد أول دخول:

- افتح لوحة الإدارة
- غيّر كلمة المرور مباشرة

## بعد أول نشر

بعد نجاح أول Deploy، اختبر الروابط التالية:

1. الصفحة الرئيسية
   - `https://<your-project>.pages.dev/`
2. تسجيل الدخول
   - `https://<your-project>.pages.dev/pages/login/`
3. لوحة الإدارة
   - `https://<your-project>.pages.dev/pages/admin/`

## إذا أردت استخدام Wrangler لاحقًا

لا تكتب `wrangler.toml` يدويًا الآن إلا بعد إنشاء مشروع Pages والـ bindings من لوحة Cloudflare.

الطريقة الموصى بها من Cloudflare هي:

- ادخل إلى مجلد `web`
- ثم شغل:

```bash
npx wrangler pages download config
```

هذا سيولد ملف Wrangler مطابقًا لإعدادات المشروع الحالية بدل كتابة ملف ناقص يدويًا.

## ملاحظات تنفيذية

- المشروع الآن مناسب أكثر للنشر من خلال GitHub integration داخل Cloudflare Pages
- لا تحتاج Build system فعلي لأن الموقع Static
- `functions/` ستعمل فقط إذا كان Root Directory مضبوطًا على `web`
