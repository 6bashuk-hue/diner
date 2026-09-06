# Telegram Delivery Bot — Setup (this site)

The "🚗 שלח לשליח" button in the KDS sends a Telegram message to the shared courier
via `POST /api/delivery/send`. This site only *sends* — the courier's button taps
(✅ קיבלתי / 🚗 יצאתי ללקוח / ✅ נמסר) are received by the shared hub, since Telegram
only allows one webhook URL per bot and the courier is shared across three
businesses. See `TELEGRAM_DELIVERY_BOT.md` in the **6bashuk** repo for the full
architecture and the hub's setup.

## Environment variables (Netlify Dashboard → Site settings → Environment variables)

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | The bot token from @BotFather. Same value as the other two sites. |
| `TELEGRAM_COURIER_CHAT_ID` | The courier's Telegram chat id. Same value as the other two sites — see the hub's doc for how to obtain it. |

`ADMIN_PASSWORD` and `FB_URL` (already configured for the existing KDS/admin login)
are reused as-is; no new secret is needed for those.

## Testing

Place a test delivery order (סוג משלוח), open the KDS, click "🚗 שלח לשליח" on that
order. The courier should get a Telegram message with the address, amount, phone and
navigation/call/accept buttons.
