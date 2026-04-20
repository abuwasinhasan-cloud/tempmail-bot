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
  
