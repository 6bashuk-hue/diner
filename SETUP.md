# מדריך התקנה — מהעתק ריק לאתר חי

זהו מדריך ההקמה עבור התבנית: אתר הזמנות + מסך מטבח (KDS) + מערכת שיווק, בנוי על
Netlify Functions + Firebase Realtime Database, בלי build step (HTML/JS פשוטים).

כל הקוד כבר עובד — מה שנשאר הוא **הקמת התשתית שלך** (Firebase + Netlify משלך, לא
משותפת עם אף אחד) **ומילוי הזהות העסקית שלך** בכמה קבצים ספציפיים.

> ⚠️ **לפני שמתחילים**: לעולם אל תשתמשו בפרויקט Firebase או באתר Netlify של מישהו
> אחר. כל עסק צריך פרויקט Firebase נפרד משלו — זה גם עניין של פרטיות (הזמנות/טלפונים
> של הלקוחות שלכם) וגם כדי שלא תוכלו בטעות לכתוב לנתונים של עסק אחר.

---

## שלב 1 — Firebase: יצירת פרויקט

1. היכנסו ל-[console.firebase.google.com](https://console.firebase.google.com) וצרו
   פרויקט חדש.
2. בתפריט הצדדי: **Build → Realtime Database → Create Database**. בחרו region (למשל
   `europe-west1`), והתחילו במצב **test mode** (נסגור את זה בהמשך — ראו שלב 3).
3. העתיקו את ה-**URL** של בסיס הנתונים (נראה כמו
   `https://YOUR-PROJECT-default-rtdb.REGION.firebasedatabase.app/`) — תצטרכו אותו בשלב 5.
4. **Project settings → General** → תחת "Your apps" הוסיפו אפליקציית **Web** (אין
   צורך ב-SDK, רק כדי לקבל Web API Key) → העתיקו את ה-**Web API Key**.

## שלב 2 — Firebase: חוקי אבטחה בסיסיים

הדביקו את התוכן של `firebase-rules.json` (בשורש הריפו) ב-**Realtime Database → Rules**
ולחצו **Publish**. פירוט מלא של מה החוקים האלה עושים ב-[`SECURITY.md`](SECURITY.md).

זו רק שכבה ראשונה. נעילה מלאה (המומלצת לפני שאתם באמת פותחים למכירה) מתועדת צעד-אחר-צעד
ב-[`DEPLOY_LOCKDOWN.md`](DEPLOY_LOCKDOWN.md) — כוללת יצירת משתמש אדמין ב-Firebase
Authentication (`scripts/set-admin-claim.js` כבר בריפו, גנרי, לא דורש שינוי).

## שלב 3 — Netlify: פריסה + משתני סביבה

1. חברו את הריפו הזה ל-[Netlify](https://app.netlify.com) (New site from Git).
2. **Site settings → Environment variables** — הגדירו:

| משתנה | חובה? | תיאור |
|---|---|---|
| `ADMIN_PASSWORD` | כן | סיסמת האדמין (מסך מטבח, עריכת תפריט, מערכת שיווק) |
| `FB_URL` | כן | ה-URL מהשלב 1 |
| `FB_SECRET` | לנעילה המלאה | Database secret — ראו `DEPLOY_LOCKDOWN.md` |
| `TG_TOKEN`, `TG_CHAT` | אופציונלי | התראת הזמנה חדשה בטלגרם |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | אופציונלי | התראות Push ללקוחות |

הרצת `npx web-push generate-vapid-keys` מקומית מייצרת את זוג מפתחות ה-VAPID.

3. Deploy. ה-URL של האתר שלכם (`https://YOUR-SITE.netlify.app`) יידרש בשלב 5.

## שלב 4 — `site.config.js`: הזהות העסקית שלכם

זהו **קובץ יחיד** בשורש הריפו עם כל פרטי העסק — שם, טלפון, כתובת, שעות, וגם החיבור
ל-Firebase (מהשלב 1). הוא נטען גם בדפדפן וגם בפונקציות השרת, אז זו נקודת עריכה אחת.

פתחו את `site.config.js` ומלאו כל שדה (יש הערה `←` ליד כל אחד):

- `business.*` — שם, תיאור קצר, סוג העסק, עיר, טלפון, כתובת, שעות, כתובת האתר (מ-Netlify).
- `firebase.dbUrl` / `firebase.apiKey` — מהשלב 1. `firebase.adminEmail` — בחרו אימייל
  לאדמין (לא חייב להיות אמיתי, למשל `owner@yourbusiness.local`) — תשתמשו בו שוב בשלב
  יצירת המשתמש ב-Firebase Auth (`DEPLOY_LOCKDOWN.md` שלב 4).
- `commerce.*` — דמי משלוח, מינימום להזמנה, סימן המטבע.
- `theme.*` — צבעי המותג (אופציונלי, ברירת המחדל תעבוד).

## שלב 5 — תגי SEO ב-`index.html`

בניגוד ל-`site.config.js`, בלוק ה-SEO ב-`index.html` (בין ההערות
`<!-- SEO:START -->` ל-`<!-- SEO:END -->`, שורות 7–39 בערך) **נשאר טקסט סטטי בכוונה**:
בוטים של תצוגה מקדימה (וואטסאפ, פייסבוק, גוגל) קוראים את ה-HTML הגולמי לפני שקוד
JavaScript רץ, כך שאי אפשר למלא אותו אוטומטית מ-`site.config.js`.

עברו על כל שורה בבלוק (יש הערה ליד כל אחת) ומלאו ידנית:

- [ ] `<title>` ו-`<meta name="description">`
- [ ] `<meta name="keywords">` ו-`<meta name="author">`
- [ ] `<link rel="canonical">` — כתובת האתר שלכם
- [ ] כל תגי `og:*` (site_name, title, description, image, url)
- [ ] `<meta name="theme-color">` — כדאי שיתאים ל-`site.config.js` → `theme.primary`
- [ ] `<meta name="apple-mobile-web-app-title">`
- [ ] בלוק ה-JSON-LD (`application/ld+json`): `name`, `telephone`, `address`,
      `openingHours`, `hasMap` — שמרו על JSON תקין (בלי פסיק אחרי הערך האחרון)

## שלב 6 — מערכת השיווק (אופציונלי אבל שווה את זה)

`marketing/lib/brand-config.js` הוא מאגר הידע שהעוזר השיווקי (עובד דרך Claude, בלי
עלויות API) משתמש בו כדי לכתוב פוסטים בקול של העסק שלכם ושל האזור שלכם. הוא מגיע
**ריק בכוונה** — כדי שלא תשגרו בטעות פרומפט שמדבר על עיר/עסק אחר.

1. פתחו את `marketing/lib/brand-config.js`.
2. תראו דוגמה מלאה, מהעסק שממנו הותאמה התבנית, ב-
   [`marketing/lib/examples/brand-config.example.js`](marketing/lib/examples/brand-config.example.js)
   ו-[`marketing/lib/examples/local-knowledge.example.js`](marketing/lib/examples/local-knowledge.example.js) —
   קבצים לעיון בלבד, לא נטענים על ידי האפליקציה.
3. מלאו את `BRAND_CONFIG` (סיפור המותג, קהל יעד, מתחרים, ביטויים אסורים) ואת
   `LOCAL_KNOWLEDGE` (היסטוריה/גיאוגרפיה/תרבות מקומית של האזור שלכם).
4. **אופציונלי**: אם יש לכם נושא רגיש שצריך התייחסות מיוחדת בשיווק (למשל כשרות,
   רישיון אלכוהול, אלרגנים) — מלאו את `audience.kashrutProfile` ואת
   `forbidden.sensitiveTerms`/`sensitiveTermsLabel` (ראו הדוגמה). ברירת המחדל: כבוי
   לגמרי, ורוב העסקים יכולים להשאיר את זה כך.
5. **`marketing/admin/quiz-management.html`**: מגיע עם 2 שאלות דוגמה (לחצו על כפתור
   "טען שאלות דוגמה" כדי לראות את הפורמט), החליפו אותן ב-8–12 שאלות טריוויה אמיתיות
   על העיר/העסק שלכם דרך הטופס בעמוד.

## שלב 7 — לוגו ואייקונים

הריפו מגיע עם `logo.png`/`icon-192.png`/`icon-512.png` בתור ריבועים בצבע מותג פשוט
(placeholder) — **החליפו אותם בלוגו האמיתי שלכם** לפני שאתם עולים לאוויר (שמרו על
אותם שמות קבצים ומידות: 192×192 ו-512×512 פיקסלים, ריבועיים).

## שלב 8 — בדיקה

```bash
npm install
npm test        # 27 בדיקות אמורות לעבור
```

ואז פתחו את האתר שנפרס, ובדקו קצה-לקצה מול **פרויקט ה-Firebase החדש שלכם** (אף פעם
לא מול פרויקט של מישהו אחר):

- [ ] תפריט נטען (בפעם הראשונה הוא נזרע אוטומטית מתוך `DEFAULT_MENU` ב-`index.html`
      — אפשר לערוך אותו משם, או ישירות דרך פאנל האדמין ב-`/?admin=1` אחרי שהוא נטען).
- [ ] הזמנת בדיקה (איסוף עצמי, מזומן) עוברת ומופיעה במסך המטבח `/admin.html`.
- [ ] התחברות אדמין עובדת (`admin.html`, `/?admin=1`, `/marketing/admin/`).

## מגבלה ידועה: מספרי טלפון

`admin.html` (`openWhatsApp`) ו-`group.html` (`normalizePhone`/`validPhone`) מניחים
פורמט ישראלי (`05XXXXXXXX` / קידומת `972`). אם העסק שלכם לא בישראל, יש לערוך את שתי
הפונקציות האלה ידנית — זה לא טופל בתבנית הזו.

---

לפרטי אבטחה מעמיקים יותר ותהליך הנעילה המלא: [`SECURITY.md`](SECURITY.md) +
[`DEPLOY_LOCKDOWN.md`](DEPLOY_LOCKDOWN.md). למדריך הדפסת קבלות ישירה ל-USB:
[`KIOSK_PRINTER_SETUP.md`](KIOSK_PRINTER_SETUP.md) / [`PRINTER_WEBUSB.md`](PRINTER_WEBUSB.md).
למצב מטבח (מסך תמידי עם התראות): [`KITCHEN_MODE.md`](KITCHEN_MODE.md).
