> 该文档描述历史方案、历史快照或早期探索，不代表当前实现。
> 当前方向请参考 docs/README.md 和 docs/architecture.md。

# StackChan 仓库结构

> 只记录对二次开发有导航意义的目录、入口、构建文件和配置位置。不包含完整文件清单。

---

## 顶层布局

```text
StackChan/
├── firmware/       # 机器人固件（ESP-IDF）
├── server/         # 后端服务（GoFrame）
├── app/            # 移动客户端（Flutter）
├── remote/         # ESP-NOW 遥控器固件（ESP-IDF）
└── docs/
    └── architecture/   # 本知识库
```

---

## firmware/

| 项目 | 路径 | 说明 |
|---|---|---|
| 项目入口 | `firmware/CMakeLists.txt` | `project(stack-chan)`，版本 `1.5.1`，支持 `sdkconfig.defaults.local` 覆盖 |
| 组件清单 | `firmware/main/idf_component.yml` | LVGL 9.4、esp-sr 2.3、esp_codec_dev、xiaozhi-fonts 等 |
| 依赖拉取 | `firmware/fetch_repos.py` + `firmware/repos.json` | 拉取 mooncake、smooth_ui_toolkit、xiaozhi-esp32 等子模块 |
| 源码入口 | `firmware/main/main.cpp` | `app_main()`，选择 Mooncake 模式或 XiaoZhi 模式 |
| 组件构建 | `firmware/main/CMakeLists.txt` | 聚合 `main/` 源码与 `xiaozhi-esp32/main/` 源码 |
| 配置菜单 | `firmware/main/Kconfig.projbuild` | StackChan Server URL、OTA URL、语言、Board Type、Assets 等 |
| 默认配置 | `firmware/sdkconfig.defaults` | 目标 esp32s3、16MB Flash、PSRAM、GC0308 摄像头等 |
| 分区表 | `firmware/partitions.csv` | NVS、OTA_0/OTA_1、4MB assets 分区 |
| 补丁 | `firmware/patches/xiaozhi-esp32.patch` | 对 xiaozhi-esp32 子模块的定制补丁 |
| 主机测试 | `firmware/tests/` | CMake 主机测试 |

### 关键源码目录

```text
firmware/main/
├── apps/           # Mooncake 应用：Launcher、AI Agent、Avatar、Dance、Setup 等
├── assets/         # 图片、字体、音效资源
├── hal/            # 硬件抽象层 + 网络/蓝牙/ESP-NOW/EzData/OTA/账户
├── stackchan/      # 机器人核心：avatar、motion、servo、modifiers、animation
└── main.cpp        # 固件入口

firmware/xiaozhi-esp32/main/
├── application.cc  # XiaoZhi 主应用循环
├── audio/          # 音频服务、编解码、AFE/VAD/AEC
├── protocols/      # WebSocket / MQTT+UDP 协议
├── mcp_server.cc   # MCP 工具服务器
├── ota.cc          # OTA/激活
└── boards/         # 板级支持（含 StackChan 定制板）
```

---

## server/

| 项目 | 路径 | 说明 |
|---|---|---|
| 入口 | `server/main.go` | 调用 `cmd.Main.Run(...)` |
| 命令/路由 | `server/internal/cmd/cmd.go` | 注册 HTTP 路由、WebSocket、Cron |
| 配置 | `server/manifest/config/config.yaml` | 端口 12800、DB、JWT、RSA、XiaoZhi secret |
| 数据库脚本 | `server/check_list/create_mysql_database.sql` | MySQL 表结构 |
| WebSocket | `server/internal/web_socket/web_socket.go` | `/stackChan/ws` 处理与消息转发 |
| 客户端模型 | `server/internal/model/web_socket_model.go` | `StackChanClient`、`AppClient` |
| 认证 | `server/internal/middleware/middleware.go` | JWT / RSA MAC / Admin 认证 |
| RSA | `server/utility/rsa.go` | RSA 加解密 |
| XiaoZhi 代理 | `server/internal/xiaozhi/xiaozhi.go` | 与 `xiaozhi.me` 交互 token/agent/device |
| 服务层 | `server/internal/service/*.go` | user/file/device/dance/agent/apps/admin_user |
| 控制器 | `server/internal/controller/**/*.go` | GoFrame 控制器，按版本分 V1/V2 |
| API 定义 | `server/api/**/*.go` | 请求/响应结构体与路由元数据 |
| DAO/模型 | `server/internal/dao/*.go`、`server/internal/model/**/*.go` | GoFrame ORM、entity/do |
| 定时任务 | `server/internal/boot/cron.go` | WS 心跳、过期连接清理 |

---

## app/

| 项目 | 路径 | 说明 |
|---|---|---|
| 入口 | `app/lib/main.dart` | Flutter `main()`，初始化 GetX/AppState/AudioEngineManager |
| 根组件 | `app/lib/view/app.dart` | `CupertinoApp`，主页 `Home` |
| 全局状态 | `app/lib/app_state.dart` | 登录、设备、WebSocket、BLE 过滤、Toast |
| 依赖 | `app/pubspec.yaml` | Flutter 3.11+、GetX、Dio、flutter_blue_plus、opus_codec、three_js 等 |
| 主页 | `app/lib/view/home/home.dart` | 底部 Tab 壳 |
| 控制面板 | `app/lib/view/home/stack_chan.dart` | Avatar/Monitoring/Motion/Dance 入口 |
| Avatar | `app/lib/view/home/avatar.dart` | 摄像头流 + 本地表情 + 屏幕镜像 |
| 监控 | `app/lib/view/home/monitoring_camera.dart` | 远程摄像头 + 语音播放 |
| 舞蹈 | `app/lib/view/home/dance_list_page.dart` 等 | 舞蹈列表、录制、播放 |
| 聊天历史 | `app/lib/view/home/conversation_page.dart` | 从 XiaoZhi 云拉取 |
| 设置/Agent | `app/lib/view/home/settings.dart`、`view/popup/agent_configuration.dart`、`edit_agent.dart` | AI Agent 配置 |
| 网络 | `app/lib/network/http.dart`、`web_socket_util.dart`、`urls.dart` | HTTP、WebSocket、URL 配置 |
| BLE | `app/lib/util/blue_util.dart` | 扫描、连接、GATT 特征读写 |
| 云 AI | `app/lib/util/XiaoZhi_util.dart` | 直连 `XiaoZhi.me` REST API |
| 音频 | `app/lib/util/audio_engine_manager.dart`、`native_bridge.dart` | Opus 编解码、原生 PCM 播放 |
| RSA | `app/lib/util/rsa_util.dart` | RSA-OAEP-SHA256 |
| 协议枚举 | `app/lib/model/msg_type.dart` | WebSocket 二进制消息类型 |

---

## remote/

| 项目 | 路径 | 说明 |
|---|---|---|
| 入口 | `remote/code/main/StackChan-RemoteControl-ESPNow.cpp` | `app_main()` |
| 构建 | `remote/code/CMakeLists.txt` | ESP-IDF 项目 `StackChan-RemoteControl-ESPNow` |
| ESP-NOW | `remote/code/main/esp_now/esp_now_init.c` | WiFi/ESP-NOW 初始化 |
| 摇杆 | `remote/code/main/joystick/joystick_handle.c` | 摇杆读取与任务 |
| UI | `remote/code/main/ui/` | LVGL 8 屏幕 |
| 依赖 | `remote/code/main/idf_component.yml` | M5Unified、esp-now、i2c_bus、LVGL 8 |

---

## 构建与启动速查

| 端 | 构建命令 | 运行位置 |
|---|---|---|
| Firmware | `python3 ./fetch_repos.py && idf.py build && idf.py flash` | ESP32-S3（M5Stack CoreS3） |
| Server | `cd server && go run .` 或 `go build -o stackChan . && ./stackChan` | 服务器/容器，默认端口 12800 |
| App | `cd app && flutter run` / `flutter build apk` / `flutter build ios` | iOS/Android |
| Remote | `cd remote/code && idf.py build && idf.py flash` | ESP32 遥控器 |

---

## 配置注入点

| 配置项 | 位置 | 备注 |
|---|---|---|
| StackChan Server URL | `firmware/main/Kconfig.projbuild` → `CONFIG_STACKCHAN_SERVER_URL`；`app/lib/network/urls.dart` 中 `Urls.url` | 固件端建议用 `sdkconfig.defaults.local` 覆盖 |
| OTA URL / XiaoZhi 后端 | `firmware/main/Kconfig.projbuild` → `CONFIG_OTA_URL`；XiaoZhi 运行时从 NVS `websocket`/`mqtt` 读取 | 由 OTA 配置下发 |
| 数据库/JWT/RSA/XiaoZhi Key | `server/manifest/config/config.yaml` | 生产部署必须填充 |
| RSA 公钥/私钥 | `server/utility/rsa.go`、`app/lib/util/value_constant.dart` | App 端当前为占位符，生产需注入 |
