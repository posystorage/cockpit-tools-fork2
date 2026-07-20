# Fork 维护与上游升级指南

本文是 `posystorage/cockpit-tools-fork2` 的长期维护入口。后续同步上游时，应先阅读本文并按检查表处理，不再通过通读整个仓库来猜测 fork 的意图。

## 1. 文档目标与事实来源

本 fork 只长期维护三组产品行为：

1. 禁用广告、赞助推广、远端公告、远端开关和运行时自动更新。
2. 为 Codex API 服务提供只读的当前/最近账号调度观测。
3. 保留并增强自定义 API Provider 的上游计费、用量和余额查询，重点兼容 Sub2API。

除此以外，原则上跟随上游。发布工作流、fork 下载地址、签名密钥和免责声明属于交付差异，不应扩张成新的产品分叉。

事实来源按优先级排序：

1. 当前代码与测试。
2. 本文列出的行为不变量和边界。
3. Git 历史中的原始 fork 提交。
4. 旧 Codex 会话和迁移报告。

旧会话只用于解释意图，不能代替代码审计。用户提供的参考会话号 `019f5b0b-d3dd-70d2-ae54-5845e117b2e6` 在本机索引中没有完全匹配；对应可读取的“升级施工队”会话是 `019f5b0e-30d2-7920-980b-611d4f598f2b`。该会话确认了以下长期原则：精细去广告、不做全局联网黑名单、保留正常 Provider/API 能力、只清理推广性质的品牌和链接、把 502/代理/sidecar/额度刷新问题与去广告改动分开调查。

## 2. 当前基线与历史锚点

### 2.1 `v1.3.10` 已验证基线（2026-07-20）

本轮从已验证 fork `1.3.6b2`（`3be46a02`）升级到上游 `v1.3.10`，合并提交为 `50cf4c74`，父节点是 fork `3be46a02` 与上游 release commit `b331b093`。升级分支为 `codex/upgrade-upstream-v1.3.10`。release 链如下：

- `v1.3.7`：release commit `16c4d02b`，Codex API 服务成为独立平台入口。
- `v1.3.8`：release commit `fb291416`，已有 Codex 账号可直接加入 API 服务，并修复 Responses 流和工具兼容。
- `v1.3.9`：release commit `72eff4a4`，修复 Responses Lite 协作工具、流内过载重试和删除账号残留。
- `v1.3.10`：annotated tag object `59f5640f`，release commit `b331b093`，增加 ChatGPT 客户端账号数/额度注入、逐账号导入进度和删除后的后台账号池清理。

`v1.3.6..v1.3.10` 涉及 30 个非合并提交、175 个文件，净变化为 13424 行新增、9765 行删除。真实合并与预演一致，只有三个显式冲突文件：

- `Casks/cockpit-tools.rb`：fork 删除、上游更新；继续保持删除。
- `sidecars/cockpit-cliproxy/main.go`：冲突只在 context key 常量区；同时保留 fork 的 `authSelectionDiagnosticsContextKey` 和上游的 `cockpitQuotaPath`。
- `src/pages/CodexAccountsPage.tsx`：三个冲突块均来自上游删除旧 API 服务成员预览；接受上游删除，不在普通 Codex 账号页恢复重复成员面板。

独立平台化后的长期裁决：

1. `codex_api_service` 是独立、无账号平台 ID，页面路由为 `codex-api-service`；接受上游导航、布局迁移和页面入口。
2. Codex 账号页与 API 服务页首次访问后保持挂载。API 服务主成员卡片是“调度中/刚调度”的唯一常驻页面展示位置；统计账号卡片不重复实时 badge。
3. `CodexLocalAccessModal` 仍由两个页面复用，继续保留活动排序和标记。普通账号页保留 5 秒 state 轮询，使从该页打开的管理弹框仍能实时更新，但不再计算旧成员预览的活动排序、隐藏数或 ResizeObserver。
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

### 2.2 `v1.3.6` 已验证基线（2026-07-16）

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
- `cockpit-core` 上游基线为 84 passed / 2 failed / 1 ignored；两个失败均位于上游未改动的 Codex 重授权测试，并会共享账号数据目录，不属于本轮三组 fork 行为。
- 当前机器没有 Go，Sidecar Go 测试未运行；Rust 测试通过被 Git 忽略的空 sidecar 占位文件跳过 Go build。全仓 `cargo fmt --check` 仍命中上游自身的大量格式差异，本轮未格式化无关文件。

Windows 本地运行 Rust 测试前必须为每个测试进程设置独立的 `COCKPIT_TOOLS_DATA_DIR`。只设置 `HOME`、`CODEX_HOME` 或 `COCKPIT_TOOLS_TEST_DATA_DIR` 不足以隔离 `cockpit-core`；上游部分测试会访问真实 `~/.antigravity_cockpit`。测试失败后也不能直接删除真实目录，应先根据测试前备份、明确的测试账号 ID/邮箱和时间戳制定最小恢复方案。

### 2.3 `v1.3.2` 上一已验证基线

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
- 不为降低冲突而删除上游新增功能；若不触及三组 fork 行为，应接受上游实现。

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

- `src/pages/CodexApiServicePage.tsx`：成员卡片显示“调度中 N”或“刚调度 N 秒前”，tooltip 展示模型/API Key 标签/策略。
- `src/components/CodexLocalAccessModal.tsx`：按账号统计行显示活动标记。
- `src/pages/CodexApiServicePage.css`、`src/components/CodexLocalAccessModal.css`：活动状态样式。

从 `v1.3.7` 开始，API 服务使用独立平台 ID `codex_api_service` 和页面 `codex-api-service`。普通 `CodexAccountsPage` 不再拥有成员逐卡预览，不能为了保留调度观测而恢复该旧面板；它只保留服务状态、额度池、健康摘要以及可打开共享管理弹框所需的 state。

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
- 兼容：sidecar 与 legacy gateway 两条路径都要覆盖。

### 5.5 OAuth 保留额度窗口语义

OpenAI 的 `primary_window`/`secondary_window` 表示窗口顺序，不保证永久等于“5 小时/周”。OpenAI 暂停短窗口时，唯一的周窗口可能作为 `primary_window` 返回；上游前端也已有 `hourly_window_minutes=10080` 但实际显示为 Weekly 的兼容行为。

- `quota_reserve_windows_snapshot()` 必须优先使用实际窗口分钟数分类：达到一周的窗口使用周保留阈值，较短窗口使用五小时保留阈值。
- 只有旧持久化数据缺少窗口分钟数时，才兼容回退为 primary 使用五小时阈值、secondary 使用周阈值。
- Rust legacy 路由的屏蔽判断、`quota_reserve_status` 告警和写给 Sidecar 的 `quota-reserve.json` 必须共用同一份语义解析结果，不能分别按字段位置判断。
- OpenAI 恢复 `primary=300 分钟`、`secondary=10080 分钟` 后，两组阈值应自动同时恢复生效；不得通过永久交换 primary/secondary 字段修复周窗口。
- Sidecar 继续接收已有 `hourly*`/`weekly*` JSON 契约，但这些字段必须由 Rust 按真实时长完成语义归一化后再写出。
- 回归检查至少覆盖 weekly-only primary、恢复后的 5 小时+周双窗口，以及缺少窗口时长的旧数据兼容。

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

## 7. 发布与仓库身份差异

这些差异通常保留，但与三组核心产品行为分开审查：

- `.github/workflows/release.yml`：fork 的 draft/tag、Windows 构建和 release notes 策略；非目标平台 job 当前被禁用。
- `src-tauri/tauri.conf.json`：fork updater 公钥和 fork release endpoint。即使 runtime updater 已禁用，也不能指回上游签名/制品。
- `src/utils/updaterReleaseNotes.ts`：fallback release URL 指向 fork。
- `README.md`、`README.en.md`、`README.pt-br.md`：fork 差异和免责声明。
- `Casks/cockpit-tools.rb`、专属推广图标：当前 fork 删除。
- `.gitignore`、旧 release notes：仅维护/构建辅助，不应主导冲突裁决。

升级上游 workflow 时，先接受安全修复和 action 版本更新，再恢复 fork 的发布范围、draft 行为、签名与 release notes 规则。不要用旧 workflow 整文件覆盖上游。

## 8. 文件所有权与冲突优先级

| 区域 | 默认裁决 | 必查内容 |
| --- | --- | --- |
| `announcement.rs` / `remote_config.rs` | 保留 fork 的空状态与无网络不变量 | 上游新公开入口、缓存预取、启动任务 |
| updater 后端与 `App.tsx` | 保留 fork 禁用行为，吸收上游类型/错误修复 | 新平台 installer、新自动检查入口 |
| Settings/导航/推广 UI | 保留中性化与隐藏行为，吸收布局重构 | 新 sponsor 组件、更新按钮、远端可见性 |
| Provider 预设 | 接受新服务能力，清理推广元数据 | `isPartner`、邀请链接、默认商业服务 |
| `codex_local_access.rs` | 以上游路由实现为主，重接观测 hook | 每条 selected/terminal path、sidecar event schema |
| Local access models/types | 合并双方字段 | Rust/TS camelCase 一致性 |
| API 服务页面/Modal | 接受上游功能，重放活动标记和轮询草稿隔离 | interval 清理、编辑状态是否被 state 覆盖 |
| `commands/codex.rs` usage 区域 | 以上游 Provider 支持为主，保留 Sub2API 回退/安全解析 | URL 拼接、错误类型、summary 字段 |
| release workflow/config | 逐段合并 | fork signing、draft、平台范围、release notes |
| 其他账号平台与通用组件 | 默认完全接受上游 | 仅处理编译所需适配 |

## 9. 标准升级流程

### 9.1 升级前

1. 确认工作区干净或准确记录已有用户改动：`git status --short --branch`。
2. 记录当前 fork HEAD、上游 tag commit 和 merge-base。
3. 阅读上游 release notes，但以 tag diff 为准。
4. 先更新本文中的基线、已知缺口和新增热点，再进行代码合并。
5. 建立独立升级分支，不直接改稳定分支。

### 9.2 审计上游变化

至少检查：

```powershell
git log --oneline --decorate <old-upstream-tag>..<new-upstream-tag>
git diff --stat <old-upstream-tag>..<new-upstream-tag>
git diff --name-status <old-upstream-tag>..<new-upstream-tag>
git diff <old-upstream-tag>..<new-upstream-tag> -- <本文列出的热点文件>
```

将变更分为：不相交、结构相交但行为不冲突、直接触碰 fork 不变量、上游已等价实现四类。上游已等价实现时删除本地重复代码。

### 9.3 合并与冲突处理

1. 合并上游 release tag，保留真实双亲历史。
2. 不对热点文件使用整文件 `ours/theirs`。
3. 先恢复上游数据结构与新调用路径，再逐项重放三组行为。
4. 每解决一组冲突就运行相关格式/类型检查，避免最后集中排错。
5. 搜索冲突标记以及重复 import、重复字段、失效 dead branch。

### 9.4 合并后差异复核

最终应该同时检查两种差异：

- `<new-upstream-tag>..HEAD`：现在 fork 相对新上游还保留了什么。
- `<old-fork-head>..HEAD`：本次升级实际改变了什么。

如果第一种差异出现大批与三组行为无关的文件，通常表示冲突处理过度保留了旧代码。

## 10. 验收矩阵

### 10.1 静态与构建检查

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

### 10.2 去广告/外链扫描

```powershell
rg -n -i "apikey\.fun|chongcodex|sponsor|donate|aff=|ref=|invite|source=ccs|ytag" src src-tauri remote-config.json announcements.json
rg -n "ANNOUNCEMENT_URL|REMOTE_CONFIG_URL|should_check_for_updates|ADS_AND_SPONSORS_DISABLED|UPDATER_RUNTIME_DISABLED" src src-tauri
```

逐条分类扫描结果：类型名、兼容迁移字段和死代码不等于运行时推广；可点击链接、默认服务、徽标或网络请求必须处理。

### 10.3 调度观测手工检查

1. 启动 Codex API 服务并加入至少两个账号。
2. 发起普通、流式和 WebSocket 请求（若该模式受支持）。
3. 确认被选账号在 5 秒内显示“调度中”。
4. 开启 session affinity，使用完全相同的会话标识连续发起至少两个请求；首次 cache miss 和后续 cache hit 都必须显示“调度中”，Sidecar 每个请求只输出一条 `auth_selected`。
5. 请求结束后显示“刚调度”，约 30 秒后消失。
6. 失败、取消和重试后不能永久显示“调度中”。
7. 在成员、自定义路由、模型规则或 API Key 对话框中编辑未保存内容，等待至少两轮轮询，草稿不能被重置。
8. 停止服务后确认轮询停止，无持续 command 或控制台报错。

### 10.4 计费查询手工检查

1. 用明确标记为 Sub2API 的 Provider 分别测试根 Base URL 与 `/v1` Base URL。
2. 确认 Bearer Key 只发往用户填写的 host。
3. 验证余额、今日请求、今日 token 和累计值显示。
4. 用字符串数字 payload 验证兼容；用 `NaN`/无穷值验证 UI 不崩溃。
5. 未指定 integration type 时确认 New API -> Sub2API 探测顺序。
6. 404 可触发候选回退；401/403 等鉴权错误应清晰返回，不应伪装成零余额。

## 11. 完成定义

一次上游升级只有同时满足以下条件才算完成：

- 新版本号、依赖、release notes 和上游修复已同步。
- 三组 fork 行为逐项通过本文验收。
- 相对新上游的差异已收敛到本文热点和必要发布文件。
- 没有冲突标记、重复实现、非预期 referral URL 或默认商业服务。
- 前后端检查和目标 Rust 测试通过；不能运行或纯上游已知失败的检查已记录原因。
- 本文的当前基线、已知缺口状态和新增热点已经更新。
