type Logger = {
  info: (message: string, extra?: unknown) => void;
  warn: (message: string, extra?: unknown) => void;
  error: (message: string, extra?: unknown) => void;
};

interface RobotSocket {
  send: (data: string) => void;
  close: (code?: number, reason?: Buffer) => void;
  on(event: "message", listener: (data: Buffer | string) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}

export type RobotCommandName = "status" | "notify" | "set_led_color";

export type RobotCommand = {
  name: RobotCommandName;
  payload?: Record<string, unknown>;
  timeoutMs?: number;
};

type PendingCommand = {
  resolve: (result: RobotCommandResult) => void;
  timer: NodeJS.Timeout;
};

export type RobotCommandResult = {
  command_id: string;
  ok: boolean;
  message?: string;
  error?: string;
  data?: unknown;
};

type RobotConnection = {
  deviceId: string;
  clientId?: string;
  firmwareVersion?: string;
  capabilities: string[];
  socket: RobotSocket;
  connectedAt: string;
  lastSeenAt: string;
};

export type RobotConnectionSummary = {
  onlineCount: number;
  devices: Array<{
    deviceId: string;
    clientId?: string;
    firmwareVersion?: string;
    capabilities: string[];
    connectedAt: string;
    lastSeenAt: string;
  }>;
  lastDisconnectedAt?: string;
};

const connections = new Map<string, RobotConnection>();
const pendingCommands = new Map<string, PendingCommand>();
let commandSequence = 0;
let lastDisconnectedAt: string | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function makeCommandId(deviceId: string): string {
  commandSequence += 1;
  return `${deviceId}-${Date.now()}-${commandSequence}`;
}

function getSingleOnlineConnection(): RobotConnection {
  if (connections.size === 0) {
    throw new Error("StackChan 当前离线");
  }
  if (connections.size > 1) {
    throw new Error("当前有多台 StackChan 在线，第一版暂不支持默认路由");
  }
  const connection = connections.values().next().value as RobotConnection | undefined;
  if (!connection) {
    throw new Error("StackChan 当前离线");
  }
  return connection;
}

export function getRobotConnectionSummary(): RobotConnectionSummary {
  return {
    onlineCount: connections.size,
    devices: [...connections.values()].map((connection) => ({
      deviceId: connection.deviceId,
      clientId: connection.clientId,
      firmwareVersion: connection.firmwareVersion,
      capabilities: connection.capabilities,
      connectedAt: connection.connectedAt,
      lastSeenAt: connection.lastSeenAt
    })),
    lastDisconnectedAt
  };
}

export function registerRobotSocket(socket: RobotSocket, logger: Logger) {
  let deviceId: string | undefined;

  socket.on("message", (raw) => {
    const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      logger.warn("Ignored invalid robot websocket message", { text });
      return;
    }

    if (!isRecord(message)) {
      return;
    }

    if (message.type === "hello") {
      const nextDeviceId = readString(message.device_id);
      if (!nextDeviceId) {
        socket.close(1008, Buffer.from("missing device_id"));
        return;
      }

      deviceId = nextDeviceId;
      const now = new Date().toISOString();
      connections.set(deviceId, {
        deviceId,
        clientId: readString(message.client_id),
        firmwareVersion: readString(message.firmware_version),
        capabilities: readStringList(message.capabilities),
        socket,
        connectedAt: now,
        lastSeenAt: now
      });
      socket.send(JSON.stringify({ type: "hello_ack", server_time: Date.now() }));
      logger.info("Robot connected", { deviceId });
      return;
    }

    if (message.type === "pong") {
      if (deviceId && connections.has(deviceId)) {
        connections.get(deviceId)!.lastSeenAt = new Date().toISOString();
      }
      return;
    }

    if (message.type === "command_result") {
      const commandId = readString(message.command_id);
      if (!commandId) {
        return;
      }
      const pending = pendingCommands.get(commandId);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timer);
      pendingCommands.delete(commandId);
      pending.resolve({
        command_id: commandId,
        ok: message.ok === true,
        message: readString(message.message),
        error: readString(message.error),
        data: message.data
      });
    }
  });

  socket.on("close", () => {
    if (deviceId && connections.get(deviceId)?.socket === socket) {
      connections.delete(deviceId);
      lastDisconnectedAt = new Date().toISOString();
      logger.warn("Robot disconnected", { deviceId });
    }
  });

  socket.on("error", (error) => {
    logger.error("Robot websocket error", { deviceId, error });
  });
}

export function sendRobotCommand(command: RobotCommand): Promise<RobotCommandResult> {
  const connection = getSingleOnlineConnection();
  const commandId = makeCommandId(connection.deviceId);
  const timeoutMs = command.timeoutMs ?? 5000;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(commandId);
      resolve({
        command_id: commandId,
        ok: false,
        error: "timeout",
        message: "等待 StackChan 执行结果超时"
      });
    }, timeoutMs);

    pendingCommands.set(commandId, { resolve, timer });
    connection.socket.send(
      JSON.stringify({
        type: "command",
        command_id: commandId,
        name: command.name,
        payload: command.payload ?? {},
        timeout_ms: timeoutMs
      })
    );
  });
}
