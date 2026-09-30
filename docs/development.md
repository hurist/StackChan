# 开发基础信息

> 本文只记录当前开发边界与已知硬件，不代表 runtime-v2 已可运行。

## 硬件

- Runtime 目标主机：EQR7，Ryzen 7 7735U，24GB RAM，无独显。
- 机器人：StackChan / M5Stack。

未来性能方案须以 EQR7 上的实际测量为前提。STT、TTS、Vision 的技术选型尚未确定。

## 仓库模块

| 目录 | 当前定位 |
| --- | --- |
| `firmware/` | StackChan 设备固件及硬件能力。 |
| `HomeServer/` | 现有设备连接与远程控制原型。 |
| `server/` | 既有 StackChan 产品后台。 |
| `app/` | 既有移动 App。 |
| `remote/` | 独立遥控器固件。 |

各模块现有构建和运行方法以其 README 与实际配置为准。仓库现状可查阅[2026-09-30 审计快照](archive/project-audit-2026-09-30.md)，但实施前需重新核对代码。

## 后续开发边界

新开发优先在 `runtime-v2` 分支进行。旧 `server/`、小智及 MCP 代码目前仍可能被现有路径使用；有明确替代与验证之前不要删除。本阶段只建立方向文档，不新增 Runtime 代码框架。
