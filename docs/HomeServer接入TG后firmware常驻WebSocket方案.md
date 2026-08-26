# HomeServer 接入 TG 后 firmware 常驻 WebSocket 方案

## 0. 第一版实现状态

当前第一版按本文方案实现，目标是先把 Telegram 到 firmware 的全模式远程可达链路跑通，而不是一次性开放相机、语音、运动等高冲突硬件能力。

第一版已实现范围：

```text
HomeServer:
  /robot/ws WebSocket 入口
  STACKCHAN_SHARED_SECRET 鉴权
  多设备协议结构，运行时单设备默认路由
  Telegram /status /notify /led 下发到唯一在线设备
  设备离线时立即失败，不做离线队列

firmware:
  HAL 级 HomeRemote WebSocket client
  CONFIG_HOME_SERVER_URL 派生 ws(s)://.../robot/ws
  CONFIG_HOME_SERVER_SHARED_SECRET 鉴权 header
  常驻 FreeRTOS task，后台非阻塞启动 Board::StartNetwork()，网络可用后连接，断线自动重连
  hello / command / command_result
  status / notify / set_led_color
  最近 command_id 内存级去重，不写 NVS，不跨重启
```

第一版刻意不实现：

```text
不把 Telegram token 写入 firmware
不复用 Avatar WebSocket
不占用 Board::SetNetworkEventCallback()
不做 mDNS / 服务发现 / App 下发 HomeServer 地址
不做离线命令队列
不在本机状态栏展示 HomeRemote 连接状态
不开放 photo / say / motion / open_app
```

第一版命令语义：

```text
status:
  查询当前 firmware 可返回的基础状态。

notify:
  轻量临时提示。Mooncake UI 可用时弹 toast；AI Agent 等无法安全使用 Mooncake toast 的场景只确认收到并记录日志。
  它不切页面，不接管当前 App，不复用 Xiaozhi SetStatus()/SetChatMessage()。

set_led_color:
  临时灯效，不写持久配置，允许 Launcher、Avatar、Xiaozhi 或 Setup 后续状态刷新覆盖。
```

完整配置项清单见：

```text
docs/architecture/configuration.md
```

## 1. 背景和结论

目标是在 HomeServer 接入 Telegram 后，让 Telegram 可以远程控制 StackChan，并且控制能力不只在 AI Agent 模式下可用，也要覆盖 Launcher、Avatar、Setup 等页面。

在这个前提下，firmware 侧不适合继续采用“只在 Xiaozhi 启动后运行后台任务”的设计，也不适合复用现有 Avatar WebSocket 的生命周期。推荐方案是：

```text
HomeServer 负责 Telegram、鉴权、命令解析、命令状态
firmware 新增 HAL 级常驻 HomeRemote WebSocket client
HomeRemote WebSocket 连接 HomeServer
firmware 只接收统一 robot command 并执行本地能力
```

核心结论：

```text
Telegram 不进 firmware
Telegram token 不进 firmware
HomeServer WebSocket 独立于现有 Avatar WebSocket
HomeRemote 服务不依赖 Mooncake App 生命周期
HomeRemote 服务应在 HAL 层常驻，并在网络可用后自动连接/重连
```

当前 HomeServer 部署在内网固定地址：

```text
HomeServer HTTP: http://192.168.50.50:8787
HomeRemote WS:  ws://192.168.50.50:8787/robot/ws
```

短期内不需要做 mDNS、局域网扫描、服务发现或 App 下发地址。firmware 仍建议通过 `CONFIG_HOME_SERVER_URL` 配置这个固定地址，而不是把 `192.168.50.50` 写死在 `.cpp` 中。

## 2. 已确认的现有代码基础

### 2.1 firmware 已有独立 HomeServer 配置

当前 firmware 已经有独立的 HomeServer URL 配置：

```text
firmware/main/Kconfig.projbuild
CONFIG_HOME_SERVER_URL
建议值：http://192.168.50.50:8787
```

这和旧的 `CONFIG_STACKCHAN_SERVER_URL` 是分开的。旧 URL 仍用于账号、App Center、Avatar WebSocket 等 StackChan 原有后端能力；HomeServer 扩展能力应继续使用 `CONFIG_HOME_SERVER_URL`，避免污染旧链路。

推荐 WebSocket URL 从它派生：

```text
http://192.168.50.50:8787 -> ws://192.168.50.50:8787/robot/ws
https://example.com       -> wss://example.com/robot/ws
```

因为 HomeServer 是内网固定地址，第一版优先使用 `ws://192.168.50.50:8787/robot/ws`，不把 TLS/wss 作为第一阶段目标。

### 2.2 firmware 已有 MCP 到 HomeServer 的最小链路

当前 `firmware/main/hal/hal_mcp.cpp` 已经注册：

```text
self.home.get_status
```

它会读取 `CONFIG_HOME_SERVER_URL` 并请求：

```text
GET /robot/status
```

HomeServer 侧 `HomeServer/src/http/server.ts` 也已经有：

```text
GET /robot/status
```

这说明“firmware 访问 HomeServer”的基础 HTTP 链路已经存在。后续 Telegram 远控不需要推翻这条设计，只需要新增 HomeServer 到 firmware 的实时命令通道。

### 2.3 firmware 已有 WebSocket client 能力

当前 `firmware/main/hal/hal_ws_avatar.cpp` 已经使用：

```cpp
Board::GetInstance().GetNetwork()->CreateWebSocket(1)
```

并实现了：

```text
connect
OnConnected
OnDisconnected
OnData
消息队列
5 秒重连
send mutex
binary packet send
```

所以新增一个 HomeServer WebSocket client 在技术上是可行的。需要注意的是，只能借鉴它的连接/队列/重连模式，不建议复用它的业务协议和生命周期。

## 3. 为什么不能复用现有 Avatar WebSocket

现有 Avatar WebSocket 是 Avatar App 的一部分。

当前链路是：

```text
AppAvatar::onOpen()
-> GetHAL().startWebSocketAvatarService(...)
-> startNetwork(...)
-> create WebsocketAvatarWorker as Mooncake BasicAbility
```

这个设计有几个特点：

```text
只在 Avatar App 打开时启动
worker 生命周期属于 Mooncake extensionManager
协议包含 Avatar、Motion、Video、Call、Dance 等二进制类型
URL 是 /stackChan/ws?deviceType=StackChan
```

这和 TG/HomeServer 远控需求不匹配。

新需求要求：

```text
Launcher 页面可控
Avatar 页面可控
Setup 页面可控
AI Agent 模式可控
```

而 AI Agent 会触发：

```text
AppAiAgent::onOpen()
-> GetHAL().requestXiaozhiStart()
-> main loop break
-> GetMooncake().uninstallAllApps()
-> DestroyMooncake()
-> GetHAL().startXiaozhi()
-> Application::Run()
```

所以如果 TG 远控依赖 Mooncake App 或 Mooncake BasicAbility，进入 AI Agent 后生命周期就不稳。正确边界应该是 HAL 级后台服务。

## 4. 推荐总体架构

```text
Telegram
    |
    v
HomeServer
    - Telegram Bot token
    - 用户 allowlist
    - 命令解析
    - 命令队列
    - 任务状态
    - 图片/视频保存
    - 家电平台接入
    |
    v
WebSocket: /robot/ws
    |
    v
firmware HomeRemoteWsClient
    - 设备注册
    - 心跳
    - 命令接收
    - 本地能力分发
    - 结果上报
```

firmware 不理解 Telegram 指令本身。比如 `/say 我快到了` 应在 HomeServer 解析成统一命令：

```json
{
  "type": "command",
  "command_id": "cmd_001",
  "name": "notify",
  "payload": {
    "text": "我快到了"
  },
  "timeout_ms": 5000
}
```

firmware 执行完成后返回：

```json
{
  "type": "command_result",
  "command_id": "cmd_001",
  "ok": true,
  "message": "displayed"
}
```

## 5. firmware 侧模块设计

建议新增独立模块：

```text
firmware/main/hal/hal_home_remote.cpp
firmware/main/hal/hal_home_remote.h
```

HAL 暴露入口：

```cpp
void startHomeRemoteService();
```

推荐启动位置：

```text
Hal::init()
-> xiaozhi_board_init()
-> xiaozhi_mcp_init()
-> head_touch_init()
-> io_expander_init()
-> rtc_init()
-> imu_init()
-> servo_init()
-> lvgl_init()
-> startHomeRemoteService()
```

原因：

```text
要覆盖 Launcher/Avatar/Setup/AI Agent，所以不能等 startXiaozhi()
要使用 UI/通知能力，所以最好等 lvgl_init() 后再启动
不能阻塞开机，所以服务内部必须异步等待网络
```

启动时机和生命周期决策：

```text
startHomeRemoteService() 放在 Hal::init() 末尾、lvgl_init() 之后
startHomeRemoteService() 只创建常驻 FreeRTOS task，然后立即返回
HomeRemote task 不属于 Mooncake App
HomeRemote task 不属于 Mooncake BasicAbility
HomeRemote task 不持有 LoadingPage、App view、worker 等页面对象指针
HomeRemote task 进入 AI Agent / Application::Run() 后仍继续运行
```

不采用的方案：

```text
不放在 AppAvatar::onOpen()
不放在 AppLauncher::onLauncherRunning()
不放在 AppSetup::onRunning()
不放在 Hal::startXiaozhi()
不通过 Mooncake extensionManager()->createAbility() 创建
```

原因是这些入口都绑定某个模式或 Mooncake 生命周期，无法同时满足 Launcher、Avatar、Setup、AI Agent 全模式可控。

### 5.1 HomeRemoteWsClient 职责

```text
读取 CONFIG_HOME_SERVER_URL
生成 /robot/ws URL
等待网络可用
连接 HomeServer
发送 hello/register
接收 command
将 command 放入本地队列
执行 command
发送 command_result
断线后退避重连
```

固定内网地址下，URL 处理可以保持很小：

```text
CONFIG_HOME_SERVER_URL 必须是 http://host:port 或 https://host:port
http:// 前缀替换为 ws://
https:// 前缀替换为 wss://
末尾如果有 /，先去掉
再拼接 /robot/ws
```

不建议第一版支持多个 HomeServer、备用地址、服务发现或动态切换。它们会放大 firmware 的状态复杂度，但短期收益不高。

### 5.2 NetworkEventCallback 冲突和取舍

先看源码结论：`Board::SetNetworkEventCallback()` 这条抽象目前是单监听槽，不是多播事件。

代码依据：

```text
Board 只定义 SetNetworkEventCallback(callback)，没有 add/remove listener
WifiBoard 内部只有一个 network_event_callback_ 成员
WifiBoard::SetNetworkEventCallback() 直接赋值覆盖旧 callback
WifiBoard::OnNetworkEvent() 触发时只调用这个单 callback
Ml307Board / RndisBoard 也是同类单 callback 形态
```

当前已有调用者：

```text
Hal::startNetwork()
  设置 callback，用于页面 loading 日志和等待联网
  联网后又 SetNetworkEventCallback(nullptr)

Xiaozhi Application::Initialize()
  设置 callback，用于 Xiaozhi UI 网络提示和内部网络状态事件
```

因此 HomeRemoteWsClient 如果也直接长期调用 `Board::SetNetworkEventCallback()`，会出现双向覆盖：

```text
HomeRemote 先设置：后续 Avatar/startNetwork 或 Xiaozhi Application 会覆盖它
HomeRemote 后设置：可能覆盖 Xiaozhi 的网络 UI/状态处理
```

这个冲突是真实存在的。结论不是“只能轮询”，而是：

```text
HomeRemote 第一版不要占用 Board::SetNetworkEventCallback()
```

可选方案有三种。

方案 A：Wi-Fi 状态检查 + WebSocket 自重连。

```text
HomeRemote 不注册 Board network callback
后台 task 周期检查 Wi-Fi 是否已连接
已联网且 WS 未连接时尝试 Connect
WS 已连接时靠 heartbeat 判断是否失活
断开后进入 backoff 重连
```

优点：

```text
最少侵入
不影响 Xiaozhi
不影响 Avatar/startNetwork
不需要改上游 Board 抽象
和固定内网 HomeServer 地址匹配
```

缺点：

```text
不是事件即时响应
网络变化会有 1 秒左右检测延迟
```

方案 B：直接注册 ESP-IDF Wi-Fi/IP event handler。

```text
使用 esp_event_handler_instance_register()
监听 WIFI_EVENT / IP_EVENT_STA_GOT_IP
收到网络事件后唤醒 HomeRemote 连接状态机
```

优点：

```text
不占用 Board::SetNetworkEventCallback()
事件响应更及时
ESP-IDF 原生事件支持多个 handler
```

缺点：

```text
偏 Wi-Fi-only
绕开 Board 统一网络抽象
如果以后换 RNDIS/4G/其他网络板，需要另做适配
```

方案 C：改造 Board 网络事件为多播。

```text
新增 addNetworkEventListener/removeNetworkEventListener
Board 内部维护 listener 列表
Hal/startNetwork/Xiaozhi/HomeRemote 都注册 listener
```

优点：

```text
架构最完整
所有网络事件归一处管理
```

缺点：

```text
侵入上游 xiaozhi-esp32 Board 抽象
需要同步改 Xiaozhi Application 的调用方式
容易扩大改动面
当前只为 HomeRemote WS 不值得第一版做
```

当前优先级：

```text
第一优先：方案 A，Wi-Fi 状态检查 + WebSocket 自重连
第二选择：方案 B，ESP-IDF 原生 Wi-Fi/IP event handler
暂不采用：方案 C，Board 网络事件多播改造
```

第一版具体状态机：

```text
HomeRemoteWsClient 内部维护 connection_state：
  disabled
  waiting_network
  connecting
  connected
  backoff

每 1 秒检查一次 Wi-Fi 状态
未联网时不调用 Connect
联网但未连接时按 backoff 尝试 Connect
已连接时只处理消息和 heartbeat
heartbeat 超时后主动断开并进入 backoff
```

这样即使 Xiaozhi、Avatar 或其他页面重设了 `SetNetworkEventCallback()`，HomeRemote 也不会丢失自己的连接恢复能力。

### 5.3 不要调用阻塞式 startNetwork()

现有 `Hal::startNetwork()` 会等待网络连接成功才返回。它适合 Avatar/EzData 这种由页面打开触发、需要显示 loading 的流程，但不适合在 `Hal::init()` 里启动常驻服务。

HomeRemoteWsClient 应采用：

```text
启动 task
task 内部判断 WiFi 是否已连接
未连接就 sleep/backoff
已连接再 CreateWebSocket + Connect
```

这样首次配网、无网络、HomeServer 未启动都不会卡住设备启动。

具体解决办法：

```text
startHomeRemoteService() 只负责创建 task，然后立即返回
task 内部自己等待网络和 HomeServer
task 不更新 loading page，不持有 App UI 指针
task 不因为连接失败重启系统
```

## 6. WebSocket 协议建议

### 6.1 firmware -> HomeServer: hello

连接成功后 firmware 发送：

```json
{
  "type": "hello",
  "device_id": "AABBCCDDEEFF",
  "client_id": "uuid",
  "firmware_version": "x.y.z",
  "capabilities": [
    "status",
    "notify",
    "set_led_color",
    "photo"
  ]
}
```

HomeServer 返回：

```json
{
  "type": "hello_ack",
  "server_time": 1780000000000
}
```

### 6.2 HomeServer -> firmware: command

```json
{
  "type": "command",
  "command_id": "cmd_001",
  "name": "set_led_color",
  "payload": {
    "red": 0,
    "green": 80,
    "blue": 30
  },
  "timeout_ms": 3000
}
```

### 6.3 firmware -> HomeServer: command_result

```json
{
  "type": "command_result",
  "command_id": "cmd_001",
  "ok": true,
  "message": "ok"
}
```

失败示例：

```json
{
  "type": "command_result",
  "command_id": "cmd_002",
  "ok": false,
  "error": "busy",
  "message": "camera is already streaming"
}
```

### 6.4 长任务

长任务不要在 WebSocket handler 里同步等完。

例如录像、视觉问答、较慢图片上传：

```json
{
  "type": "command_result",
  "command_id": "cmd_003",
  "ok": true,
  "accepted": true,
  "task_id": "task_001",
  "message": "accepted"
}
```

任务完成后再发：

```json
{
  "type": "task_result",
  "task_id": "task_001",
  "command_id": "cmd_003",
  "ok": true,
  "message": "sent to telegram"
}
```

`command_id` 由 HomeServer 生成，表示一条远程命令的唯一性。唯一范围建议为 HomeServer 全局唯一，至少对同一 `device_id` 全局唯一。firmware 只消费和缓存它，不在本地生成它。

`task_id` 只用于长任务，表示 firmware 内部异步执行任务。短命令例如 `status`、`notify`、`set_led_color` 不需要 `task_id`。

## 7. 命令能力分层

建议不要一开始开放所有能力。

第一批：

```text
status
notify/display
set_led_color
photo
```

后续批次：

```text
set_head_angles
say
vision_explain
record_video
open_app
```

原因：

```text
status/notify/led 风险低
motion 会影响 Setup 舵机校准和 Avatar 动作
photo 会和 Avatar 视频流、视觉上传抢相机
say 会和 Xiaozhi 语音链路抢音频输出
open_app 会改变当前用户正在操作的页面
```

## 8. 跨模式冲突和处理策略

### 8.1 Launcher

Launcher 每帧会更新 `GetStackChan().update()`，并有屏保逻辑。远程命令可以执行，但涉及 UI 的命令需要加 LVGL 锁。

建议：

```text
status: allow
notify: allow
led: allow
motion: 第一版不开放
photo: allow, 如果相机空闲；异步执行
say: 待定
open_app: 后期再做
```

解决办法：

```text
新增 RemoteModeState，至少能识别 current_mode=launcher/avatar/setup/xiaozhi/unknown
Launcher 下低风险命令直接执行
notify/display 只做临时叠加，不切 App、不销毁页面、不改变当前模式
```

### 8.2 Avatar

Avatar 已有自己的 WebSocket 远控和相机流。

潜在冲突：

```text
Avatar WS 正在 StartCameraStream 时，TG photo 可能抢相机
Avatar WS 正在控制 motion 时，未来 TG motion 可能抢舵机
Avatar 的 onWsTextMessage 已经会添加 speech/speaking modifier
```

建议：

```text
photo: 如果 Avatar 正在 streaming，返回 busy；第一版不复用最近一帧
motion: 第一版不开放；未来如开放，使用统一 MotionCommandQueue 或 motion mutex
notify: 不走 Avatar WS 信号，直接走 HomeRemote 自己的通知能力
```

解决办法：

```text
给 Avatar WS 的 streaming 状态暴露一个只读查询或统一登记到 CameraBusyState
HomeRemote photo 执行前先检查 CameraBusyState
如果 busy，返回 error=busy，不阻塞等待
第一版不处理 HomeRemote motion
未来如果开放 motion，命令进入 MotionCommandQueue 或 motion mutex，由一个地方串行写舵机
Avatar WS 原有 motion handler 可后续迁移到同一个 motion 仲裁入口
```

### 8.3 Setup

Setup 有 Wi-Fi、亮度、音量、时区、AI Agent、舵机、麦克风、RGB、账号、OTA 等配置和测试流程。

潜在冲突：

```text
Wi-Fi 配置时网络可能断开
舵机校准时未来 TG motion 会干扰校准
麦克风测试时 TG say/audio 会抢音频
RGB 测试时 TG led 会覆盖测试状态
OTA 或账号重置期间不应执行远程控制
```

建议做模式/忙碌策略：

```text
Setup 菜单页：
  status: allow
  notify/display: allow，只做 toast/临时提示
  led: allow，临时效果
  photo: allow，但必须 CameraBusyState=idle，并且异步执行
  motion: 第一版不开放或返回 busy
  say/audio: 第一版返回 busy

Setup worker 运行中：
  status: allow
  notify/display: allow，只做 toast，不改当前页面结构
  led: busy
  photo: busy
  motion: busy
  say/audio: busy
  open_app / factory reset / unbind / ota: 拒绝远程触发，至少第一版不支持
```

解决办法：

```text
AppSetup 在创建 worker 时登记 setup_screen / setup_busy_scope
  menu
  wifi
  brightness
  volume
  timezone
  ai_agent
  servo
  mic
  rgb
  account
  ota
  about

HomeRemote 执行命令前调用 canRunRemoteCommand(command, mode, busy_scope)
冲突时返回：
  ok=false
  error=busy
  message=setup servo calibration is running
```

第一版实现优先用轻量状态，不急着改 `WorkerBase` 虚接口：

```text
_worker == nullptr 或 setup_screen=menu：
  使用 Setup 菜单页策略

_worker != nullptr 或 setup_screen != menu：
  使用 Setup worker 运行中策略
```

后续如果要更细，可以再让各个 Worker 声明资源占用，例如 mic/audio/servo/rgb/network/account/ota。

### 8.4 AI Agent

AI Agent 进入 Xiaozhi 后，Mooncake Apps 会被卸载，随后 `Application::Run()` 常驻。

潜在冲突：

```text
Xiaozhi 自己会设置 NetworkEventCallback
Xiaozhi 使用 WebSocket/音频链路
Xiaozhi Display 会更新表情、文字、RGB 和 SpeakingModifier
TG say 可能和 Xiaozhi speaking/listening 冲突
TG led 可能被 Xiaozhi status 立即覆盖
未来 TG motion 可能和 idle motion 冲突
```

建议：

```text
HomeRemote 不使用 NetworkEventCallback
status: allow
notify/display: allow，但不要覆盖 Xiaozhi 长文本状态
led: allow，但标记为临时效果，允许 Xiaozhi 状态覆盖
motion: 第一版不开放
say: 默认 busy，等明确音频策略后再开放
photo: allow，但只做拍照/上传，异步执行；vision/video 延后
```

解决办法：

```text
利用现有 hal_bridge::is_xiaozhi_ready() / is_xiaozhi_idle() 作为第一版判断
ready=false：只允许 status
ready=true 且 idle=true：允许 notify/led/photo
idle=false：notify/say 默认 busy
```

注意：`is_xiaozhi_idle()` 只能表达 Xiaozhi Display 状态，不等于完整音频空闲状态。它可以作为第一版保守门禁，不能当成音频资源锁。

## 9. 资源仲裁

建议新增统一的能力分发层，避免 MCP、HomeRemote、Avatar WS、EzData 各自直接写硬件：

```text
RobotCapabilityDispatcher
  getStatus()
  showNotification(text)
  setLedColor(r, g, b)
  setHeadAngles(yaw, pitch, speed)
  takePhoto(target)
  describeScene(question)
```

Dispatcher 负责：

```text
读取当前模式和 busy 状态
做权限/能力判断
加 LVGL 锁
串行化 motion/camera/audio
返回统一 result
```

### 9.1 UI/LVGL

所有影响 UI、avatar、speech bubble、toast、preview image 的命令必须进入 LVGL 锁区。

现有代码里多处使用：

```cpp
LvglLockGuard lock;
```

HomeRemote handler 也应遵守这个约束。

解决办法：

```text
HomeRemote WS OnData 只入队，不直接操作 UI
HomeRemote task 从队列取 command
执行 UI 命令时进入 RobotCapabilityDispatcher
Dispatcher 内部使用 LvglLockGuard
```

不要在 WebSocket 回调线程里直接创建 toast、改 avatar 或操作 LVGL。

UI 第一版决策：

```text
只开放 notify/display
notify/display 是临时叠加，不改变当前页面和模式
不切 App
不销毁当前页面
不覆盖 Setup 正在显示的配置 UI
不永久修改 avatar 状态
不在 AI Agent 忙碌时插入通知
```

TG 通知不把 Xiaozhi Display 的 `SetChatMessage()` / `SetStatus()` 当作全局显示入口。`SetChatMessage()` 依赖 Xiaozhi `SetupUI()` 和当前 avatar；`SetStatus()` 还会改 Xiaozhi 的 listening/standby/speaking 语义、RGB 和 idle/speaking modifier。它们适合 Xiaozhi 自己，不适合作为 Launcher/Avatar/Setup/AI Agent 全模式通知 API。

建议新增独立底层显示能力：

```text
RemoteUiCapability::showRemoteNotification(text, level, duration_ms)
RemoteUiCapability::showRemoteText(text, options)
```

该能力内部按当前模式选择 toast、speech bubble、busy 或只回 TG，不直接复用 Xiaozhi Display 状态接口。

按模式处理：

```text
Launcher: allow，临时显示 speech bubble 或 toast
Avatar: allow，临时显示 speech bubble，不复用 Avatar WS 的 TextMessage 协议
Setup: allow，但只 toast，不动 avatar 和当前 worker UI
AI Agent idle: allow，轻量显示
AI Agent listening/speaking/non-idle: busy
unknown: busy 或只返回 result，不操作 UI
```

返回语义：

```text
执行成功：ok=true, message=displayed
当前模式不允许：ok=false, error=busy
没有可用 UI：ok=false, error=ui_unavailable
文本为空或过长：ok=false, error=invalid_argument
```

### 9.2 Motion

现有 MCP、Avatar WS、EzData、Setup 校准都可能操作舵机。

当前没有明确的 TG motion 使用场景，因此第一版 HomeRemote 不开放 `set_head_angles` 或其它 motion 命令。

如果后续需要开放，再新增统一边界：

```text
RobotCapabilityDispatcher::setHeadAngles(...)
```

它内部负责：

```text
角度限制
速度限制
当前模式 busy 判断
必要的 LVGL lock
调用 GetStackChan().motion()
```

不要让 HomeRemote、MCP、Avatar WS 各自直接写一套动作规则。

未来解决办法：

```text
新增 MotionCommandQueue 或 motion mutex，优先 motion mutex
同一时间只执行一个 motion 命令
不排队旧 motion 命令，避免延迟转头
限制 yaw/pitch/speed 范围，远程入口比 MCP 更保守
Setup 模式一律拒绝远程 motion
Xiaozhi 非 idle 时一律拒绝远程 motion
Launcher/Avatar 可允许，但第一版暂不实现
未知模式一律拒绝
```

### 9.3 Camera

当前相机能力包括：

```text
Capture()
StreamCaptures()
Explain(question)
```

`Explain()` 会依赖先 `SetExplainUrl()`，并且会创建 JPEG 编码线程、HTTP multipart 上传。

当前代码里实际需要纳入同一套相机仲裁的使用方：

```text
Avatar WS streaming:
  captureAndSendFrame() -> StreamCaptures() -> 读取 frame -> JPEG 编码 -> 发送视频帧

Xiaozhi 通用 MCP:
  self.camera.take_photo -> Capture() -> Explain(question)

HomeRemote TG /photo:
  Capture() -> JPEG 编码 -> 上传 HomeServer -> TG 返回图片
```

`Capture()`、`StreamCaptures()` 和 `Explain()` 都会围绕同一个相机设备、`frame_`、`video_fd_`、`encoder_thread_` 工作。即使上层能判断业务 busy，底层也需要防止两个入口同时进入相机读帧和编码路径。

建议分两层处理：

```text
底层保护：
  StackChanCamera 内部新增 mutex / guard
  保护 Capture() / StreamCaptures() / Explain() 的并发入口
  保护 frame_ / video_fd_ / encoder_thread_ 的生命周期

上层仲裁：
  新增 CameraBusyState
  idle
  avatar_streaming
  xiaozhi_vision
  home_photo
  home_vision
  recording
```

第一版只需要用到：

```text
idle
avatar_streaming
xiaozhi_vision
home_photo
```

第一版 `/photo` 策略：

```text
支持 photo
photo 作为异步任务执行，不阻塞 WebSocket OnData
Setup 模式返回 busy
Avatar streaming 中返回 busy，不抢占视频流
Xiaozhi 正在 camera/vision MCP 中返回 busy
HomeRemote photo 已在执行时，新的 photo 返回 busy 或 duplicate/running
AI Agent idle 时允许 photo，但只做拍照/上传，不做 vision explain
vision_explain / record_video 延后
```

第一版优先返回 busy，不做“等待相机空闲”。等待会造成 Telegram 侧体验不可控，也可能堵住后续命令。

“复用最近一帧”可以作为后续优化，但不建议第一版做。它会带来图片新鲜度、权限语义、Avatar stream 帧缓存生命周期等额外问题。

### 9.4 Audio / Say

目前没有确认到一个稳定的 HAL API 可以直接“文本转语音并播放”。已有能力更偏向：

```text
播放音效
设置音量
麦克风测试录放 PCM
Xiaozhi 自己的实时语音链路
```

因此 `/say` 是一个不确定点。可选方案：

```text
方案 A：第一版只 display/notify，不真正 TTS
方案 B：HomeServer 生成音频，firmware 下载/播放 PCM/Opus
方案 C：通过 Xiaozhi 对话链路播报，但会和当前 AI Agent 状态强绑定
```

第一版建议先做 `notify/display`，把命令名避免叫 `say`，等音频链路确认后再开放真正 `say`。

解决办法：

```text
第一版 Telegram 命令命名为 /notify，而不是 /say
HomeServer 可以回复：已显示到机器人
firmware 只做屏幕文字/表情提示/提示音，不承诺 TTS
```

后续如果要真正 `/say`，建议优先选方案 B：

```text
HomeServer 生成短音频
firmware 收到 play_audio task
firmware 在音频空闲时下载/播放
AI Agent speaking/listening 时返回 busy 或排队
```

这比让 firmware 自己接 Telegram 或自己做 TTS 更可控。

## 10. 与 MCP 的关系

MCP 和 HomeRemote WebSocket 是两个入口，不是互相替代。

```text
语音入口：
用户说话 -> 小智 -> firmware MCP -> 本地能力 / HomeServer

远程入口：
Telegram -> HomeServer -> firmware HomeRemote WebSocket -> 本地能力
```

底层能力最好共用：

```text
MCP self.robot.set_led_color
HomeRemote command set_led_color
        |
        v
RobotCapabilityDispatcher::setLedColor(...)
```

这样后续不会出现“语音能做但 TG 做不了”或“两边角度限制不一致”的问题。

## 11. 与 HomeServer 的职责边界

HomeServer 负责：

```text
Telegram Bot API
Telegram token
用户 allowlist
chat_id 映射
命令解析
命令权限
命令状态
任务队列
图片/视频保存
视觉模型调用
家电平台接入
TG 回复
```

firmware 负责：

```text
设备注册
连接 HomeServer
执行本地机器人能力
返回执行结果
上报在线状态/电量/Wi-Fi/当前模式/忙碌状态
```

firmware 不负责：

```text
Telegram Bot token
Telegram 用户权限
自然语言命令解析
家电账号/云平台 token
复杂任务编排
大文件长期保存
```

## 12. 鉴权和安全

建议 HomeRemote WebSocket 至少包含：

```text
Device-Id
Client-Id
Authorization
timestamp/nonce 或短期 token
```

早期内网版本可以简单一些，但不建议完全裸连。最低限度：

```text
HomeServer 配置一个 HOME_REMOTE_TOKEN
firmware 配置一个 CONFIG_HOME_REMOTE_TOKEN 或从 NVS 配置
WebSocket header 带 Authorization: Bearer xxx
```

在当前固定内网地址前提下，第一版推荐：

```text
HOME_SERVER_URL=http://192.168.50.50:8787
HOME_REMOTE_TOKEN=一段随机长 token
firmware header:
  Authorization: Bearer ${HOME_REMOTE_TOKEN}
  Device-Id: ${factory_mac}
  Client-Id: ${board_uuid}
```

如果暂时不想做 NVS 配置，token 可以先走 Kconfig 或 sdkconfig.defaults.local；但不要把真实 token 提交到公开仓库。

命令权限策略：

```text
只允许 allowlist Telegram user
高风险命令不开放或需要二次确认
firmware 端也保留能力白名单
HomeServer 下发 command timeout
firmware 对未知 command 返回 unsupported_command
```

高风险命令包括：

```text
factory_reset
ota
unbind_account
change_wifi
open_app
record_video
```

第一版不建议支持这些命令。

## 13. 心跳、重连和幂等

WebSocket 必须支持：

```text
ping/pong
断线重连
指数退避或固定退避
hello/register 重发
command_id 幂等
result 重发
```

firmware 需要缓存最近处理过的 `command_id`，例如最近 32 或 64 个：

```text
重复 command_id + 已完成：返回上次 result，不重复执行
重复 command_id + 执行中：返回 accepted/running 和原 task_id，不启动第二个任务
重复 command_id 但 name/payload 不一致：返回 duplicate_id_conflict
新 command_id：执行
```

`command_id` 由 HomeServer 在创建远程命令时生成：

```text
Telegram update/message
  -> HomeServer 解析命令
  -> HomeServer 创建 command 并生成 command_id
  -> HomeServer 发送 command 给 firmware
  -> firmware 缓存 command_id 和执行状态/结果
```

唯一性定义：

```text
生成方：HomeServer
消费方：firmware
唯一范围：HomeServer 全局唯一，至少对同一 device_id 全局唯一
语义：一条远程命令的唯一 ID
不是：Telegram message_id
不是：firmware 本地 task_id
```

HomeServer 也要持久化命令状态：

```text
queued
sent
accepted
running
done
failed
timeout
```

这样断线重连后不会重复拍照、重复播报、重复转头。

具体解决办法：

```text
heartbeat:
  firmware 每 15 秒发送 ping
  HomeServer 30 秒未收到 ping 标记设备 offline
  firmware 30 秒未收到 pong/任何消息则主动断开重连

reconnect:
  1s, 2s, 5s, 10s, 30s 退避
  连接成功后重置为 1s
  HomeServer 不在线时不刷屏打日志

idempotency:
  firmware 保存最近 32 或 64 个 command_id 和 result
  HomeServer 重发 sent/running 状态的 command 时，firmware 不重复执行已完成命令
```

第一版 result 可以只保存在内存，不需要落 NVS。设备重启后由 HomeServer 负责把旧命令标记 timeout 或 expired。

长任务不要阻塞 WebSocket handler。firmware 收到长任务后先返回 `accepted=true`，随后异步发送：

```text
task_progress:
  task_id
  command_id
  stage
  progress 可选

task_result:
  task_id
  command_id
  ok
  result/error/message
```

第一版 `/photo` 可以只发 stage，不要求百分比。

## 14. 实施顺序

推荐顺序：

```text
1. HomeServer 新增 /robot/ws
2. HomeServer 维护单设备连接状态
3. firmware 新增 HomeRemoteWsClient，但只 hello + heartbeat
4. 验证 Launcher/Avatar/Setup/AI Agent 都能保持连接
5. 新增 status command
6. 新增 notify/display command
7. 新增 set_led_color command
8. 抽出 RobotCapabilityDispatcher
9. MCP 和 HomeRemote 逐步共用 Dispatcher
10. 新增 photo，并加 StackChanCamera 底层互斥和 CameraBusyState
11. 后续如有 motion 场景，再新增 set_head_angles，并加模式 busy 策略
12. 最后再讨论 say / vision / video
```

第一阶段验收：

```text
设备在 Launcher：TG /status 有响应
设备在 Avatar：TG /status 有响应
设备在 Setup：TG /status 有响应
设备在 AI Agent：TG /status 有响应
HomeServer 重启后 firmware 自动重连
Wi-Fi 断开恢复后 firmware 自动重连
未知 command 返回 unsupported_command
重复 command_id 不重复执行
```

第二阶段验收：

```text
TG 可以让设备显示一条远程通知
TG 可以临时设置 LED
Xiaozhi speaking/listening 时不会因为 TG 命令崩溃
Setup 硬件测试时冲突命令返回 busy
```

## 15. 主要风险清单

### 15.1 多 WebSocket 同时存在

已确认 firmware 有 WebSocket client 能力，但没有实机确认：

```text
HomeRemote WS
Xiaozhi realtime WS
Avatar WS
```

三者同时存在时的内存、socket、CPU、网络稳定性。

需要实机验证：

```text
heap 水位
断线重连
AI Agent 对话延迟
Avatar 视频流帧率
HomeRemote command 延迟
```

解决办法：

```text
第一阶段只跑 HomeRemote WS + Xiaozhi，不开 Avatar 视频流
第二阶段进入 Avatar 页面，同时保持 HomeRemote WS，只测 status/notify/led
第三阶段 Avatar 视频流 + HomeRemote status，观察 heap 和帧率
第四阶段 AI Agent 对话中发送 HomeRemote status/notify，观察音频卡顿
```

实现上基础连通性阶段 HomeRemote WS 只处理 JSON 小消息，不发送大包、不跑相机、不解码图片。`/photo` 放到相机仲裁完成后再接入，并且只在相机空闲时异步执行。

### 15.2 网络 callback 单槽

`SetNetworkEventCallback()` 是单槽，容易互相覆盖。

规避策略：

```text
HomeRemote 不长期占用它
只基于 WifiManager::IsConnected() 和 WebSocket 状态自管理
```

补充约束：

```text
HomeRemote 不调用 Board::SetNetworkEventCallback()
HomeRemote 不调用 Hal::startNetwork()
HomeRemote 可以调用 Board::GetInstance().GetNetwork()
HomeRemote 可以调用 WifiManager::GetInstance().IsConnected()
```

### 15.3 Setup 模式冲突

Setup 本身就是配置/测试模式，远程控制容易打断现场操作。

规避策略：

```text
按当前 Setup 层级暴露 busy 状态
Setup 菜单页允许 status/notify/led/photo
Setup worker 运行中只允许 status/notify
第一版 Setup 下禁用 motion/audio/say；photo 只在菜单页且相机空闲时允许
```

解决办法优先级：

```text
最小实现：AppSetup 暴露 menu vs worker 两级状态
中等实现：Setup App 暴露当前 worker 类型和 setup_busy_scope
完整实现：每类资源独立 busy scope，命令按资源判断
```

### 15.4 Audio say 不确定

当前未确认可直接文本播报的通用 HAL API。

规避策略：

```text
第一版只做 notify/display
不要承诺 TG /say 一定能真正发声
后续再确定 TTS 音频来源和播放链路
```

推荐决策：

```text
第一版删除 /say，改为 /notify
如果产品上必须叫 /say，则 HomeServer 回复文案写清楚：已显示到机器人
真正发声能力单独作为第二阶段设计
```

### 15.5 相机并发

Avatar video streaming、Xiaozhi MCP camera、HomeRemote photo、vision explain 都会用相机。

规避策略：

```text
StackChanCamera 内部加 mutex / guard
上层加 CameraBusyState
Avatar streaming 时 photo busy
Xiaozhi vision/camera MCP 时 photo busy
HomeRemote photo 异步任务化
vision/video 延后
```

推荐决策：

```text
第一版做 photo，但只支持相机空闲拍照
Avatar streaming 时先返回 busy
复用最近帧作为第三版优化，不在第一版做
```

### 15.6 固定内网地址不可达

当前 HomeServer 固定为：

```text
192.168.50.50
```

这个简化了发现机制，但也带来一个前提：设备必须和 HomeServer 在同一可达网络内。

解决办法：

```text
连接失败不影响本地功能
状态栏或日志只提示 HomeRemote offline
HomeServer 未启动时持续退避重连
Wi-Fi 换网后自动重新尝试固定地址
```

第一版不处理跨网段、VPN、公网穿透和动态地址。

## 16. 当前建议的最小版本

最小可落地版本不要做太多：

```text
HomeServer:
  /robot/ws
  Telegram /status
  Telegram /notify <text>
  Telegram /led r g b
  Telegram /photo

firmware:
  HomeRemoteWsClient 常驻
  hello/heartbeat
  status
  notify/display
  set_led_color
  photo
  unsupported/busy/error result
  reconnect
  command_id 去重
```

对应要解决的遗漏点：

```text
网络 callback 冲突：通过不使用 NetworkEventCallback 解决
启动阻塞风险：通过后台 task + Wi-Fi 状态检查解决
Setup 冲突：通过 Setup 菜单页/worker 两级策略解决；worker 中只允许 status/notify
相机冲突：通过 StackChanCamera 底层互斥 + CameraBusyState + photo 异步任务解决
音频 say 不确定：第一版改为 notify/display 解决
多 WebSocket 风险：第一版只传 JSON 小消息，并分阶段实机验证
命令重复：通过 command_id 内存去重解决
安全裸连：通过内网固定地址 + token header 解决
```

暂缓：

```text
say
vision_explain
record_video
open_app
home appliance control through firmware
```

其中家电控制如果只是 TG 控制灯、空调、插座，优先由 HomeServer 直接接 Home Assistant、BroadLink、Matter 或其他网关，不需要绕 firmware。

## 17. 最终判断

在“必须 WebSocket，并且 Launcher/Avatar/Setup/AI Agent 全模式可控”的前提下，方案是可行的，但应按下面边界实现：

```text
新增 HAL 级 HomeRemote WebSocket client
启动早于任何具体 App，并晚于基础硬件/LVGL 初始化
不复用 Avatar WebSocket
不依赖 Mooncake Ability 生命周期
不长期占用 NetworkEventCallback
不把 TG token 或 TG 语义放进 firmware
所有本地动作走统一能力分发和 busy 策略
第一版只开放低冲突命令
```

这条路线和现有代码没有根本冲突；真正需要重点验证的是多 WebSocket 并存、网络重连、AI Agent 音频实时链路、Setup 流程冲突、相机并发。
