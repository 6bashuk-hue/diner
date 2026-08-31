# אפליקציית מטבח (Capacitor) — הדיינר

עוטפת את `admin.html` (מסך המטבח/אדמין הקיים באתר) באפליקציית Android אמיתית,
כדי לאפשר **הדפסה תרמית ישירה דרך USB בלי root** — דבר ש-Chrome/WebUSB לא
מסוגל לעשות.

## למה לא מספיק WebUSB (הדפדפן)?

אנדרואיד טוען אוטומטית דרייבר קרנל (`usblp`) על כל מדפסת USB מסוג USB Printer
Class. Chrome (וכל WebView מבוסס Chromium) לא יכול לתפוס (`claimInterface`)
ממשק USB שדרייבר קרנל כבר מחזיק — זו מגבלה קשיחה של Chromium, ואין דרך לעקוף
אותה בלי הרשאות root. אפליקציית Android נייטיבית **יכולה**, דרך
`UsbDeviceConnection.claimInterface(iface, force = true)` — זה בדיוק מה שהפלאגין
`UsbThermalPrinterPlugin` עושה.

הדף `admin.html` **כבר** כולל קוד WebUSB (ראו `PRINTER_WEBUSB.md` בשורש
הריפו) שעובד היטב בדפדפן רגיל (Chrome/Edge על מחשב/טאבלט) — אבל **בתוך
ה-WebView של Capacitor, `navigator.usb` לא קיים בכלל** (Android WebView לא
מממש WebUSB, לא רק "תפוס" ע"י דרייבר קרנל כמו בטאב Chrome רגיל). בלי החלק
הבא (`native-printer-bridge.js`), הכפתור "🔌 חבר מדפסת USB" בתוך האפליקציה
פשוט לא היה עושה כלום מעבר להצגת "הדפדפן לא תומך ב-WebUSB".

## מבנה הפרויקט

```
capacitor-kitchen-app/
├── capacitor.config.ts       # appId/appName מוגדרים דרך env (ראו טבלה למטה)
├── scripts/sync-web.js       # מעתיק admin.html + קבצים סטטיים ל-www/ (build)
├── www-inject/                     # קטעי סקריפט שמוזרקים ל-www/index.html בזמן build בלבד
│   ├── fetch-bridge.js             #   כל fetch (יחסי ומוחלט) → NativeHttp, עוקף CORS לגמרי
│   ├── audio-loop-fix.js           #   תיקון ל-<audio loop> שלא עובד ב-WebView
│   └── native-printer-bridge.js    #   מחליף את escposConnect/IsConnected/PrintOrder ב-USB נייטיבי
├── www/                       # (נוצר ע"י sync-web.js, לא ב-git) — index.html + assets
└── android/                   # פרויקט Android (נוצר ע"י `npx cap add android`)
    └── app/src/main/java/com/hadiner/kitchen/
        ├── MainActivity.kt          # רושם את שני הפלאגינים לפני super.onCreate()
        ├── UsbThermalPrinterPlugin.kt # connect / reconnectSilently / isConnected / printBytes (claimInterface force=true)
        └── NativeHttpPlugin.kt        # HTTP נייטיבי (HttpURLConnection) — לא CapacitorHttp, ראו הסבר למטה
```

**חשוב:** `admin.html` המקורי בשורש הריפו כמעט ולא משתנה — רק **שורה אחת**
נוספה בתוך בלוק ה-WebUSB הקיים (`window.escposBuildBytes = buildEscpos;`,
כדי לחשוף את בניית הקבלה כ-ESC/POS לשימוש חוזר מהאפליקציה הנייטיבית). כל
שאר התיקון קורה בזמן ה-build, ב-`www/index.html` (הקובץ שנוצר, לא ב-git).

## למה לא `CapacitorHttp`?

שקלנו לנתב את ה-fetch דרך `plugins.CapacitorHttp` המובנה של Capacitor. הבעיה:
Capacitor מבצע את ההחלפה של `window.fetch` בתוך מאזין `DOMContentLoaded` פנימי
משלו — מה שעלול "לבלוע" בשקט כל קוד אחר שעוטף את `fetch` באופן סינכרוני (למשל
קוד קיים ב-`admin.html` עצמו). הפתרון היציב: פלאגין Kotlin נייטיבי משלנו
(`NativeHttpPlugin`) שמבצע את הבקשה עם `HttpURLConnection` נטו, בלי מעורבות
של ה-WebView בכלל. כך גם **אין CORS בכלל** — CORS היא מגבלה של דפדפנים/WebView,
לא של שקע רשת נייטיבי.

## טבלת קונפיגורציה

| מפתח | איפה | ברירת מחדל | הערה |
|---|---|---|---|
| `APP_ID` | env בזמן build/`cap add` | `com.hadiner.kitchen` | Application ID של ה-APK |
| `APP_NAME` | env בזמן build | `הדיינר מטבח` | שם האפליקציה |
| `PROD_ORIGIN` | env, או `site.config.js` → `business.canonicalUrl` | הערך הקיים ב-`site.config.js` | הדומיין האמיתי של האתר — **חובה למלא נכון** לפני build לייצור, אחרת קריאות ה-API ייכשלו |
| VID/PID של המדפסת | `android/app/src/main/res/xml/usb_device_filter.xml` | ריק (מזהה לפי USB Printer Class) | ראו "איך למצוא VID/PID" למטה |

## Build מקומי

```bash
cd capacitor-kitchen-app
npm install
PROD_ORIGIN=https://your-real-site.netlify.app npm run build   # מריץ sync-web.js
npx cap sync android
cd android && ./gradlew assembleDebug        # דורש Android SDK מותקן מקומית
```

ה-APK ייצא ל-`android/app/build/outputs/apk/debug/app-debug.apk`.

## Build בענן (GitHub Actions — בלי מחשב)

Push לענף `main` שנוגע בקבצים הרלוונטים (או Run workflow ידני) מפעיל את
`.github/workflows/build-kitchen-app.yml`, שמריץ את כל השלבים למעלה ב-CI
ומעלה את ה-APK כ-artifact (בטאב Actions של ה-run → Artifacts).

לפני ה-build הראשון בענן, קבעו ב- Settings → Secrets and variables → Actions
→ Variables:
- `PROD_ORIGIN` — הדומיין האמיתי (חובה, אחרת ילקח מ-`site.config.js` שעדיין
  מכיל placeholder אם לא ערכתם אותו).
- `APP_ID` / `APP_NAME` — אופציונלי, יש ברירת מחדל.

## איך למצוא VID/PID של המדפסת

1. חברו את המדפסת לטלפון/טאבלט אנדרואיד (או למחשב) דרך USB.
2. **מחשב Linux/Mac:** `lsusb` → שורה כמו `ID 0483:5743` (הקסדצימלי; המרה
   לעשרוני נדרשת ל-XML — `0483` = 1155, `5743` = 22336, לדוגמה).
3. **טלפון אנדרואיד עם ADB:** `adb shell dumpsys usb` ותחפשו את השורה של
   ההתקן המחובר (`mVendorId`/`mProductId`, כבר בעשרוני).
4. מלאו ב-`android/app/src/main/res/xml/usb_device_filter.xml`:
   ```xml
   <usb-device vendor-id="1155" product-id="22336" />
   ```
   **זה לא חובה** — גם בלי זה, הפלאגין מזהה מדפסות לפי USB Printer Class
   (`interfaceClass == 7`) ב-`connect()`. ה-XML הזה משפיע רק על "פתח את
   האפליקציה אוטומטית כשמחברים את המדפסת" (intent-filter ב-Manifest).

## חיבור ה-JS ל-USB Printer — כבר מחובר

`admin.html` חושף `window.escposConnect()` / `window.escposIsConnected()` /
`window.escposPrintOrder()`, מבוססים על WebUSB (`navigator.usb`). הבעיה:
**Android WebView לא מממש WebUSB בכלל** — אז בתוך האפליקציה, שלוש הפונקציות
האלה לא היו עושות כלום מעבר להצגת "הדפדפן לא תומך ב-WebUSB".

`www-inject/native-printer-bridge.js` (מוזרק **אחרי** בלוק ה-WebUSB ב-build,
כדי לרוץ אחרי ש-`admin.html` כבר הגדיר את שלוש הפונקציות — כך ה-override שלו
לא נדרס) מחליף את שלושתן בגרסה מבוססת `UsbThermalPrinter` הנייטיבי, אבל
**קורא ל-`window.escposBuildBytes` (=`buildEscpos` המקורי) בלי לגעת בו** — כך
שרינדור הקבלה, הפורמט, וקידוד ה-ESC/POS נשארים בדיוק אותו קוד; רק התחבורה
(WebUSB מול USB נייטיבי) מוחלפת. בדפדפן רגיל (לא בתוך Capacitor) שום דבר לא
משתנה — הקוד המקורי של WebUSB ממשיך לרוץ כרגיל.

זרימת החיבור בפועל בתוך האפליקציה:
1. בעליית האפליקציה: ניסיון `reconnectSilently()` שקט (בלי דיאלוג הרשאה) —
   מתחבר לבד אם המדפסת כבר אושרה בעבר.
2. לחיצה על **"🔌 חבר מדפסת USB"**: קוראת ל-`UsbThermalPrinter.connect({})`,
   שמזהה את המדפסת לפי USB Printer Class ומבקשת הרשאת USB של אנדרואיד אם
   צריך (דיאלוג מערכת — לא דיאלוג WebUSB).
3. לחיצה על 🖨 בכרטיס הזמנה: `printOrder()` (לא השתנה) → `escposPrintOrder(o)`
   → עכשיו זו הגרסה הנייטיבית → `escposBuildBytes(o)` בונה את אותם בתים
   בדיוק → נשלח דרך `UsbThermalPrinter.printBytes()`.

## הערה מה-self-test של המדפסת (HPRT TP801)

לפי ה-self-test שצילמת: **Cutter: Disable**. הקוד הקיים (`buildEscpos`) שולח
פקודת חיתוך חלקי (`GS V 66 0`) בסוף כל קבלה — אם ה-DIP switch של המדפסת
מגדיר את החותך כ-Disable, הפקודה הזו כנראה תתעלם (רוב מדפסות ESC/POS פשוט
מתעלמות מפקודת חיתוך כשאין חותך פיזי מופעל) ולא תגרום לשגיאה, אבל בפועל
הנייר לא ייחתך אוטומטית. אם תרצו חיתוך אוטומטי — הפעילו את החותך בהגדרות
ה-DIP switch של המדפסת עצמה (לא בקוד). Print Resolution `203dpi` תואם בדיוק
ל-`ESCPOS_WIDTH_DOTS = 576` הקיים (80mm @ 203dpi) — לא נדרש שינוי.

## הסרה

מחקו את התיקייה `capacitor-kitchen-app/` ואת
`.github/workflows/build-kitchen-app.yml`. שני השינויים היחידים מחוץ לתיקייה
הזו הם ה-CORS headers ב-`netlify/functions/admin-login.js` ו-
`netlify/functions/notify-order-status.js` — לא מזיקים להישאר גם בלי
האפליקציה (הם רק מוסיפים headers, לא משנים לוגיקה), אבל אפשר להחזיר אותם
לגרסה הקודמת אם רוצים.

## ⚠️ צ'קליסט בדיקה ידני (על מכשיר פיזי — לא ניתן לבצע מכאן)

1. **Build:** ה-workflow ב-GitHub Actions ירוק, וה-APK ירד בהצלחה.
2. **התקנה:** התקינו את ה-APK על טאבלט אנדרואיד (יש לאפשר "התקנה ממקורות
   לא ידועים" אם לא דרך Play Store).
3. **פתיחה:** האפליקציה נפתחת, מציגה את מסך המטבח, מתחברת ל-Firebase
   ומציגה הזמנות קיימות (בודק ש-`PROD_ORIGIN`/Firebase לא שבורים).
4. **CORS בפועל:** התחברו לאדמין (מסך login) — קריאה ל-`admin-login`
   Function; אם היא נכשלת, בדקו את `PROD_ORIGIN` ב-build ואת ה-CORS headers
   שנוספו.
5. **חיבור USB:** חברו את המדפסת התרמית (USB-OTG) ולחצו **"🔌 חבר מדפסת
   USB"** בסרגל העליון. בדקו logcat (`adb logcat | grep UsbThermalPrinter`) —
   אמורה להופיע שורת "USB printer connected".
6. **הרשאת USB:** בפעם הראשונה אמור לצוץ דיאלוג הרשאת USB של אנדרואיד (לא
   דיאלוג WebUSB) — אשרו. סגרו ופתחו את האפליקציה מחדש ווודאו שהיא מתחברת
   לבד (`reconnectSilently`, בלי דיאלוג חוזר).
7. **הדפסה בפועל:** לחצו 🖨 על כרטיס הזמנה ווודאו שהקבלה יוצאת עם עברית
   תקינה ורוחב תקין (576 dots ל-80mm תואם ל-203dpi מה-self-test; אם חתוך —
   שנו ב-קוד ה-ESC/POS הקיים כפי שמתואר ב-`PRINTER_WEBUSB.md`). אם החיתוך
   האוטומטי לא קורה — בדקו אם ה-Cutter מוגדר Disable ב-DIP switch של המדפסת.
8. **claimInterface:** אם ההדפסה נכשלת ספציפית עם "Failed to claim USB
   interface" ב-logcat — נסו לנתק ולחבר את המדפסת מחדש, ווודאו שאין אפליקציה
   אחרת (כמו אפליקציית מדפסת של היצרן) שכבר תופסת אותה.
9. **צליל התראה:** ודאו שצליל ההתראה (`kitchen-alert-sound`) מתנגן בלולאה
   ולא נעצר אחרי נגינה אחת (תיקון ה-`audio-loop-fix`).
10. **Edge-to-edge:** ודאו שאין חפיפה בין תוכן הדף לבין שורת הסטטוס/הניווט
    של אנדרואיד (במיוחד על מכשיר עם Android 15+/API 35+).
11. **רענון/אתחול:** סגרו ופתחו את האפליקציה מחדש — ההתחברות ל-Firebase
    ולמדפסת (אם עדיין מחוברת פיזית) אמורות לחזור בלי אינטראקציה נוספת.
