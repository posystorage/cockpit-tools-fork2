# Codex Desktop 额度显示完整适配研究

## 本次发布决定

用户已确认：`1.3.82b1` 不改写额度显示，照常发布草稿，同时研究完整显示适配。
当前保留按实例保存的次级开关偏好，并明确提示暂不支持显示改写。本地 API Service
发送解锁、原生额度提示隐藏仍分别工作。本文是后续实现方案，不代表完整适配已落地。

## 已确认的影响链

`rate-limit-status` 主查询是共享数据。当前布局的 initial reserve atom 和 primary
generic atom 都读取它的 `rate_limit.allowed`，随后 Composer 才检查路由。
旧代码把共享 `allowed` 改成 true、`limit_reached` 改成 false 后，原生阻塞已经消失，
Composer 拒绝授予本地发送解锁也无法恢复官方、远端、cloud、direct 的阻塞条件。

本轮 `quota_current_fork.test.cjs` 已改为实际执行 fixture 中这两个 atom，并与同一个
查询缓存快照联动。该回归覆盖四种隔离路由及两种原生提示展示器，不再把阻塞布尔值写死。
因此只给两个已知 gate 加 `originalUsage` 仍不足以保证完整隔离：其他未知消费者
也可能读取同一被改写对象。

已验证的 `SharedUsage` / `UsageBanner` 是额度耗尽提示。它们必须始终使用原始快照，
才能保持“隐藏原生提示”与“额度显示兼容”的独立性。不能将它们改成显示兼容入口。
Rspack 已验证的 39017 也是此类提示，543778 / 634303 是两条 Composer lazy route；
现有契约没有主额度 badge、菜单或详情面板的显示读取链。

相关源码与测试：

- `src-tauri/src/modules/codex_app_enhancements/quota.js`
- `src-tauri/src/modules/codex_app_enhancements/quota_current.js`
- `src-tauri/src/modules/codex_app_enhancements/quota_current_fork.test.cjs`
- `src-tauri/src/modules/codex_app_enhancements/service_rspack.js`
- `src-tauri/src/modules/codex_app_enhancements/service_rspack.test.cjs`
- `src-tauri/src/modules/codex_app_enhancements/fast.rs`

## 推荐实现

共享查询永久保留服务器原始数据，发送 atom、原生提示、账号检查及业务动作继续读
原值。新增纯函数生成显示副本，只在已经验证的显示组件入参处使用；最多改主额度
`allowed` / `limit_reached`，不修改数字、credits、spend_control、图片额度、附加限制
或真实请求错误，也不注册全局缓存 writer。

显示副本需要同时满足：次级开关显式开启、实例确为 API Service、host 为 local、
当前线程的真实 provider 与受管路由一致、配置已完成，并且不是 remote、cloud 或
useAsbDirect。复用当前 Composer 的 React Provider context，避免 window 上的
“当前线程”全局变量在两个 Composer 或侧栏并存时串用。

若额度组件位于 Composer context 外，应从该组件已有的线程/host selectors 取得
同一个路由身份。只有组件自己的真实选择器能证明范围时才生成显示副本；无法证明
时直接返回原始数据并报告不支持，不推测最近一个 Composer 的身份。

每种布局单独验证 imports、scope selectors、quota 读取点、纯显示输出以及未知
分支。先完整安装契约，再依据实际执行的显示 consumer 和原始提示链发布独立的
`nativeQuotaDisplayPatchState=active`。不能用 Fast、预测或发送解锁成功代表显示
适配成功。Rspack 安装全部候选 lazy route，当前真实执行的显示路线就绪即可，
不要求互斥的备用路线同时执行。

## 继续施工需要的资源

需要真实 Windows/macOS 发布包中的静态 renderer 资源：入口 HTML、entry、完整
imports 和 lazy chunks，尤其是主额度 badge/菜单/面板及其线程/host 选择器。
这些资源不需要账号、auth、聊天、日志或用户状态。

现有测试入口 `COCKPIT_NATIVE_QUOTA_CURRENT_DIR` / `COCKPIT_NATIVE_QUOTA_CURRENT_INITIAL`
及旧 FAST/QUOTA fixture 尚未提供完整真实资源，相关 16 项测试仍跳过。本机常见
安装位置未找到可匹配的松散 renderer 资源；可见的安装 bin 中只有可执行文件。
因此目前不能声称某一具体 Desktop 发布版本已经完成显示适配。

下一步先读取一个明确版本发布包的静态资源并记录版本、平台及文件哈希，追踪额度
显示 consumer 的 import graph 和 scope 来源，再为该版本建立真实 fixture。
不要修改官方安装文件、asar、WindowsApps ACL 或运行中的用户页面来取得支持。

## 验收矩阵

| 维度 | 必须覆盖 |
| --- | --- |
| 开关 | hide × display 四种组合、旧字段缺失 |
| 路由 | 本地 API Service、official、remote、cloud、direct、pending |
| 原始额度 | allowed true/false、主限制已到/未到、服务器替换新快照 |
| 消费链 | 真实 query client → 原生 send atoms → 真实显示组件，禁止 stub 原生布尔值 |
| 并存 | 两个 Composer、侧栏、Rspack 主/备用 lazy route |
| 生命周期 | owner 替换、偏好切换、关闭、文档更换、模块失败、迟到回执 |

断言共享缓存对象与 setter 不变；所有数字与其他额度字段保持原值；原生提示只受
hide 控制；本地发送解锁不依赖 secondary；四种隔离路由保持原生发送门禁和显示。
secondary 关闭或 scope 失效时立即消费原值，卸载后无残留，不重载用户草稿。
真实显示 consumer 未执行或验证失败时只报告 unsupported，不回退到全局改写。
