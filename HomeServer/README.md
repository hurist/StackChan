# StackChan Home Server

Home Server 是 StackChan 的本地扩展中枢。它和官方 StackChan Server 分开维护，用来承载自定义能力，避免为了扩展功能而替换官方服务。

当前范围：

- HTTP 健康检查和机器人状态接口
- 供 firmware MCP 工具调用的 `/robot/status`
- Telegram Bot grammY SDK 接入，支持 HomeServer 状态查询和远程命令占位反馈

后续规划：

- StackChan 固件连接状态
- firmware HomeRemote WebSocket 命令下发
- 本地自动化和更多机器人 HTTP 接口

## 环境要求

- Node.js 22+
- pnpm 11+
- Linux、macOS 或 Windows

## 本地初始化

```bash
corepack enable
pnpm install
cp .env.example .env
```

按需编辑 `.env`：

```bash
HOME_SERVER_HOST=0.0.0.0
HOME_SERVER_PORT=8787
HOME_SERVER_NAME=stackchan-home-server
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHAT_IDS=
```

Telegram 配置说明：

```text
TELEGRAM_BOT_TOKEN:
  从 BotFather 获取。为空时不启动 Telegram Bot。

TELEGRAM_ALLOWED_CHAT_IDS:
  可选，逗号分隔，例如 123456789,-1001234567890。
  为空时允许所有 chat，建议只在本地调试时使用。
  可先启动 bot 后发送 /chatid 获取当前 chat id。
```

## 开发命令

类型检查：

```bash
pnpm typecheck
```

构建：

```bash
pnpm build
```

构建并启动 HTTP 服务：

```bash
pnpm dev:http
```

构建并启动完整 HomeServer，包括可选 Telegram Bot：

```bash
pnpm dev
```

启动已构建的 HTTP 服务：

```bash
pnpm start:http
```

启动已构建的完整 HomeServer：

```bash
pnpm start
```

## Linux 部署步骤

第一版推荐部署到带 systemd 的普通 Linux 主机。

### 1. 安装运行环境

Ubuntu/Debian 示例：

```bash
sudo apt update
sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
corepack prepare pnpm@11.19.0 --activate
node --version
pnpm --version
```

预期结果：

- `node` 是 `v22.x` 或更高版本
- `pnpm` 是 `11.x`

### 2. 创建服务用户和目录

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin stackchan
sudo mkdir -p /opt/stackchan
sudo chown stackchan:stackchan /opt/stackchan
```

### 3. 部署源码

克隆仓库：

```bash
sudo -u stackchan git clone https://github.com/hurist/StackChan.git /opt/stackchan/repo
cd /opt/stackchan/repo
git checkout HomeServer
```

进入 Home Server 项目：

```bash
cd /opt/stackchan/repo/HomeServer
cp .env.example .env
```

编辑 `.env`：

```bash
HOME_SERVER_HOST=0.0.0.0
HOME_SERVER_PORT=8787
HOME_SERVER_NAME=stackchan-home-server

OFFICIAL_SERVER_URL=
STACKCHAN_SHARED_SECRET=change-me-home-remote-secret

TELEGRAM_BOT_TOKEN=从 BotFather 获取的 token
TELEGRAM_ALLOWED_CHAT_IDS=你的 Telegram chat id
```

如果第一次还不知道 `chat_id`，可以先留空：

```bash
TELEGRAM_ALLOWED_CHAT_IDS=
```

服务启动后，在 Telegram 里给 bot 发送 `/chatid`，把返回值填回 `.env`。例如个人会话：

```bash
TELEGRAM_ALLOWED_CHAT_IDS=123456789
```

群组或频道通常是负数，例如：

```bash
TELEGRAM_ALLOWED_CHAT_IDS=-1001234567890
```

多个 chat 用逗号分隔：

```bash
TELEGRAM_ALLOWED_CHAT_IDS=123456789,-1001234567890
```

### 4. 安装依赖并构建

```bash
sudo -u stackchan corepack enable
sudo -u stackchan pnpm install --frozen-lockfile
sudo -u stackchan pnpm typecheck
sudo -u stackchan pnpm build
```

### 5. 安装 systemd 服务

示例服务文件：

```text
deploy/systemd/stackchan-home-server.service
```

服务文件默认使用这个工作目录：

```text
/opt/stackchan/repo/HomeServer
```

如果仓库路径就是 `/opt/stackchan/repo`，可以直接安装：

```bash
sudo cp deploy/systemd/stackchan-home-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stackchan-home-server
```

如果使用其他路径，请先修改服务文件里的 `WorkingDirectory`、`EnvironmentFile` 和 `ExecStart`。

### 6. 检查服务状态

```bash
sudo systemctl status stackchan-home-server
sudo journalctl -u stackchan-home-server -f
```

预期日志：

```text
Server listening at http://127.0.0.1:8787
Server listening at http://<host-ip>:8787
Telegram bot started
```

如果没有配置 `TELEGRAM_BOT_TOKEN`，会看到：

```text
Telegram bot disabled: TELEGRAM_BOT_TOKEN is not set
```

### 7. 修改配置后重启

每次修改 `.env` 后重启 systemd 服务：

```bash
sudo systemctl restart stackchan-home-server
sudo journalctl -u stackchan-home-server -f
```

### 8. 局域网访问检查

当前 HomeServer 计划固定部署在内网地址：

```text
192.168.50.50
```

同一局域网内可以检查：

```bash
curl http://192.168.50.50:8787/health
curl http://192.168.50.50:8787/status
curl http://192.168.50.50:8787/robot/status
```

Telegram Bot 使用 grammY SDK 从 HomeServer 主动连接 Telegram，不需要 Telegram 访问 `192.168.50.50`，因此第一版不需要公网 HTTPS、Webhook 或内网穿透。

## Firmware 接入

Home Server 不再提供桌面 stdio MCP 入口。机器人语音链路由 firmware 注册小智能调用的 MCP 工具，再通过 HTTP 请求 Home Server。

第一版 firmware MCP 工具：

```text
self.home.get_status
```

该工具请求：

```http
GET /robot/status
```

## HTTP 接口

```bash
curl http://localhost:8787/health
curl http://localhost:8787/status
curl http://localhost:8787/robot/status
```

`/health` 和 `/status` 用于确认 Home Server 自身是否可达，`/robot/status` 用于 firmware MCP 工具调用。

## Telegram Bot

启动完整服务：

```bash
pnpm dev
```

当前支持命令：

```text
/start
/help
/chatid
/status
/notify <text>
/led r g b
/photo
```

当前 `/notify` 和 `/led` 会通过 `/robot/ws` 下发给唯一在线的 firmware，并等待 `command_result` 回执。设备离线或多设备同时在线时立即返回错误，不做离线队列。`/photo` 第一版暂未开放，后续接入相机资源仲裁后再实现。

## 测试步骤

### 1. 静态检查

```bash
cd HomeServer
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

预期结果：

- TypeScript 类型检查通过
- 生成 `dist/` 构建目录

### 2. HTTP 运行测试

启动 HTTP 服务：

```bash
pnpm start:http
```

另开一个终端请求状态接口：

```bash
curl -s http://127.0.0.1:8787/status
```

预期响应：

```json
{
  "connected": true,
  "message": "与Home Server连接状态正常",
  "checkedAt": "2026-08-25T00:00:00.000Z"
}
```

`checkedAt` 会使用服务器当前时间。

健康检查：

```bash
curl -s http://127.0.0.1:8787/health
```

预期响应：

```json
{
  "ok": true,
  "connected": true,
  "message": "与Home Server连接状态正常",
  "checkedAt": "2026-08-25T00:00:00.000Z"
}
```

### 3. 机器人状态接口测试

```bash
curl -s http://127.0.0.1:8787/robot/status
```

预期结果：

```json
{
  "connected": true,
  "message": "与Home Server连接状态正常",
  "checkedAt": "2026-08-25T00:00:00.000Z"
}
```

### 4. systemd 测试

```bash
sudo systemctl restart stackchan-home-server
sudo systemctl is-active stackchan-home-server
curl -s http://127.0.0.1:8787/status
```

预期 `systemctl is-active` 输出：

```text
active
```

HTTP 响应应包含：

```json
{
  "connected": true,
  "message": "与Home Server连接状态正常"
}
```

### 5. 局域网访问测试

在同一局域网的另一台机器上请求：

```bash
curl -s http://<linux-host-ip>:8787/status
```

如果本机请求正常但局域网请求失败，检查 Linux 防火墙：

```bash
sudo ufw status
sudo ufw allow 8787/tcp
```

## 机器人接口

`GET /robot/status`

返回：

```json
{
  "connected": true,
  "message": "与Home Server连接状态正常",
  "checkedAt": "2026-08-25T00:00:00.000Z"
}
```

第一版里，firmware 能通过 `self.home.get_status` 访问这个接口，就代表语音、小智 MCP、firmware、Home Server 的核心链路已打通。后续可以在这个状态对象里继续扩展官方 server、StackChan 固件和 Telegram 的连接状态。

## 排障

查看服务日志：

```bash
sudo journalctl -u stackchan-home-server -n 100 --no-pager
```

检查监听端口：

```bash
ss -lntp | grep 8787
```

拉取新代码后重新构建：

```bash
cd /opt/stackchan/repo
git pull
git checkout HomeServer
cd HomeServer
pnpm install --frozen-lockfile
pnpm build
sudo systemctl restart stackchan-home-server
```
