import "dotenv/config";

export type HomeServerConfig = {
  host: string;
  port: number;
  name: string;
  officialServerUrl?: string;
  telegramBotToken?: string;
};

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }

  return parsed;
}

function readOptional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function loadConfig(): HomeServerConfig {
  return {
    host: process.env.HOME_SERVER_HOST ?? "0.0.0.0",
    port: readNumber("HOME_SERVER_PORT", 8787),
    name: process.env.HOME_SERVER_NAME ?? "stackchan-home-server",
    officialServerUrl: readOptional("OFFICIAL_SERVER_URL"),
    telegramBotToken: readOptional("TELEGRAM_BOT_TOKEN")
  };
}
