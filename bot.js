#!/usr/bin/env node

/*!
 * Image Generator Telegram Bot
 * Copyright (c) 2023
 *
 * @author Zubin
 * @username (GitHub) losparviero
 * @license AGPL-3.0
 */

// Add env vars as a preliminary

require("dotenv").config();
const { Bot, session, GrammyError, HttpError, InputFile } = require("grammy");
const { hydrateReply, parseMode } = require("@grammyjs/parse-mode");
const { run, sequentialize } = require("@grammyjs/runner");
const { hydrate } = require("@grammyjs/hydrate");
const http = require("https");

// Bot

const bot = new Bot(process.env.BOT_TOKEN);

// Concurrency

function getSessionKey(ctx) {
  return ctx.chat?.id.toString();
}

// Plugins

bot.use(sequentialize(getSessionKey));
bot.use(session({ getSessionKey }));
bot.use(responseTime);
bot.use(log);
bot.use(admin);
bot.use(hydrate());
bot.use(hydrateReply);

// Parse

bot.api.config.use(parseMode("Markdown"));

// Admin

const admins = process.env.BOT_ADMIN?.split(",").map(Number) || [];
async function admin(ctx, next) {
  ctx.config = {
    botAdmins: admins,
    isAdmin: admins.includes(ctx.chat?.id),
  };
  await next();
}

// Response

async function responseTime(ctx, next) {
  const before = Date.now();
  await next();
  const after = Date.now();
  console.log(`Response time: ${after - before} ms`);
}

// Log

async function log(ctx, next) {
  let message = ctx.message?.text || ctx.channelPost?.text || undefined;
  const from = ctx.from || ctx.chat;
  const name =
    `${from.first_name || ""} ${from.last_name || ""}`.trim() || ctx.chat.title;

  // Console

  console.log(
    `From: ${name} (@${from.username}) ID: ${from.id}\nMessage: ${message}`
  );

  // Channel

  if (
    ctx.message &&
    !ctx.message?.text?.includes("/") &&
    process.env.BOT_ADMIN &&
    !admins.includes(ctx.chat?.id)
  ) {
    await bot.api.sendMessage(
      process.env.BOT_ADMIN,
      `<b>From: ${name} (@${from.username}) ID: <code>${from.id}</code></b>`,
      { parse_mode: "HTML" }
    );

    await ctx.api.forwardMessage(
      process.env.BOT_ADMIN,
      ctx.chat.id,
      ctx.message.message_id
    );
  }

  await next();
}

// Commands

bot.command("start", async (ctx) => {
  await ctx
    .reply("*Welcome!* ✨\n_Describe the picture that you want to create._")
    .then(console.log("New user added:\n", ctx.from));
});

bot.command("help", async (ctx) => {
  await ctx
    .reply(
      "*@anzubo Project.*\n\n_This bot generates images using text prompts.\nSend any query to get started!_"
    )
    .then(console.log("Help command sent to", ctx.chat.id))
    .catch((e) => console.log(e));
});

// Messages

bot.on("message:text", async (ctx) => {
  const statusMessage = await ctx.reply("*Processing*");

  const promptText = ctx.message.text;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    promptText
  )}`;

  try {
    http
      .get(url, (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(chunk);
        });

        response.on("end", async () => {
          const buffer = Buffer.concat(chunks);
          await ctx.replyWithPhoto(new InputFile(buffer), {
            reply_to_message_id: ctx.message.message_id,
            caption: `<b>Image for</b> <code>${ctx.message.text}</code>\n<i>Generated using <b><a href= "https://t.me/makepicbot">Image Creator</a></b></i>`,
            parse_mode: "HTML",
          });
        });
      })
      .on("error", (error) => {
        console.error(`Error fetching image: ${error.message}`);
      });
  } catch (error) {
    await ctx.reply("*Error generating image.", {
      reply_to_message_id: ctx.message.message_id,
    });
  }

  await statusMessage.delete();
});

// Error

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    "Error while handling update",
    ctx.update.update_id,
    "\nQuery:",
    ctx.msg.text
  );
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error("Error in request:", e.description);
    if (e.description === "Forbidden: bot was blocked by the user") {
      console.log("Bot was blocked by the user");
    } else {
      ctx.reply("An error occurred");
    }
  } else if (e instanceof HttpError) {
    console.error("Could not contact Telegram:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// Run

run(bot);
