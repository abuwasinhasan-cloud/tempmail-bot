// ============================================================
// TempMail Telegram Bot — All-in-one file
// 
// SETUP:
//   1. Install Node.js from https://nodejs.org
//   2. Run: npm install node-telegram-bot-api
//   3. Set your token: open this file, paste your token below
//   4. Run: node bot-all-in-one.js
//
// For Railway/Render: set TELEGRAM_BOT_TOKEN as an env variable
// ============================================================

const TelegramBot = require("node-telegram-bot-api");

// --- PASTE YOUR BOT TOKEN HERE (or set TELEGRAM_BOT_TOKEN env variable) ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "PASTE_YOUR_TOKEN_HERE";
// --------------------------------------------------------------------------

if (!TOKEN || TOKEN === "PASTE_YOUR_TOKEN_HERE") {
  console.error("Please set your TELEGRAM_BOT_TOKEN.");
  process.exit(1);
}

const MAIL_TM_API = "https://api.mail.tm";

// ── Session store ──────────────────────────────────────────
const sessions = new Map();
function setSession(id, s) { sessions.set(id, s); }
function getSession(id) { return sessions.get(id); }
function deleteSession(id) { sessions.delete(id); }

// ── Mail.tm helpers ────────────────────────────────────────
function randomString(len) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function createTempMailAccount() {
  const res = await fetch(`${MAIL_TM_API}/domains`);
  const data = await res.json();
  const domain = data["hydra:member"][0].domain;
  const address = `${randomString(10)}@${domain}`;
  const password = randomString(16);

  const acc = await fetch(`${MAIL_TM_API}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  }).then((r) => r.json());

  const tok = await fetch(`${MAIL_TM_API}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password }),
  }).then((r) => r.json());

  return { id: acc.id, address: acc.address, token: tok.token };
}

async function getMessages(token) {
  const res = await fetch(`${MAIL_TM_API}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await res.json())["hydra:member"] ?? [];
}

async function getMessage(token, id) {
  return fetch(`${MAIL_TM_API}/messages/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
}

async function deleteAccount(accountId, token) {
  await fetch(`${MAIL_TM_API}/accounts/${accountId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Bot ────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: true });
console.log("TempMail Bot is running...");

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const KEYBOARD = {
  keyboard: [
    [{ text: "📬 Inbox" }, { text: "✉️ New Mail" }],
    [{ text: "📧 My Mail" }, { text: "🗑️ Delete Mail" }],
    [{ text: "❓ Help" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

const OPTS = { parse_mode: "HTML", reply_markup: KEYBOARD };
const send = (chatId, text) => bot.sendMessage(chatId, text, OPTS).catch((e) => console.error("Send error:", e.message));

async function handleNewMail(chatId) {
  const existing = getSession(chatId);
  if (existing) {
    void send(chatId, `⚠️ You already have an active email:\n\n<code>${esc(existing.address)}</code>\n\nTap <b>🗑️ Delete Mail</b> first to create a new one.`);
    return;
  }
  void send(chatId, "⏳ Creating your temporary email...");
  try {
    const account = await createTempMailAccount();
    setSession(chatId, { accountId: account.id, address: account.address, token: account.token, createdAt: new Date() });
    void send(chatId, `✅ <b>Your temporary email is ready!</b>\n\n📧 <code>${esc(account.address)}</code>\n\nShare this address to receive emails, then tap <b>📬 Inbox</b> to check for messages.`);
  } catch (e) {
    void send(chatId, "❌ Failed to create email. Please try again.");
  }
}

async function handleCheck(chatId) {
  const session = getSession(chatId);
  if (!session) { void send(chatId, "You don't have an active email. Tap <b>✉️ New Mail</b> to create one."); return; }
  void send(chatId, "⏳ Checking inbox...");
  try {
    const messages = await getMessages(session.token);
    if (messages.length === 0) {
      void send(chatId, `📭 <b>No messages yet</b>\n\n<code>${esc(session.address)}</code>\n\nTap <b>📬 Inbox</b> again to refresh.`);
      return;
    }
    const top = messages.slice(0, 5);
    const details = await Promise.all(top.map((m) => getMessage(session.token, m.id).catch(() => null)));
    const parts = top.map((m, i) => {
      const d = details[i];
      const from = m.from.name ? `${esc(m.from.name)} &lt;${esc(m.from.address)}&gt;` : esc(m.from.address);
      const body = d?.text ? esc(d.text.slice(0, 800)) : "(no text content)";
      return (
        `${m.seen ? "" : "🆕 "}<b>Message ${i + 1}</b>\n` +
        `<b>From:</b> ${from}\n` +
        `<b>Subject:</b> ${m.subject ? esc(m.subject) : "(no subject)"}\n` +
        `<b>Date:</b> ${esc(new Date(m.createdAt).toLocaleString())}\n\n` +
        `<pre>${body}</pre>`
      );
    });
    bot.sendMessage(
      chatId,
      `📬 <b>Inbox</b> — <code>${esc(session.address)}</code>\n${messages.length} message(s)\n\n━━━━━━━━━━━━━━━━━━━━\n\n` +
        parts.join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n"),
      { parse_mode: "HTML", reply_markup: KEYBOARD }
    ).catch((e) => console.error("Inbox error:", e.message));
  } catch (e) {
    void send(chatId, "❌ Failed to check inbox. Please try again.");
  }
}

function handleMyMail(chatId) {
  const s = getSession(chatId);
  if (!s) { void send(chatId, "No active email. Tap <b>✉️ New Mail</b> to create one."); return; }
  const age = Math.round((Date.now() - s.createdAt.getTime()) / 60000);
  void send(chatId, `📧 <b>Your current email:</b>\n\n<code>${esc(s.address)}</code>\n\n⏱ Created ${age} minute(s) ago`);
}

async function handleDelete(chatId) {
  const s = getSession(chatId);
  if (!s) { void send(chatId, "You don't have an active email to delete."); return; }
  void send(chatId, "⏳ Deleting...");
  try { await deleteAccount(s.accountId, s.token); } catch (e) { /* ignore */ }
  deleteSession(chatId);
  void send(chatId, `🗑️ <b>Email deleted</b>\n\n<code>${esc(s.address)}</code> has been removed.\n\nTap <b>✉️ New Mail</b> to create a new one.`);
}

function handleHelp(chatId) {
  void send(chatId,
    `<b>TempMail Bot</b> 📬\n\nUse the buttons below:\n\n` +
    `📬 <b>Inbox</b> — Check for new messages\n` +
    `✉️ <b>New Mail</b> — Generate a fresh email address\n` +
    `📧 <b>My Mail</b> — Show your current email\n` +
    `🗑️ <b>Delete Mail</b> — Delete email and clear session`
  );
}

bot.onText(/\/start/, (msg) => void send(msg.chat.id, `👋 Welcome, <b>Abu Wasin Hasan Mahi</b>!\n\nThis is <b>TempMail Bot</b> — get a disposable email in seconds.\n\nTap <b>✉️ New Mail</b> to get started!`));
bot.onText(/\/newmail/, (msg) => void handleNewMail(msg.chat.id));
bot.onText(/\/mymail/, (msg) => handleMyMail(msg.chat.id));
bot.onText(/\/check/,  (msg) => void handleCheck(msg.chat.id));
bot.onText(/\/delete/, (msg) => void handleDelete(msg.chat.id));
bot.onText(/\/help/,   (msg) => handleHelp(msg.chat.id));

bot.on("message", (msg) => {
  switch (msg.text?.trim()) {
    case "📬 Inbox":       void handleCheck(msg.chat.id); break;
    case "✉️ New Mail":    void handleNewMail(msg.chat.id); break;
    case "📧 My Mail":     handleMyMail(msg.chat.id); break;
    case "🗑️ Delete Mail": void handleDelete(msg.chat.id); break;
    case "❓ Help":        handleHelp(msg.chat.id); break;
  }
});

bot.on("polling_error", (err) => console.error("Polling error:", err.message));
