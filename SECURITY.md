# Security checklist

## 1. Firebase Security Rules — חובה לפרסם

הקובץ `firebase-rules.json` ברפו מכיל קבוצת חוקים בסיסית. כרגע ה-DB **פתוח לגמרי** וכל אחד יכול לקרוא/לכתוב אליו דרך REST.

### איך מעלים את החוקים

1. היכנס ל-[Firebase Console](https://console.firebase.google.com).
2. בחר את הפרויקט `your-project-id`.
3. בתפריט הצדדי: **Realtime Database** → **Rules**.
4. העתק את התוכן של `firebase-rules.json` והדבק שם (במקום מה שיש כיום, שאמור להיות `".read": true, ".write": true`).
5. לחץ **Publish**.

### מה החוקים האלה עושים

- מונעים קריאה/כתיבה גורפת לכל בסיס הנתונים (`.read: false / .write: false` ברמת השורש).
- מאפשרים קריאה ל-`orders`, `history`, `coupons`, `menu`, `siteSettings`, `admin_state` (האתר נשען על זה).
- מקשיחים את `coupons`: אי אפשר לעדכן קופון שכבר `used:true` — כלומר אפילו אם תוקף מישהו ינסה לאפס מימוש בקונסול, החוקים יחסמו.
- מבקשים סכמה מינימלית בהזמנה (שדות `name`, `phone`, `total`, `ts`).

> 🔒 **הערה:** כדי לקבל אבטחה מלאה (אדמין-בלבד למחיקת הזמנות, יצירת קופונים סטטית, וכו') יש לשלב מנגנון Firebase Auth ולעדכן את החוקים שיבדקו `auth.token.admin === true`. החוקים הנוכחיים הם שכבה ראשונה — לא מספיקים להגנה מלאה אבל הרבה יותר טובים מ"פתוח לחלוטין".

## 2. Netlify environment variables

ב-**Netlify Dashboard → Site Settings → Environment Variables** ודא שמוגדרים:

| משתנה | תיאור |
|-------|-------|
| `TG_TOKEN` | טוקן הבוט של טלגרם |
| `TG_CHAT` | מזהה הצ'אט בטלגרם |
| `ADMIN_PASSWORD` | סיסמת האדמין |
| `FB_URL` | URL של בסיס הנתונים, למשל `https://YOUR-PROJECT-default-rtdb.REGION.firebasedatabase.app/` |

`FB_URL` נחוץ ל-`mint-win-coupon` (פונקציית הקופונים החדשה). ללא זה, המשחק יחזור לנתיב fallback מצד הלקוח.

### סריקת הסודות של Netlify (Secrets Scanning)

`netlify.toml` מגדיר שני חריגים מכוונים, וחשוב לא להרחיב אותם:

- `SECRETS_SCAN_OMIT_KEYS = "FB_URL"` — כתובת ה-Realtime DB גלויה ממילא לכל דפדפן.
- `SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES` — מפתח ה-Web API של Firebase
  (`site.config.js` → `firebase.apiKey`). זהו מזהה פרויקט ציבורי שחייב להישלח
  לדפדפן; ההגנה בפועל היא חוקי ה-Realtime Database.

`ADMIN_PASSWORD` ושאר הסודות **נשארים תחת סריקה מלאה** — הם נקראים רק ב-Netlify
Functions דרך `process.env`, ואסור שיופיעו בשום קובץ במאגר. אם בנייה נכשלת על
סוד אמיתי — מסירים את הערך מהקוד ומחליפים אותו, לא מוסיפים אותו לרשימת החריגים.

## 3. ידוע ולא נפתר

- **הסיסמה של האדמין נבדקת בצד שרת אבל הפעולות הולכות ישר ל-Firebase.** משתמש זדוני שעקף את ה-login יכול עדיין למחוק הזמנות. החוקים החדשים מקשים על זה אבל לא מבטלים. הפתרון המלא: Firebase Auth + custom claims.
- **אנטי צ'יט מלא במשחק** דורש ולידציית "האם הוא באמת לחץ על כפתור עצירה" — קשה. הצעד הקיים (Netlify function עם anti-double-mint על אותה הזמנה + נעילת זכייה אחת ליום בלקוח) הוא חצי-פתרון פרקטי.

## 4. מה הוקשח בקוד (בדיקה מקיפה) ומה עדיין ידני

הסבב האחרון תיקן בקוד (נפרס אוטומטית דרך Git/Netlify):

- **XSS מאוחסן**: כל שדות הלקוח (שם/טלפון/כתובת/הערות/פרומואים/תפריט/כרטיס נאמנות) עוברים עכשיו escaping לפני הזרקה ל-HTML, גם במסך המטבח וגם באתר. פרמטרי `onclick` במטבח הוחלפו ב-data attributes בטוחים.
- **הנפקת קופונים**: `mint-win-coupon` מחייב כעת `orderKey` תקין (קודם השמטתו עקפה את כל הבדיקות והנפיקה קופונים ללא הגבלה) + rate-limit.
- **השוואת סיסמה בזמן-קבוע** (`crypto.timingSafeEqual`) ב-`admin-login` וב-`auth.js`, + rate-limit ל-brute-force.
- **Path injection**: ולידציה של `orderKey/questionId/groupId/referralCode` מול `^[A-Za-z0-9_-]+$` לפני שרשור לנתיב Firebase.
- **תגמולי הפניה**: סימון מימוש *לפני* ההנפקה + try/catch — מצמצם הנפקה כפולה ב-retry.
- **הזמנות קבוצתיות**: clamp למחירים שליליים/NaN, הגבלת אורך מערך/שם.
- **אמינות**: הגנת שליחה כפולה בהזמנה, retry ל-Telegram, תיקון אובדן כרטיסי הדפסה במטבח, השהיית פולינג בלשונית מוסתרת.

### 🔒 נעילה מלאה — מדריך מעשי

הקוד לנעילה המלאה (פונקציית `place-order` שמחשבת מחיר בשרת, מימוש קופונים בשרת,
Firebase Auth לאדמין, וכללים נעולים) **כבר נכתב ונפרס**. כדי להפעיל אותו בפועל יש
לבצע כמה הגדרות ב-Firebase/Netlify — **ראה מדריך צעד-אחר-צעד מלא ב-[`DEPLOY_LOCKDOWN.md`](DEPLOY_LOCKDOWN.md)**.
הפריסה מדורגת: שום דבר לא נשבר עד הצעד האחרון (פרסום `firebase-rules.locked.json`),
וניתן לחזור אחורה תוך שניות.

### ⚠️ עדיין דורש פעולה ידנית שלך (לא ניתן לעשות מהקוד)

1. **לפרסם את `firebase-rules.json` ב-Firebase Console** (סעיף 1 למעלה). הוספתי ולידציית טיפוסים ל-`orders.total` ול-`coupons.value` + אינדקס. **זה עדיין לא נעילה מלאה** — ראו סעיף 3: כל עוד `coupons/loyalty/menu/...` הם `.write:true`, אפשר לעקוף את בדיקות השרת ישירות מול ה-DB.
2. **נעילה מלאה (מומלץ)**: להגדיר `FB_SECRET` ב-Netlify, להעביר את כל הכתיבות הרגישות לעבור דרך פונקציות שמשתמשות ב-`?auth=FB_SECRET`, ואז `.write:false` בענפים `coupons/loyalty/referrals/quizAttempts/groupOrders/menu/siteSettings`. זה שינוי מכוון שדורש בדיקה מול הלקוח החי — לכן לא בוצע אוטומטית.
3. **CORS**: כיום `Access-Control-Allow-Origin: *` (ב-`netlify.toml`). לצמצם לדומיין האתר בלבד אם אין דומיין מותאם נוסף.
4. **`ADMIN_PASSWORD`/`TG_TOKEN`/`TG_CHAT`/`FB_URL`** — לוודא שמוגדרים ב-Netlify (סעיף 2).
