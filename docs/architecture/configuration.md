# StackChan 配置项梳理

> 梳理四端所有配置项：位置、作用、是否需要 Key/Secret、属于项目级还是用户级、生产部署注意事项。

---

## 1. 配置项分类说明

| 分类 | 含义 | 示例 |
|---|---|---|
| **项目级（Project）** | 构建或部署时由开发者/运维设定，普通用户不可见 | 后端地址、数据库连接、RSA 密钥、OTA URL、Board Type |
| **用户级（User）** | 运行时在 App 或设备上由终端用户配置 | WiFi SSID/密码、设备名、亮度、音量、语言、Agent 选择 |
| **密钥/Secret** | 必须保密，泄露会导致安全风险 | JWT Secret、RSA 私钥、XiaoZhi Secret Key、签名密钥 |
| **运行时持久化** | 保存在设备 NVS / App SharedPreferences / Server DB | 设备名、MAC、Token、用户登录态 |

---

## 2. Firmware 配置

### 2.1 构建时配置（Kconfig / sdkconfig）

#### 项目级配置

| 配置项 | 文件 | 默认值 | 说明 | 是否需修改 |
|---|---|---|---|---|
| `CONFIG_STACKCHAN_SERVER_URL` | `firmware/main/Kconfig.projbuild:5` | `http://47.113.125.164:12800` | StackChan Server 基础地址，决定 WS/HTTP  endpoint | **必须改**（自托管） |
| `CONFIG_OTA_URL` | `firmware/main/Kconfig.projbuild:18` | `https://api.tenclass.net/xiaozhi/ota/` | 默认 OTA/激活地址，决定固件升级和 AI 通道配置来源 | 按需改 |
| `CONFIG_BOARD_TYPE_*` | `firmware/main/Kconfig.projbuild:133` | `BOARD_TYPE_M5STACK_STACK_CHAN` | 目标板型 | 按硬件选择 |
| `CONFIG_LANGUAGE_*` | `firmware/main/Kconfig.projbuild:50` | `CONFIG_LANGUAGE_EN_US` | 设备显示语言 | 用户/项目均可 |
| `CONFIG_FLASH_*_ASSETS` | `firmware/main/Kconfig.projbuild:23` | `FLASH_DEFAULT_ASSETS` | 烧录资源包选择 | 项目级 |
| `CONFIG_CUSTOM_ASSETS_FILE` | `firmware/main/Kconfig.projbuild:44` | `assets.bin` | 自定义资源文件路径/URL | 按需 |
| `CONFIG_IDF_TARGET` | `firmware/sdkconfig.defaults:4` | `esp32s3` | 目标芯片 | 项目级 |
| `CONFIG_ESPTOOLPY_FLASHSIZE_16MB` | `firmware/sdkconfig.defaults:8` | `y` | Flash 大小 | 项目级 |
| `CONFIG_PARTITION_TABLE_CUSTOM` | `firmware/sdkconfig.defaults:9` | `y` | 使用自定义分区表 | 项目级 |
| `CONFIG_CAMERA_GC0308` | `firmware/sdkconfig.defaults:53` | `y` | 摄像头型号 | 按硬件 |
| `CONFIG_SR_WN_WN9_HISTACKCHAN_TTS3` | `firmware/sdkconfig.defaults:13` | `y` | 离线唤醒词模型 | 项目级 |
| `CONFIG_SEND_WAKE_WORD_DATA` | `firmware/sdkconfig.defaults:12` | `n` | 是否发送唤醒词音频到云端 | 项目级 |
| `CONFIG_BT_NIMBLE_ENABLED` | `firmware/sdkconfig.defaults:19` | `y` | BLE 使用 NimBLE | 项目级 |

> 覆盖方式：创建 `firmware/sdkconfig.defaults.local` 或在 `idf.py menuconfig` 中修改。

### 2.2 安全/认证逻辑（secret_logic）

| 配置项 | 文件 | 当前实现 | 说明 | 风险 |
|---|---|---|---|---|
| `get_server_url()` | `firmware/main/hal/utils/secret_logic/secret_logic.cpp:11` | 读取 `CONFIG_STACKCHAN_SERVER_URL`，否则 `localhost:3000` | Server 地址 | 无 |
| `generate_auth_token()` | `firmware/main/hal/utils/secret_logic/secret_logic.cpp:20` | **硬编码返回 `"hi-stack-chan"`** | Firmware ↔ Server WS 认证 | **高风险，必须替换** |
| `generate_handshake_token()` | `firmware/main/hal/utils/secret_logic/secret_logic.cpp:25` | **硬编码返回 `"hi-stack-chan"`** | BLE 握手认证 | **高风险，必须替换** |

> `secret_logic` 函数被声明为 `__attribute__((weak))`，可以在项目其他位置覆盖实现，或在生产前直接修改此文件。

### 2.3 运行时 NVS 配置（按 namespace）

NVS 配置通过 `firmware/xiaozhi-esp32/main/settings.cc` 读写。StackChan 相关 namespace 如下：

#### `wifi` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `ota_url` | `firmware/xiaozhi-esp32/main/ota.cc:48` | OTA 检查地址，优先于 `CONFIG_OTA_URL` | OTA 下发或项目预设 |

#### `websocket` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `url` | `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc:85` | XiaoZhi WebSocket 地址 | OTA 下发 |
| `token` | `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc:86` | XiaoZhi Bearer Token | OTA 下发 |
| `version` | `firmware/xiaozhi-esp32/main/protocols/websocket_protocol.cc:87` | 协议版本 | OTA 下发 |

#### `mqtt` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `endpoint` | `firmware/xiaozhi-esp32/main/protocols/mqtt_protocol.cc:66` | MQTT Broker 地址 | OTA 下发 |
| `client_id` | `firmware/xiaozhi-esp32/main/protocols/mqtt_protocol.cc:67` | MQTT Client ID | OTA 下发 |
| `username` | `firmware/xiaozhi-esp32/main/protocols/mqtt_protocol.cc:68` | MQTT 用户名 | OTA 下发 |
| `password` | `firmware/xiaozhi-esp32/main/protocols/mqtt_protocol.cc:69` | MQTT 密码 | OTA 下发 |
| `keepalive` | `firmware/xiaozhi-esp32/main/protocols/mqtt_protocol.cc:70` | 保活间隔 | OTA 下发 |
| `publish_topic` | `firmware/xiaozhi-esp32/main/protocols/mqtt_protocol.cc:71` | 发布 topic | OTA 下发 |

#### `assets` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `download_url` | `firmware/xiaozhi-esp32/main/application.cc:358` | 资源包下载 URL | MCP 工具设置或 OTA |

#### `audio` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `output_volume` | `firmware/xiaozhi-esp32/main/audio/audio_codec.cc:31` | 扬声器音量 | 用户通过 MCP/设置调节 |

#### `display` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `theme` | `firmware/xiaozhi-esp32/main/display/display.cc:55` | 主题 light/dark | 用户/MCP |
| `brightness` | `firmware/xiaozhi-esp32/main/boards/common/backlight.cc:35` | 屏幕亮度 | 用户/MCP |

#### `app_config` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `is_configed` | `firmware/main/hal/hal_ble.cpp:369` | 是否已完成 App 配网 | 配网成功时写入 |

#### `stackchan` namespace

| Key | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `device_name` | `firmware/main/hal/hal_ws_avatar.cpp:260` | 设备昵称 | App 通过 WS 修改 |
| `username` | `firmware/main/hal/hal_account.cpp:182` | 账户用户名 | Server 账户同步 |

#### 其他内部状态

| Key/Namespace | 读写位置 | 说明 | 来源 |
|---|---|---|---|
| `_warm_boot_nvs_key` | `firmware/main/hal/hal.cpp:334` | 热重启目标 App 索引 | 系统内部 |
| `tz` | `firmware/main/hal/hal_rtc.cpp:119` | 时区 | 用户设置 |
| 舵机零位 | `firmware/main/hal/hal_servo.cpp:52` | 各舵机零位校准 | 校准程序 |

### 2.4 OTA 下发配置

Firmware 联网后访问 `OTA_URL`，返回 JSON 中可能包含：

```json
{
  "firmware": {"version": "...", "url": "...", "force": 0},
  "websocket": {"url": "...", "token": "...", "version": ...},
  "mqtt": {...},
  "server_time": {"timestamp": ..., "timezone_offset": ...},
  "activation": {"code": "...", "message": "...", "challenge": "...", "timeout_ms": ...}
}
```

> 这些值**不由用户直接配置**，由 OTA 服务端决定，但决定 AI 能否正常对话，属于项目级关键配置。

---

## 3. Server 配置

### 3.1 `server/manifest/config/config.yaml`

| 配置项 | 路径 | 默认值 | 说明 | 是否必须修改 |
|---|---|---|---|---|
| `server.address` | `config.yaml:3` | `:12800` | HTTP/WS 监听地址端口 | 按需 |
| `server.openapiPath` | `config.yaml:4` | `/api.json` | OpenAPI 文档路径 | 通常不改 |
| `server.swaggerPath` | `config.yaml:5` | `/swagger` | Swagger UI 路径 | 通常不改 |
| `logger.path` | `config.yaml:9` | `./logs` | 日志目录 | 按需 |
| `logger.level` | `config.yaml:11` | `all` | 日志级别 | 项目级 |
| `logger.stdout` | `config.yaml:12` | `true` | 是否输出到控制台 | 项目级 |
| `database.default.link` | `config.yaml:19` | `空字符串` | 数据库连接串 | **必须改** |
| `jwt.secret` | `config.yaml:24` | `空字符串` | JWT 签名密钥 | **必须改，Secret** |
| `admin.users` | `config.yaml:27` | `[{username:"", password:""}]` | 管理后台账号密码 | **必须改，Secret** |
| `rsa.server.public` | `config.yaml:32` | `空` | Server RSA 公钥（PEM） | **必须改，Secret** |
| `rsa.server.private` | `config.yaml:33` | `空` | Server RSA 私钥（PEM） | **必须改，Secret** |
| `rsa.client.public` | `config.yaml:35` | `空` | Client/App RSA 公钥（PEM） | **必须改，Secret** |
| `rsa.client.private` | `config.yaml:36` | `空` | Client/App RSA 私钥（PEM） | **必须改，Secret** |
| `xiaozhi.secret_key` | `config.yaml:40` | `空` | 向 XiaoZhi.me 换 Token 的密钥 | **必须改，Secret** |
| `xiaozhi.generate_license_token` | `config.yaml:41` | `空` | XiaoZhi License Token | 设备激活用，按需 |

> 空密钥会导致服务启动后认证失败。参考 `server/utility/rsa.go:44`、`server/internal/xiaozhi/xiaozhi.go:344`。

### 3.2 硬编码配置

| 配置项 | 文件 | 值 | 说明 |
|---|---|---|---|
| HTTP 端口 | `server/internal/cmd/cmd.go:86` | `12800` | 代码中硬编码，覆盖 `config.yaml` 的 `server.address` 端口部分 |
| 文件上传根目录 | `server/internal/cmd/cmd.go:58` | `./file` | 上传文件存储路径 |
| 管理后台静态资源 | `server/internal/cmd/cmd.go:84` | `web/management` | 管理端入口 |
| XiaoZhi API Base URL | `server/internal/xiaozhi/xiaozhi.go:37` | `https://xiaozhi.me/` | 小智云地址 |
| XiaoZhi Token 缓存时间 | `server/internal/xiaozhi/xiaozhi.go:45` | `24h` | 内存缓存，多实例会失效 |

> **注意**：`cmd.go:86` 的 `s.SetPort(12800)` 会覆盖 `config.yaml` 中配置的端口。K8s 部署模板中服务端口为 `8000`，与代码不一致，需统一。

### 3.3 数据库连接串格式

GoFrame `database.default.link` 示例：

```yaml
database:
  default:
    link: "mysql:root:password@tcp(127.0.0.1:3306)/stackChan"
```

或 SQLite（开发）：

```yaml
database:
  default:
    link: "sqlite::@file(/path/to/stackChan.db)"
```

表结构参考：`server/check_list/create_mysql_database.sql`。

---

## 4. App 配置

### 4.1 后端地址配置

| 配置项 | 文件 | 默认值 | 说明 | 是否必须修改 |
|---|---|---|---|---|
| `Urls.url` | `app/lib/network/urls.dart:24` | `00.000.000.000:0000/` | StackChan Server 地址（IP:port/） | **必须改** |
| `Urls.getBaseUrl()` | `app/lib/network/urls.dart:30` | `http://$url/stackChan/` | HTTP API 基础 URL | 自动组合 |
| `Urls.getWebSocketUrl()` | `app/lib/network/urls.dart:45` | `ws://$url/stackChan/ws` | WebSocket URL | 自动组合 |
| `Urls.getFileUrl()` | `app/lib/network/urls.dart:38` | `http://$url/` | 文件上传/下载 URL | 自动组合 |

> 当前为占位符，首次运行前必须替换为实际 Server 地址。

### 4.2 密钥配置

| 配置项 | 文件 | 当前值 | 说明 | 风险 |
|---|---|---|---|---|
| `serverPublicKey` | `app/lib/util/value_constant.dart:212` | `空字符串` | Server RSA 公钥，用于加密发往 Server 的数据 | **必须填充，Secret** |
| `clientPrivateKey` | `app/lib/util/value_constant.dart:225` | `空字符串` | App RSA 私钥，用于解密 Server 下发数据 | **必须填充，Secret** |
| `stackChanBluePrivateKey` | `app/lib/util/value_constant.dart:311` | `空字符串` | BLE 握手 RSA 私钥 | **必须填充，Secret** |

> 这三把密钥必须与 Server `rsa.*` 配置和 Firmware `secret_logic` 逻辑一致。

### 4.3 XiaoZhi 云配置

| 配置项 | 文件 | 值 | 说明 |
|---|---|---|---|
| XiaoZhi Base URL | `app/lib/util/XiaoZhi_util.dart:38` | `https://XiaoZhi.me/` | 小智云 API 地址 |
| Token 存储 Key | `app/lib/util/XiaoZhi_util.dart:132` | `XiaoZhiToken` | SharedPreferences |
| Connect Timeout | `app/lib/util/XiaoZhi_util.dart:39` | `10s` | 连接超时 |
| Receive Timeout | `app/lib/util/XiaoZhi_util.dart:40` | `10s` | 接收超时 |

> XiaoZhi Token 从 StackChan Server `/stackChan/xiaozhi/token` 获取，不是直接配置。

### 4.4 运行时持久化（SharedPreferences）

| Key | 文件 | 说明 | 类型 |
|---|---|---|---|
| `deviceMac` | `app/lib/app_state.dart:43` | 绑定设备 MAC | String |
| `deviceId` | `app/lib/app_state.dart:45` | 设备唯一 ID | String |
| `deviceControlMode` | `app/lib/app_state.dart:47` | 控制模式 | int |
| `isLogin` | `app/lib/app_state.dart:49` | 登录状态 | bool |
| `token` | `app/lib/app_state.dart:133` | Server JWT | String |
| `XiaoZhiToken` | `app/lib/util/XiaoZhi_util.dart:132` | 小智云 Token | String |

### 4.5 构建配置

| 配置项 | 文件 | 值 | 说明 |
|---|---|---|---|
| App Version | `app/pubspec.yaml:4` | `1.1.0+6` | 应用版本 |
| Flutter SDK | `app/pubspec.yaml:7` | `^3.11.5` | Flutter 版本约束 |
| Android Package | `app/android/app/build.gradle.kts:55` | `com.m5stack.stackchan` | 包名 |
| Android minSdk | `app/android/app/build.gradle.kts:56` | `26` | 最低 Android 版本 |
| Android 签名 Keystore | `app/android/app/build.gradle.kts:41` | `release.jks` / `debug.jks` | 发布/调试签名 |
| Android 签名密码 | `app/android/app/build.gradle.kts:42` | `123456` | **硬编码占位密码，必须替换** |
| iOS Bundle ID | `app/ios/Runner.xcodeproj/project.pbxproj` | 需查看 | 未在本次扫描中确认 |

> Android 签名配置当前为明文占位符，发布前必须改为安全密钥管理方案（如环境变量或 CI secret）。

### 4.6 功能开关/常量

| 配置项 | 文件 | 说明 |
|---|---|---|
| `ValueConstant.languages` | `app/lib/util/value_constant.dart:153` | App 支持语言列表 |
| `ValueConstant.serviceUuids` | `app/lib/util/value_constant.dart:126` | BLE 扫描过滤字段名 |
| `ValueConstant.manufacturerData` 等 | `app/lib/util/value_constant.dart:120` | BLE 广播数据字段名 |

---

## 5. Remote 配置

Remote（ESP-NOW 遥控器）配置相对简单，主要是 ESP-IDF sdkconfig。

| 配置项 | 文件 | 说明 |
|---|---|---|
| 目标芯片 | `remote/code/sdkconfig`（由 idf.py set-target 生成） | ESP32（M5StickC-Plus） |
| `CONFIG_BT_ENABLED` | `remote/code/sdkconfig:463` | 未启用蓝牙（`# CONFIG_BT_ENABLED is not set`） |
| `CONFIG_SOC_WIFI_SUPPORTED` | `remote/code/sdkconfig:18` | 支持 WiFi（ESP-NOW 需要） |
| ESP-NOW 信道/配对 | `remote/code/main/esp_now/esp_now_init.c` | 代码中配置 |
| 摇杆/IMU 参数 | `remote/code/main/joystick/joystick_handle.c` | 代码中配置 |

> Remote 没有用户可配置的密钥或后端地址，所有通信参数在固件代码中固定。

---

## 6. 密钥/Secret 汇总

| 密钥 | 位置 | 用途 | 当前状态 | 安全级别 |
|---|---|---|---|---|
| JWT Secret | `server/manifest/config/config.yaml:jwt.secret` | 签发/校验 App/Admin Token | 空，必须填充 | 🔴 高 |
| Server RSA 私钥 | `server/manifest/config/config.yaml:rsa.server.private` | 解密 Firmware/App 上行数据 | 空，必须填充 | 🔴 高 |
| Server RSA 公钥 | `server/manifest/config/config.yaml:rsa.server.public` | 签名/加密下发数据 | 空，必须填充 | 🔴 高 |
| Client RSA 私钥 | `server/manifest/config/config.yaml:rsa.client.private` | 解密 Server→App 数据 | 空，必须填充 | 🔴 高 |
| Client RSA 公钥 | `server/manifest/config/config.yaml:rsa.client.public` | App 加密/Server 验证 | 空，必须填充 | 🔴 高 |
| XiaoZhi Secret Key | `server/manifest/config/config.yaml:xiaozhi.secret_key` | 向 XiaoZhi.me 换取 Token | 空，必须填充 | 🔴 高 |
| XiaoZhi License Token | `server/manifest/config/config.yaml:xiaozhi.generate_license_token` | 设备激活授权 | 空，按需填充 | 🟡 中 |
| App Server 公钥 | `app/lib/util/value_constant.dart:serverPublicKey` | 加密发往 Server 的数据 | 空，必须填充 | 🔴 高 |
| App Client 私钥 | `app/lib/util/value_constant.dart:clientPrivateKey` | 解密 Server 下发数据 | 空，必须填充 | 🔴 高 |
| App BLE 私钥 | `app/lib/util/value_constant.dart:stackChanBluePrivateKey` | BLE 握手解密 | 空，必须填充 | 🔴 高 |
| Firmware WS Auth Token | `firmware/main/hal/utils/secret_logic/secret_logic.cpp:generate_auth_token` | WS 握手认证 | 硬编码 `hi-stack-chan` | 🔴 高 |
| Firmware BLE Handshake Token | `firmware/main/hal/utils/secret_logic/secret_logic.cpp:generate_handshake_token` | BLE 握手认证 | 硬编码 `hi-stack-chan` | 🔴 高 |
| Android 签名密钥密码 | `app/android/app/build.gradle.kts:42` | APK 签名 | 硬编码 `123456` | 🔴 高 |
| 数据库密码 | `server/manifest/config/config.yaml:database.default.link` | MySQL/SQLite 连接 | 空，必须填充 | 🔴 高 |

### 6.1 密钥一致性要求

RSA 密钥对必须在三端保持一致：

```text
Server rsa.server.public  ↔  App serverPublicKey
Server rsa.server.private ↔  Firmware secret_logic (验证/解密)
Server rsa.client.public  ↔  Firmware secret_logic / App 验证
Server rsa.client.private ↔  App clientPrivateKey
```

> 当前 Firmware `secret_logic` 使用硬编码占位符，未真正使用 RSA。生产部署时必须实现 RSA 加解密逻辑或替换此文件。

---

## 7. 项目级 vs 用户级配置对照

### 7.1 项目级配置（开发者/运维配置）

| 端 | 配置项 | 位置 |
|---|---|---|
| Firmware | Server URL、OTA URL、Board Type、唤醒词模型、Flash 大小 | `Kconfig.projbuild`、`sdkconfig.defaults` |
| Firmware | WS/BLE 认证逻辑 | `secret_logic.cpp` |
| Server | 监听端口、数据库、JWT Secret、RSA 密钥、XiaoZhi Secret | `config.yaml`、`cmd.go` |
| Server | XiaoZhi API 地址 | `server/internal/xiaozhi/xiaozhi.go` |
| App | Server URL、XiaoZhi URL、RSA 公钥/私钥、包名/签名 | `urls.dart`、`value_constant.dart`、`build.gradle.kts` |
| Remote | ESP-NOW 参数、摇杆映射 | 代码中固定 |

### 7.2 用户级配置（终端用户配置）

| 端 | 配置项 | 位置/方式 |
|---|---|---|
| Firmware | WiFi SSID/Password | App BLE 配网下发 |
| Firmware | 设备名 | App 通过 WS 修改 |
| Firmware | 亮度、音量、主题、时区 | Setup App / MCP |
| Firmware | 绑定 Agent（LLM/TTS/Character） | App XiaoZhi 配置 |
| App | 登录账号密码 | 用户输入 |
| App | 绑定设备 MAC | BLE 扫描选择 |
| Server | 管理员账号密码 | `config.yaml`（当前无管理界面修改入口） |

---

## 8. 生产部署 Checklist

### 8.1 必须替换/填充的项

- [ ] `server/manifest/config/config.yaml` 中所有空字符串密钥（JWT、RSA、XiaoZhi Secret、DB link）
- [ ] `app/lib/network/urls.dart` 中 `Urls.url`
- [ ] `app/lib/util/value_constant.dart` 中三把 RSA 密钥
- [ ] `firmware/main/hal/utils/secret_logic/secret_logic.cpp` 中 `generate_auth_token` / `generate_handshake_token` 实现
- [ ] `firmware/main/Kconfig.projbuild` 中 `CONFIG_STACKCHAN_SERVER_URL`（通过 `sdkconfig.defaults.local` 覆盖）
- [ ] `app/android/app/build.gradle.kts` 中签名密码和 keystore

### 8.2 建议统一检查的项

- [ ] Server 监听端口：`cmd.go:12800` 与 `config.yaml:12800` 与 K8s service.yaml 是否一致
- [ ] RSA 密钥三端是否匹配
- [ ] OTA URL 是否可访问，返回 JSON 是否包含 websocket/mqtt/firmware
- [ ] XiaoZhi Secret Key 是否有效，能否换到 Token
- [ ] 数据库表是否已按 `create_mysql_database.sql` 创建

### 8.3 安全建议

1. **不要把 RSA 私钥提交到 Git**：当前 `value_constant.dart` 虽然为空，但未来填充后容易误提交。
2. **不要用硬编码签名密码**：Android `build.gradle.kts` 中的 `123456` 必须改为从环境变量或 CI Secret 读取。
3. **JWT Secret 长度 ≥ 16 位**：代码中有校验（`server/internal/service/user.go:125`）。
4. **Firmware 认证必须实现 RSA 或至少强随机 token**：当前 `hi-stack-chan` 任何人都能连接。
5. **Server XiaoZhi Token 缓存问题**：多实例部署时内存中的 `token` 不会共享，建议改为 Redis 等共享缓存。
6. **数据库连接串包含密码**：不要把生产 `config.yaml` 提交到仓库。

---

## 9. 配置影响范围速查

| 修改这个配置 | 影响 |
|---|---|
| `CONFIG_STACKCHAN_SERVER_URL` / `Urls.url` | App 和 Firmware 能否连上 Server |
| `CONFIG_OTA_URL` / `ota_url` | Firmware 能否升级、能否获取 XiaoZhi 通道地址 |
| `rsa.*` / `value_constant.dart` RSA | WS/BLE 认证能否成功 |
| `jwt.secret` | App 登录 Token 能否签发/校验 |
| `xiaozhi.secret_key` | Server 能否从 XiaoZhi.me 拿到 Token |
| `database.default.link` | Server 所有数据持久化 |
| `CONFIG_BOARD_TYPE_*` | 硬件驱动、引脚、外设是否正确 |
| `CONFIG_LANGUAGE_*` | 系统 UI 语言 |
