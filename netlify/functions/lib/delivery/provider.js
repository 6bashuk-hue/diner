// netlify/functions/lib/delivery/provider.js
// Notification/delivery-channel abstraction. delivery-send.js and telegram-webhook.js
// (hub only) talk to this interface only — never to the Telegram API directly — so a
// future SMS/WhatsApp provider can be added here without touching the KDS or the
// endpoint handlers. Selected via DELIVERY_PROVIDER (defaults to "telegram").

const { telegramApi } = require("./telegramProvider");

function getProvider() {
  const kind = (process.env.DELIVERY_PROVIDER || "telegram").toLowerCase();

  if (kind === "telegram") {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN env var");
    const api = telegramApi(token);

    return {
      kind: "telegram",
      // target: chat id. keyboard: array of button rows, or null/undefined.
      async send(target, text, keyboard) {
        const result = await api.sendMessage(target, text, keyboard ? { inline_keyboard: keyboard } : undefined);
        return { externalMessageId: result.message_id, chatId: String(result.chat.id) };
      },
      async edit(chatId, externalMessageId, text, keyboard) {
        await api.editMessageText(chatId, externalMessageId, text, keyboard ? { inline_keyboard: keyboard } : undefined);
      },
      async ack(callbackQueryId, text) {
        await api.answerCallbackQuery(callbackQueryId, text);
      }
    };
  }

  throw new Error("Unknown DELIVERY_PROVIDER: " + kind);
}

module.exports = { getProvider };
