> 该文档描述历史方案、历史快照或早期探索，不代表当前实现。
> 当前方向请参考 docs/README.md 和 docs/architecture.md。

# StackChan 项目现状审计（代码事实源）

> 审计日期：2026-09-30。范围为当前 `HomeServer` 分支工作树；本报告不修改任何既有实现。
>
> 结论分级：**已确认**表示可由当前受版本控制的源码、构建配置或 Git 历史直接证明；**待确认**表示需要实际固件构建、设备、网络或线上服务验证。文档只用于比对，不作为实现事实源。

## 1. 执行摘要：仓库现在真正是什么状态

这是一个在 M5Stack StackChan 上游工程基础上，叠加了两条尚未收敛的扩展路线的多端仓库，而不是已经完成切换的 Robot Runtime：

```text
Flutter App ──────── HTTP / StackChan WS ──────> Go server
    │ BLE / 配网                                     │ 账户、设备、内容、App 服务
    ▼                                                │
ESP32 firmware ── Mooncake / Avatar / 设备硬件 ──────┘
    │
    ├─ xiaozhi-esp32 Application（语音、协议、MCP server）──> 小智服务（运行时配置决定）
    │
    └─ HomeRemote WS ───────────────────────────────> HomeServer（Node/Fastify）
                                                       └─ Telegram（可选）
```

已确认的运行入口是 `firmware/main/main.cpp:19-61`：先 `GetHAL().init()`，默认安装 Mooncake 应用；用户从 `AppAiAgent` 切换、或设置 `startAiAgentOnBoot` 后，销毁 Mooncake 并进入 `Hal::startXiaozhi()`，最终调用外部依赖 `xiaozhi-esp32` 的 `Application::Run()`，且不会返回。这个单向切换是未来拆分时最重要的边界。

当前自定义增量集中在 6 个提交（`ff5c7ed..5b1782c`）。相对 `upstream/main`，Git 统计为 33 个文件、7,777 行新增、1 行修改：新增 `HomeServer/`、新增 `hal_home_remote.cpp`，并对 `hal_mcp.cpp`、Kconfig/defaults 做小范围修改；同时新增约 6,000 行设计/架构文档。故“新方向”尚未是仓库真实主运行时：DeepSeek、EQR7、STT、Tool Calling runtime 没有在本仓库中实现。

## 2. 模块职责与实际依赖

| 模块 | 当前实际职责、入口 | 通信与使用状态 | 来源与新方向适配 |
|---|---|---|---|
| `firmware/` | ESP-IDF 设备固件。入口 `main/main.cpp:19`；`Hal::init()` 初始化 NVS、板级桥、MCP、触摸、IO 扩展、RTC、IMU、舵机、LVGL 和 HomeRemote（`hal/hal.cpp:25-44`）。`stackchan/` 是表情、动作、灯光、动画；`hal/board/` 是 CoreS3 板、显示、相机与小智板适配。 | BLE 配网、ESP-NOW、StackChan Avatar WS、HTTP、以及小智 WebSocket/MQTT/音频均由本模块或其拉取依赖承担。HomeRemote 从初始化起常驻连接 `{HOME_SERVER_URL}/robot/ws`。 | 主体为上游 StackChan；`repos.json` 固定拉取 `78/xiaozhi-esp32 v2.2.4` 并应用本地 patch。硬件层是新 Device Runtime 的最大可复用资产。 |
| `server/` | GoFrame 的 StackChan 产品后台，入口 `server/main.go` 调 `cmd.Main`。包含用户/设备绑定、舞蹈、App Store、动态内容、文件、账号/RSA、以及 `/xiaozhi` token、license、激活等代理/配置接口。 | Flutter App 的 `Urls` 指向其 `/stackChan/` REST 与 `/stackChan/ws`；固件 `CONFIG_STACKCHAN_SERVER_URL` 也用于账号、App Center、Avatar WS 等。 | 上游原始服务主体。不是 HomeServer 的后端实现，也没有 DeepSeek/Robot Runtime。可保留作旧 App 兼容与历史产品服务，但不应被误认为新 Agent 基础。 |
| `HomeServer/` | 本分支新增的 Node + TypeScript 服务，入口 `src/index.ts:5-12`。Fastify 提供 `/health`、`/status`、`/robot/status` 与受可选 Bearer secret 保护的 `/robot/ws`（`src/http/server.ts:22-43`）；可选 grammY 长轮询 Bot。 | firmware 的 `hal_home_remote.cpp` 建连，握手、ping/pong、命令和回执由 `src/stackchan/client.ts` 管理；Telegram 只可发 `status`、`notify`、`set_led_color`。它没有调用 Go `server/`，`official-server.ts` 目前为空文件。 | 全部为后续自定义。是最接近未来“设备连接/命令执行边界”的原型，但还不是 STT/LLM/Tool Calling runtime。 |
| `app/` | Flutter 移动 App，入口 `lib/main.dart:14-20`。包含 BLE 配网、本地表情/动作、App/账户、舞蹈和远程 Avatar 控制。 | `lib/network/urls.dart:24-48` 设定 Go server 地址；`XiaoZhiUtil` 直接访问 `https://XiaoZhi.me/`（`lib/util/XiaoZhi_util.dart:34-56`），设置页仍会打开 AI Agent 与 MCP 页面。 | 主体上游；仍强依赖 StackChan server、小智账户/Agent。基础 BLE 和本地控制可复用，不能直接作为新 Runtime 的管理端。 |
| `remote/` | 独立 ESP-IDF 遥控器固件，入口 `remote/code/main/StackChan-RemoteControl-ESPNow.cpp`，摇杆和 UI 经 ESP-NOW 发控制包。 | 与机器人通过 ESP-NOW，非 Go server、HomeServer 或小智主链。 | 上游/独立子工程；保留为硬件交互能力，是否纳入 v2 取决于产品需求。 |
| `firmware/xiaozhi-esp32` 与 `firmware/components/` | 不在 Git 中的构建时依赖。`fetch_repos.py:43-61` 按 `repos.json` clone/fetch/checkout 并对小智依赖应用 patch。 | 向固件提供 `Application`、Board、网络、音频、MCP server、协议实现等。 | 外部上游依赖，不应当成当前仓库内可任意改写的代码。patch 是自定义修改且应单独审查。 |

其他重要资产：`firmware/tests/motion_math_test.cpp` 是运动数学测试；`firmware/patches/xiaozhi-esp32.patch` 是对外部依赖的补丁（包含激活提示/表情资产相关修改），不是新 Runtime 功能；根 `README.md`、各模块 README 是构建/运行入口参考。

## 3. 旧方案遗留与依赖链

### 3.1 小智 Agent / 官方服务（仍有真实运行路径）

这不是“孤立死代码”。`main.cpp` 无条件在主循环后调用 `GetHAL().startXiaozhi()`；`Hal::startXiaozhi()` 启动 StackChan 更新任务并进入 `hal_bridge::start_xiaozhi_app()` → `Application::Run()`（`firmware/main/hal/hal.cpp:180-205`）。`Hal::init()` 也无条件执行 `xiaozhi_mcp_init()`（同文件:36）。

绑定/配置耦合还存在于：

- `firmware/main/hal/board/hal_bridge.{h,cc}`：`isXiaozhiMode`、`startAiAgentOnBoot` 和 `xiaozhi` NVS namespace；
- `firmware/main/apps/app_ai_agent/` 与 `app_setup/workers/ai_agent.cpp`：Mooncake 到 AI Agent 的选择和配置；
- `app/lib/util/XiaoZhi_util.dart`、`app/lib/model/XiaoZhi/`、`app/lib/view/popup/xiaozhi_welcome_page.dart`：小智登录、license、设备激活、Agent/对话/TTS/模型/MCP endpoint 管理；
- `server/internal/xiaozhi/`、`server/internal/controller/xiaozhi/`、`server/api/xiaozhi/`：小智 token / license 代理；
- `firmware/main/Kconfig.projbuild:33+`、外部 `xiaozhi-esp32`：OTA 与小智协议配置。

### 3.2 MCP 遗留（仍被小智路径使用）

`firmware/main/hal/hal_mcp.cpp:62-204` 经 `McpServer::GetInstance()` 注册 6 个工具：`self.home.get_status`、头部角度读写、LED、提醒创建/查询/停止。它们是**小智 Application 内的 MCP server 工具**，不是 Codex stdio MCP server，也不是 HomeServer 的 WebSocket 命令协议。

依赖链为：`Hal::init()` → `xiaozhi_mcp_init()` → 小智运行时的 `McpServer` → 官方/小智 Agent 的 tool 决策 → 固件 handler；其中 `self.home.get_status` 额外 HTTP GET HomeServer 的 `/robot/status`。因此在停用小智之前，不能仅删 `hal_mcp.cpp`；停用小智后，这一整层可以由未来 Runtime 的 Tool API 替代。

### 3.3 自定义 HomeRemote（有价值，但与旧 Agent 并存）

`hal_home_remote.cpp:417-420` 在 `Hal::init()` 无条件创建 FreeRTOS 任务。它使用独立配置 `CONFIG_HOME_SERVER_URL` 与 `CONFIG_HOME_SERVER_SHARED_SECRET`，连接 `/robot/ws`，并缓存最近 16 个 `command_id`。当前固件只执行 `status`、`notify`、`set_led_color`（:325-370）；其中小智模式的 `notify` 只确认 received、不会展示 toast（:341-347）。

HomeServer 的命令名 union 同样只有这三种（`HomeServer/src/stackchan/client.ts:15-21`）。这是已落地的设备连接原型，不等于完整机器人控制层：没有音频说话、动作、相机、持久任务、设备路由、存储队列、权限模型或资源仲裁。

## 4. 代码分类（不执行删除）

### A. 必须保留：设备基础能力

| 位置 | 理由 |
|---|---|
| `firmware/main/hal/board/stackchan.cc`、`stackchan_display.cc`、`cores3_audio_codec.*`、`stackchan_camera.*` | 板级初始化、屏幕/LVGL、音频编解码和相机。未来 Device Runtime 仍需这些能力；相机的 `Capture` 与 `Explain` 可在新的协议边界下复用。 |
| `firmware/main/hal/hal_servo.cpp`、`hal_imu.cpp`、`hal_head_touch.cpp`、`hal_io_expander.cpp`、对应 `drivers/` | 舵机、IMU、触摸、IO 扩展和灯控的底层入口。 |
| `firmware/main/stackchan/motion/`、`animation/`、`avatar/`、`addons/neon_light/` | 动作计算、表情/动画和 LED 表达；目前被 Mooncake、MCP 和 HomeRemote 共同调用。 |
| `firmware/main/hal/hal_network.cpp`、`hal_ble.cpp`、Wi-Fi/BLE 工具 | 网络与配网基础；新协议可替换上层路由，不应重写驱动。 |
| `firmware/main/main.cpp`、`hal/hal.{h,cpp}` | 现有启动、NVS、看门狗与硬件初始化序列。需未来拆分而非立即删除。 |

### B. 可以直接复用：已有通用边界

| 位置 | 可复用内容与限制 |
|---|---|
| `firmware/main/hal/hal_home_remote.cpp` | 常驻 WS、鉴权 header、重连、心跳、命令回执、有限去重，以及将 WS callback 与执行分开的队列模型。应保留协议思想，不承诺当前 16 条内存缓存足以支持长期任务。 |
| `HomeServer/src/http/server.ts`、`stackchan/client.ts` | Device session、hello、单设备命令回执、超时和 REST health endpoint。适合作为 Robot Runtime 的 transport adapter 原型。 |
| `firmware/main/stackchan/*` 与 `hal_mcp.cpp` 内部直接调用动作/灯光/提醒的片段 | 可抽成 Device Command handler；应去除 `McpServer` 与小智 prompt/类型依赖。 |
| `remote/code/` | 若继续支持实体摇杆，可复用 ESP-NOW 控制通道；不必成为云/LLM 命令通道。 |
| `server/utility/rsa.go`、Go server 的账户/设备数据模型 | 仅在保留原 App/产品账户时可复用；不要把其作为新 Runtime 鉴权的默认方案。 |

### C. 需要改造：有价值但当前耦合过深

| 位置 | 当前耦合点 | 推荐职责 |
|---|---|---|
| `firmware/main/main.cpp`、`hal.cpp`、`hal_bridge.*` | 启动末端强制进入 `Application::Run()`；`isXiaozhiMode` 决定行为；外部板类来自小智依赖。 | 把“设备主循环/事件分发”与“旧小智会话 adapter”分开，保留 Board、网络和音频接口。先建立 Device Command/Event API，再替换启动目标。 |
| `hal_mcp.cpp` | 直接依赖 `mcp_server.h`、小智工具注册和小智语义描述。 | 迁为 Runtime 可调用的 command catalog / RPC handler；动作仍经 `GetStackChan()`，但参数校验、取消、占用与结果 schema 统一。 |
| `hal_home_remote.cpp` | 只支持三条命令，UI/LVGL 与模式行为写在 transport 中。 | 变为纯 transport：解析、认证、去重、回执；将 `status/notify/LED/motion/audio/camera` 分派到独立的设备能力服务和资源仲裁器。 |
| `HomeServer/` | 内存单设备 Map、Telegram handler 直接下发命令、`officialServerUrl` 未实际使用。 | 逐步演进为 EQR7 Robot Runtime 的 Device Gateway + Tool Executor；新增 STT/LLM/TTS 适配器应在此层或独立 runtime 包，不能塞入 Telegram handler。 |
| `app/` | App 将 Go StackChan server、小智云和 BLE 控制混在一个客户端。 | 保持为设备配置/传统兼容客户端；若需 v2 管理功能，添加独立 Runtime API adapter，不以小智 Agent 页面为入口。 |
| `server/` | 产品后台同时有社交、文件、设备、App 与小智 token 代理。 | 若要继续支持原 App，隔离为 legacy product backend；不要和新 Runtime 强行合并。 |

### D. 旧架构遗留：未来停用后可隔离/下线（目前不能直接删）

| 位置 | 遗留性质与当前依赖 |
|---|---|
| `firmware/main/hal/hal_mcp.cpp` | 小智 MCP 工具层；由 `Hal::init()` 直接调用。 |
| `firmware/main/apps/app_ai_agent/`、`app_setup/workers/ai_agent.cpp`、`hal_bridge` 的小智配置 | Mooncake → 小智 Agent 切换 UI/启动层；当前入口仍可到达。 |
| `firmware/xiaozhi-esp32` 及 `repos.json:18-22` 的依赖声明 | 小智运行时、音频/协议/Board 的混合依赖。不能“删目录”解决，先要抽离仍需的板级 API。 |
| `app/lib/model/XiaoZhi/`、`XiaoZhi_util.dart`、`xiaozhi_welcome_page.dart`、`mcp_page.dart` | 官方小智账号、Agent、模型、对话与 MCP endpoint 管理；设置页仍引用。 |
| `server/internal/xiaozhi/`、相关 controller/api | 小智 token/license/激活后端代理。 |
| `server` 的 `/stackChan/ws` Avatar/App 路线、`firmware/main/hal/hal_ws_avatar.cpp`、`AppAvatar` | 不是 MCP，但属于原 StackChan 云/App 远控方案；是否保留取决于是否继续支持官方/现有 App。 |
| `docs/官方小智加自建服务实施方案.md` | 明确以“官方小智做大脑 + firmware MCP”为目标，和新方向冲突。 |

### E. 可以删除：本次没有确认到的业务源码

没有已满足“无引用、无运行路径、无用途”三项条件的业务源码。唯一可确认的无功能占位是 `HomeServer/src/stackchan/official-server.ts`（单行空文件），但是否为下一阶段预留无法由代码判定，故只标为**候选**，不建议当前删除。

`docs/.DS_Store` 是非文档元数据文件，可在后续纯仓库卫生提交中删除；本轮按约束不动。`HomeServer/dist/`、`node_modules/`、`.pnpm-store/` 是工作树生成物，是否被 Git 跟踪及发布流程是否依赖它们应在清理提交前用 `git ls-files` 再确认。

## 5. 固件结论

### 应保留

保留板级 HAL、CoreS3 显示/触摸/相机/音频、舵机/灯/IMU/RTC、Wi-Fi/BLE、StackChan 动作与 Avatar 表达、ESP-NOW（如产品仍需遥控器）以及 NVS/OTA 基础。它们并非小智 Agent 的专属能力。

### 应逐步剥离或替换

小智 Application 生命周期、MCP tool registration、小智配置/NVS、AI Agent Mooncake 页面、官方 Agent/账号/激活路径，以及所有只为其服务的 App / Go server 代码。剥离的前提是新 Runtime 已能替代语音会话和 Tool Dispatch；不能在仍需要 `Application::Run()` 时删除其依赖。

### 关键判断

不需要从零重写固件。最合适路径是现有固件上逐步剥离：先让 `HomeRemote`/未来协议进入一个不依赖 `isXiaozhiMode` 的设备命令边界，再替代 `main.cpp` 的最终运行时。重写会丢失板级驱动、显示、音频、网络、动作/安全边界，以及已知的构建兼容性。

### 待确认

1. 外部 `xiaozhi-esp32` 是否可将 Board/音频/网络 API 独立于 `Application` 链接；需最小构建实验确认。
2. 真实设备上 HomeRemote 与小智音频/网络生命周期是否稳定共存；源码只能证明任务会启动，不能证明长期稳定。
3. `firmware/patches/xiaozhi-esp32.patch` 的每一处是否仍有产品价值；其应用具有“无法干净应用即跳过”的逻辑（`fetch_repos.py:32-40`），需在固定依赖版本下验证。
4. `notify`、LED、动作、音频、相机并发的资源仲裁策略尚未实现；当前仅对 LVGL 使用锁。

## 6. Server 与 HomeServer：为什么并存、如何收敛

两者不是重复实现同一职责：

- `server/` 是 Go 产品后台，面向 StackChan App、账户、设备绑定、社交内容、文件、App Center/Avatar WS，并含小智 token/license 代理。
- `HomeServer/` 是新加的局域网设备连接与 Telegram 远控原型，当前不导入、不调用 Go server；`official-server.ts` 为空证明“桥接官方 server”尚未实现。

因此当前重叠较小，重叠仅在“都能间接描述设备/在线性”层面；协议、认证、存储和服务对象都不同。长期保留两个“主 Server”不合适，但现在直接合并风险很高：语言/框架不同，Go server 的账户/产品 schema 与 HomeServer 的单设备内存 session 没有可验证的等价关系。

未来若目标是独立 Robot Runtime，优先以 **HomeServer 的职责边界** 为基础，而不是把 Go `server/` 继续扩成 Agent：它已经拥有设备主动连接、命令回执和 Telegram 入口，且不依赖官方产品 API。实施时可将其重命名/拆为 `runtime`，而非仓促将 Go/Node 代码合并。保留 `server/` 作为 legacy App backend 的成本是双部署/双配置；废弃它的成本是 App 账户、BLE 后续云路径、Avatar、舞蹈/内容和绑定功能需要明确退役或迁移。

## 7. 文档审计（以当前代码校验）

| 文档 | 状态 | 问题 | 建议 |
|---|---|---|---|
| `docs/官方小智加自建服务实施方案.md` | **废弃方案；部分实现** | 主结论是官方小智 Agent + firmware MCP；新方向已否定该核心。文中第二阶段推荐轮询，但代码实际实现的是常驻 `/robot/ws`。 | 移入 `archive/`，文件首加“历史方案，不代表当前实现”；保留 MCP/HTTP 背景。 |
| `docs/HomeServer接入TG后firmware常驻WebSocket方案.md` | **部分准确；早期设计与已实现混合** | 第一版 `status/notify/LED`、WS、去重和 Telegram 与代码吻合；大量相机/音频/动作/仲裁为设计，不是实现。 | 归档或拆成历史设计；保留已实现摘要，显式标出“未实现”。 |
| `docs/home-ai-robot-requirements.md` | **早期需求；大部分未实现** | 描述照片、视频、家电、视觉、自然聊天、主动通知等目标；当前 HomeServer 没有对应实现，`/photo` 直接提示未开放。 | 移入 `archive/requirements/`，作为需求来源而不是实现文档。 |
| `docs/architecture/README.md` | **部分过时** | 知识库目录未以新 Runtime 为中心，且把多端关系作为现行总览。 | 新结构落定后压缩为文档入口。 |
| `docs/architecture/system-overview.md` | **部分准确** | 对现有上游多端/小智结构有参考价值，但不含 HomeServer 作为已实现模块，也不代表新方向。 | 用未来 `architecture.md` 替换为“当前实现 + 目标边界”两层。 |
| `docs/architecture/repository-structure.md` | **部分过时** | 未将新增 `HomeServer/` 与拉取式外部依赖的重要性作为顶层真实结构。 | 迁入或并入简短的 `development.md`。 |
| `docs/architecture/module-map.md` | **部分准确** | 模块地图对上游模块有用，但没有 HomeServer，且不能表明可达运行路径。 | 更新前归档为快照，或合并到新 architecture。 |
| `docs/architecture/core-symbols.md` | **部分准确** | 很多符号索引可核查，但缺 HomeRemote/新 HomeServer，且部分 XiaoZhi/Server 符号属于旧链。 | 保留为索引材料，按 legacy/runtime 标注后再精简。 |
| `docs/architecture/end-to-end-flows.md` | **部分准确** | 小智、App、Avatar、BLE、ESP-NOW 流程有源码依据；缺 `/robot/ws`，并将 MCP 作为现行主要流程之一。 | 归档为现状快照；新文档只列已验证 v2 流程。 |
| `docs/architecture/protocols.md` | **部分准确且不完整** | 旧 Server WS/BLE/ESP-NOW/小智协议有价值，但没有 HomeRemote JSON hello/command/result，且应避免把文档中的协议示例当作 wire-level 验证。 | 保留为协议参考，后续将有效协议收敛到一个 `protocol.md`。 |
| `docs/architecture/configuration.md` | **部分准确** | Kconfig、NVS、Go/App 配置具参考价值；HomeServer 内容与当前代码基本对齐，但默认地址/secret 属部署样例，不能当生产事实。 | 迁入 `development.md` 的配置段；敏感配置只保留 `.env.example`。 |
| `docs/architecture/extension-guide.md` | **早期设计；部分过时** | DeepSeek/STT/TTS/HA 多为选项推演，不是现有实现；“Server”泛指会混淆 Go server 与 HomeServer。 | 归档为设计探索，未来以 ADR 记录已做选择。 |

没有发现 `docs/` 中对新 EQR7 + DeepSeek Tool Calling Runtime 的已实现说明；这与代码一致，因为该 runtime 尚未在此仓库出现。所有当前 architecture 文档均在本分支的自定义提交中一次性新增，不能因篇幅大而当作已验证实现。

## 8. 推荐的文档收敛结构（后续任务，不在本轮移动）

避免机械重写。完成事实复核后建议只保留：

```text
docs/
├── README.md                 # 当前文档入口、事实源原则、历史边界
├── architecture.md           # 当前实际运行链 + 已批准目标边界
├── protocol.md               # 仍受支持的 BLE / ESP-NOW / Avatar WS / Device WS
├── development.md            # 构建、依赖拉取、配置与验证
├── decisions/                # 小型 ADR：为何弃用小智 Agent/MCP 主链等
└── archive/
    ├── official-xiaozhi-home-server.md
    ├── homeremote-design.md
    ├── home-ai-requirements.md
    └── architecture-snapshot-2026-09.md
```

归档文件顶部统一标记：`> 该文档描述历史方案或历史快照，不代表当前实现。以代码和现行 architecture/protocol 为准。`。先移动、后删除重复内容；不要丢弃协议和决策背景。

## 9. Git / 仓库策略比较与建议

| 方案 | 判断 |
|---|---|
| A：在当前主线整理后演进 | 可行，但当前分支名 `HomeServer` 已表达一个旧阶段目标；直接把大量 v2 工作压入其中会混淆历史。 |
| B：保留当前仓库，建 `runtime-v2` / `architecture-v2` 分支 | **推荐**。当前相对上游的有效自定义量小且集中，Git 历史可追溯；可以在冻结/归档后小步提交新 Runtime，不损失硬件修复与现有探索。 |
| C：重新 fork 上游再迁移 | 当前不推荐。已有有效固件、HomeServer 和文档改动数量有限但相互关联；重新挑选会漏掉 Kconfig、HomeRemote、patch 与已知兼容性。仅在 upstream 历史不可用、许可/治理要求或差异无法维护时考虑。 |
| D：新建仓库 | 当前不推荐。会复制硬件/构建/依赖维护负担，失去上游对比与历史；只有最终 Runtime 明确为完全独立且 firmware 要成为独立发布物时再评估。 |

保留 `upstream` remote 的价值仍高：底层 StackChan、显示/硬件和第三方依赖仍承载主要能力。建议先记录当前 `upstream/main...HomeServer` 基线，后续按小主题提交；任何同步上游工作都在独立分支完成并逐项验证。

## 10. 低风险整理顺序

1. **冻结并标记现状**：提交本审计，记录 `HomeServer` HEAD、依赖版本和设备配置；不移动代码。
2. **建立文档边界**：下一独立提交中只归档废弃/探索文档，加历史标记；再生成一页简短当前架构。
3. **建立引用清单**：对每个候选旧模块用编译目标、`rg` 引用、运行入口和设备测试四项确认；特别先处理小智外部依赖与 `main.cpp` 生命周期。
4. **定义 Runtime/Device 协议**：在不改动执行器前，明确命令 schema、capability、取消、幂等、资源仲裁、设备选择和错误结果；HomeRemote 的 hello/command/result 只作为起点。
5. **建立 v2 分支与最小垂直切片**：从 HomeServer 的 device transport 和固件基础能力开始，先跑一个非小智的低风险指令；STT/DeepSeek/TTS 在该边界之后接入。
6. **双路径验证后再退役**：只有新路径已替代语音、工具调用和设备控制并有回归证据，才逐步移除小智 MCP、AI Agent 页面、App/Go 的小智代理；每次删除独立提交、可回退。

## 11. 待确认问题

1. 目标设备、已刷固件版本以及 NVS 中的 server/小智配置是什么？源码不能证明实际部署已使用当前 `sdkconfig.defaults`。
2. HomeServer 是否已在真实 EQR7/局域网主机部署，Telegram token/secret 是否配置，WS 是否经历过长时稳定性测试？
3. 是否还必须继续支持原 Flutter App 的账户、社交、Avatar/视频、舞蹈和远程控制？这决定 Go `server/` 与 App 旧路径的退役范围。
4. 新 Runtime 的音频边界在哪里：ESP32 仅采集/播放，还是继续依赖小智的 `AudioService`？该答案决定 xiaozhi-esp32 可剥离程度。
5. 是否需要保留 ESP-NOW 遥控器、官方 OTA、App BLE 绑定？它们是产品约束，不能从代码推断。
6. DeepSeek `deepseek-flash` 的 0.5–0.7 秒 Tool Call 结论是外部初测背景；本仓库没有测试脚本或结果，需在未来 Runtime 环境以端到端指标复测。
