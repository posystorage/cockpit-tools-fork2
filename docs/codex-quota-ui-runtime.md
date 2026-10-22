# Codex 额度提示、显示兼容与 API Service 本地发送

本实现改变桌面页面的运行时行为，不修改官方安装包、服务端额度、账号凭据或模型请求内容。

## v1.3.73 的三个独立行为

API Service 桌面实例自动解除本地 Composer 的重复额度门禁。该行为不依赖以下两个显示开关，
也不要求命中某一种 banner_type。请求仍可能返回真实的 429、401、403、账号池或流式错误。

“隐藏 Codex 官方额度提示”沿用实例的 `hideNativeQuotaBanner` 可选偏好：API Service 默认开，
其他桌面绑定默认关，用户显式值优先。只控制匹配提示的显示。

“额度显示兼容”使用新增的 `quotaDisplayCompatibility` 可选偏好，默认关闭，旧配置缺失按关闭处理。
入口在 API Service 桌面启动预览中，按实例保存，与提示隐藏独立。其他 Provider 的上游全局增强设置保留。

| 提示隐藏 | 额度显示兼容 | API Service 桌面行为 |
| --- | --- | --- |
| 关闭 | 关闭 | 保留原始额度状态与提示；本地发送解锁 |
| 开启 | 关闭 | 隐藏匹配的额度提示，保留原始额度状态；本地发送解锁 |
| 关闭 | 开启 | 兼容主额度允许／阻止状态，提示读取原始快照；本地发送解锁 |
| 开启 | 开启 | 兼容主额度允许／阻止状态，并隐藏匹配提示；本地发送解锁 |

兼容仅把主 `rate-limit-status` 中的 `rate_limit.allowed` 设为 true、`limit_reached` 设为 false。
不增加剩余额度，不改用量数字、credits、spend_control、图片额度、真实路由或上游响应。
保留 `rate_limit_upsell`、`rate_limit_reached_type` 等提示依据。关闭兼容、停止注入或替换运行时 owner 时，
恢复能追踪到的原始缓存值、`setQueryData` 方法和订阅；新的服务端数据仍照常接收。

CLI 不执行桌面注入。Go/Rust 切换不改变两个实例偏好；Go 继续默认，新增官方授权仅支持 Rust。
长期维护边界见 [Fork 维护指南](fork-maintenance-guide.md#20-v1373-升级施工边界2026-10-22)。

## 提示识别与恢复

fork 的提示 Observer 是唯一 DOM 隐藏入口。识别从 Composer 内的 aside 出发，支持直接 banner、
rate_limit_reached_type、rate_limit_upsell、usageBannerProps 的个人／工作区额度原因，允许跨越提示专属包装容器。
无法读取语义时使用明确的中英文额度标题兜底；显式非额度类型优先，图片、Reserve、安全和环境提示不批量隐藏。
保留 inline display 与 priority、节点复用恢复、Observer 清理和 30 秒失联恢复。

启用显示兼容可能让原生 React 渲染器因 allowed=true 而自行省略提示。因此在同一 CDP 会话中增加两个
原生提示位置的条件断点，把该次渲染的局部 usage 引用切回原始快照；共享缓存保持用户选择的兼容状态。
不替换 React 组件、不改写安装文件，也不依赖页面重载来恢复提示。

## 发送解锁与 CDP 生命周期

v1.3.73 复用上游 `codex_app_enhancements` 的 live-quota 流程，读取当前页面 app-initial/app-primary 脚本，
按结构定位 Composer、两个额度局部变量和提示渲染位置；Rust 再校验本地资源 URL、标识符及行列范围。
匹配失败时保留官方行为并记录原因，不猜测压缩变量或位置。

每个 Renderer 使用实例自己的动态 loopback CDP，会话包含一个发送断点及两个提示断点。
发送断点只把局部额度阻塞项设为 false，并返回 false 避免暂停；空输入、上传中、提交中等其他禁用项保留。
不覆盖最终 submitDisabled，不移除按钮 disabled。刷新、上下文重建、断线后重新定位；停止、改绑或退出时
统一移除断点、页面注册钩子和连接。不额外启动 Node 守护进程，不修改快捷方式、Computer Use 环境变量、
app.asar 或 WindowsApps ACL。

旧 `codex_input_unlock_gate.cjs` 来自 1zero224/codex-input-unlock 的固定 commit
fbc04a3032766918556168d9b27e74da8d863bb1，MIT 许可仍随应用打包于 licenses/CodexInputUnlock-LICENSE.txt。
它属于历史实现来源，当前 API Service 路径不叠加第二套解锁监督循环。

## 诊断与验证

提示及发送解锁诊断写入 `logs/codex-quota-ui.log.YYYY-MM-DD`，增强流程转发准备、激活和清理原因。
正式版与开发版均可用，不新增页面徽章或诊断弹窗。仅记录目标、定位、开关与状态元数据，
不记录凭据、原始 JS、页面正文或对话内容；armed 只表示断点就绪，需要结合真实 API 请求结果验收。

自动检查覆盖两个显示开关四种组合、旧字段缺失、显式 false/true、实例保存和回滚、缓存方法／订阅恢复、
图片和非额度状态保留，以及 V8 Inspector 下条件断点不暂停、发送门禁与原生提示快照的独立行为。
主要用例位于 `codex_app_enhancements/quota.test.cjs`、`fast_tests.rs`、启动预览和实例模型测试。
本轮完整结果见 [v1.3.73 合并审计](upstream-v1.3.73-review.md)。

真实验收仍需额度耗尽账号和可用 API Service，检查新／旧会话、刷新、多窗口、停止重启、改绑、四种开关组合，
并核对可用上游成功、不可用上游按原样报错。自动测试不能替代实际 Codex Desktop 验收。

历史记录：2026-09-28 已验证旧定位器匹配 Windows 官方包 26.924.2738.0；该证据不代表 v1.3.73 新流程
已在当前官方包验收。该次 Rust 测试可执行文件在断言前因 0xC0000139 加载失败，也不计为运行通过。
