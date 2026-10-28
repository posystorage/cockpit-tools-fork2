# v1.3.75 合并施工与复核

## 基线和范围

- fork 基线：`83ca9ff8be38f6132e840d6255a5b46caa9a4c39`，发布 tag `1.3.73b1`。
- 上游目标：`v1.3.75`，release commit `2cfe5e51314bfc0bf70bdda1ba08aed82c7dc8bf`。
- 施工分支：`codex/upgrade-upstream-v1.3.75`；以真正 merge 保留双方历史。
- 上游 .73 → .75 共 62 个提交、300 个文件，73 个路径与 fork 修改重叠。
- 显式冲突 29 个路径，其中 18 个是语言 JSON；自动合并区域另做语义检查。

本轮应用版本为 1.3.75，发布说明准确聚合 1.3.75、1.3.74 及本轮 fork 适配。
未在本轮创建发布 tag 或推送远端。

## 冲突与兼容处理

| 范围 | 最终处理 |
| --- | --- |
| Cask／核心账号模型分组 | Cask 保持删除；核心账号模块采用上游新模型分组与兼容测试 |
| Desktop／启动 Rust | 接受 browser preload、启动确认、路径恢复及 Windows 防重复启动主链；保留动态 CDP、实例身份和两个独立显示偏好 |
| 额度 JS／Rust 测试 | 旧布局保留一个发送断点和两个原始 usage 提示断点；新版采用完整三模块源码转换，未完成 preload 不在线猜测新布局发送位置 |
| 启动预览／18 语言 | 合并新 CLI／路径／历史修复文案，保留两个实例显示开关独立保存、取消与草稿隔离 |
| 窗口统计 | 保留严格官方 ID／邮箱查询参数；新增快照保留前比较身份，身份变化首帧即清旧计数，拒绝迟到旧查询 |
| 网关 foundation | 合并 Session ID 映射字段、上游价格版本 8，以及 fork 活动／历史相关字段 |

桌面额度三项职责保持独立：API Service 本地发送自动解锁，隐藏提示按实例偏好，主额度显示兼容默认关闭。
仅显式开启兼容时改写主额度 `allowed/limit_reached`，原始数值、图片额度、服务端错误和请求路由不改。
新 primary 两处提示读取原始 usage，避免兼容缓存间接隐藏提示；fork 现有 Observer 仍为唯一 DOM 隐藏入口。
完整图凭据只在当前文档重接 owner／偏好，Fast-only 和部分图不能冒充完整配额图。
开关切换通知已挂载 Composer 刷新，同时保留编辑器和上下文身份。

新版 adapter 以真实本地 host、thread provider、props 和 scope 判断发送权限，保留官方／remote／cloud／
`useAsbDirect` 和其他所有提交限制。错过 preload 的已打开新布局页面报告需要重启，
等待用户显式重启或自然新文档，不强制刷新。细节见 [额度运行时说明](codex-quota-ui-runtime.md)。

## 自动合并区域的语义复核

1. Go 继续默认，Legacy 迁到 Go，已有显式选择保留；ChatGPT 官方授权继续按上游仅支持 Rust。
   Rust 的实际发送活动、精确诊断请求 ID、异步 `begin_attempt/discard_unsent_attempt`、取消和未发送回滚保留。
2. 新会话身份映射按上游默认开启；保存的 false 贯通前端草稿、collection、Provider 模板、Rust 主／profile 监听、
   Go 私有配置和 manifest 指纹。它不代替诊断请求 ID，也不改变指纹测智的 direct request 身份构造。
3. 接受 Go 最终 499 的明确客户端取消标记、连续会话普通转发、`FinishNotSent` 和工具命名空间修复；
   真正的 502／504、已发送或传输结果不确定的防重复执行限制仍保留。
4. 普通账号页仍对所有现存账号统计窗口用量；历史别名需要官方 ID 和邮箱同时匹配，SQL UNION 去重。
   独立 API 页保留 24H／48H／7Day 滚动范围、历史账号、活动排序和最低优先级 `*` 暂停。
   原授权暂停和 fork 兜底暂停互不清除。
5. Provider 中性化、Sub2API `/usage` → `/v1/usage`、数字字符串与非有限数防护保留；未增加域名联网黑名单。
   新商业域名卡片皮肤及 renderer 引用删除，正常 New API 余额能力和本地背景功能保留。
6. 广告、赞助、公告、远端控制及运行时自动更新禁用边界保留。七个指纹请求模型与基线相同，
   包含 `gpt-6.1-sol`，不含 `gpt-5.5`；Terra 只加入一般 API 模型／上游价格簿，不伪造测智校准数据。
7. 接受原生 CLI 速度目录补充、重置额度到期缓存、压缩会话导入／导出、历史索引手动修复等上游功能。
   自定义模型目录保留，索引修复只动有备份的派生索引，原始 rollout 只读；修复索引不等于续聊成功。
8. 新 CLI 入口追加会话 fence，贯穿 modal → overview → access 回调。
   配置保存期间关闭／重开预览或切目标后，不弹旧 CLI，也不关闭新预览。
9. Go 授权重置屏障原来只比较时间戳；Windows 同一时钟刻度下，旧尝试的结果可能写回重置前状态。
   每次内部执行尝试和重置现在共享单调顺序号，重试生成新号；外部仅提供时间戳的结果继续使用原时间回退。
   保留凭据版本、注册世代和状态 Generation 的原含义，增加同时间戳与序号回绕回归。

## Terra 旧日志和价格覆盖

价格值和版本完全跟随上游。已有 fork 清理或用户编辑可能把 revision 提升到 8 或更高，
仅靠版本递增不能发现旧 Terra 零价格快照。本轮增加限定 Terra 的只读、有索引、受预算控制的后台探测，
发现缺失快照后使用现有后台重算队列补算，不建立独立 fork 价格版本。
显式用户 Terra 价格（包括零价）保持权威，已存在的有效快照不被作为缺失重新选择，修复后不会反复排队。
新增 fixture 覆盖 revision 8／42、免费／付费覆盖及幂等；探测 SQL 另用隔离 SQLite 验证。
后台探测完成后重验当前集合身份、revision 和价格覆盖，并将校验与入队按同一 runtime 锁排序，
避免迟到的启动探测覆盖用户刚保存的新价格任务。

## 验证记录

- 全量 TypeScript：1857 项通过；随后修复 CLI 迟到回调，114 项相关定向测试通过。
- 最终类型检查与生产前端构建通过；仅有既有的大 chunk 体积提示。
- 发布脚本：57 通过、1 项平台跳过；18 语言键一致且无重复键，155 个 Provider 中性化检查通过。
- 开发进程测试：5 通过、3 项 Unix 实进程测试在 Windows 跳过。
  修正上游合成 orphan 用例未显式指定 Unix 平台的测试假设，不改变进程清理产品代码。
- Go 根模块通过；auth／executor／registry／helps／live 包及专项 reference 通过。
  授权重置屏障确定性回归连续 20 次通过，auth 整包通过；产品修正后的根模块复检也通过。
- Go TTFT 回归的本地即时响应可能落在同一个 Windows 时钟 tick；测试服务器加入明确响应延时，
  原真实计时断言保留，连续 20 次通过。Realtime reference 仅统一 CRLF 比较，原 JSON fixture 未重写，
  focused 3 次和 live 整包通过。
- Desktop 增强及 dialog／usage 注入 JS：138 通过、15 项依赖外部官方 bundle 跳过；
  原生额度提示 Observer 另有 15 项通过。新增合成合约覆盖三模块完成、当前文档凭据、官方 scope、
  两开关四组合、关闭恢复、owner 重接、pending preload 保护及不强制刷新。
- Rust 主库和全部测试目标 `cargo check -p cockpit-tools --lib --tests --locked --offline` 通过。
  检查有既有 unused／dead-code 等警告，以及本机增量缓存完成时的访问拒绝警告；命令最终退出 0。
  核心测试已进入链接，但本机链接进程长时间不结束并占用构建锁，本轮已停止这次链接；
  不能记为测试执行通过。此前 .73 的 0xC0000139 记录也不冒充本轮结果。

验证日志位于本机忽略目录 `target/upgrade-plan-v1.3.75/`，不提交编译产物、用户账号或真实会话数据。
真实 Codex Desktop、耗尽额度账号、原生超高速实际出站、Windows/macOS 安装包仍需真实环境验收。

## 发布边界

`package-lock.json` 仅同步根及根包版本元数据，不重建依赖树。
Windows MSI／NSIS／portable 与 macOS ARM／Intel／Universal 继续上传同一实际 beta tag 的草稿 Release；
Linux、finalize、checksum、自动公开和 Homebrew 保持禁用。
后续获得发布指令后再创建对应 tag 并推送触发草稿构建。
