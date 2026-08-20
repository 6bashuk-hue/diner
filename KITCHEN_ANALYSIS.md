# ניתוח דף ניהול הזמנות קיים (KITCHEN_ANALYSIS)

## קובץ ראשי
`6 bashuk/admin.html` — מסך ה-KDS (Kitchen Display). קובץ **עצמאי** אחד: HTML + CSS (inline `<style>`) + JS (inline `<script>`). טוען בנוסף `js/firebase-auth.js`. ~1013 שורות.

> ⚠️ ממצא חשוב: הדף הזה **כבר** מסך מטבח בסיסי — הוא כבר עושה polling, מזהה הזמנות חדשות, ומשמיע צליל. לכן רוב התשתית קיימת, ואסור לכפול אותה.

## איך נטענות הזמנות מ-Firebase
- **פונקציה:** `fetchOrders()` (נקראת מתוך `startRealtime()` אחרי התחברות).
- **מנגנון:** **polling** כל 8000ms (`pollInterval = setInterval(fetchOrders, 8000)`).
- **ה-ref:** Firebase REST — `fbGet('orders')` → `GET {FB_URL}/orders.json` (דרך `fbUrl()` שמוסיף `?auth=` כשמחובר).
- **זיהוי הזמנה חדשה כבר קיים בקוד:** בתוך `fetchOrders()` יש השוואה בין `knownOrders` (קודם) ל-`activeOrders` (עכשיו); עבור מפתח חדש (וכאשר `firstPoll === false`) הקוד כבר קורא ל-`playNewOrderSound()` ול-`queuePrint()`. הדגל `firstPoll` מונע התראה על הזמנות קיימות בטעינה הראשונה.

### מבנה אובייקט order (דוגמה)
```json
{
  "name": "נועם פאר", "phone": "0546647242",
  "type": "איסוף עצמי" | "משלוח", "address": "...",
  "items": [{ "name": "פיצה", "qty": 1, "extras": [{"name","qty","price"}], "notes": "", "basePrice": 0, "total": 0 }],
  "total": 128, "payment": "cash" | "credit", "couponCode": null, "discount": 0,
  "wonGameCode": "WIN-XXXX", "ts": 1733250000000, "date": "...",
  "status": (לא קיים = חדש) | "inprog" | "done"
}
```
המפתח של כל הזמנה = Firebase push id.

## איך מוצגות הזמנות
- **Containers:** `#col-new` (הזמנות חדשות) ו-`#col-inprog` (בטיפול).
- **Class של כרטיס:** `.order-card`, עם class סטטוס `status-new` / `status-inprog`, ו-`data-key`, `data-sig`.
- **יצירת HTML:** `buildCard(key, order, status)` → `renderColumn()` → `renderAllColumns()`.

## איך מתעדכן סטטוס
- `markInProgress(key,name,phone)` → `status = 'inprog'` (+ Push + וואטסאפ).
- `markDone(key,name)` → `status = 'done'` + ארכוב ל-`history`.
- `cancelOrder(key,name)` → מחיקה.
- כולן כותבות דרך `fbSet`/`fbDelete` (שמחזירים false ומציגים toast אם נחסם).
- **סטטוסים קיימים:** אין-שדה=חדש · `inprog` · `done`. (הזמנה "חדשה" = `status !== 'done'` ו-`status !== 'inprog'`.)

## צבעים / CSS variables (ערכת KDS כהה)
- `--primary: #c96a30`, `--primary-d: #9a4e22`
- `--bg: #0a0a0a` (רקע ראשי כהה), `--text`, `--border`
- `--success: #22c55e`, `--warning: #f59e0b`, `--muted: #888`

## משתנים גלובליים שאסור לגעת בהם
`soundEnabled, knownOrders, todayStats, clockInterval, pollInterval, timersInterval, firstPoll, prepMode, autoPrintEnabled, printedKeys, printQueue, isPrinting, currentPrintKey, printWatchdog, isLoggedIn, FB_URL`

## פונקציות גלובליות שאסור לדרוס
`doLogin, doLogout, fbGet, fbSet, fbDelete, fbUrl, fetchOrders, startRealtime, renderAllColumns, renderColumn, buildCard, orderSignature, updateTimers, markInProgress, markDone, cancelOrder, printOrder, queuePrint, processPrintQueue, finishPrint, playNewOrderSound, toggleSound, toggleAutoPrint, setPrepMode, loadTodayStats, startClock, escapeHtml, toast, customConfirm, notifyOrderStatus`

## איפה לשים את כפתור הפעלת מצב מטבח
יש `.topbar` עליון עם כפתורים (מצב רגיל/עומס, 🔔 צליל, 🖨 הדפסה, לאתר, הגדרות, שיווק, יציאה). הכי נקי להוסיף את כפתור "מצב מטבח" **לתוך ה-topbar הזה** (עקבי ויזואלית). חלופה: כפתור צף קבוע (כמו במפרט) — אבל הוא עלול לכסות חלק מה-topbar. אני ממליץ על שילוב ב-topbar.

---

# 🟡 הערות והחלטות נדרשות לפני קוד (חשוב!)

המפרט שלך כתוב לדף גנרי. מכיוון שהדף הקיים כבר עושה הרבה ממה שהמפרט מבקש, יש כמה החלטות. אני ממליץ על האפשרות המודגשת בכל סעיף — אשמח לאישור:

1. **Poller כפול מול Hook (הכי חשוב).** המפרט מציע poller עצמאי (`kitchenPollInterval` + `kitchenFetchTodayOrders`). אבל הדף **כבר** עושה polling ומזהה הזמנות חדשות. שני pollers = פי-2 קריאות ל-Firebase + זיהוי כפול. לפי הכלל שלך ("מצא את הפונקציה שטוענת הזמנות — תשתמש בה"), **אני ממליץ לחבר hook אחד לזיהוי החדש הקיים** ב-`fetchOrders` (פונקציה `window.kitchenOnNewOrders(count)` שתיקרא משם רק כשמצב המטבח דלוק), במקום poller שני. זה גם מנצל את `firstPoll` הקיים (לא יתריע על הזמנות ישנות בטעינה). **מאשר?**

2. **התראה.** היום יש צליל קצר חד-פעמי (`playNewOrderSound`). מצב מטבח יוסיף **התראה אגרסיבית** (צליל בלולאה + מסך מהבהב + ויברציה + באנר ענק עד "ראיתי"). כשמצב מטבח דלוק — ההזמנה החדשה תפעיל את ההתראה האגרסיבית. **מאשר?**

3. **צליל.** אין `/sounds/` בריפו. **אני ממליץ על צליל WebAudio בלולאה בקוד** (כמו ה-`playNewOrderSound` הקיים) — בלי קובץ MP3, עובד מיד. חלופה: שתוסיף `alert.mp3` בעצמך. **WebAudio בקוד — מאשר?**

4. **"כניסה חד-פעמית שזוכרת את המכשיר".** היום האדמין מתחבר בכל טעינה (אין persistence ב-admin.html). "לזכור מכשיר" דורש לשמור משהו ב-localStorage. שמירת **סיסמה** ב-localStorage היא סיכון אבטחה. **אני ממליץ:** מצב המטבח עצמו נזכר (localStorage `kitchenModeActive`) ומפעיל את ההתראות אוטומטית, אבל ההתחברות נשארת כמו היום. אם תרצה "דלג על login לצמיתות במכשיר הזה" — זה כרוך בשמירת סוד במכשיר; אגיד לך בדיוק מה הסיכון לפני שאעשה. **באיזו רמת "זכירה" לבחור?**

5. **כפתור הפעלה.** לשלב בתוך ה-topbar הקיים (מומלץ) או כפתור צף קבוע (מהמפרט)?

6. **היקף קבצים.** הכל ייכנס ל-`admin.html` בלבד (HTML+CSS+JS מבודדים עם prefix `kitchen`/`kitchen-`), + קובץ תיעוד `KITCHEN_MODE.md`. **לא** אגע ב-`submit-order`/`place-order` כי כל הזמנה כבר נשמרת עם `ts` ומקבלת סטטוס דרך זרימת המטבח (שלב 4 במפרט מיותר כאן). **מאשר שלא נוגעים בפונקציות השרת?**

---

## הצעת יישום (לאחר אישור)
- **HTML:** בלוק מסומן `<!-- Kitchen Mode -->` בסוף ה-body: כפתור toggle, status-bar (חיבור+שעון), באנר התראה ענק עם "ראיתי", כפתור "בדוק התראה".
- **CSS:** בלוק מסומן `/* Kitchen Mode */`, כל ה-classes ב-`kitchen-`. הדגשת הזמנה חדשה תשתמש ב-`body.kitchen-mode-on .order-card.status-new` (ה-selector האמיתי בדף).
- **JS:** IIFE מבודד; כל המשתנים/פונקציות ב-`kitchen*`. יחבר hook אחד ל-`fetchOrders` הקיים (סעיף 1), Wake Lock, ביטול-נעילת-אודיו, ויברציה, אינדיקטור חיבור (לפי הצלחת ה-poll הקיים), וכפתור בדיקה. חושף ל-onclick רק: `kitchenToggle`, `kitchenStopAlert`, `kitchenTestAlert`.
- **אי-רגרסיה:** כשמצב מטבח כבוי — אפס שינוי התנהגותי; ה-hook יוצא מיד אם `!kitchenModeActive`.

**לא כתבתי עדיין שום קוד פיצ'ר.** ממתין לאישורך על 6 ההחלטות למעלה (או "אשר הכל לפי המלצותיך").
