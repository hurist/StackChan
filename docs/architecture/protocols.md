# 跨端协议

> 只记录源码中真实存在的协议和消息。不包含假设。

---

## 1. 通信矩阵

| Source | Target | 协议 | 用途 | 实现位置 |
|---|---|---|---|---|
| App | Server | HTTP REST | 登录、注册、设备绑定、社区内容、文件上传 | `app/lib/network/http.dart` ↔ `server/internal/controller/**/*.go` |
| App | Server | WebSocket | 远程控制、摄像头/音频流、通话、舞蹈、文本消息 | `app/lib/network/web_socket_util.dart` ↔ `server/internal/web_socket/web_socket.go` |
| App | Firmware | BLE GATT | 首次配网、绑定握手、本地点播/舞蹈、motion/avatar/rgb | `app/lib/util/blue_util.dart` ↔ `firmware/main/hal/hal_ble.cpp` |
| Server | Firmware | WebSocket | 同 App→Server→Firmware 的中继路径 | `server/internal/web_socket/web_socket.go` ↔ `firmware/main/hal/hal_ws_avatar.cpp` |
| Firmware | XiaoZhi 云 | WebSocket / MQTT+UDP | 实时语音对话（STT/LLM/TTS） | `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc`、`mqtt_protocol.cc` |
| Server | XiaoZhi 云 | HTTP REST | Token、License、Agent/设备管理 | `server/internal/xiaozhi/xiaozhi.go` |
| App | XiaoZhi 云 | HTTP REST | Agent 配置、聊天历史、TTS/模型列表 | `app/lib/util/XiaoZhi_util.dart` |
| Firmware | EzData 云 | MQTT | M5Stack EzData 数据同步 | `firmware/main/hal/hal_ezdata.cpp` |
| Firmware | OTA 服务 | HTTP | 固件/资源升级 | `firmware/xiaozhi-esp32/main/ota.cc`、`firmware/main/hal/hal_ota.cpp` |
| Firmware | Server | HTTP | 账户信息、设备信息、App 商店 | `firmware/main/hal/hal_account.cpp`、`hal_app_center.cpp` |
| Remote | Firmware | ESP-NOW | 摇杆/IMU 控制舵机与激光 | `remote/code/main/esp_now/esp_now_init.c` ↔ `firmware/main/hal/hal_espnow.cpp` |

---

## 2. Server ↔ Firmware / App 的自定义 WebSocket 二进制协议

### 帧格式

所有二进制帧统一格式：

```text
[1 byte msgType][4 bytes length (Big Endian)][payload]
```

长度字段表示 payload 字节数。App 端封装见 `app/lib/app_state.dart:187`，Firmware 端见 `firmware/main/hal/hal_ws_avatar.cpp:440`，Server 端见 `server/internal/web_socket/web_socket.go:814`。

### 消息类型

| 类型 | 值 | 方向 | Payload 说明 | 处理点 |
|---|---|---|---|---|
| `Opus` | `0x01` | F→S→A / A→S→F | Opus 音频帧 | Server 转发；Firmware 收到后走 `AudioStreamPacket`；App 用 `AudioEngineManager` 播放 |
| `Jpeg` | `0x02` | F→S→A / A→S→F | JPEG 图像帧；A→F 时前 12 字节为 MAC | Server 按订阅转发；Firmware 解码显示；App `Image.memory` 显示 |
| `ControlAvatar` | `0x03` | A→S→F | 表情 JSON；前 12 字节 MAC | Server 去 MAC 后转发；Firmware `onWsAvatarData` → `updateAvatarFromJson` |
| `ControlMotion` | `0x04` | A→S→F | 动作 JSON；前 12 字节 MAC | Server 去 MAC 后转发；Firmware `onWsMotionData` → `updateMotionFromJson` |
| `OnCamera` | `0x05` | A→S→F | 目标 MAC | Server 订阅并通知 Firmware 开始推流 |
| `OffCamera` | `0x06` | A→S→F | 目标 MAC | 停止摄像头推流 |
| `TextMessage` | `0x07` | A↔F | JSON `{"name":..., "content":...}`；前 12 字节 MAC | 聊天文本消息 |
| `RequestCall` | `0x09` | A→S→F | 通话请求；前 12 字节 MAC | Firmware 弹出 `WsCallView` |
| `RefuseCall` | `0x0A` | F→S→A | 拒绝通话 | 通知 App |
| `AgreeCall` | `0x0B` | F→S→A | 同意通话；Server 加入摄像头/音频订阅 | 通知 App |
| `HangupCall` | `0x0C` | A↔F | 挂断；清理订阅 | Server 清理 callAppClient |
| `UpdateDeviceName` | `0x0D` | A→S→F | 新设备名 | Server 转发并更新数据库 |
| `GetDeviceName` | `0x0E` | A↔F | 查询/返回设备名 | Server 查 `service.GetDeviceName` |
| `HeartbeatPing` | `0x10` | S→F | 心跳 | Firmware 回复 `HeartbeatPong` |
| `HeartbeatPong` | `0x11` | F→S | 心跳回应 | - |
| `OnPhoneScreen` | `0x12` | A→S→F | 打开手机屏幕镜像 | Firmware 进入视频模式 |
| `OffPhoneScreen` | `0x13` | A→S→F | 关闭镜像 | - |
| `Dance` | `0x14` | A→S→F | 舞蹈 JSON | Firmware `onWsDanceData` → `DanceModifier` |
| `GetAvatarPosture` | `0x15` | A↔F | 姿态查询 | Server 转发 |
| `DeviceOffline` | `0x16` | S→A | 设备离线通知 | App `deviceIsOnline = false` |
| `DeviceOnline` | `0x17` | S→A | 设备上线通知 | App `deviceIsOnline = true` |
| `OnAudio` | `0x18` | A→S→F | 打开音频订阅 | Firmware 开始上传 Opus |
| `OffAudio` | `0x19` | A→S→F | 关闭音频订阅 | - |
| `AimedTakePhoto` | `0x1A` | A→S→F | 拍照请求 | Server 转发给 Firmware ⚠️ Firmware 端 `DataType` 枚举暂未定义 0x1A，需同步补充 |
| `inCall` | `0x0F` | S→A | 对方正在通话中 | Server 内部使用，通知 App RequestCall 失败 |

> 方向说明：`A`=App、`S`=Server、`F`=Firmware。
>
> **命名差异注意**：同一消息类型在不同端常量名可能不同，但数值一致。例如：
> - Firmware `StartCameraStream` (0x05) = Server/App `OnCamera`
> - Firmware `StopCameraStream` (0x06) = Server/App `OffCamera`
> - Firmware `VideoModeOn` (0x12) = Server/App `OnPhoneScreen`
> - Firmware `DanceSequence` (0x14) = Server/App `Dance`
> - Firmware `DeclineCall`/`AcceptCall`/`EndCall` = Server/App `RefuseCall`/`AgreeCall`/`HangupCall`
> - Firmware `HeartbeatPing`/`HeartbeatPong` = Server `ping`/`pong`

### 认证

WebSocket 握手时，`Authorization` header 携带 RSA 加密后的 `mac|random|timestamp`（Server 端解密校验 MAC 与时钟）。

- 实现：
  - App：`app/lib/network/web_socket_util.dart:39`
  - Firmware：`firmware/main/hal/hal_ws_avatar.cpp:100`
  - Server：`server/internal/web_socket/web_socket.go:78`

---

## 3. BLE 协议（App ↔ Firmware）

### GATT Service / Characteristic

| UUID | 名称 | 用途 |
|---|---|---|
| `e2e5e5ff-1234-5678-1234-56789abcdef0` | 主服务 | 配网/绑定/控制 |
| `0000ffe1-...` | head | 头部/通用数据 |
| `e2e5e5e3-...` | wifiSet | WiFi 配置与状态通知 |
| `0000ffe3-...` | expression | 表情数据 |
| `0000ffe4-...` | write | 通用写 |
| `e2e5e5e1-...` | motion | 动作 JSON |
| `e2e5e5e2-...` | avatar | 表情 JSON |
| `e2e5e5e4-...` | rgb | RGB JSON |

详见 `app/lib/util/blue_util.dart:29-84` 与 `firmware/main/hal/utils/bleprph/`。

### 配网 JSON 命令

App 发送：`firmware/main/hal/hal_ble.cpp:435`

```json
{"cmd":"setWifi","data":{"ssid":"...","password":"..."}}
```

Firmware 通知状态：`firmware/main/hal/hal_ble.cpp:488`

```json
{"cmd":"notifyState","data":{"type":0,"state":"wifiConnecting"}}
```

type 含义：

- `0`：connecting
- `1`：connected
- `2`：failed
- `3`：disconnected
- `4`：handshake token

### 分片头

BLE notify 数据超过 MTU 时，Firmware 使用自定义分片头：`0xAA 0x55 0xC3 0x01` + 索引/总数/总长（10 字节），见 `firmware/main/hal/hal_ble.cpp:35-95`。

---

## 4. ESP-NOW 协议（Remote ↔ Firmware）

### 包格式

固定 8 字节，小端序：

```text
[0]     target_id   (uint8, 0 = broadcast)
[1-2]   yaw_angle   (int16, -1280 ~ 1280，单位 0.1°)
[3-4]   pitch_angle (int16, 0 ~ 900，单位 0.1°)
[5-6]   speed       (int16, 0 ~ 1000)
[7]     laser       (uint8, 0/1)
```

- Remote 发送：`remote/code/main/joystick/joystick_handle.c`
- Firmware 解析：`firmware/main/apps/app_espnow_ctrl/app_espnow_ctrl.cpp:158`
- 传输层：`firmware/main/hal/hal_espnow.cpp:112`

---

## 5. XiaoZhi AI 语音协议（Firmware ↔ XiaoZhi 云）

Firmware 通过 OTA/Settings 获取后端地址与 token，建立 WebSocket 或 MQTT+UDP 通道。

### WebSocket 握手

连接成功后设备发送：

```json
{
  "type": "hello",
  "version": 1,
  "features": {"mcp": true},
  "transport": "websocket",
  "audio_params": {
    "format": "opus",
    "sample_rate": 16000,
    "channels": 1,
    "frame_duration": 60
  }
}
```

服务器回复 `type:hello` 与 `audio_params`、`session_id`。

### 主要 JSON 消息

| 方向 | type | 说明 |
|---|---|---|
| F→C | `listen` | `state:start/stop/detect`、`mode:auto/manual/realtime` |
| F→C | `abort` | 中止当前 TTS，reason 如 `wake_word_detected` |
| F→C | `mcp` | JSON-RPC 2.0，设备端工具调用结果 |
| C→F | `stt` | 识别到的用户文本 |
| C→F | `llm` | LLM 情绪/文本，`emotion` 字段用于表情 |
| C→F | `tts` | `state:start/sentence_start/stop` |
| C→F | `mcp` | JSON-RPC 2.0，服务器/LLM 下发的工具调用 |
| C→F | `system` | 系统命令，如 `reboot` |
| C→F | `alert` | 弹窗/提醒 |

> 完整协议参考：`firmware/xiaozhi-esp32/docs/websocket.md`。源码入口：`firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc`、`application.cc:521`。

### 二进制音频

- WebSocket 版本 1：直接 Opus payload。
- 版本 2：带时间戳的二进制头，用于服务器 AEC。
- 版本 3：简化二进制头。

定义见 `firmware/xiaozhi-esp32/main/protocols/protocol.h`。

### MQTT+UDP

- MQTT 负责信令，`publish_topic` 等配置来自 OTA。
- UDP 传输 AES-CTR 加密 Opus。
- 实现：`firmware/xiaozhi-esp32/main/protocols/mqtt_protocol.cc`。

---

## 6. HTTP API（Server 侧）

### 路由分组

| 前缀 | 认证 | 用途 |
|---|---|---|
| `/stackChan/v2/*` | JWT (`token` header) | App 主要 API |
| `/stackChan/*` | RSA MAC (`Authorization` header) | 设备/legacy API |
| `/admin/stackChan/*` | Admin Token | 管理后台 |
| `/file/*` | - | 静态文件 |
| `/stackChan/ws` | RSA MAC / JWT | WebSocket |

### App 常用端点

| 端点 | 说明 | 文件 |
|---|---|---|
| `POST /stackChan/v2/user/login` | 登录 | `server/internal/controller/user/user_v2_login.go` |
| `POST /stackChan/v2/user/registration` | 注册 | `server/internal/controller/user/user_v2_registration.go` |
| `GET /stackChan/v2/user` | 用户信息 | `server/internal/controller/user/user_v2_get_user_info.go` |
| `POST /stackChan/v2/device/bind` | 绑定设备 | `server/internal/controller/device/device_v2_bind_device.go` |
| `POST /stackChan/v2/device/unbind` | 解绑设备 | `server/internal/controller/device/device_v2_unbind_device.go` |
| `GET /stackChan/v2/devices` | 设备列表 | `server/internal/controller/device/device_v2_get_devices.go` |
| `GET /stackChan/xiaozhi/token` | 获取 XiaoZhi Token | `server/internal/controller/xiaozhi/xiaozhi_v1_get_xiao_zhi_token.go` |
| `GET /stackChan/xiaozhi/token/refresh` | 刷新 Token | `server/internal/controller/xiaozhi/xiaozhi_v1_refresh_token.go` |
| `GET /stackChan/xiaozhi/generateLicenseToken` | 生成 License Token | `server/internal/controller/xiaozhi/xiaozhi_v1_get_xiao_zhi_generate_license_token.go` |

完整 API 定义在 `server/api/**/*.go`。

---

## 7. 认证方式汇总

| 场景 | 机制 | 关键文件 |
|---|---|---|
| App ↔ Server REST | JWT，登录后写入 `token` header | `server/internal/middleware/middleware.go`、`app/lib/network/http.dart` |
| App ↔ Server WS | RSA-encrypted `mac|random|timestamp` in `Authorization` | `app/lib/util/rsa_util.dart`、`server/internal/web_socket/web_socket.go` |
| Firmware ↔ Server WS/HTTP | RSA-encrypted MAC token | `firmware/main/hal/utils/secret_logic/secret_logic.cpp`、`server/utility/rsa.go` |
| Firmware ↔ XiaoZhi 云 | Bearer Token（由 Server/App 换取或 OTA 下发） | `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc:101` |
| App ↔ XiaoZhi 云 | Bearer Token（从 Server 获取） | `app/lib/util/XiaoZhi_util.dart:50` |
| BLE 握手 | 设备用 RSA 加密时间戳，App 解密取 MAC | `app/lib/view/popup/select_blue_device.dart:174`、`firmware/main/hal/hal_ble.cpp:476` |
