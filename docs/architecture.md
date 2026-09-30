# runtime-v2 架构方向

> 本文记录已确认的高层方向；Robot Runtime 尚未在本仓库实现。现有运行路径以代码和[历史现状审计](archive/project-audit-2026-09-30.md)为准。

## 核心角色

### StackChan

机器人设备端负责音频输入输出、显示、动作、传感器、网络通信，以及必要的设备端实时逻辑。

### Robot Runtime

运行在 EQR7，负责协调 StackChan、STT、LLM、Tool Calling、TTS、外部能力、必要状态及设备控制。具体组件和接口尚待设计与验证。

### LLM

负责自然语言理解、对话、高层意图判断、Tool 选择和 Tool 参数生成。LLM 不直接控制底层舵机或实时硬件细节。

## 架构原则

```text
LLM 负责“做什么”
Runtime 负责“怎么执行”
StackChan 负责“真正执行”
```

- 不再以 MCP 作为主要实时调用链。
- 不再依赖小智 Agent 作为核心 Runtime。
- Robot Runtime 与具体 LLM 解耦；当前重点测试 DeepSeek，但不将其写成唯一模型。
- firmware 与具体 LLM 解耦。
- 尚未讨论确定的功能、协议与技术选型不提前写死。
