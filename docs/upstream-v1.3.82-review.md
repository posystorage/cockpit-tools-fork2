# v1.3.82 合并审计

本轮从 fork `1.3.75b1`（`0c691d3b36cfcf0d63de1f56012c1c3bb2799917`）直接合入
上游最终 tag `v1.3.82`（`817f9945e3067aa2417e655f24ad92a3c48d4b5f`），
不含上游 main 后续提交。`.76–.82` 共 96 个提交、3254 个变更路径；真实合并起初
产生 70 个冲突路径，其中 18 份语言文件、12 个 Go 文件和 40 个其他路径。

用户确认：仅使用 Rust；允许启动时下载第三方公共模型目录并保留缓存回退。
六组 fork 边界继续适用。发布前复核发现并修复的问题、额度显示适配降级及
`1.3.82b1` 发布决定见本文末尾的发布前复核记录。

## 合并与数据兼容

- 删除 Go sidecar 源码、构建打包及引擎选择入口。旧 Legacy/Sidecar 配置冷启动也
  归一到 Native；不是只改界面默认值。退休二进制目录保留忽略规则，避免误入提交。
- 保留上游预算、并发限制、暂停、官方授权、思考深度、拒绝审计、分钟汇总、后台
  维护、账号/实例安全存储和恢复机制。旧数据迁移由最终版本一次执行，不依次运行
  中间版本应用。
- 用量事件入队时固定实际出站的官方账号 ID 和邮箱；未知身份保持未知，出队时
  不再读取可能已重导入的账号。重复事件不覆盖首次记录的身份。兼容旧事件只在
  入队前按历史邮箱严格验证，不把团队中其他成员的用量关联过来。
- 严格历史别名、删号历史行、所有现存账号窗口统计、API 页 24H/48H/7Day 滚动区间
  及独立 `*` 暂停继续保留。保存的旧 rolling 区间偏好不会降为上游默认值。
- Terra 缺失价格恢复贯穿新后台 batch；保留高 revision、用户覆盖、零价、幂等和
  迟到回调防护。价格重算不重新结算消费预算，价格簿完全跟随上游。
- 新 APIKEY.FUN 加密 vault 的前后端 schema 同时保留可选 `baseUrl`；旧记录无此
  字段仍可读，自定义接口在加密保存、恢复 checkpoint 和旧格式导出后仍存在。
- 共享核心实际测试发现 Windows 将“普通文件下的子路径”报告为 NotFound；只检查
  候选目录会误判为新安装。补充父目录读取与目录类型校验，保持错误可见并允许修复
  路径后重试，避免重定向到空账号库。

## 请求与 Desktop

实际账号活动接到上游 dispatch checkpoint。新增 HTTP、图片、辅助请求和 WS 入口
均适配 async hook；未发送请求和已连接但未发推理帧的 WS 回滚精确 request ID，
不按账号清掉其他并发活动。已认证但本地策略拒绝只写拒绝审计，不进入上游请求用量、
分钟汇总或预算结算。

Desktop 接受上游 Fast、预测和 Rspack 主链，并保留三个职责：

1. 本地 API Service 发送自动解锁。
2. 按实例独立隐藏原生额度提示，API Service 默认开、其他默认关，显式值优先。
3. 默认关闭的额度显示兼容偏好继续保存；发布前复核发现共享缓存不能保证路由隔离，
   本 beta 暂停显示改写并报告不支持，用户已明确同意照常发布 tag。

Rspack 的两份 Composer 是独立 lazy route：全部候选源码及共享原提示契约必须
验证、安装成功，当前实际 Composer 路由和共享原提示必须真实评估，才发布本次文档
的显示兼容凭据。不会要求互斥路由同时评估，也不会将仅 Fast/预测成功当作 quota
就绪。源码或 preload 不完整时显示兼容保持关闭，已验证的 scoped 发送解锁独立运行。
官方、remote、cloud、useAsbDirect 隔离和不强刷已有草稿继续保留。
启动预览对异步保存/延迟启动结果也检查会话，关闭后或替换目标后的旧结果不可操作
新预览。

## 网络策略与 ModelTrace

公共目录模块与上游最终 tag 一致：启动时依次尝试 GitHub 公共主源和备用源，失败
回退有效缓存，再回退内置目录；保留超时、大小和 schema 校验。该已授权联网能力
不恢复推广、公告、远端开关或运行时更新。新增推广 header、活动计时器及营销 feed
已清除，campaign hook 返回不可见且不创建 effect、timer 或网络调用。普通 Provider
的请求、模型发现、真实用量及用户配置的通知能力继续采用上游。

ModelTrace 固定到 `6cd4a8ff0f3f4e49d6d6969dd2fbadfa1569fde2`：

- 统一库 16 → 18 候选，新增 Claude Sonnet 5.5、Haiku 5.5，完整替换 robust 和
  1/2/3 样本校准；不手动拼接候选或复制旧中心。
- 两个浏览器算法文件与旧版相同，已核对哈希及 MIT 许可；小 metadata 记录来源、
  候选数和配套文件哈希，UI 不再写死 16，也不为显示数量提前加载大 bank。
- 七个请求选项和默认三模型不变，保留 `gpt-6.1-sol`，不提供 GPT-5.5 请求选项。
  历史 GPT-5.5 参考候选保留以匹配完整上游校准。新库仍无 GPT-6.1 Sol/Terra
  校准指纹，界面有说明，统计结果不构成身份确定证明。
- 适配新 Anthropic Provider 协议和显式 bearer/x-api-key 鉴权；目标去重包含
  协议和鉴权方式。截断、拒答或工具调用不当作完整文本样本；不自动换模型、换号
  或重试，结果不持久化凭据。未集成 Guard 插件、hooks 或自动探针。

## 发布

保留 Windows MSI/NSIS/portable、macOS ARM/Intel/Universal 启用，全部上传同一
实际 beta 草稿 tag。Linux、finalize、checksum、自动发布、Homebrew 禁用，Cask
继续删除。fork 下载地址和 stable latest 保护继续执行。

修正额外发现的 beta manifest URL 问题：生成器接受并校验实际 release tag，下载
URL 不再硬编码正式 `v<version>`。validation-only 模式也不可写 stable latest。
Apple 签名/公证仅在 fork 显式开启且六项自有凭据完整时运行；缺凭据不会让默认
草稿链必然失败。发布说明完整聚合 `.82–.76` 及本轮 fork 适配。

## 验证与限制

- 最终全量 TypeScript：2390 项通过，0 失败/跳过；类型检查及生产构建通过。
  ModelTrace bank 与 MIT 许可均已确认进入生产产物。
- 18 份语言文件的 8491 个键及源码翻译引用检查通过；155 个 Provider 预设的
  去推广检查通过。
- 发布脚本 67 项通过、1 项因平台跳过；四个必需平台 job 保持启用。
- Desktop 增强 172 项通过、16 项缺真实客户端 fixture 跳过；启动预览 129 项通过，
  实例/注入 TS 定向 142 项通过，基础注入 56 项通过，Electron 42.4.0 的真实加载
  smoke 1 项通过。部分 TS 定向属于全量测试的子集，不能叠加为总项数。
- Rust 主库与全部测试目标 `cargo check -p cockpit-tools --lib --tests --locked`
  通过。系统 TUNA 源不可用时仅本轮命令临时覆盖 rsproxy sparse，未改全局配置。
- 直接提取合并源码 SQL 的五项 SQLite 检查通过：团队邮箱隔离/去重、Terra 高
  revision 缺失快照筛选、已有价格保护、恢复幂等、已记录官方身份不可覆盖。
  ModelTrace 18 候选 × 1/2/3 样本的 54 组离线兼容检查通过；均不等同于独立准确率
  评估或 Rust 网关运行测试。
- 全仓 `cargo fmt --all -- --check` 存在大量格式差异，包含与最终上游完全一致的
  `crates/cockpit-cli/src/main.rs`。未将其标为通过，也未对无关上游源码整体重排。

- 初次 Native 测试在断言前返回 `0xC0000139 / STATUS_ENTRYPOINT_NOT_FOUND`。
  发布前已定位为测试 exe 缺少 Common-Controls v6 manifest，导致系统 v5
  comctl32 没有 `TaskDialogIndirect`。只对忽略目录中的测试副本用 Windows SDK
  `mt.exe` 嵌入 v6 manifest 后成功加载 5037 项测试列表；未改源码、系统或正式
  产物。指纹传输 4 项和 vault 5 项已实际运行通过，最终新增回归结果见下文。

共享核心实际运行：修复 Windows 数据根路径问题后，225 项通过、0 失败、1 项显式
忽略，doc-tests 通过。测试使用独立的 `COCKPIT_TOOLS_DATA_DIR`。原始日志保存在
忽略目录 `target/upgrade-plan-v1.3.82/`。

没有向真实模型账号发送指纹探针，也未操作用户的真实 Codex Desktop 或账号数据。
合成模块测试不代表已在所有真实 Desktop 版本验收；平台安装包、签名、公证和真实
安装运行仍需后续草稿编译及人工验收。

## 1.3.82b1 发布前复核（2026-11-13）

用户授权详细复核后推送当前升级分支、创建 `1.3.82b1` 并触发全平台草稿编译。
复核发现共享额度缓存影响隔离路由后，用户明确确认“不改写额度显示，照样发 tag”，
同时要求研究完整显示适配。应用版本保持 `1.3.82`，不改 origin/main。

本次额外修复：

- 自定义 Key 的模型发现、预填和四种客户端配置都只使用该记录自身地址，保留
  自定义路径，不回退到另一条当前输入或官方服务；旧记录缺地址仍可读取，但请求
  与配置生成须补地址。模型弹窗以请求序号隔离迟到结果；切换 Key 立即清除旧用量，
  避免将上一把 Key 的余额保存到新记录。
- 邮箱从最终凭据 Route 一起进入实际 dispatch 的报告与活动，去掉按 local ID
  覆盖的共享邮箱表；同 ID 重新导入、删除、候选未发送、在途和后台完成均保留
  实际请求的标签。WebSocket 自动下一轮继承连接身份，避免丢失官方 ID/邮箱。
- WebSocket 成功 upgrade 后、首个推理帧发送前，本地身份观察因停止或存储错误
  失败时回滚未发送尝试及精确活动，不把握手误记为推理用量或预算消费。
- 指纹目标按 Rust 最终传输端点规范化去重，包括显式 `/messages`、`/responses`、
  `/chat/completions`，保留不同路径前缀、协议和有效鉴权，避免同一 Key 重复采样。
- 共享统计弹窗在 durable preset 字符串未变化时也可跨午夜重算，日期选择器连续
  跨日重新设置定时器；关闭/换范围后的迟到结果不会回填，custom 日期保持固定。
- Desktop 启动预览向外层传递会话检查，四个真实调用方在异步动作后核对会话；
  实例页另比较原 resolver 身份，旧任务不关闭新预览或清理新等待者。已经实际
  发出的启动继续完成，不因预览关闭而取消。新增回归执行生产外层回调各个 await
  点的成功、失败和替换场景，不能只靠 Modal 内部检查证明外层隔离。
- 当前可识别的 legacy/current-adapter/Rspack 图均不再改写共享主额度缓存；
  secondary 开关只保存偏好并明确提示暂不支持，显示诊断与发送/隐藏诊断独立。
  原生 quota atom 实际读取缓存的回归覆盖 official/remote/cloud/direct 门禁和提示，
  不能用固定布尔值替代。替换注入脚本时先调用旧 disposer 恢复可还原状态。

后续完整显示适配研究已写入
[独立方案](codex-quota-display-adaptation-plan.md)：保留共享真实数据，仅在带有
真实线程/host 身份的纯显示 consumer 中生成副本；需要取得明确版本的静态 renderer
完整资源，并验证真实消费链，不能恢复全局缓存 writer。

最终复核验证：

- TypeScript 全量 2390 项通过，0 失败/跳过；最终生产构建（含 typecheck）通过。
- 18 locale 的键及静态引用检查、弹窗尺寸检查、全差异空白检查通过。
- Desktop 增强 172 项通过、16 项因缺真实客户端资源跳过；四个外层启动入口与
  Modal/CLI/API 定向 121 项通过。这些 TS 定向包含在全量中，不叠加为总数。
- 最终 Rust 主库 test 程序 `cargo test --no-run --lib --locked --offline -p cockpit-tools`
  使用本轮 task-sparse 临时配置成功编译链接。对该最终程序的测试副本补入上述 v6
  manifest 后，17 组过滤器实际运行，去重后 80 项不同用例全部通过、0 失败/跳过。
  包含新增并发邮箱快照、删除/重载、WS successor、观察失败回滚，以及生命周期、
  HTTP/WS 未发送、队列幂等、预算、Terra 补价、旧引擎迁移、独立暂停、指纹和 vault。
  过滤器存在重叠，因此不能把各组原始计数直接相加。
- 测试使用 `target/upgrade-plan-v1.3.82/native-test-runtime/data-*` 独立数据目录，
  未操作真实模型账号或运行中的 Desktop。证据保存在忽略目录
  `target/upgrade-plan-v1.3.82/`，包括 `review-ts-final.log`、`review-build-final.log`、
  `native-email-snapshot-build.log`、`review-native-results.json` 与各组日志。

此前共享核心 225 项通过、1 项显式忽略以及发布脚本 67 项通过、1 项平台跳过的
结论仍适用；本次未改相关核心或发布脚本。真实 Desktop 静态资源缺口、平台安装包
构建及安装验收仍分别以 fixture 和草稿 Actions 的实际结果为准。
