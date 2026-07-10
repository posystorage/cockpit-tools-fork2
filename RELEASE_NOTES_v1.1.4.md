# Cockpit Tools Fork v1.1.4

简体中文 · [English](#changelog-english)

> 本说明汇总上游 Cockpit Tools `v1.1.1` 至 `v1.1.4` 的功能更新，以及本 fork 当前仍实际保留的独立改动。
> 本 fork 为纯本地构建：不加载公告、广告、推广或运行时更新内容。

## 更新日志（中文）

## [1.1.4] - 2026-07-10

### 新增

- **兼容官方 Codex 客户端更名为 ChatGPT**：Windows 和 macOS 的启动路径检测、Store/Appx 发现、进程扫描、窗口定位和 app-server 解析同时兼容 ChatGPT 与旧 Codex 客户端。
- **支持最新 Codex 5.6 模型**：API 服务、受管官方客户端模型目录和唤醒预设均加入 `gpt-5.6-sol`、`gpt-5.6-terra` 与 `gpt-5.6-luna`；已有用户会补齐默认预设，同时保留自定义预设。
- **显示 Codex API 服务当前调度账号**（Fork）：账号页和 API 服务页可展示正在处理请求的账号、最近调度账号、模型、路由策略及请求状态，便于排查账号池调度。

### 变更

- **完善 Codex 5.6 模型目录元数据**：为三个 5.6 模型保留显示名称、排序、默认及支持的推理强度、Ultra 能力和 priority 服务层级。
- **Codex OAuth API 服务更贴近官方客户端**：OAuth 文本对话不再注入 hosted `image_generation` 工具；图片接口仍可用，API Key 账号的既有图片生成行为不变。
- **已接管的官方客户端 profile 会持续刷新受管模型目录**，使更新后的模型目录继续同步至客户端。
- **Codex 唤醒与 API 服务模型列表延续 GPT-5.4+ 策略**：旧的 GPT-5.1 至 GPT-5.3 默认预设会被迁移清理，官方唤醒测试默认回退为 `gpt-5.4`。
- **Antigravity 套件导航保持一致**：应用多开、唤醒任务和唤醒验证保持在 Antigravity 套件上下文内。
- **中文术语统一**：中文界面、文档、公告和运行时提示统一使用“应用多开”。
- **纯本地运行策略**（Fork）：公告、广告、赞助/推广、远端配置和运行时更新检查、下载、安装及提示均保持禁用；发布构建仅创建草稿 release，不自动发布为 Latest。
- **发布流程统一使用标准标签**（Fork）：正式发布使用 `vX.Y.Z` 版本标签（本次为 `v1.1.4`）；草稿构建允许使用当前版本加字母后缀的标签，便于验证而不会自动发布为 Latest。

### 修复

- **修复通过代理访问 `chatgpt.com` 的流式 TLS 兼容问题**：Codex 上游请求改用标准 Go HTTP Transport，避免自定义 uTLS HTTP/2 连接可能出现的 `tls: bad record MAC`。
- **修复官方 `image_gen.imagegen` 与 hosted `image_generation` 并存时的冲突**：Rust 网关和 Go sidecar 会移除冲突的 hosted 图片工具及其 `tool_choice`。
- **修复 Cockpit 与 Codex API 服务的 token 刷新权威冲突**：由 Cockpit 刷新的 token 会写穿到 sidecar 认证文件，降低 `refresh_token_reused` 失败概率。
- **优化大量 Codex 账号时 API 服务的启动、关闭和应用退出性能**：避免无变化认证文件重复写入，关闭时不为停服而启动网关，退出时异步清理网关。
- **修复 Codex 导入丢失敏感备注字段**：JSON、auth 文件、批量导入及 token 导入均保留密码、2FA 秘钥、手机号、邮件查询地址和备注。
- **修复账号选择与标签编辑体验问题**：减少下拉菜单和应用多开选择器抖动；切换账号编辑标签时正确重置标签和备注；提升深色模式标签筛选可见性。
- **修复 Sub2API 用量与余额回退**（Fork）：根路径用量接口失败时回退至 `/v1/usage`，支持字符串数值解析，并在界面中按 `remaining → balance → quotaRemaining` 回退展示余额。
- **提升 Codex 配额状态一致性**（Fork）：修正配额刷新结果保留与确认时套餐类型比较，避免刷新结果或确认状态不一致。

---

<a id="changelog-english"></a>

## Changelog (English)

## [1.1.4] - 2026-07-10

### Added

- **Compatibility with the official Codex client rename to ChatGPT**: Windows and macOS launch-path detection, Store/Appx discovery, process scanning, window focus, and app-server resolution now support both ChatGPT and legacy Codex clients.
- **Latest Codex 5.6 model support**: API Service, managed official-client model catalogs, and wakeup presets include `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. Existing default presets are completed without replacing custom presets.
- **Active Codex API account scheduling visibility** (Fork): account and API Service pages show running and recently selected accounts, models, routing strategy, and request state for account-pool diagnostics.

### Changed

- **Completed Codex 5.6 model-catalog metadata**: the three 5.6 models retain display names, ordering, default and supported reasoning efforts, Ultra capability, and priority service-tier metadata.
- **Codex OAuth API Service behavior is closer to the official client**: OAuth-backed text conversations no longer inject hosted `image_generation`; image endpoints remain available and API Key image-generation behavior is unchanged.
- **Managed official-client profiles refresh their model catalog when needed**, keeping updated models synchronized to the client.
- **Codex wakeup and API Service model lists continue the GPT-5.4+ policy**: legacy GPT-5.1 through GPT-5.3 defaults are migrated away and the official wakeup fallback is `gpt-5.4`.
- **Antigravity navigation remains suite-consistent** for multi-instance management, wakeup tasks, and wakeup verification.
- **Chinese terminology is unified**: the Chinese UI, documentation, announcements, and runtime messages consistently use the “应用多开” term for app multi-instance management.
- **Pure-local runtime policy** (Fork): announcements, ads, sponsors/promotions, remote configuration, and runtime update checks, downloads, installation, and prompts remain disabled. Tag builds create draft releases and do not publish a Latest release automatically.
- **Standardized release tagging** (Fork): formal releases use standard `vX.Y.Z` tags; draft builds may use the current version followed by a letter-prefixed suffix for verification, without being published as Latest.

### Fixed

- **Improved streamed request compatibility through proxies to `chatgpt.com`**: Codex upstream traffic uses the standard Go HTTP Transport, avoiding possible `tls: bad record MAC` failures from custom uTLS HTTP/2 connections.
- **Fixed conflicts between official `image_gen.imagegen` and hosted `image_generation` tools**: the Rust gateway and Go sidecar remove the conflicting hosted tool and its `tool_choice`.
- **Fixed token-refresh authority conflicts between Cockpit and Codex API Service**: Cockpit-refreshed tokens are written through to sidecar auth files, reducing `refresh_token_reused` failures.
- **Improved API Service startup, shutdown, and app-exit performance for large Codex account pools** by avoiding unchanged auth-file writes, unnecessary gateway starts, and blocking cleanup.
- **Fixed sensitive Codex note fields being dropped during import** for JSON, auth-file, batch, and token-based imports.
- **Fixed account-selection and tag-editing UX issues**: reduced dropdown and multi-instance picker jitter, reset tag-edit state per account, and improved dark-mode tag-filter visibility.
- **Fixed Sub2API usage and balance fallback** (Fork): falls back to `/v1/usage`, accepts numeric strings, and displays balances through `remaining → balance → quotaRemaining` fallback.
- **Improved Codex quota-state consistency** (Fork): preserves quota refresh results and compares plan types correctly during confirmation.
