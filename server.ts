import express from "express";
import { createServer as createViteServer } from "vite";
import mongoose from "mongoose";
import TelegramBot from "node-telegram-bot-api";
import { TelegramClient, Api } from "telegram";
import webpush from "web-push";
import { NewMessage } from "telegram/events/index.js";
import { StringSession } from "telegram/sessions/index.js";
import { CustomFile } from "telegram/client/uploads.js";
import { GoogleGenAI, Type } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";

// Path resolution safe for both ESM (dev tsx) and bundled CommonJS (production)
const _dirname = typeof __dirname !== "undefined"
  ? __dirname
  : process.cwd();
const _filename = typeof __filename !== "undefined"
  ? __filename
  : path.join(_dirname, "server.ts");

// Initialize Gemini
// const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// VAPID keys setup
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

async function setupVapid() {
  try {
    const pubKeySetting = await getSetting("vapid_public_key");
    const privKeySetting = await getSetting("vapid_private_key");

    if (pubKeySetting && privKeySetting) {
      vapidPublicKey = pubKeySetting.value;
      vapidPrivateKey = privKeySetting.value;
    } else if (!vapidPublicKey || !vapidPrivateKey) {
      const generated = webpush.generateVAPIDKeys();
      vapidPublicKey = generated.publicKey;
      vapidPrivateKey = generated.privateKey;
      
      await setSetting("vapid_public_key", vapidPublicKey);
      await setSetting("vapid_private_key", vapidPrivateKey);
      
      console.log("Generated and stored new VAPID keys.");
    }

    if (vapidPublicKey && vapidPrivateKey) {
      console.log("Setting up VAPID details with public key length:", vapidPublicKey.length, "and private key length:", vapidPrivateKey.length);
      webpush.setVapidDetails(
        "mailto:rohit37816@gmail.com",
        vapidPublicKey,
        vapidPrivateKey
      );
    }
  } catch (err) {
    console.error("Error setting up VAPID keys:", err);
  }
}

const DEFAULT_AI_PERSONA = `You are a smart assistant for a Telegram store selling paid study batches (SSC, Railway, etc.) for 87rs each. You have leaked batches from many top teachers. Your goal is to answer user queries about price, availability, and payment.
- Context: Users are students preparing for exams.
- Language: Reply in the same language as the user (Hindi, English, or Hinglish).
- Robustness: Users may use slang or misspell words; interpret their intent correctly.
- Pricing: Each batch is 87rs.
- Behavior: Be helpful, concise, and polite.
- Constraint: If the message is generic (e.g., 'ok', 'hmm') or doesn't need a reply, strictly output 'NO_REPLY'.`;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not defined in environment variables.");
  process.exit(1);
}

// Schemas
const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true },
  value: { type: String, required: true },
  account_id: { type: String, default: 'default', index: true }
});
SettingSchema.index({ key: 1, account_id: 1 }, { unique: true });
const Setting = mongoose.model("Setting", SettingSchema);
let bot: TelegramBot | null = null;
let currentBotInfo: { id: number; firstName: string; username: string } | null = null;

const escapeHtml = (text: string) => {
  if (!text) return "";
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

async function getRecentConversationContext(client: TelegramClient, peerId: any, topicId: number | undefined): Promise<string> {
  if (!topicId) return "";
  try {
    const historyMessages = await client.getMessages(peerId, {
      replyTo: topicId,
      limit: 10, // Fetch last 10 messages for context
    });
    
    if (!historyMessages || historyMessages.length === 0) return "";
    
    let contextStr = "--- Recent Conversation History in this Topic ---\n";
    const reversed = [...historyMessages].reverse();
    for (const msg of reversed) {
      if (msg.message) {
        let senderName = "User";
        if (msg.out) {
          senderName = "Bot (You)";
        } else if (msg.sender) {
          senderName = (msg.sender as any).firstName || (msg.sender as any).username || "User";
        }
        contextStr += `[${senderName}]: ${msg.message}\n`;
      }
    }
    return contextStr;
  } catch (err) {
    console.error("Failed to fetch conversation history for context:", err);
    return "";
  }
}

function extractTopicInfo(input: string): { topicId: number; normalizedLink: string; rawGroupId?: string } | null {
  if (!input) return null;
  const text = input.trim();
  
  // Find URL if embedded in text
  const urlMatch = text.match(/(https?:\/\/(?:t\.me|telegram\.me)\/[^\s]+)/i);
  const targetStr = urlMatch ? urlMatch[1] : text;

  if (targetStr.includes("t.me/") || targetStr.includes("telegram.me/")) {
    const cleanUrl = targetStr.split("?")[0].replace(/\/$/, "");
    const parts = cleanUrl.split("/").filter(p => p.length > 0);
    const cIndex = parts.indexOf("c");
    let topicId = NaN;
    let rawGroupId: string | undefined;

    if (cIndex !== -1 && parts.length > cIndex + 2) {
      rawGroupId = parts[cIndex + 1];
      topicId = parseInt(parts[cIndex + 2], 10);
    } else {
      const tmeIndex = parts.findIndex(p => p.includes("t.me") || p.includes("telegram.me"));
      if (tmeIndex !== -1 && parts.length > tmeIndex + 2) {
        rawGroupId = parts[tmeIndex + 1];
        topicId = parseInt(parts[tmeIndex + 2], 10);
      } else if (parts.length >= 2) {
        topicId = parseInt(parts[parts.length - 1], 10);
      }
    }

    if (!isNaN(topicId) && topicId > 0) {
      return {
        topicId,
        normalizedLink: cleanUrl,
        rawGroupId
      };
    }
  }

  // Check if it's a numeric ID passed directly (e.g. "/block 456" or "456")
  const numMatch = text.match(/(?:(?:block|unblock|\/block|\/unblock)\s+)?(\d{2,15})/i);
  if (numMatch && numMatch[1]) {
    const topicId = parseInt(numMatch[1], 10);
    if (!isNaN(topicId) && topicId > 0) {
      return {
        topicId,
        normalizedLink: `Topic ID ${topicId}`
      };
    }
  }

  return null;
}

async function executeApprovedReply(approvalDoc: any) {
  if (!userClient) {
    throw new Error("Telegram User Client is not connected or logged in.");
  }

  let kw: any = approvalDoc.rule_id;
  if (!kw || typeof kw !== 'object' || !kw._id) {
    const ruleId = approvalDoc.rule_id || approvalDoc._id;
    kw = await Keyword.findById(ruleId);
  }

  const matchedWord = approvalDoc.matched_keyword || (kw?.keywords?.[0] || kw?.keyword || "keyword");

  if (!kw) {
    kw = {
      _id: approvalDoc.rule_id || approvalDoc._id,
      keyword: matchedWord,
      reply: approvalDoc.original_text ? `Reply for ${matchedWord}` : '',
      enabled: true
    };
  }

  const chatId = approvalDoc.chat_id;
  const topicId = approvalDoc.topic_id;
  const replyInGeneral = (await getSetting("reply_in_general"))?.value === "true";

  let toPeerInput: any = chatId;
  try {
    toPeerInput = await userClient.getInputEntity(chatId);
  } catch (e) {
    try {
      const numId = parseInt(chatId, 10);
      if (!isNaN(numId)) {
        toPeerInput = await userClient.getInputEntity(numId);
      }
    } catch (e2) {
      toPeerInput = chatId;
    }
  }

  let replyTo = replyInGeneral ? undefined : approvalDoc.message_id;
  if (!replyTo && topicId && topicId !== 1) {
    replyTo = topicId;
  }

  let replySent = false;

  // 1. AI Reply if enabled on rule
  if (kw.ai_reply_enabled) {
    const aiModeEnabled = (await getSetting("ai_mode_enabled"))?.value === "true";
    if (aiModeEnabled) {
      const geminiApiKeysSetting = await getSetting("gemini_api_keys");
      let apiKeys: string[] = [];
      try { apiKeys = JSON.parse(geminiApiKeysSetting?.value || "[]"); } catch (e) {}
      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (envKey && !apiKeys.includes(envKey)) apiKeys.push(envKey);

      if (apiKeys.length > 0) {
        const aiPersona = (await getSetting("ai_persona"))?.value || DEFAULT_AI_PERSONA;
        const conversationContext = await getRecentConversationContext(userClient, toPeerInput, topicId);
        
        for (const apiKey of apiKeys) {
          try {
            const genAI = new GoogleGenAI({ apiKey });
            const response = await genAI.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: `System Instruction: ${aiPersona}` },
                    { text: conversationContext },
                    { text: `User Message: "${approvalDoc.original_text || ''}"` },
                    { text: `Context: The user triggered keyword "${matchedWord}". Reply naturally.` }
                  ]
                }
              ]
            });
            const aiReply = response.text.trim();
            if (aiReply && aiReply !== "NO_REPLY") {
              try {
                await userClient.sendMessage(toPeerInput, { message: aiReply, replyTo });
              } catch (err: any) {
                const fallbackReplyTo = (topicId && topicId !== 1) ? topicId : undefined;
                await userClient.sendMessage(toPeerInput, { message: aiReply, replyTo: fallbackReplyTo });
              }
              await saveLog(`AI Auto-Reply (Approved Keyword: ${matchedWord}): "${aiReply}"`, 'info', 'USERBOT');
              replySent = true;
              break;
            }
          } catch (e) {
            console.error("AI Approved Keyword Reply failed:", e);
          }
        }
      }
    }
  }

  // 2. Photo reply
  if (kw.photo) {
    try {
      const base64Data = kw.photo.includes(",") ? kw.photo.split(",")[1] : kw.photo;
      const buffer = Buffer.from(base64Data, "base64");
      const fileToUpload = new CustomFile("photo.jpg", buffer.length, "", buffer);
      const toUpload = await userClient.uploadFile({ file: fileToUpload, workers: 1 });
      await userClient.sendFile(toPeerInput, {
        file: toUpload,
        caption: kw.reply || "",
        replyTo: replyTo,
        forceDocument: false
      });
      replySent = true;
    } catch (e: any) {
      console.error("Photo reply send error:", e.message);
      if (kw.reply && !replySent) {
        await userClient.sendMessage(toPeerInput, { message: kw.reply, replyTo }).catch(() => {});
        replySent = true;
      }
    }
  } else if (kw.reply && !replySent) {
    // 3. Text reply
    try {
      await userClient.sendMessage(toPeerInput, {
        message: kw.reply,
        replyTo: replyTo
      });
      replySent = true;
    } catch (err: any) {
      console.warn("Text reply with msgId replyTo failed, falling back to topicId or plain:", err.message);
      const fallbackReplyTo = (topicId && topicId !== 1) ? topicId : undefined;
      await userClient.sendMessage(toPeerInput, {
        message: kw.reply,
        replyTo: fallbackReplyTo
      }).catch(e2 => {
        return userClient.sendMessage(toPeerInput, { message: kw.reply });
      });
      replySent = true;
    }
  }

  // 4. Message links forwarding
  const linksToProcess = [...(kw.message_links || [])];
  if (kw.message_link && !linksToProcess.includes(kw.message_link)) linksToProcess.push(kw.message_link);
  const normalizedLinks = linksToProcess.map((l: string) => l.trim()).filter((l: string) => l);

  if (normalizedLinks.length > 0) {
    for (const link of normalizedLinks) {
      const parts = link.split("/").filter(p => p.length > 0);
      const messageId = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(messageId)) {
        let fromPeer: any = chatId;
        if (link.includes("/c/")) {
          const cIndex = parts.indexOf("c");
          if (cIndex !== -1 && parts[cIndex + 1]) {
            fromPeer = `-100${parts[cIndex + 1]}`;
          }
        } else {
          const tmeIndex = parts.indexOf("t.me");
          if (tmeIndex !== -1 && parts[tmeIndex + 1]) {
            fromPeer = parts[tmeIndex + 1];
          } else if (parts.length >= 3) {
            fromPeer = parts[2];
          }
        }
        const topMsgId = (topicId === 1 || !topicId) ? undefined : topicId;

        try {
          let inputPeer = await userClient.getInputEntity(typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer);
          await userClient.invoke(
            new Api.messages.ForwardMessages({
              fromPeer: inputPeer,
              id: [messageId],
              randomId: [BigInt(Math.floor(Math.random() * 1e15)) as any],
              toPeer: toPeerInput,
              topMsgId: replyInGeneral ? undefined : topMsgId,
            }) as any
          );
          replySent = true;
        } catch (fErr: any) {
          try {
            await userClient.forwardMessages(toPeerInput, {
              messages: [messageId],
              fromPeer: typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer,
              topMsgId: replyInGeneral ? undefined : topMsgId,
            } as any);
            replySent = true;
          } catch (fErr2: any) {
            console.error("Approved link forward failed:", fErr2.message);
          }
        }
      }
    }
  }

  if (topicId && kw._id) {
    const accId = approvalDoc.account_id || "default";
    await incrementKeywordReplyCount(topicId, chatId, kw._id, accId);
  }

  const successLog = `✅ Approved Keyword Reply Sent: "${matchedWord}" in ${approvalDoc.chat_title || chatId} > ${approvalDoc.topic_name || topicId}`;
  console.log(successLog);
  await saveLog(successLog, 'info', 'USERBOT', undefined, { topicId, keyword: matchedWord });

  return { success: true };
}

async function initBot(token: string) {
  if (bot) {
    try {
      await bot.stopPolling();
      console.log("Stopped existing Telegram Bot polling.");
    } catch (e) {
      console.error("Error stopping bot polling:", e);
    }
  }

  console.log("Initializing Telegram Bot...");
  bot = new TelegramBot(token, { polling: true });
  saveLog("Telegram Bot initialized and polling started.", "info", "SYSTEM");
  
  try {
    const me = await bot.getMe();
    currentBotInfo = {
      id: me.id,
      firstName: me.first_name || "Bot",
      username: me.username || "",
    };
    console.log(`Telegram Bot @${me.username} (${me.first_name}) info loaded successfully.`);
  } catch (meErr: any) {
    console.warn("Could not fetch bot getMe() info:", meErr.message);
  }
  
  bot.on("polling_error", (error: any) => {
    if (error.message && error.message.includes("409 Conflict")) return;
    if (error.message && error.message.includes("401 Unauthorized")) {
      console.error("Telegram Bot Polling Error: 401 Unauthorized. Stopping polling. Please check your TELEGRAM_BOT_TOKEN.");
      bot?.stopPolling();
      saveLog("Telegram Bot Token is unauthorized (401). Please update it in settings.", "error", "SYSTEM");
      return;
    }
    console.error("Telegram Bot Polling Error:", error.message || "Unknown error");
  });

  bot.on("message", async (msg) => {
    try {
      const chatId = msg.chat.id;
      const isPrivate = msg.chat.type === 'private';
      const text = (msg.text || "").trim();

      // 1. Forum topic tracking in target groups
      if (msg.forum_topic_created) {
        const topicName = msg.forum_topic_created.name;
        const topicId = msg.message_thread_id;
        if (topicId) {
          await logTopic(topicId, topicName, msg.chat.id.toString());
          console.log(`Topic tracked: ${topicName} (${topicId}) in chat ${msg.chat.id}`);
        }
        return;
      }

      if (!text) return;

      const registered = parseRegisteredGroups();
      const allowedGroupIds = registered.map(r => r.normalizedId);
      const currentChatId = chatId.toString().replace(/^-100|^ -100|^-/, "").trim();
      const isAllowedGroup = allowedGroupIds.includes(currentChatId);

      // Only respond to private messages or bot commands in explicitly allowed groups from Settings
      if (!isPrivate && !isAllowedGroup) {
        return;
      }

      if (!isPrivate && !text.startsWith("/") && !text.toLowerCase().startsWith("block") && !text.toLowerCase().startsWith("unblock")) {
        return;
      }

      const lowerText = text.toLowerCase();

      if (isPrivate) {
        // Automatically save the user's private Telegram chat ID as admin for notifications
        await Setting.findOneAndUpdate(
          { key: `bot_admin_${chatId}`, account_id: "default" },
          { key: `bot_admin_${chatId}`, value: chatId.toString(), account_id: "default" },
          { upsert: true }
        ).catch(() => {});
      }

      // --- COMMAND: /start or /help ---
      if (lowerText === "/start" || lowerText.startsWith("/start ") || lowerText === "/help" || lowerText.startsWith("/help ")) {
        const welcomeText = `👋 <b>Welcome to BotFlow Control Bot!</b>\n\nYou can manage blocked topics directly here:\n\n• <b>Block a topic:</b> Send any Telegram topic link (e.g. <code>https://t.me/c/12345/678</code>) or <code>/block &lt;link&gt;</code>\n• <b>Unblock a topic:</b> Send <code>/unblock &lt;link or ID&gt;</code>\n• <b>View blocked topics:</b> <code>/blocked</code>\n• <b>System status:</b> <code>/status</code>\n\n<i>When a topic is blocked, the userbot skips all automatic replies and broadcasts for that topic.</i>`;
        await bot?.sendMessage(chatId, welcomeText, { parse_mode: 'HTML' });
        return;
      }

      // --- COMMAND: /status or /stats ---
      if (lowerText === "/status" || lowerText === "/stats") {
        const isUserConnected = !!(userClient && userClient.connected);
        const isSystemPaused = (await getSetting("system_paused"))?.value === "true";
        const blockedCount = await BlockedTopic.countDocuments();
        const keywordCount = await Keyword.countDocuments({ enabled: true });
        const pendingCount = await PendingApproval.countDocuments({ status: 'pending' });

        const statusText = `🤖 <b>BotFlow System Status</b>\n\n` +
          `• <b>UserBot:</b> ${isUserConnected ? '🟢 Connected' : '🔴 Disconnected'}\n` +
          `• <b>Auto-Reply System:</b> ${isSystemPaused ? '⏸ Paused' : '▶️ Active'}\n` +
          `• <b>Active Rules:</b> <code>${keywordCount}</code>\n` +
          `• <b>Blocked Topics:</b> <code>${blockedCount}</code>\n` +
          `• <b>Pending Approvals:</b> <code>${pendingCount}</code>`;

        await bot?.sendMessage(chatId, statusText, { parse_mode: 'HTML' });
        return;
      }

      // --- COMMAND: /blocked or /list ---
      if (lowerText === "/blocked" || lowerText === "/list" || lowerText.startsWith("/blocked ") || lowerText.startsWith("/list ")) {
        const blockedList = await BlockedTopic.find().sort({ created_at: -1 }).limit(25);
        if (blockedList.length === 0) {
          await bot?.sendMessage(chatId, `✅ <b>No topics are currently blocked.</b>\n\nTo block a topic, send its link here.`, { parse_mode: 'HTML' });
          return;
        }

        let listText = `🚫 <b>Blocked Topics (${blockedList.length}):</b>\n\n`;
        const keyboardButtons: any[] = [];

        blockedList.forEach((bt, idx) => {
          listText += `${idx + 1}. <b>${escapeHtml(bt.name || 'Unknown')}</b> (ID: <code>${bt.telegram_topic_id}</code>)\n`;
          if (bt.link && bt.link.startsWith('http')) {
            listText += `   🔗 ${escapeHtml(bt.link)}\n`;
          }
          listText += `   <i>Unblock:</i> <code>/unblock ${bt.telegram_topic_id}</code>\n\n`;

          if (idx < 5) {
            keyboardButtons.push([
              { text: `🔓 Unblock ${bt.name ? (bt.name.length > 18 ? bt.name.slice(0, 18) + '...' : bt.name) : `ID ${bt.telegram_topic_id}`}`, callback_data: `unblock_topic_${bt.telegram_topic_id}` }
            ]);
          }
        });

        await bot?.sendMessage(chatId, listText, {
          parse_mode: 'HTML',
          reply_markup: keyboardButtons.length > 0 ? { inline_keyboard: keyboardButtons } : undefined,
          disable_web_page_preview: true
        });
        return;
      }

      // --- UNBLOCK ACTION ---
      const isExplicitUnblock = lowerText.startsWith("/unblock") || lowerText.startsWith("unblock ");
      if (isExplicitUnblock) {
        const topicInfo = extractTopicInfo(text);
        if (!topicInfo) {
          await bot?.sendMessage(chatId, `⚠️ <b>Invalid link or ID!</b>\n\nPlease provide a valid Telegram topic link or ID.\nExample: <code>/unblock https://t.me/c/12345/678</code> or <code>/unblock 678</code>`, { parse_mode: 'HTML' });
          return;
        }

        const existing = await BlockedTopic.findOne({ telegram_topic_id: topicInfo.topicId });
        if (existing) {
          const topicName = existing.name || topicNamesCache[topicInfo.topicId] || `Topic #${topicInfo.topicId}`;
          await BlockedTopic.findByIdAndDelete(existing._id);
          removeBlockedTopicFromCache(topicInfo.topicId);

          const userName = msg.from?.first_name ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}` : 'Telegram User';
          await saveLog(`Topic ${topicInfo.topicId} unblocked via Telegram Bot by ${userName}`, 'info', 'BOT', undefined, { topicName, topicId: topicInfo.topicId });
          sendSseEvent('topic_unblocked', { topicId: topicInfo.topicId, timestamp: new Date() });

          const replyText = `✅ <b>Topic Unblocked Successfully!</b>\n\n📌 <b>Topic Name:</b> ${escapeHtml(topicName)}\n🆔 <b>Topic ID:</b> <code>${topicInfo.topicId}</code>\n\n<i>Auto-replies and broadcasts are now ENABLED for this topic.</i>`;
          await bot?.sendMessage(chatId, replyText, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: "🚫 Block Again", callback_data: `block_topic_${topicInfo.topicId}` }]
              ]
            }
          });
        } else {
          const topicName = topicNamesCache[topicInfo.topicId] || `Topic #${topicInfo.topicId}`;
          await bot?.sendMessage(chatId, `ℹ️ <b>Topic is not blocked</b>\n\n📌 <b>Topic:</b> ${escapeHtml(topicName)}\n🆔 <b>Topic ID:</b> <code>${topicInfo.topicId}</code> is already active.`, { parse_mode: 'HTML' });
        }
        return;
      }

      // --- BLOCK ACTION / DIRECT LINK SENT ---
      const topicInfo = extractTopicInfo(text);
      if (topicInfo) {
        const topicId = topicInfo.topicId;
        const normalizedLink = topicInfo.normalizedLink;

        let name = topicNamesCache[topicId] || "";
        if (!name) {
          const foundTopic = await Topic.findOne({ telegram_topic_id: topicId });
          if (foundTopic && foundTopic.name) {
            name = foundTopic.name;
          }
        }
        if (!name) {
          name = `Topic #${topicId}`;
        }

        const existing = await BlockedTopic.findOne({ telegram_topic_id: topicId });
        if (existing) {
          const displayName = existing.name || name;
          const alreadyBlockedText = `ℹ️ <b>Topic is Already Blocked</b>\n\n📌 <b>Topic Name:</b> ${escapeHtml(displayName)}\n🆔 <b>Topic ID:</b> <code>${topicId}</code>\n🔗 <b>Link:</b> ${escapeHtml(existing.link || normalizedLink)}\n\n<i>This topic is already blocked from auto-replies and broadcasts.</i>`;
          await bot?.sendMessage(chatId, alreadyBlockedText, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔓 Unblock This Topic", callback_data: `unblock_topic_${topicId}` }]
              ]
            },
            disable_web_page_preview: true
          });
          return;
        }

        // Create new BlockedTopic
        await BlockedTopic.create({
          telegram_topic_id: topicId,
          name,
          link: normalizedLink
        });
        addBlockedTopicToCache(topicId);

        const userName = msg.from?.first_name ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}` : 'Telegram User';
        await saveLog(`Topic ${topicId} blocked via Telegram Bot by ${userName}`, 'info', 'BOT', undefined, { link: normalizedLink, topicName: name, topicId });

        // Notify frontend
        sendSseEvent('topic_blocked', {
          message: `Topic "${name}" blocked via Telegram Bot`,
          topicName: name,
          timestamp: new Date()
        });

        const blockedReplyText = `🚫 <b>Topic Blocked Successfully!</b>\n\n` +
          `📌 <b>Topic Name:</b> ${escapeHtml(name)}\n` +
          `🆔 <b>Topic ID:</b> <code>${topicId}</code>\n` +
          `🔗 <b>Link:</b> ${escapeHtml(normalizedLink)}\n\n` +
          `<i>The bot will now skip all auto-replies and broadcasts in this topic.</i>`;

        await bot?.sendMessage(chatId, blockedReplyText, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔓 Unblock Topic", callback_data: `unblock_topic_${topicId}` }]
            ]
          },
          disable_web_page_preview: true
        });
        return;
      }

      // If user sent something unrecognized in private DM
      if (isPrivate) {
        await bot?.sendMessage(
          chatId,
          `❓ <b>Unrecognized Input</b>\n\nPlease send a Telegram topic link (e.g. <code>https://t.me/c/12345/678</code>) to block it, or type <code>/help</code> for available commands.`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err: any) {
      console.error("Error processing bot message:", err);
    }
  });

  bot.on("callback_query", async (query) => {
    const data = query.data;
    if (!data) return;
    
    // 1. Topic Block / Unblock via inline buttons
    if (data.startsWith("block_topic_") || data.startsWith("unblock_topic_")) {
      const isBlock = data.startsWith("block_topic_");
      const topicId = parseInt(data.replace(isBlock ? "block_topic_" : "unblock_topic_", ""), 10);
      
      if (isNaN(topicId)) {
        await bot?.answerCallbackQuery(query.id, { text: "Invalid topic ID" });
        return;
      }

      let name = topicNamesCache[topicId] || "";
      if (!name) {
        const foundTopic = await Topic.findOne({ telegram_topic_id: topicId });
        if (foundTopic && foundTopic.name) name = foundTopic.name;
      }
      if (!name) name = `Topic #${topicId}`;

      try {
        if (isBlock) {
          const existing = await BlockedTopic.findOne({ telegram_topic_id: topicId });
          if (!existing) {
            await BlockedTopic.create({
              telegram_topic_id: topicId,
              name,
              link: `Topic ID ${topicId}`
            });
            addBlockedTopicToCache(topicId);
            sendSseEvent('topic_blocked', { message: `Topic "${name}" blocked`, topicName: name, timestamp: new Date() });
            await saveLog(`Topic ${topicId} blocked via Bot Button`, 'info', 'BOT', undefined, { topicName: name, topicId });
          }
          await bot?.answerCallbackQuery(query.id, { text: `🚫 Topic ${topicId} blocked!` });
          if (query.message) {
            await bot?.editMessageText(
              `🚫 <b>Topic Blocked Successfully!</b>\n\n📌 <b>Topic Name:</b> ${escapeHtml(name)}\n🆔 <b>Topic ID:</b> <code>${topicId}</code>\n\n<i>Auto-replies and broadcasts are now blocked for this topic.</i>`,
              {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🔓 Unblock Topic", callback_data: `unblock_topic_${topicId}` }]
                  ]
                }
              }
            ).catch(() => {});
          }
        } else {
          const existing = await BlockedTopic.findOne({ telegram_topic_id: topicId });
          if (existing) {
            name = existing.name || name;
            await BlockedTopic.findByIdAndDelete(existing._id);
            removeBlockedTopicFromCache(topicId);
            sendSseEvent('topic_unblocked', { topicId, timestamp: new Date() });
            await saveLog(`Topic ${topicId} unblocked via Bot Button`, 'info', 'BOT', undefined, { topicName: name, topicId });
          }
          await bot?.answerCallbackQuery(query.id, { text: `✅ Topic ${topicId} unblocked!` });
          if (query.message) {
            await bot?.editMessageText(
              `✅ <b>Topic Unblocked Successfully!</b>\n\n📌 <b>Topic Name:</b> ${escapeHtml(name)}\n🆔 <b>Topic ID:</b> <code>${topicId}</code>\n\n<i>Auto-replies and broadcasts are now enabled for this topic.</i>`,
              {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🚫 Block Again", callback_data: `block_topic_${topicId}` }]
                  ]
                }
              }
            ).catch(() => {});
          }
        }
      } catch (e: any) {
        console.error("Error handling topic button toggle:", e);
        await bot?.answerCallbackQuery(query.id, { text: `Error: ${e.message || 'Operation failed'}` });
      }
      return;
    }

    // 2. Keyword Approval / Reject buttons
    if (data.startsWith("approve_") || data.startsWith("reject_")) {
      const parts = data.split("_");
      const action = parts[0];
      const approvalId = parts[1];
      
      try {
        const approval = await PendingApproval.findById(approvalId).populate('rule_id');
        const is24hExpired = approval && approval.created_at && (Date.now() - new Date(approval.created_at).getTime() > 24 * 60 * 60 * 1000);

        if (!approval || approval.status !== 'pending' || is24hExpired) {
          if (approval && approval.status === 'pending' && is24hExpired) {
            approval.status = 'expired';
            await approval.save().catch(() => {});
            sendSseEvent('approval_processed', { id: approvalId, status: 'expired' });
          }

          const responseMsg = is24hExpired ? "⏳ Approval request has expired (24h passed)." : "Approval already processed or not found.";
          await bot?.answerCallbackQuery(query.id, { text: responseMsg });
          if (query.message) {
            await bot?.editMessageText(
              `⏳ <b>Approval Request Expired</b>\n\n<b>Keyword:</b> <code>${escapeHtml(approval?.matched_keyword || 'Keyword')}</code>\n<i>This request is older than 24 hours and is no longer valid.</i>`,
              {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML'
              }
            ).catch(() => {});
          }
          return;
        }
        
        if (action === "approve") {
          await executeApprovedReply(approval);

          approval.status = 'approved';
          approval.processed_at = new Date();
          await approval.save();

          await bot?.answerCallbackQuery(query.id, { text: "✅ Approved & Reply sent immediately!" });
          if (query.message) {
            await bot?.editMessageText(
              `✅ <b>Approved & Reply Sent!</b>\n\n<b>Keyword:</b> <code>${escapeHtml(approval.matched_keyword)}</code>\n<b>Group:</b> ${escapeHtml(approval.chat_title || 'Group')}\n<b>Topic:</b> ${escapeHtml(approval.topic_name || 'Topic')}`,
              {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML'
              }
            ).catch(() => {});
          }
          sendSseEvent('approval_processed', { id: approvalId, status: 'approved' });
        } else {
          approval.status = 'rejected';
          approval.processed_at = new Date();
          await approval.save();

          await bot?.answerCallbackQuery(query.id, { text: "❌ Keyword reply rejected." });
          if (query.message) {
            await bot?.editMessageText(
              `❌ <b>Not Approved / Rejected</b>\n\n<b>Keyword:</b> <code>${escapeHtml(approval.matched_keyword)}</code>\n<b>Group:</b> ${escapeHtml(approval.chat_title || 'Group')}\n<b>Topic:</b> ${escapeHtml(approval.topic_name || 'Topic')}`,
              {
                chat_id: query.message.chat.id,
                message_id: query.message.message_id,
                parse_mode: 'HTML'
              }
            ).catch(() => {});
          }
          saveLog(`Keyword "${approval.matched_keyword}" rejected for ${approval.chat_title}`, 'info', 'USERBOT');
          sendSseEvent('approval_processed', { id: approvalId, status: 'rejected' });
        }
      } catch (err: any) {
        console.error("Approval callback error:", err);
        await bot?.answerCallbackQuery(query.id, { text: `❌ Failed: ${err.message || 'Error executing reply'}` });
      }
    }
  });

  return bot;
}

const TopicSchema = new mongoose.Schema({
  telegram_topic_id: { type: Number, required: true },
  chat_id: { type: String, required: true, default: "" },
  name: { type: String },
  account_id: { type: String, default: "default", index: true },
  created_at: { type: Date, default: Date.now }
});
TopicSchema.index({ telegram_topic_id: 1, chat_id: 1, account_id: 1 }, { unique: true });
const Topic = mongoose.model("Topic", TopicSchema);

const KeywordSchema = new mongoose.Schema({
  keyword: { type: String }, // Legacy single keyword
  keywords: { type: [String], default: [] }, // New array of keywords
  reply: { type: String }, // Made optional to support message_link only
  photo: { type: String }, // Base64 string (legacy)
  message_link: { type: String }, // Legacy Telegram message link
  message_links: { type: [String], default: [] }, // Multiple Telegram message links
  max_replies: { type: Number, default: 2 }, // Max replies per topic per keyword rule
  match_mode: { type: String, enum: ['exact', 'partial'], default: 'exact' },
  ai_reply_enabled: { type: Boolean, default: false },
  approval_mode: { type: Boolean, default: false },
  target_groups: { type: [String], default: [] }, // Target group IDs or titles
  enabled: { type: Boolean, default: true },
  notify_on_hit: { type: Boolean, default: false },
  last_import_batch_id: { type: String, default: null, index: true },
  created_at: { type: Date, default: Date.now },
  account_id: { type: String, default: "default", index: true }
});
const Keyword = mongoose.model("Keyword", KeywordSchema);

const SessionHistorySchema = new mongoose.Schema({
  account_id: { type: String, default: "default", index: true },
  start_time: { type: Number, required: true },
  end_time: { type: Number, required: true },
  duration_seconds: { type: Number, required: true },
});
const SessionHistory = mongoose.model("SessionHistory", SessionHistorySchema);

async function recordSessionEnd(accountId, sessionStartTime) {
  if (sessionStartTime) {
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    if (duration > 60) { // Only record sessions longer than a minute
      try {
        await SessionHistory.create({
          account_id: accountId,
          start_time: sessionStartTime,
          end_time: Date.now(),
          duration_seconds: duration
        });
      } catch (e) {
        console.error("Error saving session history:", e);
      }
    }
  }
}



const PendingApprovalSchema = new mongoose.Schema({
  matched_keyword: { type: String, required: true },
  rule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Keyword', required: true },
  message_id: { type: Number, required: true },
  chat_id: { type: String, required: true },
  chat_title: { type: String },
  topic_id: { type: Number },
  topic_name: { type: String },
  original_text: { type: String },
  bot_chat_id: { type: String },
  bot_message_id: { type: Number },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
  account_id: { type: String, default: "default", index: true },
  created_at: { type: Date, default: Date.now },
  processed_at: { type: Date }
});
const PendingApproval = mongoose.model("PendingApproval", PendingApprovalSchema);

const LogSchema = new mongoose.Schema({
  level: { type: String, enum: ['info', 'error', 'warn'], default: 'info' },
  category: { type: String, default: 'SYSTEM' },
  message: { type: String, required: true },
  details: { type: String },
  route: { type: String },
  account_id: { type: String, default: "default", index: true },
  timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model("Log", LogSchema);

const ReplyHistorySchema = new mongoose.Schema({
  topic_id: { type: Number, required: true },
  chat_id: { type: String, required: true, default: "" },
  keyword_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Keyword', required: true },
  count: { type: Number, default: 0 },
  account_id: { type: String, default: "default", index: true },
  last_updated: { type: Date, default: Date.now }
});
ReplyHistorySchema.index({ topic_id: 1, chat_id: 1, keyword_id: 1, account_id: 1 }, { unique: true });
const ReplyHistory = mongoose.model("ReplyHistory", ReplyHistorySchema);

const PhotoReplyHistorySchema = new mongoose.Schema({
  topic_id: { type: Number, required: true },
  chat_id: { type: String, required: true, default: "" },
  count: { type: Number, default: 0 },
  account_id: { type: String, default: "default", index: true },
  last_updated: { type: Date, default: Date.now }
});
PhotoReplyHistorySchema.index({ topic_id: 1, chat_id: 1, account_id: 1 }, { unique: true });
const PhotoReplyHistory = mongoose.model("PhotoReplyHistory", PhotoReplyHistorySchema);

const PhotoSentLogSchema = new mongoose.Schema({
  topic_id: { type: Number, required: true },
  topic_name: { type: String },
  topic_link: { type: String },
  account_id: { type: String, default: "default", index: true },
  sent_at: { type: Date, default: Date.now }
});
const PhotoSentLog = mongoose.model("PhotoSentLog", PhotoSentLogSchema);

const BlockedTopicSchema = new mongoose.Schema({
  telegram_topic_id: { type: Number, required: true },
  name: { type: String },
  link: { type: String },
  account_id: { type: String, default: "default", index: true },
  created_at: { type: Date, default: Date.now }
});
BlockedTopicSchema.index({ telegram_topic_id: 1, account_id: 1 }, { unique: true });
const BlockedTopic = mongoose.model("BlockedTopic", BlockedTopicSchema);

const MissedTriggerSchema = new mongoose.Schema({
  message_id: { type: Number, required: true },
  chat_id: { type: String, required: true },
  topic_id: { type: Number },
  text: { type: String },
  matched_keyword: { type: String },
  rule_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Keyword' },
  account_id: { type: String, default: "default", index: true },
  timestamp: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false }
});
const MissedTrigger = mongoose.model("MissedTrigger", MissedTriggerSchema);

const PushSubscriptionSchema = new mongoose.Schema({
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  device_id: { type: String, default: "", index: true },
  device_name: { type: String, default: "" },
  ip_address: { type: String, default: "" },
  account_id: { type: String, default: "default", index: true },
  push_scope: { type: String, default: "current" }, // 'current' or 'all'
  last_active: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});
const PushSubscription = mongoose.model("PushSubscription", PushSubscriptionSchema);

const DeviceSessionSchema = new mongoose.Schema({
  device_id: { type: String, required: true, unique: true, index: true },
  ip_address: { type: String, default: "" },
  user_agent: { type: String, default: "" },
  device_name: { type: String, default: "Device" },
  platform: { type: String, default: "Mobile" },
  account_id: { type: String, default: "default", index: true },
  account_name: { type: String, default: "Main Profile" },
  has_push: { type: Boolean, default: false },
  endpoint: { type: String, default: "" },
  keys: {
    p256dh: { type: String, default: "" },
    auth: { type: String, default: "" }
  },
  last_active: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});
const DeviceSession = mongoose.model("DeviceSession", DeviceSessionSchema);

export function getClientIp(req: any): string {
  if (!req) return '127.0.0.1';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim().replace('::ffff:', '');
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim().replace('::ffff:', '');
  }
  const raw = req.socket?.remoteAddress || req.ip || '127.0.0.1';
  return String(raw).replace('::ffff:', '');
}

export function parseDeviceInfo(userAgent: string = '', customName: string = ''): { deviceName: string; platform: string } {
  let platform = 'Unknown';
  let browser = 'Browser';
  
  if (/android/i.test(userAgent)) platform = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) platform = 'iOS';
  else if (/windows/i.test(userAgent)) platform = 'Windows';
  else if (/macintosh|mac os x/i.test(userAgent)) platform = 'macOS';
  else if (/linux/i.test(userAgent)) platform = 'Linux';

  if (/chrome|crios/i.test(userAgent) && !/edge|opr/i.test(userAgent)) browser = 'Chrome';
  else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) browser = 'Safari';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/opera|opr/i.test(userAgent)) browser = 'Opera';

  const defaultName = `${platform} (${browser})`;
  return {
    deviceName: customName && customName.trim() ? customName.trim() : defaultName,
    platform
  };
}

export async function trackDeviceActivity(req: any, deviceIdInput?: string, accountIdInput?: string) {
  try {
    const deviceId = (deviceIdInput || req.headers?.['x-device-id'] || req.body?.deviceId || req.query?.deviceId || '') as string;
    if (!deviceId || deviceId.trim() === '') return null;

    const accountId = (accountIdInput || getAccountId(req) || 'default') as string;
    const ip = getClientIp(req);
    const ua = (req.headers?.['user-agent'] || '') as string;
    const { deviceName, platform } = parseDeviceInfo(ua, (req.headers?.['x-device-name'] || req.body?.deviceName || '') as string);

    let accountName = "Main Profile";
    if (accountId === 'default') {
      const p = await AccountProfile.findOne({ is_main: true });
      if (p?.name) accountName = p.name;
    } else {
      const p = await AccountProfile.findOne({ account_id: accountId });
      if (p?.name) accountName = p.name;
    }

    const updated = await DeviceSession.findOneAndUpdate(
      { device_id: deviceId },
      {
        device_id: deviceId,
        ip_address: ip,
        user_agent: ua,
        device_name: deviceName,
        platform: platform,
        account_id: accountId,
        account_name: accountName,
        last_active: new Date()
      },
      { upsert: true, new: true }
    );
    return updated;
  } catch (e) {
    return null;
  }
}

const ImportBatchSchema = new mongoose.Schema({
  account_id: { type: String, default: "default", index: true },
  batch_id: { type: String, required: true, index: true },
  file_name: { type: String, default: "" },
  imported_at: { type: Date, default: Date.now },
  keyword_ids: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  keyword_names: { type: [String], default: [] },
  count: { type: Number, default: 0 }
});
const ImportBatch = mongoose.model("ImportBatch", ImportBatchSchema);

const AccountProfileSchema = new mongoose.Schema({
  account_id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  avatar_color: { type: String, default: 'from-blue-600 to-indigo-600' },
  is_main: { type: Boolean, default: false },
  lock_pin: { type: String, default: '' },
  phone: { type: String, default: '' },
  telegram_name: { type: String, default: '' },
  telegram_username: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});
const AccountProfile = mongoose.model("AccountProfile", AccountProfileSchema);

// Helper functions
const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function getAccountId(req?: any): string {
  if (!req) return 'default';
  const headerId = req.headers?.['x-account-id'] as string;
  const queryId = req.query?.account_id as string;
  const bodyId = req.body?.account_id as string;
  const id = headerId || queryId || bodyId || 'default';
  return String(id).trim() || 'default';
}

export function getAccountFilter(accountId: string = 'default') {
  const acc = accountId || 'default';
  if (acc === 'default') {
    return { $or: [{ account_id: 'default' }, { account_id: { $exists: false } }, { account_id: '' }, { account_id: null }] };
  }
  return { account_id: acc };
}

let settingsCache: Record<string, Record<string, string | null>> = {};
let blockedTopicsCache: Map<string, Set<number>> = new Map();
let topicNamesCache: Record<number, string> = {};

export function isTopicBlocked(topicId: number, accountId: string = 'default'): boolean {
  const acc = accountId || 'default';
  const set = blockedTopicsCache.get(acc);
  if (set && set.has(topicId)) return true;
  if (acc !== 'default') {
    const defaultSet = blockedTopicsCache.get('default');
    if (defaultSet && defaultSet.has(topicId)) return true;
  }
  return false;
}

export function addBlockedTopicToCache(topicId: number, accountId: string = 'default') {
  const acc = accountId || 'default';
  if (!blockedTopicsCache.has(acc)) blockedTopicsCache.set(acc, new Set());
  blockedTopicsCache.get(acc)!.add(topicId);
}

export function removeBlockedTopicFromCache(topicId: number, accountId: string = 'default') {
  const acc = accountId || 'default';
  const set = blockedTopicsCache.get(acc);
  if (set) set.delete(topicId);
}

export function getCachedSetting(key: string, accountId: string = 'default'): string {
  const acc = accountId || 'default';
  let val = settingsCache[acc]?.[key];
  if (val === undefined || val === null) {
    val = settingsCache['default']?.[key] || "";
  }
  return typeof val === 'string' ? val : "";
}

export interface AccountSession {
  accountId: string;
  client: TelegramClient;
  sessionStartTime: number;
  phoneCodeHash?: string;
  phoneNumber?: string;
  loginUser?: any;
}

export const accountClients: Map<string, AccountSession> = new Map();
export const accountAuthStates: Map<string, { phoneCodeHash?: string; phoneNumber?: string; isConnecting?: boolean; client?: TelegramClient }> = new Map();

export function getAccountClient(accountId: string = 'default'): TelegramClient | null {
  const acc = accountId || 'default';
  const session = accountClients.get(acc);
  if (session?.client) return session.client;
  if (acc === 'default' && userClient) return userClient;
  return null;
}

async function refreshSettingsCache(targetAccountId?: string) {
  try {
    const settings = await Setting.find();
    settingsCache = {};
    for (const s of settings) {
      const acc = s.account_id || 'default';
      if (!settingsCache[acc]) settingsCache[acc] = {};
      settingsCache[acc][s.key] = s.value;
    }
    
    const blockedTopics = await BlockedTopic.find();
    blockedTopicsCache.clear();
    for (const bt of blockedTopics) {
      const acc = bt.account_id || 'default';
      if (!blockedTopicsCache.has(acc)) blockedTopicsCache.set(acc, new Set());
      blockedTopicsCache.get(acc)!.add(bt.telegram_topic_id);
    }
    
    const topics = await Topic.find();
    topicNamesCache = {};
    for (const t of topics) {
      topicNamesCache[t.telegram_topic_id] = t.name || '';
    }
  } catch (err) {
    console.error("Failed to refresh settings cache:", err);
  }
}

const getSetting = async (key: string, accountId: string = "default") => {
  const acc = accountId || "default";
  if (!settingsCache[acc]) settingsCache[acc] = {};
  if (settingsCache[acc].hasOwnProperty(key)) {
    return settingsCache[acc][key] === null ? null : { value: settingsCache[acc][key] };
  }
  let setting = null;
  if (acc === "default") {
    setting = await Setting.findOne({ key, ...getAccountFilter('default') });
  } else {
    setting = await Setting.findOne({ key, account_id: acc });
    if (!setting) {
      setting = await Setting.findOne({ key, ...getAccountFilter('default') });
    }
  }
  if (setting) {
    settingsCache[acc][key] = setting.value;
  } else {
    settingsCache[acc][key] = null;
  }
  return setting;
};

const setSetting = async (key: string, value: string, accountId: string = "default") => {
  const acc = accountId || "default";
  if (!settingsCache[acc]) settingsCache[acc] = {};
  settingsCache[acc][key] = value;
  
  if (acc === "default") {
    return await Setting.findOneAndUpdate(
      { key, ...getAccountFilter('default') },
      { key, value, account_id: 'default' },
      { upsert: true, new: true }
    );
  } else {
    return await Setting.findOneAndUpdate(
      { key, account_id: acc },
      { key, value, account_id: acc },
      { upsert: true, new: true }
    );
  }
};

const deleteSetting = async (key: string, accountId: string = "default") => {
  const acc = accountId || "default";
  if (settingsCache[acc]) {
    delete settingsCache[acc][key];
  }
  if (acc === "default") {
    return await Setting.deleteMany({ key, ...getAccountFilter('default') });
  } else {
    return await Setting.deleteMany({ key, account_id: acc });
  }
};

// Helper: Parse and normalize target group IDs configured in Settings
export function parseRegisteredGroups(settingValue?: string, accountId: string = "default"): { id: string; normalizedId: string; title: string }[] {
  const acc = accountId || "default";
  const raw = settingValue !== undefined ? settingValue : (
    settingsCache[acc]?.["telegram_group_ids"] || 
    settingsCache[acc]?.["target_group_id"] || 
    settingsCache['default']?.["telegram_group_ids"] || 
    settingsCache['default']?.["target_group_id"] || 
    (process.env.TELEGRAM_GROUP_ID || "")
  );
  if (!raw || !raw.trim()) return [];

  const items = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  const result: { id: string; normalizedId: string; title: string }[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    let id = "";
    let title = "";

    if (item.includes(":")) {
      const parts = item.split(":").map(p => p.trim());
      if (/-?\d+/.test(parts[1])) {
        title = parts[0];
        id = parts[1];
      } else if (/-?\d+/.test(parts[0])) {
        id = parts[0];
        title = parts[1];
      } else {
        id = parts[0];
        title = parts[1];
      }
    } else if (item.includes("(") && item.includes(")")) {
      const match = item.match(/(.+)\((.+)\)/);
      if (match) {
        const p1 = match[1].trim();
        const p2 = match[2].trim();
        if (/-?\d+/.test(p2)) {
          title = p1;
          id = p2;
        } else {
          title = p2;
          id = p1;
        }
      } else {
        id = item;
      }
    } else {
      id = item;
    }

    id = id.trim();
    if (!id) continue;

    // Handle Telegram link formats e.g. https://t.me/c/3672030592/1
    const linkMatch = id.match(/t\.me\/c\/(\d+)/);
    if (linkMatch) {
      id = "-100" + linkMatch[1];
    }

    // Normalized ID (digits only without leading minus or 100)
    const normalizedId = id.replace(/^-100|^ -100|^-/, "").trim();
    if (!normalizedId) continue;

    // Standardized full ID with -100 prefix if supergroup or - for chat
    const standardId = id.startsWith("-") ? id : (id.length >= 9 ? `-100${id}` : `-${id}`);

    if (!seen.has(normalizedId)) {
      seen.add(normalizedId);
      result.push({
        id: standardId,
        normalizedId,
        title: title && title !== standardId && title !== normalizedId ? title : standardId
      });
    }
  }

  return result;
}

const getTopicCount = async (accountId: string = "default") => await Topic.countDocuments(getAccountFilter(accountId));
const getTodayTopicCount = async (accountId: string = "default") => {
  const now = new Date();
  // Get start of today in IST (Asia/Kolkata)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIST = now.getTime() + istOffset;
  const startOfTodayIST_ms = Math.floor(nowIST / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  const startOfTodayUTC = new Date(startOfTodayIST_ms - istOffset);
  
  return await Topic.countDocuments({ created_at: { $gte: startOfTodayUTC }, ...getAccountFilter(accountId) });
};

const getTodayPhotoSentStats = async (accountId: string = "default") => {
  const now = new Date();
  // Get start of today in IST (Asia/Kolkata)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const nowIST = now.getTime() + istOffset;
  const startOfTodayIST_ms = Math.floor(nowIST / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  const startOfTodayUTC = new Date(startOfTodayIST_ms - istOffset);
  
  const logs = await PhotoSentLog.find({ sent_at: { $gte: startOfTodayUTC }, ...getAccountFilter(accountId) }).sort({ sent_at: -1 });
  return {
    count: logs.length,
    topics: logs.map(log => ({
      name: log.topic_name,
      link: log.topic_link,
      time: new Date(log.sent_at.getTime() + istOffset).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }))
  };
};

const getPast24hPhotoSentStats = async (accountId: string = "default") => {
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const istOffset = 5.5 * 60 * 60 * 1000;
  
  const logs = await PhotoSentLog.find({ sent_at: { $gte: past24h }, ...getAccountFilter(accountId) }).sort({ sent_at: -1 });
  return {
    count: logs.length,
    topics: logs.map(log => ({
      name: log.topic_name,
      link: log.topic_link,
      time: new Date(log.sent_at.getTime() + istOffset).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    }))
  };
};

const logTopic = async (topicId: number, name: string, chatIdOrDate?: string | Date, date?: Date, accountId: string = "default") => {
  try {
    let finalChatId = (accountId === 'default' ? process.env.TELEGRAM_GROUP_ID : "") || "";
    let finalDate = date || new Date();

    if (chatIdOrDate) {
      if (typeof chatIdOrDate === "string") {
        finalChatId = chatIdOrDate;
      } else if (chatIdOrDate instanceof Date) {
        finalDate = chatIdOrDate;
      }
    }

    topicNamesCache[topicId] = name;
    await Topic.findOneAndUpdate(
      { telegram_topic_id: topicId, chat_id: finalChatId, ...getAccountFilter(accountId) },
      { 
        $set: { name, account_id: accountId || 'default' },
        $setOnInsert: { created_at: finalDate }
      },
      { upsert: true }
    );
  } catch (err) {}
};

const saveLog = async (message: string, level: 'info' | 'error' | 'warn' = 'info', category: string = 'SYSTEM', route?: string, details?: any, accountId: string = "default") => {
  try {
    await Log.create({
      message,
      level,
      category,
      route,
      account_id: accountId || 'default',
      details: details ? (typeof details === 'string' ? details : JSON.stringify(details, null, 2)) : undefined
    });
  } catch (err) {
    console.error("Failed to save log to DB:", err);
  }
};

const DEFAULT_TOPIC_ICONS: Record<string, bigint> = {
  "📰": 5434144690511290129n,
  "💡": 5312536423851630001n,
  "⚡️": 5312016608254762256n,
  "🎙": 5377544228505134960n,
  "🔝": 5418085807791545980n,
  "🗣": 5370870893004203704n,
  "🆒": 5420216386448270341n,
  "❗️": 5379748062124056162n,
  "📝": 5373251851074415873n,
  "📆": 5433614043006903194n,
  "📁": 5357315181649076022n,
  "🔎": 5309965701241379366n,
  "📣": 5309984423003823246n,
  "🔥": 5312241539987020022n,
  "❤️": 5312138559556164615n,
  "❓": 5377316857231450742n,
  "📈": 5350305691942788490n,
  "📉": 5350713563512052787n,
  "💎": 5309958691854754293n,
  "💰": 5350452584119279096n,
  "💸": 5309929258443874898n,
  "🪙": 5377690785674175481n,
  "💱": 5310107765874632305n,
  "⁉️": 5377438129928020693n,
  "🎮": 5309950797704865693n,
  "💻": 5350554349074391003n,
  "📱": 5409357944619802453n,
  "🚗": 5312322066328853156n,
  "🏠": 5312486108309757006n,
  "💘": 5310029292527164639n,
  "🎉": 5310228579009699834n,
  "‼️": 5377498341074542641n,
  "🏆": 5312315739842026755n,
  "🏁": 5408906741125490282n,
  "🎬": 5368653135101310687n,
  "🎵": 5310045076531978942n,
  "🔞": 5420331611830886484n,
  "📚": 5350481781306958339n,
  "👑": 5357107601584693888n,
  "⚽️": 5375159220280762629n,
  "🏀": 5384327463629233871n,
  "📺": 5350513667144163474n,
  "👀": 5357121491508928442n,
  "🫦": 5357185426392096577n,
  "🍓": 5310157398516703416n,
  "💄": 5310262535021142850n,
  "👠": 5368741306484925109n,
  "✈️": 5348436127038579546n,
  "🧳": 5357120306097956843n,
  "🏖": 5310303848311562896n,
  "⛅️": 5350424168615649565n,
  "🦄": 5413625003218313783n,
  "🛍": 5350699789551935589n,
  "👜": 5377478880577724584n,
  "🛒": 5431492767249342908n,
  "🚂": 5350497316203668441n,
  "🛥": 5350422527938141909n,
  "🏔": 5418196338774907917n,
  "🏕": 5350648297189023928n,
  "🤖": 5309832892262654231n,
  "🪩": 5350751634102166060n,
  "🎟": 5377624166436445368n,
  "🏴‍☠️": 5386395194029515402n,
  "🗳": 5350387571199319521n,
  "🎓": 5357419403325481346n,
  "🔭": 5368585403467048206n,
  "🔬": 5377580546748588396n,
  "🎶": 5377317729109811382n,
  "🎤": 5382003830487523366n,
  "🕺": 5357298525765902091n,
  "💃": 5357370526597653193n,
  "🪖": 5357188789351490453n,
  "💼": 5348227245599105972n,
  "🧪": 5411138633765757782n,
  "👨‍👩‍👧‍👦": 5386435923204382258n,
  "👶": 5377675010259297233n,
  "🤰": 5386609083400856174n,
  "💅": 5368808634392257474n,
  "🏛": 5350548830041415279n,
  "🧮": 5355127101970194557n,
  "🖨": 5386379624773066504n,
  "👮‍♂️": 5377494501373780436n,
  "🩺": 5350307998340226571n,
  "💊": 5310094636159607472n,
  "💉": 5310139157790596888n,
  "🧼": 5377468357907849200n,
  "🪪": 5418115271267197333n,
  "🛃": 5372819184658949787n,
  "🍽": 5350344462612570293n,
  "🐟": 5384574037701696503n,
  "🎨": 5310039132297242441n,
  "🎭": 5350658016700013471n,
  "🎩": 5357504778685392027n,
  "🔮": 5350367161514732241n,
  "🍹": 5350520238444126134n,
  "🎂": 5310132165583840589n,
  "☕️": 5350392020785437399n,
  "🍣": 5350406176997646350n,
  "🍔": 5350403544182694064n,
  "🍕": 5350444672789519765n,
  "🦠": 5312424913615723286n,
  "💬": 5417915203100613993n,
  "🎄": 5312054580060625569n,
  "🎃": 5309744892677727325n,
  "✍️": 5238156910363950406n,
  "⭐️": 5235579393115438657n,
  "✅": 5237699328843200968n,
  "🎖": 5238027455754680851n,
  "🤡": 5238234236955148254n,
  "🧠": 5237889595894414384n,
  "🦮": 5237999392438371490n,
  "🐈": 5235912661102773458n
};

// Helper function for topic renaming
const handleTopicRenaming = async (client: TelegramClient, message: any, topicId: number, topicIcon: string, topicRenameEmoji: string, renameKeywordsStr: string, renameMatchMode: string, bypassKeywordCheck: boolean = false) => {
  if (!topicId) return "Unknown Topic";

  // Fetch Topic Name
  let topicName = "Unknown Topic";
  
  // 1. Try Cache
  if (topicNamesCache[topicId]) {
    topicName = topicNamesCache[topicId];
  } 
  
  // 2. Try fetching the topic creation message
  if (topicName === "Unknown Topic") {
    try {
      const messages = await client.getMessages(message.peerId, { ids: [topicId] });
      if (messages && messages.length > 0) {
        const topicMsg = messages[0];
        if (topicMsg.action && topicMsg.action instanceof Api.MessageActionTopicCreate) {
          topicName = topicMsg.action.title;
          await logTopic(topicId, topicName, topicMsg.date ? new Date(topicMsg.date * 1000) : undefined);
        }
      }
    } catch (e) {
      console.error("Failed to fetch topic info from message", e);
    }
  }

  // 3. Try fetching from Forum Topics list (most reliable for existing topics)
  if (topicName === "Unknown Topic") {
    try {
      console.log(`Fetching forum topics to find name for ${topicId}...`);
      const result = await client.invoke(
        new Api.channels.GetForumTopics({
          channel: await client.getInputEntity(message.peerId),
          q: "", // Empty query
          offsetDate: 0,
          offsetId: 0,
          offsetTopic: 0,
          limit: 100
        })
      );
      
      if (result && result.topics) {
        // Cache all topics found to avoid future lookups
        for (const t of result.topics) {
          if (t instanceof Api.ForumTopic && t.title) {
            // Update DB with found topic
            await logTopic(t.id, t.title);
            
            if (t.id === topicId) {
              topicName = t.title;
              console.log(`Found topic name via GetForumTopics: ${topicName}`);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch topic info from GetForumTopics", e);
    }
  }

  // Rename Logic
  try {
    let shouldRename = true;
    
    // If keywords are set, check if message matches (UNLESS bypassed)
    if (!bypassKeywordCheck && renameKeywordsStr.trim()) {
      const keywords = renameKeywordsStr.split(",").map(k => k.trim()).filter(k => k);
      if (keywords.length > 0) {
        // Check both message (caption) and text (if different)
        const text = (message.message || message.text || "").toLowerCase();
        let matchFound = false;
        
        for (const kw of keywords) {
          const kwLower = kw.toLowerCase();
          if (renameMatchMode === 'partial') {
            if (text.includes(kwLower)) {
              matchFound = true;
              break;
            }
          } else {
            // Exact match (word boundary)
            const regex = new RegExp(`(?<=^|[^\\p{L}\\p{N}])${escapeRegExp(kwLower)}(?=$|[^\\p{L}\\p{N}])`, 'gui');
            if (regex.test(text)) {
              matchFound = true;
              break;
            }
          }
        }
        
        if (!matchFound) {
          shouldRename = false;
          console.log(`Topic rename skipped: Message "${text}" did not match keywords [${keywords.join(", ")}] with mode ${renameMatchMode}`);
        }
      }
    }

    if (topicName === "Unknown Topic") {
       console.log(`Skipping rename for topic ${topicId}: Name is unknown`);
       shouldRename = false;
       topicName = `Topic ${topicId}`; // Use ID as fallback for return value
    }

    topicName = topicName.trim();
    const prefix = `${topicRenameEmoji}${topicRenameEmoji}`;

    if (shouldRename) {
      let newTopicName = topicName;
      let nameChanged = false;
      
      if (!topicName.startsWith(prefix)) {
        newTopicName = `${prefix} ${topicName}`;
        if (newTopicName.length > 128) {
            newTopicName = newTopicName.substring(0, 128);
        }
        nameChanged = true;
      }

      const editParams: any = {
        channel: await client.getInputEntity(message.peerId),
        topicId: topicId,
      };

      if (nameChanged) {
        editParams.title = newTopicName;
      }

      let iconChanged = false;
      console.log(`DEBUG: topicIcon: '${topicIcon}', DEFAULT_TOPIC_ICONS[topicIcon]: ${DEFAULT_TOPIC_ICONS[topicIcon]}`);
      if (DEFAULT_TOPIC_ICONS[topicIcon]) {
        editParams.iconEmojiId = DEFAULT_TOPIC_ICONS[topicIcon];
        iconChanged = true;
      } else {
        console.log(`DEBUG: Icon '${topicIcon}' not found in DEFAULT_TOPIC_ICONS`);
      }

      if (nameChanged || iconChanged) {
        console.log(`Updating topic ${topicId}. Name changed: ${nameChanged}, Icon changed: ${iconChanged}`);
        await client.invoke(
          new Api.channels.EditForumTopic(editParams)
        );
        
        if (nameChanged) {
          // Update DB
          await logTopic(topicId, newTopicName);
          await saveLog(`Renamed topic ${topicId} to "${newTopicName}"`, 'info', 'USERBOT');
        } else {
          await saveLog(`Updated topic icon for ${topicId}`, 'info', 'USERBOT');
        }
        return newTopicName;
      } else {
        console.log(`Topic ${topicId} already has prefix "${prefix}" and no icon to update. Skipping.`);
      }
    }
  } catch (renameErr: any) {
    if (renameErr.message && (renameErr.message.includes('CHAT_NOT_MODIFIED') || renameErr.message.includes('NOT_MODIFIED'))) {
      console.log(`Topic ${topicId} already has the correct name and icon. Skipping.`);
    } else {
      console.error("Failed to rename topic:", renameErr);
      await saveLog(`Failed to rename topic ${topicId}: ${renameErr.message}`, 'error', 'USERBOT');
    }
  }
  
  return topicName;
};

// SSE Clients
let sseClients: any[] = [];

// Heartbeat to keep SSE connections alive (15s interval to prevent proxy timeouts)
setInterval(() => {
  sseClients = sseClients.filter(client => {
    try {
      client.res.write(': heartbeat\n\n');
      return true;
    } catch (e) {
      return false;
    }
  });
}, 15000);
let broadcastCancelled = false;
let broadcastInProgress = false;
let broadcastStatus = {
  total: 0,
  current: 0,
  status: 'idle'
};

function sendSseEvent(type: string, data: any) {
  const payload = JSON.stringify({ type, data });
  const eventAccountId = data?.accountId || data?.account_id;

  sseClients = sseClients.filter(client => {
    // If the event is specific to an account, and the client is subscribed to a different account, skip it
    if (eventAccountId && client.accountId && client.accountId !== eventAccountId) {
      return true; // Keep client, but do not send this message
    }
    try {
      client.res.write(`data: ${payload}\n\n`);
      return true;
    } catch (e) {
      return false;
    }
  });
}

async function aiEnhancePushNotification(title: string, body: string, accountId?: string): Promise<{ title: string; body: string }> {
  try {
    const aiAutoMode = (await getSetting("ai_push_auto_mode", accountId))?.value === "true";
    if (!aiAutoMode) {
      return { title, body };
    }

    const geminiApiKeysSetting = await getSetting("gemini_api_keys", accountId) || await getSetting("gemini_api_keys");
    let apiKeys: string[] = [];
    try { apiKeys = JSON.parse(geminiApiKeysSetting?.value || "[]"); } catch (e) {}
    const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (envKey && !apiKeys.includes(envKey)) apiKeys.push(envKey);

    if (apiKeys.length === 0) {
      return { title, body };
    }

    for (const apiKey of apiKeys) {
      try {
        const genAI = new GoogleGenAI({ apiKey });
        const response = await genAI.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are an AI notification assistant for an automated Telegram bot store. Enhance and summarize this push notification to be punchy, professional, and urgent. 
Original Title: "${title}"
Original Body: "${body}"

Return JSON strictly in this format:
{
  "title": "Enhanced Punchy Title",
  "body": "Enhanced Actionable Summary Body"
}`
                }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });

        const text = response.text();
        if (text) {
          const parsed = JSON.parse(text);
          if (parsed.title && parsed.body) {
            return { title: parsed.title, body: parsed.body };
          }
        }
      } catch (err) {
        // try next key
      }
    }
  } catch (e) {
    console.error("AI Push Enhancement error:", e);
  }
  return { title, body };
}

// Helper to send push notifications to subscribers of a specific account or broadcast across all active devices
async function sendPushNotification(title: string, body: string, data: any = {}, accountId?: string) {
  try {
    const accId = accountId || 'default';
    
    // Enhance notification using AI Auto Mode if enabled
    const enhanced = await aiEnhancePushNotification(title, body, accId);
    const finalTitle = enhanced.title;
    const finalBody = enhanced.body;

    // Fetch active push subscriptions for the specific account or if scope is 'all'
    const allSubs = await PushSubscription.find({
      $or: [
        { account_id: accId },
        { push_scope: "all" }
      ]
    });
    
    // Fetch device tracking sessions to map IPs, devices, and logged-in accounts
    const allDevices = await DeviceSession.find({}).sort({ last_active: -1 });
    const deviceMap = new Map<string, any>();
    allDevices.forEach(d => {
      if (d.device_id) deviceMap.set(d.device_id, d);
      if (d.endpoint) deviceMap.set(d.endpoint, d);
    });

    // De-duplicate subscriptions by endpoint
    const uniqueMap = new Map();
    for (const sub of allSubs) {
      if (sub && sub.endpoint && sub.keys && sub.keys.p256dh && sub.keys.auth) {
        uniqueMap.set(sub.endpoint, sub);
      }
    }
    const subscriptions = Array.from(uniqueMap.values());
    
    // Always broadcast SSE event so active clients receive it instantly
    sendSseEvent('push_broadcast', {
      title: finalTitle,
      message: finalBody,
      timestamp: Date.now(),
      accountId: accId
    });

    if (subscriptions.length === 0) {
      console.log(`[Push] No subscribers registered yet in database. SSE broadcast sent.`);
      return;
    }

    // Trace which devices and IP addresses are registered and receiving this notification
    const dispatchDetails: { deviceId: string; deviceName: string; ip: string; loggedAccount: string }[] = [];
    
    subscriptions.forEach(sub => {
      const dev = (sub.device_id ? deviceMap.get(sub.device_id) : null) || deviceMap.get(sub.endpoint);
      const ip = dev?.ip_address || sub.ip_address || 'IP Traced';
      const devName = dev?.device_name || sub.device_name || 'Mobile/Browser';
      const devAcc = dev?.account_id || sub.account_id || 'default';
      const devAccName = dev?.account_name || (devAcc === 'default' ? 'Main Profile' : devAcc);
      dispatchDetails.push({
        deviceId: sub.device_id || dev?.device_id || 'Device',
        deviceName: devName,
        ip,
        loggedAccount: `${devAccName} (${devAcc})`
      });
    });

    const summaryIpList = dispatchDetails.map(d => `${d.deviceName} [IP: ${d.ip}] (Logged: ${d.loggedAccount})`).join(' | ');
    console.log(`[Push Dispatch] 🚀 Broadcasting push to ${subscriptions.length} device(s): ${summaryIpList} | Title: "${title}"`);
    
    const payload = JSON.stringify({ 
      title: finalTitle, 
      body: finalBody, 
      url: data.url || '/',
      tag: data.tag || 'botflow-alert',
      timestamp: Date.now(),
      badge: '/pwa-192x192.png',
      icon: '/pwa-192x192.png',
      data: {
        ...data,
        targetAccountId: accId
      }
    });
    
    let sentCount = 0;
    const promises = subscriptions.map(sub => {
      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth
        }
      };
      
      return webpush.sendNotification(subscription, payload, {
        TTL: 86400,
        urgency: 'high'
      }).then(() => {
        sentCount++;
        console.log(`[Push] Successfully sent push notification to device: ${sub.endpoint.substring(0, 30)}...`);
      }).catch(async (err: any) => {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) {
          // Subscription expired or no longer valid
          try {
            await PushSubscription.deleteOne({ endpoint: sub.endpoint });
            await DeviceSession.updateOne({ endpoint: sub.endpoint }, { has_push: false });
            console.log(`Deleted expired push subscription: ${sub.endpoint}`);
          } catch (delErr) {
            console.error("Error deleting expired subscription:", delErr);
          }
        } else {
          console.error(`Error sending push notification to ${sub.endpoint}:`, err ? err.message : err);
        }
      });
    });
    
    await Promise.all(promises);
    if (sentCount > 0) {
      saveLog(`Web Push: Dispatched "${title}" to ${sentCount} device(s) [${summaryIpList}]`, "info", "Push", undefined, undefined, accId).catch(() => {});
    }
  } catch (err: any) {
    console.error("Error in sendPushNotification:", err);
    saveLog(`Web Push delivery failed: ${err.message}`, "error", "Push", undefined, undefined, accountId || 'default').catch(() => {});
  }
}

async function getBotAdminChatIds(): Promise<string[]> {
  try {
    const adminDocs = await Setting.find({ key: { $regex: /^bot_admin_/ } });
    const chatIds = adminDocs.map(d => d.value).filter(Boolean);
    const customAdmin = (await getSetting("telegram_admin_id"))?.value || (await getSetting("admin_chat_id"))?.value;
    if (customAdmin && !chatIds.includes(customAdmin)) {
      chatIds.push(customAdmin);
    }
    return Array.from(new Set(chatIds));
  } catch (e) {
    return [];
  }
}

export async function sendPhotoReceivedNotification(params: {
  chatTitle: string;
  topicName: string;
  topicId: number | string;
  chatId: string;
  link: string;
  client?: any;
  accountId?: string;
}) {
  const { chatTitle, topicName, topicId, chatId, link, client, accountId = "default" } = params;
  const messageText = `📸 ${chatTitle} - ${topicName} sent a photo`;

  // 1. Web Push Notification to background app/browser (Phone Notification Panel)
  sendPushNotification("Photo Received 📷", messageText, { 
    url: link || '/',
    tag: `photo-${Date.now()}`
  }, accountId).catch(e => console.error("WebPush photo error:", e));

  // 2. Real-time SSE event for dashboard UI and sound alert
  sendSseEvent('photo_received', {
    message: messageText,
    topicName,
    groupName: chatTitle,
    chatId,
    topicId,
    accountId,
    timestamp: new Date(),
    url: link
  });

  // 3. Telegram Bot alert directly to user & admins (Bot Notification)
  if (bot) {
    try {
      const adminChats = await getBotAdminChatIds();
      
      // Auto-detect user's own Chat ID via client to ensure direct private delivery
      let ownChatId: string | null = null;
      if (client) {
        try {
          const me = await client.getMe().catch(() => null);
          if (me && me.id) {
            ownChatId = me.id.toString();
          }
        } catch (e) {}
      }

      const cleanChatId = (chatId || "").toString().replace(/^-100|^ -100|^-/, "").trim();
      const topicLink = link || (topicId ? `https://t.me/c/${cleanChatId}/${topicId}` : `https://t.me/c/${cleanChatId}`);
      const botAlertText = `📸 <b>New Photo Received!</b>\n\n` +
        `• <b>Group:</b> ${escapeHtml(chatTitle)}\n` +
        `• <b>Topic:</b> ${escapeHtml(topicName)} (ID: <code>${topicId || 'General'}</code>)`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "🔗 Open Topic", url: topicLink },
            ...(topicId ? [{ text: "🚫 Block Topic", callback_data: `block_topic_${topicId}` }] : [])
          ]
        ]
      };

      const targetChats = new Set(adminChats);
      if (ownChatId) {
        targetChats.add(ownChatId);
      }

      for (const targetChat of targetChats) {
        if (!targetChat) continue;
        await bot.sendMessage(targetChat, botAlertText, { parse_mode: 'HTML', reply_markup: replyMarkup })
          .catch(async (e) => {
            console.warn(`[NOTIFY] HTML Bot photo send failed to ${targetChat}, sending plain:`, e.message);
            const plainText = `📸 New Photo Received!\nGroup: ${chatTitle}\nTopic: ${topicName}`;
            await bot.sendMessage(targetChat, plainText, { reply_markup: replyMarkup }).catch(() => {});
          });
      }
    } catch (botErr: any) {
      console.error("[NOTIFY] Failed to send Bot admin photo notification:", botErr.message);
    }
  }

  // 4. Save log
  saveLog(`Photo received from ${chatTitle} - ${topicName}`, 'info', 'USERBOT', undefined, { topicId, url: link }, accountId).catch(() => {});
}

export async function sendKeywordHitNotification(params: {
  matchedWord: string;
  topicName: string;
  topicId: string;
  chatTitle: string;
  chatId: string;
  userMessage: string;
  client?: any;
  accountId?: string;
}) {
  const { matchedWord, topicName, topicId, chatTitle, chatId, userMessage, client, accountId = "default" } = params;
  const cleanChatId = (chatId || "").toString().replace(/^-100|^ -100|^-/, "").trim();
  const topicLink = topicId ? `https://t.me/c/${cleanChatId}/${topicId}` : `https://t.me/c/${cleanChatId}`;
  const notifyBody = `Matched "${matchedWord}" in "${topicName}" (${chatTitle})`;

  // 1. Web Push Notification directly to user's phone Notification Panel
  const pushTitle = `🎯 ${topicName || 'General'} - Keyword Hit!`;
  const pushBody = `Keyword: "${matchedWord}"\nGroup: ${chatTitle}${userMessage ? `\n"${userMessage.length > 60 ? userMessage.substring(0, 60) + '...' : userMessage}"` : ''}`;

  sendPushNotification(pushTitle, pushBody, { 
    url: topicLink || '/',
    tag: `keyword-${Date.now()}`
  }, accountId).catch(e => console.error("WebPush error:", e));

  // 2. Real-time SSE event for dashboard UI
  sendSseEvent('keyword_hit_notify', {
    message: notifyBody,
    topicName,
    topicId,
    groupName: chatTitle,
    chatId,
    keyword: matchedWord,
    userMessage,
    accountId
  });

  // 3. Telegram Bot alert directly to user & admins (Bot Notification)
  if (bot) {
    try {
      const adminChats = await getBotAdminChatIds();

      // Auto-detect user's own Chat ID via client to ensure direct private delivery
      let ownChatId: string | null = null;
      if (client) {
        try {
          const me = await client.getMe().catch(() => null);
          if (me && me.id) {
            ownChatId = me.id.toString();
          }
        } catch (e) {}
      }

      const botAlertText = `🎯 <b>Keyword Hit Alert!</b>\n\n` +
        `• <b>Keyword:</b> <code>${escapeHtml(matchedWord)}</code>\n` +
        `• <b>Topic:</b> ${escapeHtml(topicName)} (ID: <code>${topicId || 'General'}</code>)\n` +
        `• <b>Group:</b> ${escapeHtml(chatTitle)}\n` +
        `• <b>Message:</b> "${escapeHtml(userMessage || '')}"`;

      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "🔗 Open Topic / Message", url: topicLink },
            ...(topicId ? [{ text: "🚫 Block Topic", callback_data: `block_topic_${topicId}` }] : [])
          ]
        ]
      };

      const targetChats = new Set(adminChats);
      if (ownChatId) {
        targetChats.add(ownChatId);
      }

      for (const targetChat of targetChats) {
        if (!targetChat) continue;
        await bot.sendMessage(targetChat, botAlertText, { parse_mode: 'HTML', reply_markup: replyMarkup })
          .catch(async (e) => {
            console.warn(`[NOTIFY] HTML Bot keyword send failed to ${targetChat}, sending plain:`, e.message);
            const plainText = `🎯 Keyword Hit Alert!\nKeyword: ${matchedWord}\nTopic: ${topicName}\nGroup: ${chatTitle}\nMessage: ${userMessage || ''}`;
            await bot.sendMessage(targetChat, plainText, { reply_markup: replyMarkup }).catch(() => {});
          });
      }
    } catch (botErr: any) {
      console.error("[NOTIFY] Failed to send Bot admin notification:", botErr.message);
    }
  }

  // 4. Save persistent log
  saveLog(`🔔 Keyword Trigger Notification: "${matchedWord}" in ${chatTitle} > ${topicName}`, 'info', 'USERBOT', undefined, {
    matchedWord,
    topicName,
    topicId,
    group: chatTitle,
    chatId,
    userMessage
  }, accountId).catch(() => {});
}

// Helper to check keyword reply count per topic per rule
export async function getKeywordReplyCount(
  topicId: number | string,
  chatId: string,
  keywordId: any,
  accountId: string = "default",
  autoResetEnabled: boolean = true
): Promise<number> {
  try {
    const numTopicId = Number(topicId);
    if (!numTopicId || isNaN(numTopicId)) return 0;
    
    const normChat = chatId ? chatId.toString().replace(/^-100|^ -100|^-/, "").trim() : "";
    const chatFilter = normChat ? { $in: [chatId, normChat, `-100${normChat}`] } : chatId;

    const history = await ReplyHistory.findOne({
      topic_id: numTopicId,
      chat_id: chatFilter,
      keyword_id: keywordId,
      ...getAccountFilter(accountId)
    });

    if (!history) return 0;

    const lastUpdated = new Date(history.last_updated);
    const today = new Date();
    const lastUpdatedIST = lastUpdated.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
    const todayIST = today.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

    if (lastUpdatedIST === todayIST || !autoResetEnabled) {
      return history.count || 0;
    } else {
      return 0; // New day, count resets to 0
    }
  } catch (err: any) {
    console.error("Error in getKeywordReplyCount:", err.message);
    return 0;
  }
}

// Helper to increment keyword reply count per topic per rule
export async function incrementKeywordReplyCount(
  topicId: number | string,
  chatId: string,
  keywordId: any,
  accountId: string = "default",
  autoResetEnabled: boolean = true
): Promise<void> {
  try {
    const numTopicId = Number(topicId);
    if (!numTopicId || isNaN(numTopicId)) return;

    const today = new Date();
    const normChat = chatId ? chatId.toString().replace(/^-100|^ -100|^-/, "").trim() : "";
    const chatFilter = normChat ? { $in: [chatId, normChat, `-100${normChat}`] } : chatId;

    const history = await ReplyHistory.findOne({
      topic_id: numTopicId,
      chat_id: chatFilter,
      keyword_id: keywordId,
      ...getAccountFilter(accountId)
    });

    if (!history) {
      await ReplyHistory.create({
        topic_id: numTopicId,
        chat_id: chatId || "",
        keyword_id: keywordId,
        count: 1,
        last_updated: today,
        account_id: accountId || 'default'
      });
    } else {
      const lastUpdated = new Date(history.last_updated);
      const lastUpdatedIST = lastUpdated.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
      const todayIST = today.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });

      if (lastUpdatedIST === todayIST || !autoResetEnabled) {
        history.count = (history.count || 0) + 1;
      } else {
        history.count = 1;
      }
      history.last_updated = today;
      history.chat_id = chatId || history.chat_id;
      await history.save();
    }
  } catch (err: any) {
    console.error("Error in incrementKeywordReplyCount:", err.message);
  }
}


// Initialize default settings
async function initSettings() {
  const appLogo = (await getSetting("app_logo"))?.value || "";
  const autoReply = await getSetting("auto_reply");
  if (!autoReply) await setSetting("auto_reply", "Welcome to the new topic!");
  
  const delay = await getSetting("delay_seconds");
  if (!delay) await setSetting("delay_seconds", "0");

  const keywordDelay = await getSetting("keyword_delay_seconds");
  if (!keywordDelay) await setSetting("keyword_delay_seconds", "0");
  
  const photoReplyEnabled = await getSetting("photo_reply_enabled");
  if (!photoReplyEnabled) await setSetting("photo_reply_enabled", "false");

  const photoReplyMessage = await getSetting("photo_reply_message");
  if (!photoReplyMessage) await setSetting("photo_reply_message", "ok wait");

  const photoReplyMax = await getSetting("photo_reply_max");
  if (!photoReplyMax) await setSetting("photo_reply_max", "2");

  const notificationSoundEnabled = await getSetting("notification_sound_enabled");
  if (!notificationSoundEnabled) await setSetting("notification_sound_enabled", "true");

  const notificationSoundType = await getSetting("notification_sound_type");
  if (!notificationSoundType) await setSetting("notification_sound_type", "default");

  const topicIcon = await getSetting("topic_icon");
  if (!topicIcon) await setSetting("topic_icon", "✅");

  const topicRenameEmoji = await getSetting("topic_rename_emoji");
  if (!topicRenameEmoji) await setSetting("topic_rename_emoji", "🛑");

  const aiModeEnabled = await getSetting("ai_mode_enabled");
  if (!aiModeEnabled) await setSetting("ai_mode_enabled", "false");

  const aiPersona = await getSetting("ai_persona");
  if (!aiPersona) {
    await setSetting("ai_persona", DEFAULT_AI_PERSONA);
  } else {
    // Optional: Update legacy default to new default if it matches the old generic one
    const oldDefault = "You are a helpful assistant. Reply in Hinglish, Hindi, or English. Be casual and friendly. If the message doesn't require a response, reply with 'NO_REPLY'.";
    if (aiPersona.value === oldDefault) {
      await setSetting("ai_persona", DEFAULT_AI_PERSONA);
      console.log("Updated AI Persona to new sales context.");
    }
  }

  const geminiApiKeys = await getSetting("gemini_api_keys");
  if (!geminiApiKeys) {
    await setSetting("gemini_api_keys", JSON.stringify([]));
    console.log("Gemini API Keys setting initialized.");
  }

  const apiId = await getSetting("api_id");
  if (!apiId || apiId.value === "0" || apiId.value === "") {
    await setSetting("api_id", "34669075");
    console.log("Default API ID set.");
  }
  
  const apiHash = await getSetting("api_hash");
  if (!apiHash || apiHash.value === "") {
    await setSetting("api_hash", "b0f0ffda80d58bea235b2d232fbcbc79");
    console.log("Default API Hash set.");
  }

  const defaultPhone = await getSetting("default_phone");
  if (!defaultPhone) {
    await setSetting("default_phone", "+919006334503");
    console.log("Default Phone set.");
  }
  
  const systemPaused = await getSetting("system_paused");
  if (!systemPaused) {
    await setSetting("system_paused", "false");
    console.log("System Paused setting initialized.");
  }

  const autoResetKeywords = await getSetting("auto_reset_keywords");
  if (!autoResetKeywords) {
    await setSetting("auto_reset_keywords", "true");
    console.log("Auto Reset Keywords setting initialized.");
  }

  const autoBlockKeywords = await getSetting("auto_block_keywords");
  if (!autoBlockKeywords) {
    await setSetting("auto_block_keywords", JSON.stringify([]));
    console.log("Auto Block Keywords setting initialized.");
  }

  const autoBlockMatchMode = await getSetting("auto_block_match_mode");
  if (!autoBlockMatchMode) {
    await setSetting("auto_block_match_mode", "partial");
    console.log("Auto Block Match Mode setting initialized.");
  }

  const telegramGroupIds = await getSetting("telegram_group_ids");
  if (!telegramGroupIds) {
    await setSetting("telegram_group_ids", process.env.TELEGRAM_GROUP_ID || "");
    console.log("Telegram Group IDs setting initialized.");
  }

  const telegramBotToken = await getSetting("telegram_bot_token");
  if (!telegramBotToken && process.env.TELEGRAM_BOT_TOKEN) {
    await setSetting("telegram_bot_token", process.env.TELEGRAM_BOT_TOKEN);
    console.log("Telegram Bot Token setting initialized from ENV.");
  }

  const globalApprovalMode = await getSetting("global_approval_mode");
  if (!globalApprovalMode) {
    await setSetting("global_approval_mode", "false");
    console.log("Global Approval Mode initialized.");
  }
}

let userClient: TelegramClient | null = null;
let lastAuthCheck = 0;
let cachedAuthStatus = false;
let sessionStartTime: number | null = null;
let isConnecting = false;
let cancelCatchupFlag = false;
let phoneCodeHash: string | null = null;
let phoneNumber: string | null = null;
let cachedKeywords: any[] = [];
let lastKeywordRefresh = 0;

async function refreshKeywordCache() {
  try {
    cachedKeywords = await Keyword.find({ enabled: { $ne: false } });
    lastKeywordRefresh = Date.now();
    console.log(`Keyword cache refreshed: ${cachedKeywords.length} active keywords.`);
  } catch (err) {
    console.error("Failed to refresh keyword cache:", err);
  }
}

async function getCachedAccountKeywords(accountId: string = "default") {
  const now = Date.now();
  if (cachedKeywords.length === 0 || now - lastKeywordRefresh > 15000) {
    await refreshKeywordCache();
  }
  const acc = accountId || "default";
  return cachedKeywords.filter(k => (k.account_id || "default") === acc && k.enabled !== false);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  const PORT = 3000;

  // Health check endpoint - MUST be early
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // Push notification endpoints (Support both standard and legacy endpoints)
  const serveVapidKey = async (req: express.Request, res: express.Response) => {
    if (!vapidPublicKey || !vapidPrivateKey) {
      await setupVapid();
    }
    console.log(`[Push] Serving VAPID public key: ${vapidPublicKey ? vapidPublicKey.substring(0, 10) + "..." : "NULL"}`);
    res.json({ publicKey: vapidPublicKey });
  };
  app.get("/api/vapidPublicKey", serveVapidKey);
  app.get("/api/vapid-public-key", serveVapidKey);
  app.get("/api/push/vapid-public-key", serveVapidKey);
  app.get("/api/push/vapidPublicKey", serveVapidKey);

  const handlePushSubscription = async (req: express.Request, res: express.Response) => {
    try {
      const subscription = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: "Invalid subscription payload" });
      }
      const accountId = (getAccountId(req) || req.headers['x-account-id'] || 'default') as string;
      const deviceId = (req.headers['x-device-id'] || req.body.deviceId || '') as string;
      const deviceName = (req.headers['x-device-name'] || req.body.deviceName || '') as string;
      const pushScope = (req.headers['x-push-scope'] || req.body.pushScope || 'current') as string;
      const ip = getClientIp(req);
      const ua = (req.headers['user-agent'] || '') as string;
      const { platform } = parseDeviceInfo(ua, deviceName);

      console.log(`[Push] Registering device subscription for ${subscription.endpoint.substring(0, 45)}... (account: ${accountId}, device: ${deviceId || 'browser'}, scope: ${pushScope}, ip: ${ip})`);
      
      await PushSubscription.findOneAndUpdate(
        { endpoint: subscription.endpoint },
        { 
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          account_id: accountId,
          device_id: deviceId,
          device_name: deviceName,
          ip_address: ip,
          push_scope: pushScope,
          last_active: new Date()
        },
        { upsert: true, new: true }
      );

      if (deviceId) {
        let accountName = "Main Profile";
        if (accountId !== 'default') {
          const p = await AccountProfile.findOne({ account_id: accountId });
          if (p?.name) accountName = p.name;
        } else {
          const p = await AccountProfile.findOne({ is_main: true });
          if (p?.name) accountName = p.name;
        }

        await DeviceSession.findOneAndUpdate(
          { device_id: deviceId },
          {
            device_id: deviceId,
            ip_address: ip,
            user_agent: ua,
            device_name: deviceName || `${platform} Device`,
            platform: platform,
            account_id: accountId,
            account_name: accountName,
            has_push: true,
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            last_active: new Date()
          },
          { upsert: true, new: true }
        );
      }

      res.status(201).json({ status: "success", subscribed: true, account_id: accountId, ip_address: ip });
    } catch (err: any) {
      console.error("[Push] Error in subscribe handler:", err);
      res.status(500).json({ error: err.message });
    }
  };
  app.post("/api/subscribe", handlePushSubscription);
  app.post("/api/push/subscribe", handlePushSubscription);

  // Device heartbeat & tracking endpoints
  const handleDevicePing = async (req: express.Request, res: express.Response) => {
    try {
      const deviceId = (req.headers['x-device-id'] || req.body?.deviceId || req.query?.deviceId || '') as string;
      const accountId = (getAccountId(req) || req.headers['x-account-id'] || 'default') as string;
      const tracked = await trackDeviceActivity(req, deviceId, accountId);
      const ip = getClientIp(req);
      res.json({ success: true, device: tracked, ip_address: ip, deviceId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
  app.post("/api/devices/ping", handleDevicePing);
  app.post("/api/device/heartbeat", handleDevicePing);

  // Get all registered / active devices with IP, login state and push readiness
  app.get("/api/devices", async (req, res) => {
    try {
      const currentIp = getClientIp(req);
      const currentDeviceId = (req.headers['x-device-id'] || req.query.deviceId || '') as string;
      
      const devices = await DeviceSession.find({}).sort({ last_active: -1 });
      const subs = await PushSubscription.find({});
      const subEndpointMap = new Set(subs.map(s => s.endpoint));
      const subDeviceMap = new Set(subs.map(s => s.device_id).filter(Boolean));

      const now = Date.now();
      const mapped = devices.map(d => {
        const diffSec = Math.round((now - new Date(d.last_active).getTime()) / 1000);
        const isOnline = diffSec < 180; // Active within last 3 minutes
        const hasActivePush = (d.endpoint && subEndpointMap.has(d.endpoint)) || (d.device_id && subDeviceMap.has(d.device_id));
        return {
          id: d.device_id,
          deviceId: d.device_id,
          ip: d.ip_address || "127.0.0.1",
          deviceName: d.device_name || "Unknown Device",
          platform: d.platform || "Mobile",
          accountId: d.account_id || "default",
          accountName: d.account_name || "Main Profile",
          hasPush: Boolean(hasActivePush),
          isCurrent: Boolean(d.device_id && d.device_id === currentDeviceId) || (Boolean(currentIp) && d.ip_address === currentIp),
          isOnline,
          lastActive: d.last_active,
          createdAt: d.created_at
        };
      });

      res.json({
        devices: mapped,
        currentIp,
        currentDeviceId,
        totalDevices: mapped.length,
        onlineCount: mapped.filter(m => m.isOnline).length,
        pushCount: mapped.filter(m => m.hasPush).length
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove / disconnect a device
  app.delete("/api/devices/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await DeviceSession.deleteOne({ device_id: id });
      await PushSubscription.deleteMany({ device_id: id });
      res.json({ success: true, message: `Device ${id} removed` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Blind push broadcast to all logged in / open devices or targeted device
  const handlePushDispatch = async (req: express.Request, res: express.Response) => {
    try {
      const accountId = (getAccountId(req) || req.headers['x-account-id'] || 'default') as string;
      const title = req.body?.title || "⚡ Blind Push Broadcast";
      const body = req.body?.body || `Notification pushed to all active devices and sessions!`;
      const targetDeviceId = req.body?.targetDeviceId;
      const targetIp = req.body?.targetIp;

      // 1. Fetch devices for the specific account to show transparency
      const allDevices = await DeviceSession.find({ account_id: accountId }).sort({ last_active: -1 });
      const targetDevices = allDevices.filter(d => {
        if (targetDeviceId) return d.device_id === targetDeviceId;
        if (targetIp) return d.ip_address === targetIp;
        return true;
      });

      // 2. Dispatch Push
      await sendPushNotification(title, body, { url: '/', tag: `push-${Date.now()}` }, accountId);

      // 3. Emit SSE Event so all open web browsers receive in-app notification immediately
      sendSseEvent('push_broadcast', {
        title,
        message: body,
        targetDeviceId,
        timestamp: new Date()
      });

      // 4. Save notification log so it appears immediately in the notifications list
      const summaryList = targetDevices.map(d => `${d.device_name || 'Device'} (IP: ${d.ip_address || '127.0.0.1'})`).join(', ');
      await saveLog(`Push Broadcast: "${title}" sent to ${targetDevices.length} device(s) [${summaryList || 'All Sessions'}]`, 'info', 'Push', '/api/push/test', { title, body, devices: summaryList }, accountId);

      res.json({
        success: true,
        message: `Push successfully dispatched to ${targetDevices.length} device(s)!`,
        deliveredCount: targetDevices.length,
        devices: targetDevices.map(d => ({
          deviceId: d.device_id,
          deviceName: d.device_name,
          ip: d.ip_address,
          accountName: d.account_name
        }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.post("/api/push/test", handlePushDispatch);
  app.post("/api/push/blind-broadcast", handlePushDispatch);
  app.post("/api/push/direct", handlePushDispatch);

  app.get("/api/push/status", async (req, res) => {
    try {
      const accountId = (getAccountId(req) || req.headers['x-account-id'] || 'default') as string;
      const count = await PushSubscription.countDocuments();
      const accountCount = await PushSubscription.countDocuments({ account_id: accountId });
      const deviceCount = await DeviceSession.countDocuments();
      res.json({
        totalDevices: count,
        accountDevices: accountCount,
        trackedDevices: deviceCount,
        vapidConfigured: Boolean(vapidPublicKey && vapidPrivateKey)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/push/ai-auto-mode", async (req, res) => {
    try {
      const accountId = (getAccountId(req) || req.headers['x-account-id'] || 'default') as string;
      const setting = await getSetting("ai_push_auto_mode", accountId);
      res.json({ enabled: setting?.value === "true" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/ai-auto-mode", async (req, res) => {
    try {
      const accountId = (getAccountId(req) || req.headers['x-account-id'] || 'default') as string;
      const { enabled } = req.body;
      await setSetting("ai_push_auto_mode", enabled ? "true" : "false", accountId);
      res.json({ success: true, enabled: Boolean(enabled) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/heartbeat", (req, res) => {
    res.json({
      status: "online",
      timestamp: Date.now(),
      service: "24x7 Telegram Bot & Push Dispatcher"
    });
  });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;

  if (!token || !groupId) {
    console.error("TELEGRAM_BOT_TOKEN or TELEGRAM_GROUP_ID is not defined in environment variables.");
    // We don't exit here to allow the server to start for other features, but bot won't work
  }

  const startApp = () => {
    app.listen(PORT, "0.0.0.0", async () => {
      console.log(`Server running on http://localhost:${PORT}`);
      
      // Initial keyword cache load
      await refreshKeywordCache();
      
      // Initialize Telegram Bot after server is up
      let botToken = (await getSetting("telegram_bot_token"))?.value || process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) {
        await initBot(botToken);
      }
      
      // Background Engine: Verify and connect all authorized UserBots and active account
      setTimeout(() => {
        verifyAndConnectAllUserBots().catch(e => console.error("Initial verifyAndConnectAllUserBots failed:", e));
      }, 1000);
    });
  };

  // Initialize bot variable
  let bot: TelegramBot | null = null;

  // Connect to MongoDB with timeout
  mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  })
    .then(async () => {
      console.log("Connected to MongoDB");
      // Safely drop old non-group indexing constraints to migrate to multi-group setups
      try {
        await mongoose.connection.collection("topics").dropIndex("telegram_topic_id_1").catch(() => {});
        await mongoose.connection.collection("replyhistories").dropIndex("topic_id_1_keyword_id_1").catch(() => {});
        await mongoose.connection.collection("photoreplyhistories").dropIndex("topic_id_1").catch(() => {});
        await mongoose.connection.collection("settings").dropIndex("key_1").catch(() => {});
        await mongoose.connection.collection("settings").dropIndex("key_1_profile_1").catch(() => {});
        await mongoose.connection.collection("settings").updateMany({ account_id: { $exists: false } }, { $set: { account_id: "default" } }).catch(() => {});
        await mongoose.connection.collection("settings").updateMany({ account_id: null }, { $set: { account_id: "default" } }).catch(() => {});
        console.log("Old indexes checked and dropped if existed.");
      } catch (idxErr) {
        console.error("Index cleanup error:", idxErr);
      }
      await refreshSettingsCache();
      await initSettings();
      await setupVapid();
      startApp();
    })
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      // Start app anyway to allow health check
      startApp();
    });

  function setupUserBotHandlers(client: TelegramClient, targetGroupId: string, accountId: string = "default") {
    if ((client as any)._botflowHandlerAttached) {
      return;
    }
    (client as any)._botflowHandlerAttached = true;

    client.addEventHandler(async (event: any) => {
      try {
        const message = event.message;
        if (!message) return;
        
        // Ignore edited messages to prevent duplicate processing
        if (message.editDate) return;

      // Fast ID extraction
      let chatId: string = "";
      if (message.peerId) {
        if (message.peerId.channelId) chatId = "-100" + message.peerId.channelId.toString();
        else if (message.peerId.chatId) chatId = "-" + message.peerId.chatId.toString();
        else if (message.peerId.userId) chatId = message.peerId.userId.toString();
      }

      // Check target group IDs - strictly restricted to Settings
      const registered = parseRegisteredGroups(undefined, accountId);
      const allowedGroupIds = registered.map(r => r.normalizedId);
      if (targetGroupId && targetGroupId.trim()) {
        const normTarget = targetGroupId.toString().trim().replace(/^-100|^ -100|^-/, "");
        if (normTarget && !allowedGroupIds.includes(normTarget)) {
          allowedGroupIds.push(normTarget);
        }
      }
      const normalizedChatId = chatId.toString().trim().replace(/^-100|^ -100|^-/, "");
      
      if (allowedGroupIds.length === 0 || !allowedGroupIds.includes(normalizedChatId)) {
        return;
      }

      // Check if system is paused
      const isSystemPaused = (await getSetting("system_paused", accountId))?.value === "true";
      
      console.log(`UserBot (${accountId}) processing message in ${chatId}: "${message.message || '[No text]'}"`);

      // Check if topic is blocked
      const replyToId = message.replyTo?.replyToMsgId;
      const replyToTopId = message.replyTo?.replyToTopId;
      const messageId = message.id;
      
      let forumTopicId: number;
      if (message.action instanceof Api.MessageActionTopicCreate) {
        forumTopicId = Number(messageId);
      } else if (message.replyTo) {
        if (message.replyTo.replyToTopId) {
          forumTopicId = Number(message.replyTo.replyToTopId);
        } else if (message.replyTo.forumTopic) {
          forumTopicId = Number(replyToId || 1);
        } else {
          forumTopicId = 1;
        }
      } else {
        forumTopicId = 1;
      }

      // Check if the topic ID is blocked
      if (forumTopicId) {
        const isBlocked = isTopicBlocked(forumTopicId, accountId);
        if (isBlocked) {
          console.log(`Topic ${forumTopicId} is blocked for account ${accountId}. Skipping processing.`);
          await saveLog(`Message ignored: Topic ${forumTopicId} is blocked.`, 'info', 'SYSTEM', undefined, { topicId: forumTopicId }, accountId);
          return;
        }
      }

      const topicId = forumTopicId;
      const replyInGeneral = (await getSetting("reply_in_general", accountId))?.value === "true";
      const replyTo = replyInGeneral ? undefined : messageId;

      // Check keyword reset logic
      const autoResetEnabled = (await getSetting("auto_reset_keywords", accountId))?.value === "true";

      // Auto-Block Keywords Logic
      const autoBlockKeywordsStr = (await getSetting("auto_block_keywords", accountId))?.value || "[]";
      let blockKeywords: { keyword: string, matchMode: 'exact' | 'partial' }[] = [];
      try {
        blockKeywords = JSON.parse(autoBlockKeywordsStr);
      } catch (e) {
        if (autoBlockKeywordsStr.trim()) {
          blockKeywords = autoBlockKeywordsStr.split(",").map(k => ({ keyword: k.trim(), matchMode: 'partial' as const })).filter(k => k.keyword);
        }
      }

      if (blockKeywords.length > 0 && message.message && !message.out) {
        const msgText = message.message.toLowerCase();
        let shouldBlock = false;
        let matchedKeyword = "";

        for (const item of blockKeywords) {
          const kw = item.keyword.toLowerCase();
          if (item.matchMode === 'exact') {
            if (msgText === kw) {
              shouldBlock = true;
              matchedKeyword = item.keyword;
              break;
            }
          } else {
            if (msgText.includes(kw)) {
              shouldBlock = true;
              matchedKeyword = item.keyword;
              break;
            }
          }
        }

        if (shouldBlock) {
          console.log(`Auto-blocking topic ${topicId} due to keyword match: "${matchedKeyword}" for account ${accountId}`);
          
          const name = topicNamesCache[topicId] || "Unknown Topic";
          const link = `https://t.me/c/${targetGroupId.replace("-100", "")}/${topicId}`;

          await BlockedTopic.findOneAndUpdate(
            { telegram_topic_id: topicId, ...getAccountFilter(accountId) },
            { name, link, account_id: accountId || 'default' },
            { upsert: true }
          );
          addBlockedTopicToCache(topicId, accountId);

          await saveLog(`Topic ${topicId} auto-blocked due to keyword match: "${matchedKeyword}"`, 'warn', 'USERBOT', undefined, { topicName: name, link, keyword: matchedKeyword }, accountId);
          
          sendSseEvent('topic_blocked', {
            message: `Topic "${name}" auto-blocked (Keyword: ${matchedKeyword})`,
            topicName: name,
            keyword: matchedKeyword,
            accountId,
            timestamp: new Date()
          });

          sendPushNotification("Topic Auto-Blocked 🛑", `Topic "${name}" was auto-blocked by keyword "${matchedKeyword}"`, {
            url: link || '/',
            tag: `block-${topicId}`
          }, accountId).catch(e => console.error("WebPush block error:", e));

          if (bot) {
            getBotAdminChatIds().then(adminChats => {
              const blockMsg = `🛑 <b>Topic Auto-Blocked Alert!</b>\n\n• <b>Topic:</b> ${escapeHtml(name)}\n• <b>Trigger Keyword:</b> <code>${escapeHtml(matchedKeyword)}</code>`;
              const replyMarkup = {
                inline_keyboard: [
                  [{ text: "🔓 Unblock Topic", callback_data: `unblock_topic_${topicId}` }]
                ]
              };
              for (const adminChat of adminChats) {
                bot.sendMessage(adminChat, blockMsg, { parse_mode: 'HTML', reply_markup: replyMarkup }).catch(() => {});
              }
            }).catch(() => {});
          }

          return;
        }
      }

      // 0. Photo Handler
      const isPhotoMedia = Boolean(
        !message.out &&
        message.media && (
          message.media.photo || 
          message.photo ||
          message.media.className === 'MessageMediaPhoto' ||
          message.media.className === 'MessageMediaDocument' ||
          (message.media.document && message.media.document.mimeType && message.media.document.mimeType.startsWith('image/')) ||
          (message.document && message.document.mimeType && message.document.mimeType.startsWith('image/')) ||
          (message.media.constructor && message.media.constructor.name && message.media.constructor.name.includes('Photo'))
        )
      );

      if (isPhotoMedia) {
        const photoReplyEnabledSetting = (await getSetting("photo_reply_enabled", accountId))?.value === "true";
        
        try {
          const topicIcon = (await getSetting("topic_icon", accountId))?.value || "✅";
          const topicRenameEmoji = (await getSetting("topic_rename_emoji", accountId))?.value || "🛑";
          const renameKeywordsStr = (await getSetting("topic_rename_keywords", accountId))?.value || "";
          const renameMatchMode = (await getSetting("topic_rename_match_mode", accountId))?.value || "exact";

          let topicName = topicNamesCache[topicId] || `Topic #${topicId || 'General'}`;
          try {
            topicName = await handleTopicRenaming(client, message, topicId, topicIcon, topicRenameEmoji, renameKeywordsStr, renameMatchMode, true);
          } catch (renErr) {
            console.warn("Topic renaming non-fatal warning in photo handler:", renErr);
          }
          
          let chatTitle = topicNamesCache[chatId] || topicNamesCache[targetGroupId] || "Telegram Group";
          try {
            const chat = await client.getEntity(message.peerId) as any;
            if (chat && chat.title) chatTitle = chat.title;
          } catch (e) {}
          
          const cleanGroupId = (chatId || targetGroupId || "").toString().replace(/^-100|^ -100|^-/, "").trim();
          const link = topicId 
            ? `https://t.me/c/${cleanGroupId}/${topicId}`
            : `https://t.me/c/${cleanGroupId}`;
          
          console.log(`[PHOTO] Photo detected in group: ${chatTitle}, topic: ${topicName} (${topicId}), link: ${link}`);
          
          // Send multi-channel notifications (Web Push notification, UI SSE event, Bot Admin alert)
          sendPhotoReceivedNotification({
            chatTitle,
            topicName,
            topicId,
            chatId: String(chatId),
            link,
            client,
            accountId
          }).catch(err => console.error("Error in sendPhotoReceivedNotification:", err));

          PhotoSentLog.create({
            topic_id: topicId,
            topic_name: topicName,
            topic_link: link,
            sent_at: new Date(),
            account_id: accountId || 'default'
          }).catch(() => {});
          
          sendSseEvent('photo_sent', {
            topicName: topicName,
            accountId,
            timestamp: new Date()
          });

          if (photoReplyEnabledSetting) {
            const photoReplyMax = parseInt((await getSetting("photo_reply_max", accountId))?.value || "2", 10);

            let history = await PhotoReplyHistory.findOne({ topic_id: topicId, chat_id: chatId, ...getAccountFilter(accountId) });
            
            if (history && autoResetEnabled) {
              const lastUpdated = new Date(history.last_updated);
              const today = new Date();
              const lastUpdatedIST = lastUpdated.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
              const todayIST = today.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
              
              if (lastUpdatedIST !== todayIST) {
                console.log(`Resetting photo reply count for topic ${topicId} in chat ${chatId} (New Day)`);
                history.count = 0;
                history.last_updated = today;
                await history.save();
              }
            }

            if (history && history.count >= photoReplyMax) {
              console.log(`Photo reply limit reached for topic ${topicId} in chat ${chatId} (${history.count}/${photoReplyMax}). Skipping.`);
            } else {
              const photoReplyMessage = (await getSetting("photo_reply_message", accountId))?.value || "ok wait";
              const photoReplyMessage2Enabled = (await getSetting("photo_reply_message_2_enabled", accountId))?.value === "true";
              const photoReplyMessage2 = (await getSetting("photo_reply_message_2", accountId))?.value || "second message";
              
              console.log(`[PHOTO REPLY] Sending Global Photo Auto-Reply: "${photoReplyMessage}" to topic ${topicId} inside chat ${chatId}`);
              
              await client.sendMessage(message.peerId, {
                message: photoReplyMessage,
                replyTo: replyTo,
              });

              if (photoReplyMessage2Enabled && photoReplyMessage2) {
                const startTime = (await getSetting("photo_reply_message_2_start_time", accountId))?.value || "";
                const endTime = (await getSetting("photo_reply_message_2_end_time", accountId))?.value || "";
                
                let shouldSend = true;
                if (startTime && endTime) {
                  const now = new Date();
                  const istOffset = 5.5 * 60 * 60 * 1000;
                  const istTime = new Date(now.getTime() + istOffset);
                  const currentHour = istTime.getUTCHours();
                  const currentMinute = istTime.getUTCMinutes();
                  const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
                  
                  if (startTime <= endTime) {
                    shouldSend = currentTimeStr >= startTime && currentTimeStr <= endTime;
                  } else {
                    shouldSend = currentTimeStr >= startTime || currentTimeStr <= endTime;
                  }
                }

                if (shouldSend) {
                  console.log(`[PHOTO REPLY] Sending second global photo auto-reply: "${photoReplyMessage2}"`);
                  await client.sendMessage(message.peerId, {
                    message: photoReplyMessage2,
                    replyTo: replyTo,
                  });
                }
              }

              if (!history) {
                try {
                  await PhotoReplyHistory.create({ topic_id: topicId, chat_id: chatId, count: 1, last_updated: new Date(), account_id: accountId || 'default' });
                } catch (e: any) {
                  if (e.code !== 11000) throw e;
                  console.warn("Duplicate key error for PhotoReplyHistory, ignoring.");
                }
              } else {
                history.count += 1;
                history.last_updated = new Date();
                await history.save();
              }
              
              await saveLog(`Photo auto-reply sent to ${topicName}: "${photoReplyMessage}" (Count: ${history ? history.count : 1}/${photoReplyMax})`, 'info', 'USERBOT', undefined, undefined, accountId);
            }
          }
        } catch (err: any) {
          console.error("Failed to process photo message:", err);
          await saveLog(`Failed to process photo message: ${err.message}`, 'error', 'USERBOT', undefined, undefined, accountId);
        }
      }

      // 1. Topic Creation Handler
      if (message.action instanceof Api.MessageActionTopicCreate) {
        const topicName = message.action.title;
        const topicId = message.id;
        await logTopic(topicId, topicName, chatId, undefined, accountId);
        
      const appLogo = (await getSetting("app_logo", accountId))?.value || "";
        const autoReply = (await getSetting("auto_reply", accountId))?.value || "Welcome!";
        const autoReply2Enabled = (await getSetting("auto_reply_2_enabled", accountId))?.value === "true";
        const autoReply2 = (await getSetting("auto_reply_2", accountId))?.value || "";
        const autoReply2Delay = parseInt((await getSetting("auto_reply_2_delay", accountId))?.value || "1", 10);
        const delaySeconds = parseInt((await getSetting("delay_seconds", accountId))?.value || "0", 10);
        
        setTimeout(async () => {
          try {
            if (isTopicBlocked(topicId, accountId)) {
              console.log(`Topic ${topicId} was blocked during auto-reply delay. Skipping.`);
              return;
            }
            const replyInGeneral = (await getSetting("reply_in_general", accountId))?.value === "true";
            await client.sendMessage(message.peerId, {
              message: autoReply,
              replyTo: replyInGeneral ? undefined : topicId,
            });

            if (autoReply2Enabled && autoReply2) {
              setTimeout(async () => {
                try {
                  if (isTopicBlocked(topicId, accountId)) {
                    console.log(`Topic ${topicId} was blocked during auto-reply-2 delay. Skipping.`);
                    return;
                  }
                  await client.sendMessage(message.peerId, {
                    message: autoReply2,
                    replyTo: replyInGeneral ? undefined : topicId,
                  });
                } catch (err) {
                  console.error("UserBot failed to send second auto-reply:", err);
                }
              }, autoReply2Delay * 1000);
            }
          } catch (err) {
            console.error("UserBot failed to send auto-reply:", err);
          }
        }, delaySeconds * 1000);
      }

      // 2. Keyword Handler (Lightning-fast cached lookup)
      const accountKeywords = await getCachedAccountKeywords(accountId);
      
      let keywordMatched = false;
      if (message.message && !message.out) {
        const text = message.message.toLowerCase().trim();
        const matches: { kw: any, index: number, matchedWord: string }[] = [];
        
        console.log(`Checking ${accountKeywords.length} keywords for message: "${text}" from ${chatId} in account ${accountId}`);
        
        for (const kw of accountKeywords) {
          if (kw.enabled === false) continue;

          // Check target_groups restriction if defined
          if (kw.target_groups && kw.target_groups.length > 0) {
            const normalizeId = (id: string) => id.toString().trim().replace(/^-100|^ -100|^-/, "");
            const currentNormChat = normalizeId(chatId);
            const isTargetedGroup = kw.target_groups.some((tg: string) => {
              const normTg = normalizeId(tg);
              return normTg === currentNormChat || chatId.includes(tg) || tg.trim() === chatId.trim();
            });
            if (!isTargetedGroup) {
              console.log(`Skipping keyword rule ${kw._id} because chat ${chatId} is not in target_groups:`, kw.target_groups);
              continue;
            }
          }

          const triggerWords = [...(kw.keywords || [])];
          if (kw.keyword && !triggerWords.includes(kw.keyword)) {
            triggerWords.push(kw.keyword);
          }

          for (const word of triggerWords) {
            const wordLower = word.toLowerCase().trim();
            if (!wordLower) continue;

            const escapedWord = escapeRegExp(wordLower);
            if (kw.match_mode === 'exact') {
              if (text === wordLower) {
                matches.push({ kw, index: 0, matchedWord: wordLower });
              } else {
                // Word boundary check for exact mode
                const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
                const match = regex.exec(text);
                if (match) {
                  matches.push({ kw, index: match.index, matchedWord: wordLower });
                }
              }
            } else {
              // Partial mode using super-fast indexOf
              const idx = text.indexOf(wordLower);
              if (idx !== -1) {
                matches.push({ kw, index: idx, matchedWord: wordLower });
              }
            }
          }
        }

        matches.sort((a, b) => a.index - b.index);

        if (matches.length > 0) {
          keywordMatched = true;
          const keywordDelaySeconds = parseInt((await getSetting("keyword_delay_seconds", accountId))?.value || "0", 10);
          
          const matchedWordsList = matches.map(m => m.matchedWord).join(", ");
          let topicName = topicNamesCache[topicId] || (topicId ? `Topic #${topicId}` : "General");
          let chatTitle = "Telegram Group";
          try {
            const chat = await client.getEntity(message.peerId) as any;
            if (chat && chat.title) chatTitle = chat.title;
          } catch (e) {}

          // Log in background non-blocking
          saveLog(`Keyword(s) detected: "${matchedWordsList}" in ${chatTitle} > ${topicName}`, 'info', 'USERBOT', undefined, { 
            message: message.message,
            topicId,
            chatId,
            group: chatTitle,
            topic: topicName,
            matchedWords: matches.map(m => m.matchedWord)
          }, accountId).catch(() => {});

          // Only delay if user specifically configured keyword_delay_seconds > 0
          if (keywordDelaySeconds > 0) {
            await new Promise(resolve => setTimeout(resolve, keywordDelaySeconds * 1000));
          }

          const processedRuleIds = new Set<string>();

          for (const match of matches) {
            const kw = match.kw;
            
            if (processedRuleIds.has(kw._id.toString())) {
              continue;
            }
            processedRuleIds.add(kw._id.toString());
            
            // Fire keyword hit notification concurrently in background (non-blocking)
            const notifyGlobalSetting = (await getSetting("notify_on_all_keywords", accountId))?.value === "true";
            if (notifyGlobalSetting || kw.notify_on_hit === true || kw.notify_on_hit === "true" || kw.notify_on_hit === 1) {
              sendKeywordHitNotification({
                matchedWord: match.matchedWord,
                topicName,
                topicId: topicId ? String(topicId) : "",
                chatTitle,
                chatId: chatId ? String(chatId) : "",
                userMessage: message.message || "",
                client,
                accountId
              }).catch(err => console.error("Error sending keyword hit notification:", err));
            }

            const linksToProcess = [...(kw.message_links || [])];
            if (kw.message_link && !linksToProcess.includes(kw.message_link)) {
              linksToProcess.push(kw.message_link);
            }
            const normalizedLinks = linksToProcess.map(l => l.trim()).filter(l => l).sort();

            try {
              const isGlobalApproval = (await getSetting("global_approval_mode", accountId))?.value === "true";
              const requiresApproval = isGlobalApproval || !!kw.approval_mode;

              if (requiresApproval) {
                const approval = await PendingApproval.create({
                  matched_keyword: match.matchedWord,
                  rule_id: kw._id,
                  message_id: message.id,
                  chat_id: chatId,
                  chat_title: chatTitle,
                  topic_id: topicId,
                  topic_name: topicName,
                  original_text: message.message,
                  status: 'pending',
                  account_id: accountId || 'default'
                });

                const logMsg = `Approval Required: Keyword "${match.matchedWord}" matched in ${chatTitle} > ${topicName}`;
                saveLog(logMsg, 'info', 'USERBOT', undefined, { topicId, keyword: match.matchedWord, approvalId: approval._id }, accountId).catch(() => {});
                
                const cleanChatId = (chatId || "").toString().replace(/^-100|^ -100|^-/, "").trim();
                const topicLink = topicId ? `https://t.me/c/${cleanChatId}/${topicId}` : `https://t.me/c/${cleanChatId}`;
                sendPushNotification("Approval Required ⚠️", `Keyword "${match.matchedWord}" in "${topicName}" (${chatTitle})`, {
                  url: topicLink || '/',
                  tag: `approval-${approval._id}`
                }, accountId).catch(e => console.error("WebPush approval error:", e));
                
                if (bot) {
                  const notificationText = `🔔 <b>Approval Required</b>\n\n` +
                    `• <b>Keyword:</b> <code>${escapeHtml(match.matchedWord)}</code>\n` +
                    `• <b>Group:</b> ${escapeHtml(chatTitle)}\n` +
                    `• <b>Topic:</b> ${escapeHtml(topicName)}\n` +
                    `• <b>User Message:</b> "${escapeHtml(message.message)}"`;

                  const replyMarkup = {
                    inline_keyboard: [
                      [
                        { text: "✅ Approve", callback_data: `approve_${approval._id}` },
                        { text: "❌ Reject", callback_data: `reject_${approval._id}` }
                      ],
                      [
                        { text: "🔗 Open Topic", url: topicLink }
                      ]
                    ]
                  };

                  if (chatId) {
                    const targetTopicId = topicId ? Number(topicId) : undefined;
                    bot.sendMessage(chatId, notificationText, {
                      parse_mode: 'HTML',
                      message_thread_id: targetTopicId,
                      reply_markup: replyMarkup
                    }).then(async (msg) => {
                      approval.bot_chat_id = chatId;
                      approval.bot_message_id = msg.message_id;
                      await approval.save().catch(() => {});
                    }).catch(e => console.error("Failed to send approval message into topic:", e.message));
                  }

                  getBotAdminChatIds().then(adminChats => {
                    for (const adminChat of adminChats) {
                      if (adminChat !== chatId) {
                        bot.sendMessage(adminChat, notificationText, {
                          parse_mode: 'HTML',
                          reply_markup: replyMarkup
                        }).catch(() => {});
                      }
                    }
                  }).catch(() => {});
                }

                sendSseEvent('approval_needed', {
                  id: approval._id,
                  keyword: match.matchedWord,
                  group: chatTitle,
                  topic: topicName,
                  message: message.message,
                  accountId,
                  timestamp: new Date()
                });

                continue;
              }

              if (isSystemPaused) {
                MissedTrigger.create({
                  message_id: message.id,
                  chat_id: chatId,
                  topic_id: topicId,
                  text: message.message,
                  matched_keyword: match.matchedWord,
                  rule_id: kw._id,
                  account_id: accountId || 'default'
                }).catch(() => {});
                const pauseMsg = `Keyword "${match.matchedWord}" matched but system is PAUSED. Saved as missed trigger.`;
                saveLog(pauseMsg, 'warn', 'USERBOT', undefined, { topicId, keyword: match.matchedWord }, accountId).catch(() => {});
                continue;
              }

              if (topicId) {
                const maxReplies = kw.max_replies !== undefined && kw.max_replies !== null ? Number(kw.max_replies) : 0;
                const currentCount = await getKeywordReplyCount(topicId, chatId, kw._id, accountId, autoResetEnabled);

                if (maxReplies > 0 && currentCount >= maxReplies) {
                  const skipMsg = `Keyword "${match.matchedWord}" reached limit (${currentCount}/${maxReplies}) in topic ${topicId}. Skipping this rule.`;
                  console.log(`[LIMIT] ${skipMsg}`);
                  saveLog(skipMsg, 'info', 'USERBOT', undefined, { topicId, keyword: match.matchedWord, count: currentCount, limit: maxReplies }, accountId).catch(() => {});
                  continue;
                }
              }

              // 1. AI Reply (if enabled)
              if (kw.ai_reply_enabled) {
                const aiModeEnabled = (await getSetting("ai_mode_enabled", accountId))?.value === "true";
                
                if (aiModeEnabled) {
                   const geminiApiKeysSetting = await getSetting("gemini_api_keys", accountId);
                   let apiKeys: string[] = [];
                   try {
                     apiKeys = JSON.parse(geminiApiKeysSetting?.value || "[]");
                   } catch (e) {}
                   
                   const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
                   if (envKey && !apiKeys.includes(envKey)) apiKeys.push(envKey);
                   
                   if (apiKeys.length > 0) {
                     const aiPersona = (await getSetting("ai_persona", accountId))?.value || DEFAULT_AI_PERSONA;
                     const conversationContext = await getRecentConversationContext(client, message.peerId, topicId);
                     
                     for (const apiKey of apiKeys) {
                       try {
                         const genAI = new GoogleGenAI({ apiKey });
                         const response = await genAI.models.generateContent({
                           model: "gemini-3-flash-preview",
                           contents: [
                             {
                               role: "user",
                               parts: [
                                 { text: `System Instruction: ${aiPersona}` },
                                 { text: conversationContext },
                                 { text: `User Message: "${message.message}"` },
                                 { text: `Context: The user triggered a keyword "${match.matchedWord}". Reply naturally to their query considering the recent conversation history. If the message is short, generic, or doesn't need a reply, output 'NO_REPLY'.` }
                               ]
                             }
                           ]
                         });
                         
                         const aiReply = response.text.trim();
                         if (aiReply && aiReply !== "NO_REPLY") {
                           await client.sendMessage(message.peerId, {
                             message: aiReply,
                             replyTo: replyTo,
                           });
                           saveLog(`AI Auto-Reply (Keyword: ${match.matchedWord}): "${aiReply}"`, 'info', 'USERBOT', undefined, undefined, accountId).catch(() => {});
                           break;
                         }
                       } catch (e) {
                         console.error("AI Keyword Reply failed:", e);
                       }
                     }
                   }
                }
              }

              // Instant Dispatch: Send Text or Photo
              if (kw.reply && !kw.photo) {
                await client.sendMessage(message.peerId, {
                  message: kw.reply,
                  replyTo: replyTo,
                });
              } else if (kw.photo) {
                const base64Data = kw.photo.includes(",") ? kw.photo.split(",")[1] : kw.photo;
                const buffer = Buffer.from(base64Data, "base64");
                
                const fileToUpload = new CustomFile("photo.jpg", buffer.length, "", buffer);
                const toUpload = await client.uploadFile({
                  file: fileToUpload,
                  workers: 1,
                });

                await client.sendFile(message.peerId, {
                  file: toUpload,
                  caption: kw.reply || "",
                  replyTo: replyTo,
                  forceDocument: false,
                });
              }

              // Instant Forwarding: Forward saved message links
              if (normalizedLinks.length > 0) {
                for (const link of normalizedLinks) {
                  const parts = link.split("/").filter(p => p.length > 0);
                  const messageId = parseInt(parts[parts.length - 1], 10);
                  
                  if (!isNaN(messageId)) {
                    let fromPeer: any = targetGroupId;
                    
                    if (link.includes("/c/")) {
                      const cIndex = parts.indexOf("c");
                      if (cIndex !== -1 && parts[cIndex + 1]) {
                        fromPeer = `-100${parts[cIndex + 1]}`;
                      }
                    } else {
                      const tmeIndex = parts.indexOf("t.me");
                      if (tmeIndex !== -1 && parts[tmeIndex + 1]) {
                        fromPeer = parts[tmeIndex + 1];
                      } else if (parts.length >= 3) {
                        fromPeer = parts[2];
                      }
                    }

                    const topMsgId = topicId === 1 ? undefined : topicId;
                    
                    try {
                      let inputPeer = await client.getInputEntity(typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer);
                      const toPeerInput = await client.getInputEntity(message.peerId);

                      await client.invoke(
                        new Api.messages.ForwardMessages({
                          fromPeer: inputPeer,
                          id: [messageId],
                          randomId: [BigInt(Math.floor(Math.random() * 1e15)) as any],
                          toPeer: toPeerInput,
                          topMsgId: replyInGeneral ? undefined : topMsgId,
                        }) as any
                      );
                    } catch (forwardErr: any) {
                      try {
                        await client.forwardMessages(message.peerId, {
                          messages: [messageId],
                          fromPeer: typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer,
                          topMsgId: replyInGeneral ? undefined : topMsgId,
                        } as any);
                      } catch (fallbackErr: any) {
                         console.error("Fallback forwarding failed:", fallbackErr.message);
                      }
                    }
                  }
                }
              }
              
              saveLog(`Auto-reply sent for keyword "${match.matchedWord}" in ${chatTitle} > ${topicName}`, 'info', 'USERBOT', undefined, { topicId, chatId, ruleId: kw._id }, accountId).catch(() => {});

              // Update Reply History for this keyword in topic
              if (topicId) {
                incrementKeywordReplyCount(topicId, chatId, kw._id, accountId, autoResetEnabled).catch(() => {});
              }
            } catch (err: any) {
              console.error(`UserBot failed to reply to keyword "${kw.keyword}":`, err);
              saveLog(`Failed to reply to keyword ${kw.keyword}: ${err.message}`, 'error', 'USERBOT', undefined, undefined, accountId).catch(() => {});
            }
          }
        }
      }

      // 3. AI Smart Reply (Fallback)
      if (!keywordMatched && message.message && !message.out) {
        const aiModeEnabled = (await getSetting("ai_mode_enabled"))?.value === "true";
        if (aiModeEnabled) {
          // Fetch keys from settings
          const geminiApiKeysSetting = await getSetting("gemini_api_keys");
          let apiKeys: string[] = [];
          try {
            apiKeys = JSON.parse(geminiApiKeysSetting?.value || "[]");
          } catch (e) {
            console.error("Failed to parse gemini_api_keys setting", e);
          }

          // Add environment variable key as fallback/primary if not in list
          const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
          if (envKey && !apiKeys.includes(envKey)) {
            apiKeys.push(envKey);
          }

          if (apiKeys.length === 0) {
            console.warn("AI Mode is enabled but no Gemini API Keys found (neither in settings nor environment).");
            return;
          }

          const aiPersona = (await getSetting("ai_persona"))?.value || DEFAULT_AI_PERSONA;
          const conversationContext = await getRecentConversationContext(client, message.peerId, topicId);
          
          let aiReply = null;
          let success = false;

          // Try keys one by one
          for (const apiKey of apiKeys) {
            try {
              console.log(`Attempting AI reply with key ending in ...${apiKey.slice(-4)}`);
              const genAI = new GoogleGenAI({ apiKey });
              const response = await genAI.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: [
                  {
                    role: "user",
                    parts: [
                      { text: `System Instruction: ${aiPersona}` },
                      { text: conversationContext },
                      { text: `User Message: "${message.message}"` },
                      { text: `Context: This is a Telegram group chat. Reply naturally considering the recent conversation history. If the message is short, generic, or doesn't need a reply, output 'NO_REPLY'.` }
                    ]
                  }
                ]
              });
              
              aiReply = response.text.trim();
              success = true;
              break; // Success! Stop trying keys.
            } catch (aiErr: any) {
              let errorMsg = aiErr.message || String(aiErr);
              
              // Try to parse JSON error message if possible
              try {
                if (typeof errorMsg === 'string' && errorMsg.startsWith('{')) {
                  const parsed = JSON.parse(errorMsg);
                  if (parsed.error && parsed.error.message) {
                    errorMsg = parsed.error.message;
                  }
                }
              } catch (e) {
                // Ignore parse error
              }

              console.error(`AI Generation failed with key ...${apiKey.slice(-4)}:`, errorMsg);
              
              // Log specific critical errors to the dashboard so the user knows WHICH key is bad
              if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("Resource has been exhausted")) {
                await saveLog(`Quota Exceeded for API Key (...${apiKey.slice(-4)}). Please wait or add more keys.`, 'warn', 'AI_SYSTEM');
                // Continue to next key if available
              } else if (errorMsg.includes("leaked") || errorMsg.includes("not valid") || errorMsg.includes("API_KEY_INVALID")) {
                await saveLog(`Invalid API Key (...${apiKey.slice(-4)}): ${errorMsg}`, 'error', 'AI_SYSTEM');
              }
            }
          }

          if (success) {
            if (aiReply && aiReply !== "NO_REPLY") {
              console.log(`AI Reply generated: "${aiReply}"`);
              await client.sendMessage(message.peerId, {
                message: aiReply,
                replyTo: replyTo,
              });
              await saveLog(`AI Auto-Reply: "${aiReply}"`, 'info', 'USERBOT');
              
              // Notify frontend
              sendSseEvent('ai_reply', {
                message: `AI Replied: ${aiReply}`,
                originalMessage: message.message,
                timestamp: new Date()
              });
            } else {
              console.log("AI decided not to reply (NO_REPLY).");
            }
          } else {
            const errorMessage = "All Gemini API Keys failed. Please check your keys in settings.";
            await saveLog(`AI Generation failed: ${errorMessage}`, 'error', 'USERBOT');
          }
        }
      }
      } catch (globalErr: any) {
        console.error("Global error in UserBot event handler:", globalErr);
        
        // Log the exact error to the database so the user can diagnose issues from the dashboard
        const stackTrace = globalErr.stack || String(globalErr);
        const errMessage = globalErr.message || "Unknown processing error";
        await saveLog(`Bot Processing Error: ${errMessage}. details: ${stackTrace.slice(0, 400)}`, 'error', 'USERBOT', undefined, { error: stackTrace }, accountId).catch(() => {});

        if (globalErr.message?.includes("AUTH_KEY_UNREGISTERED")) {
          console.log("Session invalid in event handler. Clearing session string.");
          await deleteSetting("session_string");
          if (userClient) {
            try { await userClient.disconnect(); } catch (e) {}
          }
          userClient = null;
        } else if (globalErr.message?.includes("TIMEOUT")) {
          console.log("Connection timed out in event handler. Will retry later.");
        }
      }
    }, new NewMessage({}));
  }

  //sseClients.length;

  // SSE Endpoint
  app.get("/api/notifications", (req, res) => {
    req.setTimeout(0);
    req.socket.setKeepAlive(true);
    req.socket.setNoDelay(true);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable buffering for Nginx
    res.flushHeaders();

    try {
      res.write(': connected\n\n');
    } catch (e) {}

    const clientId = Date.now();
    const accountId = (req.query.account_id as string) || "default";
    const newClient = { id: clientId, res, accountId };
    sseClients.push(newClient);

    req.on("close", () => {
      sseClients = sseClients.filter(client => client.id !== clientId);
    });
  });

  app.delete("/api/missed-triggers", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      await MissedTrigger.deleteMany(getAccountFilter(accountId));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Account Profile Routes (Persisted in MongoDB)
  app.get("/api/accounts", async (req, res) => {
    try {
      let accounts = await AccountProfile.find().sort({ created_at: 1 }).lean();
      
      // Ensure default account profile exists
      let hasDefault = accounts.some(a => a.account_id === 'default');
      if (!hasDefault) {
        const defaultAcc = await AccountProfile.findOneAndUpdate(
          { account_id: 'default' },
          {
            account_id: 'default',
            name: 'Main Account',
            avatar_color: 'from-blue-600 to-indigo-600',
            is_main: true,
            created_at: new Date()
          },
          { upsert: true, new: true }
        ).lean();
        accounts = [defaultAcc as any, ...accounts];
      }

      const activeDoc = await getSetting("active_account_id");
      const activeAccountId = activeDoc?.value || 'default';

      // Enrich with live session data
      const enriched = accounts.map(acc => {
        const session = accountClients.get(acc.account_id);
        const isClientActive = !!(session?.client || (acc.account_id === 'default' && userClient && cachedAuthStatus));
        const liveUser = session?.loginUser;
        return {
          id: acc.account_id,
          name: acc.name,
          avatarColor: acc.avatar_color,
          isMain: !!acc.is_main,
          lockPin: acc.lock_pin || '',
          phone: acc.phone || liveUser?.phone || '',
          telegramName: acc.telegram_name || (liveUser ? [liveUser.firstName, liveUser.lastName].filter(Boolean).join(' ') : ''),
          telegramUsername: acc.telegram_username || liveUser?.username || '',
          isConnected: isClientActive,
          createdAt: acc.created_at,
          updatedAt: acc.updated_at,
          isActive: acc.account_id === activeAccountId
        };
      });

      res.json({ accounts: enriched, activeAccountId });
    } catch (err: any) {
      console.error("[GET /api/accounts] Error:", err);
      res.status(500).json({ error: `[GET /api/accounts] ${err.message}` });
    }
  });

  // Active Account State Management & Login Verification APIs
  app.get("/api/accounts/active", async (req, res) => {
    try {
      const activeDoc = await getSetting("active_account_id");
      const activeAccountId = activeDoc?.value || 'default';
      const session = accountClients.get(activeAccountId);
      const isClientActive = !!(session?.client && session.client.connected && (session ? true : cachedAuthStatus));
      
      res.json({
        success: true,
        activeAccountId,
        isConnected: isClientActive,
        user: session?.loginUser || null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/accounts/active", async (req, res) => {
    try {
      const { accountId } = req.body;
      const targetId = String(accountId || 'default').trim();
      
      await setSetting("active_account_id", targetId);
      console.log(`[Account] Active account switched to "${targetId}" on server.`);
      
      // Trigger instant background verification & connection for this active account
      verifyAndConnectAccount(targetId).catch(err => console.error("Error verifying active account:", err));
      
      const session = accountClients.get(targetId);
      res.json({
        success: true,
        activeAccountId: targetId,
        isConnected: !!(session?.client && session.client.connected),
        user: session?.loginUser || null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/accounts/verify-login", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      console.log(`[Account] Explicit login verification requested for account "${accountId}"`);
      const connected = await verifyAndConnectAccount(accountId, true);
      const session = accountClients.get(accountId);
      res.json({
        success: true,
        accountId,
        isConnected: connected,
        user: session?.loginUser || null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/accounts", async (req, res) => {
    try {
      const { id, name, avatarColor, isMain } = req.body;
      const finalName = String(name || '').trim();
      if (!finalName) {
        return res.status(400).json({ error: "Account name is required" });
      }

      const accountId = (id && String(id).trim()) || `acc_${Date.now()}`;
      const isMainAcc = accountId === 'default' || !!isMain;

      const doc = await AccountProfile.findOneAndUpdate(
        { account_id: accountId },
        {
          account_id: accountId,
          name: finalName,
          avatar_color: avatarColor || 'from-blue-600 to-indigo-600',
          is_main: isMainAcc,
          updated_at: new Date()
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await saveLog(`Account profile created/updated: "${finalName}" (${accountId})`, 'info', 'API', '/api/accounts', undefined, accountId);
      res.json({
        success: true,
        account: {
          id: doc.account_id,
          name: doc.name,
          avatarColor: doc.avatar_color,
          isMain: doc.is_main
        }
      });
    } catch (err: any) {
      console.error("[POST /api/accounts] Error:", err);
      res.status(500).json({ error: `[POST /api/accounts] ${err.message}` });
    }
  });

  app.put("/api/accounts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, avatarColor, lockPin } = req.body;
      const finalName = String(name || '').trim();
      if (!finalName) {
        return res.status(400).json({ error: "Account name is required" });
      }

      const updateData: any = {
        name: finalName,
        updated_at: new Date()
      };
      if (avatarColor) {
        updateData.avatar_color = avatarColor;
      }
      if (lockPin !== undefined) {
        updateData.lock_pin = String(lockPin).trim();
      }

      const doc = await AccountProfile.findOneAndUpdate(
        { account_id: id },
        updateData,
        { new: true, upsert: true }
      );

      await saveLog(`Account renamed or lock status updated: "${finalName}" (${id})`, 'info', 'API', `/api/accounts/${id}`, undefined, id);
      res.json({
        success: true,
        account: {
          id: doc.account_id,
          name: doc.name,
          avatarColor: doc.avatar_color,
          isMain: doc.is_main,
          lockPin: doc.lock_pin || ''
        }
      });
    } catch (err: any) {
      console.error("[PUT /api/accounts/:id] Error:", err);
      res.status(500).json({ error: `[PUT /api/accounts/:id] ${err.message}` });
    }
  });

  app.delete("/api/accounts/:id", async (req, res) => {
    try {
      const { id } = req.params;
      if (id === 'default') {
        return res.status(400).json({ error: "Main Account is permanent and cannot be deleted" });
      }

      // 1. Delete profile doc from MongoDB
      await AccountProfile.deleteOne({ account_id: id });

      // 2. Disconnect & cleanup live telegram client if active
      const session = accountClients.get(id);
      if (session?.client) {
        try {
          await session.client.disconnect();
        } catch (e) {
          console.warn(`Error disconnecting client for deleted account ${id}:`, e);
        }
      }
      accountClients.delete(id);
      accountAuthStates.delete(id);

      // 3. Purge all isolated account data
      await Setting.deleteMany({ account_id: id });
      await Keyword.deleteMany({ account_id: id });
      await Log.deleteMany({ account_id: id });
      await BlockedTopic.deleteMany({ account_id: id });
      await PhotoReplyHistory.deleteMany({ account_id: id });
      await ReplyHistory.deleteMany({ account_id: id });
      await PhotoSentLog.deleteMany({ account_id: id });
      await MissedTrigger.deleteMany({ account_id: id });
      await SessionHistory.deleteMany({ account_id: id });
      await ImportBatch.deleteMany({ account_id: id });
      await PushSubscription.deleteMany({ account_id: id });
      blockedTopicsCache.delete(id);

      await saveLog(`Account and all its data permanently deleted: ${id}`, 'info', 'API', `/api/accounts/${id}`, undefined, 'default');
      res.json({ success: true, message: `Account ${id} deleted successfully` });
    } catch (err: any) {
      console.error("[DELETE /api/accounts/:id] Error:", err);
      res.status(500).json({ error: `[DELETE /api/accounts/:id] ${err.message}` });
    }
  });

  // API Routes
  app.delete("/api/data/clear", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      await Keyword.deleteMany(getAccountFilter(accountId));
      await Log.deleteMany(getAccountFilter(accountId));
      await BlockedTopic.deleteMany(getAccountFilter(accountId));
      await PhotoReplyHistory.deleteMany(getAccountFilter(accountId));
      await ReplyHistory.deleteMany(getAccountFilter(accountId));
      await MissedTrigger.deleteMany(getAccountFilter(accountId));
      blockedTopicsCache.delete(accountId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/data/last-import-info", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const lastBatch = await ImportBatch.findOne(getAccountFilter(accountId)).sort({ imported_at: -1, _id: -1 });
      const totalKeywords = await Keyword.countDocuments(getAccountFilter(accountId));
      const latestKw = await Keyword.findOne(getAccountFilter(accountId)).sort({ _id: -1 });
      const latestRuleName = latestKw ? (latestKw.keyword || (latestKw.keywords && latestKw.keywords[0]) || 'Rule') : '';

      if (lastBatch) {
        const existingCount = await Keyword.countDocuments({
          $or: [
            { _id: { $in: lastBatch.keyword_ids } },
            { last_import_batch_id: lastBatch.batch_id }
          ],
          ...getAccountFilter(accountId)
        });
        return res.json({
          hasLastImport: true,
          batchId: lastBatch.batch_id,
          importedAt: lastBatch.imported_at,
          count: existingCount > 0 ? existingCount : lastBatch.count,
          names: lastBatch.keyword_names ? lastBatch.keyword_names.slice(0, 10) : [],
          latestRuleName,
          totalRules: totalKeywords
        });
      }

      // Check if any keywords exist with a batch id in database
      const kwWithBatch = await Keyword.findOne({
        last_import_batch_id: { $exists: true, $ne: null },
        ...getAccountFilter(accountId)
      }).sort({ _id: -1 });

      if (kwWithBatch && kwWithBatch.last_import_batch_id) {
        const count = await Keyword.countDocuments({
          last_import_batch_id: kwWithBatch.last_import_batch_id,
          ...getAccountFilter(accountId)
        });
        return res.json({
          hasLastImport: true,
          batchId: kwWithBatch.last_import_batch_id,
          importedAt: (kwWithBatch as any).created_at || null,
          count: count,
          names: [],
          latestRuleName,
          totalRules: totalKeywords
        });
      }

      // Smart Fallback for files imported before batch tracking update
      if (latestKw) {
        const allKws = await Keyword.find(getAccountFilter(accountId)).sort({ _id: -1 }).lean();
        const latestTime = latestKw._id.getTimestamp().getTime();
        // Group keywords created within 10 minutes (600,000ms) of the latest keyword
        const cluster = allKws.filter(k => Math.abs((k._id as any).getTimestamp().getTime() - latestTime) <= 600000);
        const clusterCount = cluster.length > 0 ? cluster.length : 1;

        return res.json({
          hasLastImport: true,
          batchId: 'legacy_cluster',
          importedAt: latestKw._id.getTimestamp(),
          count: clusterCount,
          names: cluster.slice(0, 10).map(k => k.keyword || (k.keywords && k.keywords[0]) || 'Rule'),
          latestRuleName,
          totalRules: totalKeywords,
          isLegacy: true
        });
      }

      res.json({
        hasLastImport: false,
        batchId: null,
        importedAt: null,
        count: 0,
        names: [],
        latestRuleName: '',
        totalRules: 0
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete ENTIRE Last Imported File (All Rules in Batch)
  app.delete("/api/data/last-import", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const lastBatch = await ImportBatch.findOne(getAccountFilter(accountId)).sort({ imported_at: -1, _id: -1 });

      let deletedCount = 0;
      if (lastBatch) {
        const result = await Keyword.deleteMany({
          $or: [
            { _id: { $in: lastBatch.keyword_ids } },
            { last_import_batch_id: lastBatch.batch_id }
          ],
          ...getAccountFilter(accountId)
        });
        deletedCount = result.deletedCount || 0;
        await ImportBatch.deleteOne({ _id: lastBatch._id });
      } else {
        // Fallback 1: check keywords by last_import_batch_id
        const lastKwWithBatch = await Keyword.findOne({
          last_import_batch_id: { $exists: true, $ne: null },
          ...getAccountFilter(accountId)
        }).sort({ _id: -1 });

        if (lastKwWithBatch && lastKwWithBatch.last_import_batch_id) {
          const result = await Keyword.deleteMany({
            last_import_batch_id: lastKwWithBatch.last_import_batch_id,
            ...getAccountFilter(accountId)
          });
          deletedCount = result.deletedCount || 0;
        } else {
          // Fallback 2 (Legacy): Find recent cluster of keywords imported together
          const allKws = await Keyword.find(getAccountFilter(accountId)).sort({ _id: -1 });
          if (allKws.length > 0) {
            const latestTime = allKws[0]._id.getTimestamp().getTime();
            const cluster = allKws.filter(k => Math.abs(k._id.getTimestamp().getTime() - latestTime) <= 600000);
            const clusterIds = cluster.map(k => k._id);
            const result = await Keyword.deleteMany({
              _id: { $in: clusterIds },
              ...getAccountFilter(accountId)
            });
            deletedCount = result.deletedCount || cluster.length;
          } else {
            return res.status(404).json({ error: "No rules found in database to delete" });
          }
        }
      }

      await refreshKeywordCache();
      await saveLog(`Deleted all ${deletedCount} rules from last imported JSON file`, 'info', 'API', '/api/data/last-import', undefined, accountId);
      res.json({ 
        success: true, 
        deletedCount, 
        message: `Successfully deleted all ${deletedCount} rule(s) from the last imported JSON file!` 
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Single Last 1 Rule (1 by 1)
  app.delete("/api/data/last-rule", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const lastKeyword = await Keyword.findOne(getAccountFilter(accountId)).sort({ _id: -1 });
      
      if (!lastKeyword) {
        return res.status(404).json({ error: "No rules found in database to delete" });
      }

      const ruleName = lastKeyword.keyword || (lastKeyword.keywords && lastKeyword.keywords[0]) || 'Rule';
      await Keyword.deleteOne({ _id: lastKeyword._id });

      // If this keyword was in an ImportBatch, remove its id and decrement count
      if (lastKeyword.last_import_batch_id) {
        await ImportBatch.updateOne(
          { batch_id: lastKeyword.last_import_batch_id, ...getAccountFilter(accountId) },
          { $pull: { keyword_ids: lastKeyword._id }, $inc: { count: -1 } }
        );
      }

      await refreshKeywordCache();
      await saveLog(`Deleted last single rule: "${ruleName}"`, 'info', 'API', '/api/data/last-rule', undefined, accountId);
      res.json({
        success: true,
        deletedRule: ruleName,
        message: `Successfully deleted last rule "${ruleName}"!`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get ALL Past Imported Batches/Files History
  app.get("/api/data/import-batches", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const batches = await ImportBatch.find(getAccountFilter(accountId)).sort({ imported_at: -1 }).lean();
      
      const batchesWithCount = await Promise.all(batches.map(async (b: any) => {
        const activeCount = await Keyword.countDocuments({
          $or: [
            { _id: { $in: b.keyword_ids || [] } },
            { last_import_batch_id: b.batch_id }
          ],
          ...getAccountFilter(accountId)
        });
        return {
          id: b._id,
          batchId: b.batch_id,
          fileName: b.file_name || `Import_${new Date(b.imported_at).toLocaleDateString()}`,
          importedAt: b.imported_at,
          count: activeCount > 0 ? activeCount : b.count,
          names: b.keyword_names ? b.keyword_names.slice(0, 10) : []
        };
      }));

      res.json({ batches: batchesWithCount.filter(b => b.count > 0) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a specific imported file batch by batchId
  app.delete("/api/data/import-batch/:batchId", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const { batchId } = req.params;

      const batchDoc = await ImportBatch.findOne({ batch_id: batchId, ...getAccountFilter(accountId) });

      let deletedCount = 0;
      if (batchDoc && batchDoc.keyword_ids && batchDoc.keyword_ids.length > 0) {
        const result = await Keyword.deleteMany({
          $or: [
            { _id: { $in: batchDoc.keyword_ids } },
            { last_import_batch_id: batchId }
          ],
          ...getAccountFilter(accountId)
        });
        deletedCount = result.deletedCount || 0;
      } else {
        const result = await Keyword.deleteMany({
          last_import_batch_id: batchId,
          ...getAccountFilter(accountId)
        });
        deletedCount = result.deletedCount || 0;
      }

      await ImportBatch.deleteOne({ batch_id: batchId, ...getAccountFilter(accountId) });
      await refreshKeywordCache();
      const fileNameStr = batchDoc?.file_name || batchId;
      await saveLog(`Deleted import batch "${fileNameStr}" (${deletedCount} rules)`, 'info', 'API', `/api/data/import-batch/${batchId}`, undefined, accountId);

      res.json({
        success: true,
        deletedCount,
        message: `Successfully deleted imported file "${fileNameStr}" (${deletedCount} rules removed)!`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });



  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;
      await PushSubscription.deleteOne({ endpoint });
      res.json({ status: "success" });
    } catch (err: any) {
      console.error("Error in /api/push/unsubscribe:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/test", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      await sendPushNotification("Test Notification", "This is a test notification from your bot!", {}, accountId);
      res.json({ status: "success" });
    } catch (err: any) {
      console.error("Error in /api/push/test:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/push/test-photo", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      await sendPhotoReceivedNotification({
        chatTitle: "Test Group",
        topicName: "Test Topic",
        topicId: 12345,
        chatId: "123456789",
        link: "https://t.me",
        accountId
      });
      res.json({ status: "success" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  let isBackgroundVerifying = false;

  async function verifyAndConnectAccount(accId: string, forceReconnect: boolean = false): Promise<boolean> {
    try {
      const sessionDoc = await Setting.findOne({ key: "session_string", ...getAccountFilter(accId) });
      const sessionString = sessionDoc?.value;
      if (!sessionString) {
        return false;
      }

      // Determine credentials with full fallback: account-specific -> default -> environment defaults
      const apiIdRaw = (await getSetting("api_id", accId))?.value || (await getSetting("api_id", "default"))?.value || process.env.TELEGRAM_API_ID || "34669075";
      const apiHash = ((await getSetting("api_hash", accId))?.value || (await getSetting("api_hash", "default"))?.value || process.env.TELEGRAM_API_HASH || "b0f0ffda80d58bea235b2d232fbcbc79").trim();
      const apiId = parseInt(apiIdRaw.trim(), 10);
      if (isNaN(apiId) || apiId <= 0 || !apiHash) {
        console.warn(`[UserBot Background] Account "${accId}" has invalid API credentials: ID=${apiIdRaw}, Hash=${apiHash ? 'OK' : 'MISSING'}`);
        return false;
      }

      const currentSession = accountClients.get(accId);
      let client = currentSession?.client || (accId === 'default' ? userClient : null);

      if (client && client.connected && !forceReconnect) {
        try {
          const isAuthed = await client.isUserAuthorized();
          if (isAuthed) {
            if (!currentSession?.loginUser) {
              try {
                const me = await client.getMe();
                if (me) {
                  const liveUser = {
                    id: me.id.toString(),
                    firstName: me.firstName,
                    lastName: me.lastName,
                    username: me.username,
                    phone: me.phone
                  };
                  if (currentSession) currentSession.loginUser = liveUser;
                  const tgName = [me.firstName, me.lastName].filter(Boolean).join(' ');
                  await AccountProfile.findOneAndUpdate(
                    { account_id: accId },
                    {
                      telegram_name: tgName || me.username || '',
                      telegram_username: me.username || '',
                      phone: me.phone || '',
                      updated_at: new Date()
                    }
                  );
                }
              } catch (e) {}
            }
            return true;
          }
        } catch (e) {
          // Stale connection, proceed to reconnect
        }
      }

      console.log(`[UserBot Background] Verifying and connecting account "${accId}"...`);
      if (client) {
        try { await client.disconnect(); } catch (e) {}
      }

      const newClient = new TelegramClient(new StringSession(sessionString), apiId, apiHash, {
        connectionRetries: 5,
        requestRetries: 5,
        deviceModel: "Desktop",
        systemVersion: "Windows 10",
        appVersion: "1.0.0",
      });

      await newClient.connect();

      // Persist new session string if updated by Telegram
      try {
        const newSessionString = (newClient.session as StringSession).save();
        if (newSessionString && newSessionString !== sessionString) {
          await setSetting("session_string", newSessionString, accId);
        }
      } catch (e) {}

      const isAuthorized = await newClient.isUserAuthorized();
      if (isAuthorized) {
        let liveUser: any = null;
        try {
          const me = await newClient.getMe();
          if (me) {
            liveUser = {
              id: me.id.toString(),
              firstName: me.firstName,
              lastName: me.lastName,
              username: me.username,
              phone: me.phone
            };
            const tgName = [me.firstName, me.lastName].filter(Boolean).join(' ');
            await AccountProfile.findOneAndUpdate(
              { account_id: accId },
              {
                telegram_name: tgName || me.username || '',
                telegram_username: me.username || '',
                phone: me.phone || '',
                updated_at: new Date()
              }
            );
          }
        } catch (e) {
          console.warn(`[UserBot Background] Could not fetch getMe for account "${accId}":`, e);
        }

        const targetGroupId = getCachedSetting("telegram_group_ids", accId) || getCachedSetting("telegram_group_ids", "default") || process.env.TELEGRAM_GROUP_ID || "";
        setupUserBotHandlers(newClient, targetGroupId, accId);

        const startTime = Date.now();
        accountClients.set(accId, {
          accountId: accId,
          client: newClient,
          sessionStartTime: startTime,
          phoneNumber: liveUser?.phone,
          loginUser: liveUser
        });

        const activeAccountId = (await getSetting("active_account_id"))?.value || 'default';
        if (accId === activeAccountId || accId === 'default') {
          userClient = newClient;
          cachedAuthStatus = true;
          lastAuthCheck = Date.now();
          sessionStartTime = startTime;
        }

        console.log(`[UserBot Background] Account "${accId}" (${liveUser?.phone || liveUser?.username || 'user'}) verified & connected successfully in background!`);
        await saveLog(`Background Login Verified: UserBot connected for account "${accId}" (${liveUser?.phone || liveUser?.username || 'user'})`, "info", "SYSTEM", undefined, undefined, accId);
        return true;
      } else {
        console.warn(`[UserBot Background] Session for account "${accId}" is unauthorized or expired.`);
        try { await newClient.disconnect(); } catch (e) {}
        if (accId === 'default') {
          userClient = null;
          cachedAuthStatus = false;
        }
        if (accountClients.has(accId)) {
          await recordSessionEnd(accId, accountClients.get(accId)?.sessionStartTime);
          accountClients.delete(accId);
        }
        return false;
      }
    } catch (err: any) {
      console.error(`[UserBot Background] Error verifying/connecting account "${accId}":`, err.message);
      return false;
    }
  }

  async function verifyAndConnectAllUserBots() {
    if (isBackgroundVerifying) return;
    isBackgroundVerifying = true;
    try {
      await refreshSettingsCache();
      const activeDoc = await getSetting("active_account_id");
      const activeAccountId = activeDoc?.value || 'default';

      const sessionDocs = await Setting.find({ key: "session_string" });
      const accountIds = new Set<string>();
      
      accountIds.add(activeAccountId);
      accountIds.add('default');
      
      for (const doc of sessionDocs) {
        if (doc.value && doc.value.trim()) {
          accountIds.add(doc.account_id || 'default');
        }
      }

      for (const accId of accountIds) {
        try {
          await verifyAndConnectAccount(accId);
        } catch (accErr: any) {
          console.error(`[UserBot Background] Failed verifying account "${accId}":`, accErr.message);
        }
      }
    } catch (err: any) {
      console.error("[UserBot Background] Error in verifyAndConnectAllUserBots:", err);
    } finally {
      isBackgroundVerifying = false;
    }
  }

  async function checkAndReconnectUserBot() {
    await verifyAndConnectAllUserBots();
  }

  // Continuously verify and maintain background UserBot sessions every 30 seconds
  setInterval(checkAndReconnectUserBot, 30000);

  // Serve dynamic active App Icon (supports Base64, preset URLs, and static fallbacks)
  app.get("/api/app-icon.png", async (req, res) => {
    try {
      const appLogoSetting = await getSetting("app_logo", "default");
      const appLogo = appLogoSetting?.value || "";
      if (appLogo && appLogo.startsWith("data:")) {
        const matches = appLogo.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], "base64");
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          return res.send(buffer);
        }
      } else if (appLogo && (appLogo.startsWith("/") || appLogo.startsWith("http"))) {
        return res.redirect(appLogo);
      }
      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(path.join(process.cwd(), "public", "pwa-192x192.png"));
    } catch (err) {
      return res.sendFile(path.join(process.cwd(), "public", "pwa-192x192.png"));
    }
  });

  app.get("/api/manifest.json", async (req, res) => {
    try {
      const appLogoSetting = await getSetting("app_logo", "default");
      const appLogo = appLogoSetting?.value || "/pwa-192x192.png";
      const iconUrl = appLogo.startsWith("data:") ? "/api/app-icon.png" : (appLogo || "/pwa-192x192.png");
      
      res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      res.json({
        name: "BotFlow Premium",
        short_name: "BotFlow",
        description: "Professional Telegram Topic & Userbot Manager with AI",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a0d14",
        theme_color: "#0a0d14",
        icons: [
          {
            src: iconUrl,
            sizes: "192x192 512x512",
            type: iconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png",
            purpose: "any"
          },
          {
            src: iconUrl,
            sizes: "192x192 512x512",
            type: iconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png",
            purpose: "maskable"
          }
        ],
        prefer_related_applications: false,
        categories: ["productivity", "utilities"]
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to generate manifest" });
    }
  });
  app.get("/api/stats", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const topicCount = await getTopicCount(accountId);
      const todayTopicCount = await getTodayTopicCount(accountId);
      const todayPhotoSentStats = await getTodayPhotoSentStats(accountId);
      const past24hPhotoSentStats = await getPast24hPhotoSentStats(accountId);
      const keywordCount = await Keyword.countDocuments(getAccountFilter(accountId));
      const appLogo = (await getSetting("app_logo", accountId))?.value || "";
      const autoReply = (await getSetting("auto_reply", accountId))?.value || "";
      const autoReply2Enabled = (await getSetting("auto_reply_2_enabled", accountId))?.value === "true";
      const autoReply2 = (await getSetting("auto_reply_2", accountId))?.value || "";
      const autoReply2Delay = parseInt((await getSetting("auto_reply_2_delay", accountId))?.value || "1", 10);
      const delaySeconds = parseInt((await getSetting("delay_seconds", accountId))?.value || "0", 10);
      const keywordDelaySeconds = parseInt((await getSetting("keyword_delay_seconds", accountId))?.value || "0", 10);
      const isSystemPaused = (await getSetting("system_paused", accountId))?.value === "true";
      const photoReplyEnabled = (await getSetting("photo_reply_enabled", accountId))?.value === "true";
      const photoReplyMessage = (await getSetting("photo_reply_message", accountId))?.value || "ok wait";
      const photoReplyMessage2Enabled = (await getSetting("photo_reply_message_2_enabled", accountId))?.value === "true";
      const photoReplyMessage2 = (await getSetting("photo_reply_message_2", accountId))?.value || "second message";
      const photoReplyMessage2StartTime = (await getSetting("photo_reply_message_2_start_time", accountId))?.value || "";
      const photoReplyMessage2EndTime = (await getSetting("photo_reply_message_2_end_time", accountId))?.value || "";
      const photoReplyMax = parseInt((await getSetting("photo_reply_max", accountId))?.value || "2", 10);
      const notificationSoundEnabled = (await getSetting("notification_sound_enabled", accountId))?.value === "true";
      const notificationSoundType = (await getSetting("notification_sound_type", accountId))?.value || "default";
      const topicIcon = (await getSetting("topic_icon", accountId))?.value || "✅";
      const topicRenameEmoji = (await getSetting("topic_rename_emoji", accountId))?.value || "🛑";
      const topicRenameKeywords = (await getSetting("topic_rename_keywords", accountId))?.value || "";
      const topicRenameMatchMode = (await getSetting("topic_rename_match_mode", accountId))?.value || "exact";
      const autoResetKeywords = (await getSetting("auto_reset_keywords", accountId))?.value === "true";
      const autoBlockKeywords = (await getSetting("auto_block_keywords", accountId))?.value || "";
      const aiModeEnabled = (await getSetting("ai_mode_enabled", accountId))?.value === "true";
      const aiPersona = (await getSetting("ai_persona", accountId))?.value || "";
      const geminiApiKeys = (await getSetting("gemini_api_keys", accountId))?.value || "[]";
      const replyInGeneral = (await getSetting("reply_in_general", accountId))?.value === "true";
      const lastLoginTime = (await getSetting("last_login_time", accountId))?.value || "";
      const targetGroupId = (await getSetting("telegram_group_ids", accountId))?.value || (accountId === 'default' ? process.env.TELEGRAM_GROUP_ID : "") || "";
      
      const session = accountClients.get(accountId);
      const client = session?.client || (accountId === 'default' ? userClient : null);
      let isUserBotConnected = !!client && (session ? true : cachedAuthStatus);

      const apiId = (await getSetting("api_id", accountId))?.value || "";
      const apiHash = (await getSetting("api_hash", accountId))?.value || "";
      const defaultPhone = (await getSetting("default_phone", accountId))?.value || "";

      let loginUser = null;
      if (isUserBotConnected && client) {
        if (session && session.loginUser) {
          loginUser = session.loginUser;
        } else {
          try {
            const me = await client.getMe();
            loginUser = {
              id: me.id.toString(),
              firstName: me.firstName,
              lastName: me.lastName,
              username: me.username,
              phone: me.phone
            };
            if (session) {
              session.loginUser = loginUser;
            }

            // Sync telegram user details to AccountProfile in MongoDB
            try {
              const tgName = [me.firstName, me.lastName].filter(Boolean).join(' ');
              await AccountProfile.findOneAndUpdate(
                { account_id: accountId },
                {
                  telegram_name: tgName || me.username || '',
                  telegram_username: me.username || '',
                  phone: me.phone || '',
                  updated_at: new Date()
                }
              );
            } catch (syncErr) {
              console.warn("Failed to sync telegram info to AccountProfile:", syncErr);
            }
          } catch (e: any) {
            console.error("Error getting user info for account:", accountId, e);
            if (e.message?.includes("AUTH_KEY_UNREGISTERED") || e.message?.includes("AUTH_KEY_DUPLICATED")) {
              if (accountClients.has(accountId)) { await recordSessionEnd(accountId, accountClients.get(accountId)?.sessionStartTime); }
              accountClients.delete(accountId);
              if (accountId === 'default') {
                await deleteSetting("session_string");
                cachedAuthStatus = false;
                userClient = null;
              }
            }
          }
        }
      }

      res.json({
        topicCount,
        appLogo,
        todayTopicCount,
        todayPhotoSentStats,
        past24hPhotoSentStats,
        keywordCount,
        autoReply,
        autoReply2Enabled,
        autoReply2,
        autoReply2Delay,
        delaySeconds,
        keywordDelaySeconds,
        isSystemPaused,
        photoReplyEnabled,
        photoReplyMessage,
        photoReplyMessage2Enabled,
        photoReplyMessage2,
        photoReplyMessage2StartTime,
        photoReplyMessage2EndTime,
        photoReplyMax,
        notificationSoundEnabled,
        notificationSoundType,
        topicIcon,
        topicRenameEmoji,
        topicRenameKeywords,
        topicRenameMatchMode,
        autoResetKeywords,
        autoBlockKeywords,
        aiModeEnabled,
        aiPersona,
        geminiApiKeys,
        replyInGeneral,
        isUserBotConnected,
        sessionStartTime: session?.sessionStartTime || sessionStartTime,
        lastLoginTime,
        apiId,
        apiHash,
        defaultPhone,
        targetGroupId,
        loginUser, sessionHistory: await SessionHistory.find({ account_id: accountId }).sort({ end_time: -1 }).limit(10),
        telegramBotToken: (await getSetting("telegram_bot_token", accountId))?.value || (accountId === 'default' ? process.env.TELEGRAM_BOT_TOKEN : "") || "",
        botInfo: currentBotInfo,
      });
    } catch (err: any) {
      console.error("Error in /api/stats:", err);
      await saveLog(err.message, 'error', 'API', '/api/stats');
      res.status(500).json({ error: `[GET /api/stats] ${err.message}` });
    }
  });

  // Consolidated App State Endpoint - Single roundtrip to eliminate rate limits completely
  app.get("/api/app-state", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      
      const [
        topicCount,
        todayTopicCount,
        todayPhotoSentStats,
        past24hPhotoSentStats,
        keywords,
        blockedTopics,
        missedCount,
        logs,
        accountsDoc,
        activeDoc,
        lastBatch
      ] = await Promise.all([
        getTopicCount(accountId).catch(() => 0),
        getTodayTopicCount(accountId).catch(() => 0),
        getTodayPhotoSentStats(accountId).catch(() => 0),
        getPast24hPhotoSentStats(accountId).catch(() => 0),
        Keyword.find(getAccountFilter(accountId)).lean().catch(() => []),
        BlockedTopic.find(getAccountFilter(accountId)).sort({ created_at: -1 }).lean().catch(() => []),
        MissedTrigger.countDocuments({ processed: false, ...getAccountFilter(accountId) }).catch(() => 0),
        Log.find({}).sort({ timestamp: -1 }).limit(50).lean().catch(() => []),
        AccountProfile.find().sort({ created_at: 1 }).lean().catch(() => []),
        getSetting("active_account_id"),
        ImportBatch.findOne(getAccountFilter(accountId)).sort({ imported_at: -1, _id: -1 }).lean().catch(() => null)
      ]);

      const appLogo = (await getSetting("app_logo", accountId))?.value || "";
      const autoReply = (await getSetting("auto_reply", accountId))?.value || "";
      const autoReply2Enabled = (await getSetting("auto_reply_2_enabled", accountId))?.value === "true";
      const autoReply2 = (await getSetting("auto_reply_2", accountId))?.value || "";
      const autoReply2Delay = parseInt((await getSetting("auto_reply_2_delay", accountId))?.value || "1", 10);
      const delaySeconds = parseInt((await getSetting("delay_seconds", accountId))?.value || "0", 10);
      const keywordDelaySeconds = parseInt((await getSetting("keyword_delay_seconds", accountId))?.value || "0", 10);
      const isSystemPaused = (await getSetting("system_paused", accountId))?.value === "true";
      const photoReplyEnabled = (await getSetting("photo_reply_enabled", accountId))?.value === "true";
      const photoReplyMessage = (await getSetting("photo_reply_message", accountId))?.value || "ok wait";
      const photoReplyMessage2Enabled = (await getSetting("photo_reply_message_2_enabled", accountId))?.value === "true";
      const photoReplyMessage2 = (await getSetting("photo_reply_message_2", accountId))?.value || "second message";
      const photoReplyMessage2StartTime = (await getSetting("photo_reply_message_2_start_time", accountId))?.value || "";
      const photoReplyMessage2EndTime = (await getSetting("photo_reply_message_2_end_time", accountId))?.value || "";
      const photoReplyMax = parseInt((await getSetting("photo_reply_max", accountId))?.value || "2", 10);
      const notificationSoundEnabled = (await getSetting("notification_sound_enabled", accountId))?.value === "true";
      const notificationSoundType = (await getSetting("notification_sound_type", accountId))?.value || "default";
      const topicIcon = (await getSetting("topic_icon", accountId))?.value || "✅";
      const topicRenameEmoji = (await getSetting("topic_rename_emoji", accountId))?.value || "🛑";
      const topicRenameKeywords = (await getSetting("topic_rename_keywords", accountId))?.value || "";
      const topicRenameMatchMode = (await getSetting("topic_rename_match_mode", accountId))?.value || "exact";
      const autoResetKeywords = (await getSetting("auto_reset_keywords", accountId))?.value === "true";
      const autoBlockKeywords = (await getSetting("auto_block_keywords", accountId))?.value || "";
      const aiModeEnabled = (await getSetting("ai_mode_enabled", accountId))?.value === "true";
      const aiPersona = (await getSetting("ai_persona", accountId))?.value || "";
      const geminiApiKeys = (await getSetting("gemini_api_keys", accountId))?.value || "[]";
      const replyInGeneral = (await getSetting("reply_in_general", accountId))?.value === "true";
      const lastLoginTime = (await getSetting("last_login_time", accountId))?.value || "";
      const targetGroupId = (await getSetting("telegram_group_ids", accountId))?.value || (accountId === 'default' ? process.env.TELEGRAM_GROUP_ID : "") || "";
      
      const session = accountClients.get(accountId);
      const client = session?.client || (accountId === 'default' ? userClient : null);
      let isUserBotConnected = !!client && (session ? true : cachedAuthStatus);

      const apiId = (await getSetting("api_id", accountId))?.value || "";
      const apiHash = (await getSetting("api_hash", accountId))?.value || "";
      const defaultPhone = (await getSetting("default_phone", accountId))?.value || "";

      let loginUser = session?.loginUser || null;

      // Accounts formatting
      let accountsList = accountsDoc || [];
      if (!accountsList.some((a: any) => a.account_id === 'default')) {
        accountsList = [{
          account_id: 'default',
          name: 'Main Account',
          avatar_color: 'from-blue-600 to-indigo-600',
          is_main: true
        } as any, ...accountsList];
      }
      const activeAccountId = activeDoc?.value || 'default';
      const enrichedAccounts = accountsList.map((acc: any) => {
        const accSession = accountClients.get(acc.account_id);
        const isClientActive = !!(accSession?.client || (acc.account_id === 'default' && userClient && cachedAuthStatus));
        const liveUser = accSession?.loginUser;
        return {
          id: acc.account_id,
          name: acc.name,
          avatarColor: acc.avatar_color,
          isMain: !!acc.is_main,
          lockPin: acc.lock_pin || '',
          phone: acc.phone || liveUser?.phone || '',
          telegramName: acc.telegram_name || (liveUser ? [liveUser.firstName, liveUser.lastName].filter(Boolean).join(' ') : ''),
          telegramUsername: acc.telegram_username || liveUser?.username || '',
          isConnected: isClientActive,
          createdAt: acc.created_at,
          updatedAt: acc.updated_at,
          isActive: acc.account_id === activeAccountId
        };
      });

      // Last import info
      const totalKeywords = keywords.length;
      const latestKw = keywords.length > 0 ? keywords[keywords.length - 1] : null;
      const latestRuleName = latestKw ? (latestKw.keyword || (latestKw.keywords && latestKw.keywords[0]) || 'Rule') : '';
      let lastImportInfo: any = {
        hasLastImport: false,
        batchId: null,
        importedAt: null,
        count: 0,
        names: [],
        latestRuleName,
        totalRules: totalKeywords
      };
      if (lastBatch) {
        lastImportInfo = {
          hasLastImport: true,
          batchId: lastBatch.batch_id,
          importedAt: lastBatch.imported_at,
          count: lastBatch.count,
          names: lastBatch.keyword_names ? lastBatch.keyword_names.slice(0, 10) : [],
          latestRuleName,
          totalRules: totalKeywords
        };
      }

      const stats = {
        topicCount,
        appLogo,
        todayTopicCount,
        todayPhotoSentStats,
        past24hPhotoSentStats,
        keywordCount: keywords.length,
        autoReply,
        autoReply2Enabled,
        autoReply2,
        autoReply2Delay,
        delaySeconds,
        keywordDelaySeconds,
        isSystemPaused,
        photoReplyEnabled,
        photoReplyMessage,
        photoReplyMessage2Enabled,
        photoReplyMessage2,
        photoReplyMessage2StartTime,
        photoReplyMessage2EndTime,
        photoReplyMax,
        notificationSoundEnabled,
        notificationSoundType,
        topicIcon,
        topicRenameEmoji,
        topicRenameKeywords,
        topicRenameMatchMode,
        autoResetKeywords,
        autoBlockKeywords,
        aiModeEnabled,
        aiPersona,
        geminiApiKeys,
        replyInGeneral,
        isUserBotConnected,
        sessionStartTime: session?.sessionStartTime || sessionStartTime,
        lastLoginTime,
        apiId,
        apiHash,
        defaultPhone,
        targetGroupId,
        loginUser,
        telegramBotToken: (await getSetting("telegram_bot_token", accountId))?.value || (accountId === 'default' ? process.env.TELEGRAM_BOT_TOKEN : "") || "",
        botInfo: currentBotInfo,
      };

      res.json({
        success: true,
        stats,
        keywords,
        blockedTopics,
        accounts: enrichedAccounts,
        activeAccountId,
        missedCount,
        logs,
        lastImportInfo,
        serverTime: Date.now()
      });
    } catch (err: any) {
      console.error("Error in /api/app-state:", err);
      res.status(500).json({ error: `[GET /api/app-state] ${err.message}` });
    }
  });

  app.get("/api/bot-info", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const token = (await getSetting("telegram_bot_token", accountId))?.value || (accountId === 'default' ? process.env.TELEGRAM_BOT_TOKEN : "") || "";
      if (!token) {
        return res.json({ token: "", bot: null });
      }
      if (currentBotInfo && bot) {
        return res.json({ token, bot: currentBotInfo });
      }
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const data = await response.json();
        if (data.ok) {
          const fetchedBot = {
            id: data.result.id,
            firstName: data.result.first_name || "Bot",
            username: data.result.username || ""
          };
          currentBotInfo = fetchedBot;
          return res.json({ token, bot: fetchedBot });
        } else {
          return res.json({ token, bot: null, error: data.description });
        }
      } catch (fErr: any) {
        return res.json({ token, bot: null, error: fErr.message });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const { 
        autoReply, 
        autoReply2Enabled,
        autoReply2,
        autoReply2Delay,
        delaySeconds, 
        keywordDelaySeconds,
        apiId, 
        apiHash, 
        systemPaused, 
        photoReplyEnabled, 
        photoReplyMessage, 
        photoReplyMessage2Enabled, 
        photoReplyMessage2, 
        photoReplyMax, 
        notificationSoundEnabled, 
        notificationSoundType, 
        topicIcon, 
        topicRenameEmoji,
        topicRenameKeywords, 
        topicRenameMatchMode, 
        autoResetKeywords, 
        autoBlockKeywords, 
        aiModeEnabled, 
        aiPersona, 
        geminiApiKeys, 
        replyInGeneral,
        photoReplyMessage2StartTime,
        photoReplyMessage2EndTime,
        targetGroupId,
        telegramBotToken,
        globalApprovalMode, appLogo } = req.body;
      const promises: Promise<any>[] = [];
      if (typeof autoReply === "string") promises.push(setSetting("auto_reply", autoReply, accountId));
      if (typeof autoReply2Enabled !== "undefined") promises.push(setSetting("auto_reply_2_enabled", String(autoReply2Enabled), accountId));
      if (typeof autoReply2 === "string") promises.push(setSetting("auto_reply_2", autoReply2, accountId));
      if (typeof autoReply2Delay !== "undefined") promises.push(setSetting("auto_reply_2_delay", String(autoReply2Delay), accountId));
      if (typeof delaySeconds !== "undefined") promises.push(setSetting("delay_seconds", String(delaySeconds), accountId));
      if (typeof keywordDelaySeconds !== "undefined") promises.push(setSetting("keyword_delay_seconds", String(keywordDelaySeconds), accountId));
      if (typeof apiId !== "undefined") promises.push(setSetting("api_id", String(apiId), accountId));
      if (typeof apiHash !== "undefined") promises.push(setSetting("api_hash", String(apiHash), accountId));
      if (typeof systemPaused !== "undefined") promises.push(setSetting("system_paused", String(systemPaused), accountId));
      if (typeof photoReplyEnabled !== "undefined") promises.push(setSetting("photo_reply_enabled", String(photoReplyEnabled), accountId));
      if (typeof photoReplyMessage !== "undefined") promises.push(setSetting("photo_reply_message", String(photoReplyMessage), accountId));
      if (typeof photoReplyMessage2Enabled !== "undefined") promises.push(setSetting("photo_reply_message_2_enabled", String(photoReplyMessage2Enabled), accountId));
      if (typeof photoReplyMessage2 !== "undefined") promises.push(setSetting("photo_reply_message_2", String(photoReplyMessage2), accountId));
      if (typeof photoReplyMax !== "undefined") promises.push(setSetting("photo_reply_max", String(photoReplyMax), accountId));
      if (typeof notificationSoundEnabled !== "undefined") promises.push(setSetting("notification_sound_enabled", String(notificationSoundEnabled), accountId));
      if (typeof notificationSoundType !== "undefined") promises.push(setSetting("notification_sound_type", String(notificationSoundType), accountId));
      if (typeof topicIcon !== "undefined") promises.push(setSetting("topic_icon", String(topicIcon), accountId));
      if (typeof topicRenameEmoji !== "undefined") promises.push(setSetting("topic_rename_emoji", String(topicRenameEmoji), accountId));
      if (typeof topicRenameKeywords !== "undefined") promises.push(setSetting("topic_rename_keywords", String(topicRenameKeywords), accountId));
      if (typeof topicRenameMatchMode !== "undefined") promises.push(setSetting("topic_rename_match_mode", String(topicRenameMatchMode), accountId));
      if (typeof autoResetKeywords !== "undefined") promises.push(setSetting("auto_reset_keywords", String(autoResetKeywords), accountId));
      if (typeof autoBlockKeywords !== "undefined") promises.push(setSetting("auto_block_keywords", String(autoBlockKeywords), accountId));
      if (typeof aiModeEnabled !== "undefined") promises.push(setSetting("ai_mode_enabled", String(aiModeEnabled), accountId));
      if (typeof aiPersona !== "undefined") promises.push(setSetting("ai_persona", String(aiPersona), accountId));
      if (typeof geminiApiKeys !== "undefined") promises.push(setSetting("gemini_api_keys", String(geminiApiKeys), accountId));
      if (typeof replyInGeneral !== "undefined") promises.push(setSetting("reply_in_general", String(replyInGeneral), accountId));
      if (typeof photoReplyMessage2StartTime === "string") promises.push(setSetting("photo_reply_message_2_start_time", photoReplyMessage2StartTime, accountId));
      if (typeof photoReplyMessage2EndTime === "string") promises.push(setSetting("photo_reply_message_2_end_time", photoReplyMessage2EndTime, accountId));
      if (typeof targetGroupId !== "undefined") promises.push(setSetting("telegram_group_ids", String(targetGroupId), accountId));
      if (typeof globalApprovalMode !== "undefined") promises.push(setSetting("global_approval_mode", String(globalApprovalMode), accountId));
      if (typeof appLogo !== "undefined") {
        promises.push(setSetting("app_logo", String(appLogo), accountId));
        if (accountId !== "default") {
          promises.push(setSetting("app_logo", String(appLogo), "default"));
        }
      }
      
      if (typeof telegramBotToken !== "undefined") {
        const oldToken = (await getSetting("telegram_bot_token", accountId))?.value;
        if (telegramBotToken && telegramBotToken !== oldToken) {
          promises.push(setSetting("telegram_bot_token", telegramBotToken, accountId));
          console.log("Telegram Bot Token updated. Restarting bot...");
        }
      }
      
      await Promise.all(promises);
      await refreshSettingsCache();

      if (typeof telegramBotToken !== "undefined") {
        const currentToken = (await getSetting("telegram_bot_token", accountId))?.value;
        const oldToken = settingsCache[accountId]?.["telegram_bot_token"];
        if (telegramBotToken && (!bot || telegramBotToken !== oldToken)) {
           await initBot(telegramBotToken);
        }
      }
      
      await saveLog("Settings updated", 'info', 'API', '/api/settings', { autoReply, delaySeconds, keywordDelaySeconds, apiId, systemPaused, photoReplyEnabled, photoReplyMessage2Enabled, photoReplyMax, notificationSoundEnabled, notificationSoundType, topicIcon, topicRenameEmoji, topicRenameKeywords, topicRenameMatchMode, autoResetKeywords, autoBlockKeywords, aiModeEnabled, replyInGeneral, photoReplyMessage2StartTime, photoReplyMessage2EndTime }, accountId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in /api/settings:", err);
      await saveLog(err.message, 'error', 'API', '/api/settings', req.body);
      res.status(500).json({ error: `[POST /api/settings] ${err.message}` });
    }
  });

  app.post("/api/verify-gemini", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey) {
        return res.status(400).json({ success: false, error: "API Key is required" });
      }

      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: "Hello" }] }]
      });
      
      if (response && response.text) {
        res.json({ success: true });
      } else {
        res.json({ success: false, error: "No response from Gemini" });
      }
    } catch (err: any) {
      console.error("Gemini Verification Error:", err);
      let errorMessage = err.message;
      if (err.message?.includes("API key not valid") || err.toString().includes("API_KEY_INVALID")) {
        errorMessage = "Invalid API Key";
      }
      res.json({ success: false, error: errorMessage });
    }
  });

  // Get Available Telegram Groups - STRICTLY restricted to registered Target Groups from Settings
  app.get("/api/groups", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const rawSetting = (await getSetting("telegram_group_ids", accountId))?.value || (accountId === 'default' ? process.env.TELEGRAM_GROUP_ID : "") || "";
      const registeredGroups = parseRegisteredGroups(rawSetting, accountId);

      if (registeredGroups.length === 0) {
        return res.json({ groups: [] });
      }

      // Title resolvers ONLY for the explicitly registered groups
      const titleMap = new Map<string, string>();

      // 1. Check DB Topics ONLY for matching registered IDs
      try {
        const dbTopics = await Topic.find(getAccountFilter(accountId)).limit(200);
        for (const t of dbTopics) {
          if (t.chat_id && t.name) {
            const norm = t.chat_id.replace(/^-100|^ -100|^-/, "").trim();
            if (!titleMap.has(norm)) {
              titleMap.set(norm, t.name);
            }
          }
        }
      } catch (e) {}

      // 2. Check Telegram User Client dialogs ONLY for matching registered IDs
      const session = accountClients.get(accountId);
      const client = session?.client || (accountId === 'default' ? userClient : null);
      if (client && client.connected) {
        try {
          const dialogs = await client.getDialogs({ limit: 100 });
          for (const d of dialogs) {
            const rawId = d.id?.toString() || "";
            const norm = rawId.replace(/^-100|^ -100|^-/, "").trim();
            const entityTitle = (d.entity as any)?.title || d.title;
            if (norm && entityTitle && !titleMap.has(norm)) {
              titleMap.set(norm, entityTitle);
            }
          }
        } catch (e) {
          console.error("Error fetching dialog titles for registered groups:", e);
        }
      }

      // Build strictly filtered group list with human-readable titles
      const groups = registeredGroups.map(reg => {
        let bestTitle = reg.title;
        // If title is just the ID or normalized ID, see if we resolved a friendly title
        if (bestTitle === reg.id || bestTitle === reg.normalizedId) {
          const resolved = titleMap.get(reg.normalizedId);
          if (resolved) {
            bestTitle = resolved;
          }
        }
        return {
          id: reg.id,
          normalizedId: reg.normalizedId,
          title: bestTitle && bestTitle !== reg.id ? bestTitle : `Group ${reg.id}`
        };
      });

      res.json({ groups });
    } catch (err: any) {
      res.status(500).json({ error: `[GET /api/groups] ${err.message}` });
    }
  });

  // Keyword Routes
  app.get("/api/keywords", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const keywords = await Keyword.find(getAccountFilter(accountId));
      res.json(keywords);
    } catch (err: any) {
      res.status(500).json({ error: `[GET /api/keywords] ${err.message}` });
    }
  });

  app.post("/api/keywords", async (req, res) => {
    const accountId = getAccountId(req);
    const { id, keyword, keywords, reply, photo, message_link, message_links, max_replies, match_mode, ai_reply_enabled, approval_mode, notify_on_hit, target_groups } = req.body;
    try {
      // Ensure keywords is an array
      const keywordsArray = Array.isArray(keywords) ? keywords : (keyword ? [keyword] : []);
      const targetGroupsArray = Array.isArray(target_groups) ? target_groups : [];
      
      const updateData = { 
        keyword, // Keep legacy
        keywords: keywordsArray, 
        reply, 
        photo: photo || "", 
        message_link: message_link || "", 
        message_links,
        max_replies: typeof max_replies === 'number' ? max_replies : 0,
        match_mode: match_mode || 'exact',
        ai_reply_enabled: !!ai_reply_enabled,
        approval_mode: !!approval_mode,
        notify_on_hit: !!notify_on_hit,
        target_groups: targetGroupsArray,
        account_id: accountId || 'default'
      };
      
      if (id) {
        await Keyword.findOneAndUpdate({ _id: id, ...getAccountFilter(accountId) }, updateData);
      } else {
        await Keyword.create(updateData);
      }
      
      // Refresh cache before responding to ensure next message uses updated rules
      await refreshKeywordCache();
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: `[POST /api/keywords] ${err.message}` });
    }
  });

  app.put("/api/keywords/:id/approval", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const { approval_mode } = req.body;
      await Keyword.findOneAndUpdate({ _id: req.params.id, ...getAccountFilter(accountId) }, { approval_mode: !!approval_mode });
      await refreshKeywordCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: `[PUT /api/keywords/approval] ${err.message}` });
    }
  });

  app.delete("/api/keywords/:id", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      await Keyword.findOneAndDelete({ _id: req.params.id, ...getAccountFilter(accountId) });
      await refreshKeywordCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: `[DELETE /api/keywords] ${err.message}` });
    }
  });

  app.put("/api/keywords/:id", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const updateData: any = {};
      if (typeof req.body.enabled !== 'undefined') updateData.enabled = req.body.enabled;
      if (typeof req.body.approval_mode !== 'undefined') updateData.approval_mode = !!req.body.approval_mode;
      if (typeof req.body.notify_on_hit !== 'undefined') updateData.notify_on_hit = !!req.body.notify_on_hit;
      await Keyword.findOneAndUpdate({ _id: req.params.id, ...getAccountFilter(accountId) }, updateData);
      await refreshKeywordCache();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: `[PUT /api/keywords] ${err.message}` });
    }
  });

  // Approval Endpoints
  app.get("/api/approvals", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Auto-expire older pending approvals in DB
      await PendingApproval.updateMany(
        { status: 'pending', created_at: { $lt: twentyFourHoursAgo } },
        { $set: { status: 'expired', processed_at: new Date() } }
      ).catch(() => {});

      const approvals = await PendingApproval.find({
        status: 'pending',
        created_at: { $gte: twentyFourHoursAgo },
        ...getAccountFilter(accountId)
      }).sort({ created_at: -1 });

      res.json(approvals);
    } catch (err: any) {
      res.status(500).json({ error: `[GET /api/approvals] ${err.message}` });
    }
  });

  app.post("/api/approvals/:id/decide", async (req, res) => {
    const accountId = getAccountId(req);
    const { action } = req.body; // 'approve' or 'reject'
    const { id } = req.params;
    
    try {
      const approval = await PendingApproval.findOne({ _id: id, ...getAccountFilter(accountId) }).populate('rule_id');
      const is24hExpired = approval && approval.created_at && (Date.now() - new Date(approval.created_at).getTime() > 24 * 60 * 60 * 1000);

      if (!approval || approval.status !== 'pending' || is24hExpired) {
        if (approval && approval.status === 'pending' && is24hExpired) {
          approval.status = 'expired';
          await approval.save().catch(() => {});
          sendSseEvent('approval_processed', { id, status: 'expired' });
        }
        return res.status(400).json({ error: "Approval request has expired (24 hours passed) or already processed." });
      }
      
      if (action === 'approve') {
        await executeApprovedReply(approval);

        approval.status = 'approved';
        approval.processed_at = new Date();
        await approval.save();

        sendSseEvent('approval_processed', { id, status: 'approved' });
      } else {
        approval.status = 'rejected';
        approval.processed_at = new Date();
        await approval.save();

        sendSseEvent('approval_processed', { id, status: 'rejected' });
      }

      // Update Telegram Bot message to remove buttons
      if (bot && approval.bot_chat_id && approval.bot_message_id) {
        const text = action === 'approve'
          ? `✅ <b>Approved & Reply Sent! (Via Dashboard)</b>\n\n<b>Keyword:</b> <code>${escapeHtml(approval.matched_keyword)}</code>\n<b>Group:</b> ${escapeHtml(approval.chat_title || 'Group')}\n<b>Topic:</b> ${escapeHtml(approval.topic_name || 'Topic')}`
          : `❌ <b>Not Approved / Rejected (Via Dashboard)</b>\n\n<b>Keyword:</b> <code>${escapeHtml(approval.matched_keyword)}</code>\n<b>Group:</b> ${escapeHtml(approval.chat_title || 'Group')}\n<b>Topic:</b> ${escapeHtml(approval.topic_name || 'Topic')}`;

        bot.editMessageText(text, {
          chat_id: approval.bot_chat_id,
          message_id: approval.bot_message_id,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] }
        }).catch(e => console.error("Failed to edit Telegram bot message from API:", e.message));
      }
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("API Approval decision error:", err);
      res.status(500).json({ error: `[POST /api/approvals/decide] ${err.message}` });
    }
  });

  // Export/Import Routes
  app.get("/api/data/export", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const keywords = await Keyword.find(getAccountFilter(accountId));
      const settings = await Setting.find({ key: { $ne: "session_string" }, ...getAccountFilter(accountId) }); // Don't export session string
      const blockedTopics = await BlockedTopic.find(getAccountFilter(accountId));
      const topics = await Topic.find(getAccountFilter(accountId));
      const accountProfiles = await AccountProfile.find(getAccountFilter(accountId));
      res.json({ keywords, settings, blockedTopics, topics, accountProfiles });
    } catch (err: any) {
      res.status(500).json({ error: `[GET /api/data/export] ${err.message}` });
    }
  });

  app.post("/api/data/import", express.json({ limit: '25mb' }), async (req, res) => {
    try {
      const accountId = getAccountId(req);
      let keywordsList: any[] = [];
      let settingsList: any[] = [];
      let blockedTopicsList: any[] = [];
      let topicsList: any[] = [];
      let accountProfilesList: any[] = [];

      if (Array.isArray(req.body)) {
        keywordsList = req.body;
      } else if (req.body && typeof req.body === 'object') {
        if (Array.isArray(req.body.keywords)) {
          keywordsList = req.body.keywords;
        } else if (Array.isArray(req.body.rules)) {
          keywordsList = req.body.rules;
        } else if (Array.isArray(req.body.data)) {
          keywordsList = req.body.data;
        } else if (Array.isArray(req.body.items)) {
          keywordsList = req.body.items;
        } else if (Array.isArray(req.body.list)) {
          keywordsList = req.body.list;
        }

        if (Array.isArray(req.body.settings)) {
          settingsList = req.body.settings;
        }
        if (Array.isArray(req.body.blockedTopics)) {
          blockedTopicsList = req.body.blockedTopics;
        } else if (Array.isArray(req.body.blocked_topics)) {
          blockedTopicsList = req.body.blocked_topics;
        }
        if (Array.isArray(req.body.topics)) {
          topicsList = req.body.topics;
        }
        if (Array.isArray(req.body.accountProfiles)) {
          accountProfilesList = req.body.accountProfiles;
        } else if (Array.isArray(req.body.account_profiles)) {
          accountProfilesList = req.body.account_profiles;
        }
      }

      const areArraysEqual = (a: any[], b: any[]) => {
        if (!a || !b) return a === b;
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, index) => val === sortedB[index]);
      };

      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const importedKeywordIds: any[] = [];
      const importedKeywordNames: string[] = [];

      if (keywordsList && keywordsList.length > 0) {
        for (const kw of keywordsList) {
          if (!kw || typeof kw !== 'object') continue;
          const kwIdentifier = kw.keyword || (kw.keywords && kw.keywords[0]) || '';
          const matchQuery: any = { ...getAccountFilter(accountId) };
          if (kwIdentifier) {
            matchQuery.$or = [
              { keyword: kwIdentifier },
              ...(kw.keywords && kw.keywords.length > 0 ? [{ keywords: { $in: kw.keywords } }] : [])
            ];
          } else if (kw._id) {
            matchQuery._id = kw._id;
          }

          // Smart Duplicate Check: Skip if the exact same rule already exists
          const existingKw = await Keyword.findOne(matchQuery);
          if (existingKw) {
            const keywordsSame = areArraysEqual(existingKw.keywords || [], kw.keywords || (kw.keyword ? [kw.keyword] : []));
            const targetGroupsSame = areArraysEqual(existingKw.target_groups || [], kw.target_groups || []);
            const messageLinksSame = areArraysEqual(existingKw.message_links || [], kw.message_links || []);
            
            const isSame = 
              existingKw.keyword === kwIdentifier &&
              keywordsSame &&
              (existingKw.reply || '') === (kw.reply || '') &&
              (existingKw.photo || '') === (kw.photo || '') &&
              (existingKw.message_link || '') === (kw.message_link || '') &&
              (existingKw.match_mode || 'exact') === (kw.match_mode || 'exact') &&
              (existingKw.max_replies !== undefined ? existingKw.max_replies : 2) === (kw.max_replies !== undefined ? kw.max_replies : 2) &&
              !!existingKw.ai_reply_enabled === !!kw.ai_reply_enabled &&
              !!existingKw.approval_mode === !!kw.approval_mode &&
              !!existingKw.notify_on_hit === !!kw.notify_on_hit &&
              (existingKw.enabled !== undefined ? existingKw.enabled : true) === (kw.enabled !== undefined ? kw.enabled : true) &&
              targetGroupsSame &&
              messageLinksSame;

            if (isSame) {
              // Exact match found - skip writing to database for efficiency and zero duplication
              continue;
            }
          }

          const doc = await Keyword.findOneAndUpdate(
            matchQuery,
            { 
              keyword: kwIdentifier,
              keywords: kw.keywords || (kw.keyword ? [kw.keyword] : []),
              reply: kw.reply || '', 
              photo: kw.photo || '', 
              message_link: kw.message_link || '',
              message_links: kw.message_links || [],
              max_replies: kw.max_replies !== undefined ? kw.max_replies : 2,
              match_mode: kw.match_mode || 'exact',
              ai_reply_enabled: !!kw.ai_reply_enabled,
              approval_mode: !!kw.approval_mode,
              notify_on_hit: !!kw.notify_on_hit,
              target_groups: kw.target_groups || [],
              enabled: kw.enabled !== undefined ? kw.enabled : true,
              last_import_batch_id: batchId,
              account_id: accountId || 'default'
            },
            { upsert: true, new: true }
          );

          if (doc) {
            importedKeywordIds.push(doc._id);
            importedKeywordNames.push(kwIdentifier || (kw.keywords && kw.keywords.join(', ')) || 'Rule');
          }
        }
      }

      if (settingsList && settingsList.length > 0) {
        for (const s of settingsList) {
          if (s.key && s.key !== "session_string") {
            const currentSetting = await getSetting(s.key, accountId);
            if (currentSetting && currentSetting.value === s.value) {
              // Value is identical - skip update to avoid redundant writes
              continue;
            }
            await setSetting(s.key, s.value, accountId);
          }
        }
      }

      if (blockedTopicsList && blockedTopicsList.length > 0) {
        for (const bt of blockedTopicsList) {
          if (bt.telegram_topic_id) {
            const existingBt = await BlockedTopic.findOne({ telegram_topic_id: bt.telegram_topic_id, ...getAccountFilter(accountId) });
            if (existingBt && existingBt.name === bt.name && existingBt.link === bt.link) {
              // Identical - skip
              continue;
            }
            await BlockedTopic.findOneAndUpdate(
              { telegram_topic_id: bt.telegram_topic_id, ...getAccountFilter(accountId) },
              { name: bt.name || '', link: bt.link || '', account_id: accountId || 'default' },
              { upsert: true }
            );
            addBlockedTopicToCache(bt.telegram_topic_id, accountId);
          }
        }
      }

      if (topicsList && topicsList.length > 0) {
        for (const t of topicsList) {
          if (t.telegram_topic_id) {
            const existingT = await Topic.findOne({ telegram_topic_id: t.telegram_topic_id, ...getAccountFilter(accountId) });
            if (existingT && existingT.name === t.name && existingT.chat_id === t.chat_id) {
              // Identical - skip
              continue;
            }
            await Topic.findOneAndUpdate(
              { telegram_topic_id: t.telegram_topic_id, ...getAccountFilter(accountId) },
              { name: t.name || '', chat_id: t.chat_id || '', account_id: accountId || 'default' },
              { upsert: true }
            );
          }
        }
      }

      if (accountProfilesList && accountProfilesList.length > 0) {
        for (const ap of accountProfilesList) {
          if (ap.account_id) {
            const existingAp = await AccountProfile.findOne({ account_id: ap.account_id });
            if (existingAp && 
                existingAp.name === ap.name && 
                existingAp.phone === ap.phone && 
                existingAp.avatar_color === ap.avatar_color && 
                existingAp.is_main === ap.is_main && 
                existingAp.telegram_name === ap.telegram_name && 
                existingAp.telegram_username === ap.telegram_username) {
              // Identical - skip
              continue;
            }
            await AccountProfile.findOneAndUpdate(
              { account_id: ap.account_id },
              { 
                name: ap.name || 'Account', 
                phone: ap.phone || '', 
                avatar_color: ap.avatar_color || 'from-blue-600 to-indigo-600', 
                is_main: !!ap.is_main,
                telegram_name: ap.telegram_name || '',
                telegram_username: ap.telegram_username || ''
              },
              { upsert: true }
            );
          }
        }
      }

      const rawFileName = req.body?.fileName || req.query?.fileName || '';
      const fallbackName = `Import_${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
      const fileNameToStore = typeof rawFileName === 'string' && rawFileName.trim() ? rawFileName.trim() : fallbackName;

      if (importedKeywordIds.length > 0 || settingsList.length > 0 || blockedTopicsList.length > 0) {
        await ImportBatch.create({
          account_id: accountId || 'default',
          batch_id: batchId,
          file_name: fileNameToStore,
          imported_at: new Date(),
          keyword_ids: importedKeywordIds,
          keyword_names: importedKeywordNames,
          count: importedKeywordIds.length + settingsList.length + blockedTopicsList.length
        });
      }

      await refreshKeywordCache();
      await refreshSettingsCache();
      await saveLog(`Imported complete backup data (${importedKeywordIds.length} rules, ${settingsList.length} settings, ${blockedTopicsList.length} blocked topics)`, 'info', 'API', '/api/data/import', undefined, accountId);
      res.json({ success: true, count: importedKeywordIds.length, batchId });
    } catch (err: any) {
      res.status(500).json({ error: `[POST /api/data/import] ${err.message}` });
    }
  });

  // UserBot Auth Routes
  app.post("/api/auth/send-code", async (req, res) => {
    const accountId = getAccountId(req);
    const { phone } = req.body;
    let apiIdRaw = (await getSetting("api_id", accountId))?.value || "";
    let apiHash = (await getSetting("api_hash", accountId))?.value || "";

    // Trim whitespace
    apiIdRaw = apiIdRaw.trim();
    apiHash = apiHash.trim();

    const apiId = parseInt(apiIdRaw, 10);

    if (!apiId || isNaN(apiId) || !apiHash) {
      return res.status(400).json({ error: "Valid API ID and Hash are required in settings." });
    }

    console.log(`Attempting login for account ${accountId} with API ID: ${apiId} (Hash length: ${apiHash.length})`);

    const authState = accountAuthStates.get(accountId) || {};
    if (authState.isConnecting || (accountId === 'default' && isConnecting)) {
      return res.status(429).json({ error: "Connection already in progress. Please wait." });
    }

    try {
      accountAuthStates.set(accountId, { ...authState, isConnecting: true });
      if (accountId === 'default') isConnecting = true;

      // Disconnect existing client for this account if any
      const existingSession = accountClients.get(accountId);
      if (existingSession) {
        try { await existingSession.client.disconnect(); } catch (e) {}
        if (accountClients.has(accountId)) { await recordSessionEnd(accountId, accountClients.get(accountId)?.sessionStartTime); }
                accountClients.delete(accountId);
      }
      if (accountId === 'default' && userClient) {
        try { await userClient.disconnect(); } catch (e) {}
        userClient = null;
      }

      const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
        connectionRetries: 5,
        deviceModel: "Desktop",
        systemVersion: "Windows 10",
        appVersion: "1.0.0",
      });
      await client.connect();
      const result = await client.sendCode({ apiId, apiHash }, phone);
      
      accountAuthStates.set(accountId, {
        phoneCodeHash: result.phoneCodeHash,
        phoneNumber: phone,
        isConnecting: false,
        client: client
      });
      if (accountId === 'default') {
        phoneCodeHash = result.phoneCodeHash;
        phoneNumber = phone;
      }

      await saveLog(`Auth code sent to ${phone}`, 'info', 'API', '/api/auth/send-code', undefined, accountId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("SendCode error:", err);
      await saveLog(err.message, 'error', 'API', '/api/auth/send-code', { phone, apiId }, accountId);
      res.status(500).json({ error: `[POST /api/auth/send-code] ${err.message}` });
    } finally {
      const state = accountAuthStates.get(accountId);
      if (state) state.isConnecting = false;
      if (accountId === 'default') isConnecting = false;
    }
  });

  app.post("/api/auth/signin", async (req, res) => {
    const accountId = getAccountId(req);
    const { code, password } = req.body;
    const session = accountClients.get(accountId);
    const authState = accountAuthStates.get(accountId);
    const client = session?.client || authState?.client || (accountId === 'default' ? userClient : null);
    const currentPhone = session?.phoneNumber || authState?.phoneNumber || (accountId === 'default' ? phoneNumber : null);
    const currentHash = session?.phoneCodeHash || authState?.phoneCodeHash || (accountId === 'default' ? phoneCodeHash : null);

    if (!client || !currentPhone || !currentHash) return res.status(400).json({ error: "Session not initialized" });

    try {
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber: currentPhone,
            phoneCodeHash: currentHash,
            phoneCode: code,
          })
        );
      } catch (err: any) {
        if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
          if (!password) {
            return res.status(401).json({ error: "2FA Password required" });
          }
          const apiIdRaw = (await getSetting("api_id", accountId))?.value || "";
          const apiHash = ((await getSetting("api_hash", accountId))?.value || "").trim();
          const apiId = parseInt(apiIdRaw.trim(), 10);
          
          await client.signInWithPassword({ apiId, apiHash }, {
            password: async () => password,
            onError: (err) => { throw err; }
          });
        } else {
          throw err;
        }
      }

      const sessionString = (client.session as StringSession).save();
      await setSetting("session_string", sessionString, accountId);
      const now = new Date().toISOString();
      await setSetting("last_login_time", now, accountId);
      
      const startTime = Date.now();
      if (accountId === 'default') {
        sessionStartTime = startTime;
        userClient = client;
      }
      accountClients.set(accountId, {
        accountId,
        client,
        sessionStartTime: startTime,
        phoneNumber: currentPhone
      });

      const targetGroupId = (await getSetting("telegram_group_ids", accountId))?.value || (accountId === 'default' ? process.env.TELEGRAM_GROUP_ID : "") || "";
      setupUserBotHandlers(client, targetGroupId, accountId);
      await saveLog(`UserBot signed in: ${currentPhone}`, 'info', 'API', '/api/auth/signin', undefined, accountId);
      res.json({ success: true });
    } catch (err: any) {
      await saveLog(err.message, 'error', 'API', '/api/auth/signin', { phoneNumber: currentPhone }, accountId);
      res.status(500).json({ error: `[POST /api/auth/signin] ${err.message}` });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const session = accountClients.get(accountId);
      if (session) {
        try { await session.client.disconnect(); } catch (e) {}
        if (accountClients.has(accountId)) { await recordSessionEnd(accountId, accountClients.get(accountId)?.sessionStartTime); }
                accountClients.delete(accountId);
      }
      if (accountId === 'default' && userClient) {
        try { await userClient.disconnect(); } catch (e) {}
        userClient = null;
        sessionStartTime = null;
      }
      await deleteSetting("session_string", accountId);
      await saveLog(`UserBot logged out`, 'info', 'API', '/api/auth/logout', undefined, accountId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: `[POST /api/auth/logout] ${err.message}` });
    }
  });

  app.get("/api/topics", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const topics = await Topic.find(getAccountFilter(accountId)).sort({ created_at: -1 });
      res.json(topics);
    } catch (err: any) {
      res.status(500).json({ error: `[GET /api/topics] ${err.message}` });
    }
  });

  app.get("/api/group/messages", async (req, res) => {
    console.log("Accessing /api/group/messages");
    if (!userClient || !userClient.connected) {
      console.log("UserBot not connected");
      return res.status(400).json({ error: "UserBot not connected" });
    }
    try {
      const { topicId } = req.query;
      const options: any = { limit: 50 };
      
      if (topicId) {
        options.replyTo = parseInt(topicId as string, 10);
      }

      const messages = await userClient.getMessages(groupId, options);
      if (!messages) {
        return res.json([]);
      }
      
      const formattedMessages = messages
        .filter(m => m && m.message) // Filter out empty messages
        .map((m: any) => ({
          id: m.id,
          text: m.message,
          date: m.date,
          senderId: m.senderId?.toString(),
          isOutgoing: m.out,
          replyToMsgId: m.replyTo?.replyToMsgId,
        }));
      res.json(formattedMessages.reverse()); // Reverse to show oldest first
    } catch (err: any) {
      console.error("Error fetching messages:", err);
      if (err.message?.includes("AUTH_KEY_UNREGISTERED")) {
        await deleteSetting("session_string");
        if (userClient) { try { await userClient.disconnect(); } catch (e) {} }
        userClient = null;
      } else if (err.message?.includes("TIMEOUT")) {
        console.log("Connection timed out. Will retry later.");
      }
      res.status(500).json({ error: `[GET /api/group/messages] ${err.message}` });
    }
  });

  app.get("/api/broadcast/status", (req, res) => {
    res.json(broadcastStatus);
  });

  app.post("/api/broadcast/cancel", (req, res) => {
    if (broadcastInProgress) {
      broadcastCancelled = true;
      res.json({ success: true, message: "Broadcast cancellation requested" });
    } else {
      res.status(400).json({ error: "No broadcast in progress" });
    }
  });

  app.post("/api/broadcast", async (req, res) => {
    const { message, target } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    if (broadcastInProgress) {
      return res.status(400).json({ error: "A broadcast is already in progress" });
    }

    try {
      const accountId = getAccountId(req);
      const client = getAccountClient(accountId) || userClient;

      if (client && client.connected) {
        const groupIdsSetting = getCachedSetting("telegram_group_ids", accountId) || groupId || "";
        const allowedGroupIds = groupIdsSetting.split(",").map(id => id.trim()).filter(id => id);

        if (target === 'general') {
          for (const gId of allowedGroupIds) {
            try {
              await client.sendMessage(gId, { message });
            } catch (err: any) {
              console.error(`Broadcast failed for general section in group ${gId}:`, err.message);
              await saveLog(`General broadcast failed for group ${gId}: ${err.message}`, 'error', 'API', '/api/broadcast', undefined, accountId);
            }
          }
          await saveLog("Broadcast sent to general section of allowed groups", 'info', 'API', '/api/broadcast', { messageLength: message.length }, accountId);
          return res.json({ success: true, message: "Broadcast sent to general section" });
        }

        const topics = await Topic.find(getAccountFilter(accountId));
        console.log(`Broadcast: Found ${topics.length} total topics for account ${accountId}.`);
        const filteredTopics = topics.filter(topic => !isTopicBlocked(topic.telegram_topic_id, accountId));
        console.log(`Broadcast: Found ${filteredTopics.length} topics after filtering blocked topics.`);

        if (filteredTopics.length === 0) {
          for (const gId of allowedGroupIds) {
            try {
              await client.sendMessage(gId, { message });
            } catch (err: any) {
              console.error(`Broadcast failed for main group ${gId}:`, err.message);
            }
          }
          await saveLog("Broadcast sent to main groups (no topics found)", 'info', 'API', '/api/broadcast', { messageLength: message.length }, accountId);
          return res.json({ success: true, message: "Sent to main groups (no topics found)" });
        }

        broadcastInProgress = true;
        broadcastCancelled = false;
        broadcastStatus = {
          total: filteredTopics.length,
          current: 0,
          status: 'running'
        };

        // Start broadcast in background
        (async () => {
          try {
            for (let i = 0; i < filteredTopics.length; i++) {
              if (broadcastCancelled) {
                broadcastStatus.status = 'cancelled';
                sendSseEvent('broadcast_update', { ...broadcastStatus, accountId });
                await saveLog("Broadcast cancelled", 'warn', 'API', '/api/broadcast', { processed: i, total: filteredTopics.length }, accountId);
                break;
              }

              const topic = filteredTopics[i];
              const destChatId = topic.chat_id || groupId;
              try {
                await client.sendMessage(destChatId, {
                  message,
                  replyTo: topic.telegram_topic_id
                });
                broadcastStatus.current = i + 1;
                sendSseEvent('broadcast_update', { ...broadcastStatus, accountId });
              } catch (err: any) {
                const waitMatch = err.message.match(/A wait of (\d+) seconds is required/);
                if (waitMatch) {
                  const waitTime = parseInt(waitMatch[1], 10);
                  console.warn(`Flood wait: Waiting for ${waitTime} seconds for topic ${topic.telegram_topic_id}...`);
                  await saveLog(`Flood wait: Waiting for ${waitTime} seconds for topic ${topic.telegram_topic_id}`, 'warn', 'API', '/api/broadcast', undefined, accountId);
                  await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                  
                  try {
                    await client.sendMessage(destChatId, {
                      message,
                      replyTo: topic.telegram_topic_id
                    });
                    broadcastStatus.current = i + 1;
                    sendSseEvent('broadcast_update', { ...broadcastStatus, accountId });
                  } catch (retryErr: any) {
                    console.error(`Failed to send broadcast to topic ${topic.telegram_topic_id} in ${destChatId} after retry:`, retryErr.message);
                    await saveLog(`Broadcast failed for topic ${topic.telegram_topic_id} in ${destChatId} after retry: ${retryErr.message}`, 'error', 'API', '/api/broadcast', undefined, accountId);
                  }
                } else {
                  console.error(`Failed to send broadcast to topic ${topic.telegram_topic_id} in ${destChatId}:`, err.message);
                  await saveLog(`Broadcast failed for topic ${topic.telegram_topic_id} in ${destChatId}: ${err.message}`, 'error', 'API', '/api/broadcast', undefined, accountId);
                }
              }

              await new Promise(resolve => setTimeout(resolve, 50));
            }

            if (!broadcastCancelled) {
              broadcastStatus.status = 'completed';
              sendSseEvent('broadcast_update', { ...broadcastStatus, accountId });
              await saveLog("Broadcast completed", 'info', 'API', '/api/broadcast', { total: filteredTopics.length }, accountId);
            }
          } catch (err: any) {
            console.error("Broadcast error:", err.message);
            broadcastStatus.status = 'error';
            sendSseEvent('broadcast_update', { ...broadcastStatus, accountId });
          } finally {
            broadcastInProgress = false;
          }
        })();

        res.json({ success: true, message: "Broadcast started" });
      } else {
        res.status(400).json({ error: "Telegram ID not logged in. Please login first." });
      }
    } catch (err: any) {
      await saveLog(err.message, 'error', 'API', '/api/broadcast');
      res.status(500).json({ error: `[POST /api/broadcast] ${err.message}` });
    }
  });

  app.get("/api/missed-list", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const missed = await MissedTrigger.find({ processed: false, ...getAccountFilter(accountId) }).sort({ timestamp: -1 });
      res.json({ missed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/missed-skip", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "ID is required" });
      await MissedTrigger.findOneAndUpdate({ _id: id, ...getAccountFilter(accountId) }, { processed: true });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/missed-skip-all", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      await MissedTrigger.updateMany({ processed: false, ...getAccountFilter(accountId) }, { processed: true });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/missed-count", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const count = await MissedTrigger.countDocuments({ processed: false, ...getAccountFilter(accountId) });
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cancel-catchup", (req, res) => {
    cancelCatchupFlag = true;
    res.json({ success: true });
  });

  app.post("/api/scan-missed", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const client = getAccountClient(accountId) || userClient;

      const isSystemPaused = (await getSetting("system_paused", accountId))?.value === "true";
      if (isSystemPaused) {
        return res.status(400).json({ error: "System is paused. Cannot scan for missed items." });
      }

      if (!client || !client.connected) {
        return res.status(400).json({ error: "Telegram client not connected" });
      }

      const groupIdsSetting = getCachedSetting("telegram_group_ids", accountId) || groupId || "";
      const allowedGroupIds = groupIdsSetting.split(",").map(id => id.trim()).filter(id => id);

      const missedItems = [];
      let newMissedCount = 0;
      const accountKeywords = await Keyword.find({ ...getAccountFilter(accountId), enabled: true });

      for (const currentGroupId of allowedGroupIds) {
        console.log(`Scanning first 50 topics for missed keywords in group ${currentGroupId} (Account: ${accountId})...`);
        try {
          const result = await client.invoke(
            new Api.channels.GetForumTopics({
              channel: await client.getInputEntity(currentGroupId),
              q: "",
              offsetDate: 0,
              offsetId: 0,
              offsetTopic: 0,
              limit: 50,
            })
          );

          const topics = (result as any).topics || [];
          const normalizedGroupId = currentGroupId.replace("-100", "");
          if (isTopicBlocked(Number(normalizedGroupId), accountId)) {
            console.log(`Skipping scan for blocked group: ${normalizedGroupId}`);
            continue;
          }

          for (const topic of topics) {
            const topicId = topic.id;
            const topicName = topic.title;
            const topicDate = topic.date ? new Date(topic.date * 1000) : undefined;

            await logTopic(topicId, topicName, currentGroupId, topicDate, accountId);

            if (isTopicBlocked(topicId, accountId)) {
              console.log(`Skipping blocked topic: ${topicId}`);
              continue;
            }

            const messages = await client.getMessages(currentGroupId, {
              replyTo: topicId,
              limit: 30,
            });

            if (!messages || messages.length === 0) continue;

            const botReplyMessageIds = new Set(
              messages.filter(m => m.out && m.replyTo?.replyToMsgId).map(m => m.replyTo!.replyToMsgId)
            );
            const latestBotReplyDate = Math.max(0, ...messages.filter(m => m.out).map(m => m.date));

            for (const msg of messages) {
              if (msg.out) continue;

              const isRepliedDirectly = botReplyMessageIds.has(msg.id);
              const isRepliedGenerally = latestBotReplyDate > msg.date;

              if (isRepliedDirectly || isRepliedGenerally) {
                continue;
              }

              if (msg.message) {
                const text = msg.message.toLowerCase().trim();
                const matches: { kw: any, index: number, matchedWord: string }[] = [];

                for (const kw of accountKeywords) {
                  if (kw.enabled === false) continue;
                  const triggerWords = [...(kw.keywords || [])];
                  if (kw.keyword && !triggerWords.includes(kw.keyword)) {
                    triggerWords.push(kw.keyword);
                  }

                  for (const word of triggerWords) {
                    const wordLower = word.toLowerCase().trim();
                    if (!wordLower) continue;

                    const escapedWord = escapeRegExp(wordLower);
                    let regex: RegExp;
                    
                    if (kw.match_mode === 'partial') {
                      regex = new RegExp(escapedWord, 'gi');
                    } else {
                      regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedWord}($|[^\\p{L}\\p{N}])`, 'gui');
                    }
                    
                    let match;
                    while ((match = regex.exec(text)) !== null) {
                      matches.push({ kw, index: match.index, matchedWord: wordLower });
                      break;
                    }
                  }
                }

                matches.sort((a, b) => a.index - b.index);

                if (matches.length > 0) {
                  const processedRuleIds = new Set<string>();

                  for (const match of matches) {
                    const kw = match.kw;
                    if (processedRuleIds.has(kw._id.toString())) continue;
                    processedRuleIds.add(kw._id.toString());

                    const existing = await MissedTrigger.findOne({ message_id: msg.id, chat_id: currentGroupId, rule_id: kw._id, ...getAccountFilter(accountId) });
                    if (!existing) {
                      const newTrigger = await MissedTrigger.create({
                        message_id: msg.id,
                        chat_id: currentGroupId,
                        topic_id: topicId,
                        text: msg.message,
                        matched_keyword: match.matchedWord,
                        rule_id: kw._id,
                        timestamp: new Date(msg.date * 1000),
                        processed: false,
                        account_id: accountId || 'default'
                      });
                      newMissedCount++;
                      missedItems.push({
                        _id: newTrigger._id,
                        topicName,
                        topicId,
                        keyword: match.matchedWord,
                        text: msg.message,
                        date: new Date(msg.date * 1000)
                      });
                    }
                  }
                }
              }
            }

            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (groupScanErr: any) {
          console.error(`Error scanning group ${currentGroupId}:`, groupScanErr.message);
          await saveLog(`Scan failed for group ${currentGroupId}: ${groupScanErr.message}`, 'error', 'API', '/api/scan-missed', undefined, accountId);
        }
      }

      res.json({ success: true, count: newMissedCount, items: missedItems });
    } catch (err: any) {
      console.error("Scan missed error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reply-single-missed", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const client = getAccountClient(accountId) || userClient;

      if (!client || !client.connected) {
        return res.status(400).json({ error: "Telegram client not connected" });
      }

      const { triggerId } = req.body;
      if (!triggerId) {
        return res.status(400).json({ error: "Trigger ID is required" });
      }

      const trigger = await MissedTrigger.findOne({ _id: triggerId, ...getAccountFilter(accountId) });
      if (!trigger || trigger.processed) {
        return res.status(404).json({ error: "Trigger not found or already processed" });
      }

      const kw = await Keyword.findOne({ _id: trigger.rule_id, ...getAccountFilter(accountId) });
      if (!kw) {
        trigger.processed = true;
        await trigger.save();
        return res.status(404).json({ error: "Keyword rule not found" });
      }

      const isSystemPaused = (await getSetting("system_paused", accountId))?.value === "true";
      if (isSystemPaused) {
        return res.status(400).json({ error: "Bot is paused. Unpause first to reply." });
      }

      const replyInGeneral = (await getSetting("reply_in_general", accountId))?.value === "true";
      const topMsgId = trigger.topic_id === 1 ? undefined : trigger.topic_id;
      const replyToMsgId = trigger.message_id;
      const replyTo = replyInGeneral ? undefined : (topMsgId || replyToMsgId);

      if (topMsgId && isTopicBlocked(topMsgId, accountId)) {
        return res.status(400).json({ error: "Cannot reply to a blocked topic." });
      }

      const linksToProcess = [...(kw.message_links || [])];
      if (kw.message_link && !linksToProcess.includes(kw.message_link)) {
        linksToProcess.push(kw.message_link);
      }
      const normalizedLinks = linksToProcess.map(l => l.trim()).filter(l => l).sort();

      let replySent = false;
      if (normalizedLinks.length > 0) {
        for (const link of normalizedLinks) {
          try {
            const parts = link.split("/").filter(p => p.length > 0);
            const messageId = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(messageId)) {
              let fromPeer: any = trigger.chat_id;
              if (link.includes("/c/")) {
                const cIndex = parts.indexOf("c");
                if (cIndex !== -1 && parts[cIndex + 1]) {
                  fromPeer = `-100${parts[cIndex + 1]}`;
                }
              } else {
                const tmeIndex = parts.indexOf("t.me");
                if (tmeIndex !== -1 && parts[tmeIndex + 1]) {
                  fromPeer = parts[tmeIndex + 1];
                } else if (parts.length >= 3) {
                  fromPeer = parts[2];
                }
              }

              let inputPeer = await client.getInputEntity(typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer);
              const toPeer = await client.getInputEntity(trigger.chat_id);
              await client.invoke(new Api.messages.ForwardMessages({
                fromPeer: inputPeer,
                id: [messageId],
                toPeer: toPeer,
                randomId: [BigInt(Math.floor(Math.random() * 1e15)) as any],
                topMsgId: replyInGeneral ? undefined : topMsgId,
              }) as any);
              replySent = true;
            }
          } catch (err) {
            console.error("Failed to forward message:", err);
            try {
              const parts = link.split("/").filter(p => p.length > 0);
              const messageId = parseInt(parts[parts.length - 1], 10);
              let fromPeer: any = trigger.chat_id;
              if (link.includes("/c/")) {
                const cIndex = parts.indexOf("c");
                if (cIndex !== -1 && parts[cIndex + 1]) {
                   fromPeer = `-100${parts[cIndex + 1]}`;
                }
              } else {
                const tmeIndex = parts.indexOf("t.me");
                if (tmeIndex !== -1 && parts[tmeIndex + 1]) {
                  fromPeer = parts[tmeIndex + 1];
                }
              }
              await client.forwardMessages(trigger.chat_id, {
                messages: [messageId],
                fromPeer: typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer,
                topMsgId: replyInGeneral ? undefined : topMsgId,
              } as any);
              replySent = true;
            } catch (fallbackErr) {
              console.error("Fallback forward failed:", fallbackErr);
            }
          }
        }
      } else if (kw.reply) {
        try {
          await client.sendMessage(trigger.chat_id, {
            message: kw.reply,
            replyTo: replyTo,
          });
          replySent = true;
        } catch (err) {
          console.error("Failed to send text reply:", err);
        }
      }

      if (replySent) {
        trigger.processed = true;
        await trigger.save();
        
        if (topMsgId) {
          let history = await ReplyHistory.findOne({ topic_id: topMsgId, chat_id: trigger.chat_id, keyword_id: kw._id, ...getAccountFilter(accountId) });
          if (!history) {
            await ReplyHistory.create({ topic_id: topMsgId, chat_id: trigger.chat_id, keyword_id: kw._id, count: 1, account_id: accountId || 'default' });
          } else {
            history.count += 1;
            history.last_updated = new Date();
            await history.save();
          }
        }
        
        await saveLog(`Manual catchup reply sent to topic ${topMsgId} for keyword "${trigger.matched_keyword}"`, 'info', 'USERBOT', undefined, undefined, accountId);
        return res.json({ success: true });
      } else {
        return res.status(500).json({ error: "Failed to send reply" });
      }
    } catch (err: any) {
      console.error("Error in /api/reply-single-missed:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/catchup", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const client = getAccountClient(accountId) || userClient;

      cancelCatchupFlag = false;
      if (!client || !client.connected) {
        return res.status(400).json({ error: "Telegram client not connected" });
      }

      const isSystemPaused = (await getSetting("system_paused", accountId))?.value === "true";
      if (isSystemPaused) {
        return res.status(400).json({ error: "Bot is paused. Unpause first to catch up." });
      }

      const replyInGeneral = (await getSetting("reply_in_general", accountId))?.value === "true";
      const autoResetEnabled = (await getSetting("auto_reset_enabled", accountId))?.value !== "false";

      const { triggerIds } = req.body || {};
      let missed = [];
      
      if (triggerIds && Array.isArray(triggerIds) && triggerIds.length > 0) {
        missed = await MissedTrigger.find({ _id: { $in: triggerIds }, processed: false, ...getAccountFilter(accountId) }).sort({ timestamp: 1 });
      } else {
        missed = await MissedTrigger.find({ processed: false, ...getAccountFilter(accountId) }).sort({ timestamp: 1 }).limit(20);
      }

      if (missed.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      let processedCount = 0;
      for (const trigger of missed) {
        if (cancelCatchupFlag) {
          console.log("Catchup cancelled by user.");
          break;
        }

        try {
          const kw = await Keyword.findOne({ _id: trigger.rule_id, ...getAccountFilter(accountId) });
          if (!kw) {
            trigger.processed = true;
            await trigger.save();
            continue;
          }

          const peerId = trigger.chat_id;
          const replyToMsgId = trigger.message_id;
          const topMsgId = trigger.topic_id === 1 ? undefined : trigger.topic_id;
          const replyTo = replyInGeneral ? undefined : (topMsgId || replyToMsgId);
          
          const normalizedPeerId = peerId.replace("-100", "");
          if (isTopicBlocked(Number(normalizedPeerId), accountId)) {
            console.log(`Skipping missed trigger for blocked group ${normalizedPeerId}`);
            trigger.processed = true;
            await trigger.save();
            continue;
          }

          if (topMsgId && isTopicBlocked(topMsgId, accountId)) {
            console.log(`Skipping missed trigger for blocked topic ${topMsgId}`);
            trigger.processed = true;
            await trigger.save();
            continue;
          }

          if (topMsgId) {
            const maxReplies = kw.max_replies !== undefined && kw.max_replies !== null ? Number(kw.max_replies) : 0;
            const currentCount = await getKeywordReplyCount(topMsgId, trigger.chat_id, kw._id, accountId, autoResetEnabled);

            if (maxReplies > 0 && currentCount >= maxReplies) {
              console.log(`Catchup skipped: Max replies reached for rule ${kw._id} in topic ${topMsgId}`);
              trigger.processed = true;
              await trigger.save();
              continue;
            }
          }

          console.log(`Catchup: Processing trigger ${trigger._id} for peer ${peerId}`);

          const linksToProcess = [...(kw.message_links || [])];
          if (kw.message_link && !linksToProcess.includes(kw.message_link)) {
            linksToProcess.push(kw.message_link);
          }
          const normalizedLinks = linksToProcess.map(l => l.trim()).filter(l => l).sort();

          let replySent = false;

          if (kw.photo) {
            const base64Data = kw.photo.includes(",") ? kw.photo.split(",")[1] : kw.photo;
            const buffer = Buffer.from(base64Data, "base64");
            const fileToUpload = new CustomFile("photo.jpg", buffer.length, "", buffer);
            const toUpload = await client.uploadFile({ file: fileToUpload, workers: 1 });
            await client.sendFile(peerId, {
              file: toUpload,
              caption: kw.reply || "",
              replyTo: replyTo,
            });
            replySent = true;
          } else if (kw.reply) {
            await client.sendMessage(peerId, {
              message: kw.reply,
              replyTo: replyTo,
            });
            replySent = true;
          }

          if (normalizedLinks.length > 0) {
            for (const link of normalizedLinks) {
              const parts = link.split("/").filter(p => p.length > 0);
              const messageId = parseInt(parts[parts.length - 1], 10);
              if (!isNaN(messageId)) {
                let fromPeer: any = (await getSetting("target_group_id", accountId))?.value;
                if (link.includes("/c/")) {
                  const cIndex = parts.indexOf("c");
                  if (cIndex !== -1 && parts[cIndex + 1]) {
                    fromPeer = `-100${parts[cIndex + 1]}`;
                  }
                } else {
                  const tmeIndex = parts.indexOf("t.me");
                  if (tmeIndex !== -1 && parts[tmeIndex + 1]) {
                    fromPeer = parts[tmeIndex + 1];
                  } else if (parts.length >= 3) {
                    fromPeer = parts[2];
                  }
                }

                try {
                  let inputPeer = await client.getInputEntity(typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer);
                  const toPeerInput = await client.getInputEntity(peerId);

                  await client.invoke(
                    new Api.messages.ForwardMessages({
                      fromPeer: inputPeer,
                      id: [messageId],
                      randomId: [BigInt(Math.floor(Math.random() * 1e15)) as any],
                      toPeer: toPeerInput,
                      topMsgId: replyInGeneral ? undefined : topMsgId,
                    }) as any
                  );
                  replySent = true;
                } catch (forwardErr: any) {
                  try {
                    await client.forwardMessages(peerId, {
                      messages: [messageId],
                      fromPeer: typeof fromPeer === "string" && /^-?\d+$/.test(fromPeer) ? BigInt(fromPeer) : fromPeer,
                      topMsgId: replyInGeneral ? undefined : topMsgId,
                    } as any);
                    replySent = true;
                  } catch (fallbackErr) {
                    console.error("Catchup fallback forward failed:", fallbackErr);
                  }
                }
              }
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          if (replySent && topMsgId) {
            await incrementKeywordReplyCount(topMsgId, trigger.chat_id, kw._id, accountId, autoResetEnabled);
          }

          trigger.processed = true;
          await trigger.save();
          processedCount++;
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
          console.error("Catchup failed for trigger:", trigger._id, e);
        }
      }

      res.json({ success: true, count: processedCount, cancelled: cancelCatchupFlag });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/logs", async (req, res) => {
    try {
      const logs = await Log.find({}).sort({ timestamp: -1 }).limit(100);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Blocked Topics Routes
  app.get("/api/blocked-topics", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const blocked = await BlockedTopic.find(getAccountFilter(accountId)).sort({ created_at: -1 });
      res.json(blocked);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/blocked-topics", async (req, res) => {
    const accountId = getAccountId(req);
    const { link } = req.body;
    if (!link) return res.status(400).json({ error: "Link required" });

    try {
      const topicInfo = extractTopicInfo(link);
      if (!topicInfo) {
        return res.status(400).json({ error: "Invalid topic link or ID" });
      }

      const topicId = topicInfo.topicId;
      const normalizedLink = topicInfo.normalizedLink;

      // Toggle behavior: If already blocked, unblock it
      const existing = await BlockedTopic.findOne({ telegram_topic_id: topicId, ...getAccountFilter(accountId) });
      if (existing) {
        await BlockedTopic.findByIdAndDelete(existing._id);
        const cache = blockedTopicsCache.get(accountId);
        if (cache) cache.delete(topicId);
        await saveLog(`Topic ${topicId} unblocked via link`, 'info', 'API', '/api/blocked-topics', { link: normalizedLink }, accountId);
        sendSseEvent('topic_unblocked', { topicId, timestamp: new Date() });
        return res.json({ success: true, action: 'unblocked' });
      }

      // Try to find topic name from our Topic collection or cache
      let name = topicNamesCache[topicId] || "";
      if (!name) {
        const foundTopic = await Topic.findOne({ telegram_topic_id: topicId, ...getAccountFilter(accountId) });
        if (foundTopic && foundTopic.name) name = foundTopic.name;
      }
      if (!name) name = `Topic #${topicId}`;

      await BlockedTopic.create({
        telegram_topic_id: topicId,
        name,
        link: normalizedLink,
        account_id: accountId || 'default'
      });
      if (!blockedTopicsCache.has(accountId)) blockedTopicsCache.set(accountId, new Set());
      blockedTopicsCache.get(accountId)!.add(topicId);
      
      await saveLog(`Topic ${topicId} blocked`, 'info', 'API', '/api/blocked-topics', { link: normalizedLink, name }, accountId);
      sendSseEvent('topic_blocked', {
        message: `Topic "${name}" blocked via Dashboard`,
        topicName: name,
        timestamp: new Date()
      });
      res.json({ success: true, action: 'blocked', name });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/blocked-topics/:id", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const deleted = await BlockedTopic.findOneAndDelete({ _id: req.params.id, ...getAccountFilter(accountId) });
      if (deleted) {
        const cache = blockedTopicsCache.get(accountId);
        if (cache) cache.delete(deleted.telegram_topic_id);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/logs", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      await Log.deleteMany(getAccountFilter(accountId));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/logs/export", async (req, res) => {
    try {
      const logs = await Log.find({}).sort({ timestamp: -1 });
      const format = req.query.format || 'json';
      
      if (format === 'csv') {
        let csv = 'Timestamp,Level,Category,Message,Route,Details\n';
        logs.forEach(log => {
          const details = log.details ? log.details.replace(/"/g, '""') : '';
          csv += `"${log.timestamp.toISOString()}","${log.level}","${log.category || ''}","${log.message.replace(/"/g, '""')}","${log.route || ''}","${details}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
        return res.send(csv);
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=logs.json');
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/analytics", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      const { startDate, endDate, timezone = "Asia/Kolkata" } = req.query;

      let replyHistoryMatchStage: any = { $match: { ...getAccountFilter(accountId) } };
      let topicMatchStage: any = { $match: { ...getAccountFilter(accountId) } };

      let start: Date;
      let end: Date;

      if (startDate && endDate) {
        const startParts = (startDate as string).split('-');
        if (startParts.length === 3) {
          start = new Date(Date.UTC(parseInt(startParts[0], 10), parseInt(startParts[1], 10) - 1, parseInt(startParts[2], 10), 0, 0, 0, 0));
        } else {
          start = new Date(startDate as string);
        }

        const endParts = (endDate as string).split('-');
        if (endParts.length === 3) {
          end = new Date(Date.UTC(parseInt(endParts[0], 10), parseInt(endParts[1], 10) - 1, parseInt(endParts[2], 10), 23, 59, 59, 999));
        } else {
          end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
        }
      } else {
        // Default to last 7 days
        end = new Date();
        start = new Date();
        start.setDate(start.getDate() - 6); // 7 days including today
        start.setHours(0, 0, 0, 0);
      }

      // Filter ReplyHistory by last_updated date range and ensure valid date
      replyHistoryMatchStage = {
        $match: {
          ...getAccountFilter(accountId),
          last_updated: { $gte: start, $lte: end }
        }
      };

      // Filter Topic creation by created_at date range and ensure valid date type
      topicMatchStage = {
        $match: {
          ...getAccountFilter(accountId),
          created_at: { $gte: start, $lte: end }
        }
      };

      // Get top 5 keywords triggered inside date range
      const topKeywords = await ReplyHistory.aggregate([
        replyHistoryMatchStage,
        { $group: { _id: "$keyword_id", total: { $sum: "$count" } } },
        { $sort: { total: -1 } },
        { $limit: 5 }
      ]);
      
      const keywordIds = topKeywords.map(k => k._id);
      const keywords = await Keyword.find({ _id: { $in: keywordIds }, ...getAccountFilter(accountId) });
      const keywordMap = keywords.reduce((acc, kw) => {
        acc[kw._id.toString()] = kw.keyword || kw.keywords?.[0] || 'Unknown';
        return acc;
      }, {} as any);

      const keywordData = topKeywords.map(k => ({
        name: keywordMap[k._id.toString()] || 'Unknown',
        value: k.total
      }));

      // Get top 5 active topics inside date range
      const topTopics = await ReplyHistory.aggregate([
        replyHistoryMatchStage,
        { $group: { _id: "$topic_id", total: { $sum: "$count" } } },
        { $sort: { total: -1 } },
        { $limit: 5 }
      ]);

      const topicData = topTopics.map(t => ({
        name: topicNamesCache[t._id] || `Topic ${t._id}`,
        value: t.total
      }));

      // Get daily topic creation counts within the selected range
      const topicsCreatedByDay = await Topic.aggregate([
        topicMatchStage,
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at", timezone: timezone as string } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Create lookup dictionary for aggregated data
      const creationMap = new Map<string, number>();
      topicsCreatedByDay.forEach((item: any) => {
        if (item._id) {
          creationMap.set(item._id, item.count);
        }
      });

      // Format date helper in specific timezone
      const formatDateInTimezone = (date: Date, tz: string) => {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const parts = formatter.formatToParts(date);
        const year = parts.find(p => p.type === 'year')?.value;
        const month = parts.find(p => p.type === 'month')?.value;
        const day = parts.find(p => p.type === 'day')?.value;
        return `${year}-${month}-${day}`;
      };

      // Fill in all missing days inside the selected range with 0 counts
      const topicCreationData = [];
      const currentDate = new Date(start);
      // We limit to max 366 days safety guard to avoid any infinite loop
      let guardCount = 0;
      while (currentDate <= end && guardCount < 366) {
        guardCount++;
        const dateString = formatDateInTimezone(currentDate, timezone as string);
        const count = creationMap.get(dateString) || 0;
        topicCreationData.push({
          date: dateString,
          count: count
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json({ keywordData, topicData, topicCreationData });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/gemini/suggest-keywords", async (req, res) => {
    try {
      const accountId = getAccountId(req);
      
      // 1. Fetch recent 50 USERBOT log messages for analysis
      const recentLogs = await Log.find({
        account_id: accountId || 'default',
        category: 'USERBOT'
      }).sort({ timestamp: -1 }).limit(50);

      const logTexts = recentLogs.map(l => l.message).filter(Boolean);

      // Creative exam study materials fallback context
      const fallbackContext = [
        "SSC CGL Maths batch by Gagan Pratap link leak free",
        "How do I pay 87rs for railway batch",
        "English volume 1 Neetu Singh class notes",
        "Do you have SSC CHSL free mock test leak",
        "UPI payment scanner study material",
        "Abhinay Sharma maths live batch leak 87rs",
        "Current affairs PDF study material prep",
        "GS leak GK notes history question bank"
      ];

      const analysisInput = logTexts.length > 0 ? logTexts.join("\n") : fallbackContext.join("\n");

      // 2. Fetch keys
      const geminiApiKeysSetting = await getSetting("gemini_api_keys", accountId);
      let apiKeys: string[] = [];
      try {
        apiKeys = JSON.parse(geminiApiKeysSetting?.value || "[]");
      } catch (e) {}

      const envKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (envKey && !apiKeys.includes(envKey)) {
        apiKeys.push(envKey);
      }

      if (apiKeys.length === 0) {
        return res.status(400).json({ error: "Please configure a Gemini API key in settings first." });
      }

      const activeKey = apiKeys[0];
      const genAI = new GoogleGenAI({ apiKey: activeKey });

      const response = await genAI.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Analyze the recent Telegram message notifications and log triggers:\n\n${analysisInput}\n\nSuggest exactly 4 smart automated keyword rules that this Telegram store bot should register to answer queries instantly. 
For each suggested rule, provide:
1. keyword: A short primary trigger word (e.g., 'maths', 'discount', 'payment').
2. keywords: An array of synonyms or closely matching keyword triggers (e.g. ['gagan math', 'math batch', 'abhinay math']).
3. reply: A helpful, informative, and polite automatic reply answering the query. Mention that study batches are 87rs each or provide clear instructions.
4. category: A short category name (e.g., 'Payment Help', 'Study Material', 'Course Query', 'Greeting').
5. explanation: A one-sentence explanation of why this keyword rule is suggested based on the analyzed user chat trends.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                keyword: { type: Type.STRING },
                keywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                reply: { type: Type.STRING },
                category: { type: Type.STRING },
                explanation: { type: Type.STRING }
              },
              required: ["keyword", "keywords", "reply", "category", "explanation"]
            }
          }
        }
      });

      const parsed = JSON.parse(response.text.trim());
      res.json({ suggestions: parsed });
    } catch (err: any) {
      console.error("Gemini Suggest Keywords error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/test-persona", async (req, res) => {
    const { message, persona, apiKey } = req.body;
    if (!message || !apiKey) return res.status(400).json({ error: "Message and API Key required" });
    
    try {
      const genAI = new GoogleGenAI({ apiKey });
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [
              { text: `System Instruction: ${persona || 'You are a helpful assistant.'}` },
              { text: `User Message: "${message}"` },
              { text: `Context: This is a test from the dashboard. Reply naturally.` }
            ]
          }
        ]
      });
      res.json({ reply: response.text.trim() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API 404 Handler
  app.use("/api/*", (req, res) => {
    console.log(`API endpoint not found: ${req.originalUrl}`);
    res.status(404).json({ error: "API endpoint not found" });
  });

  const publicDir = path.join(process.cwd(), "public");

  // Dynamic PWA manifest matching active user logo
  app.get("/manifest.json", async (req, res) => {
    try {
      res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      const appLogoSetting = await getSetting("app_logo", "default");
      const appLogo = appLogoSetting?.value || "";
      const iconUrl = appLogo ? (appLogo.startsWith("data:") ? "/api/app-icon.png" : appLogo) : "/pwa-192x192.png";

      res.json({
        name: "BotFlow Premium",
        short_name: "BotFlow",
        description: "Professional Telegram Topic & Userbot Manager with AI",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0a0d14",
        theme_color: "#0a0d14",
        icons: [
          {
            src: iconUrl,
            sizes: "192x192 512x512",
            type: iconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png",
            purpose: "any"
          },
          {
            src: iconUrl,
            sizes: "192x192 512x512",
            type: iconUrl.endsWith(".svg") ? "image/svg+xml" : "image/png",
            purpose: "maskable"
          }
        ],
        screenshots: [
          {
            src: "/screenshot1.png",
            sizes: "540x720",
            type: "image/png",
            form_factor: "narrow",
            label: "BotFlow Dashboard"
          }
        ],
        prefer_related_applications: false,
        categories: ["productivity", "utilities"]
      });
    } catch (e) {
      res.sendFile(path.join(publicDir, "manifest.json"));
    }
  });

  // Service worker
  app.get("/sw.js", (req, res) => {
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(publicDir, "sw.js"));
  });

  // Serve static assets from public directory
  app.use(express.static(publicDir));

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    }).then(vite => {
      app.use(vite.middlewares);
      console.log("Vite middleware initialized");
    }).catch(err => {
      console.error("Vite server error:", err);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith(".json")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Periodic background sweep to expire approval requests older than 24 hours
  setInterval(async () => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const expiredDocs = await PendingApproval.find({
        status: 'pending',
        created_at: { $lt: twentyFourHoursAgo }
      });

      if (expiredDocs.length > 0) {
        await PendingApproval.updateMany(
          { status: 'pending', created_at: { $lt: twentyFourHoursAgo } },
          { $set: { status: 'expired', processed_at: new Date() } }
        );

        for (const doc of expiredDocs) {
          sendSseEvent('approval_processed', { id: doc._id, status: 'expired' });
          if (bot && doc.bot_chat_id && doc.bot_message_id) {
            bot.editMessageText(
              `⏳ <b>Approval Request Expired</b>\n\n<b>Keyword:</b> <code>${escapeHtml(doc.matched_keyword)}</code>\n<i>This request expired after 24 hours.</i>`,
              {
                chat_id: doc.bot_chat_id,
                message_id: doc.bot_message_id,
                parse_mode: 'HTML'
              }
            ).catch(() => {});
          }
        }
        console.log(`[EXPIRE] Expired ${expiredDocs.length} pending approval requests older than 24 hours.`);
      }
    } catch (err: any) {
      console.error("Error in approval expiration sweep:", err.message);
    }
  }, 5 * 60 * 1000);

  // Graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    if (bot && bot.isPolling()) {
      await bot.stopPolling();
    }
    if (userClient) {
      await userClient.disconnect();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });

  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
  });
}

startServer();
