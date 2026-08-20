// marketing/lib/examples/brand-config.example.js
// A fully filled-in BRAND_CONFIG — the original "6 בשוק" (a pizzeria in Arad, Israel)
// this template was extracted from. NOT loaded by the app (nothing requires this
// file). Read it side-by-side with marketing/lib/brand-config.js to see what a
// complete answer looks like for each field, then fill in your own.

module.exports = {
  name: "6 בשוק",
  location: "ערד",
  type: "פיצריה וטאבון",

  story: `התחלנו מתוך אהבה ואמונה בעיר ערד. הרבה איבדו אמונה בעיר
  וחושבים שאין מה לעשות לצעירים. אנחנו מאמינים בעיר וממציאים
  לצעירים מה לעשות.`,

  audience: {
    weekdays: ["תושבים מקומיים", "חיילים"],
    weekends: ["תיירים לים המלח", "תיירים לאילת"],
    festivals: ["פסטיבל ערד"],

    // Example of the optional sensitive-topic feature: this business is open on
    // Shabbat and therefore not kosher-certified, so its AI marketing assistant
    // needs an explicit rule for how (and whether) to talk about it.
    kashrutProfile: {
      target: "לא שומרי כשרות הדוקים",
      reasoning: "אנחנו פתוחים בשבת",
      supplierStatus: "כל הספקים שלנו כשרים בפועל",
      certificateStatus: "אין לנו תעודת כשרות (בגלל פתיחה בשבת)",
      excluded: "שומרי כשרות הדוקים - לא חלק מהאסטרטגיה",
      messagingRule: "לא להעלות נושא כשרות אקטיבית. אם עולה - להיות שקופים: ספקים כשרים, אין תעודה."
    }
  },

  competitors: ["כפרוצקה"],
  emotions: ["חום ביתי", "אווירה", "קהילתיות", "רעב"],

  importantDates: [
    { date: "16-07", event: "יום הולדת לפיצריה", priority: "high" },
    { date: "08-XX", event: "פסטיבל ערד (יש זמר באוויר)", priority: "high" },
    { date: "07-25", event: "פסטיבל הפסנתר הבינלאומי - התחלה", priority: "medium" }
  ],

  styleInspiration: "Farino Pizza - אסתטי, אומנותי, דגש על חומרי גלם",

  forbidden: {
    phrases: [
      "הכי טעים בעולם",
      "פיצה כמו של אמא",
      "טעם איטלקי אמיתי",
      "המקום הכי טוב בעיר",
      "פתיחה גדולה",
      "מבצע ענק",
      "כשר למהדרין",
      "תחת השגחה"
    ],
    tones: ["מתחנף", "מוגזם", "פרסומי", "קלישאתי"],
    topics: ["לא לפתוח דיון על כשרות בפוסטים שיווקיים"],
    sensitiveTerms: ["כשר", "כשרות", "מהדרין", "תעודה", "השגחה"],
    sensitiveTermsLabel: "כשרות"
  },

  voiceCharacteristics: {
    warm: true,
    homey: true,
    local: true,
    direct: true,
    emojiUsage: "moderate",
    sentenceLength: "short",
    languagePreference: "hebrew-conversational"
  }
};
