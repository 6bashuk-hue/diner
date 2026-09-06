// netlify/functions/lib/delivery/telegramProvider.js
// Thin wrapper around the Telegram Bot API (sendMessage / editMessageText /
// answerCallbackQuery). No business logic here — that lives in message.js and the
// callers (delivery-send.js, telegram-webhook.js).

function telegramApi(token) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(method, payload) {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) {
      throw new Error(`Telegram ${method} failed: ${(data && data.description) || res.status}`);
    }
    return data.result;
  }

  return {
    sendMessage(chatId, text, replyMarkup) {
      return call("sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });
    },
    editMessageText(chatId, messageId, text, replyMarkup) {
      return call("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup });
    },
    answerCallbackQuery(callbackQueryId, text) {
      return call("answerCallbackQuery", { callback_query_id: callbackQueryId, text }).catch(() => null);
    }
  };
}

module.exports = { telegramApi };
