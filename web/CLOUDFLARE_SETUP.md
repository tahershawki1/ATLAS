# Cloudflare Setup

لكي تعمل لوحة الإدارة بعد رفع المشروع على Cloudflare Pages مع حفظ المستخدمين والمواقع والصفحات المرفوعة، اربط المشروع بهذه الـ bindings داخل Cloudflare:

## Required Bindings

1. `ATLAS_DATA`
نوعه: `KV Namespace`
الاستخدام: حفظ المستخدمين وبيانات المواقع المعدلة وManifest الصفحات المرفوعة.

2. `ATLAS_SESSIONS`
نوعه: `KV Namespace`
الاستخدام: جلسات تسجيل الدخول.

3. `ATLAS_PAGES_BUCKET`
نوعه: `R2 Bucket`
الاستخدام: حفظ ملفات الصفحات أو المجلدات التي يتم رفعها من لوحة الإدارة.

## What Was Added

- `functions/api/bootstrap.js`
- `functions/api/login.js`
- `functions/api/logout.js`
- `functions/api/me.js`
- `functions/api/users.js`
- `functions/api/users/[id].js`
- `functions/api/sites.js`
- `functions/api/pages.js`
- `functions/api/pages/[slug].js`
- `functions/published/[[path]].js`

## Runtime Modes

### Cloudflare mode

إذا كانت الـ bindings السابقة مضبوطة، سيعمل النظام في وضع Cloudflare:

- المستخدمون محفوظون في `ATLAS_DATA`
- الجلسات محفوظة في `ATLAS_SESSIONS`
- الصفحات المرفوعة محفوظة في `ATLAS_PAGES_BUCKET`
- الصفحات المرفوعة تُفتح من خلال:

`/published/<slug>/`

### Local mode

إذا لم تكن الـ bindings مضبوطة، سيعمل النظام في وضع محلي:

- المستخدمون محفوظون في `localStorage`
- المواقع المعدلة محفوظة في `localStorage`
- رفع الصفحات الديناميكي يكون معطلًا حتى تفعيل Cloudflare

## Default Admin

أول تشغيل ينشئ مستخدمًا افتراضيًا:

- Username: `admin`
- Password: `admin123`

غيّر كلمة المرور مباشرة من لوحة الإدارة بعد أول دخول.
