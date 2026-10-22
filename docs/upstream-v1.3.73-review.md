# v1.3.73 合并审计

审计日期：2026-10-22。从 fork 1.3.69b2（31410d39）合入上游 v1.3.73
（5330f75ae6b3c39fbd72f528ac2188207047d49a），工作分支为 codex/upgrade-upstream-v1.3.73。
本轮直接吸收 1.3.70–1.3.73，按用户确认的混合额度方案保留 fork 行为。

## 合并处理与修正

### 额度解锁、提示隐藏与显示兼容

保留 hideNativeQuotaBanner，新增可选 quotaDisplayCompatibility，补齐默认实例、命名实例、
新建／更新／保存配置、前端服务与 store 的传递链。缺失新字段按关闭处理，显式 false 不被默认值覆盖。
启动预览仅在 API Service 桌面绑定时展示新增开关；CLI 不注入，普通 Provider 的上游全局增强设置保留。
两个显示开关独立，本地发送解锁在四种组合中均自动启用。

采用上游 live-quota 定位、CDP 会话及生命周期，移除 API Service 路径原 fork 解锁监督循环的重复启动。
关闭兼容时不包裹或改写共享额度查询；开启时只调整主额度 allowed/limit_reached，不修改数字、余额、
credits、spend_control、图片额度、路由或服务器返回。缓存原始快照供关闭／清理恢复，恢复方法和订阅。

上游缓存兼容会间接使原生提示渲染器认为额度可用，从而即使隐藏开关关闭也不显示原提示。
因此保留提示元数据，并在两个精确匹配的原生提示位置通过条件断点恢复当次局部 usage 原始引用。
它们与发送断点共用一个会话，条件返回 false，不暂停执行。fork Observer 是唯一 DOM 隐藏入口，
尊重原开关并保留 display/priority 恢复；停止时统一清理三个断点及页面钩子。
定位失败不猜测变量或改写最终 submitDisabled；无官方 asar、安装文件或 ACL 修改。

### Rust 实际派发与账号活动

上游新的 routed() 只是暂存候选，不能在此记录真实账号活动。活动回调移至异步 begin_attempt()，
在实际派发前等待精确请求 ID 的观测更新；本地额度／鉴权拒绝不产生虚假已发送尝试。
未发送回滚、重试、完成和取消均按请求 ID 清理，不误删同账号其他并发活动。
独立 observed_request_id 覆盖等待观测锁期间被取消，以及 attempt 尚未提交的清理窗口。
回收清理放入已注册的持久化工作任务，在下游结算和写记录前完成。

HTTP、图片、Realtime 与 WebSocket 调用适配 async 回调及生命周期；图片 TLS 续传路径补齐
record_route().await，防止丢弃异步操作。检查同组 43 处调用，取消测试中的 Future 按设计由 select 驱动。
重试退避期间仍展示上一真实尝试账号，下次真实派发时替换；候选路由不会提前改变活动账号。

### 历史统计与暂停状态

采用上游只读、时间有界的 SQLite 聚合。补回 fork 的严格历史身份别名：本地 ID 直接匹配，
历史别名同时要求官方 ID 与非空邮箱一致，邮箱 trim 后忽略大小写；不能把共享工作区其他邮箱归并。
通过索引候选 rowid UNION 去重，不把旧的 Rust 全日志扫描合回去。
普通 Codex 页仍查询所有现存账号，不限 API 成员；独立 API 页保留滚动 24H/48H/7Day 与偏好记忆。
共享弹窗沿用上游日历时间范围。历史行排除当前来源 ID 与官方映射，避免重复展示。

上游授权暂停和 fork 最低优先级兜底的 * 排除分别保留。新增测试用例覆盖解除兜底暂停／改变优先级、
解除授权暂停／切换授权模式、旧官方 ID 映射到来源账号时两种暂停与模型作用域并存。
依赖 Rust 的官方授权测试显式选择 Native；生产默认仍为 Go，不为满足上游测试改动默认值。
新上游生命周期测试补齐 fork 模型规则接口的 expected_updated_at 参数。

### 前端、定价、去推广与发布

接入上游官方授权、额度保护、能力回退与统计界面；官方授权仅支持 Rust，其他引擎不移植该能力。
保留 fork 活动、历史统计、兜底暂停及指纹入口。指纹请求列表仍为七模型，包含 gpt-6.1-sol，
不含 gpt-5.5；历史校准参考数据不篡改。价格簿完全跟随上游，不恢复独立 fork 定价版本。

运行时更新器、广告／赞助、远端公告和远端控制保持禁用。上游新增更新器测试默认读取 fork 禁用状态，
仅隔离 VM 内的通用下载事务测试显式启用，产品代码未重新开启更新器。
注入用量格式测试适配上游精确数字展示，不回退产品显示逻辑。
Provider 隐私检查关闭 SSR 无需的依赖发现，避免扫描 ignored target 下的本地 Go HTML。

发布吸收上游依赖缓存、macOS 薄二进制校验和 Universal 产物复用；保留 Windows 与 macOS
Apple Silicon、Intel、Universal 的同 tag 草稿上传，支持数字 beta tag。
Linux、自动 finalize、checksum、正式 publish、Homebrew 继续禁用，Cask 保持删除。
中英文发布说明及 RELEASE_VERSIONS 精确覆盖 .73、.72、.71、.70。

## 验证

- 完整 TypeScript 测试：1709/1709 通过；类型检查及 Vite 生产构建通过。
- 发布脚本：57 项，56 通过、1 项 Windows SIGTERM 用例按平台跳过。
- 增强／启动 JS：79 项，76 通过、3 项因缺少实际原生 artifact fixture 跳过；包含 V8 Inspector 条件断点及原生提示快照回归。
- 18 份语言键和值检查通过；155 个 Provider 隐私检查通过。
- Go sidecar 根模块 go test ./... 通过。
- Rust 主库及全部测试目标 cargo check --lib --tests --locked --offline 通过。
- fork_ 定向测试程序成功编译链接；Windows 在测试断言前返回 0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND，未记为运行通过。
- 历史统计生产 SQL 另在独立 SQLite 中验证别名、邮箱规范化、共享工作区隔离、UNION 去重和索引使用；不等价于完整 Rust 回归运行。
- git diff --check 通过，17 处显式合并冲突已解决，无冲突标记或未合并索引项。

可复现入口：node scripts/run_ts_tests.cjs、npm run build、npm run test:release、
node --test src-tauri/src/modules/codex_app_enhancements/*.test.cjs tests/codex_app_startup_guard.test.cjs、
node scripts/check_locales.cjs、node scripts/check_provider_preset_privacy.mjs。
Rust 检查使用 --lib --tests --locked --offline，临时覆盖 rsproxy 源；Go/Rust 缓存及测试数据均在忽略的 target 下，
未改动全局镜像配置。TypeScript 依赖按 lockfile 恢复，未安装可选 Electron 二进制。

测试执行使用独立 COCKPIT_TOOLS_DATA_DIR。Cargo 启动的测试程序停留在 Windows 加载错误，
随后通过继承 SetErrorMode、关闭系统错误弹窗的隔离子进程直接执行同一测试文件，立即确认返回码
3221225785（0xC0000139），且无测试正文输出；仅结束了本轮持有的那个加载失败测试进程。
这与既有本机限制一致，不能据此判断新增 Rust 断言通过或失败，需在可运行环境补跑。

## 尚需真实运行验收

本轮没有对真实模型账号发请求，也没有操作实际 Codex Desktop。实际官方脚本匹配、耗尽账号的四种开关组合、
多窗口／刷新／重启／改绑、Go/Rust 在线切换与官方授权流程，需在实际客户端验收。
缺少原生 fixture 的检查与可选 Electron smoke 没有计为通过；Electron 安装缓存受本机 EPERM 限制，未扩展修改用户缓存。
Windows/macOS 安装包尚未在本轮构建；本轮未创建新 tag 或触发远端草稿编译。

用户已确认的产品决策均已落实，没有新增待裁决的产品分叉。
