# Fork 维护与上游升级指南

本文是 `posystorage/cockpit-tools-fork2` 的长期维护入口。后续同步上游时，应先阅读本文并按检查表处理，不再通过通读整个仓库来猜测 fork 的意图。

## 1. 文档目标与事实来源

本 fork 只长期维护四组产品行为：

1. 禁用广告、赞助推广、远端公告、远端开关和运行时自动更新。
2. 为 Codex API 服务提供只读的当前/最近账号调度观测；普通 Codex 页对所有仍存在账号显示窗口内 API 用量，独立 API 页提供可滚动的时间范围统计。
3. 保留并增强自定义 API Provider 的上游计费、用量和余额查询，重点兼容 Sub2API。
4. 维护 Codex API 服务的官方价格基线、历史账号统计，以及用户显式控制的最低优先级兜底暂停能力。

除此以外，原则上跟随上游。发布工作流、fork 下载地址、签名密钥和免责声明属于交付差异，不应扩张成新的产品分叉。

事实来源按优先级排序：

1. 当前代码与测试。
2. 本文列出的行为不变量和边界。
3. Git 历史中的原始 fork 提交。
4. 旧 Codex 会话和迁移报告。

旧会话只用于解释意图，不能代替代码审计。用户提供的参考会话号 `019f5b0b-d3dd-70d2-ae54-5845e117b2e6` 在本机索引中没有完全匹配；对应可读取的“升级施工队”会话是 `019f5b0e-30d2-7920-980b-611d4f598f2b`。该会话确认了以下长期原则：精细去广告、不做全局联网黑名单、保留正常 Provider/API 能力、只清理推广性质的品牌和链接、把 502/代理/sidecar/额度刷新问题与去广告改动分开调查。

## 2. 当前基线与历史锚点

### 2.1 `v1.3.21` 已验证基线（2026-08-16）

本轮计划从已验证 fork `1.3.16b1`（`96b0a61e`）升级到上游 `v1.3.21`（annotated tag 指向 release commit `971c283e`），merge-base 为已合并的上游 `v1.3.16` release commit `e1ef55ce`，升级分支为 `codex/upgrade-upstream-v1.3.21`。合并前工作区干净；`v1.3.16..v1.3.21` 共 50 个提交、184 个文件，净变化为 31498 行新增、3430 行删除。release 链重点如下：

- `v1.3.17`：DeepSeek 原生 Responses、OAuth 指纹模式、API Key 按客户端限制 token、API 服务直接移除成员、Sub2API 完整 OAuth 导入及多轮/流式修复。
- `v1.3.18`：按模型设置上下文窗口、启动进度、API 服务账号窗口用量、会话用量及官方 OAuth 出站身份调整。
- `v1.3.19`：额度标签紧凑化。
- `v1.3.20`：MiniMax/智谱 token 套餐额度、OpenCode Go/OpenRouter 预设、Provider API Key 编辑、根 URL `/v1` 用量回退、reasoning effort 日志及账号组持久化修复。
- `v1.3.21`：实验模型目录与扁平化、即时保存的 Codex 设置。

`1.3.21b4` 不合并上游新版本，只承载 fork 相对 `1.3.21b3` 的维护修正：普通 Codex 页的现存账号窗口统计、Auto-review Luna 价格簿迁移与历史重算、独立 API 页滚动统计，以及本指南的边界补充。后续上游升级应把这些内容视为必须回归的 fork 不变量。

`git merge-tree` 预演确认六个显式冲突文件，施工裁决如下：

- `Casks/cockpit-tools.rb`：继续保持 fork 删除状态。
- `src-tauri/src/commands/codex.rs`：接受上游 DeepSeek、MiniMax/智谱、上下文窗口和 token limit；保留 fork 的 Sub2API `/usage` -> `/v1/usage` 候选、数字字符串兼容与 `NaN`/Infinity 非有限值拒绝。
- `src-tauri/src/modules/codex_account.rs`：接受上游 DeepSeek 与实验模型逻辑；继续保持 `CODEX_COCKPIT_API_BASE_URL`、`APIKEY_FUN_PROVIDER_BASE_URL` 为空，并保留中性测试 URL。
- `src-tauri/src/modules/codex_local_access.rs`：合并 fork 的 `CodexLocalAccessAccountActivity` 与上游账号窗口查询/统计 import；接受上游 token limits、账号窗口、上下文窗口、官方身份及 reasoning 元数据，同时保留 running request/account activity 的 selected/finish 生命周期。
- `src/services/modelProviderUsageService.ts`：接受上游通用根地址和 `/v1` 回退，以及 `deepseek`/`token_plan` 模式；不恢复品牌专属前端路径，后端 fork 的 `/usage`/`/v1/usage` 仍作为附加兼容层。
- `src/utils/codexProviderPresets.ts`：接受 DeepSeek、OpenCode Go、OpenRouter 目录更新；保持 `COCKPIT_API_BASE_URL` 为空，继续通过 `RAW_CODEX_API_PROVIDER_PRESETS` 和 `neutralizeProviderPresets()` 输出中性运行时预设。

预演还发现一个 Git 不会报告的语义冲突：`src/pages/CodexAccountsPage.tsx` 会自动合并出两个同名 `handleRemoveLocalAccessAccount`，导致 TypeScript 重复声明。施工时只保留上游新的原子后端删除命令，删除 fork 旧的“读取并重写整个集合”处理器。后端 `remove_account_refs_from_collection()` 已确认只移除目标账号的集合 ID、API Key scope/优先级、自定义路由、账号模型规则及必要的 OAuth 绑定；其余账号的 preferred/backup、session affinity 配置和 TTL 不受影响。对应测试必须改为断言原子服务调用以及不存在重复处理器。

预演树中的 fork 长期边界均仍存在：去广告与赞助硬开关、空公告/远端配置/商业默认 URL、禁用运行时 updater 与更新 UI、fork updater 身份、draft-only Windows release，以及普通 Codex 页完整账号池、内部滚动、运行中/最近调度排序、最高/最低标记和服务运行时五秒轮询。Sidecar 的 `recordingSelector` 仍包住模型排除、备用、额度保留、图片选择和 session affinity 整条 selector 链，`cockpitSelector.Pick()` 没有恢复直接发送 `auth_selected`。

当前 fork 的 Release workflow 只发布 Windows 草稿构建；macOS Apple Silicon、macOS Intel、macOS Universal 和 Linux job 均保持禁用。上游若重新启用这些平台，合并时必须先确认草稿 tag、Release 上传目标和签名资产策略，不得因上游并行构建改动而自动恢复 macOS 构建。

发布说明也属于 fork 的交付不变量：一次升级若跨越多个上游版本，草稿 Release 的中英文说明必须按降序完整包含本次合并范围内的每个版本章节；若同时包含 fork beta 修正，还要单独纳入对应 beta 章节。不能只提取最终版本，也不能因上游 workflow 改动而丢失中间版本或 fork 自定义变更。

本轮已接受上游新增能力，没有恢复被上游替代的旧实现。真实合并与预演一致，只出现上述六个显式冲突；隐藏的重复 `handleRemoveLocalAccessAccount` 也按计划处理为唯一的上游原子删除调用。前端测试断言不得存在重复处理器，Rust 测试进一步确认删除目标账号后，剩余 preferred 路由、session affinity 和 TTL 保持不变。数值兼容测试同时覆盖数字字符串以及 `NaN`、`Infinity`、`-Infinity` 拒绝。

真实合并提交为 `9ba91304`，父节点是 fork 施工文档提交 `4a3881a7` 与上游 release commit `971c283e`。合并后相对纯上游 `v1.3.21` 保留 75 个差异文件、3560 行新增和 850 行删除，差异集中在本文记录的去广告/更新边界、发布身份、调度观测、余额兼容、回归测试及历史维护文档，没有出现与 fork 目标无关的大面积旧代码保留。

本轮自动化验收结果：

- TypeScript `tsc --noEmit` 通过；版本同步无额外修改；Vite 生产构建通过，共转换 2200 个模块。
- Provider 运行时隐私扫描通过，共检查 155 个预设。普通 Codex 卡片的完整成员渲染、内部滚动、活动排序、优先级标记及原子移除，Provider 根地址 `/v1` 回退和草稿 release 边界等定向 Node 测试通过。
- Node 24 自动发现测试结果为 `132 passed / 3 load failures`。三个失败均发生在测试模块加载阶段：`codexDeepSeekAccess.test.ts`、`codexProviderPresets.test.ts` 和既有 `codexQuotaPool.test.ts` 无法由原生 Node 解析应用源码中的无扩展名 ESM import；相同源码已通过 TypeScript、Vite 生产构建和 Provider 运行时扫描，不修改业务 import 规避测试运行器限制。
- `cargo test -p cockpit-tools --lib` 使用 `target/test-data-v1321` 隔离数据目录执行，结果为 `839 passed / 0 failed / 2 ignored`。补强后的非有限数与原子删除保留测试又分别定向复跑通过。
- 本机没有 Go。Rust 测试使用已忽略的目标名占位文件和 `COCKPIT_SKIP_CLIPROXY_BUILD=1` 跳过 Sidecar 构建，占位文件已在测试后删除。Sidecar 源码复核确认 `recordingSelector` 仍是完整 selector 链的最外层，现有 affinity cache-hit 测试仍在；发布 CI 必须真实编译并运行 Go 测试。
- 去广告/商业 URL 常量、updater 禁用开关、fork 签名与下载地址、draft-only Windows workflow 均已复核。模型与能力价格设置继续采用上游可选空值行为，中文错误提示明确“Token 阈值可留空”，未恢复旧的必填限制。
- `cargo fmt --check`、索引与工作区 `git diff --check` 通过，无冲突标记或测试占位文件残留。

### 2.2 `v1.3.31` 已验证基线（2026-08-27）

本轮从已验证 fork `1.3.28b1`（`08cb9eec`）升级到上游 `v1.3.31`（release commit `3bafe717`），沿用升级分支 `codex/upgrade-upstream-v1.3.21`。施工采用 `git merge --no-commit --no-ff v1.3.31`，已完成双父 merge commit（父节点为 `08cb9eec` 与 `3bafe717`）；上游随后出现的 `v1.3.32` 不属于本轮范围。

本轮同步的上游能力按版本归纳如下：

- `v1.3.29`：统一 Codex 启动预览、设备代码授权、历史会话 Provider 迁移、Live/Realtime API、Responses WebSocket 和扩展模型目录。
- `v1.3.30`：按有效 access token 与官方检查结果判断客户端可用性，并补充多开账号占用提示。
- `v1.3.31`：删除账号 tombstone/generation 与旧快照拒绝、重新授权保护、`accounts/check` 仅在真正切号时调用、生图工具冲突修复、Responses Lite/WebSocket 工具兼容和 Gemini/Cursor 修复。

施工裁决与 fork 不变量如下：

- 接受上游 Codex 删除、重授权、启动、会话、模型和生图逻辑；这些状态变更不参与 API Service 调度观测。`accounts/check` 不会被重新接入普通启动路径。
- 完整采用上游 `CLIProxyAPI v7.2.140`，唯一供应商源码目录仍是 `sidecars/cockpit-cliproxy/third_party/CLIProxyAPI`。fork 的 `recordingSelector` 继续包在模型排除、备用账号、额度保留、图片选择和 session affinity 选择链之外层，负责唯一一次 `auth_selected` 事件和 cache-hit 调度观测；上游新增 sidecar 网关不会覆盖或改变路由决策。
- 普通 Codex 页和独立 API Service 页继续显示所有仍存在的账号，成员过多时在卡片内部滚动，并按“调度中 -> 最近调度 -> 其他”排序；最低优先级兜底暂停开关只占最低账号的操作位。
- 请求统计以本地 `account_id` 为主键；删除账号不删除请求日志。`official_account_id` 只有与邮箱同时匹配时才可作为受控历史别名，不能把共享 Team/Workspace ID 的不同成员串账。`codex-auto-review` 继续使用 GPT-5.6 Luna 全矩阵，价格簿迁移会清除已识别的错误默认覆盖并后台重算相关历史日志。
- 去广告、空公告/远端配置、禁用运行时 updater、Sub2API `/usage` 与 `/v1/usage` 余额回退、数字字符串解析和非有限值拒绝均保持不变。Antigravity 额度查询/白屏问题不在本轮判定或修复范围内，待升级后单独观察。
- Release workflow 继续只构建 Windows 草稿；每次升级只聚合“上一个 fork 基线之后、当前目标版本及其间所有上游版本”的章节。`1.3.31` 草稿保留其当轮范围，不能在后续 `1.3.32` 草稿中重复打包旧历史。

本轮已清理全部冲突标记。验证结果：`cargo fmt --all -- --check`、`COCKPIT_SKIP_CLIPROXY_BUILD=1 cargo check --workspace`、TypeScript `tsc --noEmit` 和 24 项定向 Node 测试通过；本机未安装 Go，sidecar Go 编译与测试交由 Windows CI 完成。发布 tag 和 CI 结果应在实际草稿构建后继续补记于本节。

### 2.3 `v1.3.32` 已验证基线（2026-08-28）

本轮以 fork 合并提交 `3f23e54e`（其 fork 父节点为已验证的 `1.3.31` 状态）为基线，升级到上游 `v1.3.32`。上游 release commit 为 `38fd65ba`，与当前 `v1.3.31` 基线的 merge-base 为 `3bafe717`。本轮上游变更主要集中在 OAuth 凭据、共享 profile 写入和 sidecar 账号维护，未修改官方价格公式、价格簿或历史计费重算规则。

同步的上游能力按主题归纳如下：

- OAuth 账号取消跨实例占用限制；绑定 OAuth、默认实例、多开实例和 API Service 可以共享同一账号。该行为已按用户确认接受，不回退为旧的跨实例互斥。
- 默认 profile 增加跨进程 mutation lease。API Service 接管默认 profile 前会识别仍占用该 profile 的官方 Codex 客户端并先关闭；开发版/正式版并发写入会报告冲突，避免旧进程覆盖新凭据。
- OAuth 启动预览展示 `access_token`/`id_token` 到期状态，凭据导入优先使用官方 credential store（包括 macOS Keychain）；重新授权后的 Token 会同步到 API Service 绑定账号。
- 额度后台刷新改为顺序节奏，并复用一轮 Windows 进程探测快照；手动批量刷新仍保留原有并发行为。
- Codex 实验模型上下文预设使用紧凑标签；API Service 文本探测不再向无生图能力的 Provider 声明生图工具，正式生图路径保持可用。

本轮合并裁决与 fork 边界：

- 接受上游 OAuth 共享、profile 接管、凭据导入、Token 同步、顺序刷新和启动预览变化；这些逻辑不改变 API Service 的账号选择规则。
- 保留 `CodexLocalAccessAccountActivity`、sidecar `recordingSelector`、`auth_selected`/finish 生命周期和 5 秒调度状态刷新。上游新增 sidecar 账号范围只扩展凭据维护范围，不得绕过 recording selector，也不得重复发送调度事件。
- 保留普通 Codex/API Service 卡片的完整账号池、内部滚动、运行中/最近调度排序、最高/最低标记和最低优先级暂停开关。账号移除仍使用上游原子删除接口，不清空其他账号的优先级、session affinity 或 TTL 配置。
- 保留 Sub2API `/usage`、`/v1/usage` 回退、数字字符串解析和非有限值拒绝；保留 New API 用量回退。价格公式、本地 `account_id` 主统计键、删除账号历史计费、Auto-review 按 GPT-5.6 Luna 全矩阵及历史重算均不受本轮上游改动影响。
- 去广告、空公告/远端配置、禁用运行时 updater、通用 Provider 和 fork 下载/签名身份继续按本指南执行。macOS、Linux 构建 job 继续禁用，不因上游新增或修复平台构建而自动启用。

合并检查结果：无未解决冲突或冲突标记；`npm run typecheck`、`npm run build`、Provider 预设隐私扫描、`cargo fmt --check` 和 `git diff --check` 通过。Rust 全量测试在本机受到缺少 Go 编译器和 Windows 测试二进制 `STATUS_ENTRYPOINT_NOT_FOUND` 环境问题阻塞，未发现业务断言失败；Sidecar Go 测试需在发布 CI 的 Windows 环境补跑。本轮 `1.3.32b1` Release notes 只包含 `1.3.32`，因为它的上一个 fork 基线是 `1.3.31`；若未来一次跨越多个上游版本，必须逐个纳入该次升级范围内的版本，不能按历史起点全量回放。

### 2.4 `v1.3.40` 合并边界（施工中，2026-09-06）

本轮从已验证 fork `1.3.32b1` 升级到上游 `v1.3.40`，实际 Release 说明只聚合本轮跨越的上游章节：`1.3.40`、`1.3.39`、`1.3.38`、`1.3.36`、`1.3.35`、`1.3.34`、`1.3.33`。`1.3.32` 及更早版本已属于上一轮基线，不得重复写入本轮说明。

本轮接受上游 Codex Desktop 混合模型路由、Provider Gateway、GPT-6 Astra、Luna Reserve（`gpt-reserve`）、API Key 会话隔离、客户端版本能力过滤、WebSocket/多 Agent 和账号池自动恢复；这些能力继续使用上游新的拆分模块和 sidecar 结构。

fork 仍必须保留：

- API Service 调度观测的 `running_requests`、`account_activity`、`auth_selected` 唯一事件和请求完成收口；`recordingSelector` 必须位于上游 selector 链最外层，以覆盖 session-affinity cache-hit。
- 普通 Codex/API Service 卡片的完整账号池、内部滚动、调度中/最近调度排序、最低优先级暂停开关，以及删除账号历史请求的本地 `account_id` 主统计键和最终 ID/邮箱展示。
- 价格簿版本 4、`codex-auto-review` 的 GPT-5.6 Luna 全矩阵、旧错误默认价清除和历史日志后台重算；`gpt-reserve` 计费必须使用实际响应模型，不按别名错误套价。
- 独立 API Service 页面专用的 `last24h`、`last48h`、`last7d` 统计范围；普通共享弹窗不增加这些选项。
- 去广告、空公告/远端配置、禁用运行时 updater、Provider 中性化、Sub2API `/usage` 回退，以及只构建 Windows 草稿的 Release workflow。macOS/Linux job、自动 finalize、checksum 和 Homebrew job 必须继续 `if: ${{ false }}`。

当前新模块迁移检查重点：不要恢复旧版巨型 `CodexAccountsPage.tsx`、`CodexApiServicePage.tsx` 或 `codex_local_access.rs`；应把 fork 行为放进上游对应的 overview/controller/view、gateway runtime、sidecar runtime 和 request-log 模块，并在每轮合并后检查 `git diff --check`、TypeScript 类型、Rust（可用 `COCKPIT_SKIP_CLIPROXY_BUILD=1`）和 Sidecar Go CI 编译。

### 2.5 `v1.3.16` 已验证基线（2026-08-06）

本轮从已验证 fork `1.3.10b2`（`ee49a89f`）升级到上游 `v1.3.16`（release commit `e1ef55ce`），升级分支为 `codex/upgrade-upstream-v1.3.16`。合并前 release 链与锚点如下：

- `v1.3.11`：`6d77e752`，Agent Identity、客户端额度浮层刷新/健康信息、CLI 启动弹框、会话亲和 TTL 和后台准备进度。
- `v1.3.12`：`2f57be16`，修复同 workspace 多 Agent Identity 用户覆盖。
- `v1.3.13`：`e7264707`，修复 K12 Agent Identity 官方唤醒 Assertion。
- `v1.3.14`：`6c3e11af`，Web Session Agent Identity 与自定义 Responses API Key 准入修复；最终行为以后续版本为准。
- `v1.3.15`：`939d5d72`，Web Session 改为仅查看额度，新增最高/最低使用优先级、逐账号模型排除、New API billing 额度回退、Multi-Agent V2、请求日志 reasoning/service tier、隐藏中转额度等。
- `v1.3.16`：`e1ef55ce`，Workspace ID、Sub2API 导出、Responses namespace/加密内容重试、429 映射、工具结果图片转换和 Team/Workspace 订阅匹配修复。

`v1.3.10..v1.3.16` 共 37 个提交、209 个文件，净变化为 30991 行新增、3832 行删除。`git merge-tree` 预演确认只有两个文本冲突文件和一个删除/修改冲突：

- `.github/workflows/release.yml`：约 12 个冲突块。吸收上游缓存、并发保护和 action 更新，继续保留 fork 数字草稿标签、Windows 构建范围、签名、release notes 与禁用非目标平台的策略。
- `src-tauri/src/modules/codex_local_access.rs`：约 5 个冲突块，集中在模型 import、state snapshot 和测试 import。合并上游 preparing/refreshing、reasoning/token breakdown、Agent Identity 和使用优先级字段，同时保留 fork 的 `runningRequests/accountActivity` 及 selected/finish 生命周期。
- `Casks/cockpit-tools.rb`：fork 删除、上游修改；继续保持删除。

合并前语义审计确认以下非文本冲突必须人工处理：

1. Sidecar 上游仍从 `cockpitSelector.Pick()` 直接发送 `auth_selected`，无法覆盖 session affinity cache hit。继续以 fork 的最外层 `recordingSelector` 作为唯一发送者，并让它包住上游新增的模型排除、最高/最低优先级、额度保留、图片和 affinity 选择器；每个请求只能发送一次。
2. 普通 Codex 页完整成员滚动预览可自动合并，但“移出账号”保存必须同步保留剩余账号的 `isPreferred`、`isBackup` 和现有 session affinity/TTL，不能因旧调用参数清空新配置。
3. 上游没有修改 `codex_query_model_provider_usage` 主体；fork 的 Sub2API `/usage`/`/v1/usage` 回退、数字字符串解析和非有限数拒绝应自动保留。接受上游 `resolveNewApiQuotaSnapshot()`，作为 New API billing/token allocation 展示回退。
4. 上游最终启用了 `announcements.json` 顶部推广数据，但 fork 继续依靠空公告 URL、空远端配置和 `ADS_AND_SPONSORS_DISABLED` 的运行时硬关闭；不因原始数据字符串判定去广告回归。

用户已批准本轮产品裁决：

1. Web Session 跟随上游最终行为：仅查看额度，不得切号、加入 API 服务或作为 OAuth 绑定账号。
2. “隐藏中转站额度”不影响普通 Codex API 服务滚动成员列表；该列表继续显示调度观测所需额度。
3. 滚动列表继续按实时“调度中 -> 刚调度 -> 其他”排序，不按静态最高/最低优先级重排；账号行增加紧凑的最高/最低标记。

真实合并与预演一致，只出现上述三个显式冲突。最终裁决如下：

- `.github/workflows/release.yml` 同时保留上游的 concurrency、Rust/Tauri 缓存和 action 命名更新，以及 fork 的数字/草稿 tag、仅构建 Windows、禁用自动 finalize/checksum/Homebrew 和旧 `latest.json` 保护。复核时发现旧 fork 的 prepare 阶段虽然文案称“草稿”，实际会立即执行 `--draft=false`；本轮改为新建和重跑都必须保持 draft，若同 tag 已正式发布则直接拒绝覆盖。
- `src-tauri/src/modules/codex_local_access.rs` 合并双方 import、state snapshot 与测试 import。保留 `running_requests/account_activity`，并接受上游 `service_enabled`、准备/刷新进度、token breakdown、Agent Identity、模型排除和最高/最低优先级。Rust 首次编译还发现 Responses rejected-field 错误映射漏填新增的 `activity_request_id`，已使用当前请求 ID 修复，保证异常结束路径能正确清理调度活动。
- `Casks/cockpit-tools.rb` 继续删除。Sidecar 自动合并结果保留最外层 `recordingSelector`，`cockpitSelector.Pick()` 不直接发送事件；上游模型排除、最高/普通/最低、额度保留、图片和 session affinity 全部位于记录器内部。
- 普通 Codex 卡片继续完整渲染并内部滚动，排序仍只依据运行中和最近调度活动；静态优先级只显示“最高/最低”紧凑标记。移出成员时会过滤并保留剩余 preferred/backup ID，同时原样传递 session affinity 和 TTL。
- 计费查询保留 Sub2API `/usage`、`/v1/usage` 回退、路径感知 URL、数字字符串解析和 `NaN`/Infinity 拒绝；同时接受上游 New API billing/token allocation 额度回退。去广告硬开关、空公告/远端配置/商业默认 API URL、fork updater 地址与签名均通过源码和 Provider 运行时扫描复核。

本轮自动化验收结果：

- TypeScript `tsc --noEmit` 通过；Vite 生产构建通过，共转换 2184 个模块。
- Provider 隐私扫描通过，共检查 154 个运行时预设；成员滚动/排序/优先级/删除保留、批量导入恢复、New API 用量和 API 服务账号准入等定向 Node 测试 18 项全部通过，草稿 release 边界测试 3 项通过。
- 全部可直接由 Node 24 执行的测试为 `84 passed / 1 failed`。唯一失败是上游 `codexQuotaPool.test.ts` 通过原生 Node 执行时无法解析应用源码中的无扩展名 ESM import；相同源码已通过 TypeScript 和 Vite 构建，属于测试运行器限制，不修改业务 import。
- `cargo test -p cockpit-tools --lib` 使用 `target/test-data-v1316` 隔离数据目录执行，结果为 `759 passed / 0 failed`。首次编译发现并修复上述 `activity_request_id` 漏项，修复后全库通过。
- 当前机器没有 Go，`TestRecordingSelectorRecordsSessionAffinityCacheHit`、模型排除与优先级 selector 等 Sidecar Go 测试未运行；源码复核确认 affinity 首次选择和 cache hit 的测试仍断言每请求恰好一个事件。发布 CI 必须使用 Go 真实编译 Sidecar。
- `git diff --check` 仅报告上游 `WorkbuddyAutoCheckinConfigModal.tsx` 和 `codebuddy.css` 的 EOF 空行，未格式化无关上游文件。

真实合并提交为 `1dc9fedd`，父节点是 fork 施工文档提交 `cdea997e` 与上游 `e1ef55ce`。

### 2.5 `v1.3.10` 已验证基线（2026-07-20）

本轮从已验证 fork `1.3.6b2`（`3be46a02`）升级到上游 `v1.3.10`，合并提交为 `50cf4c74`，父节点是 fork `3be46a02` 与上游 release commit `b331b093`。升级分支为 `codex/upgrade-upstream-v1.3.10`。release 链如下：

- `v1.3.7`：release commit `16c4d02b`，Codex API 服务成为独立平台入口。
- `v1.3.8`：release commit `fb291416`，已有 Codex 账号可直接加入 API 服务，并修复 Responses 流和工具兼容。
- `v1.3.9`：release commit `72eff4a4`，修复 Responses Lite 协作工具、流内过载重试和删除账号残留。
- `v1.3.10`：annotated tag object `59f5640f`，release commit `b331b093`，增加 ChatGPT 客户端账号数/额度注入、逐账号导入进度和删除后的后台账号池清理。

`v1.3.6..v1.3.10` 涉及 30 个非合并提交、175 个文件，净变化为 13424 行新增、9765 行删除。真实合并与预演一致，只有三个显式冲突文件：

- `Casks/cockpit-tools.rb`：fork 删除、上游更新；继续保持删除。
- `sidecars/cockpit-cliproxy/main.go`：冲突只在 context key 常量区；同时保留 fork 的 `authSelectionDiagnosticsContextKey` 和上游的 `cockpitQuotaPath`。
- `src/pages/CodexAccountsPage.tsx`：三个冲突块均来自上游删除旧 API 服务成员预览；合并时先接受上游删除。`1.3.10b1` 验证后确认该预览属于 fork 刚需，随后恢复为明确的长期分叉，后续升级不能再次随上游删除。

独立平台化后的长期裁决：

1. `codex_api_service` 是独立、无账号平台 ID，页面路由为 `codex-api-service`；接受上游导航、布局迁移和页面入口。
2. Codex 账号页与 API 服务页首次访问后保持挂载。独立 API 服务页保留完整管理视图；普通 Codex 页同时保留紧凑成员预览。这是有意重复的 fork 产品能力，不得以“独立平台已有账号卡片”为由删除。
3. 普通 Codex 页使用同一份 5 秒 `accountActivity` state：完整渲染全部成员，先按 `runningCount`、再按最近 selected/finished 时间排序，无活动成员保持集合顺序；卡片高度不足时由成员区域内部滚动，并通过 ResizeObserver 显示当前视口外数量。`CodexLocalAccessModal` 继续复用相同活动数据和标记。
4. Sidecar 的 `recordingSelector` 继续位于 session affinity、图片、备用账号和额度保留选择器的最外层。上游新增 alpha search、Responses 重试和 scheduler health 都使用同一个 `coreauth.Manager`，不得把 `auth_selected` 发送移回 `cockpitSelector.Pick()`。
5. 上游 `schedulerAvailable/schedulerReason/schedulerNextRetryAt` 属于账号可用性健康信息，与 fork 的易失调度活动并存；两者不得合并成同一状态或互相驱动。

自动合并审计还发现两个非显式冲突问题：

- 上游在自动更新设置前新增“记住主窗口位置和大小”，导致 fork 的 `SHOW_UPDATE_UI` 条件自动包住两个同级 JSX 元素并误隐藏窗口设置。合并后把条件下移，只隐藏自动更新与更新提醒，窗口记忆功能跟随上游。
- 上游把批量导入弹框迁移到 `createPortal(..., document.body)`，以免 Codex 页面常驻隐藏后遮挡弹框。fork 继续保留单会话后台任务模型，只把 Portal 回归测试更新为验证 `document.body`，不恢复上游已被本 fork 撤销的多任务队列断言。

本轮验收结果：

- TypeScript `tsc --noEmit` 通过；Vite 生产构建通过，转换 2119 个模块并生成独立 `CodexApiServicePage` chunk。
- Provider 隐私扫描通过，共检查 154 个运行时预设；调度、API Key scope、兼容 URL、逐项导入、账号加入和 Portal 等 Node 定向测试 24 项通过。
- Rust `cockpit-tools` lib 共 673 项：`671 passed / 0 failed / 2 ignored`。另行复跑调度活动 2 项、OAuth 实际窗口和周窗口 Sidecar 映射各 1 项、Sub2API URL/数值各 1 项、配置接管 4 项、异步删除 1 项，全部通过。
- 本机没有 Go，`TestRecordingSelectorRecordsSessionAffinityCacheHit` 等 Sidecar Go 测试未执行；发布 CI 必须真实编译并运行 Go 测试。纯源码复核确认根选择器不再直接发送事件，外层记录器测试仍验证首次选择和 affinity cache hit 各发送一次。

### 2.6 `v1.3.6` 已验证基线（2026-07-16）

本轮从已验证 fork HEAD `6f84cae8` 升级到上游 `v1.3.6`。上游没有发布 `v1.3.3` tag；`release: v1.3.3` 提交包含在后续 `v1.3.4` 中。release 链如下：

- `v1.3.4`：annotated tag object `f1cccf71`，release commit `2d8f0fc2`。
- `v1.3.5`：annotated tag object `8b9d522e`，release commit `2c6412c0`。
- `v1.3.6`：annotated tag object `5cb09b0f`，release commit `072f05f0`。
- 升级分支：`codex/upgrade-upstream-v1.3.6`。
- 升级前 fork HEAD：`6f84cae8`；上一上游锚点仍为 `v1.3.2` release commit `a84a97cb`。
- 合并提交：`7ad378f4`；父节点为 fork 文档准备提交 `e9a528d6` 与上游 release commit `072f05f0`。

`v1.3.2..v1.3.6` 共涉及 60 个提交、142 个文件，净变化约为 22868 行新增、4138 行删除。升级前 fork 相对纯上游 `v1.3.2` 有 70 个差异文件，其中 41 个与本轮上游变更相交。`git merge-tree` 预演与真实合并都只产生三个显式冲突文件：

- `Casks/cockpit-tools.rb`：fork 删除、上游更新；继续保持删除。
- `src-tauri/src/modules/codex_local_access.rs`：冲突集中在测试模块 import；合并上游测试依赖与 fork 调度观测测试依赖，并删除重复 import。产品路径由双方改动自动合并。
- `src/pages/CodexApiServicePage.tsx`：接受上游 API Key 策略草稿保护、SSE/生图并发/超时草稿字段和价格校验实现，同时保留 fork 的调度显示与轮询草稿隔离；价格提示也使用上游原文。

用户已明确批准以下上游产品行为：

1. 接受移除 `image_generation` 禁用功能，并把旧 `Disabled` / `ImagesOnly` 配置迁移为 `Enabled`。
2. 接受撤销多任务后台导入队列，恢复单会话批量导入弹框。
3. 接受 Windows NSIS `installMode = "currentUser"`，安装与更新默认不再申请管理员权限。

价格设置的临时 fork 补丁已由上游 `v1.3.5` 实现完整取代。上游规则是：非长上下文模型允许 Token 阈值为空；填写非法阈值时拦截；填写任一标准长上下文价格时必须同时提供合法阈值。校验分支、注释和 `pricingInvalid` fallback 提示均跟随上游，不再维护 fork 版本。本文后续价格边界以该条件规则为准。

`v1.3.2` 的“Codex API 服务已启动，但 Codex 配置未接管本地 API”不是端口占用，也不是 fork 合并引入。现场日志显示 sidecar 已在 `127.0.0.1:23948` ready，随后才出现接管复检警告，且后续 `/v1/responses` 正常工作；日志中没有 bind/`AddrInUse` 错误。现场配置绑定 OAuth，Base URL 与 Client Key 均匹配，但 `v1.3.2` 复检无条件要求 `requires_openai_auth=false`，与自身写出的 OAuth 配置矛盾。上游 `v1.3.4` 已改为 OAuth/API Key 双路径校验、补齐 actor header 投影并增加回归测试。本轮直接接受上游修复；升级后用现有绑定 OAuth 配置复测，不先增加 fork 特判或压制警告。

实际合并树已确认：公告、远端配置、更新检查后端和 release workflow 未被上游改动；前端禁用常量、空远端 URL、fork updater 身份、三个 Provider 归一化出口、New API/Sub2API 查询规则及调度观测字段和 hook 均保留。调度观测继续覆盖 legacy HTTP/WebSocket、sidecar `auth_selected`、Responses Lite 和并发生图的 selected/finish 路径，没有进入路由、冷却或额度决策。新增 MiniMax 等上游预设仍统一经过 `neutralizeProviderPresets()`。

上游撤销全局后台导入队列后，遗留的 `tests/codexBatchImportPortal.test.ts` 仍断言旧 Portal/全局任务栈。合并时把该测试改为验证上游当前的页面内单会话、隐藏任务和直接重开行为；未恢复已移除的多会话状态。

本轮自动化验收结果：

- TypeScript 检查、Vite 生产构建、18 个 locale（各 5020 keys）、154 个 Provider 运行时导出和两个 Codex 辅助脚本通过。
- Node 测试 61 项通过，其中额度池测试因应用源码使用 bundler 风格无扩展名导入，使用 esbuild 打包同一测试后执行。
- `cockpit-tools` Rust lib 测试 629 项通过；接管判定 5 项、调度活动 2 项、Sub2API URL 和数值解析测试均单独复跑通过。
- `cockpit-core` 上游基线为 84 passed / 2 failed / 1 ignored；两个失败均位于上游未改动的 Codex 重授权测试，并会共享账号数据目录，不属于本文保护的 fork 行为。
- 当前机器没有 Go，Sidecar Go 测试未运行；Rust 测试通过被 Git 忽略的空 sidecar 占位文件跳过 Go build。全仓 `cargo fmt --check` 仍命中上游自身的大量格式差异，本轮未格式化无关文件。

Windows 本地运行 Rust 测试前必须为每个测试进程设置独立的 `COCKPIT_TOOLS_DATA_DIR`。只设置 `HOME`、`CODEX_HOME` 或 `COCKPIT_TOOLS_TEST_DATA_DIR` 不足以隔离 `cockpit-core`；上游部分测试会访问真实 `~/.antigravity_cockpit`。测试失败后也不能直接删除真实目录，应先根据测试前备份、明确的测试账号 ID/邮箱和时间戳制定最小恢复方案。

### 2.7 `v1.3.2` 上一已验证基线

当前已验证的同步状态（2026-07-15）：

- 上游 release tag：`v1.3.2`；annotated tag object `70edc038`，release commit `a84a97cb`。
- 升级分支：`codex/upgrade-upstream-v1.3.2`。
- 升级前产品代码基线：`ae0e6bd4`，其中上一轮 `v1.3.1` 合并锚点为 `4813f6df`。
- 升级前文档提交：`2b93c17f`。
- 上游合并提交：`ed818e5e`；第一父提交为 `2b93c17f`，第二父提交为上游 release commit `a84a97cb`。annotated tag object 只保存 tag 元数据，不是第二父提交。

本次接受的上游结构变化包括：移除 Gemini CLI 平台；新增 Codex SSH、Hermes 同步、PAT/批量导入队列；API 服务分档价格、长上下文、历史重算和备用成员入口；本机账号自动导入、加密存储、外连总开关、WebDAV 白名单；以及 Grok 修复和全局 reduced motion。上游“外连总开关”会同时影响 WebDAV，因此不能替代本 fork 对公告、远端配置和 updater 的精细硬关闭。

`v1.3.2` 重点修复 API 服务升级后账号不显示或添加卡住：价格重算、统计维护和集合账号清理改为后台分批、单飞且带条件写回。该版本还把 Windows 应用检测改为仅检查运行进程并增加超时，补强禁用生图能力、Codex 会话筛选、账号异步读取防旧结果覆盖，并新增 Grok 官方鉴权同步开关。升级时必须接受这些非阻塞迁移和竞态修复；在 `codex_local_access.rs` 中只重接调度观测字段、selected/finish hook 和 state snapshot，不能恢复旧的同步迁移路径。

`v1.3.2` 同时改动 `App.tsx`、`SettingsPage.tsx`、`src-tauri/src/lib.rs` 与 updater 配置。合并后除复核常规广告/updater 开关外，还要检查版本不兼容弹窗等次级入口：纯本地构建不能显示会触发已禁用 updater 的“检查更新”命令。

本次合并审计结论：

- `v1.3.1 fork 相对 v1.3.1` 与合并结果 `相对 v1.3.2` 的差异文件集合完全一致，均为 67 个文件；没有整组 fork 修改丢失或意外扩张。
- 唯一显式冲突是上游修改、fork 删除的 `Casks/cockpit-tools.rb`，继续保留删除。Provider、计费 command、公告与远端配置模块没有发生上游交叉冲突。
- 相对纯上游 `v1.3.2`，`codex_local_access.rs` 的产品代码差异仍收敛在调度观测字段、sidecar/legacy hook 和 state snapshot；上游后台统计维护、集合账号清理、单飞锁与条件写回原样保留。
- 审计发现旧“外部导入版本过低”弹窗仍显示无效的“检查更新”按钮，本次已删除；设置页中被 `SHOW_UPDATE_UI=false` 隐藏的兼容代码未作无关重构。
- 新增两项纯内存 Rust 回归测试，覆盖选择到完成的完整生命周期，以及同一请求重试切换账号后不遗留运行态。
- 修复“模型与能力”价格设置的可选空值校验：`parseOptionalPositiveIntegerDraft()` 用 `null` 表示未填写 Token 阈值，保存校验只能拒绝非空且非法的值，不能把 `null` 当作错误。缓存、长上下文和 Priority 价格同样允许按模型能力留空；标准输入/输出价格仍是持久化自定义价格行的必填字段。后续同步价格表单时必须分别验证“空值合法”和“非空值格式合法”，不要把两种状态合并判断。

本次验收结果：Rust 库测试 `576 passed / 0 failed / 2 ignored`；Node 测试 24 项；TypeScript、18 个 locale（各 4969 keys）、154 个 Provider 实际导出、Codex 辅助脚本和 Vite 生产构建均通过。当前环境没有 Go，因此 sidecar Go 测试未运行；Rust 测试仅为通过 build script 临时创建空 sidecar 占位文件，并已在测试结束时删除。全仓 `cargo fmt --check` 仍会命中上游 `v1.3.2` 自身的无关格式差异，本次没有为此格式化上游文件。

`v1.3.1` 上游测试在 Windows 上还有三类平台假设，本次仅在 `#[cfg(test)]` 代码内修正：

- `codex_account.rs`：builtin OpenAI 在 Windows 会写入 `model_provider = "openai"`，测试按平台断言。
- `codex_session_visibility.rs`：删除临时 SQLite 目录前显式释放 `rusqlite::Connection`。
- `codex_thread_sync.rs`：mtime 测试使用 `FILE_WRITE_ATTRIBUTES` 打开文件。

这些不是产品分叉；上游出现等价测试修正后可以直接删除本地版本。

本文首次建立时（升级前）的代码基线：

- 上游基线 tag：`v1.3.0`，commit `da0deca4`。
- fork 基线分支：`upgrade/upstream-v1.3.0`。
- fork 基线 HEAD：`988334a1`。
- 上游合并提交：`86771153`，父提交为 fork `1c2a883c` 与上游 `da0deca4`。

关键历史提交：

| Commit | 作用 | 后续处理 |
| --- | --- | --- |
| `0f476338` | 禁用广告、公告、远端配置和运行时更新 | 保留行为，不要机械 cherry-pick |
| `4167af5e` | 增加 Codex API 服务账号调度观测 | 保留数据流与只读边界 |
| `2037224a` | 修复 Sub2API 用量/余额兼容 | 保留 URL 回退与宽容解析 |
| `86771153` | 同步上游 `v1.3.0` | 仅为历史合并锚点 |
| `db5434d5` | 上游 `v1.3.1` release commit | 上一上游锚点 |
| `4813f6df` | 同步上游 `v1.3.1` | 上一 fork 合并锚点 |
| `a84a97cb` | 上游 `v1.3.2` release commit | 上一上游锚点 |
| `ed818e5e` | 同步上游 `v1.3.2` | 上一 fork 合并锚点 |
| `072f05f0` | 上游 `v1.3.6` release commit | 上一上游锚点 |
| `7ad378f4` | 同步上游 `v1.3.6` | 上一 fork 合并锚点 |
| `b331b093` | 上游 `v1.3.10` release commit | 当前上游锚点 |
| `50cf4c74` | 同步上游 `v1.3.10` | 当前 fork 合并锚点 |
| `c36673db` | 恢复调度状态 5 秒轮询 | 保留轮询条件 |
| `f868bb85` | 拒绝 `NaN`/无穷大计费值 | 保留数值安全检查 |
| `bba625e4` | 将 APIKEY.FUN/赞助中转 UI 中性化 | 保留通用自定义中转能力 |
| `01608f06` | 防止轮询重置自定义路由弹窗 | 保留草稿隔离 |
| `988334a1` | 防止轮询重置 API 服务编辑草稿 | 保留草稿隔离 |

不要把这些提交整批重放到新版本。应以行为为单位，把最小必要差异应用到上游新结构中。

## 3. 总体边界

### 3.1 必须保留

- 应用启动和空闲运行时不请求上游项目的公告、赞助或远端配置 JSON。
- UI 不显示广告、赞助模块、推广横幅、更新按钮或捐赠/反馈推广入口。
- 运行时更新检查和安装必须关闭；旧配置即使为 `true` 也要归一化为关闭。
- 通用 Provider、自定义 Base URL、自定义 API Key、模型目录、连通性测试和计费查询必须可用。
- API 服务调度信息只能观察，不能改变账号选择、重试、冷却、亲和性或额度判断。
- Sub2API 根地址要按 `/usage`、`/v1/usage` 顺序兼容；已有路径只追加 `/usage`。
- 用量 JSON 中的数字和数字字符串都可解析；非有限浮点数必须丢弃。

### 3.2 明确不做

- 不建立全局域名黑名单、请求拦截器或“只允许白名单域名”的网络层。
- 不删除 OAuth、token refresh、额度查询、模型查询、用户主动配置的 Provider 请求。
- 不因为某服务曾是赞助商就删除其可工作的 `baseUrls`。
- 不把调度观测数据持久化为新的业务状态，也不让它参与路由决策。
- 不把普通 502、代理、sidecar 或额度刷新故障归因于去广告代码。
- 不为降低冲突而删除上游新增功能；若不触及四组 fork 行为，应接受上游实现。

## 4. 修改集 A：去广告与远端行为隔离

### 4.1 后端硬边界

#### `src-tauri/src/modules/announcement.rs`

职责：从后端阻断公告、顶部广告和 sponsor module。

当前实现要点：

- `ANNOUNCEMENT_URL` 为空。
- `empty_announcement_response()` 返回空公告、空广告、`api_relay_enabled=false`、`top_right_ads_enabled=false`、无 sponsor module。
- `load_announcements_raw()` 直接返回空 payload，不读远端、缓存或本地 override。
- `get_announcement_state()`、`get_top_right_ad_state()`、`get_sponsor_module_state()` 都直接返回空状态。

升级裁决：即使上游重写公告模型或增加新入口，也应在最靠近公开 command/state 的位置返回类型正确的空值，保证不会先发网络请求再在前端隐藏。

#### `src-tauri/src/modules/remote_config.rs`

职责：阻断上游仓库对本地功能显示、更新弹窗和运行参数的远端控制。

当前实现要点：

- `REMOTE_CONFIG_URL` 为空。
- `load_remote_config_raw()` 返回 `empty_payload()` 和当前时间。
- 远端隐藏平台列表、规则和更新提示不会生效。

边界：保留 remote-config 的类型、store 和本地业务调用，避免大范围拆除；只禁止远端 payload 成为运行时输入。当前短路也跳过本地 override，这是现状，不要在升级时无意改变。

#### `src-tauri/src/modules/update_checker.rs`

职责：从配置层和决策层关闭更新。

当前实现要点：

- `UpdateSettings::default()` 中 `auto_check=false`、`auto_install=false`、`remind_on_update=false`。
- `should_check_for_updates()` 永远返回 `false`。
- 加载旧设置时，把三个字段归一化为 `false` 并持久化。
- 保存设置时再次归一化，不能通过旧 UI 或外部配置重新打开。

#### `src-tauri/src/commands/update.rs`

职责：从 Tauri command 层关闭安装能力。

当前实现要点：

- `get_update_runtime_info()` 返回 `linux_install_kind="disabled"`、`linux_managed_install_supported=false`、`updater_target=None`。
- `install_linux_update()` 返回 `pure-local build: updater disabled`。

边界：可以保留上游 updater crate、capability、版本比较和 release history 解析，减少结构性分叉；但任何平台都不能在运行时自动检查或安装。

#### 其他后端入口

- `src-tauri/src/modules/config.rs`：推广显示默认值保持关闭。
- `src-tauri/src/modules/codex_account.rs`：`CODEX_COCKPIT_API_BASE_URL` 与 `APIKEY_FUN_PROVIDER_BASE_URL` 为空，不能自动注入上游推广服务。
- `src-tauri/src/modules/codex_quota.rs`：推广服务识别 URL 为空；不得影响 OpenAI 官方 quota 请求。
- `remote-config.json`：不包含强制更新提示。

### 4.2 前端双保险

#### `src/App.tsx`

- `ADS_AND_SPONSORS_DISABLED=true`：不拉取广告/sponsor state，不启动刷新定时器，不渲染推广层。
- `UPDATER_RUNTIME_DISABLED=true`：隐藏更新 action，不进行启动检查，不显示版本跳转通知。

前端开关是用户体验和防回归双保险，不能替代后端短路。

#### `src/pages/SettingsPage.tsx`

- `SHOW_UPDATE_UI=false`。
- `SHOW_PROMO_SETTINGS=false`。
- `SHOW_EXTERNAL_PROJECT_LINKS=false`。

升级时若上游把相关 UI 拆到新组件，应按功能继续隐藏，而不是只保留旧常量。

### 4.3 自定义中转的中性化边界

相关文件：

- `src/pages/ApiKeyFunPage.tsx`
- `src/components/layout/SideNav.tsx`
- `src/components/PlatformLayoutModal.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/ClaudeAccountsPage.tsx`
- `src/utils/apikeyFunLinks.ts`
- `src/utils/codexProviderPresets.ts`
- `src/utils/claudeProviderPresets.ts`
- `src/utils/claudeDesktopProviderPresets.ts`
- `src/utils/providerPresetPrivacy.ts`
- `src/types/codex.ts`
- `src/locales/*.json`

必须保留的能力：

- 页面和入口继续存在，但名称、图标和文案是“自定义中转”/通用 Provider。
- 用户必须填写自己的 Base URL 和 API Key。
- 可保存多组 Provider、列模型、测试连接、查询用量和把配置带入 Codex/Claude。
- 使用通用 Lucide `Network` 图标，不恢复专属品牌资产。

必须移除或中性化的内容：

- APIKEY.FUN 默认 endpoint、注册页、文档页、logo 和来源标记。
- Cockpit Api/推广中转的硬编码 Base URL 和自动识别。
- sponsor 动态模板和远端 sponsor 状态对入口可见性的控制。
- “合作伙伴”徽标、推广文案、返利/邀请/跟踪链接。

Provider 目录处理边界：

- 保留能直接服务 API 请求的 `baseUrls`、模型能力和协议元数据。
- 官方网站可保留中性的产品首页。
- `website`/`apiKeyUrl` 中的 `aff`、`ref`、`invite`、`source`、`code`、`ytag` 等推广参数或专属路径应删除；无法安全还原为中性页面时，删掉该链接字段。
- `isPartner` 不应驱动徽标或排序。普通第三方 Provider 本身不是广告，不因去广告而从目录删除。

### 4.4 Provider 预设归一化（`v1.3.1` 已关闭旧缺口）

`v1.3.0` 基线中遗留的静态 `isPartner` 标记和邀请/返利链接，已在 `v1.3.1` 同步时通过统一导出归一化关闭：

- 三个预设模块把上游原始数组保留为 `RAW_*`，对外导出前统一调用 `neutralizeProviderPresets()`。
- 运行时导出的所有预设均不再携带有效的 `isPartner` 状态。
- 原 partner 预设的 `apiKeyUrl` 直接删除，避免继续提供注册、返利或邀请入口。
- 其他 `website`/`apiKeyUrl` 使用结构化 `URL` API 移除 `aff`、`ref`、`invite`、`source`、`code`、`ytag` 和 `utm_*` 等跟踪参数；无法解析的 URL 不做危险的字符串猜测。
- `baseUrls`、模型列表、协议和能力元数据保持不变，不能因清推广元数据而破坏 Provider 的 API 能力。
- `modelProviderUsageService.ts` 不再包含 APIKEY.FUN 域名专属前端 fallback；后端通用 New API/Sub2API 探测仍完整保留。
- `npm run check:provider-presets` 通过 Vite 实际加载三个运行时导出数组，检查 partner 状态和追踪参数；升级后必须执行。

为减少与上游预设数据的合并冲突，`RAW_*` 源数据和兼容迁移代码中仍可能出现旧品牌或推广字符串。扫描时必须检查“对外导出的运行时对象是否可点击/可请求”，不能仅凭源码字符串命中判定回归。后续上游新增或修改预设时，应继续走同一个归一化出口，不要在每个预设对象中手工删字段。

## 5. 修改集 B：Codex API 服务调度观测

### 5.1 数据模型

后端：`src-tauri/src/models/codex_local_access.rs`

- `CodexLocalAccessRunningRequest`：请求 ID、账号 ID/邮箱、API Key ID/标签、模型、请求类型、路由策略、开始/最后观测时间。
- `CodexLocalAccessAccountActivity`：账号维度的运行数、最近选择/完成时间、最近模型、API Key 标签、请求类型、路由策略和请求 ID。
- `CodexLocalAccessState.running_requests`。
- `CodexLocalAccessState.account_activity`。

前端镜像：`src/types/codexLocalAccess.ts`。Rust 使用 `camelCase` 序列化，字段增删必须同步 TS 类型。

### 5.2 运行时数据流

核心文件：`src-tauri/src/modules/codex_local_access.rs`

运行时状态：

- `GatewayRuntime.running_requests: HashMap<...>`。
- `GatewayRuntime.account_activity: HashMap<...>`。
- 最近完成展示窗口：`ACCOUNT_ACTIVITY_RECENT_WINDOW_MS = 30s`。
- 运行请求防泄漏窗口：`ACCOUNT_ACTIVITY_RUNNING_STALE_MS = 30min`。

事件生命周期：

1. sidecar 的 `auth_selected` 事件或 legacy HTTP/WebSocket 路由选中账号时，调用 `record_account_activity_selected()`。
2. 正常完成、上游失败、流式失败、WebSocket 结束等路径调用 `finish_account_activity()`。
3. `prune_account_activity()` 清理陈旧运行请求和超出最近窗口的账号活动。
4. `build_account_activity_snapshot()` 计算每个账号的 `running_count`，按运行数和最近时间排序。
5. `build_state_snapshot_inner()` 把两组数组放入 `CodexLocalAccessState`，通过现有 `codex_local_access_get_state` command 暴露。

升级重点：上游若重构请求执行路径，必须逐一检查“选中后记录”和所有 terminal path 的 finish；只补成功路径会造成永久“调度中”。

Sidecar 选择事件所有权：

- `sidecars/cockpit-cliproxy/main.go` 的 `recordingSelector` 位于完整选择器链最外层，负责在最终账号返回后记录计费账号并且发送一次 `auth_selected`。
- `cockpitSelector` 只负责实际选择和填写候选/可用账号诊断计数，不得再直接发送 `auth_selected`，否则普通选择会产生重复事件。
- `SessionAffinitySelector.Pick()` 在 cache hit 和 fallback cache hit 时会直接返回缓存账号，不进入 fallback `cockpitSelector`。因此调度事件不得放回 `cockpitSelector.Pick()`；否则同一会话的首次请求可显示“调度中”，后续请求会漏报。
- `recordingSelector` 注入每次选择独享的诊断上下文：普通路径使用 `cockpitSelector` 给出的精确计数；未进入根选择器的 affinity cache-hit 路径使用外层候选集补算。诊断数据只用于事件展示，不能参与选择。
- `TestRecordingSelectorRecordsSessionAffinityCacheHit` 必须同时验证计费账号元数据，以及首次选择和 cache hit 都各发送且只发送一次选择事件。

### 5.3 前端显示与轮询

显示位置：

- `src/pages/CodexAccountsPage.tsx`：普通 Codex 页 API 服务卡片完整显示全部成员；正在调度账号优先，其次为最近调度账号，并显示运行/最近活动标记。
- `src/pages/CodexApiServicePage.tsx`：成员卡片显示“调度中 N”或“刚调度 N 秒前”，tooltip 展示模型/API Key 标签/策略。
- `src/components/CodexLocalAccessModal.tsx`：按账号统计行显示活动标记。
- `src/styles/pages/codex.css`：普通 Codex 卡片的固定高度、成员内部滚动、紧凑额度列和活动状态样式。
- `src/pages/CodexApiServicePage.css`、`src/components/CodexLocalAccessModal.css`：独立页面和管理弹框活动状态样式。

从 `v1.3.7` 开始，上游 API 服务使用独立平台 ID `codex_api_service` 和页面 `codex-api-service`，并删除普通 `CodexAccountsPage` 的成员逐卡预览。本 fork 明确覆盖该上游裁决：独立页面负责完整管理，普通页面仍必须提供无需跳转的紧凑账号池观测。成员列表不得 `slice` 截断；账号过多时必须在卡片内部纵向滚动，不能依赖整页拉长，也不能只显示汇总数字。

轮询契约：

- 仅当 `state.running=true` 时，每 5 秒调用 `getCodexLocalAccessState()`。
- 页面卸载或服务停止时清除 interval。
- 两个 Codex 页面首次访问后保持挂载；访问过两页时会各自维护只读轮询。它们使用独立 state 和请求序号保护，不会互相覆盖。
- 轮询结果只更新服务 state，不应重置用户正在编辑的表单、成员选择、自定义路由、模型规则或密钥草稿。
- `CodexLocalAccessModal` 只在真正打开或 mode 改变时初始化瞬态状态。
- `CodexApiServicePage` 的服务端 state 与本地 draft 必须分离。

### 5.4 调度观测边界

- 只读：不得改变路由顺序、权重、冷却、重试、配额保留或 session affinity。
- 易失：数据只在当前进程内存在，重启后清空，不写数据库/配置文件。
- 隐私：不记录 API Key secret；UI 继续使用现有账号脱敏函数。
- 性能：不新增独立高频 command；复用已有 state snapshot 和条件轮询。
- 兼容：运行时以 sidecar 为唯一路径；legacy 只保留迁移、历史日志筛选和旧数据读取兼容，不能重新作为启动分支。

### 5.5 OAuth 保留额度窗口语义

OpenAI 的 `primary_window`/`secondary_window` 表示窗口顺序，不保证永久等于“5 小时/周”。OpenAI 暂停短窗口时，唯一的周窗口可能作为 `primary_window` 返回；上游前端也已有 `hourly_window_minutes=10080` 但实际显示为 Weekly 的兼容行为。

- `quota_reserve_windows_snapshot()` 必须优先使用实际窗口分钟数分类：达到一周的窗口使用周保留阈值，较短窗口使用五小时保留阈值。
- 只有旧持久化数据缺少窗口分钟数时，才兼容回退为 primary 使用五小时阈值、secondary 使用周阈值。
- Rust legacy 路由的屏蔽判断、`quota_reserve_status` 告警和写给 Sidecar 的 `quota-reserve.json` 必须共用同一份语义解析结果，不能分别按字段位置判断。
- OpenAI 恢复 `primary=300 分钟`、`secondary=10080 分钟` 后，两组阈值应自动同时恢复生效；不得通过永久交换 primary/secondary 字段修复周窗口。
- Sidecar 继续接收已有 `hourly*`/`weekly*` JSON 契约，但这些字段必须由 Rust 按真实时长完成语义归一化后再写出。
- 回归检查至少覆盖 weekly-only primary、恢复后的 5 小时+周双窗口，以及缺少窗口时长的旧数据兼容。

### 5.6 v1.3.28 sidecar 统一与官方账号标识

上游 `v1.3.22` 起把 Codex API Service 的运行时统一到 sidecar；`v1.3.28` 继续沿用这一边界。后续合并时：

- 不恢复普通设置页的 legacy/sidecar 运行时切换控件，也不把 legacy gateway 重新作为启动分支；`gateway_mode`、旧目录和旧日志仍只用于迁移、历史筛选和兼容读取。
- 保留 sidecar 的 `auth_selected`、`usage`、`auth_result` 事件处理。`auth_selected` 负责开始账号活动，`usage` 及所有失败/取消/重试终点负责结束活动；上游若调整事件字段，先扩展解析器再改 UI。
- 账号统计以本地 `account_id` 为主键；`official_account_id` 只能在官方 ID 与邮箱同时匹配时作为受控历史别名，用于删除后重新授权/重新导入同一账号，不能仅凭共享官方 ID 合并 Team/Workspace 成员；删除账号不删除请求日志，历史费用继续保留。
- `sidecars/cockpit-cliproxy/third_party/CLIProxyAPI` 是唯一供应商源码目录。上游路径迁移时必须同时检查 Rust build script、发布工作流和本地开发命令，不能留下可被误选的旧副本。
- Linux 官方 ChatGPT/Codex 桌面实例管理、CLI/App 模式边界、Windows 恢复弹框和 Trae 修复直接跟随上游；除非触及本节的 sidecar 调度观测或去广告边界，不要回退上游生命周期逻辑。

## 6. 修改集 C：上游计费、用量与余额查询

### 6.1 后端入口和 URL 规则

核心文件：`src-tauri/src/commands/codex.rs`

公开 command：`codex_query_model_provider_usage(base_url, api_key, integration_type)`。

模式选择：

- `integration_type="new_api"`：只走 New API billing endpoints。
- `integration_type="sub2api"`：只走 Sub2API usage endpoints。
- 未指定：先探测 New API，失败后探测 Sub2API；两者都失败时返回组合错误。
- 未知类型直接返回 `PROVIDER_USAGE_TYPE_UNSUPPORTED`。

Sub2API URL 构造：

- 根地址 `https://host`：依次尝试 `https://host/usage`、`https://host/v1/usage`。
- 已有路径 `https://host/api`：只尝试 `https://host/api/usage`。
- 清除 query，不接受非 HTTP(S) scheme。
- 每次请求使用 Bearer API Key、`Accept: application/json` 和统一超时。

New API URL 构造：

- `dashboard/billing/subscription`。
- `dashboard/billing/usage`。
- 可选 `api/usage/token/`；失败不使主查询失败。
- Base URL 为 `/v1` 时，token usage endpoint 回到站点根路径。

### 6.2 响应兼容和安全

`CodexModelProviderUsageSummary` 是前后端共同契约，包含余额、额度、今日/累计请求与 token、费用、模式、延迟和 details。

兼容规则：

- JSON 数字和数字字符串都可接受。
- `NaN`、`Infinity` 等非有限浮点数必须返回 `None`，不能进入序列化或 UI。
- Sub2API payload 没有 `mode` 时补为 `sub2api`。
- 单个候选 URL 的网络、HTTP 或 JSON 错误不会阻止尝试下一个候选。
- 错误响应正文最多带前 300 个字符，避免无限扩张；不得记录 API Key。

### 6.3 前端调用链

- `src-tauri/src/lib.rs`：注册 Tauri command。
- `src/services/modelProviderUsageService.ts`：invoke、错误分类、模式推断、数值格式化。
- `src/services/codexModelProviderService.ts`：Provider 级包装与自动保存探测到的 integration type。
- `src/services/codexApiKeyUsageRefreshService.ts`：账号级刷新和 localStorage 摘要缓存。
- `src/components/codex/CodexModelProviderManager.tsx`：Provider 管理和详细计费面板。
- `src/pages/CodexAccountsPage.tsx`：账号卡片/编辑流程中的查询。
- `src/pages/DashboardPage.tsx`：New API/Sub2API 摘要展示。
- `src/pages/ApiKeyFunPage.tsx`：通用自定义中转的手动余额查询。

边界：计费查询必须由用户配置的 Provider/API Key 驱动。去广告不能删除这条网络能力，也不能偷偷改写到某个默认商业服务。

### 6.4 关键自动化测试

`src-tauri/src/commands/codex.rs` 当前至少覆盖：

- 根 URL 包含 `/usage` 与 `/v1/usage` 回退。
- 带路径 URL 只追加 `/usage`。
- 数字字符串解析。
- 非有限浮点数字符串拒绝。

升级后若 URL 规则或 payload 扩展，优先补纯函数测试，不用真实服务密钥做 CI 测试。

## 7. 修改集 D：Codex API 服务价格、历史账号与兜底暂停

### 7.1 官方价格基线与版本保护

核心文件：`src-tauri/src/modules/codex_local_access.rs`。

本 fork 的 Codex API 服务价格是本地编译期估算价格，不在运行时从 OpenAI、GitHub 上游或远端配置拉取。当前请求日志快照版本为 `DEFAULT_MODEL_PRICING_VERSION = 4`，保存的默认/自定义价格簿版本为 `DEFAULT_MODEL_PRICING_BOOK_VERSION = 4`；两者必须分开维护。官方基线可对照 [OpenAI Developers Pricing](https://developers.openai.com/api/docs/pricing)。升级价格时必须复用现有后台历史重算机制，不能只改前端展示值。

GPT-5.6 Terra（美元 / 百万 token）：

- Standard 短上下文：输入 `2.00`、缓存输入 `0.20`、输出 `12.00`。
- Standard 长上下文（输入超过 272K）：输入 `4.00`、缓存输入 `0.40`、输出 `18.00`。
- Fast 短上下文：输入 `4.00`、缓存输入 `0.40`、输出 `24.00`。
- Fast 长上下文：输入 `8.00`、缓存输入 `0.80`、输出 `36.00`。

GPT-5.6 Luna（美元 / 百万 token）：

- Standard 短上下文：输入 `0.20`、缓存输入 `0.02`、输出 `1.20`。
- Standard 长上下文（输入超过 272K）：输入 `0.40`、缓存输入 `0.04`、输出 `1.80`。
- Fast 短上下文：输入 `0.40`、缓存输入 `0.04`、输出 `2.40`。
- Fast 长上下文：输入 `0.80`、缓存输入 `0.08`、输出 `3.60`。

`codex-auto-review` 固定使用 Luna 的完整矩阵（Standard `0.20 / 0.02 / 1.20`，Fast `0.40 / 0.04 / 2.40`，长上下文仍按 `x2 / x2 / x1.5`）。OpenAI 官方公开价格页不单列这个桌面内部入口，因此不要把它误映射回 Sol；项目内价格表和 Sub2API 对照结果是该入口的维护依据。

边界：

- `priority` 与 `fast` 继续归一化为同一 Fast 计价分支，兼容旧客户端字段。
- 长上下文继续按输入/缓存输入 `x2`、输出 `x1.5` 计算。
- 本轮明确不增加缓存写入单价字段；Codex API 服务按现有输入、缓存输入、输出三类价格估算。
- 上游若修改价格表，必须逐项对照 OpenAI 官方价格后更新两个版本号和测试；不得因合并上游旧常量把 v4 价格回退。
- `modelPricingBookVersion` 只描述内置价格簿迁移；`modelPricingVersion` 是请求日志快照版本，用户保存自定义价格时递增。新增迁移应以精确快照匹配清理已知错误覆盖，不能按模型名无条件删除用户自定义值。
- v3 -> v4 首次迁移会清除已知的 Terra/Luna 旧默认、Luna 标准 + Terra 优先级混合值以及 Auto-review 的 Sol/混合错误值，并递增快照版本，触发包括历史 Auto-review 在内的后台重算；真正不同的自定义价格保留。
- 用户自定义价格、价格簿版本迁移和历史请求后台重算必须保持现有非阻塞行为。

### 7.2 历史账号统计展示

核心文件：

- `src/pages/CodexApiServicePage.tsx`
- `src/pages/CodexApiServicePage.css`

后端时间范围查询已经从 SQLite `request_logs` 聚合所有发生过请求的账号，移出账号池或删除账号不会清理这些日志。历史账号能力应保持为前端视图组合，不得为此复制费用数据、建立账号墓碑表或改动计价模块。

账号池页和“统计与日志 -> 按账号统计”必须分为：

1. “当前账号”：保持现有账号池成员卡片、健康信息、调度活动和操作按钮。
2. “历史账号”：显示选定时间范围内有统计、但不属于当前有效账号池成员的账号。

历史状态判定：

- 账号仍存在于账号总览、但不在 API 服务账号池：显示 `未加入`。
- 账号已不在账号总览：显示 `已删除`。
- `未加入` 与 `已删除` 必须使用可明显区分的颜色，且不能仅依赖颜色表达状态。
- 新状态 Tag 必须位于 Team、API、K12、Plus、Pro 等原账号类型 Tag 之后，不能替换或改写账号类型。
- 已删除账号若已无账号详情，使用请求日志中的历史邮箱，缺失时回退 `accountId`；不得伪造原套餐类型。
- 当前账号即使在选定时间内没有请求也继续显示；历史账号只来自选定时间范围的实际统计结果。
- 用户执行“清除统计”后，对应历史账号可以随请求日志一起消失。

普通 Codex 账号卡片的窗口用量查询不受 API 服务成员身份限制：所有仍存在且有配额窗口的账号都查询并显示 `req / token / A $`，即使账号已移出 API 服务也不能退回 `A $0`。已删除账号没有当前账号对象，只在独立 API 服务的历史统计中显示；历史记录不伪造已删除账号类型。

独立 API 服务页的统计范围包含日、周、月，以及实时滚动的近 24H、近 48H、近 7Day。滚动项按当前时刻减去固定时长查询，不改变后端日/月/周聚合语义；这些三个滚动预设只属于独立页面，不能添加到共享管理弹窗。范围标签区域允许横向滚动，避免账号/窗口较窄时挤压其他控件。

### 7.3 最低优先级兜底暂停

核心文件：

- `src/utils/codexLocalAccessBackupDispatch.ts`
- `src/pages/CodexApiServicePage.tsx`
- `src/pages/CodexApiServicePage.css`
- `src/pages/CodexAccountsPage.tsx`
- `src/styles/pages/codex.css`
- `src/services/codexLocalAccessService.ts`
- `src-tauri/src/commands/codex.rs`
- `src-tauri/src/modules/codex_local_access.rs`

这是用户显式配置的调度能力，与修改集 B 的只读调度观测严格分离。调度观测数据仍不得参与路由；只有用户操作该开关时才改变账号的可调度范围。

最小实现契约：

- 仅最低优先级（`isBackup=true`）账号显示开关。
- 独立 API 服务页：开关位于账号卡片右上角、移出账号按钮左侧。
- 普通 Codex 页 API 服务摘要卡片：开关位于对应成员行右侧、移出按钮左侧，并与移出按钮共用自适应操作区；非最低优先级账号不得保留空开关占位列。
- 卡片上不显示“兜底开启”“兜底关闭”或额外状态 Tag；通过开关状态、tooltip 和 `aria-label` 表达。
- 关闭时在该账号 `accountModelRules.excludedModels` 中加入通配符 `*`；打开时只移除 `*`，必须保留该账号其他模型排除规则。
- 账号从最低优先级改为正常或最高优先级时，后端必须同步移除该账号的 `*`，避免开关消失后账号仍被全部禁用；该账号其他模型排除规则必须保留。
- 非最低优先级账号若从未发生上述优先级迁移，其手工配置的 `*` 仍属于模型规则，不得被无条件清理。
- 账号继续保留在 API 服务集合、成员数量、优先级和页面列表中。
- sidecar 与 legacy HTTP/WebSocket 路径都必须把 `*` 视为禁用全部模型，因此即使其他账号均不可用也不得选择该账号。
- 两个页面共享同一持久化状态；开关必须调用单账号原子后端命令，不能从页面快照写回整份 `accountModelRules`，否则会覆盖另一页面或模型规则弹窗的并发修改。
- “禁用模型”弹窗仍是整表编辑，打开时必须记录集合 `updatedAt`，保存时由后端做乐观并发校验；配置已被开关或其他页面更新时拒绝旧草稿，不能反向覆盖新状态。
- 保存后发送现有 `codex-local-access-state-updated` 事件，并继续依赖已有五秒运行态轮询收敛其他页面。
- 保存期间禁用开关；失败时不得留下仅前端生效的假状态。
- “禁用模型”数量只统计真实模型排除；仅含暂停通配符 `*` 的账号规则不计入该数字。
- 关闭开关只阻止保存完成后的新调度，不强制终止关闭前已经选中的在途请求。页面应把这类活动标为关闭前请求仍在处理，并隐藏关闭前已经结束的“刚调度”提示；若 `lastSelectedAt` 晚于当前暂停配置的 `updatedAt`，仍显示为真实的新调度异常。

### 7.4 上游升级保护与测试

`codex_local_access.rs` 仍以上游路由结构为主，但必须重新核对 v4 价格簿、Auto-review Luna 映射和历史重算版本。账号页面接受上游布局与功能后，必须恢复历史账号分区、普通页完整账号窗口用量和两处兜底开关，不能因上游不存在这些 UI 而删除。

最低验收：

- Rust 测试覆盖 Terra/Luna 的 Standard 短上下文、Standard 长上下文和 Fast 长上下文价格。
- v2/v3 配置升级到当前价格簿后，错误快照清理、真正自定义值保留和旧请求后台重算均有 Rust 测试；Auto-review Standard/Fast/长上下文矩阵也必须覆盖。
- 前端测试覆盖 `*` 的添加、移除、其他模型规则保留和空规则清理。
- Rust 测试覆盖单账号原子开关，以及暂停账号从最低优先级改为正常/最高后的 `*` 清理；不得误删普通账号手工配置的 `*`。
- 账号池页同时覆盖当前账号、未加入历史账号和已删除历史账号；套餐 Tag 与状态 Tag 的顺序稳定。
- legacy 与 sidecar 测试覆盖“其他账号均不可用时，暂停的最低账号仍不被选中”；重新打开后恢复兜底。
- 普通 Codex 摘要卡片继续完整渲染所有成员并保持内部滚动，新增开关不得挤掉额度、套餐或移出按钮。
- 普通 Codex 页中移出 API 服务的现存账号仍显示窗口内 API 用量；独立 API 页仅把已删除账号放入历史区。
- 独立 API 页的 24H/48H/7Day 查询使用固定时长边界并持续刷新，共享弹窗不出现这些标签。

## 8. 发布与仓库身份差异

这些差异通常保留，但与四组核心产品行为分开审查：

- `.github/workflows/release.yml`：fork 的 draft/tag、Windows 构建和 release notes 策略；非目标平台 job 当前被禁用。
- `src-tauri/tauri.conf.json`：fork updater 公钥和 fork release endpoint。即使 runtime updater 已禁用，也不能指回上游签名/制品。
- `src/utils/updaterReleaseNotes.ts`：fallback release URL 指向 fork。
- `README.md`、`README.en.md`、`README.pt-br.md`：fork 差异和免责声明。
- `Casks/cockpit-tools.rb`、专属推广图标：当前 fork 删除。
- `.gitignore`、旧 release notes：仅维护/构建辅助，不应主导冲突裁决。

升级上游 workflow 时，先接受安全修复和 action 版本更新，再恢复 fork 的发布范围、draft 行为、签名与 release notes 规则。不要用旧 workflow 整文件覆盖上游。

## 9. 文件所有权与冲突优先级

| 区域 | 默认裁决 | 必查内容 |
| --- | --- | --- |
| `announcement.rs` / `remote_config.rs` | 保留 fork 的空状态与无网络不变量 | 上游新公开入口、缓存预取、启动任务 |
| updater 后端与 `App.tsx` | 保留 fork 禁用行为，吸收上游类型/错误修复 | 新平台 installer、新自动检查入口 |
| Settings/导航/推广 UI | 保留中性化与隐藏行为，吸收布局重构 | 新 sponsor 组件、更新按钮、远端可见性 |
| Provider 预设 | 接受新服务能力，清理推广元数据 | `isPartner`、邀请链接、默认商业服务 |
| `codex_local_access.rs` | 以上游路由实现为主，重接观测 hook | 每条 selected/terminal path、sidecar event schema |
| Local access models/types | 合并双方字段 | Rust/TS camelCase 一致性 |
| API 服务页面/Modal | 接受上游功能，重放活动标记和轮询草稿隔离 | interval 清理、编辑状态是否被 state 覆盖 |
| API 服务价格/历史账号/兜底暂停 | 保留 fork v4 价格簿、两处 UI 与滚动统计，吸收上游结构修复 | Terra/Luna/Auto-review 费率、价格簿迁移、历史分区/Tag、`*` 规则、双网关跳过 |
| `commands/codex.rs` usage 区域 | 以上游 Provider 支持为主，保留 Sub2API 回退/安全解析 | URL 拼接、错误类型、summary 字段 |
| release workflow/config | 逐段合并 | fork signing、draft、平台范围、release notes |
| 其他账号平台与通用组件 | 默认完全接受上游 | 仅处理编译所需适配 |

## 10. 标准升级流程

### 10.1 升级前

1. 确认工作区干净或准确记录已有用户改动：`git status --short --branch`。
2. 记录当前 fork HEAD、上游 tag commit 和 merge-base。
3. 阅读上游 release notes，但以 tag diff 为准。
4. 先更新本文中的基线、已知缺口和新增热点，再进行代码合并。
5. 建立独立升级分支，不直接改稳定分支。
6. 明确本轮 Release 说明范围：记录旧上游锚点之后到目标 tag 的全部上游版本，必要时加上 fork beta 增量；同步规划 `CHANGELOG.md`、`CHANGELOG.zh-CN.md` 和 workflow 的 `RELEASE_VERSIONS`，不得只记录最终版本。

### 10.2 审计上游变化

至少检查：

```powershell
git log --oneline --decorate <old-upstream-tag>..<new-upstream-tag>
git diff --stat <old-upstream-tag>..<new-upstream-tag>
git diff --name-status <old-upstream-tag>..<new-upstream-tag>
git diff <old-upstream-tag>..<new-upstream-tag> -- <本文列出的热点文件>
```

将变更分为：不相交、结构相交但行为不冲突、直接触碰 fork 不变量、上游已等价实现四类。上游已等价实现时删除本地重复代码。

### 10.3 合并与冲突处理

1. 合并上游 release tag，保留真实双亲历史。
2. 不对热点文件使用整文件 `ours/theirs`。
3. 先恢复上游数据结构与新调用路径，再逐项重放四组行为。
4. 每解决一组冲突就运行相关格式/类型检查，避免最后集中排错。
5. 搜索冲突标记以及重复 import、重复字段、失效 dead branch。

### 10.4 合并后差异复核

最终应该同时检查两种差异：

- `<new-upstream-tag>..HEAD`：现在 fork 相对新上游还保留了什么。
- `<old-fork-head>..HEAD`：本次升级实际改变了什么。

如果第一种差异出现大批与四组行为无关的文件，通常表示冲突处理过度保留了旧代码。

## 11. 验收矩阵

### 11.1 静态与构建检查

```powershell
npm run typecheck
npm run check:provider-presets
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
$env:COCKPIT_TOOLS_DATA_DIR = Join-Path $PWD "target/test-data-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
cargo test --manifest-path src-tauri/Cargo.toml
```

注意：`npm run build` 会先运行版本同步脚本。执行后检查 Git 状态，确认版本文件变化来自目标 release，而不是意外脏改。

Windows 上不得在未设置 `COCKPIT_TOOLS_DATA_DIR` 时运行 Rust 账号测试。该变量必须指向 workspace 内新建的测试专用目录；`HOME`、`CODEX_HOME` 和 `COCKPIT_TOOLS_TEST_DATA_DIR` 不能替代它。若本机没有 Go，可用已忽略的目标名 sidecar 占位文件配合 `COCKPIT_SKIP_CLIPROXY_BUILD=1` 只验证 Rust，但发布构建仍必须由 CI 真实编译并测试 Go sidecar。

### 11.2 去广告/外链扫描

```powershell
rg -n -i "apikey\.fun|chongcodex|sponsor|donate|aff=|ref=|invite|source=ccs|ytag" src src-tauri remote-config.json announcements.json
rg -n "ANNOUNCEMENT_URL|REMOTE_CONFIG_URL|should_check_for_updates|ADS_AND_SPONSORS_DISABLED|UPDATER_RUNTIME_DISABLED" src src-tauri
```

逐条分类扫描结果：类型名、兼容迁移字段和死代码不等于运行时推广；可点击链接、默认服务、徽标或网络请求必须处理。

### 11.3 调度观测手工检查

1. 启动 Codex API 服务并加入至少两个账号。
2. 发起普通、流式和 WebSocket 请求（若该模式受支持）。
3. 在普通 Codex 页和独立 API 服务页确认被选账号在 5 秒内显示“调度中”，并在普通页成员列表中移到最前。
4. 开启 session affinity，使用完全相同的会话标识连续发起至少两个请求；首次 cache miss 和后续 cache hit 都必须显示“调度中”，Sidecar 每个请求只输出一条 `auth_selected`。
5. 加入足以超过普通 API 服务卡片高度的账号，确认所有账号均已渲染、成员区域出现纵向滚动条，滚动到底能够看到最后一个成员，卡片本身不无限增高。
6. 请求结束后显示“刚调度”，约 30 秒后消失。
7. 失败、取消和重试后不能永久显示“调度中”。
8. 在成员、自定义路由、模型规则或 API Key 对话框中编辑未保存内容，等待至少两轮轮询，草稿不能被重置。
9. 停止服务后确认轮询停止，无持续 command 或控制台报错。

### 11.4 计费查询手工检查

1. 用明确标记为 Sub2API 的 Provider 分别测试根 Base URL 与 `/v1` Base URL。
2. 确认 Bearer Key 只发往用户填写的 host。
3. 验证余额、今日请求、今日 token 和累计值显示。
4. 用字符串数字 payload 验证兼容；用 `NaN`/无穷值验证 UI 不崩溃。
5. 未指定 integration type 时确认 New API -> Sub2API 探测顺序。
6. 404 可触发候选回退；401/403 等鉴权错误应清晰返回，不应伪装成零余额。

### 11.5 API 服务价格、历史账号与兜底暂停检查

1. 打开价格设置，确认 Terra/Luna 的 Standard、长上下文和 Fast 值与 7.1 一致。
2. 使用旧价格配置启动，确认升级到 v4 后已知错误覆盖被清除、真正自定义值保留，历史请求（含 Auto-review）在后台重算，页面不被同步阻塞。
3. 让一个仍在账号总览的账号产生请求后移出 API 服务，在相同时间范围确认其进入“历史账号”并显示 `未加入`，原套餐 Tag 位于状态 Tag 之前。
4. 删除该账号并刷新，在相同时间范围确认显示 `已删除`，费用和请求数仍保留。
5. 将一个账号设为最低优先级，在独立页面和普通摘要卡片确认都出现无文字开关；任一位置切换后另一位置同步。
6. 关闭开关并使其他账号全部不可用，验证统一 sidecar 不会调度该账号；同时用旧 collection 数据启动一次，确认 legacy 模式只迁移为 sidecar 而不绕过暂停状态；重新打开后恢复兜底。
7. 为账号预先配置其他模型排除规则，来回切换开关后确认这些规则未被覆盖。
8. 暂停最低优先级账号后把它改为正常或最高优先级，确认 `*` 自动清理、其他模型排除仍保留，账号恢复可调度且不留下不可见暂停状态。
9. 打开“禁用模型”弹窗后从另一页面切换兜底开关，再尝试保存旧草稿；后端必须拒绝旧版本，重新打开弹窗后才能保存。
10. 在独立 API 服务统计页分别选择近 24H、近 48H、近 7Day，确认起止时间按当前时刻滚动且共享管理弹窗不出现这三个选项。

### 11.6 Release 平台范围与多版本变更信息检查

1. 检查 `.github/workflows/release.yml`：`build-macos-aarch64`、`build-macos-x86_64`、`build-macos-universal`、`build-linux`、自动 finalize、checksum 和 Homebrew job 必须保持 `if: ${{ false }}`；当前 fork 草稿只构建 Windows。
2. 检查启用的 Windows 上传步骤使用经过校验的 `RELEASE_TAG`，不得把数字 beta tag 改写成不存在的 `v${VERSION}` 正式 tag；草稿创建必须继续使用 `--draft`，不能自动发布。
3. 对跨多个上游版本的升级，逐项确认 `CHANGELOG.md` 与 `CHANGELOG.zh-CN.md` 都有旧锚点之后至目标版本的完整章节，并按目标版本到旧版本降序聚合到 Release notes；有 fork beta 修正时同时核对 beta 章节。
4. 确认 workflow 中的 `RELEASE_VERSIONS` 与上述章节一一对应，不能漏版本、重复版本或只保留最新版本；变更范围测试必须覆盖该精确列表。
5. 至少运行 `node --test tests/releaseWorkflowDraft.test.ts`、`git diff --check`，并在推送 tag 前复核工作流没有重新启用 macOS job 或删除多版本日志聚合规则。

## 12. 完成定义

一次上游升级只有同时满足以下条件才算完成：

- 新版本号、依赖、release notes 和上游修复已同步。
- Release 平台范围仍符合 fork 边界（只构建 Windows 草稿），且跨版本合并的中英文变更信息完整覆盖本轮所有上游版本和已纳入的 fork beta 变更。
- 四组 fork 行为逐项通过本文验收。
- 相对新上游的差异已收敛到本文热点和必要发布文件。
- 没有冲突标记、重复实现、非预期 referral URL 或默认商业服务。
- 前后端检查和目标 Rust 测试通过；不能运行或纯上游已知失败的检查已记录原因。
- 本文的当前基线、已知缺口状态和新增热点已经更新。
