# 🔒 מדריך נעילת מסד הנתונים — שלב אחר שלב

המטרה: לסגור סופית את החורים הקריטיים שבהם הדפדפן כותב ישירות ל-Firebase
(זיוף מחירים, הנפקת קופונים אינסופית, עריכת תפריט בידי אנונימי). אחרי השלבים
האלה — **כל כתיבה רגישה עוברת דרך פונקציות שרת או דרך אדמין מאומת**, וכתיבה
אנונימית נחסמת.

> ⚠️ **חשוב:** השלבים בנויים כך ש**שום דבר לא נשבר** עד הצעד האחרון (פרסום הכללים
> הנעולים). אפשר לעצור באמצע בכל שלב. אל תדלג על שלב "בדיקה".

הקוד כבר נכתב ונפרס דרך Git/Netlify. מה שנשאר זה הגדרות שרק לך יש גישה אליהן.

---

## שלב 0 — מה כבר מוכן בקוד (אוטומטי)

- `netlify/functions/place-order.js` — יצירת הזמנה בשרת: מחשב מחיר מול התפריט האמיתי,
  מאמת ומממש קופון, רושם נאמנות, שולח Telegram.
- `netlify/functions/mint-comeback-coupon.js` — קופון "התגעגענו" בשרת.
- האתר (`index.html`) כבר שולח הזמנות דרך `place-order`, עם **fallback** לזרימה הישנה
  אם הפונקציה לא זמינה — כך שגם באמצע התהליך אף הזמנה לא תאבד.
- `js/firebase-auth.js` — מודול התחברות אדמין (כבוי כברירת מחדל).
- `firebase-rules.locked.json` — הכללים הנעולים שתפרסם בצעד האחרון.

---

## שלב 1 — Database Secret (FB_SECRET) — כבר יש לך ✅

הפונקציות צריכות "מפתח-על" כדי לכתוב ל-DB אחרי הנעילה (הוא עוקף את הכללים). אנחנו
משתמשים ב-**FB_SECRET** — מחרוזת סוד אחת פשוטה. **כבר הגדרת אותה ב-Netlify**, אז אין
מה לעשות כאן.

> אם תרצה לאמת/לחדש אותה: Firebase Console → ⚙️ Project settings → **Service accounts**
> → **Database secrets** → Show/Add.

---

## שלב 2 — לנקות משתני סביבה ב-Netlify

ב-**Netlify → Site settings → Environment variables**, ודא שמוגדרים:

| משתנה | ערך | הערה |
|-------|-----|------|
| `FB_URL` | `https://YOUR-PROJECT-default-rtdb.REGION.firebasedatabase.app/` | קיים |
| `FB_SECRET` | ה-Database secret | ✅ כבר אצלך |
| `ADMIN_PASSWORD` | סיסמת האדמין | קיים |
| `TG_TOKEN`, `TG_CHAT` | טלגרם | קיים |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push | קיים |

> 🧹 **מחק את `FB_PRIVATE_KEY`** שהוספת בטעות — אנחנו לא משתמשים ב-Service Account,
> רק ב-`FB_SECRET`. הקובץ JSON של ה-Service Account משמש **רק במחשב שלך** בשלב 5
> (הרצת `set-admin-claim.js`), ולא ב-Netlify.

אם שינית משהו → **Deploys → Trigger deploy → Deploy site**.

---

## שלב 3 — לבדוק שההזמנות עובדות דרך השרת ✅

1. פתח את האתר, הוסף פריט לעגלה, ושלח הזמנה אמיתית (אפשר איסוף, מזומן).
2. ודא:
   - הזמנה הופיעה במסך המטבח (`/admin.html`).
   - הגיעה הודעת Telegram.
   - מסך "תודה" + משחק הבצק עובדים.
3. בדיקת אבטחה (אופציונלי): נסה קוד קופון לא קיים — אמור לקבל "קוד קופון לא תקף".

אם משהו לא עובד — עצור כאן. עדיין לא נעלת כלום, האתר עובד כרגיל (יש fallback).

---

## שלב 4 — להקים אדמין ב-Firebase Authentication

כדי שמסך המטבח ועריכת התפריט יוכלו לכתוב אחרי הנעילה, האדמין צריך להתחבר.

1. Firebase Console → **Build → Authentication → Get started**.
2. לשונית **Sign-in method** → הפעל **Email/Password**.
3. לשונית **Users → Add user**:
   - Email: בחר אימייל לאדמין, למשל `owner@yourbusiness.local` (לא חייב להיות אמיתי).
   - Password: **שים את אותה סיסמה כמו `ADMIN_PASSWORD`** (כדי שתתחבר עם סיסמה אחת).
4. העתק את ה-**User UID** של המשתמש שנוצר (תצטרך אותו בשלב הבא).

---

## שלב 5 — לתת למשתמש הרשאת admin (custom claim)

זה מה שהכללים בודקים (`auth.token.admin === true`). מריצים פעם אחת סקריפט קצר.

1. השתמש באותו קובץ JSON של ה-Service Account שהורדת בשלב 1. שמור אותו בשם
   `serviceAccountKey.json` (אותו תוכן — אין צורך לייצר מפתח חדש).
2. במחשב שלך, בתיקייה כלשהי:
   ```bash
   npm init -y
   npm install firebase-admin
   ```
3. שים שם את הקובץ `serviceAccountKey.json` ואת הסקריפט `scripts/set-admin-claim.js`
   (נמצא ברפו). הרץ עם ה-UID מהשלב הקודם:
   ```bash
   node set-admin-claim.js <UID>
   ```
   אמור להדפיס `✓ admin claim set for <UID>`.
4. **מחק את `serviceAccountKey.json`** אחרי שסיימת (הוא מפתח רגיש).

---

## שלב 6 — להפעיל את ההתחברות באתר

מלא בקובץ **`site.config.js`** (בשורש הריפו) את השדות תחת `firebase`:

```js
firebase: {
  dbUrl: "https://YOUR-PROJECT-default-rtdb.REGION.firebasedatabase.app/",
  apiKey: "AIza...",                   // ← Web API Key: Console → Project settings → General → Web API Key
  adminEmail: "owner@yourbusiness.local",   // ← האימייל מהשלב 4
}
```

`js/firebase-auth.js` קורא את הערכים האלה אוטומטית — אין צורך לערוך את הקובץ הזה עצמו,
אלא רק לוודא ש-`CONFIG.enabled` בראשו הוא `true` (זה כבר ברירת המחדל).

שמור, עשה commit + push (או ערוך ב-GitHub ישירות). Netlify יפרוס אוטומטית.

---

## שלב 7 — לבדוק התחברות אדמין ✅ (לפני הנעילה!)

1. היכנס ל-`/admin.html`, התחבר עם סיסמת האדמין.
2. פתח DevTools → Console. הקלד: `FBAuth.isSignedIn()` — אמור להחזיר `true`.
3. נסה לסמן הזמנה כ"בטיפול" / "סיום" — אמור לעבוד.
4. אותו דבר ב-`/?admin=1` (עריכת תפריט) וב-`/marketing/admin/`.

אם `isSignedIn()` מחזיר `false` — בדוק את ה-apiKey וה-adminEmail. **אל תמשיך לנעילה
עד שזה `true`.**

---

## שלב 8 — לפרסם את הכללים הנעולים 🔒 (הצעד האחרון)

1. Firebase Console → **Realtime Database → Rules**.
2. העתק את כל התוכן של **`firebase-rules.locked.json`** והדבק במקום הקיים.
   (הקובץ מתחיל ישר ב-`{ "rules": {` — Firebase דורש שברמה העליונה יהיה רק `rules`.)
3. לחץ **Publish**.

מרגע זה: כתיבה אנונימית חסומה. הזמנות נכתבות רק דרך `place-order`, קופונים רק דרך
הפונקציות, ועריכות אדמין רק כשאתה מחובר.

---

## שלב 9 — בדיקה סופית ✅

- [ ] שליחת הזמנה מהאתר (כלקוח, לא מחובר) — עובדת.
- [ ] קופון אמיתי מקבל הנחה; קופון מזויף נדחה.
- [ ] מסך המטבח: סימון בטיפול/סיום/ביטול/הדפסה — עובד (כשמחובר).
- [ ] עריכת תפריט ב-`/?admin=1` — עובדת (כשמחובר).
- [ ] בדיקת תקיפה: ב-DevTools של דפדפן **לא מחובר**, נסה:
      `fetch(FB_URL+'menu.json',{method:'PUT',body:'{}'}).then(r=>r.status)`
      → אמור להחזיר **401** (קודם זה היה מצליח!).

---

## חזרה לאחור (אם משהו השתבש אחרי הנעילה)

פשוט פרסם מחדש את הכללים הישנים: העתק את `firebase-rules.json` (לא ה-locked) ל-Rules
ולחץ Publish. זה פותח שוב את הכתיבה והכול חוזר להתנהגות הקודמת תוך שניות. אפשר אז
לבדוק מה לא עבד ולנסות שוב.

---

## מה נשאר פתוח (מתועד, לא קריטי)

- **קריאה ציבורית** של `orders` / `loyalty` (שם, טלפון) נשארת מאפשרת כדי שכרטיסיית
  הנאמנות של הלקוח, ההזמנות הקבוצתיות ומסך המטבח ימשיכו לעבוד. נעילת *קריאות* דורשת
  אימות גם בצד הלקוח (Firebase Auth אנונימי לכל לקוח) — שלב עתידי. הכתיבות —
  שהן וקטור ההונאה האמיתי — **נעולות**.
- **CORS** ב-`netlify.toml` עדיין `*`. אפשר לצמצם ל-`https://your-site.netlify.app`
  אם אין דומיין מותאם.
