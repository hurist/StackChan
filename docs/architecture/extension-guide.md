# 二次开发扩展指南

> 任务导向：当要实现某个功能时，应该改哪一端、哪个文件、走哪条链路。重点是接入 DeepSeek、新增控制功能、第三方入口、家庭服务器扩展。

---

## 1. 接入新的 LLM / DeepSeek

### 1.1 当前 LLM 在哪里实现？

- **STT / LLM / TTS 都在 XiaoZhi.me 云端执行**，不在 Firmware，也不在 StackChan Server。
- Firmware 只做：麦克风采集 → Opus 编码 → WebSocket 上传 → 接收 Opus/JSON → 播放/更新 UI。
- StackChan Server 只做：从 XiaoZhi.me 换取 Token、代理部分管理 API。
- App 通过 `XiaoZhiUtil` 直连 `https://XiaoZhi.me/` 创建/编辑 Agent、选择模型/TTS、查看聊天历史。

### 1.2 当前 Provider 抽象

- **没有本地 Provider 抽象**。LLM 是 XiaoZhi 云黑盒，Firmware 只与 XiaoZhi WebSocket 协议交互。
- App 侧 Agent 模型字段：`app/lib/model/XiaoZhi/agent.dart` 中的 `llm_model`。
- Server 侧创建/更新 Agent：`server/internal/xiaozhi/xiaozhi.go` → `CreateAgent` / `SetAgentSetting`。

### 1.3 Prompt 在哪里构造？

- **云端**。App/Server 只上传 `character`、`assistant_name`、`user_name`、`memory`、`lang_code` 等字段。
- 实际 System Prompt 拼接由 XiaoZhi 云完成。
- 本地可影响的 Prompt 内容：`Agent.character`、`Agent.memory`、`Agent.assistant_name`、`Agent.user_name`。

### 1.4 API Key 在哪里配置？

- **XiaoZhi Token 由 StackChan Server 代理获取**。
  - App：`app/lib/util/XiaoZhi_util.dart:143` → `getTokenFromServer()` 调用 `GET /stackChan/xiaozhi/token`。
  - Server：`server/internal/xiaozhi/xiaozhi.go:135` → `GetToken()` 用内置 secret 换 token。
- **没有地方配置第三方 LLM 的 API Key**。

### 1.5 Conversation History 在哪里保存？

- **XiaoZhi 云端**。App 从 `https://XiaoZhi.me/api/chats/list` 拉取历史。
- Firmware 不保存对话历史。

### 1.6 是否支持 Streaming？

- **Firmware 侧接收的是 TTS Opus 音频流**，不是 LLM token 流。
- LLM 文本以 `type:llm` JSON 一次性下发（通常只含情绪和摘要文本）。

### 1.7 接入 DeepSeek 的推荐方案

#### 方案 A：云端模型切换（最小改动）

如果 XiaoZhi.me 后台支持 DeepSeek 模型：

1. **App**：在 `app/lib/model/XiaoZhi/agent.dart` 确认 `llm_model` 可设为 `"deepseek-chat"` 等值。
2. **App**：在 `app/lib/view/popup/edit_agent.dart` 的模型选择列表里加入 DeepSeek 选项。
3. **Server**：如果 Server 有模型列表缓存或白名单，更新 `server/internal/xiaozhi/xiaozhi.go` 或对应 model。
4. **Firmware**：无需修改。

> 这是最简单的路径，前提是 XiaoZhi 云支持。

#### 方案 B：自建语音通道（完全绕过 XiaoZhi 云）

如果要在 StackChan Server / 家庭服务器上跑 DeepSeek，需要自建完整的 STT → LLM → TTS 链路：

```text
Firmware 麦克风 → AudioService → Opus
    ↓
Firmware WebSocketProtocol 连接到自建 Server（替换 xiaozhi-esp32 的 websocket url）
    ↓
Server 接收 Opus → 解码 → STT（Whisper 等）→ DeepSeek API → TTS（Edge/Fish 等）
    ↓
Server 返回 JSON + Opus → Firmware 播放
```

需要修改：

| 端 | 文件 | 修改内容 |
|---|---|---|
| Firmware | `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc` | 握手消息、JSON 类型处理兼容自建协议 |
| Firmware | `firmware/xiaozhi-esp32/main/application.cc` | 处理自建 Server 的 stt/llm/tts/mcp 消息 |
| Server | 新增模块 | WebSocket 语音服务、STT/LLM/TTS Provider 抽象 |
| Server | `server/internal/cmd/cmd.go` | 注册新的 WS 路由 |
| App | `app/lib/util/XiaoZhi_util.dart` | 如需从自建 Server 获取 Token/Agent，替换 baseUrl |

> 这是大改动，但能让 LLM/STT/TTS 完全私有化。

#### 方案 C：Server 侧代理 XiaoZhi 并注入 DeepSeek（折中）

保持 Firmware ↔ XiaoZhi 云不变，但在 Server 侧增加一个** MCP 工具或 Agent 编排层**，让 XiaoZhi 的 LLM 在需要时调用 Server 上的 DeepSeek：

```text
User → XiaoZhi LLM → MCP call → Firmware/Server → DeepSeek API → 返回结果给 XiaoZhi
```

需要：

1. 在 Server 新增 MCP Server endpoint。
2. 在 Firmware MCP 注册中增加一个工具，转发到 Server。
3. 或在 XiaoZhi Agent 配置中直接添加 Server MCP endpoint。

> 优点是不改语音通道；缺点是延迟高，且仍依赖 XiaoZhi 云。

### 1.8 接入 DeepSeek 推荐修改清单

假设采用**方案 A（云端切换）**：

1. `app/lib/model/XiaoZhi/agent.dart` — 确认 `llm_model` 字段。
2. `app/lib/view/popup/edit_agent.dart` — 模型下拉列表增加 DeepSeek 选项。
3. `server/internal/xiaozhi/xiaozhi.go` — 如有白名单，同步允许 `llm_model=deepseek-chat`。
4. `app/lib/util/XiaoZhi_util.dart` — 如需显示模型列表，调用对应接口。

假设采用**方案 B（自建通道）**：

1. 新建 `server/internal/voice/` 或 `server/internal/ai/`：
   - `stt_provider.go` — STT 接口与 Whisper 实现。
   - `llm_provider.go` — DeepSeek 接口实现。
   - `tts_provider.go` — TTS 接口与实现。
   - `voice_session.go` — 管理 Firmware WS 会话。
2. `server/internal/web_socket/` — 新增 AI WebSocket handler（或复用现有 WS 但用不同 path）。
3. `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc` — 修改 `GetHelloMessage`、解析自建消息。
4. `firmware/xiaozhi-esp32/main/application.cc` — 调整 JSON dispatch。
5. `server/manifest/config/config.yaml` — 增加 DeepSeek API Key、STT/TTS 配置。

---

## 2. 新增 STT

### 2.1 当前 STT 位置

- 仅存在于 **XiaoZhi 云端**。Firmware 不上传文本，只上传 Opus 音频。

### 2.2 新增本地 STT

如果要在 Firmware 本地跑 STT：

| 位置 | 文件 | 说明 |
|---|---|---|
| 音频输入 | `firmware/xiaozhi-esp32/main/audio/audio_service.cc` | 获取原始 PCM |
| 本地模型推理 | 新增组件 | 如 ESP32-S3 上跑 Whisper tiny / 中文模型；资源消耗大 |
| 结果注入 | `firmware/xiaozhi-esp32/main/application.cc` | 把识别文本当作用户输入 |

> ESP32-S3 算力有限，本地 STT 通常只能做极轻量模型。更现实的做法是在 Server/家庭服务器跑 STT。

### 2.3 在 Server 新增 STT

参见「1.7 方案 B」。新增 `server/internal/ai/stt_provider.go`，在 Server WS 语音通道中接收 Firmware Opus，解码后调 STT API，再把文本给 LLM。

---

## 3. 新增 TTS

### 3.1 当前 TTS 位置

- 仅存在于 **XiaoZhi 云端**。Firmware 接收 Opus 音频流播放。

### 3.2 新增本地 TTS

如果要在 Firmware 本地跑 TTS：

| 位置 | 文件 | 说明 |
|---|---|---|
| 文本输入 | `firmware/xiaozhi-esp32/main/application.cc` | 接收 `type:llm` JSON |
| 本地合成 | 新增组件 | 如 ESP-TTS / 离线模型 |
| 音频输出 | `firmware/xiaozhi-esp32/main/audio/audio_service.cc` | 把合成 PCM 推入播放队列 |

### 3.3 在 Server 新增 TTS

参见「1.7 方案 B」。新增 `server/internal/ai/tts_provider.go`，LLM 返回文本后调 TTS API，把 Opus 流回给 Firmware。

---

## 4. 新增机器人动作

### 4.1 本地触发（Mooncake 模式）

```text
新增 Modifier
    ↓
在 AppAvatar / AppDance / Setup 等入口 addModifier
    ↓
Modifier::update() 中调用 GetStackChan().motion().moveTo(yaw, pitch)
    ↓
Motion → Servo → 舵机
```

| 文件 | 说明 |
|---|---|
| `firmware/main/stackchan/modifiers/*.h` | 参考 `BreathModifier`、`DanceModifier`、`SpeakingModifier` |
| `firmware/main/stackchan/motion/motion.h` | `moveTo`、`setSpeed`、`setAutoAngleSyncEnabled` |
| `firmware/main/stackchan/stackchan.h` | `addModifier`、`removeModifier` |

### 4.2 远程触发（App/Server WS）

```text
App 构造 Motion JSON
    ↓
AppState.sendWebSocketMessage(.controlMotion, data: MAC + json)
    ↓
Server readAppClientMessage → ControlAvatar/ControlMotion 分支 → stackChanSendMessage
    ↓
Firmware WebSocketAvatar::handleMessage DataType::ControlMotion
    ↓
GetHAL().onWsMotionData.emit(payload)
    ↓
AppAvatar 回调 → GetStackChan().updateMotionFromJson(payload)
    ↓
StackChan → Motion → Servo
```

| 端 | 文件 | 修改点 |
|---|---|---|
| App | `app/lib/model/expression_data.dart` 或新增 | Motion 数据结构 |
| App | `app/lib/view/home/monitoring_camera.dart` 或新增 | UI 触发 |
| Server | `server/internal/web_socket/web_socket.go` | 已有 ControlMotion 分支，通常无需改动 |
| Firmware | `firmware/main/stackchan/json/json_helper.cpp` | 解析新的 motion JSON 字段 |
| Firmware | `firmware/main/stackchan/motion/motion.h` | 支持新动作参数 |

### 4.3 新增自定义动作命令

如果动作需要新的 WS 消息类型：

1. **Firmware**: `firmware/main/hal/hal_ws_avatar.cpp` `DataType` 枚举新增类型，并在 `handleMessage` 中解析。
2. **Firmware**: `firmware/main/hal/hal.h` 新增 `onWsXxxData` signal；`AppAvatar` 中 connect 处理。
3. **Server**: `server/internal/web_socket/web_socket.go` 新增常量，并在 `readAppClientMessage` / `readStackChanMessage` 中转发。
4. **App**: `app/lib/model/msg_type.dart` 新增枚举值，`AppState.sendWebSocketMessage` 封装发送。

---

## 5. 新增 Avatar 表情

### 5.1 修改默认表情皮肤

| 文件 | 说明 |
|---|---|
| `firmware/main/stackchan/avatar/skins/default/default.cpp` | `DefaultAvatar` 实现 |
| `firmware/main/stackchan/avatar/avatar.h` | 基类接口 |
| `firmware/main/stackchan/stackchan.h` | `attachAvatar` / `resetAvatar` |

### 5.2 通过 App 远程更新表情

表情 JSON 格式由 `firmware/main/stackchan/json/json_helper.cpp` 中的 `avatar::update_from_json` 解析。

当前支持的字段需查看源码。新增表情属性需要：

1. 修改 JSON 解析函数。
2. 修改 `avatar::DefaultAvatar` 或新增 skin。
3. App 侧构造对应 JSON 通过 `ControlAvatar` 发送。

### 5.3 AI 情绪联动

XiaoZhi 云下发的 `type:llm` JSON 通常带 `emotion` 字段。处理位置：

- `firmware/xiaozhi-esp32/main/application.cc` 中 llm 消息 handler。
- 可调用 Board display 接口或 GetStackChan() 更新表情。

> 当前 XiaoZhi 模式与 Mooncake 模式的 Avatar 是两套显示栈（Board display vs StackChan Avatar），联动表情需要桥接。

---

## 6. 新增 App 控制功能

### 6.1 走 Server WebSocket 的远程功能

```text
新增 UI 页面/控件
    ↓
调用 AppState.sendWebSocketMessage(MsgType.xxx, data: MAC + payload)
    ↓
Server 转发给 Firmware
    ↓
Firmware hal_ws_avatar 解析 → HAL signal → App 处理 → 硬件执行
```

新增步骤：

1. `app/lib/model/msg_type.dart` 新增枚举值。
2. `app/lib/app_state.dart` 如有必要，在 `parseMessage` / `webSocketMessageMonitoring` 中处理下行消息。
3. `server/internal/web_socket/web_socket.go` 新增常量，并在 `readAppClientMessage` / `readStackChanMessage` 中转发。
4. `firmware/main/hal/hal_ws_avatar.cpp` 新增 `DataType`。
5. `firmware/main/hal/hal.h` 新增 signal。
6. `firmware/main/apps/app_avatar/app_avatar.cpp` 中 connect 并执行。

### 6.2 走 BLE 的本地点播功能

```text
新增 UI 页面/控件
    ↓
BlueUtil.writeCharacteristic(characteristicUUID, jsonBytes)
    ↓
Firmware hal_ble 解析 JSON
    ↓
HAL signal → AppDance / AppAvatar 处理
```

新增步骤：

1. `app/lib/util/blue_util.dart` 确认 characteristic UUID。
2. `firmware/main/hal/hal_ble.cpp` 新增 BLE 写入处理分支。
3. `firmware/main/hal/hal.h` 新增 signal。
4. 对应 App 中 connect 处理。

---

## 7. 新增 Remote 控制功能

### 7.1 当前 Remote 只能发 8 字节

```text
remote/code/main/joystick/joystick_handle.c
    ↓
生成 8B 包
    ↓
espnow_send_data
```

### 7.2 扩展方式

如果要新增按钮/模式：

1. **Remote**: `remote/code/main/joystick/joystick_handle.c` 读取新输入，填入 8B 包中未使用的位或扩展包格式。
2. **Firmware**: `firmware/main/apps/app_espnow_ctrl/app_espnow_ctrl.cpp:158` 按新格式解析。
3. **Firmware**: 解析后调用 `GetStackChan()` 或 `GetHAL()` 执行新动作。

> 8B 包已用满；新增复杂功能建议改用 ESP-NOW 发送 JSON 或扩展包长度，但需同步修改两端。

---

## 8. 新增 Server API

### 8.1 新增 REST API

```text
新增 api 定义: server/api/xxx/v1/xxx.go
    ↓
新增 controller: server/internal/controller/xxx/xxx_v1_xxx.go
    ↓
新增 service: server/internal/service/xxx.go
    ↓
新增 dao/model（如需数据库）
    ↓
server/internal/cmd/cmd.go 注册路由
```

### 8.2 新增 WebSocket 消息类型

```text
server/internal/web_socket/web_socket.go
    ├── 新增常量
    ├── readAppClientMessage() 新增 case
    ├── readStackChanMessage() 新增 case
    └── 如有需要新增 createMessage / createStringMessage 调用
```

### 8.3 数据库变更

1. `server/check_list/create_mysql_database.sql` 新增表/字段。
2. `server/internal/model/do/` 和 `server/internal/model/entity/` 新增 DO/Entity。
3. `server/internal/dao/` 新增 DAO（可用 `gf gen dao`）。

---

## 9. 新增跨端 Command

新增 Command 需要四端同步：

| 端 | 必须修改 | 可选修改 |
|---|---|---|
| App | `model/msg_type.dart`、`app_state.dart` 封装/解析 | UI 页面 |
| Server | `web_socket/web_socket.go` 常量 + 转发逻辑 | 数据库/状态 |
| Firmware | `hal_ws_avatar.cpp` DataType + `handleMessage` | - |
| Firmware | `hal.h` 新增 signal | - |
| Firmware | 对应 App（如 `app_avatar.cpp`）connect 处理 | StackChan/JSON 解析 |

新增 Command  checklist：

- [ ] 协议常量在三处一致（App enum、Server const、Firmware enum）。
- [ ] App payload 前 12 字节是目标 MAC（如果是定向到某台 Firmware）。
- [ ] Server 去掉 MAC 再转发给 Firmware（参考现有 ControlAvatar/ControlMotion 处理）。
- [ ] Firmware 解析后通过 HAL signal 分发，避免 WS 层直接依赖 UI。
- [ ] 如有下行消息，Server 需从 Firmware 转发回 App（参考 DeviceOnline/Offline）。

---

## 10. 接入 Home Assistant

### 10.1 当前是否存在完整集成？

> **当前版本未发现完整的 Home Assistant 集成。** 现有协议是自定义二进制 WebSocket + BLE + ESP-NOW。

### 10.2 推荐接入层

有三种可行方式：

#### 方式 A：Server 作为 Home Assistant 桥接（推荐）

```text
Home Assistant ── MQTT / WebSocket ── StackChan Server ── StackChan Firmware
```

- **优点**: 不用改 Firmware；复用 Server 的 WS 转发和设备管理。
- **实现**: 在 Server 新增 `internal/controller/homeassistant/` 或 `internal/service/homeassistant/`，订阅 HA MQTT topic，把命令转成现有 WS 消息发给 Firmware。
- **入口文件**: `server/internal/cmd/cmd.go` 注册路由或 MQTT 客户端。

#### 方式 B：Firmware 直接连 HA MQTT

```text
Home Assistant ── MQTT ── StackChan Firmware
```

- **优点**: 不依赖 StackChan Server/互联网。
- **实现**: 复用 `firmware/main/hal/hal_ezdata.cpp` 的 MQTT 能力，新增 HA 专用 MQTT client。
- **入口文件**: `firmware/main/hal/hal_ezdata.cpp`、新增 `firmware/main/hal/hal_homeassistant.cpp`。
- **注意**: 需要处理 HA 设备发现（discovery）、状态回传、安全认证。

#### 方式 C：HA 通过 App 控制

- 在 App 中增加 HA 插件或 Matter/HA Mobile App 集成。
- 不太自然，不推荐。

### 10.3 推荐修改清单（方式 A）

1. `server/manifest/config/config.yaml` — 增加 Home Assistant MQTT broker 配置。
2. 新增 `server/internal/service/homeassistant/` — MQTT 客户端、设备发现、命令转换。
3. `server/internal/cmd/cmd.go` — 启动时初始化 HA 服务。
4. 复用 `server/internal/web_socket/web_socket.go` 的转发函数，把 HA 命令转成 `ControlAvatar`/`ControlMotion` 等。

---

## 11. 接入微信 / QQ / 第三方聊天入口

### 11.1 应该接 Server 还是 Firmware？

**强烈建议接 Server**，原因：

- 微信/QQ Webhook 需要稳定的公网入口和账号体系，Server 更适合。
- 消息需要经过 LLM 处理，当前 LLM 在云端或 Server 侧（私有化场景）。
- Firmware 不承担多用户、长连接、第三方平台适配的职责。

推荐架构：

```text
微信/QQ 服务器 ── Webhook ── StackChan Server ── WebSocket ── Firmware
                                    │
                                    └── DeepSeek / LLM
```

### 11.2 推荐实现

1. **新增 Server 模块** `server/internal/service/chatbot/`：
   - 接收微信/QQ Webhook。
   - 管理用户会话、设备绑定。
   - 调用 LLM（DeepSeek）生成回复。
   - 通过 WS 把文本消息（`TextMessage` 0x07）发给 Firmware，让机器人朗读/显示。

2. **复用现有协议**：
   - 用 `TextMessage` 让 Firmware 显示/朗读用户消息。
   - 如需机器人回复语音，让 Server 调 TTS 后通过 WS 发送 `Opus` 给 Firmware 播放。

3. **入口文件**：
   - `server/internal/cmd/cmd.go` 注册 webhook 路由。
   - `server/internal/web_socket/web_socket.go` 复用 `TextMessage` / `Opus` 转发。
   - `firmware/main/apps/app_avatar/app_avatar.cpp:188` 处理 `onWsTextMessage`。

---

## 12. 家庭服务器扩展

### 12.1 目标架构

```text
                 ┌── DeepSeek / 本地 LLM
                 │
StackChan ── Home Server ── Home Assistant
                 │
                 ├── 本地 STT / TTS
                 │
                 ├── 微信 / QQ
                 │
                 └── 其他家庭服务
```

### 12.2 当前 Server 是否能承担这个角色？

**可以，但需要扩展。** 当前 StackChan Server 是 GoFrame 后端，已具备：

- HTTP/WebSocket 服务。
- 用户/设备管理。
- App ↔ Firmware 实时转发。
- XiaoZhi Token 代理。

缺少：

- 本地 LLM/STT/TTS Provider 抽象。
- Home Assistant 桥接。
- 第三方聊天入口。
- 语音通道自建能力。

### 12.3 哪些代码可以直接复用？

| 现有能力 | 复用方式 |
|---|---|
| `server/internal/web_socket/web_socket.go` | 转发 App/Firmware 消息；新增家庭服务消息类型 |
| `server/internal/model/web_socket_model.go` | 连接池模型 |
| `server/internal/middleware/middleware.go` | 认证 |
| `server/internal/xiaozhi/xiaozhi.go` | Token 代理模式可参考 |
| `firmware/main/hal/hal_ws_avatar.cpp` | 复用 WS 通道连接家庭服务器 |

### 12.4 哪些应该留在 Firmware？

| 能力 | 留在 Firmware 的原因 |
|---|---|
| 麦克风采集 / 扬声器播放 | 实时性、硬件直接访问 |
| 舵机控制 / Avatar 渲染 | 硬件直接访问 |
| 离线唤醒词 | 降低延迟、断网可用 |
| MCP 工具执行（最终动作） | 设备端执行 |
| ESP-NOW 遥控 | 局域网直连 |

### 12.5 哪些适合迁移到 Home Server？

| 能力 | 迁移原因 |
|---|---|
| STT | 算力需求大 |
| LLM | 算力需求大 |
| TTS | 算力/模型大 |
| 微信/QQ 入口 | 需要公网、账号体系 |
| Home Assistant 桥接 | 需要稳定常驻服务 |
| 聊天历史 / 记忆 | 需要持久化存储 |
| 多设备调度 | Server 更适合 |

### 12.6 Firmware 和 Server 之间现有协议是否够用？

**不够用于完整家庭 AI 中枢。** 当前自定义二进制协议主要面向：

- 远程控制（Avatar/Motion/Dance）。
- 视频/音频通话。
- 设备状态通知。

缺少：

- 语音通道（当前走 XiaoZhi 云）。
- 结构化 MCP 消息（当前 MCP 只存在于 Firmware ↔ XiaoZhi 云）。
- Home Assistant 设备发现/状态同步。

### 12.7 是否需要增加统一 Command / Event 层？

**建议增加。** 当前协议是扁平的 msgType 枚举。扩展家庭服务器时建议：

1. **新增 `Event` / `Command` 命名空间**：
   - `0x20-0x3F` 留给家庭服务命令。
   - `0x40-0x5F` 留给设备事件上报。

2. **Payload 统一用 JSON Schema**：
   ```json
   {"ns":"homeassistant","cmd":"light.on","args":{"entity_id":"light.living_room"}}
   ```

3. **在 Server 增加消息路由器**：
   - `server/internal/web_socket/web_socket.go` 根据 `ns` 分发到不同 service。

4. **在 Firmware 增加通用 Command Handler**：
   - 在 `firmware/main/apps/app_avatar/app_avatar.cpp` 或新增 `app_homeassistant.cpp` 中处理。

### 12.8 家庭服务器扩展推荐修改清单

1. **Server 侧新增 AI Provider 层**：
   - `server/internal/ai/llm_provider.go` — DeepSeek / OpenAI 兼容接口。
   - `server/internal/ai/stt_provider.go` — Whisper 等。
   - `server/internal/ai/tts_provider.go` — Fish / Edge 等。

2. **Server 侧新增语音通道**：
   - `server/internal/voice/voice_session.go` — 管理 Firmware 语音会话。
   - 在 `cmd.go` 注册新 WS path（如 `/stackChan/voice`）。

3. **Server 侧新增家庭服务桥接**：
   - `server/internal/service/homeassistant/` — MQTT 桥接。
   - `server/internal/service/chatbot/` — 微信/QQ Webhook。

4. **Firmware 侧新增语音通道切换**：
   - 修改 `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc` 连接家庭服务器。
   - 或保留 XiaoZhi 云通道，新增一个家庭服务器通道在 Mooncake 模式下使用。

5. **配置**：
   - `server/manifest/config/config.yaml` — AI provider key、MQTT broker、Webhook secret。
   - `firmware/main/Kconfig.projbuild` — 可选配置家庭服务器 URL。

---

## 13. 通用安全注意事项

- **RSA 密钥**: App、Server、Firmware 三方必须一致；修改时要同步替换。
- **MAC 认证**: WebSocket 握手用 MAC + 时间戳，防止重放；时间差 10 秒。
- **Token**: XiaoZhi Token 缓存在 Server 内存和 App SharedPreferences，多实例 Server 需外置缓存。
- **OTA URL**: 决定 Firmware 从哪下载固件和 AI 通道配置，生产环境必须 HTTPS。
- **BLE 配对**: 首次配对通过 RSA handshake；之后 MAC 写入 App SharedPreferences。

---

## 14. 修改后验证清单

| 修改类型 | 验证项 |
|---|---|
| 新增 WS 消息类型 | App/Server/Firmware 三端常量一致；payload 长度、MAC 处理正确 |
| 新增 BLE 特征 | App `blue_util.dart` UUID 与 Firmware `hal_ble.cpp` 一致 |
| 新增 MCP 工具 | Firmware 注册、JSON-RPC 返回、云端/LLM 调用均正常 |
| 修改 Motion/Avatar JSON | `json_helper.cpp` 解析与 App 构造字段一致 |
| 新增 Server API | `cmd.go` 注册、controller/service/dao 连通、JWT/RSA 认证正常 |
| 修改 OTA/AI 通道地址 | Firmware 能联网、能拿到正确配置、能连接 |
| 新增 AI Provider | Server 能调通、Firmware 能收到正确 Opus/JSON |
