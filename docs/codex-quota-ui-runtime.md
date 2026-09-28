# Codex 额度提示与 API Service 本地发送

本实现只改变桌面运行时行为，不修改官方安装包、服务端额度、账号凭据或模型请求内容。

## 两项独立功能

- 提示隐藏沿用实例的 hideNativeQuotaBanner 偏好。API Service 默认开，其余桌面绑定可以显式开启。
- 本地发送解锁在 API Service 桌面实例自动启用，不依赖隐藏开关，也不要求某个 banner_type。
- API Service 及上游仍可返回 429、401、403、账号池错误或流式错误；按钮解锁不等于请求成功。

提示识别从 Composer 内的 aside 出发，支持直接 banner、rate_limit_reached_type、
rate_limit_upsell、usageBannerProps 的个人／工作区额度原因。允许跨越该提示专属的包装容器。
无法读取语义时使用明确的中英文额度标题兜底；显式非额度类型优先，图片、Reserve、安全和环境提示不批量隐藏。
保留 inline display 与 priority、节点复用恢复、Observer 清理和 30 秒失联恢复。

## 发送解锁

定位器来自 https://github.com/1zero224/codex-input-unlock，
固定 commit fbc04a3032766918556168d9b27e74da8d863bb1。
codex_input_unlock_gate.cjs 保留原版定位器，MIT 许可随应用打包于 licenses/CodexInputUnlock-LICENSE.txt。
借鉴三个模式：codex-local-quota、legacy-local-host、third-party-composer-dual。

Rust 在实例自己的 loopback CDP 上维护持久 Debugger 会话，读取实际脚本、计算位置、
查询可执行断点并安装返回 false 的条件断点。只将匹配到的局部额度变量设为 false；
不强改最终 submitDisabled，不移除 DOM disabled，不修改共享 rate-limit-status 查询缓存。
不引入独立 Node 守护进程、固定端口、快捷方式或 Computer Use 环境变量。

每个匹配 Renderer 独立管理。刷新、断线后重新定位；停止、改绑、关闭应用时清理断点与连接。
无法定位时保留官方行为并记录 not-matched，不使用未知变量或猜测位置。

## 诊断仅写日志

应用数据目录下 logs/codex-quota-ui.log.YYYY-MM-DD 为独立滚动日志，正式版与开发版均启用，
沿用应用现有 3 天清理策略。没有新增页面状态、徽章或诊断弹窗。

- [Quota Banner]：enabled、roots、candidates、semantic、text、unmatched，执行失败和无 Renderer。
- [Input Unlock]：启用状态、目标数量、armed、定位模式与实际行列、重载／连接错误、停止清理。
- 状态变化即时记录；正常运行使用低频心跳。无凭据、原始 JS、页面正文或对话内容。
- armed 仅表示断点安装就绪，不声明发送成功；结合 codex-api.log 的真实请求结果验收。

## 验证

前端使用 tests/codexNativeQuotaBanner.test.ts 和 tests/codexInputUnlock.test.ts。
后者用独立 V8 Inspector 会话验证条件断点不暂停、只清除额度项，并保留空输入／上传项和移除后的原始行为。
Rust input_unlock_tests 覆盖条件构建及 CDP 行为。正式验收仍需真实的额度耗尽账号配合可用 API Service，
检查新／旧会话、刷新、多窗口、停止重启和上游报错；自动测试不能替代这一步。

2026-09-28 本机验证：43 项额度 UI／指纹／发布回归通过，TypeScript 检查、Vite 构建、
Rust 主库与测试目标检查通过；定位器唯一匹配 Windows 官方包 26.924.2738.0。
4 项 Rust input_unlock_tests 的可执行文件成功生成，但 Windows 加载返回
0xC0000139（STATUS_ENTRYPOINT_NOT_FOUND），测试正文未运行，不能记为通过。
测试使用独立 target/quota-ui-test-data 路径；未对真实账号发送请求、未安装独立解锁工具。
