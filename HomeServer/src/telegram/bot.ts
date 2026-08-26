import { Bot, GrammyError, HttpError, type Context } from "grammy";
import type { HomeServerConfig } from "../config.js";
import { getHomeServerStatus } from "../state/connection-state.js";
import { sendRobotCommand, type RobotCommandResult } from "../stackchan/client.js";

type Logger = {
  info: (message: string, extra?: unknown) => void;
  warn: (message: string, extra?: unknown) => void;
  error: (message: string, extra?: unknown) => void;
};

export type TelegramBotHandle = {
  stop: () => Promise<void>;
};

const HELP_TEXT = [
  "StackChan HomeServer Bot",
  "",
  "/status - 查看 HomeServer 状态",
  "/chatid - 显示当前 Telegram chat id",
  "/notify <text> - 发送机器人通知",
  "/led r g b - 设置临时灯光，0-168",
  "/photo - 拍照（第一版暂未开放）"
].join("\n");

function getChatId(ctx: Context): string | undefined {
  const chatId = ctx.chat?.id;
  return chatId === undefined ? undefined : String(chatId);
}

function formatRobotResult(result: RobotCommandResult): string {
  if (result.ok) {
    return result.message ? `执行成功：${result.message}` : "执行成功";
  }
  return `执行失败：${result.message ?? result.error ?? "unknown error"}`;
}

function parseLedArgs(input: string): { red: number; green: number; blue: number } {
  const parts = input
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length !== 3) {
    throw new Error("用法：/led r g b，例如 /led 0 80 30");
  }

  const [red, green, blue] = parts.map((part) => Number(part));
  if (![red, green, blue].every((value) => Number.isInteger(value) && value >= 0 && value <= 168)) {
    throw new Error("r/g/b 必须是 0-168 的整数");
  }

  return { red, green, blue };
}

async function replyRobotCommand(ctx: Context, command: Parameters<typeof sendRobotCommand>[0]) {
  try {
    const result = await sendRobotCommand(command);
    await ctx.reply(formatRobotResult(result));
  } catch (error) {
    await ctx.reply(error instanceof Error ? error.message : "StackChan 命令下发失败");
  }
}

async function replyStatus(ctx: Context) {
  const status = getHomeServerStatus();
  const lines = [
    "HomeServer 状态",
    `connected: ${status.connected ? "true" : "false"}`,
    `message: ${status.message}`,
    `checkedAt: ${status.checkedAt}`,
    `robotOnline: ${status.robot.onlineCount}`
  ];

  if (status.robot.lastDisconnectedAt) {
    lines.push(`lastRobotDisconnectedAt: ${status.robot.lastDisconnectedAt}`);
  }

  if (status.robot.onlineCount === 1) {
    try {
      const result = await sendRobotCommand({
        name: "status",
        timeoutMs: 5000
      });
      lines.push("", "Firmware 状态", formatRobotResult(result));
      if (result.data) {
        lines.push(JSON.stringify(result.data, null, 2));
      }
    } catch (error) {
      lines.push("", "Firmware 状态", error instanceof Error ? error.message : "StackChan 状态查询失败");
    }
  } else if (status.robot.onlineCount > 1) {
    lines.push("当前有多台 StackChan 在线，第一版暂不支持默认状态路由。");
  }

  await ctx.reply(lines.join("\n"));
}

function registerHandlers(bot: Bot, logger: Logger, allowedChatIds: Set<string>) {
  bot.use(async (ctx, next) => {
    const chatId = getChatId(ctx);
    if (!chatId) {
      return;
    }

    if (allowedChatIds.size > 0 && !allowedChatIds.has(chatId)) {
      logger.warn("Rejected Telegram message from unauthorized chat", {
        chatId
      });
      await ctx.reply(`当前 chat 未授权。\nchat_id: ${chatId}`);
      return;
    }

    await next();
  });

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(HELP_TEXT);
  });

  bot.command("chatid", async (ctx) => {
    const chatId = getChatId(ctx);
    await ctx.reply(chatId ? `chat_id: ${chatId}` : "无法读取当前 chat id");
  });

  bot.command("status", async (ctx) => {
    await replyStatus(ctx);
  });

  bot.command("notify", async (ctx) => {
    const text = ctx.match.trim();
    if (!text) {
      await ctx.reply("用法：/notify <text>");
      return;
    }
    await replyRobotCommand(ctx, {
      name: "notify",
      payload: { text },
      timeoutMs: 5000
    });
  });

  bot.command("led", async (ctx) => {
    try {
      await replyRobotCommand(ctx, {
        name: "set_led_color",
        payload: parseLedArgs(ctx.match),
        timeoutMs: 5000
      });
    } catch (error) {
      await ctx.reply(error instanceof Error ? error.message : "LED 参数错误");
    }
  });

  bot.command("photo", async (ctx) => {
    await ctx.reply("/photo 第一版暂未开放。先完成 HomeRemote 常驻连接，再接相机资源仲裁。");
  });

  bot.on("message:text", async (ctx) => {
    await ctx.reply(`未知命令：${ctx.message.text}\n\n${HELP_TEXT}`);
  });
}

export function startTelegramBot(config: HomeServerConfig, logger: Logger): TelegramBotHandle | undefined {
  if (!config.telegramBotToken) {
    logger.info("Telegram bot disabled: TELEGRAM_BOT_TOKEN is not set");
    return undefined;
  }

  const allowedChatIds = new Set(config.telegramAllowedChatIds);
  if (allowedChatIds.size === 0) {
    logger.warn("Telegram bot allows every chat: TELEGRAM_ALLOWED_CHAT_IDS is empty");
  }

  const bot = new Bot(config.telegramBotToken);
  registerHandlers(bot, logger, allowedChatIds);

  bot.catch((error) => {
    const ctx = error.ctx;
    const cause = error.error;
    if (cause instanceof GrammyError) {
      logger.error("Telegram bot API error", {
        updateId: ctx.update.update_id,
        description: cause.description
      });
      return;
    }
    if (cause instanceof HttpError) {
      logger.error("Telegram bot HTTP error", {
        updateId: ctx.update.update_id,
        error: cause.error
      });
      return;
    }

    logger.error("Telegram bot handler failed", {
      updateId: ctx.update.update_id,
      error: cause
    });
  });

  void bot.start({
    allowed_updates: ["message"],
    onStart: (botInfo) => {
      logger.info("Telegram bot started", {
        username: botInfo.username,
        id: botInfo.id
      });
    }
  });

  return {
    stop: async () => {
      await bot.stop();
    }
  };
}
