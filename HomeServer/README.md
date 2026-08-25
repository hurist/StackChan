# StackChan Home Server

Home Server 是 StackChan 的本地扩展中枢。它和官方 StackChan Server 分开维护，用来承载自定义能力，避免为了扩展功能而替换官方服务。

当前范围：

- HTTP 健康检查和状态接口
- MCP stdio 服务
- MCP 工具：`home.get_server_status`

后续规划：

- StackChan 固件连接状态
- Telegram Bot 接入
- 本地自动化和更多 MCP 工具

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

构建并启动 MCP stdio 服务：

```bash
pnpm dev:mcp
```

启动已构建的 HTTP 服务：

```bash
pnpm start:http
```

启动已构建的 MCP stdio 服务：

```bash
pnpm start:mcp
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
```

## MCP 客户端配置

在 MCP 客户端中配置已构建的 MCP 入口：

```json
{
  "mcpServers": {
    "stackchan-home": {
      "command": "node",
      "args": ["/opt/stackchan/repo/HomeServer/dist/mcp/server.js"],
      "env": {
        "HOME_SERVER_NAME": "stackchan-home-server"
      }
    }
  }
}
```

## HTTP 接口

```bash
curl http://localhost:8787/health
curl http://localhost:8787/status
```

这两个接口目前用于确认 Home Server 自身是否可达。

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

### 3. MCP 启动测试

```bash
pnpm start:mcp
```

预期结果：

- 进程启动时没有错误。
- 在普通终端里，如果 stdin 关闭，进程可能会直接退出；这是 stdio MCP 服务的正常行为。

### 4. MCP 工具测试

按上面的示例配置 MCP 客户端，然后调用：

```text
home.get_server_status
```

预期工具结果：

```json
{
  "connected": true,
  "message": "与Home Server连接状态正常",
  "checkedAt": "2026-08-25T00:00:00.000Z"
}
```

### 5. systemd 测试

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

### 6. 局域网访问测试

在同一局域网的另一台机器上请求：

```bash
curl -s http://<linux-host-ip>:8787/status
```

如果本机请求正常但局域网请求失败，检查 Linux 防火墙：

```bash
sudo ufw status
sudo ufw allow 8787/tcp
```

## MCP 工具

`home.get_server_status`

返回：

```json
{
  "connected": true,
  "message": "与Home Server连接状态正常",
  "checkedAt": "2026-08-25T00:00:00.000Z"
}
```

第一版里，MCP 调用成功就代表 MCP 客户端能连接到 Home Server。后续可以在这个状态对象里继续扩展官方 server、StackChan 固件和 Telegram 的连接状态。

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
