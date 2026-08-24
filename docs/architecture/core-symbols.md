# 核心代码符号索引

> 每端只保留对二次开发影响最大的 5～20 个符号。包含：职责、入口价值、主要调用方、依赖、修改影响。

---

## Firmware

### `app_main()`

- **文件**: `firmware/main/main.cpp:16`
- **职责**: 固件唯一入口；决定启动 Mooncake UI 还是直接进入 XiaoZhi AI。
- **为什么重要**: 所有运行时切换逻辑都在这里。
- **主要调用方**: Bootloader
- **主要依赖**: `GetHAL().init()`、`GetMooncake()`、`GetHAL().startXiaozhi()`
- **修改影响**: 改动启动顺序会影响所有 App 和 AI 模式的初始化。

---

### `GetHAL()` / `Hal`

- **文件**: `firmware/main/hal/hal.h`、`firmware/main/hal/hal.cpp`
- **职责**: 硬件抽象层单例；聚合显示、音频、舵机、网络、BLE、ESP-NOW、WS Avatar、OTA、账户等能力。
- **为什么重要**: 所有 Mooncake App 与 StackChan 引擎通过它访问硬件。
- **主要调用方**: 所有 Mooncake App、StackChan 引擎、XiaoZhi Board Bridge。
- **主要依赖**: ESP-IDF 驱动、Mooncake、Board 桥接。
- **修改影响**: 新增硬件能力通常要在这里暴露接口；改动会影响所有上层调用者。

---

### `GetStackChan()` / `stackchan::StackChan`

- **文件**: `firmware/main/stackchan/stackchan.h`、`stackchan.cpp`
- **职责**: 机器人核心引擎单例；持有 Avatar、Motion、NeonLight、Modifiers。
- **为什么重要**: 表情、动作、灯光、舞蹈的最终执行入口。
- **主要调用方**: `AppAvatar`、`AppDance`、`AppEspnowControl`、各 Modifier。
- **主要依赖**: Avatar、Motion、NeonLight。
- **修改影响**: 改动会影响所有表情/动作/灯光相关功能。

---

### `motion::Motion` / `motion::Servo`

- **文件**: `firmware/main/stackchan/motion/motion.h`、`motion.cpp`、`servo.cpp`
- **职责**: 双轴舵机控制、角度规划、速度控制、归零、堵转保护。
- **为什么重要**: 头部动作的最终执行点。
- **主要调用方**: `StackChan`、各 Modifier、ESP-NOW App、BLE/WS JSON 更新。
- **主要依赖**: UART、SCSCL servo 协议。
- **修改影响**: 改这里会影响 Remote、App、AI 情绪表达的所有头部动作。

---

### `avatar::DefaultAvatar`

- **文件**: `firmware/main/stackchan/avatar/skins/default/default.cpp`
- **职责**: 默认表情皮肤；眼睛、嘴巴、语音气泡、装饰器。
- **为什么重要**: 所有 Avatar 渲染的基础实现。
- **主要调用方**: `AppAvatar`、`AppDance` 等需要显示表情的 App。
- **主要依赖**: LVGL、Smooth UI Toolkit。
- **修改影响**: 改这里会影响所有表情显示。

---

### `WebSocketAvatar`

- **文件**: `firmware/main/hal/hal_ws_avatar.cpp`
- **职责**: Firmware 与 Server/App 的 WebSocket 连接；收发二进制协议帧（Opus/Jpeg/Control/Call/Dance 等）。
- **为什么重要**: 远程控制、视频、通话、舞蹈的入口。
- **主要调用方**: `AppAvatar`、`GetHAL()`。
- **主要依赖**: Network、Board、Secret Logic（认证）。
- **修改影响**: 新增跨端消息类型必须在这里解析并转发事件。

---

### `Hal::onWsAvatarData` / `onWsMotionData` / `onWsCallRequest` / `onWsTextMessage` / `onWsDanceData`

- **文件**: `firmware/main/hal/hal.h`
- **职责**: HAL 提供的事件信号，用于把 WS 二进制消息分发到订阅者（通常是 AppAvatar）。
- **为什么重要**: 松耦合事件总线，避免 WS 层直接依赖 UI 层。
- **主要调用方**: `WebSocketAvatar` emit；`AppAvatar` connect。
- **主要依赖**: smooth_ui_toolkit signal/slot。
- **修改影响**: 新增 WS 消息类型需要新增 signal；注意 connect/clear 生命周期，避免 dangling。

---

### `AppAvatar` / `AppDance` / `AppEspnowControl` / `AppLauncher`

- **文件**: `firmware/main/apps/app_avatar/app_avatar.cpp` 等
- **职责**: Mooncake App；分别负责 WS 远程 Avatar、BLE 舞蹈、ESP-NOW 遥控、Launcher 桌面。
- **为什么重要**: 业务入口；onOpen/onRunning/onClose 管理生命周期。
- **主要调用方**: `GetMooncake()`。
- **主要依赖**: HAL、StackChan、LVGL。
- **修改影响**: 新增业务功能通常以新增 App 或修改现有 App 回调实现。

---

### `Application`（XiaoZhi）

- **文件**: `firmware/xiaozhi-esp32/main/application.h`、`application.cc`
- **职责**: XiaoZhi AI 模式主循环；状态机、网络事件、音频事件、MCP 调度。
- **为什么重要**: AI 语音对话的大脑。
- **主要调用方**: `GetHAL().startXiaozhi()`。
- **主要依赖**: `AudioService`、`Protocol`、`Ota`、`McpServer`、`Board`。
- **修改影响**: 改这里会影响 AI 交互全流程。

---

### `AudioService`

- **文件**: `firmware/xiaozhi-esp32/main/audio/audio_service.h`、`audio_service.cc`
- **职责**: 麦克风采集、Opus 编解码、音频播放、AFE/VAD/AEC、唤醒词。
- **为什么重要**: AI 语音的输入输出枢纽。
- **主要调用方**: `Application`。
- **主要依赖**: AudioCodec、esp-sr、opus、Board。
- **修改影响**: 改这里会影响 AI 语音质量、唤醒、回声消除。

---

### `WebsocketProtocol` / `MqttProtocol`

- **文件**: `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc`、`mqtt_protocol.cc`、`protocol.h`
- **职责**: 与 XiaoZhi 云建立实时语音通道；发送 Opus、接收 Opus + JSON。
- **为什么重要**: AI 云通信的唯一通道。
- **主要调用方**: `Application`、`AudioService`。
- **主要依赖**: Network、Settings（url/token）。
- **修改影响**: 改这里会影响 AI 云连接、音频传输、JSON 协议解析。

---

### `McpServer`

- **文件**: `firmware/xiaozhi-esp32/main/mcp_server.h`、`mcp_server.cc`
- **职责**: 注册并执行设备端 MCP 工具；JSON-RPC 2.0 处理。
- **为什么重要**: LLM 控制设备的扩展点。
- **主要调用方**: `Application::Initialize` 注册工具，`Application` 处理 `type:mcp` 消息。
- **主要依赖**: Board、Camera、Display、Settings。
- **修改影响**: 新增 LLM 可调用的设备能力在这里注册。

---

### `Board::GetInstance()` / `M5StackCoreS3Board` / `StackChanAvatarDisplay`

- **文件**: `firmware/xiaozhi-esp32/main/boards/common/board.cc`、`firmware/main/hal/board/hal_bridge.cc`
- **职责**: XiaoZhi 板级抽象；桥接 StackChan 硬件到 XiaoZhi（显示、音频、摄像头）。
- **为什么重要**: 两套运行时的硬件共享层。
- **主要调用方**: `Application`、`AudioService`、`McpServer`。
- **主要依赖**: HAL、StackChan 驱动。
- **修改影响**: 改这里会影响 Mooncake 与 XiaoZhi 两个模式的硬件行为。

---

### `Settings`

- **文件**: `firmware/xiaozhi-esp32/main/settings.cc`
- **职责**: NVS 配置持久化；存储 WiFi、OTA URL、WebSocket URL、Token 等。
- **为什么重要**: 跨重启状态保存；AI 通道地址来源。
- **主要调用方**: `Ota`、`WebsocketProtocol`、`Application`、HAL。
- **主要依赖**: ESP-IDF NVS。
- **修改影响**: 改 key/namespace 要小心与 OTA 下发、现有 NVS 数据兼容。

---

## Server

### `cmd.Main`

- **文件**: `server/internal/cmd/cmd.go`
- **职责**: GoFrame 服务启动；注册 HTTP 路由、WebSocket、中间件、Cron。
- **为什么重要**: Server 端入口。
- **主要调用方**: `server/main.go`。
- **主要依赖**: GoFrame、g.Server()。
- **修改影响**: 新增 REST API 或 WS 路由需要在这里注册。

---

### `web_socket.Handler`

- **文件**: `server/internal/web_socket/web_socket.go:110`
- **职责**: `/stackChan/ws` WebSocket 处理器；维护 StackChanClient / AppClient 连接池，按 MAC 转发二进制帧。
- **为什么重要**: App 与 Firmware 实时通信的中枢。
- **主要调用方**: `cmd.go` 路由注册。
- **主要依赖**: gorilla/websocket、model、service。
- **修改影响**: 新增跨端消息类型通常需要在这里加分支；改动转发逻辑影响所有实时功能。

---

### `StackChanClient` / `AppClient`

- **文件**: `server/internal/model/web_socket_model.go`
- **职责**: WS 连接对象；持有 MAC、conn、订阅列表、通话状态、最后心跳时间。
- **为什么重要**: Server 端状态核心。
- **主要调用方**: `web_socket.go` Handler 与转发函数。
- **主要依赖**: gorilla/websocket。
- **修改影响**: 新增连接级状态（如订阅、通话）要在这里扩展。

---

### `middleware.TokenAuthMiddleware` / `V2TokenAuthMiddleware` / `AdminTokenAuthMiddleware`

- **文件**: `server/internal/middleware/middleware.go`
- **职责**: JWT、RSA MAC、Admin Token 认证。
- **为什么重要**: 安全边界。
- **主要调用方**: `cmd.go` 注册到路由分组。
- **主要依赖**: JWT、RSA。
- **修改影响**: 改动认证方式会影响 App、Firmware 所有请求。

---

### `utility.RSADecrypt` / `RSAEncrypt`

- **文件**: `server/utility/rsa.go`
- **职责**: RSA 加解密；WS 握手与设备认证的核心。
- **为什么重要**: Firmware / App 与 Server 建立 WS 时都依赖它校验 MAC。
- **主要调用方**: `web_socket.GetMac`、控制器中需要 RSA 校验的位置。
- **主要依赖**: crypto/rsa。
- **修改影响**: 密钥、填充方式改动必须与 Firmware/App 同步。

---

### `xiaozhi.GetToken` / `xiaozhi.doRequest`

- **文件**: `server/internal/xiaozhi/xiaozhi.go`
- **职责**: 与 XiaoZhi.me 交互；获取 Token、代理 Agent/设备管理。
- **为什么重要**: StackChan Server 是 App 访问 XiaoZhi 云的 Token 代理。
- **主要调用方**: XiaoZhi 相关 controller、service。
- **主要依赖**: gclient、全局缓存 token。
- **修改影响**: 改这里会影响 App 获取 XiaoZhi Token、Agent 配置。

---

### `service.User` / `service.Device` / `service.Dance`

- **文件**: `server/internal/service/user.go`、`device.go`、`dance.go`
- **职责**: 用户、设备、舞蹈等业务逻辑。
- **为什么重要**: REST API 的后端业务层。
- **主要调用方**: 对应 Controller。
- **主要依赖**: DAO、Model。
- **修改影响**: 改业务规则会影响 App 对应功能。

---

## App

### `AppState.shared`

- **文件**: `app/lib/app_state.dart`
- **职责**: 全局状态（登录、设备 MAC、WS、BLE、Toast、消息解析/封装）。
- **为什么重要**: 几乎所有页面和工具类都依赖它。
- **主要调用方**: main.dart、各 View、Http、WebSocketUtil、BlueUtil。
- **主要依赖**: GetX、SharedPreferences、Dio。
- **修改影响**: 改动会影响全局；`parseMessage` / `sendWebSocketMessage` 是跨端协议核心封装。

---

### `WebSocketUtil.shared`

- **文件**: `app/lib/network/web_socket_util.dart`
- **职责**: 与 StackChan Server WebSocket 连接；观察者模式分发消息。
- **为什么重要**: 远程控制、视频、通话的消息通道。
- **主要调用方**: `AppState`、`Avatar`、`MonitoringCamera`、Dance 页面。
- **主要依赖**: dart:io WebSocket、GetX。
- **修改影响**: 改动连接/重连/分发逻辑会影响所有实时功能。

---

### `Http.instance`

- **文件**: `app/lib/network/http.dart`
- **职责**: Dio 单例；与 StackChan Server REST 通信。
- **为什么重要**: 登录、设备绑定、社区内容、文件上传的 HTTP 通道。
- **主要调用方**: 各 Service/Util、ViewModel。
- **主要依赖**: Dio、`Urls`。
- **修改影响**: 改拦截器、BaseURL、Token 注入会影响所有 Server API 调用。

---

### `BlueUtil.shared`

- **文件**: `app/lib/util/blue_util.dart`
- **职责**: BLE 扫描、连接、GATT 特征读写；配网、本地点播。
- **为什么重要**: 本地直连 Firmware 的入口。
- **主要调用方**: 绑定流程、Dance 页面、部分设置页。
- **主要依赖**: flutter_blue_plus。
- **修改影响**: 改动 BLE 特征/服务 UUID 必须与 Firmware `hal_ble.cpp` 同步。

---

### `XiaoZhiUtil.shared`

- **文件**: `app/lib/util/XiaoZhi_util.dart`
- **职责**: 直连 XiaoZhi.me REST API；Agent、设备、聊天历史、Token。
- **为什么重要**: AI Agent 配置的入口。
- **主要调用方**: `AgentConfiguration`、`EditAgent`、`ConversationPage`。
- **主要依赖**: Dio、SharedPreferences。
- **修改影响**: 改这里会影响 AI Agent、聊天历史、模型/TTS 选择。

---

### `AudioEngineManager.shared`

- **文件**: `app/lib/util/audio_engine_manager.dart`
- **职责**: Opus 编解码、原生 PCM 播放/录音。
- **为什么重要**: 视频通话中音频播放（以及潜在发送）的入口。
- **主要调用方**: `MonitoringCamera`、NativeBridge。
- **主要依赖**: opus_codec、MethodChannel。
- **修改影响**: 改音频格式或原生桥接会影响通话音频。

---

### `RsaUtil`

- **文件**: `app/lib/util/rsa_util.dart`
- **职责**: RSA-OAEP-SHA256 加解密；BLE 握手与 WS 认证。
- **为什么重要**: 安全认证的关键。
- **主要调用方**: `select_blue_device.dart`、`web_socket_util.dart`。
- **主要依赖**: pointycastle。
- **修改影响**: 算法/密钥改动必须与 Server/Firmware 同步。

---

### `Urls`

- **文件**: `app/lib/network/urls.dart`
- **职责**: 后端地址与 API 路径。
- **为什么重要**: 集中配置 Server 与 XiaoZhi 地址。
- **主要调用方**: `Http`、`WebSocketUtil`、`XiaoZhiUtil`。
- **主要依赖**: -。
- **修改影响**: 改这里会影响 App 连接的所有服务端点。

---

### `MsgType`

- **文件**: `app/lib/model/msg_type.dart`
- **职责**: WebSocket 二进制消息类型枚举；与 Firmware/Server 协议对齐。
- **为什么重要**: 新增跨端消息必须在这里加枚举值。
- **主要调用方**: `AppState.parseMessage`、`sendWebSocketMessage`、各 View。
- **主要依赖**: -。
- **修改影响**: 值必须与 `firmware/main/hal/hal_ws_avatar.cpp` 和 `server/internal/web_socket/web_socket.go` 中的常量一致。

---

## Remote

### `app_main()`

- **文件**: `remote/code/main/StackChan-RemoteControl-ESPNow.cpp`
- **职责**: 遥控器入口；初始化 M5、摇杆、LVGL、ESP-NOW。
- **为什么重要**: 唯一入口。
- **主要调用方**: Bootloader。
- **主要依赖**: M5Unified、LVGL、ESP-NOW。
- **修改影响**: 改动启动顺序或外设初始化会影响整个遥控器。

---

### `joystick_handle` / `handle_running_screen`

- **文件**: `remote/code/main/joystick/joystick_handle.c`
- **职责**: 读取摇杆/IMU、生成 8 字节动作包、三屏 UI 任务。
- **为什么重要**: 控制逻辑核心。
- **主要调用方**: `app_main`。
- **主要依赖**: I2C、ESP-NOW。
- **修改影响**: 改包格式或映射关系必须与 Firmware `app_espnow_ctrl.cpp` 同步。

---

### `espnow_send_data`

- **文件**: `remote/code/main/esp_now/esp_now_init.c`
- **职责**: 通过 ESP-NOW 发送 8 字节控制包。
- **为什么重要**: 遥控器到机器人的实际传输点。
- **主要调用方**: `joystick_handle`。
- **主要依赖**: esp-now。
- **修改影响**: 改发送方式会影响遥控可靠性。

---

## 全局状态与隐藏耦合

### Firmware

| 全局/单例 | 隐藏耦合 | 注意 |
|---|---|---|
| `GetHAL()` | 所有 App 通过它访问硬件；事件信号在 HAL 上定义 | 新增事件要同时更新 HAL 和订阅者 |
| `GetStackChan()` | Modifier 互相影响状态；add/remove 返回 id | 注意 Modifier 生命周期，避免重复或悬空 |
| `Board::GetInstance()` | XiaoZhi 与 Mooncake 共享 | 修改 board 实现要同时验证两个模式 |
| `Application::GetInstance()` | XiaoZhi 全局状态机 | 多处通过它调度任务和重启 |
| `Settings` NVS | 跨重启持久化；key 分散在各模块 | 新增 key 要统一 namespace 规划 |

### Server

| 全局/单例 | 隐藏耦合 | 注意 |
|---|---|---|
| `stackChanClientPool` / `appClientPool` | 按 MAC 组织的 sync.Map | 新增字段要确保并发安全 |
| `xiaozhi.token` | 全局缓存，24h 刷新 | 多实例部署会成为问题 |

### App

| 全局/单例 | 隐藏耦合 | 注意 |
|---|---|---|
| `AppState.shared` | 所有页面共享，GetX 响应式 | 避免在这里放过多业务逻辑 |
| `WebSocketUtil.shared` | 观察者模式，tag 订阅 | 页面 dispose 时要 removeObserver，否则内存泄漏 |
| `XiaoZhiUtil.shared` | Token 缓存在 SharedPreferences | 401 时自动刷新并重试 |
