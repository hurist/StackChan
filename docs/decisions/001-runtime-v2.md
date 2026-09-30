# 001：转向 Robot Runtime + Tool Calling

## 决策

未来主方向从“小智 Agent / MCP 主链”转向“Robot Runtime + Tool Calling”。Robot Runtime 运行在 EQR7，设备能力由 StackChan 执行。

## 原因

- Codex + MCP 的思考、生成、调用和执行链路用于实时控制时延迟过高。
- 小智 Agent 的自定义能力需要扩展 firmware，且与官方服务的兼容、绑定及普通用户 API Key 可用性存在限制。
- 机器人能力需要由自有 Runtime 掌握，LLM 需要可替换。
- 设备层、Runtime 与 LLM 需要清晰边界。

## 当前状态

这是架构方向决策，不代表新 Runtime 已经完成实现。旧路径在完成替代和验证前保留。
