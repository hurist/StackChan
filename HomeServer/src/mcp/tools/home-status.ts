import { z } from "zod";
import { getHomeServerStatus } from "../../state/connection-state.js";

export const homeStatusTool = {
  name: "home.get_server_status",
  title: "获取 Home Server 状态",
  description: "获取本地 StackChan Home Server 的连接状态。",
  inputSchema: {},
  outputSchema: {
    connected: z.boolean(),
    message: z.string(),
    checkedAt: z.string()
  },
  handler: async () => {
    const status = getHomeServerStatus();

    return {
      structuredContent: status,
      content: [
        {
          type: "text" as const,
          text: status.message
        }
      ]
    };
  }
};
