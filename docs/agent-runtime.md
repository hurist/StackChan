# Agent / Robot Runtime 职责

> 这是职责说明，不表示新 Runtime 或下述调用链已经实现。

## Robot Runtime 的职责

Robot Runtime 接收机器人输入，调用 STT 与 LLM，向 LLM 提供 Tool Schema，接收 Tool Call，由本地 Tool Handler 执行，调用 StackChan 能力，处理执行结果，调用 TTS，并管理必要状态。

## Tool Calling 流程

```text
用户输入
↓
Robot Runtime（按输入类型调用 STT）
↓
LLM
↓
Tool Call
↓
Robot Runtime → 本地 Handler → StackChan
↓
执行结果 → Robot Runtime → LLM
↓
Robot Runtime（按需要调用 TTS）→ StackChan
```

Tool Schema 是给 LLM 看的工具说明；Tool Handler 是 Runtime 中真正执行的代码。工具的具体清单、参数和设备协议留待后续确定。

## 实时性原则

- Tool Call 完整后尽快执行，不等待不必要的完整回复。
- 简单实时逻辑优先在本地处理。
- 不把舵机帧级控制交给 LLM。
- 多步骤流程由 LLM 还是 Runtime 编排，后续按实际需求决定。
