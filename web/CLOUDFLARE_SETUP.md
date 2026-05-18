# نقل ATLAS إلى Cloudflare بدون GitHub

المقصود غالبا هو **Cloudflare R2** وليس P2.  
الخطة الصحيحة ليست أن نضع البيانات الحساسة داخل ملفات الموقع، لأن أي ملف Static يصل للمتصفح يمكن قراءته. الخطة الأفضل:

- نشر واجهة الموقع على **Cloudflare Pages** عن طريق Direct Upload بدون GitHub.
- تخزين الملفات والصفحات المرفوعة في **Cloudflare R2** كـ bucket خاص.
- تخزين المستخدمين والجلسات والبيانات الصغيرة في **Cloudflare KV**.
- الوصول للبيانات الحساسة يكون فقط من خلال Pages Functions بعد تسجيل الدخول والصلاحيات.

## لماذا لا نستخدم GitHub؟

يمكن استخدام GitHub Private Repository، لكن لو هدفك ألا يكون الكود والملفات الحساسة موجودة على GitHub نهائيا، استخدم Direct Upload من جهازك إلى Cloudflare Pages.

## المهم أمنيا

لا تضع أي بيانات حساسة داخل:

- `index.html`
- ملفات JS/CSS
- `sites_data.js`
- أي ملف داخل مجلد النشر العام

أي شيء داخل الواجهة يمكن للمستخدم تحميله. البيانات الحساسة يجب أن تكون خلف API في `functions/` وتخزن في R2/KV.

## موارد Cloudflare المطلوبة

أنشئ الموارد التالية من Cloudflare Dashboard:

1. Pages Project
   - الاسم المقترح: `atlas-site`
   - طريقة النشر: Direct Upload

2. KV Namespace
   - الاسم: `atlas-data`
   - Binding داخل Pages: `ATLAS_DATA`
   - الاستخدام: المستخدمون، بيانات المواقع، manifest للصفحات المرفوعة

3. KV Namespace
   - الاسم: `atlas-sessions`
   - Binding داخل Pages: `ATLAS_SESSIONS`
   - الاستخدام: جلسات تسجيل الدخول

4. R2 Bucket
   - الاسم المقترح: `atlas-pages-bucket`
   - Binding داخل Pages: `ATLAS_PAGES_BUCKET`
   - الاستخدام: الملفات والصفحات المرفوعة من لوحة الإدارة

5. Environment variable
   - الاسم: `ATLAS_ADMIN_PASSWORD`
   - القيمة: كلمة مرور قوية للمدير الأول

## النشر بدون GitHub

من داخل مجلد `web`:

```bash
npm run check
npm run build:cloudflare
npx wrangler login
npx wrangler pages deploy ../dist/cloudflare-pages --project-name atlas-site
```

أو بعد تسجيل الدخول:

```bash
npm run deploy:cloudflare
```

السكربت `build:cloudflare` ينسخ ملفات التشغيل فقط إلى:

```text
dist/cloudflare-pages
```

ولا يرفع ملفات التطوير مثل:

- `package.json`
- `README.md`
- `CLOUDFLARE_SETUP.md`
- `local-server-router.php`
- `wrangler.example.toml`

## إعداد bindings

يمكن عملها من Dashboard:

1. افتح `Workers & Pages`
2. افتح مشروع `atlas-site`
3. ادخل إلى `Settings`
4. افتح `Bindings`
5. أضف:
   - KV: `ATLAS_DATA`
   - KV: `ATLAS_SESSIONS`
   - R2: `ATLAS_PAGES_BUCKET`
6. أعد النشر بعد إضافة bindings

بديل متقدم: انسخ `wrangler.example.toml` إلى `wrangler.toml` وضع IDs الحقيقية. لا تضع أسرار أو كلمات مرور في `wrangler.toml`.

## تخزين الموقع في R2

لو تقصد ملفات المستخدمين والصفحات المرفوعة: نعم، هذا معمول له binding باسم:

```text
ATLAS_PAGES_BUCKET
```

ولو تقصد وضع كل ملفات الموقع نفسه داخل R2: لا أنصح به في هذه المرحلة. Cloudflare Pages أفضل لملفات الواجهة، وR2 أفضل للملفات الخاصة أو الكبيرة التي يتم الوصول لها عبر API وصلاحيات.

## بعد أول نشر

اختبر:

- `/pages/login/`
- `/pages/admin/`
- `/api/me`
- رفع صفحة من لوحة الإدارة
- فتح صفحة مرفوعة من `/published/<slug>/`

## مراجع Cloudflare الرسمية

- Direct Upload:
  - https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- Pages Functions configuration:
  - https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Pages bindings مع R2:
  - https://developers.cloudflare.com/pages/functions/bindings/
- R2:
  - https://developers.cloudflare.com/r2/
