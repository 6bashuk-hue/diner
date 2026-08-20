# מערכת השיווק

כלי **ניהול ואחסון** של חומרים שיווקיים, בנוי על אותו stack של האתר:
**Netlify Functions (CommonJS) + Firebase Realtime Database (REST)**.

המערכת **לא יוצרת תוכן באופן אוטומטי ולא קוראת ל-Claude API** — אין עלויות API.
במקום זה היא מכינה לך פרומפט מלא (עם כל הידע על העסק, האזור שלך, ומחקר מקומי) שאתה מעתיק
**לצ'אט נפרד שלך ב-Claude** (claude.ai / מובייל / Pro), וחוזר עם הפוסט המוכן לשמירה.
הפרסום עצמו נעשה ידנית ב-Meta Business Suite (אין אינטגרציה ל-Meta API).

> הערה ארכיטקטונית: הספק המקורי תואר עם Firestore + ES Modules + `ADMIN_SECRET`.
> המימוש הותאם למציאות של ה-repo: Realtime DB דרך `FB_URL`, CommonJS, ו-`ADMIN_PASSWORD`.

---

## למה לא אוטומטי?

שימוש ב-Claude API כשירות בתשלום היה עולה ~$5-15 לחודש. בגישה הזו הכל **חינמי**,
ואיכות התוכן זהה — אתה משוחח עם אותו מודל, רק דרך החשבון האישי שלך.

---

## מבנה

```
marketing/
├── lib/                         # קוד משותף (CommonJS, נדרש ע"י הפונקציות והבדיקות)
│   ├── brand-config.js          # מאגר הידע: BRAND_CONFIG + ARAD_KNOWLEDGE (היתרון התחרותי)
│   ├── content-validator.js     # ולידציה: ביטויים אסורים + שמירה על אי-הזכרת כשרות
│   ├── fb.js                    # עזרי Realtime DB REST
│   └── auth.js                  # אימות אדמין מול ADMIN_PASSWORD
├── admin/                       # דפי האדמין (HTML סטטי)
│   ├── marketing.css            # עיצוב משותף (RTL)
│   ├── marketing-common.js      # auth gate, api(), עזרי FB, nav, toast
│   ├── marketing-dashboard.html
│   ├── content-workspace.html   # סדנת תוכן: בונה פרומפט → העתק → הדבק תוצאה → שמור
│   ├── consultant-bridge.html   # מכין הקשר לשיחת ייעוץ בצ'אט חיצוני + שומר סיכומים
│   ├── calendar.html
│   ├── ugc-review.html
│   ├── assets-library.html
│   ├── local-research.html
│   └── analytics.html
├── public/
│   └── upload.html              # דף העלאת תמונות ללקוחות (ציבורי)
└── tests/                       # Jest (מדמה את Firebase, בלי שום AI)

netlify/functions/              # הפונקציות (קוראות/כותבות Firebase בלבד — אין AI calls)
├── get-knowledge.js             # מחזיר BRAND_CONFIG + ARAD_KNOWLEDGE לבניית פרומפטים בצד הלקוח
├── get-consultant-context.js    # אוסף דאטה ליועץ (הזמנות/פוסטים/UGC/מחקר)
├── list-research.js             # רשימת מאגר המחקר המקומי
├── list-assets.js               # רשימת נכסי UGC מאושרים
├── local-research-add.js        # הוספת פוסט מקומי מצליח (אחסון גולמי, בלי ניתוח)
├── save-consultation-summary.js # שמירת סיכום שיחת ייעוץ
├── marketing-schedule.js        # ניהול pipeline פוסטים (טיוטה→מתוזמן→פורסם) + analytics
├── ugc-submit.js                # קליטת תמונת לקוח (ציבורי)
├── ugc-approve.js               # אישור/דחייה + קופון + הוספה למאגר נכסים (תגיות בסיסיות)
└── get-order.js                 # שליפת פרטי הזמנה (לדף ההעלאה)
```

הדפים מוגשים מאותו אתר Netlify, למשל:
`https://your-site.netlify.app/marketing/admin/marketing-dashboard.html`
ודף ההעלאה: `https://your-site.netlify.app/marketing/public/upload.html`

---

## Setup

### 1. משתני סביבה ב-Netlify (Site settings → Environment variables)

| משתנה | חובה | תיאור |
|---|---|---|
| `FB_URL` | ✅ | כתובת ה-Realtime DB (כבר קיים בפרויקט) |
| `ADMIN_PASSWORD` | ✅ | סיסמת האדמין (כבר קיים — משמשת גם לאימות פונקציות השיווק) |
| `TG_TOKEN`, `TG_CHAT` | ✅ | בוט טלגרם של הבעלים (כבר קיים — נשלח גם להזמנות קבוצתיות והשלמות referral) |
| `VAPID_PUBLIC_KEY` | ➖ | למערכת ההתראות (Web Push). חובה אם רוצים שהפיצ'ר יעבוד. |
| `VAPID_PRIVATE_KEY` | ➖ | כנ"ל. |
| `VAPID_SUBJECT` | ➖ | כתובת mailto ליצירת קשר (לדוגמה `mailto:owner@yourbusiness.com`). |
| `FB_SECRET` | ➖ | אופציונלי — Firebase DB secret/token. ראו "אבטחה". |

**יצירת מפתחות VAPID** (פעם אחת): מקומית הריצו
```bash
npx web-push generate-vapid-keys
```
והעתיקו את `Public Key` ו-`Private Key` לתוך Netlify env vars. ה-`Subject` הוא כתובת mailto שלכם.

> אין יותר צורך ב-`ANTHROPIC_API_KEY`, `MARKETING_MODEL`, `DAILY_BUDGET_USD` או
> `MONTHLY_BUDGET_USD` — אפשר למחוק אותם מ-Netlify.

### 2. תלויות
`package.json` כבר לא תלוי בשום SDK חיצוני. Netlify יריץ `npm install` אוטומטית
(devDependencies בלבד — Jest). מקומית: `npm install` ואז `npm test`.

### 3. כללי Firebase
`firebase-rules.json` כולל את ה-nodes: `marketingPosts`, `localResearch`,
`marketingAssets`, `ugcSubmissions`, `consultationSummaries`. העלו אותו ל-Firebase
(Realtime Database → Rules).

---

## זרימת עבודה — יצירת פוסט

1. **דאשבורד** (`marketing-dashboard.html`) → "✍️ צור פוסט חדש".
2. ב**סדנת תוכן** (`content-workspace.html`) ממלאים נושא + מטרה + טון (ואופציונלית תמונת UGC).
3. לוחצים **🎨 צור פרומפט** — המערכת מרכיבה פרומפט מלא עם מאגר הידע + 5 פוסטים מהמחקר המקומי.
4. לוחצים **📋 העתק ופתח Claude** — נפתח טאב חדש ל-claude.ai. מדביקים שם.
5. Claude מחזיר 3 וריאציות. בוחרים אחת ומעתיקים.
6. חוזרים לסדנה, מדביקים בשדה "הדבק את התוצאה". יש **בדיקת ולידציה בצד הלקוח**
   שמתריעה על ביטויים אסורים או הזכרת כשרות.
7. **💾 שמור לטיוטות** (או עם תאריך → מתוזמן). אפשר גם "שמור + העתק להעלאה".
8. מעלים ידנית ב-Meta Business Suite, וחוזרים ללוח השנה לסמן **✅ פורסם**.

## זרימת עבודה — ייעוץ

1. **גשר היועץ** (`consultant-bridge.html`): בוחרים נושא או מנסחים שאלה.
2. מסמנים איזה דאטה לכלול (הזמנות / פוסטים / UGC / מחקר).
3. **🚀 הכן ופתח שיחה** — נבנה הקשר מלא, מועתק ללוח, ונפתח claude.ai.
4. משוחחים חופשי בצ'אט שלכם. בסיום — חוזרים ושומרים **סיכום** לזיכרון (`consultationSummaries`).

## תומך גם

- **UGC** (`ugc-review.html`): לקוח מעלה תמונה ב-`upload.html` → מאשרים → קופון + הוספה למאגר נכסים.
- **מחקר מקומי** (`local-research.html`): מוסיפים 1-2 פוסטים מצליחים מהאזור שלך בשבוע; הם מוזנים
  אוטומטית לפרומפט בסדנת התוכן (אחסון גולמי + הניתוח שלכם, בלי שום AI).
- **Analytics** (`analytics.html`): הזנה ידנית של reach/לייקים/תגובות לפי הפוסטים.

---

## פיצ'רי המעורבות (engagement) באתר הלקוח

7 מנגנונים שמופעלים אוטומטית באתר ובדפי האדמין (לא חלק מסדנת התוכן, אבל מנוהלים כאן):

| פיצ'ר | מה זה עושה | דף אדמין | Firebase node |
|---|---|---|---|
| **Threshold Nudge** | "הוסף ₪X וקבל פוקצ'ה חינם" בסל. עובר את הסף → הפריט מתווסף לסל בחינם. | `threshold-config.html` | `marketingConfig/thresholdNudge` |
| **Customer Tracking** | כל הזמנה מעדכנת `loyalty/{phone}` עם פרופיל עשיר: lastOrder snapshot, AOV, מנות מועדפות, תגיות (vip/loyal/weekend_orderer), Tier. | `customers.html` | `loyalty/{phone}` (מורחב) |
| **Web Push + WhatsApp fallback** | התראות לדפדפן (אנדרואיד/דסקטופ). למי שאין subscription (iOS Safari) — לינק WhatsApp ידני לבעלים. | `push-broadcast.html` | `loyalty/{phone}/pushSubscription` |
| **Reorder בלחיצה** | לקוח חוזר רואה בראש הדף את ההזמנה האחרונה שלו + כפתור 1-click להזמין שוב. | (אוטומטי) | (קורא מ-`loyalty/{phone}/lastOrder`) |
| **חידון יומי מקומי** | שאלה יומית, תשובה נכונה מקנה ₪5 הנחה לאותו יום. | `quiz-management.html` (כולל seed של 2 שאלות דוגמה) | `dailyQuiz`, `quizAttempts/{phone}/{date}` |
| **Referral אוטומטי** | לקוח מייצר REF-XXXXXX, חבר מזמין → הלקוח מקבל REWARD-XXXXXX (₪20) אוטומטית, מקבל push/וואטסאפ + הבעלים מקבל הודעת טלגרם. | `referrals.html` | `referrals/{phone}`, `coupons/REF-…`, `loyalty/{phone}/pendingRewards` |
| **הזמנה קבוצתית** | דף נפרד `/group.html`: מנהל פותח קבוצה, משתף לינק wa.me, כל אחד מוסיף לעצמו, מנהל שולח הכל בבת אחת לטאבון. | (אין — public) | `groupOrders/{groupId}` |

**Cron חדש**: `notify-expiring-coupons` רץ יומי ב-10:00 IL ושולח push למי שיש לו קופון שפג בעוד יומיים-שלושה.

**dependency חדשה**: `web-push` — מותקנת אוטומטית ע"י Netlify (`npm install`).

---

## כשרות — כלל קריטי

- בפוסטים שיווקיים **אסור** להזכיר כשר/כשרות/מהדרין/תעודה/השגחה. הפרומפט מורה ל-Claude
  לא להזכיר זאת, ובנוסף בסדנת התוכן יש בדיקה בצד הלקוח שמתריעה ⚠ אם נכנס ביטוי כזה בהדבקה.
- בשיחת הייעוץ אפשר לדבר על זה בכנות (אין תעודה כי פתוחים בשבת) — זה לא פוסט שיווקי.
- פתיחה בשבת היא יתרון מול הקהל (חילונים/מסורתיים) — מותר לרמוז עליו בפוסטים של שישי/שבת.

---

## אבטחה

- כל endpoint אדמיני מאמת `x-admin-token === ADMIN_PASSWORD`. דפי האדמין מבקשים סיסמה
  פעם אחת (נשמרת ב-`sessionStorage`) ושולחים אותה ככותרת.
- `ugc-submit` ו-`get-order` ציבוריים, עם rate-limiting פר-IP וולידציית קלט.
- תמונות נשמרות כ-data URL ב-Realtime DB; דף ההעלאה מקטין ודוחס ל-JPEG < ~850KB.
- **הקשחה אופציונלית:** הגדירו `FB_SECRET` ושנו את ה-nodes ב-`firebase-rules.json`
  ל-`".read": false, ".write": false` (חוץ מ-`ugcSubmissions` שצריך כתיבה ציבורית).
  שימו לב: דפי האדמין קוראים נתונים ישירות מ-Firebase, אז נעילת קריאה תדרוש מעבר
  לקריאה דרך ה-functions.

---

## בדיקות

```bash
cd "6 bashuk"
npm test
```

הבדיקות מדמות (mock) את Firebase בלבד — אין שום AI ואין צורך ברשת או במפתח API.
מכוסים: ולידציה (כולל כשרות), הרכבת מאגר הידע, get-knowledge, get-consultant-context
(ניתוח הזמנות), מחקר מקומי (אחסון גולמי), ו-UGC submit/approve.

> אימות UI בדפדפן לא בוצע בסביבת הפיתוח (הדפים דורשים פונקציות Netlify חיות).
> מומלץ לבדוק ידנית אחרי deploy: כניסה, בניית פרומפט, הדבקת תוצאה ושמירה, הכנת הקשר ליועץ, UGC.

---

## Troubleshooting

| תקלה | סיבה סבירה | פתרון |
|---|---|---|
| 401 בדפי האדמין | סיסמה שגויה / `ADMIN_PASSWORD` לא מוגדר | בדקו את משתנה הסביבה ב-Netlify |
| "הידע עוד נטען" בסדנה | `get-knowledge` נכשל (אימות/רשת) | רעננו; ודאו ש-`ADMIN_PASSWORD` תקין |
| ⚠ אזהרת כשרות בהדבקה | הטקסט שהודבק מזכיר כשרות/ביטוי אסור | ערכו את הפוסט לפני שמירה |
| העלאת תמונה נכשלת (413) | התמונה גדולה מדי | הדף דוחס אוטומטית; אם עדיין — תמונה ענקית במיוחד |
| תמונות UGC לא נשמרות | כללי Firebase חוסמים את `ugcSubmissions` | ודאו שהעליתם את `firebase-rules.json` המעודכן |
