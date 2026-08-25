export type ServerStatus = {
  connected: boolean;
  message: string;
  checkedAt: string;
};

const HOME_SERVER_OK_MESSAGE = "与Home Server连接状态正常";

export function getHomeServerStatus(now = new Date()): ServerStatus {
  return {
    connected: true,
    message: HOME_SERVER_OK_MESSAGE,
    checkedAt: now.toISOString()
  };
}
