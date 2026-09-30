# runtime-v2 执行与验收清单

> 按 Phase 顺序推进。每完成一个勾选项，保存可复查的运行记录；只有本阶段“通过条件”满足，才将状态改为 `DONE` 并进入下一阶段。`SKIPPED` 必须写明原因。本文是待办清单，不表示新 Runtime 已实现。

**当前进度（2026-09-30）：Phase 0 · IN PROGRESS。** 下一步是核对现有运行入口与协议；Phase 1 尚未开始。`runtime-v2` 已建立并推送，旧方案代码仍保留。用户提供的 DeepSeek Flash 简单 Tool Call 约 0.5～0.7 秒是初测背景，不作为验收结果。

状态只用 `TODO`、`IN PROGRESS`、`BLOCKED`、`DONE`、`SKIPPED`。每阶段完成后填写完成日期、结论、测试结果路径和关联 commit；未实测的项目保持未勾选。

## Phase 0：确认基础状态

Status: IN PROGRESS

目的：先确认当前代码实际如何运行，建立可回退的工作起点。

最小实现：只做仓库和调用链核对，不改运行逻辑。

- [x] 确认当前位于 `runtime-v2`，且跟踪 `origin/runtime-v2`（2026-09-30 已核对）。
- [x] 确认旧方案可回退点：`5b1782c` 是整理前的 `HomeServer` HEAD；目前没有 Git tag。
- [x] 确认 [docs 入口](README.md) 指向当前方向。
- [x] 确认旧方案文档已进入 [archive](archive/)。
- [ ] 追踪 firmware 启动路径与 Mooncake / 小智切换条件。
- [ ] 追踪 HomeRemote 的启动、连接与重连路径。
- [ ] 追踪 xiaozhi `Application::Run()` 的进入条件及退出边界。
- [ ] 追踪 MCP 工具注册位置、调用方和现有硬件能力。
- [ ] 核对 HomeServer ↔ firmware 的握手、`command_id`、命令、结果、超时和去重协议。

验证：从实际源码入口和调用点记录路径；必要时以当前构建及设备日志复核，不把归档文档当成实现事实。

通过条件：上述路径、依赖和回退点均有可复查记录；未确认处明确标为待验证。

记录：完成日期：—；结论：—；源码/日志：—；关联 commit：—。

## Phase 1：Robot Runtime → StackChan 最小动作链

Status: TODO

目的：先证明 EQR7 可以独立下发设备命令，并收到真实执行结果。

最小实现 / Demo：沿可用的设备连接边界新增唯一动作 `nod`，运行 `Runtime → firmware → 实际机器人点头 → result`。本阶段的命令路径不经过 DeepSeek、小智 Agent、MCP、STT 或 TTS；旧代码先保留。

- [ ] 定义最小 Device Command 与 `nod` 的输入、结果和错误语义。
- [ ] HomeServer / Runtime 发送 `nod`，并分配、保存 `command_id`。
- [ ] firmware 接收并校验 `nod`，调用现有动作能力。
- [ ] firmware 在真实动作完成后返回 `completed`；失败不得伪报完成。
- [ ] Runtime 收到 result，并与原 `command_id` 正确关联。

验证：

- [ ] robot online。
- [ ] robot offline。
- [ ] invalid command。
- [ ] timeout。
- [ ] `command_id` 对应。
- [ ] 重复 `command_id`。
- [ ] WebSocket 断线重连。
- [ ] 连续多条命令。
- [ ] 在真实机器人上观察到点头；从日志确认这条命令未调用小智或 MCP。

通过条件：在线、离线和异常路径结果均明确；真实动作及回执闭环可重复，且完全脱离小智与 MCP 的调用链。

记录：完成日期：—；结论：—；日志/测试结果：—；关联 commit：—。保存每次 `command_id` 与四段耗时：`command sent → firmware received`、`received → behavior started`、`started → completed`、`completed → Runtime received result`。

## Phase 2：DeepSeek Tool Calling 最小实现

Status: TODO

目的：验证文本输入能稳定生成 Tool Call，并复用 Phase 1 的命令执行边界。

最小实现 / Demo：创建最小 DeepSeek Client；按实际 API 能力使用 `deepseek-flash`、默认关闭思考模式并开启 stream。只公开 `perform_behavior(nod)`。输入“点点头”，执行 `Text → DeepSeek → Tool Call → Runtime command → firmware → nod`，再把 Tool Result 回传模型。不要将 Runtime 与 DeepSeek 实现强绑定。

- [ ] 核对调用时 DeepSeek API 对模型、思考模式、stream 和 Tool Calling 的实际支持。
- [ ] 建立最小 Client、`perform_behavior` Schema 与仅允许 `nod` 的参数校验。
- [ ] 接收完整 Tool Call 后立即映射到已有 Runtime command，不等待无关的完整文本回复。
- [ ] 执行后回传 Tool Result，并读取第二轮模型回复。

验证：

- [ ] 普通文本但无需 Tool。
- [ ] 正确 Tool。
- [ ] Tool 参数错误。
- [ ] 不存在的 Tool。
- [ ] 单 Tool。
- [ ] 两个 Tool（顺序/并行先按 API 行为记录，不预设调度）。
- [ ] Tool Result 回传。
- [ ] 第二轮模型回复。
- [ ] API timeout。
- [ ] HTTP error。
- [ ] 网络断开，且错误不得触发未授权动作。
- [ ] 至少 20 次相同条件的测试，统计 P50、P90、P95、Max 与 Tool Call/执行正确率。

通过条件：“点点头”可重复触发真实 `nod`，非 Tool 文本不会误执行；异常有明确结果。记录 `text ready → tool_call_complete`，不以初测的 0.5～0.7 秒代替本次测量。

记录：完成日期：—；结论：—；模型/API 配置、逐次原始时序、统计和失败样例：—；关联 commit：—。

## Phase 3：设备 → EQR7 音频输入链

Status: TODO

目的：先验证真实设备音频能稳定到达 EQR7，再考虑 STT。

最小实现 / Demo：`StackChan microphone → EQR7 → 保存一段 WAV/PCM`；暂不接 STT。

- [ ] 核对麦克风采样格式、sample rate、channel、PCM/Opus 编码及传输位置。
- [ ] 追踪当前 xiaozhi `AudioService` 的采集链，核对 AEC、VAD 是否实际启用，以及 VAD 状态能否独立获得。
- [ ] 在 EQR7 保存可播放录音，记录设备与主机端的格式参数。

验证：

- [ ] 人工播放确认音频正常、无明显爆音、采样率正确。
- [ ] 连续采集 30 分钟；检查断流、内存增长和网络断线恢复。

通过条件：真实设备录音可播放，格式可解释，30 分钟采集及断线恢复有记录；未解决的 AEC/VAD 依赖明确列出。

记录：完成日期：—；结论：—；录音样本、格式、30 分钟日志和资源曲线：—；关联 commit：—。

## Phase 4：VAD 验证与放置决策

Status: TODO

目的：量化说话起止检测的准确性和延迟，优先核对现有能力。

最小实现 / Demo：读现有 xiaozhi 音频链，确认实际运行的 VAD 配置，提取可观察的 `speaking=true/false`、`speech_start/speech_end` 事件；先验证，暂不决定放在 firmware 或 EQR7。

- [ ] 阅读当前 VAD 实现并确认 firmware 是否实际开启。
- [ ] 获取说话状态、开始和结束事件，与人工标注的真实起止时间对齐。
- [ ] 测试安静环境、正常说话、短句、中途停顿、背景音乐和机器人自身播放声音。
- [ ] 基于结果决定 VAD 保留在 firmware，或移到 EQR7；记录复用限制和迁移成本。

验证：逐样本记录漏检/误检及 `真实开始 → speech_start`、`真实停止 → speech_end`；重点统计 speech_end latency。

通过条件：所列场景都有样本和时序，误检/漏检可解释，VAD 放置决策有设备实测依据。

记录：完成日期：—；结论：—；配置、标注、延迟分布、失败样本与决策：—；关联 commit：—。

## Phase 5：STT 候选方案对比

Status: TODO

目的：用 EQR7 和真实 StackChan 录音选第一版 STT，避免只看模型参数。

最小实现 / Demo：做独立 benchmark；至少对 SenseVoiceSmall 与 Streaming Paraformer 建立最小测试，开发时可加入其他候选，不提前指定最终方案。

- [ ] 建立可复跑 STT benchmark，固定音频样本、环境与测量方法。
- [ ] 使用真实 StackChan 录音测试中文短句、机器人指令、普通对话、安静和背景噪音。
- [ ] 覆盖“点点头”“看向左边”“你好”“今天天气怎么样”“帮我把灯打开”。
- [ ] 为每个候选记录模型大小、CPU、内存、首次加载、实时识别速度、`speech_end → final_text`、准确度、streaming 支持与部署复杂度。
- [ ] 基于真实测试选定第一版 STT，并写明取舍。

验证：用相同样本与 EQR7 测量各候选；保存参考转写、实际转写和逐条耗时。

通过条件：至少两个候选的结果可比较，选型有明确的准确度、延迟与资源证据。

记录：完成日期：—；结论：—；样本/benchmark/原始结果与选型依据：—；关联 commit：—。

## Phase 6：STT 接入 Runtime

Status: TODO

目的：把真实音频转成可交给 LLM 的 final text。

最小实现 / Demo：StackChan 上传真实音频；`speech_start` 建立会话，音频进入 STT，`speech_end` finalize，最终文本送入 DeepSeek。

- [ ] 接通真实音频、VAD 会话、选定 STT 和 LLM 请求。
- [ ] 确保每段音频/文本归属正确会话，不把旧结果送进新一轮。

验证：

- [ ] 一句话。
- [ ] 连续多句话。
- [ ] 用户中途停顿。
- [ ] 空白音频。
- [ ] STT 出错。
- [ ] STT timeout。

通过条件：上述输入都有正确文本或明确失败结果；失败后下一轮仍可用。

记录：完成日期：—；结论：—；逐轮 `speech_end → final_text → DeepSeek request start` 时序、错误样例：—；关联 commit：—。

## Phase 7：TTS 候选方案对比

Status: TODO

目的：在 EQR7 上选择第一版 TTS，优先降低首次可播放音频等待时间。

最小实现 / Demo：建立独立 benchmark；候选可包括 Kokoro、MeloTTS、VITS，也可加入其他方案，不预选最终实现。

- [ ] 对短文本、普通句子、长文本和连续调用分别测试。
- [ ] 逐方案记录模型大小、CPU、内存、首次加载、`text submit → first playable audio`、完整生成耗时、RTF、中文自然度、音色、streaming 支持与接入复杂度。
- [ ] 人工听测并保存音频样本；基于实测选定第一版 TTS。

验证：在相同 EQR7、文本与运行条件下重复测量；重点比较首段可播放时间，而非只比较整段生成时间。

通过条件：候选可复现地比较，选型有延迟、资源和中文听感证据。

记录：完成日期：—；结论：—；文本、音频样本、原始时序和选型依据：—；关联 commit：—。

## Phase 8：TTS → StackChan 播放链

Status: TODO

目的：让 EQR7 生成的语音在机器人上可靠播放，并能确认播放结束。

最小实现 / Demo：`EQR7 生成音频 → 传到 StackChan → 播放 → 结束通知`。流式播放仅在需要时作为后续实验。

- [ ] 接通生成、传输、播放与结束回执，明确失败和中断状态。
- [ ] 如考虑流式，测试首段音频生成后立即播放及后续段衔接。

验证：

- [ ] 短句。
- [ ] 长句。
- [ ] 连续播放。
- [ ] 播放中断。
- [ ] 网络断开。
- [ ] TTS 失败。

通过条件：声音可听、结束回执与真实播放一致；中断和失败不会让设备长期占用音频状态。

记录：完成日期：—；结论：—；音频格式、首音频与结束时序、异常日志：—；关联 commit：—。

## Phase 9：无 Tool 的完整语音对话

Status: TODO

目的：先证明语音问答闭环，再加入设备动作。

最小实现 / Demo：`用户说“你好” → VAD → STT → DeepSeek 回复文本 → TTS → StackChan 播放“你好”类回复`；第一版禁用 Tool Call。

- [ ] 连通上述路径并为每轮建立独立会话状态。
- [ ] 验证连续多轮、旧音频不残留、STT/TTS 状态正确，以及失败后恢复。

通过条件：真实机器人可连续完成多轮语音问答；错误不会污染下一轮。

记录：完成日期：—；结论：—；逐轮录音、文本、播放和失败恢复记录：—；关联 commit：—。

## Phase 10：完整语音 + Tool Call

Status: TODO

目的：把已验证的语音链与已验证的 `nod` 命令链合并。

最小实现 / Demo：用户说“点点头” → VAD → STT → DeepSeek → `perform_behavior(nod)` → Runtime → StackChan 点头；按实际对话需要播放“好的”等 TTS。

- [ ] 合并两条链，确保 Tool 参数校验、动作回执及语音会话归属正确。
- [ ] 实测动作与 TTS 各自何时开始，是否可安全并行。
- [ ] 实测 Tool Result 是否需要等待及第二轮 LLM 回复增加的延迟，不提前固定策略。

验证：重复真实语音指令，核对每轮动作次数、Tool Result 和 TTS 内容；包含失败/超时一轮后的恢复。

通过条件：语音能稳定触发一次正确动作，回执对应同一会话；并行或等待策略由实测与安全边界支持。

记录：完成日期：—；结论：—；会话时序、动作/TTS 重叠与第二轮耗时：—；关联 commit：—。

## Phase 11：端到端延迟与稳定性

Status: TODO

目的：判断完整方案在真实设备上是否达到可接受的交互速度和稳定性。

最小实现：统一 trace/session ID 与时间基准；跨设备时间戳需校准或记录时钟偏差。采集 `speech_start`、`speech_end`、`stt_final`、`llm_request`、`first_tool_call`、`tool_call_complete`、`command_sent`、`command_received`、`behavior_started`、`behavior_completed`、`tts_request`、`tts_first_audio`、`tts_complete`。

- [ ] 至少完成 20 次基础测试与 100 次稳定性测试，记录每次成功/失败与环境。
- [ ] 计算 `speech_end → first robot action`、`speech_end → first robot audio`、`speech_end → tool_call_complete`、`speech_end → complete response`。
- [ ] 对各指标统计 P50、P90、P95、Max 和 Failure Rate；分开报告动作/语音路径。

验证：原始事件可复算统计，失败样本有原因分类；测试覆盖真实 EQR7、网络和机器人。

通过条件：完整结果与失败率可复查，是否继续当前方案由实测结论明确决定；不预设性能阈值。

记录：完成日期：—；结论：—；原始 trace、统计、设备/网络条件与失败分类：—；关联 commit：—。

## Phase 12：EQR7 资源占用

Status: TODO

目的：验证无独显的 EQR7 能承受 STT、TTS、DeepSeek Client、Runtime 与其他现有服务共同运行。

最小实现：在实际部署环境测 Idle、STT only、TTS only、STT + TTS、完整对话及连续 1 小时。

- [ ] 每种场景记录 CPU、RAM、Load Average、单核瓶颈、温度和延迟变化。
- [ ] 检查长运行内存增长、热降频、失败与恢复情况。

验证：记录进程归属、采样间隔及测试负载；对比单独运行和并行运行的延迟。

通过条件：资源瓶颈和实际容量明确；如需优化，列出可验证的优先级，不先指定优化方案。

记录：完成日期：—；结论：—；监控曲线、负载说明、延迟对比：—；关联 commit：—。

## Phase 13：异常与恢复

Status: TODO

目的：单个外部服务失败时，机器人仍可恢复到可继续交互的状态。

最小实现：为每类失败给出有限超时、错误结果、资源释放及恢复路径。

- [ ] StackChan 断线。
- [ ] Wi-Fi 重连。
- [ ] EQR7 Runtime 重启。
- [ ] DeepSeek API 不可用。
- [ ] STT 崩溃。
- [ ] TTS 崩溃。
- [ ] Tool timeout。
- [ ] 音频传输中断。

验证：逐项注入故障，确认命令/会话最终有明确状态，设备资源释放，服务恢复后下一轮可成功。

通过条件：没有一种已测故障让机器人永久卡在异常状态；未覆盖故障清楚列出。

记录：完成日期：—；结论：—；故障注入步骤、日志、恢复耗时：—；关联 commit：—。

## Phase 14：逐步退役旧方案

Status: TODO

目的：仅在新链路稳定且功能有替代后，移除旧方案依赖。

最小实现：先列出旧入口的真实调用方与替代证据；以下每一项单独提交、单独验证，不能一并删除。

- [ ] 确认小智 Agent 不再需要。
- [ ] 确认 MCP 不再需要。
- [ ] 确认 MCP 中有价值的硬件能力已迁移并验证。
- [ ] 确认 STT 已替代旧语音识别。
- [ ] 确认 TTS 已替代旧语音输出。
- [ ] 停用旧入口。
- [ ] 删除 MCP 注册。
- [ ] 删除小智 Agent 页面。
- [ ] 删除小智配置。
- [ ] 清理小智 server 代理。
- [ ] 评估 `xiaozhi-esp32` 依赖是否还能进一步减少；保留仍需的硬件/音频能力。

验证：每次提交都检查构建、实际启动、设备动作/语音、相关 App/Server 入口和回退方法。

通过条件：新路径覆盖实际需要的能力；删除项无活跃调用或有已验证替代，且每笔提交可单独回退。

记录：完成日期：—；结论：—；逐项依赖/替代证据、验证结果和各自 commit：—。

## Pending Decisions

以下问题保留未决；在对应 Phase 的实测后填写决策、证据和日期。

- [ ] VAD 最终在 firmware 还是 EQR7（Phase 4）。
- [ ] 第一版 STT 及是否使用流式 STT（Phase 5–6）。
- [ ] 第一版 TTS 及是否使用流式 TTS（Phase 7–8）。
- [ ] 设备与 EQR7 间的音频传输格式（Phase 3、8）。
- [ ] Tool Result 是否总是返回 LLM；多 Tool 如何调度（Phase 2、10）。
- [ ] 是否保留旧 App、Go `server/`、ESP-NOW Remote（Phase 14 前按产品需求确认）。

记录：决策日期：—；证据/测试结果：—；关联决策文档或 commit：—。
