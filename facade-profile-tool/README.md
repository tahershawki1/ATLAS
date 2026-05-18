# Facade Profile Converter

أداة HTML/CSS/JS لتحويل نقاط رفع الواجهات من الوضع الرأسي/المكاني إلى بروفايل أفقي.

## فكرة الأداة

- X Profile = إسقاط النقطة على خط الواجهة بين نقاط البداية ونقاط النهاية.
- Y Level = المنسوب الأصلي Z.
- Z = 0.
- يمكن عمل Mirror X لو الرفع جاي بالعكس.
- يمكن تصدير Civil 3D COGO CSV بصيغة PENZD أو PNEZD.
- يمكن تصدير DXF للمعاينة في AutoCAD.

## طريقة الاستخدام

1. افتح index.html في المتصفح.
2. ارفع ملف CSV أو SDR.
3. حدد نقاط البداية جهة اليسار، مثال:
   CP1,CP2
4. حدد نقاط النهاية جهة اليمين، مثال:
   CP13,CP14
5. اضغط تحويل Profile.
6. لو الاتجاه معكوس اضغط Mirror X.
7. صدّر الملف المناسب.

## صيغة CSV المدعومة

Point,Easting,Northing,Level,Code

مثال:

CP1,500000.000,2770000.000,1.541,CP
CP2,500001.000,2770010.000,1.611,CP

## Civil 3D

للبروفايل الأفقي غالبًا استخدم:

PENZD comma delimited

لأن:
- Easting = X Profile
- Northing = Level
- Elevation = 0
- Description = اسم النقطة الأصلي
